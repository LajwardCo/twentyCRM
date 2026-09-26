import { type SurveyFormSummary } from '../../../api/surveys';
import { TB, formatCount } from '../../../lib/forms/builderStrings';
import { formatJalaliDate } from '../../../lib/jalali';
import { PURPOSE_LABELS, TSV } from '../../../lib/forms/surveyStrings';
import { FormRowMenu, type RowAction } from './FormRowMenu';
import { FormStatusPill, VersionLabel } from './WorkspaceHeader';

export type FormRowActions = (form: SurveyFormSummary) => { primary: RowAction[]; more: RowAction[] };

type FormsListItemsProps = {
  forms: SurveyFormSummary[];
  responseCounts: Record<string, number>;
  view: 'cards' | 'table';
  busyId: string | null;
  actionsFor: FormRowActions;
};

const ownerName = (form: SurveyFormSummary) =>
  form.owner === null ? TB.noOwner : `${form.owner.name.firstName} ${form.owner.name.lastName}`.trim() || TB.noOwner;

const builderHref = (form: SurveyFormSummary) => `#/form/${form.id}/builder`;

export const FormsListItems = ({ forms, responseCounts, view, busyId, actionsFor }: FormsListItemsProps) => {
  if (view === 'table') {
    return (
      <div className="card svb-table-wrap">
        <table className="svb-forms-table">
          <thead>
            <tr>
              <th scope="col">{TB.formName}</th>
              <th scope="col">{TSV.status}</th>
              <th scope="col">{TSV.version}</th>
              <th scope="col">{TSV.owner}</th>
              <th scope="col">{TSV.responseCount}</th>
              <th scope="col">{TSV.updatedAt}</th>
              <th scope="col">
                <span className="svb-sr">{TB.actions}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => {
              const { primary, more } = actionsFor(form);

              return (
                <tr key={form.id} className={`status-${form.formStatus.toLowerCase()}`} aria-busy={busyId === form.id}>
                  <td data-label={TB.formName}>
                    <a className="svb-form-link" href={builderHref(form)} dir="auto">
                      {form.name || TB.untitled}
                    </a>
                    {form.purpose !== null && <span className="svb-muted svb-block">{PURPOSE_LABELS[form.purpose]}</span>}
                  </td>
                  <td data-label={TSV.status}>
                    <FormStatusPill status={form.formStatus} />
                  </td>
                  <td data-label={TSV.version}>
                    <VersionLabel form={form} />
                  </td>
                  <td data-label={TSV.owner}>{ownerName(form)}</td>
                  <td data-label={TSV.responseCount}>{formatCount(responseCounts[form.id] ?? 0)}</td>
                  <td data-label={TSV.updatedAt}>{formatJalaliDate(form.updatedAt)}</td>
                  <td className="svb-row-actions">
                    {primary.map((action) => (
                      <button key={action.key} type="button" className="btn line sm" onClick={action.onSelect}>
                        {action.label}
                      </button>
                    ))}
                    <FormRowMenu formName={form.name} actions={more} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="svb-form-grid">
      {forms.map((form) => {
        const { primary, more } = actionsFor(form);

        return (
          <article
            key={form.id}
            className={`card svb-form-card status-${form.formStatus.toLowerCase()}`}
            aria-busy={busyId === form.id}
          >
            <div className="svb-form-card-top">
              <FormStatusPill status={form.formStatus} />
              <VersionLabel form={form} />
            </div>
            <h3>
              <a className="svb-form-link" href={builderHref(form)} dir="auto">
                {form.name || TB.untitled}
              </a>
            </h3>
            <p className="sub">
              {form.purpose !== null ? PURPOSE_LABELS[form.purpose] : ''}
              {form.purpose !== null && ' · '}
              {TSV.owner}: {ownerName(form)}
            </p>
            <div className="svb-form-card-stats">
              <span>
                <strong>{formatCount(responseCounts[form.id] ?? 0)}</strong> {TSV.responses}
              </span>
              <span>
                {TSV.updatedAt}: {formatJalaliDate(form.updatedAt)}
              </span>
            </div>
            <div className="svb-form-card-actions">
              {primary.map((action) => (
                <button key={action.key} type="button" className="btn line sm" onClick={action.onSelect}>
                  {action.label}
                </button>
              ))}
              <FormRowMenu formName={form.name} actions={more} />
            </div>
          </article>
        );
      })}
    </div>
  );
};
