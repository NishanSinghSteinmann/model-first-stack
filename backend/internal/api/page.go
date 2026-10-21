package api

import (
	"errors"

	"github.com/google/uuid"
)

const (
	DefaultLimit = 50
	MaxLimit     = 100
)

var ErrInvalidCursor = errors.New("api: invalid cursor")

type Page struct {
	After uuid.UUID
	Limit int32
}

func NewPage(after *string, limit *int) (Page, error) {
	p := Page{Limit: DefaultLimit}
	if limit != nil {
		if *limit < 1 || *limit > MaxLimit {
			return Page{}, ErrInvalidCursor
		}
		p.Limit = int32(*limit)
	}
	if after != nil && *after != "" {
		id, err := uuid.Parse(*after)
		if err != nil {
			return Page{}, ErrInvalidCursor
		}
		p.After = id
	}
	return p, nil
}

func Next[T any](items []T, p Page, id func(T) uuid.UUID) *string {
	if len(items) < int(p.Limit) || len(items) == 0 {
		return nil
	}
	next := id(items[len(items)-1]).String()
	return &next
}
