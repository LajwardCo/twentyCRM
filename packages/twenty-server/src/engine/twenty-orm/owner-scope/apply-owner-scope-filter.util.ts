import { type ObjectsPermissions } from 'twenty-shared/types';
import { type DataSource, type WhereExpressionBuilder } from 'typeorm';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import {
  OWNER_SCOPED_OBJECTS,
  type OwnerScopeRule,
} from 'src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant';
import {
  hasColumn,
  resolveOwnerScopeTable,
} from 'src/engine/twenty-orm/owner-scope/resolve-owner-scope-table.util';

const MEMBER_PARAM = 'ownerScopeWorkspaceMemberId';

type ApplyOwnerScopeFilterArgs = {
  queryBuilder: WhereExpressionBuilder;
  alias: string;
  objectMetadataNameSingular: string;
  objectMetadataId: string;
  objectRecordsPermissions: ObjectsPermissions | undefined;
  authContext: WorkspaceAuthContext | undefined;
  shouldBypassPermissionChecks: boolean;
  connection: DataSource;
};

// Builds the SQL for one rule, or null when the rule cannot be expressed in
// this workspace.
//
// Several of the columns these rules name -- opportunity.referrerId,
// opportunity.marketerPartnerId, partner.memberId -- are provisioned by script
// rather than seeded, so a given workspace may legitimately be missing any of
// them. Every column is therefore checked against the ORM's registry before it
// reaches SQL: an unresolvable rule is dropped, which can only narrow access,
// never widen it. (If every rule for an object drops, the caller denies
// outright rather than falling through to an unfiltered query.)
const buildRuleSql = (
  rule: OwnerScopeRule,
  alias: string,
  objectMetadataNameSingular: string,
  connection: DataSource,
): string | null => {
  if (!hasColumn(objectMetadataNameSingular, rule.column, connection)) {
    return null;
  }

  if (rule.kind === 'column') {
    return `${alias}."${rule.column}" = :${MEMBER_PARAM}`;
  }

  if (
    !hasColumn(
      rule.targetObjectNameSingular,
      rule.targetMemberColumn,
      connection,
    )
  ) {
    return null;
  }

  const table = resolveOwnerScopeTable(
    rule.targetObjectNameSingular,
    connection,
  );

  if (table === null) {
    return null;
  }

  // A soft-deleted partner must not keep granting access to its leads.
  return (
    `${alias}."${rule.column}" IN (` +
    `SELECT "id" FROM ${table} ` +
    `WHERE "${rule.targetMemberColumn}" = :${MEMBER_PARAM} ` +
    `AND "deletedAt" IS NULL)`
  );
};

/**
 * Original AGPL record-level scoping. When the current role is owner-scoped for
 * this object, restrict the query to records the current workspace member is
 * involved with -- as owner, or through a partner record credited on the
 * record. Deliberately simple; NOT the enterprise predicate RLS.
 */
export const applyOwnerScopeFilter = ({
  queryBuilder,
  alias,
  objectMetadataNameSingular,
  objectMetadataId,
  objectRecordsPermissions,
  authContext,
  shouldBypassPermissionChecks,
  connection,
}: ApplyOwnerScopeFilterArgs): void => {
  if (shouldBypassPermissionChecks) {
    return;
  }

  const objectPermission = objectRecordsPermissions?.[objectMetadataId];

  if (objectPermission?.canOnlyAccessOwnedRecords !== true) {
    return;
  }

  const rules = OWNER_SCOPED_OBJECTS[objectMetadataNameSingular];

  if (rules === undefined) {
    return;
  }

  const workspaceMemberId =
    authContext !== undefined && isUserAuthContext(authContext)
      ? authContext.workspaceMemberId
      : null;

  // Scoped role but no workspace member identity (e.g. API key): deny all,
  // never silently widen access.
  if (workspaceMemberId === null) {
    queryBuilder.andWhere('1 = 0');

    return;
  }

  const clauses = rules
    .map((rule) =>
      buildRuleSql(rule, alias, objectMetadataNameSingular, connection),
    )
    .filter((clause): clause is string => clause !== null);

  // The object is configured as scoped but nothing could be expressed. Deny
  // rather than fall through to an unfiltered query.
  if (clauses.length === 0) {
    queryBuilder.andWhere('1 = 0');

    return;
  }

  queryBuilder.andWhere(`(${clauses.join(' OR ')})`, {
    [MEMBER_PARAM]: workspaceMemberId,
  });
};
