import { type PublishIssue, type PublishValidation } from '@shared/surveys';

import { TB } from '../../../lib/forms/builderStrings';

type IssueListProps = {
  validation: PublishValidation;
  onSelect?: (issue: PublishIssue) => void;
  compact?: boolean;
};

// Publish check results. Each issue is a button when it can take the user
// to the thing that needs fixing.
export const IssueList = ({ validation, onSelect, compact = false }: IssueListProps) => {
  const { errors, warnings } = validation;

  if (errors.length === 0 && warnings.length === 0) {
    return <p className="svb-issues-ok">{TB.noIssues}</p>;
  }

  const row = (issue: PublishIssue, severity: 'error' | 'warning', index: number) => {
    const content = (
      <>
        <span className={`svb-sev ${severity}`}>{severity === 'error' ? TB.error : TB.warning}</span>
        <span>{issue.message}</span>
      </>
    );

    return (
      <li key={`${severity}-${index}`}>
        {onSelect === undefined ? (
          <div className="svb-issue">{content}</div>
        ) : (
          <button type="button" className="svb-issue" onClick={() => onSelect(issue)}>
            {content}
          </button>
        )}
      </li>
    );
  };

  return (
    <div className={`svb-issues${compact ? ' compact' : ''}`}>
      <p className="svb-issues-count">
        {errors.length > 0 && <span className="pill hot">{TB.errorsN(errors.length)}</span>}
        {warnings.length > 0 && <span className="pill warm">{TB.warningsN(warnings.length)}</span>}
      </p>
      <ul>
        {errors.map((issue, index) => row(issue, 'error', index))}
        {warnings.map((issue, index) => row(issue, 'warning', index))}
      </ul>
    </div>
  );
};
