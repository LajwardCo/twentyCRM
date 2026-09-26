import {
  type FileAnswer,
  type FormDefinition,
  type FormLanguage,
  type Question,
} from '@shared/surveys';
import { type ReactNode } from 'react';

import { type RespondentStrings } from '../../../lib/forms/surveyStrings';

export type QuestionInputProps = {
  question: Question;
  definition: FormDefinition;
  language: FormLanguage;
  strings: RespondentStrings;
  value: unknown;
  onChange: (value: unknown) => void;
  inputId: string;
  describedBy: string | undefined;
  invalid: boolean;
  disabled?: boolean;
};

// Hooks the host screen supplies for inputs that need the network or CRM.
export type RendererServices = {
  // Stores a file and returns the answer reference. Absent in preview, where
  // a file is represented by its name only.
  uploadFile?: (question: Question, file: File) => Promise<FileAnswer>;
  // Staff-only CRM pickers (company / contact / lead). Never provided on the
  // public form, and the public definition never contains these questions.
  renderCrmPicker?: (
    question: Question,
    value: unknown,
    onChange: (value: unknown) => void,
  ) => ReactNode;
};
