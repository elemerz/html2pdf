#!/usr/bin/env bash
set -euo pipefail

# Build without running tests
mvn clean install -DskipTests
