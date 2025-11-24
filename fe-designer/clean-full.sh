#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

printf '\n================================\n'
printf 'FULL CLEAN for Angular Project\n'
printf '================================\n'

echo "Stopping node-related processes..."
if command -v pkill >/dev/null 2>&1; then
    pkill -f node >/dev/null 2>&1 || true
else
    echo "pkill not available; skipping process termination."
fi

echo "Deleting node_modules..."
rm -rf node_modules

echo "Deleting package-lock.json..."
rm -f package-lock.json

echo "Deleting dist/, out-tsc/, coverage/, tmp/, .turbo, .nx, .angular..."
for target in dist out-tsc coverage tmp .turbo .nx .angular; do
    rm -rf "$target"
done

echo "Deleting global Angular cache folder..."
rm -rf "${HOME}/.angular"

echo "Cleaning npm cache..."
if command -v npm >/dev/null 2>&1; then
    npm cache clean --force
else
    echo "npm not found; skipping npm cache clean."
fi

echo "Deleting .eslintcache..."
rm -f .eslintcache

printf '\n✅ Angular project has been FULLY cleaned.\n'
printf '================================\n'
