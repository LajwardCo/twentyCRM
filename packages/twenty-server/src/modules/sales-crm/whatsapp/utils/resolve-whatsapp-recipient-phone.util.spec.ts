import { resolveWhatsappRecipientPhone } from 'src/modules/sales-crm/whatsapp/utils/resolve-whatsapp-recipient-phone.util';

describe('resolveWhatsappRecipientPhone', () => {
  it('should prefer the whatsapp field over the standard phones field', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsapp: {
          primaryPhoneNumber: '700123456',
          primaryPhoneCallingCode: '+93',
        },
        phones: {
          primaryPhoneNumber: '999',
          primaryPhoneCallingCode: '+1',
        },
      }),
    ).toBe('+93700123456');
  });

  it('should fall back to the standard phones field', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsapp: null,
        phones: {
          primaryPhoneNumber: '700123456',
          primaryPhoneCallingCode: '+93',
        },
      }),
    ).toBe('+93700123456');
  });

  it('should strip spaces, dashes and a leading zero from the national number', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsapp: {
          primaryPhoneNumber: '0700 123-456',
          primaryPhoneCallingCode: '+93',
        },
      }),
    ).toBe('+93700123456');
  });

  it('should normalize a calling code without a plus sign', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsapp: {
          primaryPhoneNumber: '700123456',
          primaryPhoneCallingCode: '93',
        },
      }),
    ).toBe('+93700123456');
  });

  it('should pass through a number already in E.164', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsapp: { primaryPhoneNumber: '+93700123456' },
      }),
    ).toBe('+93700123456');
  });

  it('should return null when the number exists without a calling code', () => {
    expect(
      resolveWhatsappRecipientPhone({
        whatsapp: { primaryPhoneNumber: '700123456' },
      }),
    ).toBeNull();
  });

  it('should return null when no phone exists', () => {
    expect(resolveWhatsappRecipientPhone({})).toBeNull();
  });
});
