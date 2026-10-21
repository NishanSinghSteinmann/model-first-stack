package data

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/access/accesstest"
)

const principal = "6f1c2c1e-3a6b-4c55-9d43-2f1a7b9e0c11"

func startPostgres(t *testing.T) (admin string, app string) {
	t.Helper()
	ctx := context.Background()
	c, err := postgres.Run(ctx, "postgres:17-alpine",
		postgres.WithDatabase("app"), postgres.WithUsername("owner"), postgres.WithPassword("owner"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		if os.Getenv("CI") != "" || !strings.Contains(err.Error(), "Cannot connect to the Docker daemon") {
			t.Fatalf("postgres container: %v", err)
		}
		t.Skipf("docker not available: %v", err)
	}
	t.Cleanup(func() { _ = c.Terminate(context.Background()) })
	admin, err = c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	host, _ := c.Host(ctx)
	port, _ := c.MappedPort(ctx, "5432/tcp")
	exec(t, admin, `create role app login password 'app'`)
	return admin, "postgres://app:app@" + host + ":" + port.Port() + "/app?sslmode=disable"
}

func exec(t *testing.T, url string, stmts ...string) {
	t.Helper()
	conn, err := pgx.Connect(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(context.Background()) }()
	for _, s := range stmts {
		if _, err := conn.Exec(context.Background(), s); err != nil {
			t.Fatalf("%s: %v", s, err)
		}
	}
}

func TestRowLevelSecurityIsolatesOrgs(t *testing.T) {
	ctx := context.Background()
	admin, appURL := startPostgres(t)
	if err := Migrate(ctx, admin); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, admin); err != nil {
		t.Fatalf("second migrate not idempotent: %v", err)
	}
	exec(t, admin,
		`create table probe (id serial primary key, org_id uuid not null default app.org_id(), note text)`,
		`alter table probe enable row level security`,
		`alter table probe force row level security`,
		`create policy probe_org on probe using (org_id = app.org_id()) with check (org_id = app.org_id())`,
		`grant usage on schema app to app`,
		`grant select, insert on probe to app`,
		`grant usage on sequence probe_id_seq to app`,
	)
	db, err := Open(ctx, appURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	orgA, orgB := uuid.New(), uuid.New()
	scopeA := accesstest.OrgScope(t, principal, orgA)
	scopeB := accesstest.OrgScope(t, principal, orgB)

	insert := func(s access.Scope, note string) error {
		return db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
			_, err := tx.Exec(ctx, `insert into probe (note) values ($1)`, note)
			return err
		})
	}
	count := func(s access.Scope) int {
		var n int
		if err := db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
			return tx.QueryRow(ctx, `select count(*) from probe`).Scan(&n)
		}); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if err := insert(scopeA, "a1"); err != nil {
		t.Fatal(err)
	}
	if err := insert(scopeA, "a2"); err != nil {
		t.Fatal(err)
	}
	if err := insert(scopeB, "b1"); err != nil {
		t.Fatal(err)
	}
	if got := count(scopeA); got != 2 {
		t.Fatalf("org A sees %d rows, want 2", got)
	}
	if got := count(scopeB); got != 1 {
		t.Fatalf("org B sees %d rows, want 1", got)
	}

	err = db.InTx(ctx, scopeA, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into probe (org_id, note) values ($1, 'smuggled')`, orgB)
		return err
	})
	if err == nil {
		t.Fatal("org A could write a row into org B")
	}

	var direct int
	conn, err := pgx.Connect(ctx, appURL)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()
	if err := conn.QueryRow(ctx, `select count(*) from probe`).Scan(&direct); err != nil {
		t.Fatal(err)
	}
	if direct != 0 {
		t.Fatalf("query outside InTx sees %d rows, want 0", direct)
	}

	if got := count(scopeA); got != 2 {
		t.Fatalf("settings leaked between transactions: org A sees %d", got)
	}
}

func TestInTxRejectsEmptyScope(t *testing.T) {
	if err := (&DB{}).InTx(context.Background(), access.Scope{}, nil); err == nil {
		t.Fatal("empty scope accepted")
	}
}

func TestInTxRollsBackOnError(t *testing.T) {
	ctx := context.Background()
	admin, appURL := startPostgres(t)
	if err := Migrate(ctx, admin); err != nil {
		t.Fatal(err)
	}
	exec(t, admin,
		`create table probe (id serial primary key, org_id uuid not null default app.org_id())`,
		`alter table probe enable row level security`,
		`alter table probe force row level security`,
		`create policy probe_org on probe using (org_id = app.org_id())`,
		`grant usage on schema app to app`,
		`grant select, insert on probe to app`,
		`grant usage on sequence probe_id_seq to app`,
	)
	db, err := Open(ctx, appURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	s := accesstest.OrgScope(t, principal, uuid.New())
	_ = db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `insert into probe default values`); err != nil {
			return err
		}
		return context.Canceled
	})
	var n int
	_ = db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select count(*) from probe`).Scan(&n)
	})
	if n != 0 {
		t.Fatalf("rolled back insert is visible: %d", n)
	}
}

func TestOpenRefusesRolesThatBypassRLS(t *testing.T) {
	admin, _ := startPostgres(t)
	if db, err := Open(context.Background(), admin); err == nil {
		db.Close()
		t.Fatal("superuser connection was accepted")
	}
}

func TestIsNotFound(t *testing.T) {
	if !IsNotFound(fmt.Errorf("get: %w", pgx.ErrNoRows)) || IsNotFound(errors.New("other")) || IsNotFound(nil) {
		t.Fatal("IsNotFound must match only pgx.ErrNoRows")
	}
}
