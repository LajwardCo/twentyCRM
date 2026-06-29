#!/bin/bash
# Pull-based deploy of the Twenty fork on the hamagan-management box.
# The image is built + pushed to GHCR by CI; here we only pull, retag to the
# name the compose file expects, and (re)start the stack. Env in:
#   IMAGE      full GHCR ref, e.g. ghcr.io/lajwardco/twenty-crm:<sha>
#   REG_USER   GHCR username (github.actor)
#   REG_TOKEN  GHCR token (GITHUB_TOKEN, valid for the run)
set -euo pipefail

IMAGE="${IMAGE:?IMAGE required}"
REG_USER="${REG_USER:?REG_USER required}"
REG_TOKEN="${REG_TOKEN:?REG_TOKEN required}"
DOCKER_DIR=/opt/twenty/packages/twenty-docker

echo ">> login GHCR + pull $IMAGE"
echo "$REG_TOKEN" | docker login ghcr.io -u "$REG_USER" --password-stdin
docker pull "$IMAGE"
docker logout ghcr.io || true

# compose references twentycrm/twenty:${TAG}; retag the pulled image to match
docker tag "$IMAGE" twentycrm/twenty:fork

cd "$DOCKER_DIR"
COMPOSE="docker compose -f docker-compose.yml -f docker-compose.hamagan.yml"

if [ "${RESET_DB:-false}" = "true" ]; then
  echo ">> RESET_DB=true: tearing down stack + WIPING volumes (db + storage)"
  TAG=fork $COMPOSE down -v || true
fi

echo ">> compose up"
TAG=fork $COMPOSE up -d

echo ">> wait for health (first boot runs DB migrations, can take several minutes)"
for i in $(seq 1 90); do
  if curl -fsS -m 4 http://127.0.0.1:3000/healthz >/dev/null 2>&1; then
    echo ">> healthy after $((i*10))s"
    docker compose -f docker-compose.yml -f docker-compose.hamagan.yml ps
    # prune old dangling images to save disk
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 10
done

echo "!! server did not become healthy in time" >&2
docker compose -f docker-compose.yml -f docker-compose.hamagan.yml ps
docker compose -f docker-compose.yml -f docker-compose.hamagan.yml logs --tail=80 server || true
exit 1
