package telemetry

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"go.opentelemetry.io/otel"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
)

func TestSetupWithoutEndpointIsNoop(t *testing.T) {
	shutdown, err := Setup(context.Background(), "api", "test", "")
	if err != nil || shutdown(context.Background()) != nil {
		t.Fatalf("noop setup failed: %v", err)
	}
}

func TestMiddlewareCreatesSpanWithoutPath(t *testing.T) {
	rec := tracetest.NewSpanRecorder()
	otel.SetTracerProvider(sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(rec)))
	var traceID string
	h := Middleware("api")(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { traceID = TraceID(r.Context()) }))
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/orgs/123/projects?email=a@b.de", nil))
	spans := rec.Ended()
	if len(spans) != 1 || traceID == "" {
		t.Fatalf("spans %d trace %q", len(spans), traceID)
	}
	if spans[0].Name() != "GET" {
		t.Fatalf("span name %q may contain ids", spans[0].Name())
	}
}
