import { AUDIT_LOG_RETENTION_MIN_DAYS } from 'src/modules/sales-crm/audit-log/constants/audit-log-retention.constant';
import {
  cutoffDateFor,
  DEFAULT_AUDIT_RETENTION_DAYS,
  resolveAuditRetention,
} from 'src/modules/sales-crm/audit-log/utils/resolve-audit-retention.util';

describe('resolveAuditRetention', () => {
  it('uses the tiered defaults when nothing is configured', () => {
    const { policy, warnings } = resolveAuditRetention({});

    expect(policy).toEqual(DEFAULT_AUDIT_RETENTION_DAYS);
    expect(warnings).toEqual([]);
  });

  it('keeps evidence longer than noise', () => {
    const { policy } = resolveAuditRetention({});

    expect(policy.critical).toBeGreaterThan(policy.sensitive);
    expect(policy.sensitive).toBeGreaterThan(policy.notice);
    expect(policy.notice).toBeGreaterThan(policy.info);
  });

  it('lets one setting cover every severity', () => {
    const { policy } = resolveAuditRetention({
      SALES_AUDIT_RETENTION_DAYS: '540',
    });

    expect(policy).toEqual({
      info: 540,
      notice: 540,
      sensitive: 540,
      critical: 540,
    });
  });

  it('lets a per-severity setting override the uniform one', () => {
    const { policy } = resolveAuditRetention({
      SALES_AUDIT_RETENTION_DAYS: '180',
      SALES_AUDIT_RETENTION_DAYS_CRITICAL: '1095',
    });

    expect(policy).toEqual({
      info: 180,
      notice: 180,
      sensitive: 180,
      critical: 1095,
    });
  });

  it('treats 0 as keep-forever and does not clamp it', () => {
    const { policy, warnings } = resolveAuditRetention({
      SALES_AUDIT_RETENTION_DAYS_CRITICAL: '0',
    });

    expect(policy.critical).toBe(0);
    expect(warnings).toEqual([]);
  });

  it('refuses to prune below the safety floor, and says so', () => {
    const { policy, warnings } = resolveAuditRetention({
      SALES_AUDIT_RETENTION_DAYS: '1',
    });

    expect(policy.info).toBe(AUDIT_LOG_RETENTION_MIN_DAYS);
    expect(policy.critical).toBe(AUDIT_LOG_RETENTION_MIN_DAYS);
    expect(warnings.join(' ')).toContain('minimum');
  });

  it('ignores junk and negatives rather than pruning on a garbage value', () => {
    for (const bad of ['soon', '-5', '30.5', '']) {
      const { policy, warnings } = resolveAuditRetention({
        SALES_AUDIT_RETENTION_DAYS: bad,
      });

      expect(policy).toEqual(DEFAULT_AUDIT_RETENTION_DAYS);
      // An empty value is "unset", not a mistake worth warning about.
      expect(warnings.length).toBe(bad === '' ? 0 : 1);
    }
  });
});

describe('cutoffDateFor', () => {
  const now = new Date('2026-09-07T14:35:12.000Z');

  it('anchors the boundary to midnight UTC so runs agree', () => {
    expect(cutoffDateFor(90, now)?.toISOString()).toBe(
      '2026-06-09T00:00:00.000Z',
    );
  });

  it('is null when the severity is kept forever', () => {
    expect(cutoffDateFor(0, now)).toBeNull();
    expect(cutoffDateFor(-1, now)).toBeNull();
  });

  it('does not depend on the time of day the job runs', () => {
    const early = cutoffDateFor(30, new Date('2026-09-07T00:00:01.000Z'));
    const late = cutoffDateFor(30, new Date('2026-09-07T23:59:59.000Z'));

    expect(early?.toISOString()).toBe(late?.toISOString());
  });
});
