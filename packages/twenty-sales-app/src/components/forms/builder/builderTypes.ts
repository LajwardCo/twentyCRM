import { type FormDefinition, type FormLanguage } from '@shared/surveys';

export type DefinitionUpdater = (definition: FormDefinition) => FormDefinition;

export type BuilderSelection =
  | { kind: 'item'; id: string }
  | { kind: 'page'; id: string }
  | null;

// What every editing surface of the workspace receives.
export type EditorProps = {
  definition: FormDefinition;
  onEdit: (updater: DefinitionUpdater) => void;
  readOnly: boolean;
  // Language whose texts the inputs currently edit.
  editLanguage: FormLanguage;
  onEditLanguageChange: (language: FormLanguage) => void;
};
