package app

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/example/app/backend/internal/platform/health"
)

func TestRouterServesModelRoutes(t *testing.T) {
	r, err := newRouter(health.New(time.Second), nil, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		method, path string
		status       int
		body         string
	}{
		{http.MethodGet, "/livez", http.StatusOK, `{"status":"ok"}`},
		{http.MethodGet, "/readyz", http.StatusOK, `"failed":[]`},
		{http.MethodPost, "/livez", http.StatusNotFound, `"not_found"`},
		{http.MethodGet, "/nope", http.StatusNotFound, `"not_found"`},
	} {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(c.method, c.path, nil))
		body, _ := io.ReadAll(rec.Body)
		if rec.Code != c.status || !strings.Contains(string(body), c.body) {
			t.Errorf("%s %s = %d %s", c.method, c.path, rec.Code, body)
		}
	}
}
