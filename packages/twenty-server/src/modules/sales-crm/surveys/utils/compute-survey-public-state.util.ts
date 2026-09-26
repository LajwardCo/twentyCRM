import {
  type SurveyFormRecord,
  type SurveyInvitationRecord,
} from 'src/modules/sales-crm/surveys/types/survey-records.type';
import { type SurveyPublicState } from 'src/modules/sales-crm/surveys/types/survey-public-state.type';

const toTime = (value: string | Date | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const time = new Date(value).getTime();

  return Number.isNaN(time) ? null : time;
};

// Whether a respondent may open and submit a form right now. `invitation` is
// undefined when no invitation token was supplied, null when one was supplied
// but matches nothing (or was revoked).
export const computeSurveyPublicState = ({
  form,
  now,
  completedResponses,
  invitation,
}: {
  form: Pick<
    SurveyFormRecord,
    | 'formStatus'
    | 'publicEnabled'
    | 'publishedVersionId'
    | 'opensAt'
    | 'closesAt'
    | 'responseLimit'
  >;
  now: number;
  completedResponses: number;
  invitation: SurveyInvitationRecord | null | undefined;
}): SurveyPublicState => {
  if (invitation === null) {
    return 'INVALID';
  }

  // An invitation opens a form even when its general public link is off:
  // that is how an invitation-only form works.
  const reachable = invitation !== undefined || form.publicEnabled === true;

  if (
    !reachable ||
    form.publishedVersionId === null ||
    form.formStatus === 'DRAFT' ||
    form.formStatus === 'ARCHIVED' ||
    form.formStatus === null
  ) {
    return 'INVALID';
  }

  if (form.formStatus === 'CLOSED') {
    return 'CLOSED';
  }

  if (invitation !== undefined) {
    if (invitation.invitationStatus === 'REVOKED') {
      return 'INVALID';
    }

    if (invitation.invitationStatus === 'USED') {
      return 'CLOSED';
    }

    const invitationExpiry = toTime(invitation.expiresAt);

    if (invitationExpiry !== null && invitationExpiry <= now) {
      return 'EXPIRED';
    }
  }

  const opensAt = toTime(form.opensAt);

  if (opensAt !== null && opensAt > now) {
    return 'NOT_YET_OPEN';
  }

  const closesAt = toTime(form.closesAt);

  if (closesAt !== null && closesAt <= now) {
    return 'EXPIRED';
  }

  if (
    typeof form.responseLimit === 'number' &&
    form.responseLimit > 0 &&
    completedResponses >= form.responseLimit
  ) {
    return 'LIMIT_REACHED';
  }

  return 'OPEN';
};
