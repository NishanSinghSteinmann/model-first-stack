package data

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/example/app/backend/internal/platform/access/accesstest"
	"github.com/example/app/backend/internal/platform/request"
	"github.com/example/app/backend/internal/platform/request/requesttest"
)

func TestIdempotency(t *testing.T) {
	ctx := context.Background()
	admin, appURL := startPostgres(t)
	if err := Migrate(ctx, admin); err != nil {
		t.Fatal(err)
	}
	db, err := Open(ctx, appURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	iss := requesttest.NewIssuer(t)
	var calls atomic.Int32
	var fail atomic.Bool
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if fail.Load() {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		b, _ := io.ReadAll(r.Body)
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"created":` + string(b) + `}`))
	})
	h := request.WithID(request.Authenticate(iss.Verifier)(request.Idempotency(NewIdempotencyStore(db))(handler)))
	alice, bob := uuid.NewString(), uuid.NewString()
	post := func(who, key, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, "/things", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer "+iss.Token(t, who, false))
		req.Header.Set(request.IdempotencyHeader, key)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}

	first := post(alice, "key-0000001", `1`)
	second := post(alice, "key-0000001", `1`)
	if first.Code != 201 || second.Code != 201 || second.Body.String() != first.Body.String() || second.Header().Get("Idempotent-Replayed") != "true" || calls.Load() != 1 {
		t.Fatalf("replay broken: %d %d %q %q calls=%d", first.Code, second.Code, first.Body.String(), second.Body.String(), calls.Load())
	}
	if rec := post(alice, "key-0000001", `2`); rec.Code != 422 {
		t.Fatalf("different body with same key: %d", rec.Code)
	}
	if rec := post(bob, "key-0000001", `1`); rec.Code != 201 || calls.Load() != 2 {
		t.Fatalf("other principal shares key: %d", rec.Code)
	}
	if rec := post(alice, "short", `1`); rec.Code != 400 {
		t.Fatalf("invalid key accepted: %d", rec.Code)
	}
	fail.Store(true)
	if rec := post(alice, "key-0000002", `3`); rec.Code != 500 {
		t.Fatalf("failure status %d", rec.Code)
	}
	fail.Store(false)
	if rec := post(alice, "key-0000002", `3`); rec.Code != 201 {
		t.Fatalf("retry after 5xx blocked: %d", rec.Code)
	}

	s := accesstest.SelfScope(t, alice)
	var visible int
	_ = db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `select count(*) from idempotency_key`).Scan(&visible)
	})
	if visible != 2 {
		t.Fatalf("alice sees %d keys, want her 2", visible)
	}
}

func TestStatementTimeout(t *testing.T) {
	ctx := context.Background()
	admin, appURL := startPostgres(t)
	if err := Migrate(ctx, admin); err != nil {
		t.Fatal(err)
	}
	db, err := Open(ctx, appURL)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	err = db.InTx(ctx, accesstest.SelfScope(t, principal), func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `select pg_sleep(6)`)
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "statement timeout") {
		t.Fatalf("runaway query not cancelled: %v", err)
	}
}
