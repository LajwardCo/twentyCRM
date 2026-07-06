import { metadataQuery } from './client';

export type WhatsappTemplate = {
  name: string;
  language: string;
  status: string;
  bodyText: string;
  variableCount: number;
};

export const fetchWhatsappTemplates = async (): Promise<WhatsappTemplate[]> => {
  const data = await metadataQuery<{ whatsappTemplates: WhatsappTemplate[] }>(
    `query WhatsappTemplates {
      whatsappTemplates {
        name
        language
        status
        bodyText
        variableCount
      }
    }`,
  );
  return data.whatsappTemplates;
};

export type SendWhatsappResult = {
  success: boolean;
  waMessageId: string | null;
  error: string | null;
};

export const sendWhatsappMessage = async (input: {
  personId: string;
  opportunityId?: string;
  text?: string;
  templateName?: string;
  templateLanguage?: string;
  templateBodyParams?: string[];
}): Promise<SendWhatsappResult> => {
  const data = await metadataQuery<{
    sendWhatsappMessage: SendWhatsappResult;
  }>(
    `mutation SendWhatsappMessage($input: SendWhatsappMessageInput!) {
      sendWhatsappMessage(input: $input) {
        success
        waMessageId
        error
      }
    }`,
    { input },
  );
  return data.sendWhatsappMessage;
};
