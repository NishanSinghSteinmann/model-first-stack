package access

import (
	"context"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/request"
)

type Memberships interface {
	OrgRoles(ctx context.Context, p request.Principal, orgID uuid.UUID) ([]Role, error)
	PlatformRoles(ctx context.Context, p request.Principal) ([]Role, error)
}

type ModelGrants struct {
	memberships Memberships
}

func NewModelGrants(m Memberships) *ModelGrants {
	return &ModelGrants{memberships: m}
}

func (g *ModelGrants) Permissions(ctx context.Context, p request.Principal, kind Kind, orgID uuid.UUID) ([]Permission, bool, error) {
	switch kind {
	case Self:
		if r, ok := defaultRoles[p.Kind]; ok {
			return permissionsOf(Self, r), true, nil
		}
		return nil, true, nil
	case Org:
		if p.Kind == request.Service {
			if p.OrgID != orgID.String() {
				return nil, false, nil
			}
			roles := make([]Role, len(p.Roles))
			for i, r := range p.Roles {
				roles[i] = Role(r)
			}
			return permissionsOf(Org, roles...), true, nil
		}
		if g.memberships == nil {
			return nil, false, nil
		}
		roles, err := g.memberships.OrgRoles(ctx, p, orgID)
		if err != nil {
			return nil, false, err
		}
		return permissionsOf(Org, roles...), len(roles) > 0, nil
	case Platform:
		if g.memberships == nil || p.Kind != request.User {
			return nil, false, nil
		}
		roles, err := g.memberships.PlatformRoles(ctx, p)
		if err != nil {
			return nil, false, err
		}
		return permissionsOf(Platform, roles...), len(roles) > 0, nil
	}
	return nil, false, nil
}

func (r Role) Kind() Kind { return roleKind[r] }

func permissionsOf(kind Kind, roles ...Role) []Permission {
	var out []Permission
	for _, r := range roles {
		if roleKind[r] == kind {
			out = append(out, rolePermissions[r]...)
		}
	}
	return out
}
