#!/usr/bin/env bash
set -euo pipefail
pr="$1"
repo="${REPO:?set REPO=owner/name}"
checks() { gh pr checks "$pr" -R "$repo" 2>/dev/null || true; }
until [ -n "$(checks)" ]; do sleep 10; done
while checks | grep -qE "pending|queued|in_progress"; do sleep 15; done
if checks | grep -qvE "	(pass|skipping)	"; then
  checks | grep -vE "	(pass|skipping)	"
  echo "Not all checks are green, not merging"
  exit 1
fi
gh pr merge "$pr" -R "$repo" --squash --delete-branch
