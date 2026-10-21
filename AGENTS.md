# AGENTS.md

Rules for humans and coding agents in this repository. Every rule names the check that enforces it.

## Where things live

| Path | Content |
|---|---|
| `architecture/*.yaml` | The model and single source of truth: apps, shells, modules, routes, roles, tables, fields, errors, jobs, infra, security, plan |
| `contracts/` | Generated OpenAPI, never edit by hand |
| `backend/` | Go module. `internal/platform` holds the shells, `internal/modules` the domain modules |
| `web/`, `ios/` | Clients with generated API clients |
| `portal/` | Model explorer, model checks, generators, MCP server |
| `infra/` | Compose, Caddy, Terraform |

## Commands

| Command | When |
|---|---|
| `make check` | before every commit, 0 errors |
| `make generate` | after every change to routes, roles, tables, fields or error codes |
| `make backend` | before a pull request touching Go |
| `make dev` | local stack |

## Rules

| Rule | Enforced by |
|---|---|
| A change in `architecture/` references a `dec.*` or `#issue` in the commit message | `make arch-change`, CI |
| Every route has a permission or a justified `public` reason | `make check` |
| Every table has an owner module, row level security and a retention period | `make check`, `TestSchemaMatchesModel` |
| Only elements with status `wip`, `built` or `verified` are generated | `make generate` |
| Every field of an active route has a type from `fields.yaml` or a read table | `make generate` |
| List routes use `list: true` and return `{items, next}` with `after` and `limit` | `make generate` |
| Columns with a database default use `default`, columns that never change use `immutable: true` | `make generate`, `TestSchemaMatchesModel` |
| Changing or dropping columns and changing RLS needs a hand-written migration | `make generate` |
| Domain routes live under `/v1`, only additive changes | `oasdiff breaking` in CI |
| Generated code is never edited by hand | `make generate-check` |
| Only the data shell imports the database driver, only the egress shell talks to the outside, only `platform/storage` talks to object storage | depguard |
| A module uses only platform packages, its own store and modules listed in `uses_modules` | generated `.go-arch-lint.yml` |
| No cloud SDKs in the backend, secrets arrive as environment variables | depguard |
| Tests run against real Postgres and S3 in containers, no mocks | review |
| Clients send `X-Client-Version: <type>/<version>`, outdated clients get 426 | `request.MinClientVersion` |
| Machines authenticate only with service keys bound to one organization | `TestServiceKeys`, route matrix |
| `make dev` works from a fresh checkout | Quickstart workflow |
| No secrets in the repository | Gitleaks |
| No code comments except `TO-DO:` lines | review |

## Workflow per feature

1. Model the routes, tables and fields, set them to `wip`, run `make check`.
2. `make generate`, then implement only the generated handler interface.
3. Wire the module in `newRouter` (`backend/internal/platform/app/app.go`).
4. Open a pull request, merge when CI is green, set the status to `built`.
