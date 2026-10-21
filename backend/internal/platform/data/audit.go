package data

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"

	"github.com/example/app/backend/internal/platform/access"
)

type AuditEntry struct {
	Action    string
	Target    string
	RequestID string
	Meta      map[string]string
}

var auditToken = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,100}$`)

func Audit(ctx context.Context, tx pgx.Tx, s access.Scope, e AuditEntry) error {
	for k, v := range e.Meta {
		if !auditToken.MatchString(k) || !auditToken.MatchString(v) {
			return fmt.Errorf("data: audit meta %q must contain ids or codes only", k)
		}
	}
	meta, err := json.Marshal(e.Meta)
	if err != nil {
		return err
	}
	var org any
	if id, ok := s.OrgID(); ok {
		org = id
	}
	_, err = tx.Exec(ctx,
		`insert into audit_event (scope_kind, principal_id, org_id, action, target, request_id, meta) values ($1, $2, $3, $4, $5, nullif($6, ''), $7)`,
		string(s.Kind()), s.Principal().ID, org, e.Action, e.Target, e.RequestID, meta,
	)
	return err
}
