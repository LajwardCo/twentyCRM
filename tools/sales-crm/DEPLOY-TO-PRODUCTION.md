# Applying the Sales-CRM config to crm.hamagan.com

The app itself already deploys via `.github/workflows/deploy-hamagan-crm.yaml`
(GHCR build → SSH → `docker compose up` on `hamagan-management`, worker
included). **That pipeline ships code, not workspace configuration** — the
custom objects, fields, pipeline stages, the round-robin workflow, and the
saved Views built in this session live in the *database*, not the Docker
image. Nothing in `tools/sales-crm/` needs a code deploy or a CI run; these
scripts just need to run once against the live instance's GraphQL API.

Why this file exists instead of it being done already: the session that built
these scripts could not execute anything touching `hamagan`/production
infrastructure — every attempt (even a read-only public HTTPS check) was
blocked by a safety boundary that applies to that session specifically, not to
what was being run. Run the steps below from a session/terminal that has real
access (e.g. the UsystemsDevOps session, or your own machine).

## What to run, in order

All five scripts are idempotent — safe to re-run, they skip anything that
already exists. They default to the local dev instance (`localhost:3010`); for
crm.hamagan.com, override via env vars.

```bash
export TWENTY_META="https://crm.hamagan.com/metadata"
export TWENTY_ORIGIN="https://crm.hamagan.com"
export TWENTY_EMAIL="<the real admin login for this workspace>"
export TWENTY_PASSWORD="<the real admin password>"

cd /path/to/twentyCRM   # wherever this repo is checked out for the run
node tools/sales-crm/provision-phase1.mjs
node tools/sales-crm/update-stages.mjs
node tools/sales-crm/provision-phase2-objects.mjs
node tools/sales-crm/provision-round-robin-workflow.mjs
node tools/sales-crm/provision-views.mjs
```

Any modern Node (18+) works for these — they're plain `fetch`-based scripts,
no build step, no dependency on the twenty-server dev toolchain.

## What you need to fill in

- **Real admin credentials** for the crm.hamagan.com workspace. This instance
  runs `IS_MULTIWORKSPACE_ENABLED=false` (single-workspace, invite-only after
  the first signup) — use whichever account completed that first signup.
- **Confirm the instance is actually up** first: `curl -I https://crm.hamagan.com`
  and a GraphQL smoke check, same shape as `tools/sales-crm/provision-phase1.mjs`'s
  login flow, before running anything.

## Things already confirmed safe, so you don't have to re-check them

- **The worker is already running in production** (`docker-compose.yml`
  defines a separate `worker` service running `yarn worker:prod`, always-on;
  `docker-compose.hamagan.yml` gives it the same env as the server). The local
  dev gotcha — DATABASE_EVENT triggers silently never firing because no worker
  process is running — does not apply here.
- The provisioning scripts only ever `create*`/`update*` metadata; none of
  them touch existing customer data or delete anything (the one
  `deleteWorkflow`/`destroyWorkflow` pattern used during iteration in this repo
  is not present in the final scripts — check `git diff` if ever unsure before
  running against prod).

## Order matters

`provision-round-robin-workflow.mjs` references the Opportunity object's
`owner` field and `provision-views.mjs` references fields on Task/Opportunity/
Quotation/Subscription — run Phase 1 and Phase 2 object scripts first (as
listed above) so those fields exist.

## After running

Verify the same way this session did: create one real test Opportunity in the
UI (or via a GraphQL mutation), confirm it gets an owner assigned within a few
seconds, then delete the test record. Full verification method is documented
inline in `tools/sales-crm/provision-round-robin-workflow.mjs`.
