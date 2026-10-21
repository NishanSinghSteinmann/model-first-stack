package request

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"
)

const IDHeader = "X-Request-ID"

type idKey struct{}

var validID = regexp.MustCompile(`^[A-Za-z0-9-]{8,64}$`)

func WithID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get(IDHeader)
		if !validID.MatchString(id) {
			id = newID()
		}
		w.Header().Set(IDHeader, id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), idKey{}, id)))
	})
}

func ID(ctx context.Context) string {
	id, _ := ctx.Value(idKey{}).(string)
	return id
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
