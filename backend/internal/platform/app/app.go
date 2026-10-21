package app

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/example/app/backend/internal/api"
	"github.com/example/app/backend/internal/modules/notes"
	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/config"
	"github.com/example/app/backend/internal/platform/data"
	"github.com/example/app/backend/internal/platform/health"
	"github.com/example/app/backend/internal/platform/jobs"
	"github.com/example/app/backend/internal/platform/logging"
	"github.com/example/app/backend/internal/platform/request"
	"github.com/example/app/backend/internal/platform/server"
	"github.com/example/app/backend/internal/platform/storage"
	"github.com/example/app/backend/internal/platform/telemetry"
)

const maxBody = 1 << 20

func Main(mode, version string) {
	run := Run
	switch mode {
	case "migrate":
		run = Migrate
	case "drain":
		run = Drain
	}
	if err := run(mode, version, os.Getenv); err != nil {
		slog.Error(mode+" stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

func Run(service, version string, getenv func(string) string) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load(service, version, getenv)
	if err != nil {
		return err
	}
	log := logging.New(os.Stdout, cfg)
	shutdownTracing, err := telemetry.Setup(ctx, service, version, cfg.OTLPEndpoint)
	if err != nil {
		return err
	}
	defer func() { _ = shutdownTracing(context.Background()) }()
	h := health.New(2 * time.Second)
	var db *data.DB
	var idem request.IdempotencyStore
	var keys request.KeyVerifier
	if cfg.DatabaseURL.IsSet() {
		db, err = data.Open(ctx, cfg.DatabaseURL.Reveal())
		if err != nil {
			return err
		}
		defer db.Close()
		h.Add("db", db.Ping)
		idem = data.NewIdempotencyStore(db)
		keys = data.NewServiceKeyVerifier(db)
		bus, err := openBus(ctx, cfg, log, service == "worker")
		if err != nil {
			return err
		}
		defer bus.Close()
		if service == "worker" {
			go func() {
				if err := bus.Run(ctx); err != nil {
					log.Error("job runner stopped", slog.Any("error", err))
				}
			}()
		}
	}
	if cfg.Storage.IsSet() && service == "api" {
		store, err := storage.New(storage.Config{
			Endpoint: cfg.Storage.Endpoint, PublicURL: cfg.Storage.PublicURL, Region: cfg.Storage.Region,
			Bucket: cfg.Storage.Bucket, AccessKey: cfg.Storage.AccessKey.Reveal(), SecretKey: cfg.Storage.SecretKey.Reveal(),
		})
		if err != nil {
			return err
		}
		h.Add("storage", store.Ping)
	}
	var verifier *request.Verifier
	if cfg.AuthJWKSURL != "" {
		if verifier, err = request.NewVerifier(ctx, cfg.AuthJWKSURL, cfg.AuthIssuer, cfg.AuthAudience); err != nil {
			return err
		}
	}
	router, err := newRouter(h, db, log)
	if err != nil {
		return err
	}
	minimums, err := request.ParseMinimums(cfg.MinClients)
	if err != nil {
		return err
	}
	handler := chain(router,
		telemetry.Middleware(service),
		request.WithID,
		request.SecureHeaders(cfg.Env != config.Local),
		request.CORS(cfg.CORSOrigins),
		request.Recover(log),
		request.AccessLog(log),
		request.MinClientVersion(minimums),
		request.LimitBody(maxBody),
		request.Deadline(15*time.Second),
		request.AuthenticateWithKeys(verifier, keys),
		request.Idempotency(idem),
	)
	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", cfg.HTTPAddr)
	if err != nil {
		return err
	}
	return server.Run(ctx, server.New(cfg.HTTPAddr, handler), ln, cfg.ShutdownTimeout, log)
}

func Migrate(service, version string, getenv func(string) string) error {
	cfg, err := config.Load(service, version, getenv)
	if err != nil {
		return err
	}
	if !cfg.MigrateURL.IsSet() {
		return errors.New("DATABASE_MIGRATE_URL or DATABASE_URL is required to migrate")
	}
	log := logging.New(os.Stdout, cfg)
	if cfg.AppDBPassword.IsSet() || cfg.AuthDBPassword.IsSet() {
		pw := data.Passwords{App: cfg.AppDBPassword.Reveal(), Auth: cfg.AuthDBPassword.Reveal()}
		if err := data.Bootstrap(context.Background(), cfg.MigrateURL.Reveal(), pw); err != nil {
			return err
		}
		log.Info("database roles ensured")
	}
	if err := data.Migrate(context.Background(), cfg.MigrateURL.Reveal()); err != nil {
		return err
	}
	if err := jobs.Migrate(context.Background(), cfg.MigrateURL.Reveal()); err != nil {
		return err
	}
	log.Info("migrations applied")
	return nil
}

func Drain(service, version string, getenv func(string) string) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load(service, version, getenv)
	if err != nil {
		return err
	}
	if !cfg.DatabaseURL.IsSet() {
		return errors.New("DATABASE_URL is required to drain jobs")
	}
	log := logging.New(os.Stdout, cfg)
	bus, err := openBus(ctx, cfg, log, true)
	if err != nil {
		return err
	}
	defer bus.Close()
	if err := bus.Drain(ctx, 10*time.Minute); err != nil {
		return err
	}
	log.Info("jobs drained")
	return nil
}

func openBus(ctx context.Context, cfg config.Config, log *slog.Logger, work bool) (*jobs.Bus, error) {
	key, err := access.IssueSystemKey()
	if err != nil {
		return nil, err
	}
	bus := jobs.NewBus(key)
	if err := bus.Open(ctx, cfg.DatabaseURL.Reveal(), jobs.Options{Work: work, Logger: log}); err != nil {
		return nil, err
	}
	return bus, nil
}

func newRouter(h *health.Health, db *data.DB, log *slog.Logger) (*access.Router, error) {
	router := access.NewRouter(access.NewModelGrants(nil))
	return router, api.Register(router, api.Handlers{Platform: h, Notes: notes.New(db)}, log)
}

func chain(h http.Handler, middleware ...func(http.Handler) http.Handler) http.Handler {
	for i := len(middleware) - 1; i >= 0; i-- {
		h = middleware[i](h)
	}
	return h
}
