-- +goose Up
create table service_key (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null,
    name text not null check (length(name) between 1 and 100),
    secret_hash text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
    roles text[] not null,
    created_at timestamptz not null default now(),
    expires_at timestamptz,
    revoked_at timestamptz
);

alter table service_key enable row level security;
alter table service_key force row level security;

create policy service_key_org on service_key
using (org_id = app.org_id())
with check (org_id = app.org_id());

grant select (id, org_id, name, roles, created_at, expires_at, revoked_at) on service_key to app;
grant insert (org_id, name, secret_hash, roles, expires_at) on service_key to app;
grant update (revoked_at) on service_key to app;

-- +goose StatementBegin
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'key_lookup') then
        create role key_lookup nologin;
    end if;
end $$;
-- +goose StatementEnd

grant key_lookup to current_user;
grant usage on schema app to key_lookup;
grant select (id, org_id, secret_hash, roles, expires_at, revoked_at) on service_key to key_lookup;

create policy service_key_lookup on service_key for select to key_lookup using (true);

create function app.verify_service_key(key_id uuid, hash text) returns table (org_id uuid, roles text[])
language sql stable security definer set search_path = pg_catalog, public
as $$
    select k.org_id, k.roles from public.service_key k
    where k.id = key_id and k.secret_hash = hash and k.revoked_at is null and (k.expires_at is null or k.expires_at > now())
$$;

alter function app.verify_service_key(uuid, text) owner to key_lookup;
revoke all on function app.verify_service_key(uuid, text) from public;
grant execute on function app.verify_service_key(uuid, text) to app;
