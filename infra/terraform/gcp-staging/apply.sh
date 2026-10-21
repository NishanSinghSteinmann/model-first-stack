#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${TF_STATE_BUCKET:?set TF_STATE_BUCKET to an existing GCS bucket for the Terraform state}"
[ -f terraform.tfvars ] || { echo "copy terraform.tfvars.example to terraform.tfvars and fill it in"; exit 1; }
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
tofu init -reconfigure -backend-config="bucket=$TF_STATE_BUCKET" -backend-config=prefix=gcp-staging >/dev/null

echo "1/4 APIs, secrets, registry, service accounts"
tofu apply -auto-approve \
  -target=google_project_service.apis \
  -target=google_secret_manager_secret.all \
  -target=google_secret_manager_secret_version.generated \
  -target=google_artifact_registry_repository.images \
  -target=google_service_account.runtime

project="$(tofu output -json github_variables | python3 -c 'import sys,json; print(json.load(sys.stdin)["GCP_PROJECT"])')"
name="$(tofu output -json github_variables | python3 -c 'import sys,json; print(json.load(sys.stdin)["APP_NAME"])')"

echo "2/4 JWT keys and SMTP placeholder"
add() {
  if ! gcloud secrets versions list "$name-stg-$1" --project "$project" --format="value(name)" --limit 1 | grep -q .; then
    printf '%s' "$2" | gcloud secrets versions add "$name-stg-$1" --project "$project" --data-file=- >/dev/null
    echo "  $name-stg-$1 set"
  fi
}
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
(cd ../../../tools/devkeys && go run . "$tmp/keys.env")
add auth-jwt-keys "$(sed -n "s/^GOTRUE_JWT_KEYS='\(.*\)'$/\1/p" "$tmp/keys.env")"
add auth-jwt-secret "$(sed -n 's/^GOTRUE_JWT_SECRET=//p' "$tmp/keys.env")"
add smtp-password "unset"

echo "3/4 Database"
echo "  Run once as a Postgres superuser on db_host (see docs/managed-postgres.md):"
echo "  tofu output -raw db_setup_sql"
read -r -p "  Press enter when the role and database exist. " _

echo "4/4 Cloud Run, jobs, scheduler, workload identity, GitHub variables"
tofu apply -auto-approve
repo="$(tofu output -json github_variables | python3 -c 'import sys,json; print(json.load(sys.stdin)["GITHUB_REPOSITORY"])')"
tofu output -json github_variables | python3 -c 'import sys,json; [print(k, v) for k, v in json.load(sys.stdin).items() if k != "GITHUB_REPOSITORY"]' | while read -r k v; do
  gh variable set "$k" --repo "$repo" --body "$v"
done
echo "Done. Edge: $(tofu output -raw edge_url)"
if [ "$(tofu output -json dns_records)" != "{}" ]; then
  echo "DNS records:"
  tofu output -json dns_records | python3 -c 'import sys,json; [print("  " + r["type"] + "  " + h + "  ->  " + r["rrdata"]) for h, rs in json.load(sys.stdin).items() for r in rs]'
fi
