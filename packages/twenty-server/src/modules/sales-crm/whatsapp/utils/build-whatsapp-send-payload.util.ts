type WhatsappTemplateComponent = {
  type: 'body';
  parameters: { type: 'text'; text: string }[];
};

export const buildWhatsappTextPayload = (to: string, body: string) => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'text',
  text: { body },
});

export const buildWhatsappTemplatePayload = (
  to: string,
  templateName: string,
  languageCode: string,
  bodyParameters: string[],
) => {
  const components: WhatsappTemplateComponent[] =
    bodyParameters.length > 0
      ? [
          {
            type: 'body',
            parameters: bodyParameters.map((text) => ({
              type: 'text' as const,
              text,
            })),
          },
        ]
      : [];

  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  };
};
