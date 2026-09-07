// Runs shortly after midnight UTC, offset from the other nightly cleanups so
// they are not all competing for the workspace queue at once.
export const AUDIT_LOG_RETENTION_CRON_PATTERN = '25 0 * * *';

// Rows deleted per query. Audit tables get large; deleting a year of
// navigation noise in one statement would hold locks for a long time.
export const AUDIT_LOG_RETENTION_BATCH_SIZE = 1_000;

// Ceiling per workspace per night. A first run against a log that has never
// been pruned should take several nights rather than one very long job.
export const AUDIT_LOG_RETENTION_MAX_DELETIONS_PER_RUN = 50_000;

// Nothing is pruned below this age, whatever the configuration says.
//
// This is a safety floor, not a default. Pruning is the one operation that
// destroys audit evidence, so it is also the most attractive thing for someone
// to misconfigure -- "retention: 1 day" would quietly erase the record of
// whatever they did yesterday. A typo cannot get past this.
export const AUDIT_LOG_RETENTION_MIN_DAYS = 30;
