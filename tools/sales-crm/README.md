# Sales-CRM provisioning (Phase 1)

Scripts that build the sales-management data model on a Twenty workspace via the
metadata GraphQL API. See the design in
[`docs/superpowers/specs/2026-07-01-twenty-sales-crm-design.md`](../../docs/superpowers/specs/2026-07-01-twenty-sales-crm-design.md).

## What they do

- `provision-phase1.mjs` — creates custom objects (**Product**, **Partner**,
  **Deal Product**), all their fields, sales fields on **Opportunity** / **Person**,
  and the relations between them. **Idempotent** — skips anything that already exists.
- `update-stages.mjs` — renames the Opportunity pipeline `stage` options to the sales
  process (New Lead → … → Active Customer, plus Lost / Missed).

## Prerequisites

- The `twenty-server` API reachable (default `http://localhost:3010`).
- A login for the target workspace.

## Run

```bash
export PATH="$HOME/.nvm/versions/node/v24.16.0/bin:$PATH"   # local fork uses Node 24
node tools/sales-crm/provision-phase1.mjs
node tools/sales-crm/update-stages.mjs
```

## Config (env vars, with local-fork defaults)

| Var | Default | Notes |
|---|---|---|
| `TWENTY_META` | `http://localhost:3010/metadata` | metadata endpoint |
| `TWENTY_ORIGIN` | `http://localhost:3011` | must match the workspace front-end URL |
| `TWENTY_EMAIL` | `tim@apple.dev` | workspace login |
| `TWENTY_PASSWORD` | `tim@apple.dev` | seeded dev password = the email |

When deploying to a real server later, override these env vars for that workspace.
