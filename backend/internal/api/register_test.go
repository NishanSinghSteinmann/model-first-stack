package api_test

import (
	"log/slog"
	"testing"

	"github.com/example/app/backend/internal/api"
	"github.com/example/app/backend/internal/platform/access"
)

func TestRegisterRejectsMissingModules(t *testing.T) {
	if err := api.Register(access.NewRouter(nil), api.Handlers{}, slog.New(slog.DiscardHandler)); err == nil {
		t.Fatal("missing module handlers were accepted")
	}
}
