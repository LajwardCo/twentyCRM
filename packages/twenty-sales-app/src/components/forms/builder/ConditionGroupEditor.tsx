import {
  type Condition,
  type ConditionGroup,
  type ConditionOperator,
  type FormDefinition,
  type FormLanguage,
  type ListedQuestion,
  OTHER_CHOICE_ID,
  type Question,
  buildQuestionIndex,
  describeConditionGroup,
  pickLocalizedText,
} from '@shared/surveys';
import { useId } from 'react';

import { TB, formatCount } from '../../../lib/forms/builderStrings';
import {
  conditionChoiceIds,
  conditionValueKind,
  defaultConditionFor,
  normalizeCondition,
  operatorNeedsValue,
  operatorsFor,
} from '../../../lib/forms/builder/conditionOptions';
import { IconPlus, IconX } from '../../icons';
import { NumberField } from '../../NumberField';

type ConditionGroupEditorProps = {
  group: ConditionGroup;
  onChange: (group: ConditionGroup) => void;
  // Questions this rule may look at (already limited to earlier ones).
  candidates: ListedQuestion[];
  definition: FormDefinition;
  numbering: Record<string, number>;
  // Shown instead of the sentence when the group has no conditions.
  emptyText?: string;
};

const questionOptionLabel = (listed: ListedQuestion, definition: FormDefinition, number: number | undefined) => {
  const label =
    pickLocalizedText(listed.question.label, definition.languages[0] ?? 'fa', definition.languages) || TB.noLabel;

  return number === undefined ? label : `${formatCount(number)}. ${label}`;
};

// Condition rows in plain Dari: "[question] [operator] [value]", combined
// with ALL / ANY, and the whole rule read back as a sentence below.
export const ConditionGroupEditor = ({
  group,
  onChange,
  candidates,
  definition,
  numbering,
  emptyText,
}: ConditionGroupEditorProps) => {
  const baseId = useId();
  const questionsById = buildQuestionIndex(definition);
  const language = definition.languages[0] ?? 'fa';

  const setCondition = (index: number, condition: Condition) =>
    onChange({
      ...group,
      conditions: group.conditions.map((candidate, position) => (position === index ? condition : candidate)),
    });

  const add = () => {
    const first = candidates[candidates.length - 1];

    if (first === undefined) return;
    onChange({ ...group, conditions: [...group.conditions, defaultConditionFor(first.question)] });
  };

  return (
    <div className="svb-cond-group">
      {group.conditions.length > 1 && (
        <div className="seg svb-mode" role="group" aria-label={TB.modeLabel}>
          {(['ALL', 'ANY'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={group.mode === mode ? 'on' : ''}
              aria-pressed={group.mode === mode}
              onClick={() => onChange({ ...group, mode })}
            >
              {mode === 'ALL' ? TB.modeAll : TB.modeAny}
            </button>
          ))}
        </div>
      )}
      {group.conditions.map((condition, index) => {
        const question = questionsById.get(condition.questionId);
        const isCandidate = candidates.some((listed) => listed.question.id === condition.questionId);
        const rowId = `${baseId}-${index}`;

        return (
          <div key={index} className="svb-cond-row">
            <select
              aria-label={TB.conditionQuestion(index + 1)}
              value={condition.questionId}
              aria-invalid={!isCandidate}
              onChange={(event) => {
                const next = questionsById.get(event.target.value);

                if (next !== undefined) setCondition(index, normalizeCondition(condition, next));
              }}
            >
              {!isCandidate && <option value={condition.questionId}>⚠ {question === undefined ? condition.questionId : pickLocalizedText(question.label, language, definition.languages)}</option>}
              {candidates.map((listed) => (
                <option key={listed.question.id} value={listed.question.id}>
                  {questionOptionLabel(listed, definition, numbering[listed.question.id])}
                </option>
              ))}
            </select>
            {question !== undefined && (
              <select
                aria-label={TB.conditionOperator(index + 1)}
                value={condition.op}
                onChange={(event) =>
                  setCondition(
                    index,
                    normalizeCondition({ ...condition, op: event.target.value as ConditionOperator }, question),
                  )
                }
              >
                {operatorsFor(question).map((operator) => (
                  <option key={operator} value={operator}>
                    {TB.operators[operator]}
                  </option>
                ))}
              </select>
            )}
            {question !== undefined && operatorNeedsValue(condition.op) && (
              <ConditionValueInput
                id={`${rowId}-value`}
                label={TB.conditionValue(index + 1)}
                condition={condition}
                question={question}
                language={language}
                definition={definition}
                onChange={(value) => setCondition(index, { ...condition, value })}
              />
            )}
            <button
              type="button"
              className="svb-tool danger"
              aria-label={TB.removeCondition(index + 1)}
              onClick={() =>
                onChange({ ...group, conditions: group.conditions.filter((_, position) => position !== index) })
              }
            >
              <IconX size={14} />
            </button>
          </div>
        );
      })}
      {candidates.length === 0 && group.conditions.length === 0 ? (
        <p className="svb-hint">{TB.noEarlierQuestions}</p>
      ) : (
        <button type="button" className="btn line sm" onClick={add} disabled={candidates.length === 0}>
          <IconPlus size={14} />
          {TB.addCondition}
        </button>
      )}
      <p className="svb-rule-sentence" aria-live="polite">
        <span className="svb-muted">{TB.preview}</span>{' '}
        {group.conditions.length === 0
          ? (emptyText ?? '—')
          : describeConditionGroup(group, definition, 'fa', numbering)}
      </p>
    </div>
  );
};

type ConditionValueInputProps = {
  id: string;
  label: string;
  condition: Condition;
  question: Question;
  language: FormLanguage;
  definition: FormDefinition;
  onChange: (value: Condition['value']) => void;
};

const ConditionValueInput = ({ id, label, condition, question, language, definition, onChange }: ConditionValueInputProps) => {
  const kind = conditionValueKind(question);

  if (kind === 'choice') {
    return (
      <select
        id={id}
        aria-label={label}
        value={String(condition.value ?? '')}
        aria-invalid={!conditionChoiceIds(question).includes(String(condition.value ?? ''))}
        onChange={(event) => onChange(event.target.value)}
      >
        {!conditionChoiceIds(question).includes(String(condition.value ?? '')) && (
          <option value={String(condition.value ?? '')}>⚠ {TB.choiceRemoved}</option>
        )}
        {conditionChoiceIds(question).map((choiceId) => {
          const choice = question.config.choices?.find((candidate) => candidate.id === choiceId);
          const text =
            choiceId === OTHER_CHOICE_ID
              ? pickLocalizedText(question.config.otherLabel, language, definition.languages) || TB.otherChoice
              : pickLocalizedText(choice?.label, language, definition.languages) || choiceId;

          return (
            <option key={choiceId} value={choiceId}>
              {text}
            </option>
          );
        })}
      </select>
    );
  }

  if (kind === 'boolean') {
    return (
      <select
        id={id}
        aria-label={label}
        value={condition.value === false ? 'false' : 'true'}
        onChange={(event) => onChange(event.target.value === 'true')}
      >
        <option value="true">{TB.yes}</option>
        <option value="false">{TB.no}</option>
      </select>
    );
  }

  if (kind === 'number') {
    return (
      <NumberField
        id={id}
        aria-label={label}
        className="svb-cond-number"
        value={typeof condition.value === 'number' ? condition.value : null}
        allowNegative
        onChange={(value) => onChange(value ?? 0)}
      />
    );
  }

  return (
    <input
      id={id}
      aria-label={label}
      dir="auto"
      value={typeof condition.value === 'string' ? condition.value : ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
};
