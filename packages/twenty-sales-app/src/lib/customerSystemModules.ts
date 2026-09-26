import { TSYS } from './strings';

// The module switches of a new customer system, keyed by Usystems Core's
// module registry. Core treats an absent key as "leave at the module
// manager's default (ON)".
//
// The first three were the original wizard switches: they start OFF (most
// customers don't buy them) and are always sent, because the base product
// Core provisions may disable them on its own, so ON must be stated.
//
// The later three start ON, like Core, and are sent only when the agent
// switches them OFF: a Core without that key yet then still accepts every
// system created with the defaults, instead of rejecting the unknown key.
export type CustomerSystemModule = {
  key: string;
  label: string;
  initiallyEnabled: boolean;
  alwaysSent: boolean;
};

export const CUSTOMER_SYSTEM_MODULES: CustomerSystemModule[] = [
  { key: 'projects', label: TSYS.modProjects, initiallyEnabled: false, alwaysSent: true },
  { key: 'booking', label: TSYS.modBooking, initiallyEnabled: false, alwaysSent: true },
  { key: 'custom_pages', label: TSYS.modCustomPages, initiallyEnabled: false, alwaysSent: true },
  { key: 'fixed_assets', label: TSYS.modFixedAssets, initiallyEnabled: true, alwaysSent: false },
  { key: 'subscriptions', label: TSYS.modSubscriptions, initiallyEnabled: true, alwaysSent: false },
  { key: 'hr', label: TSYS.modHr, initiallyEnabled: true, alwaysSent: false },
];

export const initialModuleFlags = (): Record<string, boolean> =>
  Object.fromEntries(CUSTOMER_SYSTEM_MODULES.map((module) => [module.key, module.initiallyEnabled]));

export const moduleFlagsPayload = (flags: Record<string, boolean>): Record<string, boolean> => {
  const payload: Record<string, boolean> = {};
  for (const module of CUSTOMER_SYSTEM_MODULES) {
    const enabled = flags[module.key] ?? module.initiallyEnabled;
    if (module.alwaysSent || !enabled) payload[module.key] = enabled;
  }
  return payload;
};
