import { type GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import {
  WhatsappApiError,
  type WhatsappCloudApiClientService,
} from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { WhatsappSendMessageService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service';

const personFindOneMock = jest.fn();
const whatsappMessageSaveMock = jest.fn();
const getRepositoryMock = jest.fn(
  async (_workspaceId: string, objectName: string) =>
    objectName === 'person'
      ? { findOne: personFindOneMock }
      : { save: whatsappMessageSaveMock },
);
const globalWorkspaceOrmManagerMock = {
  getRepository: getRepositoryMock,
  executeInWorkspaceContext: jest.fn(async (callback: () => unknown) =>
    callback(),
  ),
} as unknown as GlobalWorkspaceOrmManager;

const sendTextMock = jest.fn();
const sendTemplateMock = jest.fn();
const clientMock = {
  sendText: sendTextMock,
  sendTemplate: sendTemplateMock,
} as unknown as WhatsappCloudApiClientService;

describe('WhatsappSendMessageService', () => {
  let service: WhatsappSendMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    personFindOneMock.mockResolvedValue({
      id: 'person-1',
      whatsapp: {
        primaryPhoneNumber: '700123456',
        primaryPhoneCallingCode: '+93',
      },
    });
    service = new WhatsappSendMessageService(
      globalWorkspaceOrmManagerMock,
      clientMock,
    );
  });

  it('should send a text message and persist a SENT record', async () => {
    sendTextMock.mockResolvedValue({ waMessageId: 'wamid.abc' });

    const result = await service.send({
      workspaceId: 'ws-1',
      personId: 'person-1',
      opportunityId: 'opp-1',
      text: 'Hello!',
    });

    expect(result).toEqual({
      success: true,
      waMessageId: 'wamid.abc',
      error: null,
    });
    expect(sendTextMock).toHaveBeenCalledWith('+93700123456', 'Hello!');
    expect(whatsappMessageSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        direction: 'OUTBOUND',
        status: 'SENT',
        toPhone: '+93700123456',
        body: 'Hello!',
        waMessageId: 'wamid.abc',
        personId: 'person-1',
        opportunityId: 'opp-1',
      }),
    );
  });

  it('should send a template with parameters and log the template name', async () => {
    sendTemplateMock.mockResolvedValue({ waMessageId: 'wamid.tpl' });

    await service.send({
      workspaceId: 'ws-1',
      personId: 'person-1',
      templateName: 'summer_offer',
      templateLanguage: 'en',
      templateBodyParams: ['25%'],
    });

    expect(sendTemplateMock).toHaveBeenCalledWith(
      '+93700123456',
      'summer_offer',
      'en',
      ['25%'],
    );
    expect(whatsappMessageSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({ templateName: 'summer_offer', status: 'SENT' }),
    );
  });

  it('should persist a FAILED record and return the error when Meta rejects', async () => {
    sendTextMock.mockRejectedValue(
      new WhatsappApiError('Re-engagement message', 131047),
    );

    const result = await service.send({
      workspaceId: 'ws-1',
      personId: 'person-1',
      text: 'Hello!',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('24 hours');
    expect(whatsappMessageSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'FAILED' }),
    );
  });

  it('should fail before calling Meta when the person has no phone', async () => {
    personFindOneMock.mockResolvedValue({ id: 'person-1' });

    const result = await service.send({
      workspaceId: 'ws-1',
      personId: 'person-1',
      text: 'x',
    });

    expect(result.success).toBe(false);
    expect(sendTextMock).not.toHaveBeenCalled();
    expect(whatsappMessageSaveMock).not.toHaveBeenCalled();
  });
});
