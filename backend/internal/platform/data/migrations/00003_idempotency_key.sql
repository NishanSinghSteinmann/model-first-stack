-- +goose Up
create table idempotency_key (
    principal_id uuid not null,
    key text not null check (key ~ '^[A-Za-z0-9_-]{8,128}$'),
    fingerprint text not null,
    status int,
    body bytea,
    created_at timestamptz not null default now(),
    primary key (principal_id, key)
);

alter table idempotency_key enable row level security;
alter table idempotency_key force row level security;

create policy idempotency_key_owner on idempotency_key
using (principal_id = app.principal_id())
with check (principal_id = app.principal_id());
