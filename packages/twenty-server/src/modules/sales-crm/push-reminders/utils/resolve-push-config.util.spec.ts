import { resolvePushConfig } from 'src/modules/sales-crm/push-reminders/utils/resolve-push-config.util';

describe('resolvePushConfig', () => {
  const full = {
    SALES_PUSH_VAPID_PUBLIC_KEY: 'pub',
    SALES_PUSH_VAPID_PRIVATE_KEY: 'priv',
    SALES_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com',
  };

  it('is enabled only when all three variables are set', () => {
    expect(resolvePushConfig(full)).toEqual({
      enabled: true,
      publicKey: 'pub',
      privateKey: 'priv',
      subject: 'mailto:ops@example.com',
    });
  });

  it('names what is missing', () => {
    const config = resolvePushConfig({ SALES_PUSH_VAPID_PUBLIC_KEY: 'pub' });

    expect(config.enabled).toBe(false);
    expect(config).toMatchObject({
      reason: 'missing SALES_PUSH_VAPID_PRIVATE_KEY, SALES_PUSH_VAPID_SUBJECT',
    });
  });

  it('rejects a subject that is neither mailto: nor https:', () => {
    expect(
      resolvePushConfig({
        ...full,
        SALES_PUSH_VAPID_SUBJECT: 'ops@example.com',
      }).enabled,
    ).toBe(false);
    expect(
      resolvePushConfig({
        ...full,
        SALES_PUSH_VAPID_SUBJECT: 'https://crm.example.com',
      }).enabled,
    ).toBe(true);
  });
});
