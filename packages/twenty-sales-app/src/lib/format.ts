export const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
};

export const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—';
  return `${formatDate(iso)} ${new Date(iso).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

export const startOfToday = (): Date => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export const endOfToday = (): Date => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

// datetime-local input value (local time, minutes precision)
export const toLocalInputValue = (date: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fullPhone = (
  phones: {
    primaryPhoneCallingCode: string | null;
    primaryPhoneNumber: string | null;
  } | null,
): string | null => {
  if (!phones?.primaryPhoneNumber) return null;
  const code = phones.primaryPhoneCallingCode ?? '';
  return `${code}${phones.primaryPhoneNumber}`;
};

export const personName = (
  person: { name: { firstName: string; lastName: string } } | null,
): string =>
  person
    ? `${person.name.firstName} ${person.name.lastName}`.trim()
    : '—';
