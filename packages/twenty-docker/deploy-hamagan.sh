#!/bin/bash
# Build + deploy the Twenty fork on the hamagan-management box (crm.hamagan.com).
# Invoked over SSH by .github/workflows/deploy-hamagan-crm.yaml after the repo
# has been rsynced to /opt/twenty. Safe to run by hand too.
set -euo pipefail

APP_DIR=/opt/twenty
DOCKER_DIR="$APP_DIR/packages/twenty-docker"
DF="$DOCKER_DIR/twenty/Dockerfile"
TAG=fork

cd "$APP_DIR"

# --- Box-specific workaround -------------------------------------------------
# This host's Docker daemon DNS is misconfigured (daemon.json -> 192.168.203.2,
# unreachable), so build containers can't resolve package registries. We can't
# restart dockerd here (it would blip the Mailu mail stack on the same box), so
# instead point every build RUN step at public resolvers. Idempotent: only
# patches a fresh (rsynced) Dockerfile that doesn't already carry the fix.
if ! grep -q 'etc/resolv.conf' "$DF"; then
  echo ">> patching Dockerfile RUN steps with working DNS"
  python3 - "$DF" <<'PY'
import sys
p = sys.argv[1]
lines = open(p).read().split('\n')
fix = "printf 'nameserver 1.1.1.1\\nnameserver 8.8.8.8\\n' > /etc/resolv.conf && "
out = ['RUN ' + fix + l[4:] if l.startswith('RUN ') and 'resolv.conf' not in l else l
       for l in lines]
open(p, 'w').write('\n'.join(out))
PY
fi

echo ">> building twentycrm/twenty:$TAG"
docker build --target twenty -f "$DF" \
  --build-arg APP_VERSION="${GITHUB_SHA:-manual-$(date +%Y%m%d%H%M)}" \
  -t "twentycrm/twenty:$TAG" .

echo ">> deploying stack"
cd "$DOCKER_DIR"
TAG=$TAG docker compose up -d

echo ">> waiting for health"
for i in $(seq 1 40); do
  if curl -fsS -m 4 http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo ">> healthy after ${i} checks"
    docker compose ps
    exit 0
  fi
  sleep 5
done

echo "!! server did not become healthy in time" >&2
docker compose ps
docker compose logs --tail=60 server || true
exit 1
