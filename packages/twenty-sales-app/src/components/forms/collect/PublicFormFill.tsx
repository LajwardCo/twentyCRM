import { type FormDefinition, type FormLanguage } from '@shared/surveys';
import { useEffect, useMemo, useRef, useState } from 'react';

import { type PublicFormState, submitPublicForm, uploadPublicFile } from '../../../api/surveys';
import {
  type PublicSession,
  classifyPublicSubmitError,
  clearPublicSession,
  loadPublicSession,
  newSubmissionKey,
  publicSessionKey,
  reconcilePublicSession,
  savePublicSession,
} from '../../../lib/forms/collect/publicSession';
import { summariseQuestions } from '../../../lib/forms/collect/errorSummary';
import { safeSessionStorage } from '../../../lib/forms/collect/staffDraft';
import { PUBLIC_PAGE_STRINGS } from '../../../lib/forms/collectStrings';
import { directionOf } from '../../../lib/forms/formText';
import { RESPONDENT_STRINGS } from '../../../lib/forms/surveyStrings';
import { FormRenderer, type SubmitOutcome } from '../FormRenderer';

export type OpenPublicForm = {
  title: string;
  versionNumber: number;
  definition: FormDefinition;
};

type PublicFormFillProps = {
  slug: string;
  form: OpenPublicForm;
  inviteToken: string | null;
  campaignCode: string | null;
  onStateChange: (state: Exclude<PublicFormState, 'OPEN'>) => void;
};

const safeLogo = (url: string | undefined): string | null =>
  url !== undefined && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null;

export const PublicFormFill = ({
  slug,
  form,
  inviteToken,
  campaignCode,
  onStateChange,
}: PublicFormFillProps) => {
  const { definition, versionNumber } = form;
  const storageKey = publicSessionKey(slug);
  const [session, setSession] = useState<PublicSession>(() =>
    reconcilePublicSession(
      loadPublicSession(safeSessionStorage(), storageKey, () => ({
        submissionKey: newSubmissionKey(),
        versionNumber,
        answers: {},
        startedAt: Date.now(),
        elapsedMs: 0,
        language: null,
      })),
      versionNumber,
    ),
  );
  const [website, setWebsite] = useState('');
  const sessionRef = useRef(session);
  const inFlight = useRef<Promise<SubmitOutcome> | null>(null);
  // Time on the form: what earlier page loads spent plus this load, on the
  // monotonic clock so a wrong device clock cannot distort it.
  const openedAt = useRef(performance.now());
  const priorElapsedMs = useRef(session.elapsedMs);
  const elapsedMs = () => Math.round(priorElapsedMs.current + performance.now() - openedAt.current);

  sessionRef.current = session;

  // A session reconciled to a newer version gets a new submission key; store
  // it now so an upload made before the first answer uses the same key.
  useEffect(() => {
    savePublicSession(safeSessionStorage(), storageKey, sessionRef.current);
  }, [storageKey]);

  const language: FormLanguage =
    session.language !== null && definition.languages.includes(session.language)
      ? session.language
      : (definition.languages[0] ?? 'fa');
  const strings = RESPONDENT_STRINGS[language];
  const pageStrings = PUBLIC_PAGE_STRINGS[language];
  const logo = safeLogo(definition.appearance.logoUrl);

  const persist = (next: PublicSession) => {
    const withTime = { ...next, elapsedMs: elapsedMs() };

    sessionRef.current = withTime;
    setSession(withTime);
    savePublicSession(safeSessionStorage(), storageKey, withTime);
  };

  const services = useMemo(
    () => ({
      uploadFile: (question: { id: string }, file: File) =>
        uploadPublicFile(slug, {
          file,
          questionId: question.id,
          submissionKey: sessionRef.current.submissionKey,
          versionNumber,
          inviteToken,
        }),
    }),
    [slug, versionNumber, inviteToken],
  );

  const send = async (): Promise<SubmitOutcome> => {
    const current = sessionRef.current;

    try {
      const result = await submitPublicForm(slug, {
        submissionKey: current.submissionKey,
        versionNumber,
        answers: current.answers,
        language,
        inviteToken,
        campaignCode,
        startedAt: current.startedAt,
        elapsedMs: elapsedMs(),
        website,
      });

      clearPublicSession(safeSessionStorage(), storageKey);

      return { ok: true, ending: result.ending };
    } catch (error) {
      const failure = classifyPublicSubmitError(error);

      switch (failure.kind) {
        case 'invalid':
          return {
            ok: false,
            message: `${strings.fixErrors} ${summariseQuestions(
              definition,
              failure.errors.map((entry) => entry.questionId),
              { audience: 'PUBLIC', language },
            )}`,
            errors: failure.errors,
          };
        case 'upload': {
          if (failure.questionId !== null) {
            const answers = { ...sessionRef.current.answers };

            delete answers[failure.questionId];
            persist({ ...sessionRef.current, answers });
          }

          return {
            ok: false,
            message: pageStrings.uploadExpired,
            errors: failure.questionId === null ? [] : [{ questionId: failure.questionId, code: 'INVALID_FILE' }],
          };
        }
        case 'state':
          onStateChange(failure.state === 'OPEN' ? 'CLOSED' : failure.state);

          return { ok: false, message: strings.closed };
        case 'rateLimited':
          return { ok: false, message: strings.rateLimited };
        default:
          return { ok: false, message: strings.submitFailed };
      }
    }
  };

  // A second click while the first request is still out gets the same
  // promise; the shared submission key covers retries after it settles.
  const submit = (): Promise<SubmitOutcome> => {
    if (inFlight.current === null) {
      inFlight.current = send().finally(() => {
        inFlight.current = null;
      });
    }

    return inFlight.current;
  };

  return (
    <main
      className="svc-public"
      dir={directionOf(language)}
      lang={language === 'ps' ? 'ps' : language === 'en' ? 'en' : 'fa-AF'}
      style={{ ['--sv-accent' as string]: definition.appearance.accent }}
    >
      <div className="svc-public-card">
        {(logo !== null || form.title !== '') && (
          <header className="svc-public-head">
            {logo !== null && <img src={logo} alt="" className="svc-public-logo" referrerPolicy="no-referrer" />}
            {form.title !== '' && <h1 dir="auto">{form.title}</h1>}
          </header>
        )}

        {/* Honeypot: invisible to people and assistive tech; bots that fill
            every field reveal themselves (the server files them as spam). */}
        <div className="svc-hp" aria-hidden="true">
          <label>
            {pageStrings.honeypotLabel}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(event) => setWebsite(event.target.value)}
            />
          </label>
        </div>

        <FormRenderer
          definition={definition}
          audience="PUBLIC"
          language={language}
          onLanguageChange={(next) => persist({ ...sessionRef.current, language: next })}
          answers={session.answers}
          onAnswersChange={(answers) => persist({ ...sessionRef.current, answers })}
          onSubmit={submit}
          services={services}
        />
      </div>
    </main>
  );
};
