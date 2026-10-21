package access

import (
	"errors"
	"sync"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/request"
)

type systemToken struct{}

type SystemKey struct {
	token *systemToken
}

var (
	issueOnce sync.Once
	issued    *systemToken
)

var ErrSystemKeyIssued = errors.New("access: system key already issued")

func IssueSystemKey() (SystemKey, error) {
	var k SystemKey
	issueOnce.Do(func() {
		issued = &systemToken{}
		k = SystemKey{token: issued}
	})
	if k.token == nil {
		return SystemKey{}, ErrSystemKeyIssued
	}
	return k, nil
}

var systemPrincipal = request.Principal{Kind: request.System, ID: uuid.Nil.String()}

func (k SystemKey) OrgScope(orgID uuid.UUID) (Scope, error) {
	if k.token == nil || k.token != issued {
		return Scope{}, errors.New("access: invalid system key")
	}
	if orgID == uuid.Nil {
		return Scope{}, errors.New("access: system scope needs an org")
	}
	return Scope{kind: Org, principal: systemPrincipal, orgID: orgID}, nil
}
