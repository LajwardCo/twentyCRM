import { type CurrentUser } from '../../../api/auth';
import { TSR } from '../../../lib/forms/responseStrings';
import { EMPTY_VIEW_FILTER } from '../../../lib/forms/responses/responseQuery';
import { useSurveyCapabilities } from '../../../lib/forms/useSurveyCapabilities';
import { ResponsesTable } from '../responses/ResponsesTable';

// The responses table scoped to one form, inside the form workspace. Filters
// stay local here: the workspace route owns the URL.
export const FormResponsesPanel = ({ formId }: { formId: string; user: CurrentUser }) => {
  const { capabilities } = useSurveyCapabilities();

  return (
    <section className="svr-panel">
      {capabilities.canCollect && (
        <div className="svr-panel-links">
          <a className="btn line sm" href={`#/form/${formId}/paper`}>
            {TSR.enterPaper}
          </a>
          <a className="btn line sm" href={`#/form/${formId}/collect`}>
            {TSR.collect}
          </a>
        </div>
      )}
      <ResponsesTable key={formId} initialFilter={{ ...EMPTY_VIEW_FILTER, formId }} fixedFormId={formId} />
    </section>
  );
};
