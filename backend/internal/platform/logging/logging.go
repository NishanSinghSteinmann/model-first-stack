package logging

import (
	"io"
	"log/slog"

	"github.com/example/app/backend/internal/platform/config"
)

func New(w io.Writer, cfg config.Config) *slog.Logger {
	level := slog.LevelInfo
	if cfg.Env == config.Local {
		level = slog.LevelDebug
	}
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level})).With(
		slog.String("service", cfg.Service),
		slog.String("version", cfg.Version),
		slog.String("env", string(cfg.Env)),
	)
}
