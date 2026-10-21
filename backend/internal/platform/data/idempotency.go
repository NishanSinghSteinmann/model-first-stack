package data

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"

	"github.com/example/app/backend/internal/platform/request"
)

type IdempotencyStore struct {
	db *DB
}

func NewIdempotencyStore(db *DB) *IdempotencyStore {
	return &IdempotencyStore{db: db}
}

func (s *IdempotencyStore) inPrincipalTx(ctx context.Context, principalID string, fn func(pgx.Tx) error) (err error) {
	tx, err := s.db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	if _, err = tx.Exec(ctx, `select set_config('app.principal_id', $1, true), set_config('statement_timeout', '5s', true)`, principalID); err != nil {
		return err
	}
	if err = fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (s *IdempotencyStore) Begin(ctx context.Context, principalID, key, fingerprint string) (*request.Stored, error) {
	var stored *request.Stored
	err := s.inPrincipalTx(ctx, principalID, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx,
			`insert into idempotency_key (principal_id, key, fingerprint) values ($1, $2, $3) on conflict do nothing`,
			principalID, key, fingerprint)
		if err != nil || tag.RowsAffected() == 1 {
			return err
		}
		var fp string
		var status *int32
		var body []byte
		if err := tx.QueryRow(ctx, `select fingerprint, status, body from idempotency_key where principal_id = $1 and key = $2`, principalID, key).Scan(&fp, &status, &body); err != nil {
			return err
		}
		switch {
		case fp != fingerprint:
			return request.ErrIdempotencyMismatch
		case status == nil:
			return request.ErrIdempotencyInProgress
		}
		stored = &request.Stored{Status: int(*status), Body: body}
		return nil
	})
	if errors.Is(err, request.ErrIdempotencyMismatch) || errors.Is(err, request.ErrIdempotencyInProgress) {
		return nil, err
	}
	return stored, err
}

func (s *IdempotencyStore) Complete(ctx context.Context, principalID, key string, st request.Stored) error {
	return s.inPrincipalTx(ctx, principalID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `update idempotency_key set status = $3, body = $4 where principal_id = $1 and key = $2`, principalID, key, st.Status, st.Body)
		return err
	})
}

func (s *IdempotencyStore) Release(ctx context.Context, principalID, key string) error {
	return s.inPrincipalTx(ctx, principalID, func(tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `delete from idempotency_key where principal_id = $1 and key = $2 and status is null`, principalID, key)
		return err
	})
}
