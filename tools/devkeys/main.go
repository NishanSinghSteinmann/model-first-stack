package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: devkeys <env-file>")
		os.Exit(2)
	}
	if _, err := os.Stat(os.Args[1]); err == nil {
		return
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		panic(err)
	}
	b64 := func(b []byte) string {
		out := make([]byte, 32)
		copy(out[32-len(b):], b)
		return base64.RawURLEncoding.EncodeToString(out)
	}
	priv, err := key.Bytes()
	if err != nil {
		panic(err)
	}
	jwk, _ := json.Marshal([]map[string]any{{
		"kty": "EC", "crv": "P-256", "alg": "ES256", "use": "sig", "kid": "local-1",
		"key_ops": []string{"sign", "verify"},
		"x": b64(key.X.Bytes()), "y": b64(key.Y.Bytes()), "d": b64(priv),
	}})
	secret := make([]byte, 32)
	_, _ = rand.Read(secret)
	env := fmt.Sprintf("GOTRUE_JWT_KEYS='%s'\nGOTRUE_JWT_SECRET=%s\n", jwk, hex.EncodeToString(secret))
	if err := os.WriteFile(os.Args[1], []byte(env), 0o600); err != nil {
		panic(err)
	}
}
