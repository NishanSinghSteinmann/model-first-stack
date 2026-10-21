package access

import (
	"context"
	"net/http"
	"slices"
	"testing"

	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/request"
)

type tableMemberships struct {
	org      map[uuid.UUID][]Role
	platform []Role
}

func (m tableMemberships) OrgRoles(_ context.Context, _ request.Principal, orgID uuid.UUID) ([]Role, error) {
	return m.org[orgID], nil
}

func (m tableMemberships) PlatformRoles(context.Context, request.Principal) ([]Role, error) {
	return m.platform, nil
}

func TestModelGrantsSelf(t *testing.T) {
	g := NewModelGrants(nil)
	guest, member, _ := g.Permissions(context.Background(), request.Principal{Kind: request.Guest}, Self, uuid.Nil)
	if !member || !slices.Contains(guest, "self:read") || slices.Contains(guest, "self:write") {
		t.Fatalf("guest = %v", guest)
	}
	user, _, _ := g.Permissions(context.Background(), request.Principal{Kind: request.User}, Self, uuid.Nil)
	if !slices.Contains(user, "self:write") || slices.Contains(user, "org:read") {
		t.Fatalf("user = %v", user)
	}
	svc, _, _ := g.Permissions(context.Background(), request.Principal{Kind: request.Service}, Self, uuid.Nil)
	if len(svc) != 0 {
		t.Fatalf("service = %v", svc)
	}
}

func TestModelGrantsOrgOnlyCountsOrgRoles(t *testing.T) {
	org := uuid.New()
	g := NewModelGrants(tableMemberships{org: map[uuid.UUID][]Role{org: {RoleOrgMember, RolePlatformAdmin}}})
	perms, member, _ := g.Permissions(context.Background(), request.Principal{Kind: request.User}, Org, org)
	if !member || !slices.Contains(perms, "org:read") || slices.Contains(perms, "orgs:verify") || slices.Contains(perms, "members:manage") {
		t.Fatalf("perms = %v member %v", perms, member)
	}
	if _, member, _ := g.Permissions(context.Background(), request.Principal{Kind: request.User}, Org, uuid.New()); member {
		t.Fatal("foreign org must not be a membership")
	}
}

func TestModelGrantsPlatformOnlyForUsers(t *testing.T) {
	g := NewModelGrants(tableMemberships{platform: []Role{RoleSupport}})
	if perms, member, _ := g.Permissions(context.Background(), request.Principal{Kind: request.User}, Platform, uuid.Nil); !member || !slices.Contains(perms, "support:access") {
		t.Fatalf("perms = %v", perms)
	}
	if _, member, _ := g.Permissions(context.Background(), request.Principal{Kind: request.Guest}, Platform, uuid.Nil); member {
		t.Fatal("guest must never get platform roles")
	}
	if _, member, _ := NewModelGrants(nil).Permissions(context.Background(), request.Principal{Kind: request.User}, Org, uuid.New()); member {
		t.Fatal("without memberships nobody is an org member")
	}
}

func TestBindRejectsRoutesOutsideTheModel(t *testing.T) {
	ok := func(http.ResponseWriter, *http.Request) {}
	b := NewRouter(nil).Bind(map[string]Rule{"GET /a": PublicRule("x"), "GET /b": PublicRule("y")}, nil)
	b.HandleFunc("GET /a", ok)
	if err := b.Complete(); err == nil {
		t.Fatal("missing handler for GET /b not reported")
	}
	defer func() {
		if recover() == nil {
			t.Fatal("route without rule was accepted")
		}
	}()
	b.HandleFunc("GET /c", ok)
}

func TestModelGrantsServiceKeysStayInTheirOrg(t *testing.T) {
	org := uuid.New()
	p := request.Principal{Kind: request.Service, OrgID: org.String(), Roles: []string{string(RoleServiceIntegration), string(RolePlatformAdmin)}}
	perms, member, _ := NewModelGrants(nil).Permissions(context.Background(), p, Org, org)
	if !member || !slices.Contains(perms, "integration:write") || slices.Contains(perms, "orgs:verify") {
		t.Fatalf("perms = %v member %v", perms, member)
	}
	if _, member, _ := NewModelGrants(nil).Permissions(context.Background(), p, Org, uuid.New()); member {
		t.Fatal("service key reached a foreign org")
	}
	if perms, _, _ := NewModelGrants(nil).Permissions(context.Background(), p, Self, uuid.Nil); len(perms) != 0 {
		t.Fatalf("service key got self permissions %v", perms)
	}
}
