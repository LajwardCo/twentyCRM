import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  WhatsappApiError,
  WhatsappCloudApiClientService,
} from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { resolveWhatsappRecipientPhone } from 'src/modules/sales-crm/whatsapp/utils/resolve-whatsapp-recipient-phone.util';

// Meta error 131047: free-form message outside the 24h customer service window
const RE_ENGAGEMENT_ERROR_CODE = 131047;

export type SendWhatsappMessageParams = {
  workspaceId: string;
  personId: string;
  opportunityId?: string | null;
  text?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
  templateBodyParams?: string[] | null;
};

export type SendWhatsappMessageResult = {
  success: boolean;
  waMessageId: string | null;
  error: string | null;
};

@Injectable()
export class WhatsappSendMessageService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
    private readonly whatsappCloudApiClientService: WhatsappCloudApiClientService,
  ) {}

  async send(
    params: SendWhatsappMessageParams,
  ): Promise<SendWhatsappMessageResult> {
    const { workspaceId, personId } = params;

    return this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const personRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspaceId,
            'person',
            { shouldBypassPermissionChecks: true },
          );

        const person = await personRepository.findOne({
          where: { id: personId },
        });

        if (!isDefined(person)) {
          return { success: false, waMessageId: null, error: 'Person not found' };
        }

        const toPhone = resolveWhatsappRecipientPhone(person);

        if (!isDefined(toPhone)) {
          return {
            success: false,
            waMessageId: null,
            error: 'This contact has no phone number',
          };
        }

        const isTemplate = isDefined(params.templateName);
        const bodySummary = isTemplate
          ? `[${params.templateName}] ${(params.templateBodyParams ?? []).join(', ')}`
          : (params.text ?? '');

        try {
          const { waMessageId } = isTemplate
            ? await this.whatsappCloudApiClientService.sendTemplate(
                toPhone,
                params.templateName as string,
                params.templateLanguage ?? 'en',
                params.templateBodyParams ?? [],
              )
            : await this.whatsappCloudApiClientService.sendText(
                toPhone,
                params.text ?? '',
              );

          await this.persistMessage(workspaceId, params, {
            status: 'SENT',
            toPhone,
            body: bodySummary,
            waMessageId,
            errorMessage: null,
          });

          return { success: true, waMessageId, error: null };
        } catch (error) {
          const errorMessage = this.toUserFacingError(error);

          await this.persistMessage(workspaceId, params, {
            status: 'FAILED',
            toPhone,
            body: bodySummary,
            waMessageId: null,
            errorMessage,
          });

          return { success: false, waMessageId: null, error: errorMessage };
        }
      },
      buildSystemAuthContext(workspaceId),
    );
  }

  private toUserFacingError(error: unknown): string {
    if (
      error instanceof WhatsappApiError &&
      error.metaErrorCode === RE_ENGAGEMENT_ERROR_CODE
    ) {
      return 'Use an approved template — this contact has not messaged you in the last 24 hours.';
    }

    return error instanceof Error
      ? error.message
      : 'Failed to send WhatsApp message';
  }

  private async persistMessage(
    workspaceId: string,
    params: SendWhatsappMessageParams,
    fields: {
      status: 'SENT' | 'FAILED';
      toPhone: string;
      body: string;
      waMessageId: string | null;
      errorMessage: string | null;
    },
  ): Promise<void> {
    const whatsappMessageRepository =
      await this.globalWorkspaceOrmManager.getRepository(
        workspaceId,
        'whatsappMessage',
        { shouldBypassPermissionChecks: true },
      );

    await whatsappMessageRepository.save({
      direction: 'OUTBOUND',
      templateName: params.templateName ?? '',
      personId: params.personId,
      opportunityId: params.opportunityId ?? null,
      ...fields,
    });
  }
}
