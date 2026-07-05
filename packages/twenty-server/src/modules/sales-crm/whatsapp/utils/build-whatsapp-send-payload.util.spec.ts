import {
  buildWhatsappTemplatePayload,
  buildWhatsappTextPayload,
} from 'src/modules/sales-crm/whatsapp/utils/build-whatsapp-send-payload.util';

describe('buildWhatsappTextPayload', () => {
  it('should build a text payload for an E.164 recipient', () => {
    expect(buildWhatsappTextPayload('+93700123456', 'Hello')).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+93700123456',
      type: 'text',
      text: { body: 'Hello' },
    });
  });
});

describe('buildWhatsappTemplatePayload', () => {
  it('should build a template payload with body parameters', () => {
    expect(
      buildWhatsappTemplatePayload('+93700123456', 'summer_offer', 'en', [
        '25%',
        'Aug 31',
      ]),
    ).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '+93700123456',
      type: 'template',
      template: {
        name: 'summer_offer',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: '25%' },
              { type: 'text', text: 'Aug 31' },
            ],
          },
        ],
      },
    });
  });

  it('should omit components when there are no parameters', () => {
    const payload = buildWhatsappTemplatePayload(
      '+93700123456',
      'hello_world',
      'en_US',
      [],
    );

    expect(payload.template).toEqual({
      name: 'hello_world',
      language: { code: 'en_US' },
    });
  });
});
