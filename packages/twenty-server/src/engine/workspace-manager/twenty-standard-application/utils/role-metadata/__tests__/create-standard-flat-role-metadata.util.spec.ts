import {
  type CreateStandardRoleArgs,
  type CreateStandardRoleContext,
} from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-role-flat-metadata.util';
import { STANDARD_FLAT_ROLE_METADATA_BUILDERS_BY_ROLE_NAME } from 'src/engine/workspace-manager/twenty-standard-application/utils/role-metadata/create-standard-flat-role-metadata.util';

// The builder reads only these three fields off its args; the rest of
// CreateStandardRoleArgs is dependency plumbing it passes nowhere.
const args = {
  workspaceId: '20202020-1c25-4d02-bf25-6aeccf7ea419',
  twentyStandardApplicationId: '20202020-8f4f-4a1a-9f0a-3a0f0a0f0a0f',
  now: new Date('2026-01-01T00:00:00.000Z'),
} as unknown as Omit<CreateStandardRoleArgs, 'context'>;

describe('standard Admin role', () => {
  const admin = STANDARD_FLAT_ROLE_METADATA_BUILDERS_BY_ROLE_NAME.admin(args);

  // FORK BEHAVIOUR. Upstream ships canDestroyAllObjectRecords: true.
  //
  // This deployment never hard-deletes: `delete<Object>` is reversible from the
  // trash, `destroy<Object>` is not, and nothing on the instance should be able
  // to reach the second one. Every other role is denied it by
  // tools/sales-crm/provision-no-hard-delete.mjs, but Admin is unreachable that
  // way -- it is a standard role with isEditable: false, so the API rejects the
  // update with ROLE_NOT_EDITABLE, and a direct database edit is undone the
  // next time the standard application reconciles drift.
  //
  // The manifest is therefore the only durable place to say it, and this test
  // is here so a merge from upstream that restores `true` fails loudly instead
  // of quietly handing four accounts the ability to erase records for good.
  it('cannot destroy records', () => {
    expect(admin.canDestroyAllObjectRecords).toBe(false);
  });

  // Soft delete is the point: removal stays available, it just stays undoable.
  it('can still soft delete', () => {
    expect(admin.canSoftDeleteAllObjectRecords).toBe(true);
  });

  // The rest of Admin is untouched -- this is not a general de-privileging.
  it('keeps every other administrative power', () => {
    expect(admin).toMatchObject<Partial<CreateStandardRoleContext>>({
      label: 'Admin',
      isEditable: false,
      canUpdateAllSettings: true,
      canAccessAllTools: true,
      canReadAllObjectRecords: true,
      canUpdateAllObjectRecords: true,
      canBeAssignedToUsers: true,
    });
  });
});
