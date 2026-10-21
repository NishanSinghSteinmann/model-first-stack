-- +goose Up
-- +goose StatementBegin
do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'app') then
        raise exception 'role app is missing, create it before migrating (terraform or compose init)';
    end if;
end $$;
-- +goose StatementEnd

grant usage on schema app to app;
grant select, insert on audit_event to app;
grant select, insert, update, delete on idempotency_key to app;
