import { isNonEmptyString } from '@sniptt/guards';

// PHONES composite fields hydrate as nested objects on ORM records,
// mirroring how CURRENCY hydrates ({amountMicros, currencyCode}).
type PhonesCompositeValue = {
  primaryPhoneNumber?: string | null;
  primaryPhoneCallingCode?: string | null;
} | null;

type PersonPhoneFields = {
  whatsapp?: PhonesCompositeValue;
  phones?: PhonesCompositeValue;
};

const composeE164 = (value: PhonesCompositeValue | undefined): string | null => {
  if (!isNonEmptyString(value?.primaryPhoneNumber)) {
    return null;
  }

  const cleaned = value.primaryPhoneNumber.replace(/[\s\-()]/g, '');

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  if (!isNonEmptyString(value.primaryPhoneCallingCode)) {
    return null;
  }

  // Meta requires E.164: calling code + national number without the trunk zero
  const nationalNumber = cleaned.replace(/^0/, '');
  const callingCode = value.primaryPhoneCallingCode;
  const normalizedCallingCode = callingCode.startsWith('+')
    ? callingCode
    : `+${callingCode}`;

  return `${normalizedCallingCode}${nationalNumber}`;
};

export const resolveWhatsappRecipientPhone = (
  person: PersonPhoneFields,
): string | null =>
  composeE164(person.whatsapp) ?? composeE164(person.phones);
