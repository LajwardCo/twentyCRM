// Hard ceiling for a single file uploaded through the public QR flow (25 MB).
// The public endpoint is unauthenticated (token-gated only), so we keep this
// conservative regardless of the workspace storage limit.
export const TASK_UPLOAD_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

// Per-workspace rate limit for the public upload endpoint (token bucket).
export const TASK_UPLOAD_RATE_LIMIT_MAX_TOKENS = 60;
export const TASK_UPLOAD_RATE_LIMIT_WINDOW_MS = 60 * 1000;

// Allowlisted MIME types. Field photos/scans, PDFs, call recordings, and common
// office documents only — executables, scripts and archives are rejected so a
// leaked link can't be used to stage hostile payloads in a workspace.
export const TASK_UPLOAD_ALLOWED_MIME_TYPES: readonly string[] = [
  // images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  // documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  // audio (call recordings / voice notes)
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/3gpp',
  'audio/amr',
];
