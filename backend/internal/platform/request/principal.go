package request

import (
	"context"
	"time"
)

type Kind string

const (
	User    Kind = "user"
	Guest   Kind = "guest"
	Service Kind = "service"
	System  Kind = "system"
)

type Principal struct {
	Kind  Kind
	ID    string
	AAL   string
	MFAAt time.Time
	OrgID string
	Roles []string
}

type principalKey struct{}

func withPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}
