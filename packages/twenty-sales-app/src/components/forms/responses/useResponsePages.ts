import { useCallback, useEffect, useRef, useState } from 'react';

import { queryResponses } from '../../../api/surveyResponseExtras';
import { type SurveyResponse } from '../../../api/surveys';
import { type ApiResponseQuery } from '../../../lib/forms/responses/responseQuery';

const PAGE_SIZE = 50;

type PagesState = {
  responses: SurveyResponse[];
  totalCount: number | null;
  endCursor: string | null;
  hasNextPage: boolean;
  loading: boolean;
  error: string | null;
};

const INITIAL: PagesState = {
  responses: [],
  totalCount: null,
  endCursor: null,
  hasNextPage: false,
  loading: true,
  error: null,
};

// Cursor-paged responses for one filter. A response to a superseded filter
// (the user kept typing) is dropped by the request counter, so the table never
// shows rows for a filter it no longer displays.
export const useResponsePages = (query: ApiResponseQuery) => {
  const [state, setState] = useState<PagesState>(INITIAL);
  const requestRef = useRef(0);
  const key = JSON.stringify(query);

  const load = useCallback(
    async (after: string | null) => {
      const request = ++requestRef.current;

      setState((previous) => ({ ...(after === null ? INITIAL : previous), loading: true, error: null }));

      try {
        const page = await queryResponses(query.filter, {
          excludeSpam: query.excludeSpam,
          first: PAGE_SIZE,
          after,
        });

        if (request !== requestRef.current) return;

        setState((previous) => ({
          responses: after === null ? page.responses : [...previous.responses, ...page.responses],
          totalCount: page.totalCount,
          endCursor: page.endCursor,
          hasNextPage: page.hasNextPage,
          loading: false,
          error: null,
        }));
      } catch (error) {
        if (request !== requestRef.current) return;

        setState((previous) => ({
          ...previous,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  useEffect(() => {
    void load(null);
  }, [load]);

  const patchRow = (responseId: string, patch: Partial<SurveyResponse>) =>
    setState((previous) => ({
      ...previous,
      responses: previous.responses.map((response) =>
        response.id === responseId ? { ...response, ...patch } : response,
      ),
    }));

  return {
    ...state,
    loadMore: () => (state.endCursor === null ? undefined : void load(state.endCursor)),
    reload: () => void load(null),
    patchRow,
  };
};
