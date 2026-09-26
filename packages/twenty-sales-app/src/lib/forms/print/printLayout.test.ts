import {
  analysePrintability,
  createEmptyFormDefinition,
  createQuestion,
} from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import {
  answerAreaFor,
  buildPrintPages,
  buildPrintQuery,
  clampCopies,
  cssString,
  filledStatus,
  otherTextOf,
  parsePrintOptions,
  selectedChoiceIds,
  sheetReference,
  sheetReferences,
} from './printLayout';

const buildDefinition = () => {
  const definition = createEmptyFormDefinition('fa');
  const uses = { ...createQuestion('yes_no', 'fa', 'نرم‌افزار دارید؟'), id: 'q_uses' };
  const which = {
    ...createQuestion('multi_choice', 'fa', 'کدام؟'),
    id: 'q_which',
    config: {
      choices: [
        { id: 'c_excel', label: { fa: 'اکسل' } },
        { id: 'c_other_app', label: { fa: 'برنامهٔ دیگر' } },
      ],
      allowOther: true,
    },
    visibleWhen: { mode: 'ALL' as const, conditions: [{ questionId: 'q_uses', op: 'eq' as const, value: true }] },
  };
  const staffNote = { ...createQuestion('long_text', 'fa', 'یادداشت کارمند'), id: 'q_staff', audience: 'STAFF_ONLY' as const };
  const photo = { ...createQuestion('file', 'fa', 'عکس دکان'), id: 'q_photo' };
  const image = { kind: 'image' as const, id: 'b_img', imageUrl: 'https://example.com/a.png', imageAlt: { fa: 'لوگو' } };

  definition.pages[0].items = [uses, which, staffNote];
  definition.pages[0].jumps = [
    {
      id: 'j1',
      when: { mode: 'ALL', conditions: [{ questionId: 'q_uses', op: 'eq', value: false }] },
      to: { pageId: 'p2' },
    },
  ];
  definition.pages.push({ id: 'p2', title: { fa: 'تماس' }, items: [image, photo], jumps: [] });

  return definition;
};

describe('print options', () => {
  it('should parse the print query with safe defaults', () => {
    expect(parsePrintOptions('')).toEqual({
      versionNumber: null,
      draft: false,
      copies: 1,
      sheetRefs: false,
      qr: false,
      audience: 'PUBLIC',
      embed: false,
      campaignId: null,
    });
  });

  it('should clamp copies to 1–200', () => {
    expect(parsePrintOptions('copies=0').copies).toBe(1);
    expect(parsePrintOptions('copies=5000').copies).toBe(200);
    expect(parsePrintOptions('copies=abc').copies).toBe(1);
    expect(clampCopies(12.7)).toBe(12);
  });

  it('should round-trip the options the share panel builds', () => {
    const query = buildPrintQuery({ versionNumber: 3, copies: 25, sheetRefs: true, qr: true, audience: 'STAFF' });
    const parsed = parsePrintOptions(query);

    expect(parsed).toMatchObject({ versionNumber: 3, copies: 25, sheetRefs: true, qr: true, audience: 'STAFF' });
  });

  it('should prefer the draft over a version and ignore a malformed campaign id', () => {
    expect(parsePrintOptions('draft&version=2&campaign=../x')).toMatchObject({ draft: true, campaignId: null });
    expect(buildPrintQuery({ draft: true, versionNumber: 2 })).toBe('draft=1');
  });
});

describe('sheet references', () => {
  it('should number sheets S-<code>-0001 onward', () => {
    expect(sheetReference('F1G46-v2', 7)).toBe('S-F1G46-v2-0007');
    expect(sheetReferences('F1G46-v2', 3, true)).toEqual([
      'S-F1G46-v2-0001',
      'S-F1G46-v2-0002',
      'S-F1G46-v2-0003',
    ]);
  });

  it('should print no references for a draft or when disabled', () => {
    expect(sheetReferences(null, 2, true)).toEqual([null, null]);
    expect(sheetReferences('F1-v1', 2, false)).toEqual([null, null]);
  });
});

