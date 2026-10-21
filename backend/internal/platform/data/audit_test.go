package data

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/example/app/backend/internal/platform/access/accesstest"
)

func TestAuditIsAppendOnlyAndScoped(t *testing.T) {
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
	org := uuid.New()
	s := accesstest.OrgScope(t, principal, org)
	write := func(e AuditEntry) error {
		return db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error { return Audit(ctx, tx, s, e) })
	}
	if err := write(AuditEntry{Action: "org.bank_account.changed", Target: org.String(), RequestID: "abc12345", Meta: map[string]string{"effective": "2026-10-22"}}); err != nil {
		t.Fatalf("valid entry rejected: %v", err)
	}
	if err := write(AuditEntry{Action: "org.bank_account.changed", Target: "x", Meta: map[string]string{"email": "max@example.de"}}); err == nil {
		t.Fatal("personal data accepted in meta")
	}
	if err := write(AuditEntry{Action: "Bank changed", Target: "x"}); err == nil {
		t.Fatal("free text action accepted")
	}
	for _, stmt := range []string{`update audit_event set action = 'x.y'`, `delete from audit_event`, `truncate audit_event`} {
		err := db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
			_, err := tx.Exec(ctx, stmt)
			return err
		})
		if err == nil || (!strings.Contains(err.Error(), "append-only") && !strings.Contains(err.Error(), "permission denied")) {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	forged := db.InTx(ctx, s, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `insert into audit_event (scope_kind, principal_id, org_id, action, target) values ('org', $1, $2, 'org.x.y', 't')`, principal, uuid.New())
		return err
	})
	if forged == nil {
		t.Fatal("audit entry for a foreign org accepted")
	}
	var n int
	conn, err := pgx.Connect(ctx, admin)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()
	if err := conn.QueryRow(ctx, `select count(*) from audit_event`).Scan(&n); err != nil || n != 1 {
		t.Fatalf("audit rows = %d, %v", n, err)
	}
}
