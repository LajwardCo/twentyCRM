import {
  type CompletionStatus,
  type ReviewStatus,
  type SurveySource,
} from '../../../api/surveys';
import {
  COMPLETION_LABELS,
  REVIEW_LABELS,
  SOURCE_LABELS,
} from '../../../lib/forms/surveyStrings';

// Completion (did the respondent finish?) and review (what has staff done
// with it?) are different questions, so they get visibly different badges:
// completion is an outlined tag, review a filled pill.

export const CompletionBadge = ({ status }: { status: CompletionStatus }) => (
  <span className={`svr-tag svr-completion-${status.toLowerCase()}`}>
    {COMPLETION_LABELS[status] ?? status}
  </span>
);

export const ReviewBadge = ({ status }: { status: ReviewStatus }) => (
  <span className={`svr-pill svr-review-${status.toLowerCase()}`}>
    {REVIEW_LABELS[status] ?? status}
  </span>
);

export const SourceLabel = ({ source }: { source: SurveySource }) => (
  <span className="svr-source">{SOURCE_LABELS[source] ?? source}</span>
);
