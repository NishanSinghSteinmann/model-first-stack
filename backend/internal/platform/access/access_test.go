package access

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/request"
	"github.com/example/app/backend/internal/platform/request/requesttest"
)

const (
	alice = "6f1c2c1e-3a6b-4c55-9d43-2f1a7b9e0c11"
	bob   = "0b6e5f2a-8f2d-4a1b-9a77-1c2d3e4f5a6b"
)

var (
	orgA = uuid.MustParse("11111111-1111-4111-8111-111111111111")
	orgB = uuid.MustParse("22222222-2222-4222-8222-222222222222")
)

type membership map[string]map[uuid.UUID][]Permission

func (m membership) Permissions(_ context.Context, p request.Principal, kind Kind, org uuid.UUID) ([]Permission, bool, error) {
	switch kind {
	case Self:
		if p.Kind == request.Guest {
			return []Permission{"self:read"}, true, nil
		}
		return []Permission{"self:read", "self:write"}, true, nil
	case Org:
		perms, ok := m[p.ID][org]
		return perms, ok, nil
	default:
		return nil, false, nil
	}
}

func setup(t *testing.T, g Grants) (http.Handler, *requesttest.Issuer, *Scope) {
	t.Helper()
	iss := requesttest.NewIssuer(t)
	r := NewRouter(g)
	seen := &Scope{}
	capture := http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		*seen, _ = FromContext(req.Context())
		w.WriteHeader(http.StatusNoContent)
	})
	r.Handle("GET /public", PublicRule("test"), capture)
	r.Handle("PATCH /me", SelfRule("self:write"), capture)
	r.Handle("PUT /orgs/{org}/bank-account", OrgRule("org:bank_account"), capture)
	r.Handle("GET /orgs/{org}/projects", OrgRule("org:read"), capture)
	r.Handle("POST /admin/orgs/{id}/verify", PlatformRule("orgs:verify"), capture)
	return request.WithID(request.Authenticate(iss.Verifier)(r)), iss, seen
}

func call(h http.Handler, method, path, token string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestEnforce(t *testing.T) {
	g := membership{
		alice: {orgA: {"org:read", "org:bank_account"}},
		bob:   {orgA: {"org:read"}},
	}
	h, iss, seen := setup(t, g)
	aliceTok := iss.Token(t, alice, false)
	bobTok := iss.Token(t, bob, false)
	guestTok := iss.Token(t, uuid.NewString(), true)
	cases := []struct {
		name, method, path, token string
		want                      int
	}{
		{"public without token", "GET", "/public", "", 204},
		{"self without token", "PATCH", "/me", "", 401},
		{"self as user", "PATCH", "/me", aliceTok, 204},
		{"self as guest lacks permission", "PATCH", "/me", guestTok, 403},
		{"org member with permission", "PUT", "/orgs/" + orgA.String() + "/bank-account", aliceTok, 204},
		{"org member without permission", "PUT", "/orgs/" + orgA.String() + "/bank-account", bobTok, 403},
		{"foreign org", "GET", "/orgs/" + orgB.String() + "/projects", aliceTok, 404},
		{"org id not uuid", "GET", "/orgs/acme-corp/projects", aliceTok, 404},
		{"platform for normal user", "POST", "/admin/orgs/x/verify", aliceTok, 404},
		{"unknown route", "GET", "/nope", aliceTok, 404},
		{"wrong method", "DELETE", "/me", aliceTok, 404},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := call(h, tc.method, tc.path, tc.token)
			if rec.Code != tc.want {
				t.Fatalf("status = %d, want %d, body %s", rec.Code, tc.want, rec.Body.String())
			}
			if rec.Code >= 400 && !strings.Contains(rec.Body.String(), `"request_id"`) {
				t.Fatalf("problem body without request_id: %s", rec.Body.String())
			}
		})
	}
	*seen = Scope{}
	call(h, "PUT", "/orgs/"+orgA.String()+"/bank-account", aliceTok)
	if id, ok := seen.OrgID(); !ok || id != orgA || seen.Principal().ID != alice || seen.Kind() != Org {
		t.Fatalf("scope not set correctly: %+v", *seen)
	}
}

func TestGrantsErrorIsInternal(t *testing.T) {
	h, iss, _ := setup(t, GrantsFunc(func(context.Context, request.Principal, Kind, uuid.UUID) ([]Permission, bool, error) {
		return nil, false, errors.New("db down")
	}))
	rec := call(h, "PATCH", "/me", iss.Token(t, alice, false))
	if rec.Code != 500 || strings.Contains(rec.Body.String(), "db down") {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
}

func TestNoGrantsFailsClosed(t *testing.T) {
	h, iss, _ := setup(t, nil)
	if rec := call(h, "PATCH", "/me", iss.Token(t, alice, false)); rec.Code != 503 {
		t.Fatalf("status %d", rec.Code)
	}
	if rec := call(h, "GET", "/public", ""); rec.Code != 204 {
		t.Fatalf("public status %d", rec.Code)
	}
}

func TestHandleRejectsUnsafeRegistrations(t *testing.T) {
	ok := http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	cases := map[string]func(r *Router){
		"no rule":            func(r *Router) { r.Handle("GET /x", Rule{}, ok) },
		"public no reason":   func(r *Router) { r.Handle("GET /x", PublicRule(" "), ok) },
		"self no permission": func(r *Router) { r.Handle("GET /x", SelfRule(""), ok) },
		"org without {org}":  func(r *Router) { r.Handle("GET /orgs/x", OrgRule("a:b"), ok) },
		"pattern no method":  func(r *Router) { r.Handle("/x", SelfRule("a:b"), ok) },
	}
	for name, register := range cases {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatal("unsafe registration accepted")
				}
			}()
			register(NewRouter(nil))
		})
	}
}

func TestRulesListsEveryRoute(t *testing.T) {
	r := NewRouter(nil)
	r.Handle("GET /a", PublicRule("x"), http.NotFoundHandler())
	r.Handle("GET /b", SelfRule("p"), http.NotFoundHandler())
	if got := r.Rules(); len(got) != 2 || got["GET /b"].Permission != "p" {
		t.Fatalf("rules = %+v", got)
	}
}
