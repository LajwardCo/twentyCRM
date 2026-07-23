# Sales App — Task file upload: modal with Upload + QR-to-mobile tabs

Date: 2026-07-23
Status: Approved (design), implementation in progress
Worktree/branch: `worktree-feature+sales-app-qr-upload` (isolated from the concurrent agent's worktrees)

## Problem

On a task ([`TaskView.tsx`](../../../packages/twenty-sales-app/src/views/TaskView.tsx)) a seller can attach a file via a single "آپلود فایل" button. We want:

1. Clicking upload opens a **modal with two tabs**:
   - **آپلود فایل** — pick a file from the current (desktop/authenticated) device.
   - **اسکن با موبایل** — show a QR code; the seller scans it with their phone, a **public** page opens, and they upload files (camera/gallery) straight into this task.
2. The public page must be **secure**: no CRM access, no auth leak.

## Constraints & context

- `packages/twenty-sales-app` is a static Vite + React SPA served under `/sales/` on the same origin as `twenty-server` (`crm.hamagan.com`). It has **no backend of its own**. RTL Persian/Dari UI, Vazirmatn font, Jalali dates.
- The authenticated upload path already exists: `uploadTaskAttachment` → `uploadFilesFieldFile` (multipart, requires auth) + `createAttachment` ([`api/attachments.ts`](../../../packages/twenty-sales-app/src/api/attachments.ts)).
- `twenty-server` already provides the primitives for a secure public flow: `JwtWrapperService` with typed tokens (`JwtTokenTypeEnum`), a `PublicEndpointGuard`, and a signed-token-in-URL pattern (`FileByIdGuard` verifying a `FILE` token).
- A truly public (unauthenticated) mobile upload page **must** hit a backend endpoint — `uploadFilesFieldFile` requires auth. Embedding the seller's own access token in the QR would be a serious security hole (full-access, long-lived token exposed in a URL/screenshot). Rejected.

## Chosen approach (confirmed with user)

- **Token model:** short-lived signed JWT (~20 min), upload-only, scoped to one task + workspace member. Mirrors the existing `FILE` token pattern. No new DB table.
- **Link scope:** the QR link accepts **multiple** uploads until it expires (sellers in the field snap several photos/docs).

## Architecture

### Backend (`packages/twenty-server`)

1. **New JWT token type** `UPLOAD` added to `JwtTokenTypeEnum`. Payload:
   `{ type: UPLOAD, sub: <workspaceMemberId>, workspaceId, workspaceMemberId, taskId, opportunityId? }`, `expiresIn` ~20 min (new config `TASK_UPLOAD_TOKEN_EXPIRES_IN`, default `20m`).
2. **Mint (authenticated)** — GraphQL mutation `generateTaskUploadToken(taskId: String!)` on the /metadata schema (guarded by `WorkspaceAuthGuard`, same as `uploadFilesFieldFile`). It:
   - verifies the caller's workspace can access the task (task record exists in the caller's workspace),
   - signs the JWT with the caller's `workspaceId` + `workspaceMemberId` + `taskId`,
   - returns `{ token, expiresAt, taskLabel }`.
3. **Consume (public)** — `POST /public/task-upload` in a new controller, guarded by `PublicEndpointGuard` (+ `NoPermissionGuard`). Multipart body: `file` + `token`. It:
   - verifies the JWT and **strictly checks `payload.type === UPLOAD`** (an `ACCESS`/`FILE`/`REFRESH` token is rejected — prevents token confusion),
   - rejects expired tokens (JWT `exp`),
   - **validates the file**: max size (config `TASK_UPLOAD_MAX_FILE_SIZE`, default ~25 MB) and an **allowlisted MIME/extension set** (images, pdf, audio, common office docs); executables/scripts rejected,
   - resolves the `attachment.file` `fieldMetadataId` for `payload.workspaceId`, uploads bytes via `FilesFieldService.uploadFile`, then creates an `attachment` workspace record (`name`, `file: [{ fileId, label }]`, `targetTaskId`, optional `targetOpportunityId`) using a workspace-scoped repository obtained from the workspaceId (no request context),
   - returns `{ ok: true, taskLabel }` (echoes only the task label — no other CRM data),
   - is **rate-limited** (per-IP) using the codebase's throttling mechanism.

### Frontend (`packages/twenty-sales-app`)

