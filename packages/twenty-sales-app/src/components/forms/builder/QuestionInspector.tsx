import {
  CHOICE_QUESTION_TYPES,
  type FormDefinition,
  type FormLanguage,
  type Question,
  type QuestionType,
  STAFF_ONLY_QUESTION_TYPES,
  createQuestion,
  describeConditionGroup,
} from '@shared/surveys';
import { useId } from 'react';

import { TB } from '../../../lib/forms/builderStrings';
import { referencedChoiceIds } from '../../../lib/forms/builder/references';
import { QUESTION_TYPE_LABELS } from '../../../lib/forms/surveyStrings';
import { LabelledNumber, QuestionConfigFields } from './QuestionConfigFields';
import { LocalizedField } from './LocalizedField';

const PLACEHOLDER_TYPES = new Set<QuestionType>([
  'short_text',
  'long_text',
  'number',
  'email',
  'phone',
  'website',
  'dropdown',
]);

// Changing the type keeps the id (answers of earlier versions stay keyed by
// it) and the texts, but the type-specific settings start fresh — except
// choices, which carry over between choice types.
const retype = (question: Question, type: QuestionType, language: FormLanguage): Question => {
  const fresh = createQuestion(type, language);
  const keepChoices = CHOICE_QUESTION_TYPES.has(type) && CHOICE_QUESTION_TYPES.has(question.type);

  return {
    ...question,
    type,
    audience: STAFF_ONLY_QUESTION_TYPES.has(type) ? 'STAFF_ONLY' : question.audience,
    config: keepChoices ? { ...fresh.config, choices: question.config.choices } : fresh.config,
  };
};

type QuestionInspectorProps = {
  question: Question;
  definition: FormDefinition;
  numbering: Record<string, number>;
  language: FormLanguage;
  onChange: (question: Question) => void;
  onOpenLogic: () => void;
};

export const QuestionInspector = ({
  question,
  definition,
  numbering,
  language,
  onChange,
  onOpenLogic,
}: QuestionInspectorProps) => {
  const id = useId();
  const languages = definition.languages;
  const forcedStaff = STAFF_ONLY_QUESTION_TYPES.has(question.type);
  const set = (patch: Partial<Question>) => onChange({ ...question, ...patch });
  const rules = [
    { label: TB.showWhenShort, group: question.visibleWhen },
    { label: TB.requiredWhenShort, group: question.requiredWhen },
  ].filter((rule) => rule.group !== undefined);

  return (
    <div className="svb-inspector-body">
      <div className="fld svb-fld">
        <label htmlFor={`${id}-type`}>{TB.questionType}</label>
        <select
          id={`${id}-type`}
          value={question.type}
          onChange={(event) => onChange(retype(question, event.target.value as QuestionType, language))}
        >
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => (
            <option key={type} value={type}>
              {QUESTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>
      <LocalizedField
        label={TB.label}
        value={question.label}
        onChange={(label) => set({ label })}
        language={language}
        languages={languages}
        multiline
      />
      <LocalizedField
        label={TB.description}
        value={question.description}
        onChange={(description) => set({ description })}
        language={language}
        languages={languages}
        multiline
      />
      {PLACEHOLDER_TYPES.has(question.type) && (
        <LocalizedField
          label={TB.placeholder}
          value={question.placeholder}
          onChange={(placeholder) => set({ placeholder })}
          language={language}
          languages={languages}
        />
      )}
      <label className="svb-check">
        <input
          type="checkbox"
          checked={question.required}
          onChange={(event) => set({ required: event.target.checked })}
        />
        {TB.required}
      </label>
      <fieldset className="svb-group">
        <legend>{TB.audience}</legend>
        <label className="svb-check">
          <input
            type="radio"
            name={`${id}-audience`}
            checked={question.audience === 'ALL'}
            disabled={forcedStaff}
            onChange={() => set({ audience: 'ALL' })}
          />
          {TB.audienceAll}
        </label>
        <label className="svb-check">
          <input
            type="radio"
            name={`${id}-audience`}
            checked={question.audience === 'STAFF_ONLY'}
            onChange={() => set({ audience: 'STAFF_ONLY' })}
          />
          {TB.audienceStaff}
        </label>
        {forcedStaff && <p className="svb-hint">{TB.audienceForced}</p>}
      </fieldset>
      <QuestionConfigFields
        question={question}
        language={language}
        languages={languages}
        referencedChoiceIds={referencedChoiceIds(definition, question.id)}
        onChange={(config) => set({ config })}
      />
      <LocalizedField
        label={TB.validationMessage}
        value={question.validationMessage}
        onChange={(validationMessage) => set({ validationMessage })}
        language={language}
        languages={languages}
        hint={TB.validationMessageHint}
      />
      <fieldset className="svb-group">
        <legend>{TB.printSection}</legend>
        <LabelledNumber
          label={`${TB.answerLines} (۱–۱۰)`}
          value={question.print.answerLines}
          onChange={(answerLines) =>
            set({ print: { answerLines: Math.min(10, Math.max(1, answerLines ?? 1)) } })
          }
        />
      </fieldset>
      <fieldset className="svb-group">
        <legend>{TB.rulesSection}</legend>
        {rules.length === 0 && <p className="svb-hint">{TB.rulesSummaryNone}</p>}
        {rules.map((rule) => (
          <p key={rule.label} className="svb-rule-sentence">
            <strong>{rule.label}:</strong>{' '}
            {describeConditionGroup(rule.group!, definition, 'fa', numbering)}
          </p>
        ))}
        <button type="button" className="btn line sm" onClick={onOpenLogic}>
          {TB.editLogic}
        </button>
      </fieldset>
    </div>
  );
};
