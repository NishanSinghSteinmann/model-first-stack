package egress

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestAllowlist(t *testing.T) {
	c := New([]string{" API.Example.com ", ""}, time.Second)
	for _, raw := range []string{
		"http://api.example.com/x",
		"https://evil.com/x",
		"https://127.0.0.1/x",
		"https://api.example.com.evil.com/x",
		"https://[::1]/x",
	} {
		req, _ := http.NewRequest(http.MethodGet, raw, nil)
		resp, err := c.Do(req)
		if resp != nil {
			_ = resp.Body.Close()
		}
		if !errors.Is(err, ErrHostNotAllowed) {
			t.Fatalf("%s: want ErrHostNotAllowed, got %v", raw, err)
		}
	}
}

func TestRedirectToOtherHostBlocked(t *testing.T) {
	target := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	defer target.Close()
	origin := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, strings.Replace(target.URL, "127.0.0.1", "localhost", 1), http.StatusFound)
	}))
	defer origin.Close()
	c := New([]string{"127.0.0.1", "localhost"}, time.Second)
	tr := origin.Client().Transport.(*http.Transport).Clone()
	c.http.Transport = guard{next: tr, allow: func(*http.Request) error { return nil }}
	req, _ := http.NewRequest(http.MethodGet, origin.URL, nil)
	resp, err := c.Do(req)
	if resp != nil {
		_ = resp.Body.Close()
	}
	var ue *url.Error
	if !errors.As(err, &ue) || !errors.Is(err, ErrHostNotAllowed) {
		t.Fatalf("cross-host redirect followed: %v", err)
	}
}

func TestRedact(t *testing.T) {
	in := "Jane Doe, jane.doe@example.com, IBAN DE89 3704 0044 0532 0130 00, Tel +49 170 1234567 or 030 12345678, invoice 2026-0042 for 12,400 EUR"
	out := Redact(in).String()
	for _, leaked := range []string{"jane.doe@example.com", "DE89 3704", "170 1234567", "12345678"} {
		if strings.Contains(out, leaked) {
			t.Fatalf("leaked %q in %q", leaked, out)
		}
	}
	for _, kept := range []string{"[EMAIL]", "[IBAN]", "[PHONE]", "2026-0042", "12,400 EUR"} {
		if !strings.Contains(out, kept) {
			t.Fatalf("missing %q in %q", kept, out)
		}
	}
}
