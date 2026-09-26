import {
  type ChoiceOption,
  type FormLanguage,
  type Question,
  SURVEY_LIMITS,
  generateSurveyId,
} from '@shared/surveys';
import { useId, useState } from 'react';

import { TB } from '../../../lib/forms/builderStrings';
import { directionOf, withText } from '../../../lib/forms/formText';
import { IconChevronDown, IconPlus, IconX } from '../../icons';
import { LocalizedField } from './LocalizedField';

type ChoicesEditorProps = {
  question: Question;
  language: FormLanguage;
  languages: FormLanguage[];
  // Choice ids some rule compares against — warned about before removal.
  referencedChoiceIds: Set<string>;
  onChange: (config: Question['config']) => void;
};

const swap = <TItem,>(list: TItem[], index: number, delta: number): TItem[] => {
  const next = [...list];
  const target = index + delta;

  if (target < 0 || target >= next.length) return list;
  [next[index], next[target]] = [next[target], next[index]];

  return next;
};

// Choice ids are stable (c_xxxx): labels and order can change freely without
// touching recorded answers.
export const ChoicesEditor = ({
  question,
  language,
  languages,
  referencedChoiceIds,
  onChange,
}: ChoicesEditorProps) => {
  const baseId = useId();
  const [bulk, setBulk] = useState('');
  const choices = question.config.choices ?? [];
  const defaultLanguage = languages[0] ?? 'fa';
  const setChoices = (next: ChoiceOption[]) => onChange({ ...question.config, choices: next });
  const atLimit = choices.length >= SURVEY_LIMITS.maxChoices;

  const addChoices = (labels: string[]) => {
    const room = SURVEY_LIMITS.maxChoices - choices.length;

    setChoices([
      ...choices,
      ...labels.slice(0, room).map((label) => ({ id: generateSurveyId('c'), label: { [language]: label } })),
    ]);
  };

  return (
    <fieldset className="svb-group">
      <legend>{TB.choices}</legend>
      <ol className="svb-choices">
        {choices.map((choice, index) => {
          const shown = choice.label[language] ?? '';
          const fallback = choice.label[defaultLanguage] ?? '';
          const name = shown || fallback || TB.choiceN(index + 1);

          return (
            <li key={choice.id} className="svb-choice">
              <input
                aria-label={TB.choiceN(index + 1)}
                value={shown}
                placeholder={fallback || TB.choiceN(index + 1)}
                dir={directionOf(language)}
                onChange={(event) =>
                  setChoices(
                    choices.map((candidate) =>
                      candidate.id === choice.id
                        ? { ...candidate, label: withText(candidate.label, language, event.target.value) }
                        : candidate,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="svb-tool"
                aria-label={TB.moveChoiceUp(name)}
                disabled={index === 0}
                onClick={() => setChoices(swap(choices, index, -1))}
              >
                <span className="svb-rot180" aria-hidden="true">
                  <IconChevronDown size={14} />
                </span>
              </button>
              <button
                type="button"
                className="svb-tool"
                aria-label={TB.moveChoiceDown(name)}
                disabled={index === choices.length - 1}
                onClick={() => setChoices(swap(choices, index, 1))}
              >
                <IconChevronDown size={14} />
              </button>
              <button
                type="button"
                className="svb-tool danger"
                aria-label={TB.removeChoice(name)}
                title={referencedChoiceIds.has(choice.id) ? TB.choiceUsedWarning : undefined}
                onClick={() => {
                  if (referencedChoiceIds.has(choice.id) && !window.confirm(TB.choiceUsedWarning)) return;
                  setChoices(choices.filter((candidate) => candidate.id !== choice.id));
                }}
              >
                <IconX size={14} />
              </button>
              {referencedChoiceIds.has(choice.id) && (
                <span className="svb-badge logic" title={TB.choiceUsedWarning}>
                  {TB.logicBadge}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn line sm"
        disabled={atLimit}
        onClick={() => addChoices([TB.choiceN(choices.length + 1)])}
      >
        <IconPlus size={14} />
        {TB.addChoice}
      </button>
      <details className="svb-bulk">
        <summary>{TB.bulkChoices}</summary>
        <textarea
          id={`${baseId}-bulk`}
          aria-label={TB.bulkChoices}
          rows={4}
          value={bulk}
          dir={directionOf(language)}
          onChange={(event) => setBulk(event.target.value)}
        />
        <button
          type="button"
          className="btn soft sm"
          disabled={bulk.trim() === '' || atLimit}
          onClick={() => {
            addChoices(bulk.split('\n').map((line) => line.trim()).filter((line) => line !== ''));
            setBulk('');
          }}
        >
          {TB.bulkAdd}
        </button>
      </details>
      <label className="svb-check">
        <input
          type="checkbox"
          checked={question.config.allowOther === true}
          onChange={(event) => onChange({ ...question.config, allowOther: event.target.checked })}
        />
        {TB.allowOther}
      </label>
      {question.config.allowOther === true && (
        <LocalizedField
          label={TB.otherLabel}
          value={question.config.otherLabel}
          onChange={(otherLabel) => onChange({ ...question.config, otherLabel })}
          language={language}
          languages={languages}
          placeholder={TB.otherChoice}
        />
      )}
    </fieldset>
  );
};
