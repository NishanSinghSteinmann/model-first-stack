package config

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

type Env string

const (
	Local   Env = "local"
	Staging Env = "staging"
	Prod    Env = "prod"
)

type Config struct {
	Service         string
	Version         string
	Env             Env
	HTTPAddr        string
	DatabaseURL     Secret
	MigrateURL      Secret
	AppDBPassword   Secret
	AuthDBPassword  Secret
	OTLPEndpoint    string
	CORSOrigins     []string
	AuthJWKSURL     string
	AuthIssuer      string
	AuthAudience    string
	ShutdownTimeout time.Duration
	Storage         Storage
	MinClients      string
}

type Storage struct {
	Endpoint  string
	PublicURL string
	Region    string
	Bucket    string
	AccessKey Secret
	SecretKey Secret
}

func (s Storage) IsSet() bool { return s.Bucket != "" }

func Load(service, version string, getenv func(string) string) (Config, error) {
	cfg := Config{
		Service:         service,
		Version:         version,
		Env:             Env(getenv("APP_ENV")),
		HTTPAddr:        valueOr(getenv("HTTP_ADDR"), ":8080"),
		DatabaseURL:     NewSecret(getenv("DATABASE_URL")),
		MigrateURL:      NewSecret(valueOr(getenv("DATABASE_MIGRATE_URL"), getenv("DATABASE_URL"))),
		AppDBPassword:   NewSecret(getenv("DB_APP_PASSWORD")),
		AuthDBPassword:  NewSecret(getenv("DB_AUTH_PASSWORD")),
		OTLPEndpoint:    getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
		CORSOrigins:     list(getenv("CORS_ORIGINS")),
		AuthJWKSURL:     getenv("AUTH_JWKS_URL"),
		AuthIssuer:      getenv("AUTH_ISSUER"),
		AuthAudience:    valueOr(getenv("AUTH_AUDIENCE"), "authenticated"),
		ShutdownTimeout: 20 * time.Second,
		MinClients:      getenv("MIN_CLIENT_VERSIONS"),
		Storage: Storage{
			Endpoint:  getenv("STORAGE_ENDPOINT"),
			PublicURL: getenv("STORAGE_PUBLIC_URL"),
			Region:    valueOr(getenv("STORAGE_REGION"), "auto"),
			Bucket:    getenv("STORAGE_BUCKET"),
			AccessKey: NewSecret(getenv("STORAGE_ACCESS_KEY")),
			SecretKey: NewSecret(getenv("STORAGE_SECRET_KEY")),
		},
	}
	if raw := getenv("SHUTDOWN_TIMEOUT"); raw != "" {
		d, err := time.ParseDuration(raw)
		if err != nil {
			return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT: %w", err)
		}
		cfg.ShutdownTimeout = d
	}
	return cfg, cfg.validate()
}

func (c Config) validate() error {
	var errs []error
	switch c.Env {
	case Local, Staging, Prod:
	default:
		errs = append(errs, fmt.Errorf("APP_ENV must be local, staging or prod, got %q", c.Env))
	}
	needsDB := c.Service != "migrate"
	needsAuth := c.Service == "api"
	if c.Service == "migrate" && !c.MigrateURL.IsSet() {
		errs = append(errs, errors.New("DATABASE_MIGRATE_URL or DATABASE_URL is required to migrate"))
	}
	if c.Env != Local && needsDB && !c.DatabaseURL.IsSet() {
		errs = append(errs, errors.New("DATABASE_URL is required outside local"))
	}
	if c.Env != Local && needsAuth && (c.AuthJWKSURL == "" || c.AuthIssuer == "") {
		errs = append(errs, errors.New("AUTH_JWKS_URL and AUTH_ISSUER are required outside local"))
	}
	if (c.AuthJWKSURL == "") != (c.AuthIssuer == "") {
		errs = append(errs, errors.New("AUTH_JWKS_URL and AUTH_ISSUER must be set together"))
	}
	if c.Env != Local && c.AuthJWKSURL != "" && !strings.HasPrefix(c.AuthJWKSURL, "https://") {
		errs = append(errs, errors.New("AUTH_JWKS_URL must use https outside local"))
	}
	if c.Env == Prod {
		for _, marker := range []string{"localhost", "127.0.0.1", "staging"} {
			if strings.Contains(c.DatabaseURL.Reveal(), marker) {
				errs = append(errs, fmt.Errorf("DATABASE_URL must not point to %s in prod", marker))
			}
		}
	}
	for _, o := range c.CORSOrigins {
		if o == "*" || (c.Env != Local && !strings.HasPrefix(o, "https://")) {
			errs = append(errs, fmt.Errorf("CORS_ORIGINS entry %q not allowed", o))
		}
	}
	if c.Storage.IsSet() && (c.Storage.Endpoint == "" || !c.Storage.AccessKey.IsSet() || !c.Storage.SecretKey.IsSet()) {
		errs = append(errs, errors.New("STORAGE_ENDPOINT, STORAGE_ACCESS_KEY and STORAGE_SECRET_KEY are required with STORAGE_BUCKET"))
	}
	if c.Env != Local && c.Storage.IsSet() && (!strings.HasPrefix(c.Storage.Endpoint, "https://") || (c.Storage.PublicURL != "" && !strings.HasPrefix(c.Storage.PublicURL, "https://"))) {
		errs = append(errs, errors.New("storage endpoints must use https outside local"))
	}
	if c.ShutdownTimeout <= 0 {
		errs = append(errs, errors.New("SHUTDOWN_TIMEOUT must be positive"))
	}
	return errors.Join(errs...)
}

func valueOr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}

func list(raw string) []string {
	var out []string
	for _, p := range strings.Split(raw, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
