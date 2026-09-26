import {
  type FormAudience,
  type FormDefinition,
  type FormEnding,
  type FormLanguage,
  type Question,
  type ResponseValidationError,
  validateResponse,
} from '@shared/surveys';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  directionOf,
  formText,
  formatNumberFor,
} from '../../lib/forms/formText';
import {
  type RendererStep,
  evaluateAndBuildSteps,
  resolveStepIndex,
  validateStep,
} from '../../lib/forms/rendererSteps';
import { LANGUAGE_LABELS, RESPONDENT_STRINGS } from '../../lib/forms/surveyStrings';
import { defaultAnswers } from '../../lib/forms/defaultAnswers';
import { DisplayBlockView } from './DisplayBlockView';
import { type RendererServices } from './inputs/inputTypes';
import { QuestionField } from './QuestionField';

export type SubmitOutcome =
  | { ok: true; ending: Pick<FormEnding, 'title' | 'message'> | null }
  | { ok: false; message: string; errors?: ResponseValidationError[] };

type FormRendererProps = {
  definition: FormDefinition;
  title?: string;
  audience: FormAudience;
  language: FormLanguage;
  onLanguageChange?: (language: FormLanguage) => void;
  answers: Record<string, unknown>;
  onAnswersChange: (answers: Record<string, unknown>) => void;
  // Absent in preview: finishing a preview never touches the network.
  onSubmit?: () => Promise<SubmitOutcome>;
  // The host is already saving this response (e.g. "save incomplete"); the
  // final submit waits until it is done.
  submitDisabled?: boolean;
  services?: RendererServices;
  showWelcome?: boolean;
  submitLabel?: string;
  // 'continuous' shows every screen at once (fast transcription on desktop).
  layout?: 'paged' | 'continuous';
  // Extra controls on the final screen, above submit (visit outcome, etc.).
  finalExtra?: ReactNode;
  // Controls shown next to Previous/Next on every screen (e.g. save partial).
  footerExtra?: ReactNode;
  unclear?: {
    ids: Set<string>;
    onToggle: (questionId: string) => void;
    label: string;
  };
  staffBadge?: (question: Question) => string | undefined;
  onFinished?: () => void;
};

const errorText = (
  code: string,
  question: Question | undefined,
  definition: FormDefinition,
  language: FormLanguage,
): string => {
  const custom = question
    ? formText(question.validationMessage, definition, language)
    : '';

  return custom !== ''
    ? custom
    : (RESPONDENT_STRINGS[language].errors[code] ??
        RESPONDENT_STRINGS[language].errors.INVALID_VALUE);
};

const focusFirstError = (errors: ResponseValidationError[]) => {
  const first = errors[0];

  if (first === undefined) return;

  window.requestAnimationFrame(() => {
    const element = document.getElementById(`sv-q-${first.questionId}`) ??
      document.getElementById(`sv-q-${first.questionId}-label`);

    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element?.focus?.({ preventScroll: true });
  });
};

