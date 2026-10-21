package request

import (
	"bytes"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestWithIDKeepsValidAndReplacesInvalid(t *testing.T) {
	var seen string
	h := WithID(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { seen = ID(r.Context()) }))
	for _, tc := range []struct{ in, want string }{
		{"abcdef12-3456", "abcdef12-3456"},
		{"<script>", ""},
		{"", ""},
	} {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set(IDHeader, tc.in)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if tc.want != "" && seen != tc.want {
			t.Fatalf("id = %q, want %q", seen, tc.want)
		}
		if tc.want == "" && (len(seen) != 32 || seen == tc.in) {
			t.Fatalf("expected generated id, got %q", seen)
		}
		if rec.Header().Get(IDHeader) != seen {
			t.Fatal("response header does not echo id")
		}
	}
}

func TestRecoverReturnsProblem(t *testing.T) {
	var logs bytes.Buffer
	h := WithID(Recover(slog.New(slog.NewJSONHandler(&logs, nil)))(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { panic("boom") })))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusInternalServerError || !strings.Contains(rec.Body.String(), `"code":"internal"`) || strings.Contains(rec.Body.String(), "boom") {
		t.Fatalf("unexpected response %d %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(logs.String(), "boom") {
		t.Fatal("panic not logged")
	}
}

func TestAccessLogOmitsQuery(t *testing.T) {
	var logs bytes.Buffer
	h := AccessLog(slog.New(slog.NewJSONHandler(&logs, nil)))(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusTeapot) }))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/x?email=a@b.de", nil))
	out := logs.String()
	if strings.Contains(out, "a@b.de") || !strings.Contains(out, `"status":418`) {
		t.Fatalf("unexpected log: %s", out)
	}
}

type payload struct {
	Name string `json:"name"`
}

func decode(body string, limit int64) error {
	var dst payload
	var err error
	h := LimitBody(limit)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { err = DecodeJSON(r, &dst) }))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body)))
	return err
}

func TestDecodeJSON(t *testing.T) {
	if err := decode(`{"name":"a"}`, 1024); err != nil {
		t.Fatalf("valid body rejected: %v", err)
	}
	if err := decode(`{"name":"a","role":"admin"}`, 1024); !errors.Is(err, ErrInvalidBody) {
		t.Fatalf("unknown field accepted: %v", err)
	}
	if err := decode(`{"name":"a"}{"name":"b"}`, 1024); !errors.Is(err, ErrInvalidBody) {
		t.Fatalf("second value accepted: %v", err)
	}
	if err := decode(`{"name":"`+strings.Repeat("a", 200)+`"}`, 64); !errors.Is(err, ErrBodyTooLarge) {
		t.Fatalf("large body accepted: %v", err)
	}
	if err := decode(`not json`, 1024); !errors.Is(err, ErrInvalidBody) {
		t.Fatalf("garbage accepted: %v", err)
	}
}

func TestAuthenticateWithoutHeaderPassesAnonymous(t *testing.T) {
	var ok bool
	h := Authenticate(nil)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { _, ok = PrincipalFrom(r.Context()) }))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/", nil))
	if rec.Code != http.StatusOK || ok {
		t.Fatalf("status %d principal %v", rec.Code, ok)
	}
}

func TestAuthenticateRejectsTokenWithoutVerifier(t *testing.T) {
	h := Authenticate(nil)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("handler reached") }))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer x")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	body, _ := io.ReadAll(rec.Body)
	if rec.Code != http.StatusUnauthorized || !strings.Contains(string(body), "token_invalid") {
		t.Fatalf("status %d body %s", rec.Code, body)
	}
}
