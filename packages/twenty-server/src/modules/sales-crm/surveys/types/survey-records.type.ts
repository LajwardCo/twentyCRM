import { type FormDefinition } from 'twenty-shared/surveys';

// Minimal shapes of the provisioned custom objects, as read through the
// workspace ORM. Custom objects have no generated workspace entity class.

export type SurveyFormStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'ARCHIVED';

export type SurveyFormRecord = {
  id: string;
  name: string | null;
  formStatus: SurveyFormStatus | null;
  draftDefinition: FormDefinition | null;
  draftRevision: number | null;
  currentVersionNumber: number | null;
  hasUnpublishedChanges: boolean | null;
  publicSlug: string | null;
  publicEnabled: boolean | null;
  opensAt: string | Date | null;
  closesAt: string | Date | null;
  responseLimit: number | null;
  publishedVersionId: string | null;
  ownerId: string | null;
  deletedAt?: string | Date | null;
};

export type SurveyFormVersionRecord = {
  id: string;
  name: string | null;
  formId: string | null;
  versionNumber: number | null;
  definition: FormDefinition | null;
  publishedAt: string | Date | null;
  publishedById: string | null;
  changeNote: string | null;
  printCode: string | null;
};

export type SurveyResponseSource =
  | 'PUBLIC_LINK'
  | 'INVITATION'
  | 'STAFF_VISIT'
  | 'PAPER';

export type SurveyCompletionStatus = 'PARTIAL' | 'COMPLETED';

export type SurveyReviewStatus =
  | 'NEW'
  | 'NEEDS_REVIEW'
  | 'REVIEWED'
  | 'ACTIONED'
  | 'SPAM';

export type SurveyCrmAction = {
  key: string;
  type: string;
  status: 'DONE' | 'FAILED' | 'SUGGESTED';
  at: string;
  by: string | null;
  recordId?: string | null;
  target?: string;
  error?: string;
};

export type SurveyResponseRecord = {
  id: string;
  name: string | null;
  formId: string | null;
  formVersionId: string | null;
  versionNumber: number | null;
  submissionKey: string | null;
  answers: Record<string, unknown> | null;
  skippedByLogic: string[] | null;
  language: string | null;
  completionStatus: SurveyCompletionStatus | null;
  reviewStatus: SurveyReviewStatus | null;
  source: SurveyResponseSource | null;
  collectedAt: string | Date | null;
  submittedAt: string | Date | null;
  enteredAt: string | Date | null;
  paperReference: string | null;
  collectorId: string | null;
  enteredById: string | null;
  companyId: string | null;
  personId: string | null;
  opportunityId: string | null;
  campaignId: string | null;
  visitId: string | null;
  invitationId: string | null;
  crmActions: SurveyCrmAction[] | null;
};

export type SurveyCampaignRecord = {
  id: string;
  name: string | null;
  campaignStatus: 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | null;
  publicCode: string | null;
  formIds: string[] | null;
};

export type SurveyInvitationRecord = {
  id: string;
  formId: string | null;
  campaignId: string | null;
  companyId: string | null;
  personId: string | null;
  opportunityId: string | null;
  tokenHash: string | null;
  invitationStatus: 'ACTIVE' | 'USED' | 'REVOKED' | null;
  expiresAt: string | Date | null;
  usedAt: string | Date | null;
};
