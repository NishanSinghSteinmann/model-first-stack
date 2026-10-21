package accesstest

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/request"
	"github.com/example/app/backend/internal/platform/request/requesttest"
)

func OrgScope(t *testing.T, principalID string, orgID uuid.UUID) access.Scope {
	t.Helper()
	return scope(t, principalID, "PUT /orgs/{org}/probe", access.OrgRule("probe"), "/orgs/"+orgID.String()+"/probe")
}

func SelfScope(t *testing.T, principalID string) access.Scope {
	t.Helper()
	return scope(t, principalID, "PUT /probe", access.SelfRule("probe"), "/probe")
}

func scope(t *testing.T, principalID, pattern string, rule access.Rule, path string) access.Scope {
	t.Helper()
	iss := requesttest.NewIssuer(t)
	grant := access.GrantsFunc(func(context.Context, request.Principal, access.Kind, uuid.UUID) ([]access.Permission, bool, error) {
		return []access.Permission{"probe"}, true, nil
	})
	r := access.NewRouter(grant)
	var got access.Scope
	r.Handle(pattern, rule, http.HandlerFunc(func(_ http.ResponseWriter, req *http.Request) { got, _ = access.FromContext(req.Context()) }))
	req := httptest.NewRequestWithContext(context.Background(), http.MethodPut, path, nil)
	req.Header.Set("Authorization", "Bearer "+iss.Token(t, principalID, false))
	request.Authenticate(iss.Verifier)(r).ServeHTTP(httptest.NewRecorder(), req)
	if got.Kind() == "" {
		t.Fatal("accesstest: scope not created")
	}
	return got
}
