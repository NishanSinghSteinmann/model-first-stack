package data

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

type Passwords struct {
	App  string
	Auth string
}

func Bootstrap(ctx context.Context, url string, pw Passwords) error {
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		return fmt.Errorf("data: bootstrap connect: %w", err)
	}
	defer func() { _ = conn.Close(ctx) }()
	steps := []func() error{
		func() error { return ensureRole(ctx, conn, "app", pw.App, "login") },
		func() error { return ensureRole(ctx, conn, "supabase_auth_admin", pw.Auth, "login noinherit") },
		func() error {
			if err := ensureRole(ctx, conn, "postgres", "", "nologin"); err != nil {
				return fmt.Errorf("%w; Supabase Auth needs a role postgres: give the migration user CREATEROLE on managed Postgres or create the role once as an admin (docs/managed-postgres.md)", err)
			}
			return nil
		},
	}
	if pw.Auth != "" {
		steps = append(steps,
			func() error { return run(ctx, conn, `grant supabase_auth_admin to current_user`) },
			func() error {
				return run(ctx, conn, `create schema if not exists auth authorization supabase_auth_admin`)
			},
			func() error {
				return execFormat(ctx, conn, `select format('grant create on database %I to supabase_auth_admin', current_database())`)
			},
			func() error { return run(ctx, conn, `alter role supabase_auth_admin set search_path = auth`) },
		)
	}
	for _, s := range steps {
		if err := s(); err != nil {
			return err
		}
	}
	return nil
}

func ensureRole(ctx context.Context, conn *pgx.Conn, name, password, attrs string) error {
	var exists bool
	if err := conn.QueryRow(ctx, `select exists (select 1 from pg_roles where rolname = $1)`, name).Scan(&exists); err != nil {
		return fmt.Errorf("data: bootstrap %s: %w", name, err)
	}
	switch {
	case !exists && password == "" && attrs == "nologin":
		return execFormat(ctx, conn, `select format('create role %I nologin', $1::text)`, name)
	case password == "":
		return nil
	case exists:
		return execFormat(ctx, conn, `select format('alter role %I with `+attrs+` password %L', $1::text, $2::text)`, name, password)
	default:
		return execFormat(ctx, conn, `select format('create role %I `+attrs+` password %L', $1::text, $2::text)`, name, password)
	}
}

func execFormat(ctx context.Context, conn *pgx.Conn, query string, args ...any) error {
	var stmt string
	if err := conn.QueryRow(ctx, query, args...).Scan(&stmt); err != nil {
		return fmt.Errorf("data: bootstrap: %w", err)
	}
	return run(ctx, conn, stmt)
}

func run(ctx context.Context, conn *pgx.Conn, stmt string) error {
	if _, err := conn.Exec(ctx, stmt); err != nil {
		return fmt.Errorf("data: bootstrap: %w", err)
	}
	return nil
}
