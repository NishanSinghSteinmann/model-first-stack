package data

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/request"
)

type IssuedKey struct {
	ID  uuid.UUID
	Key string
}

func IssueServiceKey(ctx context.Context, tx pgx.Tx, s access.Scope, name string, roles []access.Role, expires *time.Time) (IssuedKey, error) {
	orgID, ok := s.OrgID()
	if !ok {
		return IssuedKey{}, errors.New("data: service keys need an org scope")
	}
	for _, r := range roles {
		if r.Kind() != access.Org {
			return IssuedKey{}, errors.New("data: service keys only carry org roles")
		}
	}
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return IssuedKey{}, err
	}
	names := make([]string, len(roles))
	for i, r := range roles {
		names[i] = string(r)
	}
	var id uuid.UUID
	err := tx.QueryRow(ctx,
		`insert into service_key (org_id, name, secret_hash, roles, expires_at) values ($1, $2, $3, $4, $5) returning id`,
		orgID, name, hash(secret), names, expires,
	).Scan(&id)
	if err != nil {
		return IssuedKey{}, err
	}
	return IssuedKey{ID: id, Key: request.ServiceKeyPrefix + hex.EncodeToString(id[:]) + "_" + base64.RawURLEncoding.EncodeToString(secret)}, nil
}

func RevokeServiceKey(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	tag, err := tx.Exec(ctx, `update service_key set revoked_at = now() where id = $1 and revoked_at is null`, id)
	if err == nil && tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return err
}

type ServiceKeyVerifier struct {
	db *DB
}

func NewServiceKeyVerifier(db *DB) *ServiceKeyVerifier {
	return &ServiceKeyVerifier{db: db}
}

func (v *ServiceKeyVerifier) VerifyKey(ctx context.Context, key string) (request.Principal, error) {
	rest, ok := strings.CutPrefix(key, request.ServiceKeyPrefix)
	rawID, rawSecret, ok2 := strings.Cut(rest, "_")
	idBytes, err1 := hex.DecodeString(rawID)
	secret, err2 := base64.RawURLEncoding.DecodeString(rawSecret)
	if !ok || !ok2 || err1 != nil || err2 != nil || len(idBytes) != 16 || len(secret) != 32 {
		return request.Principal{}, request.ErrInvalidToken
	}
	id, _ := uuid.FromBytes(idBytes)
	var orgID uuid.UUID
	var roles []string
	err := v.db.pool.QueryRow(ctx, `select org_id, roles from app.verify_service_key($1, $2)`, id, hash(secret)).Scan(&orgID, &roles)
	if errors.Is(err, pgx.ErrNoRows) {
		return request.Principal{}, request.ErrInvalidToken
	}
	if err != nil {
		return request.Principal{}, err
	}
	return request.Principal{Kind: request.Service, ID: id.String(), OrgID: orgID.String(), Roles: roles}, nil
}

func hash(secret []byte) string {
	sum := sha256.Sum256(secret)
	return hex.EncodeToString(sum[:])
}
