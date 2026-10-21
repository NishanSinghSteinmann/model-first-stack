package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"

	"github.com/example/app/backend/internal/platform/access"
)

const (
	maxAttempts     = 5
	discardedKeep   = 30 * 24 * time.Hour
	drainQuietRound = 2
)

type Event interface {
	EventName() string
	EventOrg() uuid.UUID
}

type eventArgs struct {
	Consumer string          `json:"consumer"`
	Name     string          `json:"name"`
	OrgID    uuid.UUID       `json:"org_id"`
	Payload  json.RawMessage `json:"payload"`
}

func (eventArgs) Kind() string { return "event" }

type handler func(ctx context.Context, s access.Scope, payload json.RawMessage) error

type Bus struct {
	key      access.SystemKey
	handlers map[string]map[string]handler
	client   *river.Client[pgx.Tx]
	pool     *pgxpool.Pool
}

func NewBus(key access.SystemKey) *Bus {
	return &Bus{key: key, handlers: map[string]map[string]handler{}}
}

func Subscribe[E Event](b *Bus, consumer string, fn func(ctx context.Context, s access.Scope, e E) error) {
	var zero E
	name := zero.EventName()
	if b.handlers[name] == nil {
		b.handlers[name] = map[string]handler{}
	}
	if _, dup := b.handlers[name][consumer]; dup {
		panic(fmt.Sprintf("jobs: %s already subscribed to %s", consumer, name))
	}
	b.handlers[name][consumer] = func(ctx context.Context, s access.Scope, payload json.RawMessage) error {
		var e E
		if err := json.Unmarshal(payload, &e); err != nil {
			return err
		}
		return fn(ctx, s, e)
	}
}

type Options struct {
	Work        bool
	RetryPolicy river.ClientRetryPolicy
	Logger      *slog.Logger
}

func (b *Bus) Open(ctx context.Context, url string, opts Options) error {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return err
	}
	cfg := &river.Config{
		DiscardedJobRetentionPeriod: discardedKeep,
		RetryPolicy:                 opts.RetryPolicy,
		Logger:                      opts.Logger,
	}
	if opts.Work {
		workers := river.NewWorkers()
		river.AddWorker(workers, &eventWorker{bus: b})
		cfg.Workers = workers
		cfg.Queues = map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: 10}}
		cfg.FetchPollInterval = 200 * time.Millisecond
		cfg.FetchCooldown = 50 * time.Millisecond
	}
	client, err := river.NewClient(riverpgxv5.New(pool), cfg)
	if err != nil {
		pool.Close()
		return err
	}
	b.client, b.pool = client, pool
	return nil
}

func (b *Bus) Close() {
	if b.pool != nil {
		b.pool.Close()
	}
}

func (b *Bus) Publish(ctx context.Context, tx pgx.Tx, e Event) error {
	if e.EventOrg() == uuid.Nil {
		return errors.New("jobs: event needs an org")
	}
	consumers := b.handlers[e.EventName()]
	if len(consumers) == 0 {
		return nil
	}
	payload, err := json.Marshal(e)
	if err != nil {
		return err
	}
	params := make([]river.InsertManyParams, 0, len(consumers))
	for consumer := range consumers {
		params = append(params, river.InsertManyParams{
			Args:       eventArgs{Consumer: consumer, Name: e.EventName(), OrgID: e.EventOrg(), Payload: payload},
			InsertOpts: &river.InsertOpts{MaxAttempts: maxAttempts},
		})
	}
	_, err = b.client.InsertManyTx(ctx, tx, params)
	return err
}

func (b *Bus) Run(ctx context.Context) error {
	if err := b.client.Start(ctx); err != nil {
		return err
	}
	<-ctx.Done()
	stop, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return b.client.Stop(stop)
}

func (b *Bus) Drain(ctx context.Context, limit time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, limit)
	defer cancel()
	if err := b.client.Start(ctx); err != nil {
		return err
	}
	defer func() {
		stop, cancelStop := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancelStop()
		_ = b.client.Stop(stop)
	}()
	quiet := 0
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	for quiet < drainQuietRound {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-tick.C:
		}
		var due int
		if err := b.pool.QueryRow(ctx,
			`select count(*) from river_job where state in ('available', 'running') or (state in ('scheduled', 'retryable') and scheduled_at <= now())`,
		).Scan(&due); err != nil {
			return err
		}
		if due == 0 {
			quiet++
		} else {
			quiet = 0
		}
	}
	return nil
}

func Migrate(ctx context.Context, url string) error {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return err
	}
	defer pool.Close()
	m, err := rivermigrate.New(riverpgxv5.New(pool), nil)
	if err != nil {
		return err
	}
	_, err = m.Migrate(ctx, rivermigrate.DirectionUp, nil)
	return err
}

type eventWorker struct {
	river.WorkerDefaults[eventArgs]
	bus *Bus
}

func (w *eventWorker) Work(ctx context.Context, job *river.Job[eventArgs]) error {
	h, ok := w.bus.handlers[job.Args.Name][job.Args.Consumer]
	if !ok {
		return river.JobCancel(fmt.Errorf("jobs: no consumer %s for %s", job.Args.Consumer, job.Args.Name))
	}
	s, err := w.bus.key.OrgScope(job.Args.OrgID)
	if err != nil {
		return river.JobCancel(err)
	}
	return h(ctx, s, job.Args.Payload)
}
