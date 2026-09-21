import { describe, expect, it } from 'vitest';

import {
  attachmentSchemaFrom,
  attachmentSelection,
  withFileType,
} from './attachmentSchema';

describe('attachmentSchemaFrom', () => {
  it('reports fileType only when the workspace has the provisioned field', () => {
    expect(attachmentSchemaFrom(['name', 'file', 'fileType']).hasFileType).toBe(true);
    expect(attachmentSchemaFrom(['name', 'file']).hasFileType).toBe(false);
  });
});

describe('attachmentSelection', () => {
  it('asks for fileType when it exists', () => {
    const selection = attachmentSelection({ hasFileType: true });
    expect(selection).toContain('fileType');
    expect(selection).toContain('file { fileId label extension url }');
  });

  it('never mentions fileType before provisioning, so the query still validates', () => {
    expect(attachmentSelection({ hasFileType: false })).not.toContain('fileType');
  });
});

describe('withFileType', () => {
  it('adds the field to an input only when the schema has it and a value is given', () => {
    expect(withFileType({ name: 'a' }, { hasFileType: true }, 'PHOTO')).toEqual({
      name: 'a',
      fileType: 'PHOTO',
    });
    expect(withFileType({ name: 'a' }, { hasFileType: false }, 'PHOTO')).toEqual({
      name: 'a',
    });
    expect(withFileType({ name: 'a' }, { hasFileType: true }, null)).toEqual({
      name: 'a',
    });
  });
});
