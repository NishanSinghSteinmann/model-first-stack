-- +goose Up
create table note (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null,
    title text not null,
    body text not null,
    created_at timestamptz not null default now()
);

alter table note enable row level security;

alter table note force row level security;

create policy note_scope on note
using (owner_id = app.principal_id())
with check (owner_id = app.principal_id());

grant select, insert, update, delete on note to app;
