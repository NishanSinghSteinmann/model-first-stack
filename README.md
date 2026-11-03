# Model-first Stack

A full-stack template where **the architecture model is the source of truth** and everything that follows from it is generated: API contract, server interfaces with validation, authorization rules, a role × route test matrix, migrations with row level security, typed queries, and TypeScript and Swift clients. You write the model and the domain logic, nothing else.

```
architecture/*.yaml ──make generate──► contracts/openapi.yaml
                                      ├─► Go: handlers to implement, validation, rules, roles, error codes
                                      ├─► Go: route matrix tests (every role × route × foreign organization)
                                      ├─► SQL: migrations, forced RLS policies, sqlc queries
                                      └─► TypeScript client (web) and Swift client (iOS)
design/tokens.json ──────────────────► CSS variables and Swift constants
```

## What is inside

| Part | Stack |
|---|---|
| Model and portal | YAML model, model checks, generators, a web portal to explore it (2D/3D graph, request traces, plan boards) and an MCP server for coding agents |
| Backend | Go, `net/http`, oapi-codegen (strict), pgx, sqlc, goose, River jobs, OpenTelemetry |
| Security | Caddy with Coraza WAF and rate limits, Supabase Auth (guests, email codes, Apple, Google), service keys, step-up auth, forced RLS, append-only audit log, idempotency keys |
| Web | npm workspace: `app`, `cockpit`, `admin` with Vite, React, Tailwind, shadcn and shared packages |
| iOS | Swift package `ExampleKit`: generated client, Supabase session, design tokens |
| Local | Docker Compose: Postgres, Supabase Auth, SeaweedFS (S3), Mailpit, Caddy |
| CI | model check, generated code up to date, no breaking API changes, tests against real Postgres and S3, fuzzing, linters, import rules, vulnerability and secret scans, edge tests, quickstart |
| Staging (optional) | Terraform for Google Cloud Run, deploy on every green merge with SBOM and cosign signatures |

## Quickstart

Requirements: Docker, Go 1.27, Node 24. Swift 6.2 only for the iOS package.

```sh
make init NAME=acme CLIENTS=web,ios   # rename the template, keep the clients you need
make dev                              # local stack
tools/smoke-local.sh                  # 11 end-to-end checks
make portal                           # explore the model
```

Local URLs: `https://app.localhost:8443`, `https://cockpit.localhost:8443`, `https://admin.localhost:8443`, API on `https://api.localhost:8443`, mail on `http://localhost:8025`.

## Building a feature

1. Model it: routes in `architecture/routes.yaml`, tables in `database.yaml`, field types in `fields.yaml`. Set `status: wip`.
2. `make check` validates the model, `make generate` writes contracts, code, migrations, queries, tests and clients.
3. Implement the generated handler interface in `backend/internal/modules/<module>` and wire it in `newRouter`. A missing handler does not compile, a missing module does not start.
4. Open a pull request. CI proves the rest.

The example module `notes` (four routes, one table) shows the whole loop. `planned` elements, like organizations, generate nothing until you set them to `wip`.

## Commands

| Command | Purpose |
|---|---|
| `make check` | validate the model |
| `make generate` / `make generate-check` | regenerate / fail if generated code is stale |
| `make dev` / `make dev-down` / `make dev-reset` | local stack |
| `make backend` | Go tests, linters, import rules, vulnerability scan |
| `make web` / `make ios` | client checks |
| `make portal` | model explorer |

## Staging on Google Cloud (optional)

`infra/terraform/gcp-staging` creates Cloud Run services (edge public, API and auth internal), jobs, a scheduler, secrets, a private bucket and GitHub workload identity. Copy `terraform.tfvars.example`, set `TF_STATE_BUCKET`, run `apply.sh`. Without the GitHub variables the deploy workflow is skipped. Postgres is expected to exist, see `docs/managed-postgres.md`.

## License

Copyright (c) 2026 Nishan Singh Steinmann. All rights reserved. This repository is a reference project, published for viewing only. Using, copying or redistributing it requires prior written permission, see `LICENSE`. Dependencies, container images and tools keep their own licenses, see `THIRD_PARTY.md`.
