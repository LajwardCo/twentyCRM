import { describe, expect, it } from 'vitest';

import { type CurrentUser } from '../api/auth';
import { canOpenRouteSection, canSeeMoney, canSeeNavKey, isExternalUser } from './access';

const user = (overrides: Partial<CurrentUser>): CurrentUser => ({
  workspaceMemberId: 'wm-1',
  firstName: 'A',
  lastName: 'B',
  userEmail: 'a@b.c',
  isAdmin: false,
  role: 'seller',
  partner: null,
  ...overrides,
});

const seller = user({});
const admin = user({ role: 'admin', isAdmin: true });
const marketer = user({
  role: 'external',
  partner: { id: 'p-1', name: 'مصطفی علوی', partnerType: 'MARKETER' },
});

describe('isExternalUser', () => {
  it('is true only for an account linked to a partner record', () => {
    expect(isExternalUser(marketer)).toBe(true);
    expect(isExternalUser(seller)).toBe(false);
    expect(isExternalUser(admin)).toBe(false);
  });
});

describe('canSeeNavKey', () => {
  it('leaves the employee nav untouched', () => {
    for (const key of ['today', 'reports', 'catalog', 'admin', 'competitors']) {
      expect(canSeeNavKey(seller, key)).toBe(true);
      expect(canSeeNavKey(admin, key)).toBe(true);
    }
  });

  it('gives an external user only their working screens', () => {
    expect(canSeeNavKey(marketer, 'today')).toBe(true);
    expect(canSeeNavKey(marketer, 'leads')).toBe(true);
    expect(canSeeNavKey(marketer, 'tasks')).toBe(true);
    expect(canSeeNavKey(marketer, 'calendar')).toBe(true);
  });

  it('keeps internal screens out of an external nav', () => {
    for (const key of [
      'reports',
      'catalog',
      'competitors',
      'daily-report',
      'admin',
      'contacts',
    ]) {
      expect(canSeeNavKey(marketer, key)).toBe(false);
    }
  });
});

describe('canOpenRouteSection', () => {
  it('lets an external user open a lead, task and the new-lead form', () => {
    for (const section of ['', 'lead', 'task', 'new', 'note', 'person']) {
      expect(canOpenRouteSection(marketer, section)).toBe(true);
    }
  });

  it('refuses a typed-in internal route', () => {
    for (const section of ['reports', 'admin', 'catalog', 'daily-report']) {
      expect(canOpenRouteSection(marketer, section)).toBe(false);
    }
  });

  it('never restricts employees', () => {
    expect(canOpenRouteSection(seller, 'admin')).toBe(true);
    expect(canOpenRouteSection(admin, 'reports')).toBe(true);
  });
});

describe('canSeeMoney', () => {
  it('hides money from external users only', () => {
    expect(canSeeMoney(marketer)).toBe(false);
    expect(canSeeMoney(seller)).toBe(true);
    expect(canSeeMoney(admin)).toBe(true);
  });
});
