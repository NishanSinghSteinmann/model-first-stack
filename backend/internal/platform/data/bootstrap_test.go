package data

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

func TestBootstrapCreatesRolesIdempotently(t *testing.T) {
	ctx := context.Background()
	admin, appURL := startPostgres(t)
	pw := Passwords{App: "app", Auth: "auth's secret"}
	for range 2 {
		if err := Bootstrap(ctx, admin, pw); err != nil {
			t.Fatal(err)
		}
	}
	if err := Migrate(ctx, admin); err != nil {
		t.Fatal(err)
	}
	db, err := Open(ctx, appURL)
	if err != nil {
		t.Fatalf("app role cannot open: %v", err)
	}
	db.Close()
	authURL := strings.Replace(appURL, "app:app@", "supabase_auth_admin:auth%27s%20secret@", 1)
	conn, err := pgx.Connect(ctx, authURL)
	if err != nil {
		t.Fatalf("auth role cannot log in: %v", err)
	}
	defer func() { _ = conn.Close(ctx) }()
	var owner, path string
	if err := conn.QueryRow(ctx, `select nspowner::regrole::text, current_setting('search_path') from pg_namespace where nspname = 'auth'`).Scan(&owner, &path); err != nil {
		t.Fatal(err)
	}
	if owner != "supabase_auth_admin" || path != "auth" {
		t.Fatalf("auth schema owner %q search_path %q", owner, path)
	}
	if _, err := conn.Exec(ctx, `create table auth.probe (id int)`); err != nil {
		t.Fatalf("auth role cannot create tables: %v", err)
	}
	var postgres bool
	if err := conn.QueryRow(ctx, `select exists (select 1 from pg_roles where rolname = 'postgres')`).Scan(&postgres); err != nil || !postgres {
		t.Fatalf("role postgres missing: %v", err)
	}
}
