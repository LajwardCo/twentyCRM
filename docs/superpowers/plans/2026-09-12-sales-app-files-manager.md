# Sales app Files manager + player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play/view task attachments in place, tag them with a user-defined file type, and manage every file from one filterable screen with inline playback and a detail page.

**Architecture:** Pure helpers in `lib/` (kind detection, type defaults, page merging, next-playable selection) are unit-tested with vitest; `api/files.ts` wraps the attachment GraphQL with a metadata probe that omits `fileType` when the workspace has not been provisioned; React views compose `FilePreview` (one media element, expiry-aware) into a viewer modal, a list with an inline player, and a detail page. Spec: `docs/superpowers/specs/2026-09-12-sales-app-files-manager-design.md`.

**Tech Stack:** React 19, TypeScript, Vite, vitest (jsdom), hash router in `lib/router.ts`, `useCached` SWR cache, `FilterBar`/`useFilters` filter engine, Twenty GraphQL (`coreQuery`/`metadataQuery`).

All paths below are relative to `packages/twenty-sales-app/` unless they start with `tools/`.
Run tests with `npx vitest run <file>`; typecheck with `npx tsc --noEmit`.

---

### Task 1: `lib/fileType.ts` — preview kinds, type options, defaults

**Files:** Create `src/lib/fileType.ts`, `src/lib/fileType.test.ts`, `src/lib/fileStrings.ts`.

- [ ] Test `previewKindOf('ogg')==='audio'`, `('OPUS')`, `('.m4a')`, `('mp4')==='video'`, `('png')==='image'`, `('pdf')==='pdf'`, `('amr')==='none'`, `(null,'call.ogg')==='audio'` (label fallback), `(null,null)==='none'`.
- [ ] Test `FILE_TYPE_OPTIONS` has the 8 values in spec order; `fileTypeLabel('CALL_RECORDING')==='ضبط تماس'`, unknown → 'دیگر'.
- [ ] Test `defaultFileTypeFor(kind)`: audio→CALL_RECORDING, video→MEETING_RECORDING, image→PHOTO, pdf/none→DOCUMENT.
- [ ] Test `isUnplayableOnThisBrowser(kind, extension, userAgent)`: ogg/opus on Safari UA (no Chrome/CriOS) → true; on Chrome → false; mp3 anywhere → false.
- [ ] Implement; export `type PreviewKind = 'audio'|'video'|'image'|'pdf'|'none'`, `type FileTypeValue`, `FILE_TYPE_OPTIONS: {value,label}[]`.
- [ ] `fileStrings.ts`: `export const TFILES = {...}` with every user-facing string for this feature (nav label 'فایل‌ها', column headers, filter labels, viewer/download/delete/confirm/play/next, empty/no-match, unplayable hint, saved/failed toasts, unsupported note).
- [ ] Run tests → pass; commit `feat(sales-app): file kind + type helpers`.

### Task 2: `api/attachments.ts` — schema probe + typed create

**Files:** Modify `src/api/attachments.ts`; create `src/lib/attachmentSchema.ts` + test.

- [ ] `lib/attachmentSchema.ts` (pure): `attachmentSchemaFrom(fieldNames: string[]) → { hasFileType: boolean }`; `attachmentSelection(schema)` returns the GraphQL selection string with ` fileType` only when `hasFileType`; test both branches (string contains / does not contain `fileType`).
- [ ] In `attachments.ts` replace `getAttachmentFileFieldId` with `getAttachmentSchema(): Promise<{ fileFieldId: string; hasFileType: boolean }>` (one cached metadata query, same query text). Keep the old function name as a thin wrapper to avoid touching call sites.
- [ ] `uploadTaskAttachment` gains optional `fileType?: string | null`; included in `createAttachment.data` only when `hasFileType && fileType`.
- [ ] `TaskAttachment` gains `fileType?: string | null`; `fetchTaskAttachments` uses `attachmentSelection`.
- [ ] Typecheck; commit `feat(sales-app): attachment schema probe + fileType on upload`.

### Task 3: `api/files.ts` — list/get/update/delete

**Files:** Create `src/api/files.ts`; `src/lib/filesPage.ts` + test.

- [ ] `FileRecord = TaskAttachment & { createdBy: { name: string|null } | null; targetTask: { id; title } | null; targetOpportunity: { id; name } | null }`.
- [ ] `lib/filesPage.ts` (pure): `mergePages(existing: FileRecord[], next: FileRecord[])` dedupes by id keeping order; `nextPlayableIndex(rows, fromIndex, kindOf)` returns the next index > fromIndex whose kind is audio|video, or null. Tests for both (skips docs, returns null at end, never wraps).
- [ ] `fetchFilesPage({ filter?, after? })`: `attachments(filter:$filter, orderBy:[{createdAt: DescNullsLast}], first: 50, after:$after) { edges { node {...} } pageInfo { hasNextPage endCursor } }` → `{ items, hasMore, endCursor }`.
- [ ] `fetchFile(id)` → `attachment(filter:{id:{eq:$id}})`; `updateFile(id, { name?, fileType? })` → `updateAttachment(id:$id, data:$data){id}` (drop `fileType` when schema lacks it); `deleteFile(id)` → `deleteAttachment(id:$id){id}`.
- [ ] Typecheck; commit `feat(sales-app): files API`.

### Task 4: `components/FilePreview.tsx` + `FileViewerModal.tsx` + `FileTypeSelect.tsx`

