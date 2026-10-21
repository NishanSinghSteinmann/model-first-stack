package notes_test

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/example/app/backend/internal/api"
	"github.com/example/app/backend/internal/modules/notes"
	"github.com/example/app/backend/internal/platform/access"
	"github.com/example/app/backend/internal/platform/data"
	"github.com/example/app/backend/internal/platform/health"
	"github.com/example/app/backend/internal/platform/request"
	"github.com/example/app/backend/internal/platform/request/requesttest"
)

func server(t *testing.T) (http.Handler, *requesttest.Issuer) {
	t.Helper()
	ctx := context.Background()
	c, err := postgres.Run(ctx, "postgres:17-alpine",
		postgres.WithDatabase("app"), postgres.WithUsername("owner"), postgres.WithPassword("owner"),
		postgres.BasicWaitStrategies(),
	)
	if err != nil {
		if os.Getenv("CI") != "" || !strings.Contains(err.Error(), "Cannot connect to the Docker daemon") {
			t.Fatalf("postgres container: %v", err)
		}
		t.Skipf("docker not available: %v", err)
	}
	t.Cleanup(func() { _ = c.Terminate(context.Background()) })
	admin, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	if err := data.Bootstrap(ctx, admin, data.Passwords{App: "app"}); err != nil {
		t.Fatal(err)
	}
	if err := data.Migrate(ctx, admin); err != nil {
		t.Fatal(err)
	}
	appURL, err := url.Parse(admin)
	if err != nil {
		t.Fatal(err)
	}
	appURL.User = url.UserPassword("app", "app")
	db, err := data.Open(ctx, appURL.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	r := access.NewRouter(access.NewModelGrants(nil))
	if err := api.Register(r, api.Handlers{Platform: health.New(time.Second), Notes: notes.New(db)}, slog.New(slog.DiscardHandler)); err != nil {
		t.Fatal(err)
	}
	iss := requesttest.NewIssuer(t)
	return request.Authenticate(iss.Verifier)(r), iss
}

type call struct {
	t     *testing.T
	h     http.Handler
	token string
}

func (c call) do(method, path, body string) (int, map[string]any) {
	c.t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Idempotency-Key", uuid.NewString())
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec.Code, out
}

func TestNotes(t *testing.T) {
	h, iss := server(t)
	alice := call{t, h, iss.Token(t, uuid.NewString(), false)}
	bob := call{t, h, iss.Token(t, uuid.NewString(), false)}
	guest := call{t, h, iss.Token(t, uuid.NewString(), true)}

	code, note := alice.do(http.MethodPost, "/v1/me/notes", `{"title":"Groceries","body":"milk"}`)
	if code != http.StatusOK || note["title"] != "Groceries" || note["created_at"] == nil {
		t.Fatalf("create = %d %v", code, note)
	}
	id := note["id"].(string)
	for i := range 2 {
		alice.do(http.MethodPost, "/v1/me/notes", `{"title":"Note","body":"`+string(rune('a'+i))+`"}`)
	}
	if code, _ := alice.do(http.MethodPost, "/v1/me/notes", `{"title":"x","body":"y","owner_id":"`+uuid.NewString()+`"}`); code != http.StatusBadRequest {
		t.Fatalf("unknown field accepted: %d", code)
	}
	if code, _ := guest.do(http.MethodPost, "/v1/me/notes", `{"title":"x","body":"y"}`); code != http.StatusForbidden {
		t.Fatalf("guest wrote a note: %d", code)
	}

	code, page := alice.do(http.MethodGet, "/v1/me/notes?limit=2", "")
	if code != http.StatusOK || len(page["items"].([]any)) != 2 || page["next"] == nil {
		t.Fatalf("first page = %d %v", code, page)
	}
	code, page = alice.do(http.MethodGet, "/v1/me/notes?limit=2&after="+page["next"].(string), "")
	if code != http.StatusOK || len(page["items"].([]any)) != 1 || page["next"] != nil {
		t.Fatalf("last page = %d %v", code, page)
	}

	if code, n := alice.do(http.MethodPatch, "/v1/me/notes/"+id, `{"body":"milk, eggs"}`); code != http.StatusOK || n["body"] != "milk, eggs" || n["title"] != "Groceries" {
		t.Fatalf("patch = %d %v", code, n)
	}
	if code, _ := bob.do(http.MethodGet, "/v1/me/notes/"+id, ""); code != http.StatusNotFound {
		t.Fatalf("bob read alice's note: %d", code)
	}
	if code, _ := bob.do(http.MethodPatch, "/v1/me/notes/"+id, `{"title":"mine"}`); code != http.StatusNotFound {
		t.Fatalf("bob changed alice's note: %d", code)
	}
	if code, list := bob.do(http.MethodGet, "/v1/me/notes", ""); code != http.StatusOK || len(list["items"].([]any)) != 0 {
		t.Fatalf("bob sees notes: %d %v", code, list)
	}
	if code, _ := alice.do(http.MethodGet, "/v1/me/notes?after=nope", ""); code != http.StatusBadRequest {
		t.Fatalf("invalid cursor = %d", code)
	}
}
