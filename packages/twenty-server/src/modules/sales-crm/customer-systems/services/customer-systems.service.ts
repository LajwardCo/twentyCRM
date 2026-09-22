import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

// Thin server-side client for the Usystems Core "partner systems" API — the real
// (production) sibling of the demo-systems proxy. It holds the Core API key so
// the browser never sees it, and forwards the sales agent's requests to
// platform.usystems.af. Config comes from env, reusing the existing CRM↔Core
// connection so no new secrets need provisioning on the box:
//   URL:     USYSTEMS_CORE_URL     (default: the Core public host below)
//   key:     USYSTEMS_SYSTEMS_API_KEY, else the existing USYSTEMS_API_KEY
//            (that DeveloperApp just needs the `systems.write` scope added)
//   tenant:  USYSTEMS_SYSTEMS_PRODUCT_CODE, else USYSTEMS_PRODUCT_CODE, else the
//            hamagan `accounting` product the key belongs to.
const DEFAULT_CORE_URL = 'https://backend.platform.usystems.af';
const DEFAULT_PRODUCT_CODE = 'accounting';

type CoreConfig = {
  baseUrl: string;
  apiKey: string;
  productCode: string;
};

@Injectable()
export class CustomerSystemsService {
  private getConfig(): CoreConfig {
    const baseUrl = (process.env.USYSTEMS_CORE_URL ?? DEFAULT_CORE_URL)
      .trim()
      .replace(/\/$/, '');
    const apiKey = (
      process.env.USYSTEMS_SYSTEMS_API_KEY ??
      process.env.USYSTEMS_API_KEY ??
      ''
    ).trim();
    const productCode = (
      process.env.USYSTEMS_SYSTEMS_PRODUCT_CODE ??
      process.env.USYSTEMS_PRODUCT_CODE ??
      DEFAULT_PRODUCT_CODE
    ).trim();

    if (!baseUrl || !apiKey || !productCode) {
      throw new HttpException(
        {
          code: 'customer_systems_unconfigured',
          message:
            'Customer systems is not configured on the server (USYSTEMS_CORE_URL / USYSTEMS_SYSTEMS_API_KEY / USYSTEMS_SYSTEMS_PRODUCT_CODE).',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { baseUrl, apiKey, productCode };
  }

  private partnerUrl(config: CoreConfig, path: string): string {
    return `${config.baseUrl}/api/v1/${config.productCode}/partner/systems/${path}`;
  }

  private async request<T = unknown>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const config = this.getConfig();
    let response: Response;
    try {
      response = await fetch(this.partnerUrl(config, path), {
        method,
        headers: {
          'X-API-Key': config.apiKey,
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new HttpException(
        { code: 'customer_systems_unreachable', message: 'Could not reach the Usystems platform.' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: text };
    }
    if (!response.ok) {
      // Forward the Core status + payload so the UI can show field errors /
      // "subdomain taken" as the partner API reported them.
      throw new HttpException(
        (data as object) ?? { detail: 'Request failed' },
        response.status,
      );
    }
    return data as T;
  }

  checkSubdomain(subdomain: string) {
    return this.request('POST', 'check-subdomain/', { subdomain });
  }

  createSystem(payload: Record<string, unknown>) {
    return this.request('POST', 'create/', payload);
  }

  listSystems(params: { agentEmail?: string; crmLeadId?: string; status?: string }) {
    const query = new URLSearchParams();
    if (params.agentEmail) query.set('agent_email', params.agentEmail);
    if (params.crmLeadId) query.set('crm_lead_id', params.crmLeadId);
    if (params.status) query.set('status', params.status);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request('GET', suffix);
  }

  getSystem(id: number | string) {
    return this.request('GET', `${id}/`);
  }

  getSystemDetails(id: number | string) {
    return this.request('GET', `${id}/details/`);
  }

  regenerateCredentials(id: number | string) {
    return this.request('POST', `${id}/regenerate-credentials/`);
  }
}