describe('cssString', () => {
  it('should keep letters, digits and spaces (including Dari)', () => {
    expect(cssString('فرم ۱ Form 2')).toBe('"فرم ۱ Form 2"');
  });

  it('should escape anything that could end the string or rule', () => {
    const escaped = cssString('a"; } body { x: "\\\n');

    expect(escaped).toBe('"a\\22 \\3b  \\7d  body \\7b  x\\3a  \\22 \\5c  "');
    expect(escaped.slice(1, -1)).not.toMatch(/["{};\n]/);
  });
});

describe('print pages', () => {
  it('should number public questions only and keep skip instructions', () => {
    const definition = buildDefinition();
    const analysis = analysePrintability(definition, { audience: 'PUBLIC' });
    const pages = buildPrintPages(definition, 'PUBLIC', analysis, 'fa');
    const questions = pages.flatMap((page) =>
      page.entries.filter((entry) => entry.kind === 'question'),
    );

    expect(questions.map((entry) => entry.id)).toEqual(['q_uses', 'q_which', 'q_photo']);
    expect(questions.map((entry) => (entry.kind === 'question' ? entry.number : 0))).toEqual([1, 2, 3]);
    expect(pages[0].jumps).toHaveLength(1);
    expect(pages[0].jumps[0]).toContain('سؤال ۳');
  });

  it('should include staff questions on the staff version', () => {
    const definition = buildDefinition();
    const analysis = analysePrintability(definition, { audience: 'STAFF' });
    const pages = buildPrintPages(definition, 'STAFF', analysis, 'fa');

    expect(pages[0].entries.map((entry) => entry.id)).toContain('q_staff');
  });

  it('should carry "answer only if" text and paper alternatives', () => {
    const definition = buildDefinition();
    const analysis = analysePrintability(definition, { audience: 'PUBLIC' });
    const pages = buildPrintPages(definition, 'PUBLIC', analysis, 'fa');
    const which = pages[0].entries.find((entry) => entry.id === 'q_which');
    const photo = pages[1].entries.find((entry) => entry.id === 'q_photo');
    const image = pages[1].entries.find((entry) => entry.id === 'b_img');

    expect(which?.kind === 'question' && which.instruction).toContain('فقط در صورتی');
    expect(photo?.kind === 'question' && photo.alternative).toBeTruthy();
    expect(image?.kind === 'block' && image.text).toBe('لوگو');
  });
});

describe('answer areas', () => {
  const definition = buildDefinition();

  it('should draw choice boxes and say when several may be ticked', () => {
    const which = definition.pages[0].items[1];

    if (which.kind !== 'question') throw new Error('fixture');

    expect(answerAreaFor(which, definition, 'fa')).toMatchObject({
      kind: 'choices',
      multiple: true,
      options: [
        { id: 'c_excel', label: 'اکسل' },
        { id: 'c_other_app', label: 'برنامهٔ دیگر' },
      ],
    });
  });

  it('should draw a box per scale point', () => {
    const rating = { ...createQuestion('rating', 'fa', 'امتیاز'), config: { scaleMax: 5 } };
    const scale = { ...createQuestion('opinion_scale', 'fa', 'پیشنهاد'), config: { scaleMin: 0, scaleMax: 10 } };

    expect(answerAreaFor(rating, definition, 'fa')).toMatchObject({ values: [1, 2, 3, 4, 5] });
    expect(answerAreaFor(scale, definition, 'fa')).toMatchObject({ values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
  });

  it('should give text questions their configured writing lines', () => {
    const long = { ...createQuestion('long_text', 'fa', 'توضیح'), print: { answerLines: 4 } };
    const huge = { ...createQuestion('long_text', 'fa', 'توضیح'), print: { answerLines: 99 } };

    expect(answerAreaFor(long, definition, 'fa')).toEqual({ kind: 'lines', count: 4 });
    expect(answerAreaFor(huge, definition, 'fa')).toEqual({ kind: 'lines', count: 12 });
  });
});

describe('filled responses', () => {
  it('should tick the chosen boxes', () => {
    const single = createQuestion('single_choice', 'fa', 'x');
    const multi = createQuestion('multi_choice', 'fa', 'x');
    const yesNo = createQuestion('yes_no', 'fa', 'x');

    expect(selectedChoiceIds(single, { choiceId: 'c_1' })).toEqual(['c_1']);
    expect(selectedChoiceIds(multi, { choiceIds: ['c_1', 'c_2'] })).toEqual(['c_1', 'c_2']);
    expect(selectedChoiceIds(yesNo, false)).toEqual(['no']);
    expect(selectedChoiceIds(yesNo, undefined)).toEqual([]);
  });

  it('should show the "other" text only when other was picked', () => {
    expect(otherTextOf({ choiceId: '__other', otherText: 'Tally' })).toBe('Tally');
    expect(otherTextOf({ choiceId: 'c_1', otherText: 'stale' })).toBe('');
  });

  it('should distinguish skipped by logic from unanswered', () => {
    expect(filledStatus('q_a', {}, ['q_a'])).toBe('skipped');
    expect(filledStatus('q_b', { q_b: '' }, [])).toBe('unanswered');
    expect(filledStatus('q_c', { q_c: false }, [])).toBe('answered');
  });
});
