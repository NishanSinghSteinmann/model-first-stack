#!/usr/bin/env bash
set -euo pipefail
base="${1:-origin/main}"
if ! git diff --name-only "$base"...HEAD | grep -q '^architecture/'; then
  echo "No model change"
  exit 0
fi
if git log --format=%B "$base"..HEAD | grep -Eq '(dec\.[a-z0-9-]+|#[0-9]+)'; then
  echo "Model change with decision or issue"
  exit 0
fi
echo "architecture/ changed, but no dec.* or #issue in the commit messages"
exit 1
