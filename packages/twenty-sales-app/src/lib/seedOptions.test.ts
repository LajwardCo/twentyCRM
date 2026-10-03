import { describe, expect, it } from 'vitest';

import { seedOptionsFor, seedOptionsPayload, untickedLabels, type SeedOptionKey } from './seedOptions';

const keys = (options: { key: string }[]) => options.map((option) => option.key);

describe('seedOptionsFor', () => {
  it('asks a restaurant about its menu, floor, kitchen and loyalty data', () => {
    const options = keys(seedOptionsFor({ restaurant: true, inventory: true, projects: false }));
    expect(options).toEqual(
      expect.arrayContaining(['restaurant_menu', 'restaurant_floor', 'restaurant_kitchen', 'restaurant_loyalty', 'products']),
    );
    expect(options).not.toContain('projects');
  });

  it('never offers restaurant data, or products without stock, to other businesses', () => {
    const options = keys(seedOptionsFor({ restaurant: false, inventory: false, projects: true }));
    expect(options.some((key) => key.startsWith('restaurant_'))).toBe(false);
    expect(options).not.toContain('products');
    expect(options).toContain('projects');
  });
});

describe('seedOptionsPayload', () => {
  it('sends every shown option, false for the unticked ones', () => {
    const options = seedOptionsFor({ restaurant: true, inventory: false, projects: false });
    const unticked = new Set<SeedOptionKey>(['restaurant_floor']);
    const payload = seedOptionsPayload(options, unticked);
    expect(payload.restaurant_floor).toBe(false);
    expect(payload.restaurant_menu).toBe(true);
    expect(payload.products).toBeUndefined();
    expect(untickedLabels(options, unticked)).not.toBe('');
    expect(untickedLabels(options, new Set())).toBe('');
  });
});
