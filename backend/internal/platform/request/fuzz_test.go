package request

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func FuzzDecodeJSON(f *testing.F) {
	for _, s := range []string{`{"name":"a"}`, `{"name":"a","x":1}`, `[]`, `null`, `{"name":` + strings.Repeat("[", 50), "\x00"} {
		f.Add(s)
	}
	f.Fuzz(func(t *testing.T, body string) {
		var dst payload
		r := httptest.NewRequestWithContext(context.Background(), http.MethodPost, "/", strings.NewReader(body))
		r.Body = http.MaxBytesReader(httptest.NewRecorder(), r.Body, 4096)
		_ = DecodeJSON(r, &dst)
	})
}

func FuzzVerifyNeverAcceptsGarbage(f *testing.F) {
	for _, s := range []string{"", "a.b.c", "eyJhbGciOiJub25lIn0.e30.", "eyJhbGciOiJFUzI1NiJ9.e30.AAAA"} {
		f.Add(s)
	}
	v := &Verifier{keys: nil, issuer: "https://auth.test", audience: "authenticated"}
	f.Fuzz(func(t *testing.T, token string) {
		defer func() {
			if r := recover(); r != nil {
				t.Fatalf("panic on %q: %v", token, r)
			}
		}()
		if _, err := v.Verify(token); err == nil {
			t.Fatalf("garbage accepted: %q", token)
		}
	})
}
