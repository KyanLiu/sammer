#!/usr/bin/env bash
set -euo pipefail
docker compose build server
docker compose push server
