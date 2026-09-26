import { createEmptyFormDefinition, createQuestion } from '@shared/surveys';
import { describe, expect, it } from 'vitest';

import { summariseQuestions } from './errorSummary';
import { pendingUploads, rewriteUploadRefs, uploadRef } from './fileRefs';
import {
  buildPaperReviewNotes,
  collectionDateToIso,
  exactIlikePattern,
  normalizePaperReference,
  parsePaperMeta,
  withoutUnclear,
} from './paperEntry';
import { applyCrmPrefill, parseCollectLinks, resolveResponseLinks } from './prefill';
import { staffResponseName } from './responseName';
import { EMPTY_VISIT, parseVisitState } from './visitState';
import {
  clearStaffDraft,
  draftHasContent,
  loadStaffDraft,
  newStaffDraft,
  saveStaffDraft,
  staffDraftKey,
} from './staffDraft';
import {
  availableVisitOutcomes,
  outcomeCollectsSurvey,
  reconcileOutcome,
  visitTaskTitle,
} from './visitOutcome';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const PERSON_ID = '22222222-2222-4222-8222-222222222222';

const memoryStorage = () => {
  const map = new Map<string, string>();

  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  };
};

const crmDefinition = () => {
  const definition = createEmptyFormDefinition('fa');

  definition.pages[0].items = [
    { ...createQuestion('crm_company', 'fa', 'کسب‌وکار'), id: 'q_company' },
    { ...createQuestion('crm_contact', 'fa', 'مخاطب'), id: 'q_contact' },
    { ...createQuestion('short_text', 'fa', 'نام'), id: 'q_name' },
    { ...createQuestion('yes_no', 'fa', 'نرم‌افزار؟'), id: 'q_uses' },
  ];

  return definition;
};

describe('staff draft', () => {
  it('should reuse the stored submission key and response id', () => {
    const storage = memoryStorage();
    const key = staffDraftKey('form-1', 'v-1');
    const draft = { ...newStaffDraft('v-1'), responseId: 'r-1', answers: { q_name: 'x' } };

    saveStaffDraft(storage, key, draft);

    const restored = loadStaffDraft(storage, key, 'v-1');

    expect(restored?.submissionKey).toBe(draft.submissionKey);
    expect(restored?.responseId).toBe('r-1');
    expect(restored?.fieldData.buyingInterest).toBeNull();
  });

  it('should not restore a draft made for another version', () => {
    const storage = memoryStorage();
    const key = staffDraftKey('form-1', 'v-1');

    saveStaffDraft(storage, key, newStaffDraft('v-1'));

    expect(loadStaffDraft(storage, key, 'v-2')).toBeNull();
  });

  it('should sanitise field data from storage', () => {
    const storage = memoryStorage();

    storage.setItem(
      'k',
      JSON.stringify({
        ...newStaffDraft('v'),
        fieldData: { buyingInterest: 'MAYBE', city: 3, area: 'Shahr-e Naw', location: { source: 'GPS', lat: 1, lng: 2 } },
        attachments: { f1: 'a1', f2: 7 },
      }),
    );

    const restored = loadStaffDraft(storage, 'k', 'v');

    expect(restored?.fieldData).toEqual({
      buyingInterest: null,
      city: '',
      area: 'Shahr-e Naw',
      location: { source: 'GPS', lat: 1, lng: 2 },
    });
    expect(restored?.attachments).toEqual({ f1: 'a1' });
  });

  it('should report whether a draft is worth restoring', () => {
    expect(draftHasContent(newStaffDraft('v'))).toBe(false);
    expect(draftHasContent({ ...newStaffDraft('v'), answers: { q: 1 } })).toBe(true);
    expect(draftHasContent({ ...newStaffDraft('v'), fieldData: { buyingInterest: 'INTERESTED', city: '', area: '', location: null } })).toBe(true);
  });

  it('should clear a draft', () => {
    const storage = memoryStorage();

    saveStaffDraft(storage, 'k', newStaffDraft('v'));
    clearStaffDraft(storage, 'k');

    expect(storage.map.size).toBe(0);
  });
});

