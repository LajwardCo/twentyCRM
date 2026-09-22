import { coreQuery, loadTokens } from './client';

// Usystems Core, reached through twenty-server's /rest/sales/usystems/* proxy.
// The proxy holds the Developer API key; this module only ever sends the
// seller's own Twenty token. Core's validation errors come back verbatim so
// the seller reads the same message a Usystems user would.

export type UsystemsContact = {
  id: number;
  code: string;
  name: string;
  type: string;
  status: string;
  phone: string | null;
  email: string | null;
  organization: string | null;
  city: string | null;
};

export type UsystemsCurrency = {
  id: number;
  code: string;
  symbol: string;
  name: string;
  is_default: boolean;
};

export type SalesOrderLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  unit?: string;
  // What the line is made of (metrics, install/annual split, package,
  // discount), printed under the item name. Newline-separated.
  details?: string;
};

export type IssueSalesOrderInput = {
  contactId: number;
  currencyId?: number;
  documentDate?: string;
  validUntil?: string;
  memo?: string;
  lines: SalesOrderLineInput[];
};

export type IssuedSalesOrder = {
  id: number;
  code: string;
  validUntil: string | null;
  documentDate: string | null;
  isExpired: boolean;
  total: string;
  currencyCode: string | null;
};

export type PrintDocument = {
  template: {
    id: string;
    name: string;
    template_type: string;
    body_html: string;
    page: Record<string, unknown>;
    format_version: number;
  };
  context: Record<string, unknown>;
  labels: Record<string, string>;
  language: string;
  partials: { key: string; bodyHtml: string }[];
};

export class UsystemsError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details: unknown,
  ) {
    super(message);
  }
}

