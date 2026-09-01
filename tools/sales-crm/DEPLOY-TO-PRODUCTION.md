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

### Competitor Intelligence objects (added 2026-07-06)

Two more idempotent scripts, run in this order (views depend on the objects):

```bash
node tools/sales-crm/provision-competitor-intel.mjs    # Competitor, Competitor Product, Competitor Update, Competitor Usage
node tools/sales-crm/provision-competitor-views.mjs    # 5 saved views for those objects
```

`provision-competitor-intel.mjs` creates the four objects, their fields, and
relations (Competitor Product/Update/Usage → Competitor; Competitor Usage →
Person/Opportunity). `provision-competitor-views.mjs` adds "Competitors by
Threat", "Competitors by Status" (Kanban), "Competitor Products", "Competitor
Updates — Recent", and "Switching Signals". Both are the same env-var shape as
the scripts above.

Any modern Node (18+) works for these — they're plain `fetch`-based scripts,
no build step, no dependency on the twenty-server dev toolchain.

### Daily Reports (added 2026-07-09)

One idempotent script, independent of the others (its only relation target is
`workspaceMember`, which always exists), so it can run any time:

```bash
node tools/sales-crm/provision-daily-report-object.mjs   # dailyReport object + fields + seller relation
```

This creates the `dailyReport` object, its fields (reportDate, summary,
tomorrowPlan, tasksDoneCount, submittedAt) and the `seller` relation to
workspaceMember. **The Daily Report UI ships in the sales-app bundle, but the
object lives in the DB** — if the bundle is deployed without running this on
prod, the "End of Day" report fails at load with
`Unknown type "DailyReportFilterInput"` (the per-object GraphQL filter type
only exists once the object metadata does). Run this on prod, then reload.

### Product brand / category (added 2026-07-25)

One idempotent script, no dependencies beyond the `product` object itself.
Against prod, authenticate with an **API key** (Settings > APIs & Webhooks)
rather than putting an admin password in your shell history:

```bash
TWENTY_META=https://crm.hamagan.com/metadata TWENTY_ORIGIN=https://crm.hamagan.com TWENTY_TOKEN='<api key>' node tools/sales-crm/provision-product-brand-category.mjs
```

Until it runs, the SPA degrades instead of breaking: `catalog.ts` and
`records.ts` request `brand`/`category` and retry without them on the
`Cannot query field "brand"` validation error (mapping both to null), so the
catalog, product detail and deal-line picker keep working — they just show no
taxonomy, and edits to those two fields are dropped. Once the script has run,
the values appear with no redeploy. Remove those fallbacks when every instance
has been provisioned.

### Deal-line rates + multi-currency prices (added 2026-07-25)

One idempotent script, no dependencies beyond the `product` and `dealProduct`
objects. Adds `product.priceBook` (fixed install/annual amounts per currency)
and `dealProduct.priceOverrides` (the currency, fixed amounts and per-metric
rates a seller restated on one line):

```bash
TWENTY_META=https://crm.hamagan.com/metadata TWENTY_ORIGIN=https://crm.hamagan.com TWENTY_TOKEN='<api key>' node tools/sales-crm/provision-line-pricing-multicurrency.mjs
```

Until it runs, the SPA degrades the same way the taxonomy does: it drops both
fields from its queries on the `Cannot query field` error and prices every line
from the catalog, so the second currency column is simply empty and a
negotiated rate typed into the deal-line form is not applied. Nothing breaks,
and no redeploy is needed once the script has run.

> ⚠️ This ordered list predates several later feature waves. Other per-feature
> provisioning scripts now live in `tools/sales-crm/` (contact-request, task
> type, pricing/package model, dashboard, permissions, whatsapp, etc.). Each is
> idempotent and must be run once against prod after its feature's bundle ships
> — a code deploy alone never creates their objects/fields. When a sales-app
> feature errors on prod with an `Unknown type "...FilterInput"` or a missing
> field, the matching `provision-*.mjs` almost certainly hasn't been run there.

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

## Call Companion (Plan A)

Design: `docs/superpowers/specs/2026-08-31-call-companion-design.md`
Plan: `docs/superpowers/plans/2026-08-31-call-companion-server-foundation.md`

### 1. Provision the CallActivity object

```bash
TWENTY_META=https://crm.hamagan.com/metadata \
TWENTY_ORIGIN=https://crm.hamagan.com \
TWENTY_EMAIL=... TWENTY_PASSWORD=... \
node tools/sales-crm/provision-call-activity.mjs
```

Idempotent — safe to rerun. A clean rerun reports `0 created, 14 skipped,
0 failed`.

