package data

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"github.com/example/app/backend/internal/platform/access"
)

//go:embed migrations/*.sql
var migrations embed.FS

type DB struct {
	pool *pgxpool.Pool
}

func Open(ctx context.Context, url string) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("data: parse url: %w", err)
	}
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("data: open: %w", err)
	}
	var bypass bool
	if err := pool.QueryRow(ctx, `select rolsuper or rolbypassrls from pg_roles where rolname = current_user`).Scan(&bypass); err != nil {
		pool.Close()
		return nil, fmt.Errorf("data: check role: %w", err)
	}
	if bypass {
		pool.Close()
		return nil, errors.New("data: database role bypasses row level security, use the app role")
	}
	return &DB{pool: pool}, nil
}

func (d *DB) Ping(ctx context.Context) error {
	return d.pool.Ping(ctx)
}

func (d *DB) Close() {
	d.pool.Close()
}

func (d *DB) InTx(ctx context.Context, s access.Scope, fn func(ctx context.Context, tx pgx.Tx) error) (err error) {
	if s.Kind() == "" || s.Kind() == access.Public {
		return errors.New("data: transaction needs a non-public scope")
	}
	tx, err := d.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	org := ""
	if id, ok := s.OrgID(); ok {
		org = id.String()
	}
	if _, err = tx.Exec(ctx,
		`select set_config('app.org_id', $1, true), set_config('app.principal_id', $2, true), set_config('app.scope_kind', $3, true), set_config('statement_timeout', '5s', true), set_config('lock_timeout', '3s', true)`,
		org, s.Principal().ID, string(s.Kind()),
	); err != nil {
		return err
	}
	if err = fn(ctx, tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func Migrate(ctx context.Context, url string) error {
	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		return fmt.Errorf("data: parse url: %w", err)
	}
	cfg.RuntimeParams["lock_timeout"] = "5s"
	cfg.RuntimeParams["statement_timeout"] = "120s"
	db := stdlib.OpenDB(*cfg)
	defer func(db *sql.DB) { _ = db.Close() }(db)
	p, err := goose.NewProvider(goose.DialectPostgres, db, mustSub(migrations, "migrations"))
	if err != nil {
		return err
	}
	_, err = p.Up(ctx)
	return err
}

func Do[T, Q any](ctx context.Context, d *DB, s access.Scope, newQueries func(T) Q, fn func(ctx context.Context, q Q) error) error {
	return d.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
		db, ok := any(tx).(T)
		if !ok {
			return fmt.Errorf("data: transaction does not satisfy %T", *new(T))
		}
		return fn(ctx, newQueries(db))
	})
}

func IsNotFound(err error) bool {
	return errors.Is(err, pgx.ErrNoRows)
}
