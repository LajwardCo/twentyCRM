# Sales app: file player/viewer, file types, Files manager

Date: 2026-09-12 · Package: `packages/twenty-sales-app` · Branch: `feat/sales-app-files-manager`

## Problem

Task attachments (call recordings in ogg/opus/m4a, photos, PDFs) can only be
downloaded. Sellers and managers want to play/view them in place, tag each file
with what it is (call recording, contract, …), and review files across all
tasks from one screen without opening each task.

## Decisions

### Data: `attachment.fileType` SELECT field
- Provisioned by `tools/sales-crm/provision-attachment-file-type.mjs`
  (pattern: `provision-task-type.mjs`), idempotent.
- Options: `CALL_RECORDING` ضبط تماس · `VOICE_NOTE` یادداشت صوتی ·
  `MEETING_RECORDING` ضبط جلسه · `PHOTO` عکس · `DOCUMENT` سند ·
  `CONTRACT` قرارداد · `QUOTE` پیش‌فاکتور · `OTHER` دیگر.
- The deprecated `type` text column is not used: it is a system field with no
  option list, so it cannot be filtered from Twenty's own UI.
- **Schema-skew guard.** The app already reads attachment field metadata to
  find the `file` field id. That probe also reports whether `fileType` exists.
  When absent: no type picker, no type filter, no type column, and queries/
  mutations never mention the field. Nothing breaks before provisioning.

### Player / viewer
- `lib/fileType.ts` → `previewKindOf(extension, label)`:
  `audio` (mp3 m4a wav ogg oga opus aac) · `video` (mp4 webm mov m4v) ·
  `image` (jpg jpeg png gif webp) · `pdf` · `none` (everything else, incl.
  amr/heic which no browser decodes).
- `components/FilePreview.tsx`: renders `<audio controls>`, `<video controls>`,
  `<img>`, `<iframe>` for pdf, or a download card. Takes the signed URL and an
  `onExpired` callback; on a media `error` event it asks the parent to refetch
  once, then shows "فایل در دسترس نیست".
- `components/FileViewerModal.tsx`: `ModalSheet` with `FilePreview`, name,
  type pill, date, download link, and (when given) a link to the task/lead.
- `AttachmentChip` becomes a button that opens `FileViewerModal` instead of a
  new tab. The download link lives inside the modal.
- Browser limits are stated in-UI, not hidden: on iOS/Safari ogg/opus shows a
  hint under the player that this device cannot decode the format, with
  download as the primary action.
- Signed URLs expire and must never be stored; every viewer render reads from
  the record fetched for that render.

### Type at upload
- `AttachmentUploadModal` (device tab) gets a `FileTypeSelect` above the file
  input, defaulted from the chosen file's kind (audio → CALL_RECORDING,
  image → PHOTO, else DOCUMENT). Sent in `createAttachment.data.fileType`.
- The QR / public mobile upload endpoint is server code and is untouched; those
  files arrive untyped and are typed from the Files manager.

### Files manager
- Route `#/files` (list), `#/files/<id>` (detail). Nav item "فایل‌ها"
  (`IconPaperclip`), internal users only — not added to the external allow
  lists in `lib/access.ts`. Externals keep seeing their own task files inside
  TaskView.
- `api/files.ts`:
  - `fetchFilesPage({ filter, after })` → `{ items, endCursor, hasMore }`,
    `first: 50`, `orderBy: [{ createdAt: DescNullsLast }]`, cursor paging.
    Selection: `id name createdAt fileType file{…} createdBy{name}
    targetTask{id title} targetOpportunity{id name}`.
  - `fetchFile(id)`, `updateFile(id, { name?, fileType? })`,
    `deleteFile(id)` (soft `deleteAttachment` — never `destroy`).
- `views/FilesView.tsx`:
  - Table (desktop) / card list (mobile): kind icon, name, type pill, task →
    lead, uploader, Jalali date, ▶ button for audio/video rows.
  - `FilterBar` with fields from `lib/screenFilters.ts` → `fileFilterFields`:
    `fileType` multiEnum (server `fileType in`, only when provisioned),
    `kind` multiEnum (server `file.extension in` per kind — see note),
    `date` dateRange on `createdAt`, `name` text ilike.
  - Note on `kind`: the `file` composite's `extension` is filterable via
    `{ file: { extension: { in: [...] } } }`; if the server rejects composite
    FILES filtering, `kind` falls back to client-side on the loaded pages and
    is labelled as such. Verified during implementation, not assumed.
  - Inline play: one `FilePreview` mounted at a time, under the active row.
    `ended` → advance to the next playable row (auto-play), wrapping never.
    Any other row's ▶ replaces the active player.
  - "بارگذاری بیشتر" appends the next cursor page.
- `views/FileDetailView.tsx`: full-width `FilePreview`, editable name and
  type (saved on blur/change via `updateFile`), links to task and lead,
  download, soft-delete with confirm → back to `#/files`.
- Audit: opening a viewer records `file.view` (category `access`), download
  clicks already record `file.download` through the global anchor hook; the
  detail delete records through the existing GraphQL mutation hook.

### Strings
- New `lib/fileStrings.ts` exporting `TFILES` (own file, no edit to the shared
  `strings.ts` block list — avoids conflicts with the other agent).

## Files

New: `api/files.ts`, `lib/fileType.ts` (+test), `lib/fileStrings.ts`,
`components/FilePreview.tsx`, `components/FileViewerModal.tsx`,
`components/FileTypeSelect.tsx`, `views/FilesView.tsx`,
`views/FileDetailView.tsx`, `tools/sales-crm/provision-attachment-file-type.mjs`.

Touched (minimal diffs): `App.tsx` (2 routes), `components/navItems.ts` (1 nav
entry + route→nav mapping), `components/AttachmentChip.tsx`,
`components/AttachmentUploadModal.tsx`, `api/attachments.ts` (fileType in
create + probe), `lib/screenFilters.ts` (append `fileFilterFields`),
`lib/attachmentFile.ts` (no change expected), `styles.css` (append only).

## Testing
- Unit (vitest): `previewKindOf`, default-type inference, files filter field
  builders (server clause shapes), cursor page merge, next-playable-row
  selection, schema-skew guard (query text omits `fileType` when absent).
- Browser: stub harness (`harness.html` + stubbed `fetch`) for FilesView,
  FileDetailView, viewer modal, inline play + auto-advance; then a real run
  against the local dev server with an uploaded ogg.
- `tsc --noEmit`, `vitest run`, `vite build`.

## Out of scope
- Range support for local-disk storage on the server (prod is S3, which
  already supports it).
- Typing files from the public QR upload page.
- Transcription / waveform.
