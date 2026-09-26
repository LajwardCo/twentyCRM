import { proposeCrmChanges } from '../proposeCrmChanges';
import { buildSoftwareSurvey } from './surveyFixtures';

describe('proposeCrmChanges', () => {
  const definition = buildSoftwareSurvey();
  const answers = {
    q_name: 'Noor Pharmacy',
    q_phone: '0799123456',
    q_modules: { choiceIds: ['c_stock', 'c_sales'] },
  };

  const byField = (existing: Parameters<typeof proposeCrmChanges>[2]) =>
    Object.fromEntries(
      proposeCrmChanges(definition, answers, existing).map((proposal) => [
        proposal.field,
        proposal,
      ]),
    );

  it('should fill empty CRM fields', () => {
    const proposals = byField({});

    expect(proposals['company.name'].action).toBe('FILL');
    expect(proposals['company.name'].proposed).toBe('Noor Pharmacy');
    expect(proposals['opportunity.interest'].proposed).toBe('انبار، فروش');
  });

  it('should flag a differing trusted CRM value as a conflict, not overwrite it', () => {
    expect(
      byField({ 'company.name': 'Nur Pharmacy Ltd' })['company.name'].action,
    ).toBe('CONFLICT');
  });

  it('should treat the same value with different spacing or case as unchanged', () => {
    expect(
      byField({ 'company.name': '  noor   pharmacy ' })['company.name'].action,
    ).toBe('SAME');
  });

  it('should compare phone numbers by their significant digits', () => {
    expect(
      byField({ 'person.phone': '+93 799 123 456' })['person.phone'].action,
    ).toBe('SAME');
  });

  it('should never propose clearing a value when the answer is blank', () => {
    const proposals = Object.fromEntries(
      proposeCrmChanges(definition, {}, { 'company.name': 'Existing' }).map(
        (proposal) => [proposal.field, proposal],
      ),
    );

    expect(proposals['company.name'].action).toBe('SKIP_BLANK');
  });
});
