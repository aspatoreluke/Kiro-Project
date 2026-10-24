#!/bin/sh
# Runs a hook command from the repo root, whether Kiro was opened on the repo
# folder (Kiro-Project/) or on its parent folder (where .kiro is a symlink).
# `cd -P` follows the symlink, so we always land in the real repo.
# Usage: sh .kiro/hooks/run-hook.sh <command...>
here="$(cd -P "$(dirname "$0")/../.." 2>/dev/null && pwd -P)"
if [ ! -f "$here/index.html" ]; then
  echo "run-hook: couldn't find the Receipts repo (looked in $here)" >&2
  exit 1
fi
cd "$here" || exit 1
exec "$@"
