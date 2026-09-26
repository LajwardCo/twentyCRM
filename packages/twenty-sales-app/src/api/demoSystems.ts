import { loadTokens } from './client';

// Talks to the twenty-server proxy (/rest/sales/demo-systems/*), which forwards
// to the Usystems Core partner API with the server-held key. Same bearer-token
// pattern as api/ai.ts.

export type DemoBusinessType =
  | 'mobile_store'
  | 'home_appliances'
  | 'snooker_club'
  | 'car_rental'
  | 'opd'
  | 'other';

export type DemoStatus = {
  id: number;
  status: 'queued' | 'provisioning' | 'ready' | 'failed' | 'expired' | 'stopped' | 'deleted';
  business_name: string;
  business_type: DemoBusinessType;
  subdomain: string;
  workspace_url: string;
  login_url: string;
  admin_username: string;
  admin_password: string;
  agent_email: string;
  agent_name: string;
  language: string;
  currency: string;
  inventory_enabled: boolean;
  duration_days: number;
  expires_at: string | null;
  auto_delete_at: string | null;
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

export type CreateDemoInput = {
  business_name: string;
  business_type: DemoBusinessType;
  subdomain: string;
  language: string;
  currency: string;
  inventory_enabled: boolean;
  notes: string;
  duration_days: number;
  agreement_accepted: boolean;
  // Demo-content toggles (rich business types only, e.g. mobile store).
  enable_storefront?: boolean;
  enable_logo?: boolean;
  enable_background?: boolean;
  seed_documents?: boolean;
  // Capability settings (any type).
  multi_inventory?: boolean;
  multi_currency?: boolean;
  multi_lot?: boolean;
  // Custom login branding as base64 / data-URL (any type). Optional.
  custom_logo?: string;
  custom_background?: string;
};

export class DemoApiError extends Error {
  code?: string;
  status: number;
  fields?: Record<string, string[]>;
  constructor(message: string, status: number, code?: string, fields?: Record<string, string[]>) {
    super(message);
    this.name = 'DemoApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

const BASE = '/rest/sales/demo-systems';

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
    throw new DemoApiError(message, response.status, code, Object.keys(fields).length ? fields : undefined);
  }
  return data as T;
};

export const checkDemoSubdomain = (subdomain: string): Promise<SubdomainCheck> =>
  request('POST', '/check-subdomain', { subdomain });

export const createDemo = (input: CreateDemoInput): Promise<DemoStatus> =>
  request('POST', '', input);

export const listDemos = (scope: 'mine' | 'all' = 'mine'): Promise<DemoStatus[]> =>
  request('GET', scope === 'all' ? '?scope=all' : '');

export const getDemo = (id: number | string): Promise<DemoStatus> =>
  request('GET', `/${id}`);

// Live snapshot of the provisioned demo tenant, read fresh from the fleet (Core).
export type DemoDetails = {
  id: number;
  subdomain: string;
  status: string;
  provisioned: boolean;
  live: {
    active: boolean;
    deleted: boolean;
    expired: boolean;
    expires_at: string | null;
    auto_delete_at: string | null;
    days_left: number | null;
    constellation_type: string;
  } | null;
  workspace: {
    name: string;
    code: string;
    language: string;
    calendar: string;
    week_start_day: string;
    currency: string | null;
  } | null;
  // doctors/patients are only reported for an OPD (clinic) demo.
  catalog: {
    products: number | null;
    services: number | null;
    doctors?: number | null;
    patients?: number | null;
  } | null;
};

export const getDemoDetails = (id: number | string): Promise<DemoDetails> =>
  request('GET', `/${id}/details`);

export const regenerateDemoCredentials = (id: number | string): Promise<DemoStatus> =>
  request('POST', `/${id}/regenerate-credentials`);

// Deactivate the tenant now (agent-initiated early end).
export const stopDemo = (id: number | string): Promise<DemoStatus> =>
  request('POST', `/${id}/stop`);

// Tear the demo down: soft-delete the tenant + mark it removed.
export const removeDemo = (id: number | string): Promise<DemoStatus> =>
  request('POST', `/${id}/remove`);