describe('staff file references', () => {
  const file = (ref: string) => ({ ref, name: `${ref}.jpg`, mimeType: 'image/jpeg', sizeBytes: 10 });

  it('should list files that still wait for an attachment', () => {
    expect(
      pendingUploads({
        q_photo: [file(uploadRef('f1')), file('attachment:a0')],
        q_doc: [file(uploadRef('f2'))],
        q_name: 'text',
      }),
    ).toEqual([
      { questionId: 'q_photo', fileId: 'f1', name: 'upload:f1.jpg' },
      { questionId: 'q_doc', fileId: 'f2', name: 'upload:f2.jpg' },
    ]);
  });

  it('should rewrite attached uploads and keep the rest', () => {
    const answers = { q_photo: [file(uploadRef('f1')), file(uploadRef('f2'))], q_name: 'x' };
    const rewritten = rewriteUploadRefs(answers, { f1: 'a1' });

    expect((rewritten.q_photo as { ref: string }[]).map((entry) => entry.ref)).toEqual([
      'attachment:a1',
      'upload:f2',
    ]);
    expect(rewritten.q_name).toBe('x');
  });

  it('should return the same object when nothing changed', () => {
    const answers = { q_name: 'x' };

    expect(rewriteUploadRefs(answers, { f1: 'a1' })).toBe(answers);
  });
});

describe('collection links and CRM prefill', () => {
  it('should accept only UUIDs from the URL', () => {
    expect(parseCollectLinks(`companyId=${COMPANY_ID}&personId=nope&visitId=`)).toEqual({
      companyId: COMPANY_ID,
      personId: null,
      opportunityId: null,
      campaignId: null,
      visitId: null,
    });
  });

  it('should prefill empty CRM pickers without overwriting a choice', () => {
    const definition = crmDefinition();
    const answers = applyCrmPrefill(
      definition,
      { q_contact: { recordId: 'chosen', label: 'Chosen' } },
      {
        company: { recordId: COMPANY_ID, label: 'Noor Pharmacy' },
        person: { recordId: PERSON_ID, label: 'Ahmad' },
      },
    );

    expect(answers.q_company).toEqual({ recordId: COMPANY_ID, label: 'Noor Pharmacy' });
    expect(answers.q_contact).toEqual({ recordId: 'chosen', label: 'Chosen' });
    expect(answers.q_name).toBeUndefined();
  });

  it('should link the records the collection started from, else the picked ones', () => {
    const definition = crmDefinition();
    const answers = {
      q_company: { recordId: 'picked-company', label: 'P' },
      q_contact: { recordId: 'picked-person', label: 'Q' },
    };

    expect(
      resolveResponseLinks(definition, answers, {
        companyId: COMPANY_ID,
        personId: null,
        opportunityId: null,
        campaignId: null,
        visitId: null,
      }),
    ).toEqual({ companyId: COMPANY_ID, personId: 'picked-person', opportunityId: null });
  });
});

describe('visit outcome', () => {
  it('should only offer "survey completed" when a survey is chosen', () => {
    expect(availableVisitOutcomes(false)).not.toContain('COMPLETED');
    expect(availableVisitOutcomes(true)[0]).toBe('COMPLETED');
  });

  it('should collect a survey only for a completed visit with a survey', () => {
    expect(outcomeCollectsSurvey('COMPLETED', true)).toBe(true);
    expect(outcomeCollectsSurvey('DECLINED', true)).toBe(false);
    expect(outcomeCollectsSurvey('COMPLETED', false)).toBe(false);
  });

  it('should drop "completed" when the survey is deselected', () => {
    expect(reconcileOutcome('COMPLETED', false)).toBeNull();
    expect(reconcileOutcome('DECLINED', false)).toBe('DECLINED');
  });

  it('should title the visit task after the business', () => {
    expect(visitTaskTitle(' Noor Pharmacy ')).toBe('بازدید: Noor Pharmacy');
    expect(visitTaskTitle('')).toBe('بازدید: کسب‌وکار');
  });
});

