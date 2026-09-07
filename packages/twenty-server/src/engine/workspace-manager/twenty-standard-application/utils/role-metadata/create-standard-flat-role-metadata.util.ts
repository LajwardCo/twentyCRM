import { type FlatRole } from 'src/engine/metadata-modules/flat-role/types/flat-role.type';
import { type AllStandardRoleName } from 'src/engine/workspace-manager/twenty-standard-application/types/all-standard-role-name.type';
import {
  type CreateStandardRoleArgs,
  createStandardRoleFlatMetadata,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-role-flat-metadata.util';

export const STANDARD_FLAT_ROLE_METADATA_BUILDERS_BY_ROLE_NAME = {
  admin: (args: Omit<CreateStandardRoleArgs, 'context'>) =>
    createStandardRoleFlatMetadata({
      ...args,
      context: {
        roleName: 'admin',
        label: 'Admin',
        description: 'Admin role',
        icon: 'IconUserCog',
        isEditable: false,
        canUpdateAllSettings: true,
        canAccessAllTools: true,
        canReadAllObjectRecords: true,
        canUpdateAllObjectRecords: true,
        canSoftDeleteAllObjectRecords: true,
        // FORK CHANGE: upstream ships this as `true`.
        //
        // This instance never hard-deletes. `delete<Object>` sets deletedAt and
        // the record stays restorable from the trash; `destroy<Object>` erases
        // it. Every other role is denied destroy by
        // tools/sales-crm/provision-no-hard-delete.mjs, but Admin cannot be
        // reached that way: it is a standard role with isEditable: false, so
        // the API rejects the update with ROLE_NOT_EDITABLE, and editing the
        // row directly would be reverted the next time the standard
        // application reconciles drift. Changing the manifest is what makes it
        // stick -- that same reconciliation now enforces it.
        //
        // Keep this false when merging upstream. See the spec beside this file.
        canDestroyAllObjectRecords: false,
        canOnlyAccessOwnedRecords: false,
        canBeAssignedToUsers: true,
        canBeAssignedToAgents: false,
        canBeAssignedToApiKeys: true,
      },
    }),
} satisfies {
  [P in AllStandardRoleName]: (
    args: Omit<CreateStandardRoleArgs, 'context'>,
  ) => FlatRole;
};