const request = async <T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
): Promise<T> => {
  const token = loadTokens()?.accessToken ?? '';
  const response = await fetch(`/rest/sales/usystems/${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const payload = (json ?? {}) as {
      message?: string | string[];
      messages?: string[];
      details?: unknown;
    };
    const detail = payload.messages ?? payload.message;
    const message = Array.isArray(detail)
      ? detail.join(', ')
      : (detail ?? `Usystems request failed (${response.status})`);
    throw new UsystemsError(message, response.status, payload.details ?? null);
  }

  return json as T;
};

export const fetchUsystemsStatus = (): Promise<{ configured: boolean }> =>
  request('GET', 'status');

export const searchUsystemsContacts = async (
  query: string,
): Promise<UsystemsContact[]> => {
  const data = await request<{ results: UsystemsContact[] }>(
    'GET',
    `contacts/search?q=${encodeURIComponent(query)}`,
  );
  return data.results;
};

export const registerUsystemsContact = (input: {
  name: string;
  phone?: string;
  email?: string;
  organization?: string;
  addressLine1?: string;
  city?: string;
  country?: string;
}): Promise<UsystemsContact> => request('POST', 'contacts', input);

export const fetchUsystemsCurrencies = async (): Promise<UsystemsCurrency[]> => {
  const data = await request<{ results: UsystemsCurrency[] }>('GET', 'currencies');
  return data.results;
};

// A Core catalog item: a product OR a service (Item is the unified base in
// Usystems). Used to add sales-order lines from the tenant's real catalog.
export type UsystemsItem = {
  id: number;
  name: string;
  code: string | null;
  type: string; // 'product' | 'service' | ...
  status: string;
  sales_price: number | null;
  qty_on_hand: number | null;
};

export const searchUsystemsItems = async (query: string): Promise<UsystemsItem[]> => {
  const data = await request<{ results: UsystemsItem[] }>(
    'GET',
    `items/search?q=${encodeURIComponent(query)}`,
  );
  return data.results;
};

type RawSalesOrder = {
  id?: number;
  code: string;
  valid_until: string | null;
  document_date: string | null;
  is_expired: boolean;
  total: string | number;
  currency?: { code?: string } | null;
};

const toIssued = (raw: RawSalesOrder, fallbackId?: number): IssuedSalesOrder => ({
  id: raw.id ?? fallbackId ?? 0,
  code: raw.code,
  validUntil: raw.valid_until,
  documentDate: raw.document_date,
  isExpired: Boolean(raw.is_expired),
  total: String(raw.total ?? ''),
  currencyCode: raw.currency?.code ?? null,
});

export const issueSalesOrder = async (
  input: IssueSalesOrderInput,
): Promise<IssuedSalesOrder> => {
  const data = await request<{ sales_order: RawSalesOrder & { id?: number } }>(
    'POST',
    'sales-orders',
    input,
  );
  return toIssued(data.sales_order);
};

export const fetchSalesOrder = async (id: number): Promise<IssuedSalesOrder> => {
  const data = await request<{ sales_order: RawSalesOrder }>('GET', `sales-orders/${id}`);
  return toIssued(data.sales_order, id);
};

export const fetchSalesOrderPrintDocument = (
  id: number,
  lang?: string,
): Promise<PrintDocument> =>
  request('GET', `sales-orders/${id}/print-document${lang ? `?lang=${lang}` : ''}`);

// ---------- the link fields on CRM records (provision-usystems-link.mjs) ----------

// One issued order, as kept on the lead. Amounts are Core's decimal strings.
export type SalesOrderHistoryEntry = {
  id: string | null;
  code: string;
  documentDate: string | null;
  validUntil: string | null;
  total: string | null;
  currencyCode: string | null;
  issuedAt: string | null;
};

export type LeadUsystemsLink = {
  // The latest order, again: CRM table views and reports read these three.
  usystemsSalesOrderCode: string | null;
  usystemsSalesOrderId: string | null;
  usystemsSalesOrderValidUntil: string | null;
  // Every order issued for this lead, oldest first. null on an instance that
  // provisioned the link before the history field existed.
  usystemsSalesOrders: SalesOrderHistoryEntry[] | null;
};

const isUnsupported = (error: unknown): boolean =>
  error instanceof Error &&
  /(Cannot query field|is not defined by type|Unknown argument).*usystems/i.test(
    error.message,
  );

const HISTORY_FIELD = 'usystemsSalesOrders';

const isMissingHistoryField = (error: unknown): boolean =>
  error instanceof Error &&
  new RegExp(
    `(Cannot query field|is not defined by type).*"${HISTORY_FIELD}"|"${HISTORY_FIELD}".*is not defined by type`,
    'i',
  ).test(error.message);

/** null when the instance hasn't run the provisioning script. */
export const fetchLeadUsystemsLink = async (
  opportunityId: string,
): Promise<LeadUsystemsLink | null> => {
  const run = async (withHistory: boolean) => {
    const data = await coreQuery<{ opportunity: LeadUsystemsLink }>(
      `query LeadUsystemsLink($id: UUID!) {
        opportunity(filter: { id: { eq: $id } }) {
          usystemsSalesOrderCode usystemsSalesOrderId usystemsSalesOrderValidUntil
          ${withHistory ? HISTORY_FIELD : ''}
        }
      }`,
      { id: opportunityId },
    );
    return { ...data.opportunity, usystemsSalesOrders: data.opportunity.usystemsSalesOrders ?? null };
  };
  try {
    return await run(true);
  } catch (error) {
    // The history field arrived in a later provisioning run than the other
    // three; an instance that has only those still gets its latest order.
    if (isMissingHistoryField(error)) {
      return run(false).catch((inner: unknown) => {
        if (isUnsupported(inner)) return null;
        throw inner;
      });
    }
    if (isUnsupported(error)) return null;
    throw error;
  }
};

export const fetchCompanyUsystemsContactId = async (
  companyId: string,
): Promise<string | null> => {
  try {
    const data = await coreQuery<{ company: { usystemsContactId: string | null } }>(
      `query CompanyUsystemsLink($id: UUID!) {
        company(filter: { id: { eq: $id } }) { usystemsContactId }
      }`,
      { id: companyId },
    );
    return data.company.usystemsContactId;
  } catch (error) {
    if (isUnsupported(error)) return null;
    throw error;
  }
};

export const saveCompanyUsystemsContactId = (
  companyId: string,
  usystemsContactId: string,
): Promise<unknown> =>
  coreQuery(
    `mutation LinkCompanyToUsystems($id: UUID!, $data: CompanyUpdateInput!) {
      updateCompany(id: $id, data: $data) { id }
    }`,
    { id: companyId, data: { usystemsContactId } },
  );

export const saveLeadUsystemsLink = async (
  opportunityId: string,
  link: LeadUsystemsLink,
): Promise<unknown> => {
  const save = (data: Partial<LeadUsystemsLink>) =>
    coreQuery(
      `mutation LinkLeadToUsystems($id: UUID!, $data: OpportunityUpdateInput!) {
        updateOpportunity(id: $id, data: $data) { id }
      }`,
      { id: opportunityId, data },
    );
  try {
    return await save(link);
  } catch (error) {
    // Same instance as above: keep the latest fields current even where the
    // history cannot be stored yet.
    if (!isMissingHistoryField(error)) throw error;
    const { usystemsSalesOrders: _unsupported, ...latestOnly } = link;
    return save(latestOnly);
  }
};
