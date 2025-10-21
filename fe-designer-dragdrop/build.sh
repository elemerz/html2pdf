#!/usr/bin/env bash
set -euo pipefail

ng build
sleep 2
ng start
