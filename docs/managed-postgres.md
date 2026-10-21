# Managed Postgres

The migration run (`app migrate` with `DB_APP_PASSWORD` and `DB_AUTH_PASSWORD`) ensures these roles:

| Role | Purpose |
|---|---|
| `app` | API and jobs. Never owns tables, row level security applies. |
| `supabase_auth_admin` | Supabase Auth, owns the schema `auth`. |
| `postgres` | NOLOGIN only. A Supabase Auth migration grants privileges to it. |
| `key_lookup` | NOLOGIN, owns `app.verify_service_key`. |

Requirement: the migration user (`owner`) may create roles.

- **Cloud SQL:** users created through the API belong to `cloudsqlsuperuser` and may create roles. `postgres` already exists.
- **STACKIT PostgreSQL Flex:** create the user with the roles `login`, `createdb` and `createrole`. If `postgres` already exists, the bootstrap skips it.
- **Your own server:** once as a superuser: `create role owner login createrole password '…'; create database app owner owner;`.

If the migration user may not create `postgres`, the run stops with a pointer to this page. An admin then runs `create role postgres nologin;` once.

The API refuses to start when its role is a superuser or may bypass row level security (`data.Open`).
