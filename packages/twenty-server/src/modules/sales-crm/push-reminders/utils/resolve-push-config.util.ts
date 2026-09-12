export type PushConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      publicKey: string;
      privateKey: string;
      subject: string;
    };

const PUBLIC_KEY_ENV = 'SALES_PUSH_VAPID_PUBLIC_KEY';
const PRIVATE_KEY_ENV = 'SALES_PUSH_VAPID_PRIVATE_KEY';
const SUBJECT_ENV = 'SALES_PUSH_VAPID_SUBJECT';

// Read from process.env directly, like the audit retention config: these are
// deployment secrets for one fork feature, not Twenty config variables that
// belong in the admin panel. All three present => on; anything else => the
// feature is quietly off and the app stays in-app-only.
export const resolvePushConfig = (
  env: Record<string, string | undefined>,
): PushConfig => {
  const publicKey = env[PUBLIC_KEY_ENV]?.trim() ?? '';
  const privateKey = env[PRIVATE_KEY_ENV]?.trim() ?? '';
  const subject = env[SUBJECT_ENV]?.trim() ?? '';

  const missing = [
    publicKey === '' ? PUBLIC_KEY_ENV : null,
    privateKey === '' ? PRIVATE_KEY_ENV : null,
    subject === '' ? SUBJECT_ENV : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    return { enabled: false, reason: `missing ${missing.join(', ')}` };
  }

  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    return {
      enabled: false,
      reason: `${SUBJECT_ENV} must be a mailto: or https: URL`,
    };
  }

  return { enabled: true, publicKey, privateKey, subject };
};
