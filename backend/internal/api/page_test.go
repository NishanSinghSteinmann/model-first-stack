package api

import (
	"testing"

	"github.com/google/uuid"
)

func TestPage(t *testing.T) {
	if p, err := NewPage(nil, nil); err != nil || p.Limit != DefaultLimit || p.After != uuid.Nil {
		t.Fatalf("default page = %+v %v", p, err)
	}
	bad, zero, big := "x", 0, 101
	if _, err := NewPage(&bad, nil); err == nil {
		t.Fatal("invalid cursor accepted")
	}
	if _, err := NewPage(nil, &zero); err == nil {
		t.Fatal("limit 0 accepted")
	}
	if _, err := NewPage(nil, &big); err == nil {
		t.Fatal("limit 101 accepted")
	}
	ids := []uuid.UUID{uuid.New(), uuid.New()}
	self := func(u uuid.UUID) uuid.UUID { return u }
	if n := Next(ids, Page{Limit: 2}, self); n == nil || *n != ids[1].String() {
		t.Fatalf("full page needs next cursor, got %v", n)
	}
	if n := Next(ids, Page{Limit: 3}, self); n != nil {
		t.Fatal("short page must end the list")
	}
}
