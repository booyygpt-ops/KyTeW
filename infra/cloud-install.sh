#!/usr/bin/env bash
set -euo pipefail
cd /workspace/KyTeW
export NPM_CONFIG_CACHE=/workspace/.npm-cache
export XDG_CACHE_HOME=/workspace/.cache
if [ -n "${HTTPS_PROXY:-}" ]; then
  export ELECTRON_GET_USE_PROXY=1
  export GLOBAL_AGENT_HTTP_PROXY="$HTTPS_PROXY"
fi
if [ ! -f .env ]; then cp .env.example .env; fi
npm ci
npm run db:generate
LIVEKIT_NODE_IP=127.0.0.1 npm run voice:setup
docker compose --profile voice up -d --wait
npm run db:migrate
npm run build
