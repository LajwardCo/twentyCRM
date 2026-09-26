import { type CurrentUser } from '../../api/auth';
import { ResponsesTable } from '../../components/forms/responses/ResponsesTable';
import { TSR } from '../../lib/forms/responseStrings';
import {
  parseViewFilter,
  serializeViewFilter,
} from '../../lib/forms/responses/responseQuery';
import { TSV } from '../../lib/forms/surveyStrings';
import { useSurveyCapabilities } from '../../lib/forms/useSurveyCapabilities';
import { replaceQuery } from '../../lib/router';

// Cross-form responses. Filters live in the URL (replaceQuery, no history
// entry per keystroke) so a filtered view can be shared or bookmarked.
export const ResponsesView = ({ query }: { query: string; user: CurrentUser }) => {
  const { capabilities, loading } = useSurveyCapabilities();

  return (
    <main className="page svr-page">
      <div className="page-head anim">
        <div>
          <h1>{TSR.title}</h1>
          <div className="sub">{TSR.sub}</div>
        </div>
      </div>
      {!loading && !capabilities.supported ? (
        <div className="empty-state">{TSV.notProvisioned}</div>
      ) : (
        <ResponsesTable
          // replaceQuery fires no hashchange, so this only remounts on a real
          // navigation to a different filtered link.
          key={query}
          initialFilter={parseViewFilter(query)}
          onFilterChange={(filter) => replaceQuery(serializeViewFilter(filter))}
        />
      )}
    </main>
  );
};
