import { createEmptyFormDefinition, createQuestion } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { defaultAnswers } from './defaultAnswers';

describe('defaultAnswers', () => {
  it('should shape choice defaults and skip unknown choices', () => {
    const definition = createEmptyFormDefinition('fa');
    const single = createQuestion('single_choice', 'fa', 'a');
    const multi = createQuestion('multi_choice', 'fa', 'b');
    const stale = createQuestion('dropdown', 'fa', 'c');
    const city = createQuestion('short_text', 'fa', 'd');

    single.config.defaultValue = single.config.choices?.[1].id;
    multi.config.defaultValue = [multi.config.choices?.[0].id ?? '', 'c_gone'];
    stale.config.defaultValue = 'c_gone';
    city.config.defaultValue = 'هرات';
    definition.pages[0].items = [single, multi, stale, city];

    expect(defaultAnswers(definition)).toEqual({
      [single.id]: { choiceId: single.config.choices?.[1].id },
      [multi.id]: { choiceIds: [multi.config.choices?.[0].id] },
      [city.id]: 'هرات',
    });
  });
});
