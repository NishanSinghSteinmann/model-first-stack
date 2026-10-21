package requesttest

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"github.com/example/app/backend/internal/platform/request"
)

const (
	IssuerURL = "https://auth.test/auth/v1"
	Audience  = "authenticated"
)

type Issuer struct {
	key      *ecdsa.PrivateKey
	Verifier *request.Verifier
}

func NewIssuer(t *testing.T) *Issuer {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pad := func(b []byte) string {
		out := make([]byte, 32)
		copy(out[32-len(b):], b)
		return base64.RawURLEncoding.EncodeToString(out)
	}
	body, _ := json.Marshal(map[string]any{"keys": []map[string]string{{
		"kty": "EC", "crv": "P-256", "kid": "test", "alg": "ES256", "use": "sig",
		"x": pad(key.X.Bytes()), "y": pad(key.Y.Bytes()),
	}}})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(body) }))
	t.Cleanup(srv.Close)
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	v, err := request.NewVerifier(ctx, srv.URL, IssuerURL, Audience)
	if err != nil {
		t.Fatal(err)
	}
	return &Issuer{key: key, Verifier: v}
}

func (i *Issuer) Token(t *testing.T, subject string, anonymous bool) string {
	t.Helper()
	return i.TokenWith(t, subject, map[string]any{"is_anonymous": anonymous})
}

func (i *Issuer) MFAToken(t *testing.T, subject string, at time.Time) string {
	t.Helper()
	return i.TokenWith(t, subject, map[string]any{"aal": "aal2", "amr": []map[string]any{{"method": "password", "timestamp": at.Add(-time.Hour).Unix()}, {"method": "totp", "timestamp": at.Unix()}}})
}

func (i *Issuer) TokenWith(t *testing.T, subject string, extra map[string]any) string {
	t.Helper()
	c := jwt.MapClaims{"iss": IssuerURL, "aud": Audience, "sub": subject, "aal": "aal1", "exp": time.Now().Add(time.Hour).Unix()}
	for k, v := range extra {
		c[k] = v
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodES256, c)
	tok.Header["kid"] = "test"
	s, err := tok.SignedString(i.key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}
