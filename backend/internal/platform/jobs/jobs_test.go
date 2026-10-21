package jobs

import (
	"context"
	"errors"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/riverqueue/river/rivertype"
	"github.com/testcontainers/testcontainers-go/modules/postgres"

	"github.com/example/app/backend/internal/platform/access"
)

var key access.SystemKey

func TestMain(m *testing.M) {
	k, err := access.IssueSystemKey()
	if err != nil {
		panic(err)
	}
	key = k
	os.Exit(m.Run())
}

type contractSigned struct {
	Org        uuid.UUID `json:"org_id"`
	ContractID uuid.UUID `json:"contract_id"`
}

func (contractSigned) EventName() string     { return "contract.signed" }
func (e contractSigned) EventOrg() uuid.UUID { return e.Org }

type immediate struct{}

func (immediate) NextRetry(*rivertype.JobRow) time.Time { return time.Now() }

func database(t *testing.T) string {
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
	url, err := c.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, url); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(ctx, url); err != nil {
		t.Fatalf("second migrate: %v", err)
	}
	return url
}

func publish(t *testing.T, url string, b *Bus, e Event, commit bool) {
	t.Helper()
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = conn.Close(ctx) }()
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if err := b.Publish(ctx, tx, e); err != nil {
		t.Fatal(err)
	}
	if commit {
		err = tx.Commit(ctx)
	} else {
		err = tx.Rollback(ctx)
	}
	if err != nil {
		t.Fatal(err)
	}
}

func TestBus(t *testing.T) {
	url := database(t)
	ctx := context.Background()
	b := NewBus(key)
	var mu sync.Mutex
	got := map[string]access.Scope{}
	Subscribe(b, "invoice", func(_ context.Context, s access.Scope, e contractSigned) error {
		mu.Lock()
		defer mu.Unlock()
		got["invoice:"+e.ContractID.String()] = s
		return nil
	})
	Subscribe(b, "notify", func(_ context.Context, s access.Scope, e contractSigned) error {
		mu.Lock()
		defer mu.Unlock()
		got["notify:"+e.ContractID.String()] = s
		return nil
	})
	var failures atomic.Int32
	Subscribe(b, "flaky", func(context.Context, access.Scope, contractSigned) error {
		failures.Add(1)
		return errors.New("downstream unavailable")
	})
	if err := b.Open(ctx, url, Options{Work: true, RetryPolicy: immediate{}}); err != nil {
		t.Fatal(err)
	}
	defer b.Close()

	org, committed, rolledBack := uuid.New(), uuid.New(), uuid.New()
	publish(t, url, b, contractSigned{Org: org, ContractID: committed}, true)
	publish(t, url, b, contractSigned{Org: org, ContractID: rolledBack}, false)

	if err := b.Drain(ctx, 30*time.Second); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	for _, k := range []string{"invoice:" + committed.String(), "notify:" + committed.String()} {
		s, ok := got[k]
		if !ok {
			t.Fatalf("%s not delivered", k)
		}
		if id, isOrg := s.OrgID(); !isOrg || id != org || s.Principal().Kind != "system" {
			t.Fatalf("%s scope %+v", k, s)
		}
	}
	for k := range got {
		if k == "invoice:"+rolledBack.String() || k == "notify:"+rolledBack.String() {
			t.Fatalf("rolled back event delivered: %s", k)
		}
	}
	if failures.Load() != maxAttempts {
		t.Fatalf("flaky consumer attempts = %d, want %d", failures.Load(), maxAttempts)
	}
	var discarded int
	if err := b.pool.QueryRow(ctx, `select count(*) from river_job where state = 'discarded'`).Scan(&discarded); err != nil || discarded != 1 {
		t.Fatalf("discarded = %d, %v", discarded, err)
	}
}

func TestPublishWithoutSubscribersIsNoop(t *testing.T) {
	b := NewBus(key)
	if err := b.Publish(context.Background(), nil, contractSigned{Org: uuid.New()}); err != nil {
		t.Fatal(err)
	}
}

func TestPublishNeedsOrg(t *testing.T) {
	if err := NewBus(key).Publish(context.Background(), nil, contractSigned{}); err == nil {
		t.Fatal("event without org accepted")
	}
}

func TestDuplicateSubscriptionPanics(t *testing.T) {
	b := NewBus(key)
	fn := func(context.Context, access.Scope, contractSigned) error { return nil }
	Subscribe(b, "invoice", fn)
	defer func() {
		if recover() == nil {
			t.Fatal("duplicate subscription accepted")
		}
	}()
	Subscribe(b, "invoice", fn)
}