**Files:** Create the three components; append CSS to `src/styles.css` (`.file-preview`, `.file-preview audio/video/img/iframe`, `.file-row-player`).

- [ ] `FilePreview({ url, kind, label, extension, autoPlay?, onEnded?, onError? })`: audio → `<audio controls preload="metadata">`; video → `<video controls playsInline>`; image → `<img>`; pdf → `<iframe>`; none/null url → download card (`<a download href>`). When `isUnplayableOnThisBrowser` → hint line + download primary.
- [ ] `FileViewerModal({ attachment, onClose, taskHref?, leadHref? })`: `ModalSheet` titled by `attachmentLabel`; `FilePreview`; meta row (type pill, Jalali date); download link; optional links; records `recordAudit({eventType:'file.view', category:'read', severity:'sensitive', targetType:'attachment', targetId, targetLabel})` once on mount.
- [ ] `FileTypeSelect({ value, onChange, disabled? })`: plain `<select>` over `FILE_TYPE_OPTIONS`.
- [ ] Typecheck; commit `feat(sales-app): file preview, viewer modal, type select`.

### Task 5: Wire the viewer into TaskView chips and the upload modal

**Files:** Modify `src/components/AttachmentChip.tsx`, `src/components/AttachmentUploadModal.tsx`.

- [ ] `AttachmentChip` renders a `<button className="pill stage">` that opens `FileViewerModal` (local state); keeps plain pill when no url. Title tooltip unchanged. Type pill text appended when `fileType` present.
- [ ] `AttachmentUploadModal` device tab: file input → `pendingFile` state + `FileTypeSelect` (default from `defaultFileTypeFor(previewKindOf(ext))`) + "آپلود" button; hidden when schema lacks `fileType` (upload immediately, as today). Uses `getAttachmentSchema()`.
- [ ] Typecheck; commit `feat(sales-app): open attachments in the viewer; pick file type on upload`.

### Task 6: Filters for the Files screen

**Files:** Modify `src/lib/screenFilters.ts` (append), `src/lib/screenFilters.test.ts` (append).

- [ ] `fileFilterFields({ hasFileType, uploaders }) : FilterField<FileRecord>[]`: `type` multiEnum (`serverPath: 'fileType'`, only when hasFileType); `kind` multiEnum with `buildServerFilter` → `{ file: { extension: { in: [...] } } }` from `EXTENSIONS_BY_KIND`; `name` text (`serverPath: 'name'`); `date` dateRange (`serverPath: 'createdAt'`).
- [ ] Tests: `buildGraphQLFilter` shapes for each; `type` field absent when `hasFileType=false`.
- [ ] Commit `feat(sales-app): files screen filter fields`.

### Task 7: `views/FilesView.tsx`

**Files:** Create `src/views/FilesView.tsx`.

- [ ] `useFilters('files', fields, route.query)` + `buildGraphQLFilter`; first page via `useCached('files:'+JSON.stringify(filter))`, further pages in local state via `mergePages`.
- [ ] Table (desktop, `table.leads`) and mobile card list; columns: kind icon, name (link to `#/files/<id>`), type pill, task title → lead name (links), uploader, date, ▶.
- [ ] Inline player: `activeIndex` state; row's ▶ sets it; a `<tr>`/card after the active row mounts `FilePreview autoPlay onEnded={() => setActiveIndex(nextPlayableIndex(...))}`; `autoAdvance` toggle in the toolbar (default on, persisted via `savePref`-free local state).
- [ ] "بارگذاری بیشتر" button when `hasMore`.
- [ ] Commit `feat(sales-app): Files manager screen with inline playback`.

### Task 8: `views/FileDetailView.tsx`

**Files:** Create `src/views/FileDetailView.tsx`.

- [ ] Loads `fetchFile(id)`; `FilePreview` full width; name input + `FileTypeSelect` saved via `updateFile` (toast); links to task/lead; download; delete button → `window.confirm(TFILES.deleteConfirm)` → `deleteFile` → `invalidateCache('files:')` → `navigate('/files')`.
- [ ] Commit `feat(sales-app): file detail page`.

### Task 9: Routes, nav, provisioning script

**Files:** Modify `src/App.tsx`, `src/components/navItems.ts`; create `tools/sales-crm/provision-attachment-file-type.mjs`.

- [ ] `App.tsx`: `section === 'files' && param` → `FileDetailView`, bar = back button to `/files`; `section === 'files'` → `FilesView`.
- [ ] `navItems.ts`: `{ key: 'files', label: TFILES.nav, icon: IconPaperclip }` after `tasks`; add `IconPaperclip` to `icons.tsx` (append). `ROUTE_TO_NAV_KEY` needs nothing (`files` is its own key).
- [ ] Provisioning script cloned from `provision-task-type.mjs` targeting object `attachment`, field `fileType`, label 'File Type', icon 'IconFileDescription', options per spec.
- [ ] Typecheck, full vitest, `npm run build`; commit `feat(sales-app): files routes + nav; provision attachment.fileType`.

### Task 10: Verification

- [ ] Stub harness (`harness-files.html`, gitignored/untracked like `harness-referrer.html`) with stubbed `fetch` returning two audio rows + one image + one pdf; check list, filters, inline play + auto-advance (dispatch `ended`), detail page, viewer modal, TaskView chip.
- [ ] Real run against local dev server (ports 3010/3011): run the provisioning script, upload an `.ogg`, play it in TaskView and in `#/files`.
- [ ] Screenshots; `docs` untouched; push branch, open PR.
