import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WhatsappCloudApiClientService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';

const configGetMock = jest.fn();
const twentyConfigServiceMock = {
  get: configGetMock,
} as unknown as TwentyConfigService;

describe('WhatsappCloudApiClientService', () => {
  let service: WhatsappCloudApiClientService;

  beforeEach(() => {
    jest.clearAllMocks();
    configGetMock.mockImplementation(
      (key: string) =>
        ({
          WHATSAPP_ACCESS_TOKEN: 'token-123',
          WHATSAPP_PHONE_NUMBER_ID: '111222333',
          WHATSAPP_BUSINESS_ACCOUNT_ID: '444555666',
        })[key],
    );
    service = new WhatsappCloudApiClientService(twentyConfigServiceMock);
  });

  it('should throw a configuration error when the token is missing', async () => {
    configGetMock.mockReturnValue(undefined);

    await expect(service.sendText('+93700123456', 'hi')).rejects.toThrow(
      'WhatsApp is not configured',
    );
  });

  it('should POST a text message and return the wamid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wamid.abc' }] }),
    }) as never;

    const result = await service.sendText('+93700123456', 'hi');

    expect(result.waMessageId).toBe('wamid.abc');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://graph.facebook.com/v23.0/111222333/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      }),
    );
  });

  it('should surface the Meta error message and code on failure', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: { message: 'Re-engagement message', code: 131047 },
      }),
    }) as never;

    await expect(service.sendText('+93700123456', 'hi')).rejects.toMatchObject({
      metaErrorCode: 131047,
    });
  });

  it('should list only approved templates with body text and variable count', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            name: 'summer_offer',
            status: 'APPROVED',
            language: 'en',
            components: [{ type: 'BODY', text: 'Get {{1}} off before {{2}}!' }],
          },
          {
            name: 'rejected_one',
            status: 'REJECTED',
            language: 'en',
            components: [],
          },
        ],
      }),
    }) as never;

    const templates = await service.listTemplates();

    expect(templates).toEqual([
      {
        name: 'summer_offer',
        language: 'en',
        status: 'APPROVED',
        bodyText: 'Get {{1}} off before {{2}}!',
        variableCount: 2,
      },
    ]);
  });
});
