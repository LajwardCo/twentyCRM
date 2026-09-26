import { analysePrintability } from '../analysePrintability';
import { buildSoftwareSurvey, question } from './surveyFixtures';

describe('analysePrintability', () => {
  it('should number public questions in reading order and leave staff questions out', () => {
    const result = analysePrintability(buildSoftwareSurvey(), {
      audience: 'PUBLIC',
    });

    expect(result.numbering).toEqual({
      q_name: 1,
      q_uses: 2,
      q_which: 3,
      q_how: 4,
      q_interest: 5,
      q_modules: 6,
      q_phone: 7,
      q_employees: 8,
    });
    expect(result.notes.join(' ')).toMatch(/مخصوص کارمندان/);
  });

  it('should write "answer only if" instructions for conditional questions', () => {
    const result = analysePrintability(buildSoftwareSurvey(), {
      audience: 'PUBLIC',
    });

    expect(result.instructions.q_which).toBe(
      'فقط در صورتی پاسخ دهید که پاسخ سؤال ۲ «بلی» است.',
    );
    expect(result.instructions.q_how).toBe(
      'فقط در صورتی پاسخ دهید که پاسخ سؤال ۲ «نخیر» است.',
    );
  });

  it('should turn a jump to an ending into a stop instruction', () => {
    const result = analysePrintability(buildSoftwareSurvey(), {
      audience: 'PUBLIC',
    });

    expect(result.pageInstructions.p1).toEqual([
      'اگر پاسخ سؤال ۵ «علاقه ندارد» است، پرسشنامه همین‌جا تمام است.',
    ]);
  });

  it('should turn a page jump into "go to question N"', () => {
    const definition = buildSoftwareSurvey();

    definition.pages.push({
      id: 'p3',
      title: {},
      items: [question('q_last', 'long_text')],
      jumps: [],
    });
    definition.pages[1].jumps.push({
      id: 'j_skip',
      when: {
        mode: 'ALL',
        conditions: [{ questionId: 'q_employees', op: 'lt', value: 5 }],
      },
      to: { pageId: 'p3' },
    });

    const result = analysePrintability(definition, { audience: 'PUBLIC' });

    expect(result.pageInstructions.p2).toEqual([
      'اگر پاسخ سؤال ۸ کمتر از ۵ است، به سؤال ۹ بروید.',
    ]);
  });

  it('should write English instructions for English forms', () => {
    const result = analysePrintability(buildSoftwareSurvey(), {
      audience: 'PUBLIC',
      language: 'en',
    });

    expect(result.instructions.q_which).toBe(
      'Answer only if your answer to question 2 is "Yes".',
    );
  });

  it('should block printing when public paper logic depends on a staff-only question', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].items.push(
      question('q_after_note', 'short_text', {
        visibleWhen: {
          mode: 'ALL',
          conditions: [{ questionId: 'q_staff_note', op: 'answered' }],
        },
      }),
    );

    expect(
      analysePrintability(definition, { audience: 'PUBLIC' }).blockers,
    ).toHaveLength(1);
    expect(
      analysePrintability(definition, { audience: 'STAFF' }).blockers,
    ).toHaveLength(0);
  });

  it('should give paper alternatives for digital-only questions', () => {
    const definition = buildSoftwareSurvey();

    definition.pages[1].items.push(
      question('q_photo', 'file'),
      question('q_where', 'location'),
    );

    const result = analysePrintability(definition, { audience: 'PUBLIC' });

    expect(result.paperAlternatives.q_photo).toMatch(/ضمیمه/);
    expect(result.paperAlternatives.q_where).toMatch(/نشانی/);
  });

  it('should note that answer-specific endings exist only online', () => {
    const definition = buildSoftwareSurvey();

    definition.endings[1].when = {
      mode: 'ALL',
      conditions: [{ questionId: 'q_uses', op: 'eq', value: true }],
    };

    expect(
      analysePrintability(definition, { audience: 'PUBLIC' }).notes.join(' '),
    ).toMatch(/آنلاین/);
  });
});