### 2. Attachment storage — Spaces (BLOCKED on credentials, 2026-09-01)

**Status:** the compose change is deployed and inert. `twenty-server-1` runs
with `STORAGE_TYPE=local`, `STORAGE_S3_REGION=us-east-1` and empty S3 vars,
exactly as intended — the server cannot fail config validation before a bucket
exists. Nothing else is done.

**Blocked because** both the DigitalOcean and Cloudflare tokens in
`UsystemsDevOps/c.txt` return 401 (the Twenty CRM API key in that file still
works). A Spaces bucket also needs its own access key pair, generated
separately from the DO API token. So this needs either a regenerated DO token
or five minutes in the DO console.

**Migration is small:** the existing local attachment volume
(`twenty_server-local-data`) holds **18 files / 2.7 MB**. Copy them into the
bucket before flipping `STORAGE_TYPE`, or those 18 attachments 404 in the CRM.
The box has 81 GB free, so there is no disk pressure forcing the switch — call
audio growth is the reason to do it.

Once a bucket and keys exist, in one SSH session:

```bash
# 1. copy the existing 18 files into the bucket (run from a host with s3 tooling)
docker run --rm -v twenty_server-local-data:/data \
  -e AWS_ACCESS_KEY_ID=<key> -e AWS_SECRET_ACCESS_KEY=<secret> \
  amazon/aws-cli s3 sync /data s3://<bucket>/ --endpoint-url https://<region>.digitaloceanspaces.com

# 2. add the secrets to the box .env (and the GitHub Actions secrets CI upserts from)
#    STORAGE_TYPE=S_3
#    STORAGE_S3_NAME=<bucket>
#    STORAGE_S3_ENDPOINT=https://<region>.digitaloceanspaces.com
#    STORAGE_S3_ACCESS_KEY_ID=<key>
#    STORAGE_S3_SECRET_ACCESS_KEY=<secret>

# 3. restart with the prod project name -- a bare `docker compose up` spins a
#    colliding parallel stack (see references/prod-deploy.md)
docker compose -p twenty up -d server worker

# 4. verify: env applied, health, and a real upload round-trip
docker exec twenty-server-1 sh -lc 'env | grep -E "^STORAGE_(TYPE|S3_NAME|S3_ENDPOINT)"'
curl -s -o /dev/null -w "%{http_code}\n" https://crm.hamagan.com/healthz
```

Then upload a file to any record in the CRM UI and confirm it appears in the
bucket and renders back in the browser. **Leave `STORAGE_S3_REGION` alone** —
it defaults to `us-east-1` because Twenty validates it against
`/^[a-z]{2}-[a-z]+-\d$/`, which DigitalOcean's own slugs (`fra1`, `blr1`) do
not match; the real location comes from the endpoint.

### 2a. Original notes (console steps)

Call audio at roughly 20 agents x 15 calls/day x 4 minutes is about 0.5 GB/day,
so it must not land on the droplet volume that also holds the database.

1. Create a Spaces bucket in `fra1` and generate an access key pair.
2. Add a lifecycle rule expiring objects after **180 days**.
3. Add to the box `.env` and to the GitHub Actions secrets CI upserts from:

   ```
   STORAGE_TYPE=S_3
   STORAGE_S3_NAME=<bucket name>
   STORAGE_S3_ENDPOINT=https://fra1.digitaloceanspaces.com
   STORAGE_S3_ACCESS_KEY_ID=<key>
   STORAGE_S3_SECRET_ACCESS_KEY=<secret>
   ```

`STORAGE_TYPE` defaults to `LOCAL` in `docker-compose.hamagan.yml` on purpose:
setting it to `S_3` before the bucket exists makes the server fail config
validation at boot. Set it only once the values above are in place.

Leave `STORAGE_S3_REGION` alone. It defaults to `us-east-1` because Twenty
validates it against `/^[a-z]{2}-[a-z]+-\d$/`, which DigitalOcean's own slugs
(`fra1`, `ams3`) do not match. The real location comes from the endpoint; the
region is a formality for an S3-compatible service.

**Existing attachments are not migrated by this switch.** Anything already
uploaded lives on the droplet's local volume and stays there; only new uploads
go to Spaces. Copy the old files into the bucket first if historical
attachments must keep resolving.

### 3. Endpoints this adds

- `GET  /rest/sales/phone-index` — the device's match index.
- `POST /rest/sales/call-activities` — idempotent ingest on `deviceCallId`.
- `GET  /rest/sales/call-activity-report?from=&to=` — per-agent daily totals.
