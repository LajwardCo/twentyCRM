// The Files feature depends on a custom `attachment.fileType` SELECT field
// that prod only gets once tools/sales-crm/provision-attachment-file-type.mjs
// has run. A query naming a field the server does not have fails as a whole
// and blanks the screen, so every query and mutation is shaped from this
// probe instead of assuming the field is there.

export type AttachmentSchema = {
  hasFileType: boolean;
};

export const attachmentSchemaFrom = (fieldNames: string[]): AttachmentSchema => ({
  hasFileType: fieldNames.includes('fileType'),
});

export const attachmentSelection = (schema: AttachmentSchema): string =>
  [
    'id',
    'name',
    'createdAt',
    schema.hasFileType ? 'fileType' : null,
    'file { fileId label extension url }',
  ]
    .filter((field): field is string => field !== null)
    .join('\n            ');

export const withFileType = <TInput extends Record<string, unknown>>(
  input: TInput,
  schema: AttachmentSchema,
  fileType: string | null | undefined,
): TInput & { fileType?: string } =>
  schema.hasFileType && fileType ? { ...input, fileType } : input;
