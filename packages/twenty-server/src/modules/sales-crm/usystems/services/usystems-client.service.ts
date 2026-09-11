import { Injectable } from '@nestjs/common';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';

/**
 * The Usystems Core Developer API, as the Sales UI needs it: find or register
 * the client, list quoting currencies, issue an order, read it back, fetch the
 * document that renders it.
 *
 * This service is the only place the Developer API key exists. The Sales UI
 * is a browser app; the key never reaches it -- the controller in this module
 * authenticates the seller with their Twenty token and calls through here.
 */

export class UsystemsApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

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

export type UsystemsSalesOrderLine = {
  description: string;
  quantity: number | string;
  unit_price: number | string;
  unit_of_measure?: string;
};

export type IssueSalesOrderInput = {
  contact_id: number;
  currency?: number | string;
  document_date?: string;
  valid_until?: string;
  memo?: string;
  discount?: string;
  discount_type?: 'amount' | 'percentage';
  items: UsystemsSalesOrderLine[];
};

export type UsystemsSalesOrder = {
  id?: number;
  code: string;
  valid_until: string | null;
  document_date: string | null;
  is_expired: boolean;
  total: string | number;
  status: string;
  currency?: { id: number; code: string; symbol?: string };
  contact?: { id: number; name: string; code?: string };
};

export type UsystemsPrintDocument = {
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

const describeCoreError = (json: unknown, status: number): string => {
  if (json && typeof json === 'object') {
    const body = json as Record<string, unknown>;
    const top = body.error ?? body.detail;

    if (typeof top === 'string' && top.trim() !== '') return top;
    const fields = Object.entries(body).filter(([key]) => key !== 'statusCode');

    if (fields.length > 0) {
      return fields
        .map(([field, value]) => {
          const text = Array.isArray(value) ? value.join(', ') : String(value);

          return `${field}: ${text}`;
        })
        .join('; ');
    }
  }

  return `Usystems Core answered ${status}`;
};

@Injectable()
export class UsystemsClientService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.twentyConfigService.get('USYSTEMS_API_BASE_URL') &&
        this.twentyConfigService.get('USYSTEMS_API_KEY') &&
        this.twentyConfigService.get('USYSTEMS_PRODUCT_CODE'),
    );
  }

  private getConfigOrThrow() {
    const baseUrl = this.twentyConfigService.get('USYSTEMS_API_BASE_URL');
    const apiKey = this.twentyConfigService.get('USYSTEMS_API_KEY');
    const productCode = this.twentyConfigService.get('USYSTEMS_PRODUCT_CODE');

    if (!baseUrl || !apiKey || !productCode) {
      throw new UsystemsApiError(
        'Usystems Core is not connected: set the base URL, API key and product code under Settings → Admin Panel → Config Variables (Usystems settings)',
        503,
      );
    }

    return {
      baseUrl: String(baseUrl).replace(/\/+$/, ''),
      apiKey: String(apiKey),
      productCode: String(productCode),
    };
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    options: { query?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const { baseUrl, apiKey, productCode } = this.getConfigOrThrow();
    const url = new URL(`${baseUrl}/dev/${productCode}/${path}`);

    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, value);
    }

    let response: Response;

    try {
      response = await fetch(url, {
        method,
        headers: {
          Accept: 'application/json',
          'X-API-Key': apiKey,
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      throw new UsystemsApiError(
        `Usystems Core is unreachable: ${(error as Error).message}`,
        502,
      );
    }

    const text = await response.text();
    let json: unknown = null;

    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { detail: text };
    }

    if (!response.ok) {
      // 4xx from Core is the seller's problem to read (a validation error);
      // pass it through with the same status. DRF answers field errors as
      // {field: [msg]} with no top-level message, and the REST exception
      // filter forwards only `messages`, so the field text is folded into
      // the message here or the seller would see "answered 400" and nothing.
      throw new UsystemsApiError(
        describeCoreError(json, response.status),
        response.status,
        json,
      );
    }

    return json as T;
  }

  searchContacts(query: string): Promise<{ results: UsystemsContact[] }> {
    return this.request('GET', 'contacts/search/', { query: { q: query } });
  }

  createContact(input: {
    name: string;
    phone?: string;
    email?: string;
    organization?: string;
    address_line1?: string;
    city?: string;
    country?: string;
  }): Promise<UsystemsContact> {
    return this.request('POST', 'contacts/create/', { body: input });
  }

  listCurrencies(): Promise<{ results: UsystemsCurrency[] }> {
    return this.request('GET', 'currencies/');
  }

  issueSalesOrder(input: IssueSalesOrderInput): Promise<{
    sales_order: UsystemsSalesOrder;
    sales_items: unknown[];
    total_price: string | number;
  }> {
    return this.request('POST', 'sales-orders/create/', { body: input });
  }

  getSalesOrder(id: number): Promise<{
    sales_order: UsystemsSalesOrder;
    sales_items: unknown[];
  }> {
    return this.request('GET', `sales-orders/${id}/`);
  }

  getPrintDocument(id: number, lang?: string): Promise<UsystemsPrintDocument> {
    return this.request('GET', `sales-orders/${id}/print-document/`, {
      query: lang ? { lang } : {},
    });
  }
}
