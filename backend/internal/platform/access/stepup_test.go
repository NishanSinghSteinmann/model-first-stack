package access

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/example/app/backend/internal/platform/request"
	"github.com/example/app/backend/internal/platform/request/requesttest"
)

func TestStepUp(t *testing.T) {
	now := time.Date(2026, 10, 21, 12, 0, 0, 0, time.UTC)
	iss := requesttest.NewIssuer(t)
	r := NewRouter(membership{alice: {orgA: {"org:bank_account"}}}, WithClock(func() time.Time { return now }))
	r.Handle("PUT /orgs/{org}/bank-account", OrgRule("org:bank_account").WithStepUp(), http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
	h := request.WithID(request.Authenticate(iss.Verifier)(r))
	path := "/orgs/" + orgA.String() + "/bank-account"
	cases := []struct {
		name  string
		token string
		want  int
	}{
		{"password only", iss.Token(t, alice, false), 403},
		{"fresh mfa", iss.MFAToken(t, alice, now.Add(-2*time.Minute)), 204},
		{"stale mfa", iss.MFAToken(t, alice, now.Add(-StepUpWindow-time.Minute)), 403},
		{"aal2 without mfa timestamp", iss.TokenWith(t, alice, map[string]any{"aal": "aal2"}), 403},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := call(h, "PUT", path, tc.token)
			if rec.Code != tc.want {
				t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
			}
			if tc.want == 403 && !strings.Contains(rec.Body.String(), "step_up_required") {
				t.Fatalf("wrong problem: %s", rec.Body.String())
			}
		})
	}
}

func TestPublicCannotRequireStepUp(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("public step-up accepted")
		}
	}()
	NewRouter(nil).Handle("GET /x", PublicRule("x").WithStepUp(), http.NotFoundHandler())
}
