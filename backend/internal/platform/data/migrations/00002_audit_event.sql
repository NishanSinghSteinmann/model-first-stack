-- +goose Up
create table audit_event (
    id bigint generated always as identity primary key,
    at timestamptz not null default now(),
    scope_kind text not null,
    principal_id uuid,
    org_id uuid,
    action text not null check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
    target text not null check (target ~ '^[A-Za-z0-9_.:-]{1,100}$'),
    request_id text,
    meta jsonb not null default '{}'
);

create index audit_event_org_at on audit_event (org_id, at);

create function app.forbid_change() returns trigger
language plpgsql
as $$ begin raise exception 'audit_event is append-only'; end $$;

create trigger audit_event_append_only
before update or delete or truncate on audit_event
for each statement execute function app.forbid_change();

alter table audit_event enable row level security;
alter table audit_event force row level security;

create policy audit_event_insert on audit_event for insert
with check (
    scope_kind = app.scope_kind()
    and principal_id is not distinct from app.principal_id()
    and org_id is not distinct from app.org_id()
);
