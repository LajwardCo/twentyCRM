export type SingleChoiceAnswer = {
  choiceId?: string;
  // Filled when the respondent picked "Other".
  otherText?: string;
};

export type MultiChoiceAnswer = {
  choiceIds: string[];
  otherText?: string;
};

export type AddressAnswer = {
  street?: string;
  district?: string;
  city?: string;
  province?: string;
  country?: string;
};

export type LocationAnswer = {
  lat?: number;
  lng?: number;
  accuracy?: number;
  source: 'GPS' | 'MANUAL';
  // Manual fallback when coordinates are unavailable.
  description?: string;
};

// A file answer never carries the bytes: it is a reference produced by an
// upload endpoint, validated again by the server when the response is saved.
export type FileAnswer = {
  ref: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

// CRM selection questions store the chosen record id (staff-only).
export type CrmRecordAnswer = {
  recordId: string;
  label: string;
};

export type AnswerValue =
  | string
  | number
  | boolean
  | SingleChoiceAnswer
  | MultiChoiceAnswer
  | AddressAnswer
  | LocationAnswer
  | FileAnswer[]
  | CrmRecordAnswer;

export type FormAnswers = Record<string, AnswerValue | null | undefined>;
