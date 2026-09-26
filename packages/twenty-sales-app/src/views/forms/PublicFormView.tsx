import { useCallback, useEffect, useMemo, useState } from 'react';

import { type PublicFormState, fetchPublicForm } from '../../api/surveys';
import { PublicFormFill, type OpenPublicForm } from '../../components/forms/collect/PublicFormFill';
import { PUBLIC_PAGE_STRINGS } from '../../lib/forms/collectStrings';
import { RESPONDENT_STRINGS } from '../../lib/forms/surveyStrings';

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'state'; state: Exclude<PublicFormState, 'OPEN'>; title: string | null }
  | { status: 'open'; form: OpenPublicForm };

const stateMessage = (state: Exclude<PublicFormState, 'OPEN'>, language: 'fa' | 'en'): string => {
  const strings = RESPONDENT_STRINGS[language];

  switch (state) {
    case 'NOT_YET_OPEN':
      return strings.notYetOpen;
    case 'CLOSED':
      return strings.closed;
    case 'EXPIRED':
      return strings.expired;
    case 'LIMIT_REACHED':
      return strings.limitReached;
    default:
      return strings.invalid;
  }
};

// Login-free form opened from a public link, invitation or campaign QR
// (#/f/<slug>?i=<invitation>&c=<campaign>). The token and code are passed to
// the server untouched; it decides what they are worth. No app shell, no CRM
// access — the server has already removed every staff-only question.
export const PublicFormView = ({ slug, query }: { slug: string; query: string }) => {
  const params = useMemo(() => new URLSearchParams(query), [query]);
  const inviteToken = params.get('i');
  const campaignCode = params.get('c');
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });

  const fetchForm = useCallback(async () => {
    setLoad({ status: 'loading' });

    try {
      const result = await fetchPublicForm(slug, inviteToken);

      if (result.state === 'OPEN' && result.definition !== undefined && result.versionNumber !== undefined) {
        setLoad({
          status: 'open',
          form: {
            title: result.title ?? '',
            versionNumber: result.versionNumber,
            definition: result.definition,
          },
        });
      } else {
        setLoad({
          status: 'state',
          state: result.state === 'OPEN' ? 'INVALID' : result.state,
          title: result.title ?? null,
        });
      }
    } catch {
      setLoad({ status: 'error' });
    }
  }, [slug, inviteToken]);

  useEffect(() => {
    void fetchForm();
  }, [fetchForm]);

  useEffect(() => {
    const title = load.status === 'open' ? load.form.title : load.status === 'state' ? load.title : null;

    if (title !== null && title !== '') document.title = title;
  }, [load]);

  if (load.status === 'open') {
    return (
      <PublicFormFill
        slug={slug}
        form={load.form}
        inviteToken={inviteToken}
        campaignCode={campaignCode}
        onStateChange={(state) => setLoad({ status: 'state', state, title: load.form.title })}
      />
    );
  }

  // Before a form loads we do not know its language, so these screens say it
  // in Dari and English.
  return (
    <main className="svc-public" dir="rtl">
      <div className="svc-public-card svc-public-message" role={load.status === 'loading' ? 'status' : 'alert'}>
        {load.status === 'loading' ? (
          <>
            <div className="svc-spinner" aria-hidden="true" />
            <p>{PUBLIC_PAGE_STRINGS.fa.loading}</p>
            <p dir="ltr" lang="en" className="svc-muted">{PUBLIC_PAGE_STRINGS.en.loading}</p>
          </>
        ) : load.status === 'error' ? (
          <>
            <p>{PUBLIC_PAGE_STRINGS.fa.loadFailed}</p>
            <p dir="ltr" lang="en" className="svc-muted">{PUBLIC_PAGE_STRINGS.en.loadFailed}</p>
            <button type="button" className="btn gold svc-big" onClick={() => void fetchForm()}>
              {RESPONDENT_STRINGS.fa.retry} · {RESPONDENT_STRINGS.en.retry}
            </button>
          </>
        ) : (
          <>
            {load.title !== null && load.title !== '' && <h1 dir="auto">{load.title}</h1>}
            <div className="svc-state-mark" aria-hidden="true">!</div>
            <p>{stateMessage(load.state, 'fa')}</p>
            <p dir="ltr" lang="en" className="svc-muted">{stateMessage(load.state, 'en')}</p>
          </>
        )}
      </div>
    </main>
  );
};
