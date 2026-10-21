#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
check="${1:-}"
out=THIRD_PARTY.md
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

module="$(cd backend && go list -m)"
(cd backend && go run github.com/google/go-licenses/v2@v2.0.1 report ./... 2>/dev/null) | grep -v "^$module" | sort -u > "$tmp/go.csv"
: > "$tmp/web.csv"
if [ -d web ]; then
  (cd web && npm query '.prod' 2>/dev/null) | node -e '
    const own = (n) => n.startsWith("@app/") || n === "app-web"
    const lic = (p) => typeof p.license === "string" ? p.license : (p.license?.type ?? "UNKNOWN")
    const rows = new Set(JSON.parse(require("fs").readFileSync(0, "utf8")).filter((p) => !own(p.name)).map((p) => `${p.name}@${p.version},${lic(p)}`))
    console.log([...rows].sort().join("\n"))' > "$tmp/web.csv"
fi

{
  echo "# Third-party licenses"
  echo
  echo "The MIT license of this repository covers only the code written for it. Everything below keeps its own license. Review these licenses for your use; this list is generated and is not legal advice."
  echo
  echo "Regenerate with \`make licenses\`."
  echo
  echo "## Container images and tools"
  echo
  echo "| Component | License |"
  echo "|---|---|"
  echo "| Caddy, Coraza, OWASP CRS, caddy-ratelimit | Apache-2.0 |"
  echo "| Supabase Auth (GoTrue) | MIT |"
  echo "| Postgres | PostgreSQL License |"
  echo "| SeaweedFS | Apache-2.0 |"
  echo "| Mailpit | MIT |"
  echo "| River (Go library) | MPL-2.0, weak copyleft: changes to River's own files must be published |"
  echo
  echo "## Go modules"
  echo
  echo "| Module | License |"
  echo "|---|---|"
  awk -F, '{print "| " $1 " | " $3 " |"}' "$tmp/go.csv"
  echo
  echo "## npm packages (web, production)"
  echo
  echo "| Package | License |"
  echo "|---|---|"
  awk -F, 'NF {print "| " $1 " | " $2 " |"}' "$tmp/web.csv"
  if ls ios/*Kit/Package.resolved >/dev/null 2>&1; then
    echo
    echo "## Swift packages (see each repository for its license)"
    echo
    grep -h '"location"' ios/*Kit/Package.resolved | sed 's/.*"location" : "\(.*\)".*/- \1/' | sort -u
  fi
} > "$out"

strong=$(cat "$tmp/go.csv" "$tmp/web.csv" | grep -E ',[^,]*(GPL|SSPL|EUPL|OSL|CC-BY-NC|UNKNOWN|Unknown)' || true)
if [ -n "$strong" ]; then
  echo "Strong copyleft, non-commercial or unknown licenses found, review them:"
  echo "$strong"
  [ "$check" = "--check" ] && exit 1
fi
echo "Wrote $out ($(wc -l < "$tmp/go.csv" | tr -d ' ') Go modules, $(wc -l < "$tmp/web.csv" | tr -d ' ') npm packages)"
