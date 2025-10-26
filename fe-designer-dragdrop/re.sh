#!/usr/bin/env bash
set -euo pipefail

./clean-full.sh
npm i -f
ng serve
