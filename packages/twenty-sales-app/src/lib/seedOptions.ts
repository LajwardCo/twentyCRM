import { TSEED } from './strings';

// The kinds of sample data an agent can leave out once they chose "with sample
// data". Keys match Core's demos/seed_options.py; the request carries
// { key: false } for every unticked box (a missing key means "seed it").
export type SeedOptionKey =
  | 'products'
  | 'services'
  | 'fixed_assets'
  | 'shareholders'
  | 'recruitment'
  | 'projects'
  | 'restaurant_menu'
  | 'restaurant_floor'
  | 'restaurant_kitchen'
  | 'restaurant_loyalty'
  | 'import_purchases'
  | 'goods_in_transit'
  | 'export_sales';

export type SeedOption = { key: SeedOptionKey; label: string; emoji: string };

export type SeedScope = {
  restaurant: boolean;
  // Import/export trading company: adds the cross-border trade documents.
  trade?: boolean;
  // Products/opening stock exist only when the workspace keeps stock.
  inventory: boolean;
  // Only the generic demo catalog carries the construction projects.
  projects: boolean;
};

export const seedOptionsFor = ({ restaurant, trade = false, inventory, projects }: SeedScope): SeedOption[] => [
  ...(restaurant
    ? ([
        { key: 'restaurant_menu', label: TSEED.restaurantMenu, emoji: '🍽️' },
        { key: 'restaurant_floor', label: TSEED.restaurantFloor, emoji: '🪑' },
        { key: 'restaurant_kitchen', label: TSEED.restaurantKitchen, emoji: '👨‍🍳' },
        { key: 'restaurant_loyalty', label: TSEED.restaurantLoyalty, emoji: '⭐' },
      ] as SeedOption[])
    : []),
  ...(trade
    ? ([
        { key: 'import_purchases', label: TSEED.importPurchases, emoji: '🚢' },
        { key: 'goods_in_transit', label: TSEED.goodsInTransit, emoji: '🚛' },
        { key: 'export_sales', label: TSEED.exportSales, emoji: '🌍' },
      ] as SeedOption[])
    : []),
  ...(inventory
    ? ([{ key: 'products', label: restaurant ? TSEED.restaurantProducts : TSEED.products, emoji: '📦' }] as SeedOption[])
    : []),
  { key: 'services', label: TSEED.services, emoji: '🧾' },
  { key: 'fixed_assets', label: TSEED.fixedAssets, emoji: '🏗️' },
  { key: 'shareholders', label: TSEED.shareholders, emoji: '🤝' },
  { key: 'recruitment', label: TSEED.recruitment, emoji: '👥' },
  ...(projects ? ([{ key: 'projects', label: TSEED.projects, emoji: '📐' }] as SeedOption[]) : []),
];

// Only the options shown to the agent go out, as { key: ticked }.
export const seedOptionsPayload = (
  options: SeedOption[],
  unticked: Set<SeedOptionKey>,
): Partial<Record<SeedOptionKey, boolean>> =>
  Object.fromEntries(options.map((option) => [option.key, !unticked.has(option.key)]));

// "Tables, Loyalty" for the review step; empty when everything is seeded.
export const untickedLabels = (options: SeedOption[], unticked: Set<SeedOptionKey>): string =>
  options
    .filter((option) => unticked.has(option.key))
    .map((option) => option.label)
    .join('، ');
