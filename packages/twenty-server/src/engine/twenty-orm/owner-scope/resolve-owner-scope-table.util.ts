import { type DataSource } from 'typeorm';

/**
 * Schema-qualified, quoted table name for the object an owner-scope `via` rule
 * points at, or null when that object does not exist in this workspace.
 *
 * Resolved through TypeORM's own entity registry rather than rebuilt from
 * object metadata: custom objects carry a `_` table prefix that is derived from
 * `isCustom`, and that flag is not dependable on flat metadata (it is being
 * dropped -- see the 2.12 upgrade command). Reading the table name the ORM
 * actually uses cannot drift from the table the query runs against.
 *
 * Null is expected, not exceptional: the `partner` object is provisioned by a
 * script, so a workspace that has not run it yet has no partner entity.
 * Callers must treat null as "this rule grants nothing".
 */
/**
 * Whether an object carries a given physical column in this workspace.
 *
 * Owner-scope rules name columns that scripts provision, so "the column is not
 * there" is a normal state to handle, not a bug to crash on.
 */
export const hasColumn = (
  nameSingular: string,
  column: string,
  connection: DataSource,
): boolean => {
  if (!connection.hasMetadata(nameSingular)) {
    return false;
  }

  return (
    connection.getMetadata(nameSingular).findColumnWithDatabaseName(column) !==
    undefined
  );
};

export const resolveOwnerScopeTable = (
  nameSingular: string,
  connection: DataSource,
): string | null => {
  if (!connection.hasMetadata(nameSingular)) {
    return null;
  }

  const { schema, tableName } = connection.getMetadata(nameSingular);

  if (schema === undefined) {
    return null;
  }

  return `"${schema}"."${tableName}"`;
};
