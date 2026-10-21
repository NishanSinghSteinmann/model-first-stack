#!/usr/bin/env bash
set -euo pipefail
base=https://api.localhost:8443
for _ in $(seq 1 60); do
  curl -sfk "$base/livez" >/dev/null && break
  sleep 3
done
fail=0
check() {
  if [ "$2" != "$3" ]; then
    echo "FAIL $1: got $2, want $3"
    fail=1
  fi
}
check "livez" "$(curl -sk "$base/livez")" '{"status":"ok"}'
check "readyz blocked from outside" "$(curl -sk -o /dev/null -w '%{http_code}' "$base/readyz")" 404
check "readyz inside" "$(docker compose -f infra/compose/compose.yaml exec -T edge wget -qO- http://api:8080/readyz)" '{"failed":[],"status":"ok"}'
token=$(curl -sk -X POST -H 'Content-Type: application/json' -d '{}' "$base/auth/v1/signup" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
check "guest sign-in returns a token" "$([ -n "$token" ] && echo yes || echo no)" yes
check "guest lists notes" "$(curl -sk -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $token" "$base/v1/me/notes")" 200
check "guest may not write notes" "$(curl -sk -o /dev/null -w "%{http_code}" -X POST -H "Authorization: Bearer $token" -H "Idempotency-Key: smoke-$RANDOM-$RANDOM" -H "Content-Type: application/json" -d '{"title":"t","body":"b"}' "$base/v1/me/notes")" 403
check "API rejects a broken token" "$(curl -sk -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer x.y.z' "$base/livez")" 401
check "outdated app" "$(curl -sk -o /dev/null -w '%{http_code}' -H 'X-Client-Version: ios/0.9.9' "$base/livez")" 426
check "current app" "$(curl -sk -o /dev/null -w '%{http_code}' -H 'X-Client-Version: ios/1.0.0' "$base/livez")" 200
[ -d web ] && check "web app" "$(curl -sk -o /dev/null -w '%{http_code}' https://app.localhost:8443/)" 200
[ -d web ] && check "config.json" "$(curl -sk https://app.localhost:8443/config.json)" '{"apiUrl":"https://api.localhost:8443","authUrl":"https://api.localhost:8443/auth/v1"}'
[ "$fail" = 0 ] && echo "Quickstart: all checks passed"
exit "$fail"
