import { type RestrictedFieldsPermissions } from './RestrictedFieldsPermissions';
import { type RowLevelPermissionPredicate } from './RowLevelPermissionPredicate';
import { type RowLevelPermissionPredicateGroup } from './RowLevelPermissionPredicateGroup';

export type ObjectPermissions = {
  canReadObjectRecords: boolean;
  canUpdateObjectRecords: boolean;
  canSoftDeleteObjectRecords: boolean;
  canDestroyObjectRecords: boolean;
  restrictedFields: RestrictedFieldsPermissions;
  rowLevelPermissionPredicates: RowLevelPermissionPredicate[];
  rowLevelPermissionPredicateGroups: RowLevelPermissionPredicateGroup[];
  /**
   * Original AGPL record-level scoping flag. When true for this object, the
   * twenty-orm query builders restrict reads/writes to records owned by the
   * current workspace member. Optional so existing constructors stay valid.
   */
  canOnlyAccessOwnedRecords?: boolean;
};
