import { describe, expect, it } from 'vitest';

import {
  addJalaliMonths,
  getJalaliMonthLength,
  gregorianToJalali,
  jalaliToGregorian,
} from './jalali';

describe('jalaliToGregorian', () => {
  it('round-trips through gregorianToJalali across a wide date range', () => {
    for (let gy = 1990; gy <= 2035; gy++) {
      for (const [gm, gd] of [
        [1, 1],
        [3, 20],
        [6, 15],
        [9, 30],
        [12, 31],
      ] as const) {
        const j = gregorianToJalali(gy, gm, gd);
        const back = jalaliToGregorian(j.jy, j.jm, j.jd);
        expect(back).toEqual({ gy, gm, gd });
      }
    }
  });

  it('matches known reference dates (Nowruz on the Gregorian calendar)', () => {
    expect(jalaliToGregorian(1400, 1, 1)).toEqual({ gy: 2021, gm: 3, gd: 21 });
    expect(jalaliToGregorian(1403, 1, 1)).toEqual({ gy: 2024, gm: 3, gd: 20 });
    expect(jalaliToGregorian(1404, 1, 1)).toEqual({ gy: 2025, gm: 3, gd: 21 });
  });
});

describe('getJalaliMonthLength', () => {
  it('returns 31 for the first six months (حمل..سنبله)', () => {
    for (let jm = 1; jm <= 6; jm++) {
      expect(getJalaliMonthLength(1404, jm)).toBe(31);
    }
  });

  it('returns 30 for months 7-11 (میزان..دلو)', () => {
    for (let jm = 7; jm <= 11; jm++) {
      expect(getJalaliMonthLength(1404, jm)).toBe(30);
    }
  });

  it('returns 30 for حوت (Esfand) in known leap years', () => {
    expect(getJalaliMonthLength(1403, 12)).toBe(30);
    expect(getJalaliMonthLength(1399, 12)).toBe(30);
  });

  it('returns 29 for حوت (Esfand) in known non-leap years', () => {
    expect(getJalaliMonthLength(1402, 12)).toBe(29);
    expect(getJalaliMonthLength(1404, 12)).toBe(29);
  });
});

describe('addJalaliMonths', () => {
  it('rolls forward into the next year', () => {
    expect(addJalaliMonths(1403, 12, 1)).toEqual({ jy: 1404, jm: 1 });
  });

  it('rolls backward into the previous year', () => {
    expect(addJalaliMonths(1404, 1, -1)).toEqual({ jy: 1403, jm: 12 });
  });

  it('handles multi-year jumps in both directions', () => {
    expect(addJalaliMonths(1403, 6, 14)).toEqual({ jy: 1404, jm: 8 });
    expect(addJalaliMonths(1403, 6, -30)).toEqual({ jy: 1400, jm: 12 });
  });
});
