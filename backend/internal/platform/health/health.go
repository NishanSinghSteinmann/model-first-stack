package health

import (
	"context"
	"sort"
	"time"

	"github.com/example/app/backend/internal/api"
)

type Check func(ctx context.Context) error

type Health struct {
	checks  map[string]Check
	timeout time.Duration
}

func New(timeout time.Duration) *Health {
	return &Health{checks: map[string]Check{}, timeout: timeout}
}

func (h *Health) Add(name string, c Check) {
	h.checks[name] = c
}

func (h *Health) Livez(context.Context, api.LivezRequestObject) (api.LivezResponseObject, error) {
	return api.Livez200JSONResponse{Status: "ok"}, nil
}

func (h *Health) Readyz(ctx context.Context, _ api.ReadyzRequestObject) (api.ReadyzResponseObject, error) {
	ctx, cancel := context.WithTimeout(ctx, h.timeout)
	defer cancel()
	failed := []string{}
	for name, c := range h.checks {
		if err := c(ctx); err != nil {
			failed = append(failed, name)
		}
	}
	if len(failed) > 0 {
		sort.Strings(failed)
		return api.Readyz503JSONResponse{Status: "unavailable", Failed: failed}, nil
	}
	return api.Readyz200JSONResponse{Status: "ok", Failed: failed}, nil
}
