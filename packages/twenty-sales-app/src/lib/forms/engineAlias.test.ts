import { describe, expect, it } from 'vitest';
import { createEmptyFormDefinition, validateForPublish } from '@shared/surveys';

describe('@shared/surveys alias', () => {
  it('should resolve the shared survey engine from source', () => {
    const definition = createEmptyFormDefinition('fa');

    expect(validateForPublish(definition).errors.map((issue) => issue.code)).toEqual([
      'EMPTY_FORM',
    ]);
  });
});
