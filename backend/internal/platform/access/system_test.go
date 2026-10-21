package access

import (
	"testing"

	"github.com/google/uuid"
)

func TestSystemKey(t *testing.T) {
	k, err := IssueSystemKey()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := IssueSystemKey(); err == nil {
		t.Fatal("second system key issued")
	}
	if _, err := (SystemKey{}).OrgScope(uuid.New()); err == nil {
		t.Fatal("forged zero key accepted")
	}
	if _, err := (SystemKey{token: &systemToken{}}).OrgScope(uuid.New()); err == nil {
		t.Fatal("foreign token accepted")
	}
	if _, err := k.OrgScope(uuid.Nil); err == nil {
		t.Fatal("system scope without org accepted")
	}
	org := uuid.New()
	s, err := k.OrgScope(org)
	if id, ok := s.OrgID(); err != nil || !ok || id != org || s.Principal().Kind != "system" {
		t.Fatalf("scope %+v, %v", s, err)
	}
}
