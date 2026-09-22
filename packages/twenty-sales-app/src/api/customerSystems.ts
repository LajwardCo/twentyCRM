import { loadTokens } from './client';

// Talks to the twenty-server proxy (/rest/sales/customer-systems/*), which
// forwards to the Usystems Core partner API with the server-held key. This is the
// real (production) sibling of api/demoSystems.ts: a system is issued for a
// contracted lead and provisioned as a permanent standard tenant.

export type SystemBusinessType = 'retail' | 'services' | 'booking' | 'general';

export type SystemUserRole =
  | 'admin'
  | 'manager'
  | 'accountant'
  | 'seller'
  | 'cashier'
  | 'inventory'
  | 'inventory_manager';

export type RequestedUser = {
  name: string;
  phone?: string;
  login_username?: string;
  role: SystemUserRole;
};

export type ProvisionedUser = {
  login_username: string;
  name: string;
  role: string;
  password: string;
};

export type SystemStatus = {
  id: number;
  status: 'queued' | 'provisioning' | 'ready' | 'failed';
  business_name: string;
  business_type: SystemBusinessType;
  subdomain: string;
  workspace_url: string;
  login_url: string;
  admin_username: string;
  admin_password: string;
  provisioned_users: ProvisionedUser[];
  crm_lead_id: string;
  crm_lead_name: string;
  crm_company_id: string;
  agent_email: string;
  agent_name: string;
  language: string;
  currency: string;
  inventory_enabled: boolean;
  multi_inventory: boolean;
  multi_currency: boolean;
  multi_lot: boolean;
  ai_assistant_enabled: boolean;
  dynamic_reporting_enabled: boolean;
  multi_language_enabled: boolean;
  module_flags: Record<string, boolean>;
  max_users: number | null;
  max_main_inventories: number | null;
  max_employees: number | null;
  max_bookable_resources: number | null;
  max_currencies: number | null;
  ready_at: string | null;
  error_public: string;
  created_at: string;
};

export type SubdomainCheck = {
  subdomain: string;
  available: boolean;
  status: string;
  message: string;
};

export type CreateSystemInput = {
  business_name: string;
  business_type: SystemBusinessType;
  subdomain: string;
  // The contracted lead this system is issued for (required).
  crm_lead_id: string;
  crm_lead_name?: string;
  crm_company_id?: string;
  usystems_contact_id?: string;
  language: string;
  currency: string;
  inventory_enabled: boolean;
  notes: string;
  admin_username: string;
  // Capability settings.
  multi_inventory?: boolean;
  multi_currency?: boolean;
  multi_lot?: boolean;
  // Sellable entitlements.
  ai_assistant_enabled?: boolean;
  dynamic_reporting_enabled?: boolean;
  multi_language_enabled?: boolean;
  // Module on/off ({ projects, custom_pages, booking }).
  module_flags?: Record<string, boolean>;
  // Metric caps (null / omitted => unlimited).
  max_users?: number | null;
  max_main_inventories?: number | null;
  max_employees?: number | null;
  max_bookable_resources?: number | null;
  max_currencies?: number | null;
  // Users to provision beyond the primary admin.
  requested_users?: RequestedUser[];
  // Custom login branding as base64 / data-URL. Optional.
  custom_logo?: string;
  custom_background?: string;
};

export class SystemApiError extends Error {
  code?: string;
  status: number;
  fields?: Record<string, string[]>;
  constructor(message: string, status: number, code?: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'SystemApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const BASE = '/rest/sales/customer-systems';

const request = async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
  const tokens = loadTokens();
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokens?.accessToken ?? ''}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }

  if (!response.ok) {
    const code = data?.code as string | undefined;
    // Field-level DRF errors come back as { field: [messages] }.
    const fields: Record<string, string[]> = {};
    if (data && typeof data === 'object' && !code && !data.detail && !data.message) {
      for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v)) fields[k] = v.map(String);
      }
    }
    const message =
      data?.detail || data?.message ||
      (Object.keys(fields).length ? Object.values(fields)[0][0] : `Request failed (${response.status})`);
    throw new SystemApiError(message, response.status, code, Object.keys(fields).length ? fields : undefined);
  }
  return data as T;
};

export const checkSystemSubdomain = (subdomain: string): Promise<SubdomainCheck> =>
  request('POST', '/check-subdomain', { subdomain });

export const createSystem = (input: CreateSystemInput): Promise<SystemStatus> =>
  request('POST', '', input);

export const listSystems = (
  scope: 'mine' | 'all' = 'mine',
  crmLeadId?: string,
): Promise<SystemStatus[]> => {
  const params = new URLSearchParams();
  if (scope === 'all') params.set('scope', 'all');
  if (crmLeadId) params.set('crm_lead_id', crmLeadId);
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request('GET', suffix);
};

export const getSystem = (id: number | string): Promise<SystemStatus> =>
  request('GET', `/${id}`);

// Live snapshot of the provisioned system tenant, read fresh from the fleet (Core).
export type SystemDetails = {
  id: number;
  subdomain: string;
  status: string;
  provisioned: boolean;
  crm_lead_id: string;
  live: {
    active: boolean;
    deleted: boolean;
    constellation_type: string;
  } | null;
  workspace: {
    name: string;
    code: string;
    language: string;
    calendar: string;
    week_start_day: string;
    currency: string | null;
    max_users: number | null;
    max_main_inventories: number | null;
  } | null;
  catalog: { products: number | null; services: number | null } | null;
  users: { count: number | null } | null;
};

export const getSystemDetails = (id: number | string): Promise<SystemDetails> =>
  request('GET', `/${id}/details`);

export const regenerateSystemCredentials = (id: number | string): Promise<SystemStatus> =>
  request('POST', `/${id}/regenerate-credentials`);
