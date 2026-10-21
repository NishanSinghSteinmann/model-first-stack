package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func prod(over map[string]string) map[string]string {
	m := map[string]string{"APP_ENV": "prod", "DATABASE_URL": "postgres://db.internal/app", "AUTH_JWKS_URL": "https://auth.example.com/auth/v1/.well-known/jwks.json", "AUTH_ISSUER": "https://auth.example.com/auth/v1"}
	for k, v := range over {
		m[k] = v
	}
	return m
}

func TestLoad(t *testing.T) {
	tests := []struct {
		name    string
		vars    map[string]string
		wantErr string
	}{
		{name: "local without database", vars: map[string]string{"APP_ENV": "local"}},
		{name: "unknown env", vars: map[string]string{"APP_ENV": "dev"}, wantErr: "APP_ENV"},
		{name: "missing env", vars: map[string]string{}, wantErr: "APP_ENV"},
		{name: "staging needs database", vars: map[string]string{"APP_ENV": "staging"}, wantErr: "DATABASE_URL is required"},
		{name: "staging needs auth", vars: map[string]string{"APP_ENV": "staging", "DATABASE_URL": "postgres://db/app"}, wantErr: "AUTH_JWKS_URL and AUTH_ISSUER are required"},
		{name: "auth half configured", vars: map[string]string{"APP_ENV": "local", "AUTH_JWKS_URL": "http://localhost/jwks"}, wantErr: "set together"},
		{name: "prod jwks over http", vars: prod(map[string]string{"AUTH_JWKS_URL": "http://auth/jwks"}), wantErr: "https"},
		{name: "prod rejects localhost", vars: prod(map[string]string{"DATABASE_URL": "postgres://localhost/app"}), wantErr: "localhost"},
		{name: "prod rejects staging database", vars: prod(map[string]string{"DATABASE_URL": "postgres://db.staging.internal/app"}), wantErr: "staging"},
		{name: "prod ok", vars: prod(nil)},
		{name: "cors wildcard", vars: map[string]string{"APP_ENV": "local", "CORS_ORIGINS": "*"}, wantErr: "CORS_ORIGINS"},
		{name: "prod cors over http", vars: prod(map[string]string{"CORS_ORIGINS": "http://cockpit.example.com"}), wantErr: "CORS_ORIGINS"},
		{name: "prod cors ok", vars: prod(map[string]string{"CORS_ORIGINS": "https://cockpit.example.com, https://app.example.com"})},
		{name: "bad shutdown timeout", vars: map[string]string{"APP_ENV": "local", "SHUTDOWN_TIMEOUT": "soon"}, wantErr: "SHUTDOWN_TIMEOUT"},
		{name: "negative shutdown timeout", vars: map[string]string{"APP_ENV": "local", "SHUTDOWN_TIMEOUT": "-1s"}, wantErr: "positive"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Load("api", "test", env(tt.vars))
			if tt.wantErr == "" && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tt.wantErr != "" && (err == nil || !strings.Contains(err.Error(), tt.wantErr)) {
				t.Fatalf("want error containing %q, got %v", tt.wantErr, err)
			}
		})
	}
}

func TestDefaults(t *testing.T) {
	cfg, err := Load("api", "1.2.3", env(map[string]string{"APP_ENV": "local"}))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.HTTPAddr != ":8080" || cfg.ShutdownTimeout != 20*time.Second || cfg.Service != "api" || cfg.Version != "1.2.3" {
		t.Fatalf("unexpected defaults: %+v", cfg)
	}
}

func TestRequirementsDependOnMode(t *testing.T) {
	staging := func(extra map[string]string) func(string) string {
		vars := map[string]string{"APP_ENV": "staging"}
		for k, v := range extra {
			vars[k] = v
		}
		return env(vars)
	}
	if _, err := Load("migrate", "t", staging(map[string]string{"DATABASE_MIGRATE_URL": "postgres://o@db/x"})); err != nil {
		t.Fatalf("migrate needs only the migrate url: %v", err)
	}
	if _, err := Load("migrate", "t", staging(nil)); err == nil {
		t.Fatal("migrate without url accepted")
	}
	if _, err := Load("drain", "t", staging(map[string]string{"DATABASE_URL": "postgres://a@db/x"})); err != nil {
		t.Fatalf("drain needs no auth: %v", err)
	}
	if _, err := Load("api", "t", staging(map[string]string{"DATABASE_URL": "postgres://a@db/x"})); err == nil {
		t.Fatal("api without auth accepted")
	}
}

func TestStorageNeedsKeysAndHTTPS(t *testing.T) {
	base := map[string]string{"APP_ENV": "staging", "DATABASE_URL": "postgres://a@db/x", "STORAGE_BUCKET": "files"}
	if _, err := Load("drain", "t", env(base)); err == nil {
		t.Fatal("bucket without endpoint and keys accepted")
	}
	base["STORAGE_ENDPOINT"] = "http://storage.googleapis.com"
	base["STORAGE_ACCESS_KEY"] = "a"
	base["STORAGE_SECRET_KEY"] = "b"
	if _, err := Load("drain", "t", env(base)); err == nil {
		t.Fatal("plain http storage accepted outside local")
	}
	base["STORAGE_ENDPOINT"] = "https://storage.googleapis.com"
	if cfg, err := Load("drain", "t", env(base)); err != nil || cfg.Storage.Region != "auto" {
		t.Fatalf("valid storage rejected: %v", err)
	}
}