// One renderer for every channel — builder preview, public link, staff visit
// and paper transcription — so logic, required rules and validation messages
// are identical wherever the form is filled in.
export const FormRenderer = ({
  definition,
  title,
  audience,
  language,
  onLanguageChange,
  answers,
  onAnswersChange,
  onSubmit,
  submitDisabled = false,
  services = {},
  showWelcome = true,
  submitLabel,
  layout = 'paged',
  finalExtra,
  footerExtra,
  unclear,
  staffBadge,
  onFinished,
}: FormRendererProps) => {
  const strings = RESPONDENT_STRINGS[language];
  const [phase, setPhase] = useState<'welcome' | 'form' | 'ending'>(
    showWelcome && definition.welcome.enabled ? 'welcome' : 'form',
  );
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const previousKeys = useRef<string[]>([]);
  const [shownErrors, setShownErrors] = useState<ResponseValidationError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [ending, setEnding] = useState<Pick<FormEnding, 'title' | 'message'> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const { evaluation, steps } = useMemo(
    () => evaluateAndBuildSteps(definition, answers, audience),
    [definition, answers, audience],
  );
  const stepIndex = resolveStepIndex(steps, currentKey, previousKeys.current);
  const step: RendererStep | undefined = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  useEffect(() => {
    previousKeys.current = steps.map((candidate) => candidate.key);
  }, [steps]);

  // Default values seed a fresh form only; restored drafts and corrections
  // already carry answers and must not be overwritten.
  useEffect(() => {
    if (Object.keys(answers).length > 0) return;

    const defaults = defaultAnswers(definition);

    if (Object.keys(defaults).length > 0) onAnswersChange(defaults);
    // Mount only: re-running after the respondent clears everything would
    // put the defaults back against their will.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const questionsById = useMemo(() => {
    const map = new Map<string, Question>();

    for (const page of definition.pages) {
      for (const item of page.items) {
        if (item.kind === 'question') map.set(item.id, item);
      }
    }

    return map;
  }, [definition]);

  // Printed-style numbering of the questions this audience can see.
  const numbering = useMemo(() => {
    const numbers = new Map<string, number>();
    let next = 1;

    for (const page of definition.pages) {
      for (const item of page.items) {
        if (item.kind !== 'question') continue;
        if (audience === 'PUBLIC' && (item.audience === 'STAFF_ONLY' || item.type.startsWith('crm_'))) continue;
        numbers.set(item.id, next);
        next += 1;
      }
    }

    return numbers;
  }, [definition, audience]);

  const setAnswer = (questionId: string, value: unknown) => {
    const next = { ...answers };

    if (value === undefined) delete next[questionId];
    else next[questionId] = value;

    onAnswersChange(next);
    // Re-evaluating hides dependent questions; their errors go with them.
    setShownErrors((errors) => errors.filter((error) => error.questionId !== questionId));
  };

  const goTo = (index: number) => {
    const target = steps[Math.max(0, Math.min(index, steps.length - 1))];

    setCurrentKey(target?.key ?? null);
    setShownErrors([]);
    window.requestAnimationFrame(() => headingRef.current?.focus({ preventScroll: false }));
  };

  const finish = async () => {
    const validation = validateResponse(definition, answers, {
      audience,
      mode: 'COMPLETE',
    });

    if (validation.errors.length > 0) {
      setShownErrors(validation.errors);
      setBanner(strings.fixErrors);

      if (layout === 'paged') {
        const firstErrorStep = steps.findIndex((candidate) =>
          candidate.items.some((item) => item.id === validation.errors[0].questionId),
        );

        if (firstErrorStep >= 0) setCurrentKey(steps[firstErrorStep].key);
      }

      focusFirstError(validation.errors);

      return;
    }

    if (onSubmit === undefined) {
      const endingDefinition =
        definition.endings.find((candidate) => candidate.id === validation.endingId) ??
        definition.endings[0];

      setEnding(endingDefinition === undefined ? null : endingDefinition);
      setBanner(null);
      setPhase('ending');
      onFinished?.();

      return;
    }

    if (submitting) return;

    setSubmitting(true);
    setBanner(null);

    try {
      const outcome = await onSubmit();

      if (outcome.ok) {
        setEnding(outcome.ending);
        setPhase('ending');
        onFinished?.();
      } else {
        setBanner(outcome.message);

        if (outcome.errors !== undefined && outcome.errors.length > 0) {
          const serverErrors = outcome.errors;

          setShownErrors(serverErrors);

          // The server may flag a question on an earlier screen.
          if (layout === 'paged') {
            const errorStep = steps.findIndex((candidate) =>
              candidate.items.some((item) => item.id === serverErrors[0].questionId),
            );

            if (errorStep >= 0) setCurrentKey(steps[errorStep].key);
          }

          focusFirstError(serverErrors);
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const next = () => {
    if (step === undefined) return;

    const errors = validateStep(definition, answers, audience, step);

    if (errors.length > 0) {
      setShownErrors(errors);
      focusFirstError(errors);

      return;
    }

    if (isLast) {
      void finish();
    } else {
      goTo(stepIndex + 1);
    }
  };

  const dir = directionOf(language);

  const languageSwitcher =
    onLanguageChange !== undefined && definition.languages.length > 1 ? (
      <div className="sv-languages" role="group" aria-label={strings.language}>
        {definition.languages.map((candidate) => (
          <button
            key={candidate}
            type="button"
            className={`sv-lang${candidate === language ? ' on' : ''}`}
            aria-pressed={candidate === language}
            onClick={() => onLanguageChange(candidate)}
          >
            {LANGUAGE_LABELS[candidate]}
          </button>
        ))}
      </div>
    ) : null;

  if (phase === 'welcome') {
    return (
      <div className="sv-form" dir={dir} style={{ ['--sv-accent' as string]: definition.appearance.accent }}>
        {languageSwitcher}
        <div className="sv-welcome">
          <h1 dir="auto">{formText(definition.welcome.title, definition, language) || title}</h1>
          <p dir="auto">{formText(definition.welcome.body, definition, language)}</p>
          <button type="button" className="btn gold sv-primary" onClick={() => setPhase('form')}>
            {formText(definition.welcome.buttonLabel, definition, language) || strings.start}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'ending') {
    return (
      <div className="sv-form" dir={dir} style={{ ['--sv-accent' as string]: definition.appearance.accent }}>
        <div className="sv-ending" role="status">
          <div className="sv-ending-mark" aria-hidden="true">✓</div>
          <h2 dir="auto">{ending === null ? strings.submit : formText(ending.title, definition, language)}</h2>
          {ending !== null && <p dir="auto">{formText(ending.message, definition, language)}</p>}
          {onSubmit === undefined && <p className="sv-hint">{strings.previewSubmitted}</p>}
        </div>
      </div>
    );
  }

  const renderItems = (items: RendererStep['items']) =>
    items.map((item) => {
      if (item.kind !== 'question') {
        return <DisplayBlockView key={item.id} block={item} definition={definition} language={language} />;
      }

      const error = shownErrors.find((candidate) => candidate.questionId === item.id);

      return (
        <QuestionField
          key={item.id}
          question={item}
          definition={definition}
          language={language}
          strings={strings}
          number={numbering.get(item.id) ?? null}
          required={evaluation.requiredQuestionIds.has(item.id)}
          value={answers[item.id]}
          onChange={(value) => setAnswer(item.id, value)}
          error={error === undefined ? null : errorText(error.code, questionsById.get(item.id), definition, language)}
          services={services}
          unclear={
            unclear === undefined
              ? undefined
              : {
                  marked: unclear.ids.has(item.id),
                  onToggle: () => unclear.onToggle(item.id),
                  label: unclear.label,
                }
          }
          staffBadge={staffBadge?.(item)}
        />
      );
    });

  const pageOf = (pageId: string) => definition.pages.find((page) => page.id === pageId);
  const progress = steps.length === 0 ? 0 : (stepIndex + 1) / steps.length;

  return (
    <form
      className="sv-form"
      dir={dir}
      noValidate
      style={{ ['--sv-accent' as string]: definition.appearance.accent }}
      onSubmit={(event) => {
        event.preventDefault();

        if (layout === 'continuous') void finish();
        else next();
      }}
    >
      {languageSwitcher}
      {title !== undefined && <div className="sv-form-title" dir="auto">{title}</div>}

      {layout === 'paged' && definition.appearance.showProgress && steps.length > 1 && (
        <div className="sv-progress" aria-hidden="true">
          <div className="sv-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}

      {layout === 'continuous'
        ? steps.map((candidate, index) => {
            const page = pageOf(candidate.pageId);
            const pageTitle = formText(page?.title, definition, language);
            const firstOfPage = index === 0 || steps[index - 1].pageId !== candidate.pageId;

            return (
              <section key={candidate.key} className="sv-page">
                {firstOfPage && pageTitle !== '' && <h2 dir="auto">{pageTitle}</h2>}
                {renderItems(candidate.items)}
              </section>
            );
          })
        : step !== undefined && (
            <section className="sv-page" key={step.key}>
              {(() => {
                const page = pageOf(step.pageId);
                const pageTitle = formText(page?.title, definition, language);
                const pageDescription = formText(page?.description, definition, language);

                return (
                  <>
                    <h2 ref={headingRef} tabIndex={-1} dir="auto" className={pageTitle === '' ? 'sv-visually-hidden' : undefined}>
                      {pageTitle === '' ? strings.pageOf(formatNumberFor(stepIndex + 1, language), formatNumberFor(steps.length, language)) : pageTitle}
                    </h2>
                    {pageDescription !== '' && <p className="sv-page-description" dir="auto">{pageDescription}</p>}
                  </>
                );
              })()}
              {renderItems(step.items)}
            </section>
          )}

      {(isLast || layout === 'continuous') && finalExtra}

      <div className="sv-nav">
        {banner !== null && (
          <div className="error-banner sv-banner" role="alert">
            {banner}
          </div>
        )}
        {layout === 'paged' && stepIndex > 0 && (
          <button type="button" className="btn line" onClick={() => goTo(stepIndex - 1)}>
            {strings.previous}
          </button>
        )}
        {footerExtra}
        <span className="sv-nav-spacer" />
        {layout === 'paged' && steps.length > 1 && (
          <span className="sv-page-count">
            {strings.pageOf(formatNumberFor(stepIndex + 1, language), formatNumberFor(steps.length, language))}
          </span>
        )}
        <button
          type="submit"
          className="btn gold sv-primary"
          disabled={submitting || (submitDisabled && (isLast || layout === 'continuous'))}
        >
          {submitting
            ? strings.submitting
            : isLast || layout === 'continuous'
              ? (submitLabel ?? strings.submit)
              : strings.next}
        </button>
      </div>
    </form>
  );
};
