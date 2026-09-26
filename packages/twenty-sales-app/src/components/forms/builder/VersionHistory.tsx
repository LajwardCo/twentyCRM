import { fetchVersions } from '../../../api/surveys';
import { useCached } from '../../../lib/cache';
import { TB } from '../../../lib/forms/builderStrings';
import { formatJalaliDateTime } from '../../../lib/jalali';
import { TSV } from '../../../lib/forms/surveyStrings';

type VersionHistoryProps = {
  formId: string;
  currentVersionNumber: number;
};

const printUrl = (formId: string, versionNumber: number) =>
  `${window.location.pathname}#/form/${formId}/print?version=${versionNumber}`;

export const VersionHistory = ({ formId, currentVersionNumber }: VersionHistoryProps) => {
  const { data, error, refresh } = useCached(`survey-versions:${formId}:${currentVersionNumber}`, () =>
    fetchVersions(formId),
  );

  if (error !== null && data === null) {
    return (
      <div className="error-banner" role="alert">
        {TSV.loadError}{' '}
        <button type="button" className="btn line sm" onClick={() => void refresh()}>
          {TSV.retry}
        </button>
      </div>
    );
  }

  if (data === null) return <div className="skeleton svb-skeleton-row" />;
  if (data.length === 0) return <p className="svb-hint">{TB.noVersions}</p>;

  return (
    <ol className="svb-versions">
      {data.map((version) => {
        const publisher = version.publishedBy
          ? `${version.publishedBy.name.firstName} ${version.publishedBy.name.lastName}`.trim()
          : '—';

        return (
          <li key={version.id} className="svb-version">
            <div className="svb-version-head">
              <strong>{TB.versionN(version.versionNumber)}</strong>
              {version.versionNumber === currentVersionNumber && <span className="pill ok">{TB.currentVersion}</span>}
              <code dir="ltr">{version.printCode}</code>
            </div>
            <div className="svb-version-meta">
              <span>{formatJalaliDateTime(version.publishedAt)}</span>
              <span>
                {TB.publishedBy}: {publisher}
              </span>
            </div>
            {version.changeNote !== '' && (
              <p className="svb-version-note" dir="auto">
                {version.changeNote}
              </p>
            )}
            <div className="svb-inline">
              <a className="btn line sm" href={`#/form/${formId}/preview?version=${version.versionNumber}`}>
                {TB.previewVersion}
              </a>
              <a className="btn line sm" href={printUrl(formId, version.versionNumber)} target="_blank" rel="noopener">
                {TB.printVersion}
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
