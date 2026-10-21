package request

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	testIssuer   = "https://auth.test/auth/v1"
	testAudience = "authenticated"
	testSubject  = "6f1c2c1e-3a6b-4c55-9d43-2f1a7b9e0c11"
)

func jwks(t *testing.T, key *ecdsa.PrivateKey) *httptest.Server {
	t.Helper()
	pad := func(b []byte) string {
		out := make([]byte, 32)
		copy(out[32-len(b):], b)
		return base64.RawURLEncoding.EncodeToString(out)
	}
	body, _ := json.Marshal(map[string]any{"keys": []map[string]string{{
		"kty": "EC", "crv": "P-256", "kid": "k1", "alg": "ES256", "use": "sig",
		"x": pad(key.X.Bytes()), "y": pad(key.Y.Bytes()),
	}}})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write(body) }))
	t.Cleanup(srv.Close)
	return srv
}

func sign(t *testing.T, method jwt.SigningMethod, key any, kid string, c jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(method, c)
	tok.Header["kid"] = kid
	s, err := tok.SignedString(key)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func base(mod func(jwt.MapClaims)) jwt.MapClaims {
	c := jwt.MapClaims{"iss": testIssuer, "aud": testAudience, "sub": testSubject, "exp": time.Now().Add(time.Hour).Unix()}
	if mod != nil {
		mod(c)
	}
	return c
}

func TestVerifier(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	other, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	rsaKey, _ := rsa.GenerateKey(rand.Reader, 2048)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	v, err := NewVerifier(ctx, jwks(t, key).URL, testIssuer, testAudience)
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name  string
		token string
		want  Kind
	}{
		{"user", sign(t, jwt.SigningMethodES256, key, "k1", base(nil)), User},
		{"guest", sign(t, jwt.SigningMethodES256, key, "k1", base(func(c jwt.MapClaims) { c["is_anonymous"] = true })), Guest},
		{"expired", sign(t, jwt.SigningMethodES256, key, "k1", base(func(c jwt.MapClaims) { c["exp"] = time.Now().Add(-time.Hour).Unix() })), ""},
		{"no expiry", sign(t, jwt.SigningMethodES256, key, "k1", base(func(c jwt.MapClaims) { delete(c, "exp") })), ""},
		{"wrong issuer", sign(t, jwt.SigningMethodES256, key, "k1", base(func(c jwt.MapClaims) { c["iss"] = "https://evil" })), ""},
		{"wrong audience", sign(t, jwt.SigningMethodES256, key, "k1", base(func(c jwt.MapClaims) { c["aud"] = "anon" })), ""},
		{"subject not uuid", sign(t, jwt.SigningMethodES256, key, "k1", base(func(c jwt.MapClaims) { c["sub"] = "admin" })), ""},
		{"foreign key", sign(t, jwt.SigningMethodES256, other, "k1", base(nil)), ""},
		{"unknown kid", sign(t, jwt.SigningMethodES256, key, "k2", base(nil)), ""},
		{"hmac", sign(t, jwt.SigningMethodHS256, []byte("secret"), "k1", base(nil)), ""},
		{"rsa key not in set", sign(t, jwt.SigningMethodRS256, rsaKey, "k1", base(nil)), ""},
		{"alg none", sign(t, jwt.SigningMethodNone, jwt.UnsafeAllowNoneSignatureType, "k1", base(nil)), ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p, err := v.Verify(tc.token)
			if tc.want == "" {
				if err == nil {
					t.Fatalf("token accepted: %+v", p)
				}
				return
			}
			if err != nil || p.Kind != tc.want || p.ID != testSubject {
				t.Fatalf("got %+v, %v", p, err)
			}
		})
	}
}

func TestAuthenticateSetsPrincipal(t *testing.T) {
	key, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	v, err := NewVerifier(ctx, jwks(t, key).URL, testIssuer, testAudience)
	if err != nil {
		t.Fatal(err)
	}
	var got Principal
	h := Authenticate(v)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) { got, _ = PrincipalFrom(r.Context()) }))
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+sign(t, jwt.SigningMethodES256, key, "k1", base(nil)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK || got.ID != testSubject {
		t.Fatalf("status %d principal %+v", rec.Code, got)
	}
}

type oneKey struct{ p Principal }

func (k oneKey) VerifyKey(_ context.Context, key string) (Principal, error) {
	if key == "sk_good" {
		return k.p, nil
	}
	return Principal{}, ErrInvalidToken
}

func TestServiceKeysNeedAKeyVerifierAndAnOrg(t *testing.T) {
	try := func(keys KeyVerifier, token string) int {
		h := AuthenticateWithKeys(nil, keys)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) }))
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		req.Header.Set("Authorization", "Bearer "+token)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	good := oneKey{Principal{Kind: Service, ID: "k", OrgID: "o"}}
	if code := try(good, "sk_good"); code != http.StatusNoContent {
		t.Fatalf("valid key = %d", code)
	}
	if code := try(good, "sk_bad"); code != http.StatusUnauthorized {
		t.Fatalf("invalid key = %d", code)
	}
	if code := try(nil, "sk_good"); code != http.StatusUnauthorized {
		t.Fatalf("key without verifier = %d", code)
	}
	if code := try(oneKey{Principal{Kind: User, ID: "u"}}, "sk_good"); code != http.StatusUnauthorized {
		t.Fatalf("key verifier returning a user = %d", code)
	}
}
