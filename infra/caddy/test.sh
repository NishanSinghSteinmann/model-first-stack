#!/usr/bin/env bash
set -euo pipefail
image="${1:-edge:ci}"
name="edge-test-$$"
docker run -d --name "$name" -p 127.0.0.1:18080:8080 \
  -e ADMIN_HOST=http://admin.test:8080 -e API_HOST=http://api.test:8080 \
  -e APP_HOST=http://app.test:8080 -e COCKPIT_HOST=http://cockpit.test:8080 \
  -e ADMIN_ALLOW=203.0.113.7/32 -e TRUSTED_PROXIES=private_ranges "$image" >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
until curl -s -o /dev/null http://127.0.0.1:18080; do sleep 1; done
fail=0
check() {
  local want="$1" host="$2" xff="$3" path="$4" got
  got=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: $host" ${xff:+-H "X-Forwarded-For: $xff"} "http://127.0.0.1:18080$path")
  if [ "$got" != "$want" ]; then
    echo "FAIL $host$path XFF=[$xff]: got $got, want $want"
    fail=1
  fi
}
check 404 admin.test "" /config.json
check 200 admin.test "203.0.113.7" /config.json
check 404 admin.test "203.0.113.7, 198.51.100.9" /config.json
check 200 admin.test "198.51.100.9, 203.0.113.7" /config.json
check 404 admin.test "198.51.100.9" /config.json
check 404 api.test "198.51.100.9" /admin/x
check 404 api.test "198.51.100.9" /v1/admin/orgs
check 404 api.test "203.0.113.7" /readyz
if docker run --rm --entrypoint test "$image" -f /srv/app/index.html; then
  check 200 app.test "198.51.100.9" /
fi
check 200 cockpit.test "198.51.100.9" /config.json
check 403 api.test "198.51.100.9" "/livez?q=%27%20OR%201%3D1--"
[ "$fail" = 0 ] && echo "Edge: all checks passed"
exit "$fail"
