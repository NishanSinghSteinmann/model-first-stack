#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
name="${1:-}"
clients="${2:-web,ios}"
module="${MODULE:-github.com/example/$name}"
if ! [[ "$name" =~ ^[a-z][a-z0-9-]{1,30}$ ]]; then
  echo "usage: make init NAME=acme [CLIENTS=web,ios] [MODULE=github.com/acme/acme]"
  echo "NAME: lowercase letters, digits and dashes"
  exit 2
fi
if ! grep -q "github.com/example/app/backend" backend/go.mod; then
  echo "init already ran, nothing to do"
  exit 1
fi
for c in ${clients//,/ }; do
  [[ "$c" == web || "$c" == ios ]] || { echo "unknown client $c, use web and/or ios"; exit 2; }
done
pascal="$(echo "$name" | perl -pe 's/(^|-)([a-z])/\U$2/g')"

files() { grep -rlI --null "$1" --exclude-dir=node_modules --exclude-dir=.build --exclude-dir=.git --exclude-dir=dist . || true; }
replace() { files "$1" | xargs -0 perl -pi -e "$2"; }

replace "github.com/example/app" "s#github\\.com/example/app#$module#g"
replace "@app/" "s#\\@app/#\\@$name/#g"
replace "app-web" "s#\\bapp-web\\b#$name-web#g"
replace "ExampleKit\|ExampleAPI\|ExampleAuth\|ExampleDesign" "s#Example(Kit|API|Auth|Design)#$pascal\$1#g"
replace "cmd/app" "s#cmd/app\\b#cmd/$name#g"
perl -pi -e "s#/out/app#/out/$name#g; s#\"/app\"#\"/$name\"#g; s#COPY --from=build /out/$name /app#COPY --from=build /out/$name /$name#" backend/Dockerfile
perl -pi -e "s#usage: app #usage: $name #" backend/cmd/app/main.go
mv backend/cmd/app "backend/cmd/$name"
perl -pi -e "s#^name: app\$#name: $name#" infra/compose/compose.yaml
perl -pi -e "s#default     = \"app\"#default     = \"$name\"#" infra/terraform/gcp-staging/variables.tf
perl -pi -e "s#\"app\\.app\": \"App\"#\"app.app\": \"$pascal\"#; s#\"app\\.cockpit\": \"Cockpit\"#\"app.cockpit\": \"$pascal Cockpit\"#; s#\"app\\.admin\": \"Admin\"#\"app.admin\": \"$pascal Admin\"#" web/packages/i18n/src/en.ts 2>/dev/null || true
if [ -d ios/ExampleKit ]; then
  for d in ios/ExampleKit/Sources/Example* ios/ExampleKit/Tests/Example*; do mv "$d" "$(dirname "$d")/$(basename "$d" | sed "s/^Example/$pascal/")"; done
  mv ios/ExampleKit "ios/${pascal}Kit"
fi

if [[ ",$clients," != *",ios,"* ]]; then
  rm -rf ios .github/workflows/ios.yml
  echo "removed iOS client"
fi
if [[ ",$clients," != *",web,"* ]]; then
  rm -rf web
  perl -0pi -e 's/\n  web:\n.*?\n(  secrets:)/\n$1/s' .github/workflows/ci.yml
  perl -0pi -e 's/FROM node:24-alpine AS web\nWORKDIR \/web\nCOPY web\/ \.\/\nRUN npm ci --no-audit --no-fund && npm run build\n\n//; s/COPY --from=web \/web\/apps\/app\/dist \/srv\/app\nCOPY --from=web \/web\/apps\/cockpit\/dist \/srv\/cockpit\nCOPY --from=web \/web\/apps\/admin\/dist \/srv\/admin\n/RUN mkdir -p \/srv\/app \/srv\/cockpit \/srv\/admin\n/' infra/caddy/Dockerfile
  echo "removed web clients"
fi

(cd backend && go mod tidy >/dev/null)
(cd portal && npm ci --no-audit --no-fund >/dev/null)
if [ -d web ]; then (cd web && rm -rf node_modules && npm install --no-audit --no-fund >/dev/null); fi
make generate >/dev/null
echo "Initialized $name ($module) with clients: $clients"
echo "Next: make check && make dev && tools/smoke-local.sh"
