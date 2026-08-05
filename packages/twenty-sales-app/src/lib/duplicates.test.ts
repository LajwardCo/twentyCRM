import { describe, expect, it } from 'vitest';

import {
  classifyMatch,
  type DuplicateMatch,
  nameSimilarity,
  normalizeName,
  phoneKey,
  rankMatches,
} from './duplicates';

describe('normalizeName', () => {
  it('unifies the Arabic and Persian forms of ی and ک', () => {
    // Sellers type on whatever keyboard their phone came with, so the same
    // company arrives spelled both ways.
    expect(normalizeName('كابل')).toBe(normalizeName('کابل'));
    expect(normalizeName('صنايع')).toBe(normalizeName('صنایع'));
  });

  it('drops ZWNJ, tatweel and diacritics', () => {
    expect(normalizeName('شرکت‌ نور')).toBe(normalizeName('شرکت نور'));
    expect(normalizeName('نـــور')).toBe('نور');
    expect(normalizeName('نُور')).toBe('نور');
  });

  it('normalizes Persian digits and collapses whitespace', () => {
    expect(normalizeName('کلینیک  ۲۴')).toBe('کلینیک 24');
  });

  it('strips generic company words so the distinguishing part remains', () => {
    expect(normalizeName('شرکت نور')).toBe('نور');
    expect(normalizeName('نور ltd')).toBe('نور');
    expect(normalizeName('کمپنی نور')).toBe('نور');
  });

  it('keeps the name when it is nothing but generic words', () => {
    // Better to compare "شرکت" against "شرکت" than to compare two empty
    // strings and call every such lead a duplicate.
    expect(normalizeName('شرکت')).toBe('شرکت');
  });

  it('lowercases and strips punctuation for Latin names', () => {
    expect(normalizeName('Hamagan  Co.')).toBe('hamagan');
  });
});

describe('nameSimilarity', () => {
  it('scores the same name as 1 regardless of spelling variant', () => {
    expect(nameSimilarity('شرکت نور', 'نور')).toBe(1);
    expect(nameSimilarity('كابل مارکت', 'کابل مارکت')).toBe(1);
  });

  it('scores a near-miss high', () => {
    expect(nameSimilarity('Hamagan', 'Hamagn')).toBeGreaterThan(0.8);
  });

  it('scores unrelated names low', () => {
    expect(nameSimilarity('نور', 'آریانا')).toBeLessThan(0.4);
  });

  it('scores a shared distinguishing token as a hint, not a match', () => {
    const score = nameSimilarity('کلینیک نور', 'شفاخانه نور');
    expect(classifyMatch({ nameScore: score, exactContact: false })).toBe('weak');
  });

  // "نور" and "کابل" turn up in the names of unrelated businesses, so one
  // shared word must never be strong enough to block a registration.
  it('never treats a single shared word as a strong match', () => {
    const score = nameSimilarity('نور', 'نور ترانسپورت');
    expect(classifyMatch({ nameScore: score, exactContact: false })).toBe('weak');
  });

  it('does treat an almost-complete token match as strong', () => {
    const score = nameSimilarity('کابل مارکت', 'کابل مارکت شمال');
    expect(classifyMatch({ nameScore: score, exactContact: false })).toBe('strong');
  });

  it('treats an empty name as no match', () => {
    expect(nameSimilarity('', 'نور')).toBe(0);
  });
});

describe('phoneKey', () => {
  it('reduces local and international spellings to one key', () => {
    expect(phoneKey('0764993011')).toBe('+93764993011');
    expect(phoneKey('+93 764 993 011')).toBe('+93764993011');
    expect(phoneKey('764993011')).toBe('+93764993011');
    expect(phoneKey('0764-993-011')).toBe('+93764993011');
  });

  it('returns null for anything that is not a number', () => {
    expect(phoneKey('')).toBeNull();
    expect(phoneKey('   ')).toBeNull();
  });
});

describe('classifyMatch', () => {
  it('treats a phone or email hit as exact regardless of the name', () => {
    expect(classifyMatch({ nameScore: 0, exactContact: true })).toBe('exact');
  });

  it('calls a very close name strong and a loose one weak', () => {
    expect(classifyMatch({ nameScore: 0.9, exactContact: false })).toBe('strong');
    expect(classifyMatch({ nameScore: 0.7, exactContact: false })).toBe('weak');
  });

  it('returns null below the weak threshold, so nothing is shown', () => {
    expect(classifyMatch({ nameScore: 0.3, exactContact: false })).toBeNull();
  });
});

describe('rankMatches', () => {
  const match = (
    id: string,
    level: DuplicateMatch['level'],
    score: number,
  ): DuplicateMatch => ({
    id,
    kind: 'lead',
    label: id,
    sub: '',
    score,
    level,
    route: `/lead/${id}`,
  });

  it('puts exact matches first, then strong, then weak', () => {
    const ranked = rankMatches([
      match('weak', 'weak', 0.65),
      match('exact', 'exact', 1),
      match('strong', 'strong', 0.9),
    ]);
    expect(ranked.map((m) => m.id)).toEqual(['exact', 'strong', 'weak']);
  });

  it('collapses the same record found by more than one signal', () => {
    const ranked = rankMatches([
      match('a', 'weak', 0.6),
      match('a', 'exact', 1),
    ]);
    expect(ranked).toHaveLength(1);
    // The stronger signal wins — a phone match is not downgraded by a weak
    // name match on the same record.
    expect(ranked[0].level).toBe('exact');
  });

  it('returns an empty list unchanged', () => {
    expect(rankMatches([])).toEqual([]);
  });
});