1. **`components/AttachmentUploadModal.tsx`** — two-tab modal (RTL, Lajward tokens).
   - Tab 1 "آپلود فایل": reuses the existing `uploadTaskAttachment` flow (file input, uploading state, error banner).
   - Tab 2 "اسکن با موبایل": on open, calls `generateTaskUploadToken(taskId)`, builds `PUBLIC_UPLOAD_URL` = `${origin}/sales/#/upload?t=<jwt>`, renders a QR **generated client-side** (new `qrcode` dependency — never a third-party QR-image API, which would leak the token). Shows an expiry countdown and a "تازه‌سازی کد" (refresh) action to re-mint. While open, polls `fetchTaskAttachments(taskId)` (~4 s) so files uploaded from the phone appear live, with a subtle "new file arrived" cue.
2. **`views/PublicUploadView.tsx`** — standalone, login-free, mobile-first RTL view.
   - Reads token from the hash query (`#/upload?t=...`).
   - `<input type="file" accept=... capture>` for camera/gallery; supports selecting/uploading several files.
   - Uploads each via `uploadViaPublicToken(file, token)` → `POST /public/task-upload`.
   - Per-file progress + success/error; friendly expired-token message. Shows only the task label returned by the server — no task details, no CRM chrome, no nav.
3. **`App.tsx` route interception** — at the **top of render**, before the `session.status` gate ([`App.tsx:132`](../../../packages/twenty-sales-app/src/App.tsx#L132)): if `route.parts[0] === 'upload'`, return `<PublicUploadView/>` regardless of auth state. Bootstrapping/`fetchCurrentUser` must be skipped for this route.
4. **`api/attachments.ts`** — add:
   - `generateTaskUploadToken(taskId)` → authenticated GraphQL (on /metadata), returns `{ token, expiresAt, taskLabel }`.
   - `uploadViaPublicToken(file, token)` → multipart POST to `/public/task-upload`, no auth header.
   - `buildPublicUploadUrl(token)` → pure function (unit-tested).
5. **`TaskView.tsx`** — replace the inline file `<input>` with a button that opens `AttachmentUploadModal`.

## Security properties

- **Blast radius if a QR/URL leaks:** for ≤20 min, the holder can only *attach files to that one task* — no read, no other mutation, no other task, no account/session access.
- Strict token-type check (`UPLOAD` only) prevents using an access/file token on this endpoint and vice-versa.
- Short expiry; multiple uploads within the window (per user choice).
- Server-side file validation (size + MIME allowlist); executables rejected. Per-IP rate limiting on the public endpoint.
- Token never sent to any third party — QR rendered locally; token lives only in the URL fragment (`#`), which browsers do **not** send to the server in the `Referer`/request line.
- Errors do not leak workspace identifiers.

## Testing

- **Frontend (Vitest):** `buildPublicUploadUrl` produces the correct `/sales/#/upload?t=` URL; `App.tsx` renders `PublicUploadView` for `#/upload?t=...` without a session; token countdown/expiry logic.
- **Backend (Jest):** mint mutation rejects a taskId not in the caller's workspace and returns a token for a valid one; public endpoint rejects (a) wrong token type, (b) expired token, (c) oversized file, (d) disallowed MIME; happy path creates an `attachment` linked to `targetTaskId`.

## Deployment (owner: this session, via hamagan-devops)

This feature spans **two** deploy surfaces (unlike prior frontend-only sales-app features):

- **Backend** (`twenty-server`): merge to `main` → GitHub Actions `deploy-hamagan-crm.yaml` builds the image on the runner → GHCR → SSH box → `deploy-hamagan.sh`. (The box can't build Twenty; must go through CI.)
- **Frontend** (`twenty-sales-app`): `vite build` → tar → scp → untar over `/opt/twenty-sales-app/dist` on hamagan-management. No nginx change required for app files.

Notes: the `crm.hamagan.com` vhost already has `client_max_body_size 100m` (fine for uploads). The known `/sales/` `index.html` no-`Cache-Control` gap means sellers can keep the old bundle after a deploy — verify the new hash in a real browser post-deploy; optionally land the `^~ /sales/assets/` + `no-cache` nginx fix. No `provision-*.mjs` needed (uses the existing `attachment` object).

## Out of scope (YAGNI)

- Revocable/audited upload links (persisted table) — deferred; short expiry is sufficient.
- Resumable/chunked uploads, virus scanning, image compression on device.
- Reusing the flow for objects other than tasks.