describe('paper entry', () => {
  it('should leave unclear answers empty', () => {
    expect(withoutUnclear({ q_name: 'x', q_uses: true }, new Set(['q_uses']))).toEqual({ q_name: 'x' });
  });

  it('should list unclear questions by printed number, then the transcriber notes', () => {
    const definition = crmDefinition();
    const notes = buildPaperReviewNotes({
      definition,
      unclearIds: new Set(['q_uses', 'q_name']),
      numbering: { q_company: 1, q_contact: 2, q_name: 3, q_uses: 4 },
      notes: '  Sheet torn at the bottom ',
      language: 'fa',
      unclearLine: (question) => `${question}: ناخوانا`,
    });

    expect(notes).toBe('• ۳. نام: ناخوانا\n• ۴. نرم‌افزار؟: ناخوانا\n\nSheet torn at the bottom');
  });

  it('should produce no notes when nothing is unclear', () => {
    expect(
      buildPaperReviewNotes({
        definition: crmDefinition(),
        unclearIds: new Set(),
        numbering: {},
        notes: '',
        language: 'fa',
        unclearLine: (question) => question,
      }),
    ).toBe('');
  });

  it('should store sheet references with Latin digits', () => {
    expect(normalizePaperReference(' S-F1G46-v2-۰۰۰۷ ')).toBe('S-F1G46-v2-0007');
  });

  it('should escape ilike wildcards in a sheet reference', () => {
    expect(exactIlikePattern('S_1%')).toBe('S\\_1\\%');
  });

  it('should store the collection date at local noon', () => {
    const iso = collectionDateToIso('2026-09-20');

    expect(iso).not.toBeNull();
    expect(new Date(iso as string).getDate()).toBe(20);
    expect(new Date(iso as string).getHours()).toBe(12);
    expect(collectionDateToIso('garbage')).toBeNull();
  });
});

describe('staff response name', () => {
  it('should prefer the mapped business name, then the linked business, then the fallback', () => {
    const definition = crmDefinition();

    definition.crmMapping = [{ id: 'm1', questionId: 'q_name', field: 'company.name' }];

    expect(staffResponseName(definition, { q_name: ' Noor ' }, { companyLabel: 'Linked', fallback: 'F' })).toBe('Noor');
    expect(staffResponseName(definition, {}, { companyLabel: 'Linked', fallback: 'F' })).toBe('Linked');
    expect(staffResponseName(definition, {}, { fallback: 'F' })).toBe('F');
  });
});

describe('visit state', () => {
  it('should resume a visit in progress', () => {
        const state = {
      ...EMPTY_VISIT,
      step: 'outcome',
      company: { id: COMPANY_ID, label: 'Noor' },
      formId: 'none',
      outcome: 'DECLINED',
      visitId: 'task-1',
    };

    expect(parseVisitState(JSON.stringify(state))).toEqual(state);
  });

  it('should not resume a finished visit or one without a business', () => {
    
    expect(parseVisitState(JSON.stringify({ ...EMPTY_VISIT, step: 'done', company: { id: 'c', label: 'x' } }))).toBeNull();
    expect(parseVisitState(JSON.stringify({ ...EMPTY_VISIT, step: 'survey' }))).toBeNull();
    expect(parseVisitState('nope')).toBeNull();
  });

  it('should drop unknown outcomes and steps', () => {
        const parsed = parseVisitState(JSON.stringify({ step: 'teleport', outcome: 'GREAT', company: null }));

    expect(parsed?.step).toBe('business');
    expect(parsed?.outcome).toBeNull();
  });
});

describe('paper meta', () => {
  it('should restore sheet details and fall back to today for a bad date', () => {
    const restored = parsePaperMeta(
      JSON.stringify({ collectedDate: 'x', collectorId: 'm1', paperReference: 'S-1', notes: 'n', unclearIds: ['q_a', 3] }),
      '2026-09-26',
    );

    expect(restored).toEqual({
      collectedDate: '2026-09-26',
      collectorId: 'm1',
      paperReference: 'S-1',
      notes: 'n',
      unclearIds: ['q_a'],
    });
    expect(parsePaperMeta(null, '2026-09-26').collectedDate).toBe('2026-09-26');
    expect(parsePaperMeta('[', '2026-09-26').unclearIds).toEqual([]);
  });
});

describe('error summary', () => {
  it('should name rejected questions by number in form order', () => {
    const definition = crmDefinition();

    expect(summariseQuestions(definition, ['q_uses', 'q_name'], { audience: 'PUBLIC', language: 'fa' })).toBe(
      '۱. نام، ۲. نرم‌افزار؟',
    );
    expect(summariseQuestions(definition, ['q_uses'], { audience: 'STAFF', language: 'en' })).toBe('4. نرم‌افزار؟');
  });
});
