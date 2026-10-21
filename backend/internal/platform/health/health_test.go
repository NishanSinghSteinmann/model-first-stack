package health

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/example/app/backend/internal/api"
)

func serve(h *Health, path string) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	si := api.NewStrictHandler(api.Handlers{Platform: h}, nil)
	req := httptest.NewRequest(http.MethodGet, path, nil)
	if path == "/livez" {
		si.Livez(rec, req)
	} else {
		si.Readyz(rec, req)
	}
	return rec
}

func TestLivez(t *testing.T) {
	if rec := serve(New(time.Second), "/livez"); rec.Code != http.StatusOK {
		t.Fatalf("livez = %d", rec.Code)
	}
}

func TestReadyzOK(t *testing.T) {
	h := New(time.Second)
	h.Add("db", func(context.Context) error { return nil })
	if rec := serve(h, "/readyz"); rec.Code != http.StatusOK {
		t.Fatalf("readyz = %d", rec.Code)
	}
}

func TestReadyzFailureHidesDetails(t *testing.T) {
	h := New(time.Second)
	h.Add("db", func(context.Context) error { return errors.New("password authentication failed for user app") })
	rec := serve(h, "/readyz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("readyz = %d", rec.Code)
	}
	body := rec.Body.String()
	if !strings.Contains(body, `"db"`) || strings.Contains(body, "password") {
		t.Fatalf("unexpected body: %s", body)
	}
}

func TestReadyzTimeout(t *testing.T) {
	h := New(10 * time.Millisecond)
	h.Add("slow", func(ctx context.Context) error {
		<-ctx.Done()
		return ctx.Err()
	})
	if rec := serve(h, "/readyz"); rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("readyz = %d", rec.Code)
	}
}
