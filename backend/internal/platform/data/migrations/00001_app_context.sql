-- +goose Up
create schema if not exists app;

create function app.org_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.org_id', true), '')::uuid $$;

create function app.principal_id() returns uuid
language sql stable
as $$ select nullif(current_setting('app.principal_id', true), '')::uuid $$;

create function app.scope_kind() returns text
language sql stable
as $$ select nullif(current_setting('app.scope_kind', true), '') $$;

grant usage on schema app to public;
