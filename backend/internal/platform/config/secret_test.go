package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"testing"
)

func TestSecretNeverPrints(t *testing.T) {
	s := NewSecret("postgres://app:hunter2@db/app")
	j, _ := json.Marshal(map[string]any{"db": s})
	var logs bytes.Buffer
	slog.New(slog.NewJSONHandler(&logs, nil)).Info("x", slog.Any("db", s), slog.Any("cfg", Config{DatabaseURL: s}))
	for _, out := range []string{fmt.Sprint(s), fmt.Sprintf("%v %+v %#v %s", s, s, s, s), string(j), logs.String(), fmt.Sprintf("%+v", Config{DatabaseURL: s})} {
		if strings.Contains(out, "hunter2") {
			t.Fatalf("secret leaked: %s", out)
		}
	}
	if s.Reveal() != "postgres://app:hunter2@db/app" || !s.IsSet() {
		t.Fatal("Reveal broken")
	}
}
