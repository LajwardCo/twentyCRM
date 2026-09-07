import { type CurrentUser } from '../api/auth';

// What an external marketer/partner may reach in the app.
//
// This is presentation only -- the server already refuses to return anyone
// else's records to these accounts (owner-scope engine + the Marketer/Partner
// roles, see tools/sales-crm/provision-external-partners.mjs). Hiding the rest
// of the app keeps them out of screens that would be empty, misleading, or made
// of numbers they are not allowed to read.
const EXTERNAL_NAV_KEYS = new Set(['today', 'calendar', 'tasks', 'leads']);

// Routes an external user may open directly, by first path segment. Anything
// else falls back to Today rather than rendering a screen that will only
// half-load.
const EXTERNAL_ROUTE_SECTIONS = new Set([
  '',
  'today',
  'calendar',
  'tasks',
  'task',
  'leads',
  'lead',
  'new',
  'note',
  'person',
  'company',
  'search',
  'upload',
]);

export const isExternalUser = (user: CurrentUser): boolean =>
  user.role === 'external';

// The security log names, by person, everything everyone did. Sellers seeing
// each other's movements is a different product; it is admins only, and the
// object permissions set by provision-audit-log.mjs enforce the same thing on
// the server so hiding the link is not the only barrier.
const ADMIN_ONLY_NAV_KEYS = new Set(['audit']);

// Employees keep the nav they have always had -- the admin screen still gates
// itself on the PERMISSIONS probe, which is unchanged.
export const canSeeNavKey = (user: CurrentUser, key: string): boolean => {
  if (ADMIN_ONLY_NAV_KEYS.has(key)) return user.isAdmin;
  return isExternalUser(user) ? EXTERNAL_NAV_KEYS.has(key) : true;
};

export const canOpenRouteSection = (
  user: CurrentUser,
  section: string,
): boolean =>
  isExternalUser(user) ? EXTERNAL_ROUTE_SECTIONS.has(section) : true;

// Money is hidden from external users in the UI, and separately denied at the
// field-permission layer so the API returns nothing even if a screen asks.
export const canSeeMoney = (user: CurrentUser): boolean =>
  !isExternalUser(user);
