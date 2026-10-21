package request

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/example/app/backend/internal/platform/problem"
)

var ErrInvalidToken = errors.New("invalid token")

type Verifier struct {
	keys     jwt.Keyfunc
	issuer   string
	audience string
}

type claims struct {
	jwt.RegisteredClaims
	IsAnonymous bool   `json:"is_anonymous"`
	AAL         string `json:"aal"`
	AMR         []amr  `json:"amr"`
}

type amr struct {
	Method    string `json:"method"`
	Timestamp int64  `json:"timestamp"`
}

var mfaMethods = map[string]bool{"totp": true, "mfa/totp": true, "mfa/phone": true, "mfa/webauthn": true, "webauthn": true}

func lastMFA(entries []amr) time.Time {
	var last int64
	for _, e := range entries {
		if mfaMethods[e.Method] && e.Timestamp > last {
			last = e.Timestamp
		}
	}
	if last == 0 {
		return time.Time{}
	}
	return time.Unix(last, 0)
}

func NewVerifier(ctx context.Context, jwksURL, issuer, audience string) (*Verifier, error) {
	k, err := keyfunc.NewDefaultCtx(ctx, []string{jwksURL})
	if err != nil {
		return nil, err
	}
	return &Verifier{keys: k.Keyfunc, issuer: issuer, audience: audience}, nil
}

func (v *Verifier) Verify(token string) (Principal, error) {
	var c claims
	_, err := jwt.ParseWithClaims(token, &c, v.keys,
		jwt.WithValidMethods([]string{"ES256", "RS256"}),
		jwt.WithIssuer(v.issuer),
		jwt.WithAudience(v.audience),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(30*time.Second),
	)
	if err != nil {
		return Principal{}, errors.Join(ErrInvalidToken, err)
	}
	if _, err := uuid.Parse(c.Subject); err != nil {
		return Principal{}, errors.Join(ErrInvalidToken, errors.New("subject is not a uuid"))
	}
	kind := User
	if c.IsAnonymous {
		kind = Guest
	}
	return Principal{Kind: kind, ID: c.Subject, AAL: c.AAL, MFAAt: lastMFA(c.AMR)}, nil
}

const ServiceKeyPrefix = "sk_"

type KeyVerifier interface {
	VerifyKey(ctx context.Context, key string) (Principal, error)
}

func Authenticate(v *Verifier) func(http.Handler) http.Handler {
	return AuthenticateWithKeys(v, nil)
}

func AuthenticateWithKeys(v *Verifier, keys KeyVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := r.Header.Get("Authorization")
			if raw == "" {
				next.ServeHTTP(w, r)
				return
			}
			token, ok := strings.CutPrefix(raw, "Bearer ")
			if !ok {
				problem.Send(w, problem.TokenInvalid, ID(r.Context()))
				return
			}
			var p Principal
			var err error
			switch {
			case strings.HasPrefix(token, ServiceKeyPrefix) && keys != nil:
				p, err = keys.VerifyKey(r.Context(), token)
				if err == nil && (p.Kind != Service || p.OrgID == "") {
					err = ErrInvalidToken
				}
			case !strings.HasPrefix(token, ServiceKeyPrefix) && v != nil:
				p, err = v.Verify(token)
			default:
				err = ErrInvalidToken
			}
			if err != nil {
				problem.Send(w, problem.TokenInvalid, ID(r.Context()))
				return
			}
			next.ServeHTTP(w, r.WithContext(withPrincipal(r.Context(), p)))
		})
	}
}
