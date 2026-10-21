package access

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/problem"
	"github.com/example/app/backend/internal/platform/request"
)

type Permission string

type Kind string

const (
	Public   Kind = "public"
	Self     Kind = "self"
	Org      Kind = "org"
	Platform Kind = "platform"
)

type Rule struct {
	Kind       Kind
	Permission Permission
	Reason     string
	StepUp     bool
}

func (r Rule) WithStepUp() Rule {
	r.StepUp = true
	return r
}

const StepUpWindow = 10 * time.Minute

func PublicRule(reason string) Rule  { return Rule{Kind: Public, Reason: reason} }
func SelfRule(p Permission) Rule     { return Rule{Kind: Self, Permission: p} }
func OrgRule(p Permission) Rule      { return Rule{Kind: Org, Permission: p} }
func PlatformRule(p Permission) Rule { return Rule{Kind: Platform, Permission: p} }

type Grants interface {
	Permissions(ctx context.Context, p request.Principal, kind Kind, orgID uuid.UUID) (perms []Permission, member bool, err error)
}

type GrantsFunc func(ctx context.Context, p request.Principal, kind Kind, orgID uuid.UUID) ([]Permission, bool, error)

func (f GrantsFunc) Permissions(ctx context.Context, p request.Principal, kind Kind, orgID uuid.UUID) ([]Permission, bool, error) {
	return f(ctx, p, kind, orgID)
}

type Scope struct {
	kind      Kind
	principal request.Principal
	orgID     uuid.UUID
}

func (s Scope) Kind() Kind                   { return s.kind }
func (s Scope) Principal() request.Principal { return s.principal }
func (s Scope) OrgID() (uuid.UUID, bool)     { return s.orgID, s.kind == Org }

type scopeKey struct{}

func FromContext(ctx context.Context) (Scope, bool) {
	s, ok := ctx.Value(scopeKey{}).(Scope)
	return s, ok
}

type Router struct {
	mux    *http.ServeMux
	grants Grants
	rules  map[string]Rule
	now    func() time.Time
}

type Option func(*Router)

func WithClock(now func() time.Time) Option {
	return func(r *Router) { r.now = now }
}

func NewRouter(g Grants, opts ...Option) *Router {
	r := &Router{mux: http.NewServeMux(), grants: g, rules: map[string]Rule{}, now: time.Now}
	for _, o := range opts {
		o(r)
	}
	r.mux.HandleFunc("/", func(w http.ResponseWriter, req *http.Request) {
		problem.Send(w, problem.NotFound, request.ID(req.Context()))
	})
	return r
}

func (r *Router) Handle(pattern string, rule Rule, h http.Handler) {
	if err := validate(pattern, rule); err != nil {
		panic(err)
	}
	r.rules[pattern] = rule
	r.mux.Handle(pattern, r.enforce(rule, h))
}

type Binding struct {
	router *Router
	rules  map[string]Rule
	wrap   func(http.Handler) http.Handler
	bound  map[string]bool
}

func (r *Router) Bind(rules map[string]Rule, wrap func(http.Handler) http.Handler) *Binding {
	return &Binding{router: r, rules: rules, wrap: wrap, bound: map[string]bool{}}
}

func (b *Binding) HandleFunc(pattern string, h func(http.ResponseWriter, *http.Request)) {
	rule, ok := b.rules[pattern]
	if !ok {
		panic(fmt.Errorf("access: route %q has no rule in the model", pattern))
	}
	var handler http.Handler = http.HandlerFunc(h)
	if b.wrap != nil {
		handler = b.wrap(handler)
	}
	b.router.Handle(pattern, rule, handler)
	b.bound[pattern] = true
}

func (b *Binding) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	b.router.ServeHTTP(w, req)
}

func (b *Binding) Complete() error {
	for pattern := range b.rules {
		if !b.bound[pattern] {
			return fmt.Errorf("access: rule %q has no handler", pattern)
		}
	}
	return nil
}

func (r *Router) Rules() map[string]Rule {
	out := make(map[string]Rule, len(r.rules))
	for k, v := range r.rules {
		out[k] = v
	}
	return out
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.mux.ServeHTTP(w, req)
}

func validate(pattern string, rule Rule) error {
	method, path, ok := strings.Cut(pattern, " ")
	if !ok || method == "" || !strings.HasPrefix(path, "/") {
		return fmt.Errorf("access: pattern %q needs METHOD /path", pattern)
	}
	switch rule.Kind {
	case Public:
		if strings.TrimSpace(rule.Reason) == "" {
			return fmt.Errorf("access: public route %q needs a reason", pattern)
		}
		if rule.StepUp {
			return fmt.Errorf("access: public route %q cannot require step-up", pattern)
		}
		return nil
	case Self, Platform:
	case Org:
		if !strings.Contains(path, "{org}") {
			return fmt.Errorf("access: org route %q needs {org} in path", pattern)
		}
	default:
		return fmt.Errorf("access: route %q has no rule", pattern)
	}
	if rule.Permission == "" {
		return fmt.Errorf("access: route %q needs a permission", pattern)
	}
	return nil
}

func (r *Router) enforce(rule Rule, h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		ctx := req.Context()
		id := request.ID(ctx)
		if rule.Kind == Public {
			h.ServeHTTP(w, req)
			return
		}
		p, ok := request.PrincipalFrom(ctx)
		if !ok {
			problem.Send(w, problem.Unauthenticated, id)
			return
		}
		if r.grants == nil {
			problem.Send(w, problem.Unavailable, id)
			return
		}
		var orgID uuid.UUID
		if rule.Kind == Org {
			parsed, err := uuid.Parse(req.PathValue("org"))
			if err != nil {
				problem.Send(w, problem.NotFound, id)
				return
			}
			orgID = parsed
		}
		perms, member, err := r.grants.Permissions(ctx, p, rule.Kind, orgID)
		if err != nil {
			problem.Send(w, problem.Internal, id)
			return
		}
		if !member {
			problem.Send(w, problem.NotFound, id)
			return
		}
		if !slices.Contains(perms, rule.Permission) {
			problem.Send(w, problem.Forbidden, id)
			return
		}
		if rule.StepUp && (p.AAL != "aal2" || p.MFAAt.IsZero() || r.now().Sub(p.MFAAt) > StepUpWindow) {
			problem.Send(w, problem.StepUpRequired, id)
			return
		}
		scope := Scope{kind: rule.Kind, principal: p, orgID: orgID}
		h.ServeHTTP(w, req.WithContext(context.WithValue(ctx, scopeKey{}, scope)))
	})
}
