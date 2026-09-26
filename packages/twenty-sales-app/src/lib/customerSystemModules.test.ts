import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_SYSTEM_MODULES,
  initialModuleFlags,
  moduleFlagsPayload,
} from './customerSystemModules';

describe('customer-system module flags', () => {
  it('should start the original modules off and the later ones on', () => {
    expect(initialModuleFlags()).toEqual({
      projects: false,
      booking: false,
      custom_pages: false,
      fixed_assets: true,
      subscriptions: true,
      hr: true,
    });
  });

  it('should list every module Core accepts, each once', () => {
    const keys = CUSTOMER_SYSTEM_MODULES.map((module) => module.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['projects', 'booking', 'custom_pages', 'fixed_assets', 'subscriptions', 'hr']);
  });

  it('should always send the original modules, on or off', () => {
    const payload = moduleFlagsPayload({ ...initialModuleFlags(), projects: true });
    expect(payload).toMatchObject({ projects: true, booking: false, custom_pages: false });
  });

  it('should leave later modules out while they stay on', () => {
    expect(moduleFlagsPayload(initialModuleFlags())).toEqual({
      projects: false,
      booking: false,
      custom_pages: false,
    });
  });

  it('should send a later module only when it is switched off', () => {
    const payload = moduleFlagsPayload({ ...initialModuleFlags(), hr: false, subscriptions: false });
    expect(payload.hr).toBe(false);
    expect(payload.subscriptions).toBe(false);
    expect('fixed_assets' in payload).toBe(false);
  });
});
