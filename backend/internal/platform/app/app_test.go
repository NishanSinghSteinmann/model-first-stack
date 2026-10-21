package app

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestRunRejectsInvalidConfig(t *testing.T) {
	err := Run("api", "test", func(string) string { return "" })
	if err == nil || !strings.Contains(err.Error(), "APP_ENV") {
		t.Fatalf("want config error, got %v", err)
	}
}

func TestChainOrder(t *testing.T) {
	var order []string
	mw := func(name string) func(http.Handler) http.Handler {
		return func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				order = append(order, name)
				next.ServeHTTP(w, r)
			})
		}
	}
	h := chain(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { order = append(order, "handler") }), mw("a"), mw("b"))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))
	if strings.Join(order, ",") != "a,b,handler" {
		t.Fatalf("order = %v", order)
	}
}

func TestMigrateNeedsURL(t *testing.T) {
	err := Migrate("migrate", "test", func(k string) string { return map[string]string{"APP_ENV": "local"}[k] })
	if err == nil || !strings.Contains(err.Error(), "required to migrate") {
		t.Fatalf("got %v", err)
	}
}

func TestDrainNeedsDatabase(t *testing.T) {
	err := Drain("drain", "test", func(k string) string { return map[string]string{"APP_ENV": "local"}[k] })
	if err == nil || !strings.Contains(err.Error(), "required to drain") {
		t.Fatalf("got %v", err)
	}
}
