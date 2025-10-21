#!/usr/bin/env bash
set -euo pipefail

# Set terminal title (works in most terminals)
printf '\033]0;%s\007' "HTML2Pdf" || true

# Build, wait 2 seconds, then start
bash ./build.sh
sleep 2
bash ./start.sh
