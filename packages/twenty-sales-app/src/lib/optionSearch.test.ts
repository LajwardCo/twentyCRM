import { describe, expect, it } from 'vitest';

import {
  buildSelectRows,
  filterOptions,
  optionMatchesQuery,
} from './optionSearch';

const options = [
  { value: '1', label: 'احمد رضایی', hint: 'معرف' },
  { value: '2', label: 'شرکت احمدی', hint: 'بازاریاب' },
  { value: '3', label: 'Kabul Traders' },
  { value: '4', label: 'حسیب الله' },
];

describe('optionMatchesQuery', () => {
  it('should match every query word in any order', () => {
    expect(optionMatchesQuery(options[1], 'احمد شرکت')).toBe(true);
  });

  it('should match text in the hint as well as the label', () => {
    expect(optionMatchesQuery(options[0], 'معرف')).toBe(true);
  });

  it('should not match when one word is absent', () => {
    expect(optionMatchesQuery(options[0], 'احمد کابل')).toBe(false);
  });

  it('should match regardless of case for latin labels', () => {
    expect(optionMatchesQuery(options[2], 'kabul')).toBe(true);
  });

  it('should treat an empty query as matching everything', () => {
    expect(optionMatchesQuery(options[3], '   ')).toBe(true);
  });

  it('should fold arabic and persian spellings of the same letter', () => {
    // "رضايي" typed on an Arabic keyboard against "رضایی" in the record.
    expect(optionMatchesQuery(options[0], 'رضايي')).toBe(true);
  });
});

describe('filterOptions', () => {
  it('should return every option for an empty query', () => {
    expect(filterOptions(options, '')).toHaveLength(4);
  });

  it('should rank prefix matches above mid-string matches', () => {
    const result = filterOptions(options, 'احمد');
    expect(result.map((option) => option.value)).toEqual(['1', '2']);
  });

  it('should drop options that do not match', () => {
    expect(filterOptions(options, 'حسیب').map((o) => o.value)).toEqual(['4']);
  });
});

describe('buildSelectRows', () => {
  const matches = [options[0], options[1]];

  it('should put the clear row first and the create row last', () => {
    const rows = buildSelectRows({
      matches,
      emptyLabel: '—',
      createLabel: 'افزودن معرف جدید',
      query: '',
    });
    expect(rows.map((row) => row.kind)).toEqual([
      'clear',
      'option',
      'option',
      'create',
    ]);
  });

  it('should omit the clear and create rows when they are not offered', () => {
    const rows = buildSelectRows({ matches, query: '' });
    expect(rows.map((row) => row.kind)).toEqual(['option', 'option']);
  });

  it('should carry the typed name into the create row', () => {
    const rows = buildSelectRows({
      matches: [],
      createLabel: 'افزودن معرف جدید',
      query: '  نجیب الله  ',
    });
    expect(rows).toEqual([
      {
        kind: 'create',
        label: 'افزودن معرف جدید «نجیب الله»',
        name: 'نجیب الله',
      },
    ]);
  });

  // Nothing typed yet: the row still has to be reachable, it just cannot name
  // the record it is about to create.
  it('should keep the create row offerable with an empty query', () => {
    const rows = buildSelectRows({
      matches,
      createLabel: 'افزودن معرف جدید',
      query: '',
    });
    expect(rows.at(-1)).toEqual({
      kind: 'create',
      label: 'افزودن معرف جدید',
      name: '',
    });
  });
});
