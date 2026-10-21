package request

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"regexp"

	"github.com/example/app/backend/internal/platform/problem"
)

const IdempotencyHeader = "Idempotency-Key"

var (
	ErrIdempotencyInProgress = errors.New("idempotency key in progress")
	ErrIdempotencyMismatch   = errors.New("idempotency key reused with different request")
)

type Stored struct {
	Status int
	Body   []byte
}

type IdempotencyStore interface {
	Begin(ctx context.Context, principalID, key, fingerprint string) (*Stored, error)
	Complete(ctx context.Context, principalID, key string, s Stored) error
	Release(ctx context.Context, principalID, key string) error
}

var validKey = regexp.MustCompile(`^[A-Za-z0-9_-]{8,128}$`)

const maxStoredBody = 64 << 10

type capture struct {
	http.ResponseWriter
	status int
	buf    bytes.Buffer
}

func (c *capture) WriteHeader(code int) {
	c.status = code
	c.ResponseWriter.WriteHeader(code)
}

func (c *capture) Write(b []byte) (int, error) {
	if c.status == 0 {
		c.status = http.StatusOK
	}
	if c.buf.Len() < maxStoredBody {
		c.buf.Write(b)
	}
	return c.ResponseWriter.Write(b)
}

func Idempotency(store IdempotencyStore) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := r.Header.Get(IdempotencyHeader)
			p, authed := PrincipalFrom(r.Context())
			if key == "" || !authed || store == nil || r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			id := ID(r.Context())
			if !validKey.MatchString(key) {
				problem.Send(w, problem.InvalidIdempotencyKey, id)
				return
			}
			body, err := io.ReadAll(r.Body)
			if err != nil {
				problem.Send(w, problem.BodyTooLarge, id)
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))
			sum := sha256.Sum256(append([]byte(r.Method+" "+r.URL.Path+"\n"), body...))
			stored, err := store.Begin(r.Context(), p.ID, key, hex.EncodeToString(sum[:]))
			switch {
			case errors.Is(err, ErrIdempotencyMismatch):
				problem.Send(w, problem.IdempotencyMismatch, id)
				return
			case errors.Is(err, ErrIdempotencyInProgress):
				problem.Send(w, problem.IdempotencyInProgress, id)
				return
			case err != nil:
				problem.Send(w, problem.Internal, id)
				return
			case stored != nil:
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Idempotent-Replayed", "true")
				w.WriteHeader(stored.Status)
				_, _ = io.Copy(w, bytes.NewReader(stored.Body))
				return
			}
			c := &capture{ResponseWriter: w}
			next.ServeHTTP(c, r)
			ctx := context.WithoutCancel(r.Context())
			if c.status >= 500 || c.status == 0 {
				_ = store.Release(ctx, p.ID, key)
				return
			}
			_ = store.Complete(ctx, p.ID, key, Stored{Status: c.status, Body: c.buf.Bytes()})
		})
	}
}
