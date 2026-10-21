package request

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSecureHeaders(t *testing.T) {
	rec := httptest.NewRecorder()
	SecureHeaders(true)(http.NotFoundHandler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	for _, h := range []string{"X-Content-Type-Options", "X-Frame-Options", "Content-Security-Policy", "Strict-Transport-Security", "Referrer-Policy"} {
		if rec.Header().Get(h) == "" {
			t.Fatalf("missing %s", h)
		}
	}
	rec = httptest.NewRecorder()
	SecureHeaders(false)(http.NotFoundHandler()).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Header().Get("Strict-Transport-Security") != "" {
		t.Fatal("HSTS set locally")
	}
}

func TestCORS(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	h := CORS([]string{"https://cockpit.example.com"})(next)
	cases := []struct {
		name, method, origin, preflight string
		wantStatus                      int
		wantAllow                       string
	}{
		{"allowed simple", "GET", "https://cockpit.example.com", "", 200, "https://cockpit.example.com"},
		{"foreign simple", "GET", "https://evil.example", "", 200, ""},
		{"allowed preflight", "OPTIONS", "https://cockpit.example.com", "PUT", 204, "https://cockpit.example.com"},
		{"foreign preflight", "OPTIONS", "https://evil.example", "PUT", 403, ""},
		{"no origin", "GET", "", "", 200, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, "/", nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			if tc.preflight != "" {
				req.Header.Set("Access-Control-Request-Method", tc.preflight)
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			if rec.Code != tc.wantStatus || rec.Header().Get("Access-Control-Allow-Origin") != tc.wantAllow {
				t.Fatalf("status %d allow %q", rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
			}
		})
	}
}

func TestDeadline(t *testing.T) {
	var deadline time.Time
	h := Deadline(time.Second)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { deadline, _ = r.Context().Deadline() }))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
	if time.Until(deadline) <= 0 || time.Until(deadline) > time.Second {
		t.Fatalf("deadline %v", deadline)
	}
}
