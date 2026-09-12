import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  UsystemsApiError,
  UsystemsClientService,
} from 'src/modules/sales-crm/usystems/services/usystems-client.service';

const configGetMock = jest.fn();
const twentyConfigServiceMock = {
  get: configGetMock,
} as unknown as TwentyConfigService;

const fetchMock = jest.fn();

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  });

describe('UsystemsClientService', () => {
  let service: UsystemsClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as never;
    configGetMock.mockImplementation(
      (key: string) =>
        ({
          USYSTEMS_API_BASE_URL: 'https://core.example.af/',
          USYSTEMS_API_KEY: 'key-123',
          USYSTEMS_PRODUCT_CODE: 'accounting',
        })[key],
    );
    service = new UsystemsClientService(twentyConfigServiceMock);
  });

  it('reports whether it is configured', () => {
    expect(service.isConfigured()).toBe(true);
    configGetMock.mockReturnValue(undefined);
    expect(service.isConfigured()).toBe(false);
  });

  it('refuses to call out when not configured', async () => {
    configGetMock.mockReturnValue(undefined);

    await expect(service.searchContacts('x')).rejects.toThrow(
      'Usystems Core is not connected',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds the tenant-scoped URL and sends the key in the header only', async () => {
    respond(200, { results: [] });

    await service.searchContacts('moheb');

    const [url, init] = fetchMock.mock.calls[0];

    expect(String(url)).toBe(
      'https://core.example.af/dev/accounting/contacts/search/?q=moheb',
    );
    expect(init.headers['X-API-Key']).toBe('key-123');
    expect(String(url)).not.toContain('key-123');
  });

  it('maps an issue request onto the Developer API payload', async () => {
    respond(201, {
      sales_order: { code: 'SO-1' },
      sales_items: [],
      total_price: '10',
    });

    const result = await service.issueSalesOrder({
      contact_id: 7,
      valid_until: '2026-10-10',
      items: [{ description: 'Package', quantity: 1, unit_price: '10' }],
    });

    const [url, init] = fetchMock.mock.calls[0];

    expect(String(url)).toBe(
      'https://core.example.af/dev/accounting/sales-orders/create/',
    );
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({
      contact_id: 7,
      valid_until: '2026-10-10',
      items: [{ description: 'Package', quantity: 1, unit_price: '10' }],
    });
    expect(result.sales_order.code).toBe('SO-1');
  });

  it("passes Core's own validation error through with its status", async () => {
    respond(400, { items: ['At least one item line is required.'] });

    await expect(
      service.issueSalesOrder({ contact_id: 1, items: [] }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'items: At least one item line is required.',
      details: { items: ['At least one item line is required.'] },
    });
  });

  it('turns a network failure into a 502', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(service.listCurrencies()).rejects.toBeInstanceOf(
      UsystemsApiError,
    );
    await expect(service.listCurrencies()).rejects.toMatchObject({
      status: 502,
    });
  });

  it('asks for the print document in a language', async () => {
    respond(200, {
      template: {},
      context: {},
      labels: {},
      language: 'fa',
      partials: [],
    });

    await service.getPrintDocument(42, 'fa');

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://core.example.af/dev/accounting/sales-orders/42/print-document/?lang=fa',
    );
  });
});
