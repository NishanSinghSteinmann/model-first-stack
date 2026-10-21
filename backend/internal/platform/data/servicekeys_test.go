package data

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/access/accesstest"
	"github.com/example/app/backend/internal/platform/request"
)

func TestServiceKeys(t *testing.T) {
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
	scope := accesstest.OrgScope(t, principal, org)
	issue := func(roles []access.Role, expires *time.Time) (k IssuedKey, err error) {
		err = db.InTx(ctx, scope, func(ctx context.Context, tx pgx.Tx) error {
			k, err = IssueServiceKey(ctx, tx, scope, "CRM", roles, expires)
			return err
		})
		return k, err
	}
	key, err := issue([]access.Role{access.RoleServiceIntegration}, nil)
	if err != nil {
		t.Fatal(err)
	}
	v := NewServiceKeyVerifier(db)
	p, err := v.VerifyKey(ctx, key.Key)
	if err != nil || p.Kind != request.Service || p.OrgID != org.String() || len(p.Roles) != 1 || p.Roles[0] != "service-integration" {
		t.Fatalf("valid key: %+v %v", p, err)
	}
	tampered := key.Key[:len(key.Key)-2] + "AA"
	for name, k := range map[string]string{"falsches Secret": tampered, "kaputt": "sk_xyz", "fremde ID": "sk_" + strings.Repeat("0", 32) + key.Key[35:]} {
		if _, err := v.VerifyKey(ctx, k); !errors.Is(err, request.ErrInvalidToken) {
			t.Errorf("%s: %v", name, err)
		}
	}
	past := time.Now().Add(-time.Minute)
	expired, err := issue([]access.Role{access.RoleServiceIntegration}, &past)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := v.VerifyKey(ctx, expired.Key); !errors.Is(err, request.ErrInvalidToken) {
		t.Fatalf("expired key accepted: %v", err)
	}
	if err := db.InTx(ctx, scope, func(ctx context.Context, tx pgx.Tx) error { return RevokeServiceKey(ctx, tx, key.ID) }); err != nil {
		t.Fatal(err)
	}
	if _, err := v.VerifyKey(ctx, key.Key); !errors.Is(err, request.ErrInvalidToken) {
		t.Fatalf("revoked key accepted: %v", err)
	}
	if _, err := issue([]access.Role{access.RolePlatformAdmin}, nil); err == nil {
		t.Fatal("platform role on a service key accepted")
	}
	err = db.InTx(ctx, scope, func(ctx context.Context, tx pgx.Tx) error {
		var h string
		return tx.QueryRow(ctx, `select secret_hash from service_key limit 1`).Scan(&h)
	})
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("app role read secret hashes: %v", err)
	}
	other := accesstest.OrgScope(t, principal, uuid.New())
	err = db.InTx(ctx, other, func(ctx context.Context, tx pgx.Tx) error {
		var n int
		if err := tx.QueryRow(ctx, `select count(*) from service_key`).Scan(&n); err != nil {
			return err
		}
		if n != 0 {
			t.Errorf("foreign org sees %d keys", n)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
