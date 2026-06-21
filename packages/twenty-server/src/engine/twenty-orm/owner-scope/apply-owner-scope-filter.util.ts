import { type ObjectsPermissions } from 'twenty-shared/types';
import { type WhereExpressionBuilder } from 'typeorm';

import { isUserAuthContext } from 'src/engine/core-modules/auth/guards/is-user-auth-context.guard';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { OWNER_SCOPED_OBJECTS } from 'src/engine/twenty-orm/owner-scope/owner-scoped-objects.constant';

type ApplyOwnerScopeFilterArgs = {
  queryBuilder: WhereExpressionBuilder;
  alias: string;
  objectMetadataNameSingular: string;
  objectMetadataId: string;
  objectRecordsPermissions: ObjectsPermissions | undefined;
  authContext: WorkspaceAuthContext | undefined;
  shouldBypassPermissionChecks: boolean;
};

/**
 * Original AGPL record-level scoping. When the current role is owner-scoped for
 * this object, restrict the query to records owned by the current workspace
 * member. Deliberately simple (owner == me); NOT the enterprise predicate RLS.
 */
export const applyOwnerScopeFilter = ({
  queryBuilder,
  alias,
  objectMetadataNameSingular,
  objectMetadataId,
  objectRecordsPermissions,
  authContext,
  shouldBypassPermissionChecks,
}: ApplyOwnerScopeFilterArgs): void => {
  if (shouldBypassPermissionChecks) {
    return;
  }

  const objectPermission = objectRecordsPermissions?.[objectMetadataId];

  if (objectPermission?.canOnlyAccessOwnedRecords !== true) {
    return;
  }

  const ownerColumn = OWNER_SCOPED_OBJECTS[objectMetadataNameSingular];

  if (ownerColumn === undefined) {
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

  queryBuilder.andWhere(
    `${alias}."${ownerColumn}" = :ownerScopeWorkspaceMemberId`,
    { ownerScopeWorkspaceMemberId: workspaceMemberId },
  );
};
