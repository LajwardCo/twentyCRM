import { FieldActorSource } from 'twenty-shared/types';

export type SurveyActor = {
  name: string;
  workspaceMemberId: string | null;
};

const toActorComposite = ({ name, workspaceMemberId }: SurveyActor) => ({
  source:
    workspaceMemberId === null ? FieldActorSource.API : FieldActorSource.MANUAL,
  workspaceMemberId,
  name,
  context: {},
});

// Values for a server-side insert of a custom-object record. Writing through
// the workspace ORM directly (rather than the record API) needs the actor
// composites spelled out, and null foreign keys omitted rather than passed —
// otherwise the insert fails with a masked "Data validation error".
export const buildSurveyRecordValues = <
  TValues extends Record<string, unknown>,
>(
  values: TValues,
  actor: SurveyActor,
): Record<string, unknown> => {
  const compact = Object.fromEntries(
    Object.entries(values).filter(
      ([key, value]) =>
        value !== undefined && !(value === null && key.endsWith('Id')),
    ),
  );

  return {
    ...compact,
    createdBy: toActorComposite(actor),
    updatedBy: toActorComposite(actor),
  };
};
