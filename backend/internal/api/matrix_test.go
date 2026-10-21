package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/request"
	"github.com/example/app/backend/internal/platform/request/requesttest"
)

type matrixPrincipal struct {
	kind request.Kind
	role access.Role
}

type matrixCase struct {
	name   string
	method string
	path   string
	who    string
	mfa    bool
	want   int
}

type matrixMemberships map[string]access.Role

func (m matrixMemberships) OrgRoles(_ context.Context, p request.Principal, orgID uuid.UUID) ([]access.Role, error) {
	if orgID.String() != matrixOrg {
		return nil, nil
	}
	return m.roles(p, access.Org), nil
}

func (m matrixMemberships) PlatformRoles(_ context.Context, p request.Principal) ([]access.Role, error) {
	return m.roles(p, access.Platform), nil
}

func (m matrixMemberships) roles(p request.Principal, kind access.Kind) []access.Role {
	r, ok := m[p.ID]
	if !ok || r.Kind() != kind {
		return nil
	}
	return []access.Role{r}
}

type matrixKeys map[string]request.Principal

func (k matrixKeys) VerifyKey(_ context.Context, key string) (request.Principal, error) {
	if p, ok := k[key]; ok {
		return p, nil
	}
	return request.Principal{}, request.ErrInvalidToken
}

const reached = 299

func TestRouteMatrix(t *testing.T) {
	iss := requesttest.NewIssuer(t)
	members := matrixMemberships{}
	subjects := map[string]string{}
	for label, p := range matrixPrincipals {
		id := uuid.NewString()
		subjects[label] = id
		if p.role != "" {
			members[id] = p.role
		}
	}
	now := time.Now()
	router := access.NewRouter(access.NewModelGrants(members), access.WithClock(func() time.Time { return now }))
	for pattern, rule := range Rules {
		router.Handle(pattern, rule, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(reached) }))
	}
	keys := matrixKeys{}
	for label, p := range matrixPrincipals {
		if p.kind == request.Service {
			keys[request.ServiceKeyPrefix+label] = request.Principal{Kind: request.Service, ID: subjects[label], OrgID: matrixOrg, Roles: []string{string(p.role)}}
		}
	}
	handler := request.AuthenticateWithKeys(iss.Verifier, keys)(router)
	for _, c := range matrix {
		t.Run(c.name, func(t *testing.T) {
			p := matrixPrincipals[c.who]
			req := httptest.NewRequest(c.method, c.path, nil)
			switch {
			case p.kind == request.Service:
				req.Header.Set("Authorization", "Bearer "+request.ServiceKeyPrefix+c.who)
			case c.who != "":
				tok := iss.Token(t, subjects[c.who], p.kind == request.Guest)
				if c.mfa {
					tok = iss.MFAToken(t, subjects[c.who], now)
				}
				req.Header.Set("Authorization", "Bearer "+tok)
			}
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)
			want := c.want
			if want == 0 {
				want = reached
			}
			if rec.Code != want {
				t.Fatalf("%s %s as %q = %d, model expects %d", c.method, c.path, c.who, rec.Code, want)
			}
		})
	}
}
