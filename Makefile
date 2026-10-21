.PHONY: generate generate-check web web-dev ios dev dev-down dev-reset backend backend-migrations backend-test backend-lint backend-vuln portal licenses init check drift release-check arch-change metrics terms

portal:
	cd portal && npx vite

check:
	cd portal && npx tsx scripts/check-model.ts

drift:
	cd portal && npx tsx scripts/drift.ts

OAPI_CODEGEN = github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@v2.8.0
SQLC = github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1

generate:
	cd portal && npx tsx scripts/generate.ts && npx tsx scripts/gen-tokens.ts
	if [ -d web ]; then cd web && npm run --silent generate; fi
	for d in ios/*Kit; do [ -d "$$d" ] && cp contracts/openapi.yaml "$$d"/Sources/*API/openapi.yaml || true; done
	cd backend && go run $(OAPI_CODEGEN) -config internal/api/oapi.yaml ../contracts/openapi.yaml
	cd backend && if [ -f sqlc.yaml ]; then go run $(SQLC) generate; fi
	cd backend && gofmt -w internal && go mod tidy

generate-check: generate
	@git diff --exit-code -- contracts backend portal/src web ios design || (echo "Generated code is stale: run make generate and commit" && exit 1)
	@test -z "$$(git status --porcelain --untracked-files=all -- contracts backend web/packages ios)" || (git status --porcelain -- contracts backend web/packages ios && echo "New generated files are not committed" && exit 1)

release-check:
	cd portal && npx tsx scripts/release-check.ts $(R)

arch-change:
	portal/scripts/check-arch-change.sh

metrics:
	cd portal && npx tsx scripts/metrics.ts

terms:
	cd portal && npx tsx scripts/terms.ts

licenses:
	tools/licenses.sh

init:
	tools/init.sh "$(NAME)" "$(CLIENTS)"

backend-test:
	cd backend && go vet ./... && go test -race -count=1 ./...

backend-lint:
	cd backend && golangci-lint run ./... && go run github.com/fe3dback/go-arch-lint@v1.19.0 check --project-path .

backend-vuln:
	cd backend && go run golang.org/x/vuln/cmd/govulncheck@v1.9.0 ./...

backend-migrations:
	npx -y squawk-cli@2.70.0 --config .squawk.toml backend/internal/platform/data/migrations/*.sql

backend: backend-test backend-lint backend-vuln backend-migrations

web:
	cd web && npm run typecheck && npm test && npm run build

web-dev:
	cd web && npm run dev -w @app/app-$(or $(A),app)

ios:
	cd ios/*Kit && swift build && swift test

dev:
	cd tools/devkeys && go run . ../../infra/compose/.env
	docker compose -f infra/compose/compose.yaml up --build -d
	@echo "API: https://api.localhost:8443  Web: https://app.localhost:8443 cockpit.localhost:8443 admin.localhost:8443  Mails: http://localhost:8025"

dev-down:
	docker compose -f infra/compose/compose.yaml down

dev-reset:
	docker compose -f infra/compose/compose.yaml down -v
