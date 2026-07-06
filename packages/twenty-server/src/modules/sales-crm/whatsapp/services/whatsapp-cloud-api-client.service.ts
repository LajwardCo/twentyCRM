import { Injectable } from '@nestjs/common';

import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import {
  buildWhatsappTemplatePayload,
  buildWhatsappTextPayload,
} from 'src/modules/sales-crm/whatsapp/utils/build-whatsapp-send-payload.util';

const GRAPH_API_BASE_URL = 'https://graph.facebook.com/v23.0';

export class WhatsappApiError extends Error {
  constructor(
    message: string,
    public readonly metaErrorCode?: number,
  ) {
    super(message);
  }
}

export type WhatsappTemplateSummary = {
  name: string;
  language: string;
  status: string;
  bodyText: string;
  variableCount: number;
};

type MetaTemplateResponseItem = {
  name: string;
  language: string;
  status: string;
  components?: { type: string; text?: string }[];
};

@Injectable()
export class WhatsappCloudApiClientService {
  constructor(private readonly twentyConfigService: TwentyConfigService) {}

  private getConfigOrThrow() {
    const accessToken = this.twentyConfigService.get('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.twentyConfigService.get(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const businessAccountId = this.twentyConfigService.get(
      'WHATSAPP_BUSINESS_ACCOUNT_ID',
    );

    if (!accessToken || !phoneNumberId) {
      throw new WhatsappApiError(
        'WhatsApp is not configured: set the access token and phone number id under Settings → Admin Panel → Config Variables (WhatsApp settings)',
      );
    }

    return { accessToken, phoneNumberId, businessAccountId };
  }

  private async postMessage(
    payload: Record<string, unknown>,
  ): Promise<{ waMessageId: string }> {
    const { accessToken, phoneNumberId } = this.getConfigOrThrow();

    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      },
    );

    const json = await response.json();

    if (!response.ok) {
      throw new WhatsappApiError(
        json?.error?.message ?? 'WhatsApp API request failed',
        json?.error?.code,
      );
    }

    return { waMessageId: json.messages?.[0]?.id ?? '' };
  }

  async sendText(to: string, body: string) {
    return this.postMessage(buildWhatsappTextPayload(to, body));
  }

  async sendTemplate(
    to: string,
    name: string,
    languageCode: string,
    bodyParameters: string[],
  ) {
    return this.postMessage(
      buildWhatsappTemplatePayload(to, name, languageCode, bodyParameters),
    );
  }

  async listTemplates(): Promise<WhatsappTemplateSummary[]> {
    const { accessToken, businessAccountId } = this.getConfigOrThrow();

    if (!businessAccountId) {
      throw new WhatsappApiError(
        'WhatsApp is not configured: set the business account id under Settings → Admin Panel → Config Variables (WhatsApp settings)',
      );
    }

    const response = await fetch(
      `${GRAPH_API_BASE_URL}/${businessAccountId}/message_templates?fields=name,status,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const json = await response.json();

    if (!response.ok) {
      throw new WhatsappApiError(
        json?.error?.message ?? 'Failed to list WhatsApp templates',
        json?.error?.code,
      );
    }

    return ((json.data ?? []) as MetaTemplateResponseItem[])
      .filter((template) => template.status === 'APPROVED')
      .map((template) => {
        const bodyComponent = (template.components ?? []).find(
          (component) => component.type === 'BODY',
        );
        const bodyText = bodyComponent?.text ?? '';

        return {
          name: template.name,
          language: template.language,
          status: template.status,
          bodyText,
          // {{1}}, {{2}}… placeholders determine how many inputs the UI renders
          variableCount: new Set(bodyText.match(/\{\{\d+\}\}/g) ?? []).size,
        };
      });
  }
}
