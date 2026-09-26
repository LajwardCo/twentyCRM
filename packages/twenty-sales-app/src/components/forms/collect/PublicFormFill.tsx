import { type FormDefinition, type FormLanguage } from '@shared/surveys';
import { useMemo, useRef, useState } from 'react';

import { type PublicFormState, submitPublicForm, uploadPublicFile } from '../../../api/surveys';
import {
  type PublicSession,
  classifyPublicSubmitError,
  clearPublicSession,
  loadPublicSession,
  newSubmissionKey,
  publicSessionKey,
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
  const storageKey = publicSessionKey(slug, versionNumber);
  const [session, setSession] = useState<PublicSession>(() =>
    loadPublicSession(safeSessionStorage(), storageKey, () => ({
      submissionKey: newSubmissionKey(),
      answers: {},
      startedAt: Date.now(),
      language: null,
    })),
  );
  const [website, setWebsite] = useState('');
  const sessionRef = useRef(session);
  const inFlight = useRef<Promise<SubmitOutcome> | null>(null);

  sessionRef.current = session;

  const language: FormLanguage =
    session.language !== null && definition.languages.includes(session.language)
      ? session.language
      : (definition.languages[0] ?? 'fa');
  const strings = RESPONDENT_STRINGS[language];
  const pageStrings = PUBLIC_PAGE_STRINGS[language];
  const logo = safeLogo(definition.appearance.logoUrl);

  const persist = (next: PublicSession) => {
    sessionRef.current = next;
    setSession(next);
    savePublicSession(safeSessionStorage(), storageKey, next);
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
