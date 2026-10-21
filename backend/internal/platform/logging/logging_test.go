package logging

import (
	"bytes"
	"encoding/json"
	"testing"

	"github.com/example/app/backend/internal/platform/config"
)

func TestNewWritesServiceFields(t *testing.T) {
	var buf bytes.Buffer
	New(&buf, config.Config{Service: "api", Version: "1.0.0", Env: config.Prod}).Info("started")
	var line map[string]any
	if err := json.Unmarshal(buf.Bytes(), &line); err != nil {
		t.Fatalf("log line is not JSON: %v", err)
	}
	for k, want := range map[string]string{"service": "api", "version": "1.0.0", "env": "prod", "msg": "started"} {
		if line[k] != want {
			t.Fatalf("%s = %v, want %s", k, line[k], want)
		}
	}
}

func TestDebugOnlyLocal(t *testing.T) {
	var buf bytes.Buffer
	New(&buf, config.Config{Env: config.Prod}).Debug("hidden")
	if buf.Len() != 0 {
		t.Fatalf("debug logged in prod: %s", buf.String())
	}
	New(&buf, config.Config{Env: config.Local}).Debug("shown")
	if buf.Len() == 0 {
		t.Fatal("debug not logged locally")
	}
}
