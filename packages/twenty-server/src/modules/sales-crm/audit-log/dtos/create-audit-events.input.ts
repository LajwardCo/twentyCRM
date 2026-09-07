import { IsArray } from 'class-validator';

/**
 * The batch body. Deliberately loose: every element is validated and clamped
 * by sanitizeAuditEvents, which fails soft (drops the bad event, keeps the
 * batch) rather than rejecting the request. A stricter DTO would mean one
 * malformed event from an older app version discards the fifty good ones next
 * to it -- exactly the silent gap an audit log must not have.
 */
export class CreateAuditEventsInput {
  @IsArray()
  events: unknown[];
}
