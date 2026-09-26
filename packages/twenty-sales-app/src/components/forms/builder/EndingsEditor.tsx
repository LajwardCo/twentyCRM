import {
  type FormDefinition,
  type FormEnding,
  type FormLanguage,
  generateSurveyId,
  listFormQuestions,
} from '@shared/surveys';

import { TB } from '../../../lib/forms/builderStrings';
import { defaultConditionFor, groupOrUndefined } from '../../../lib/forms/builder/conditionOptions';
import { IconPlus, IconTrash } from '../../icons';
import { type DefinitionUpdater } from './builderTypes';
import { ConditionGroupEditor } from './ConditionGroupEditor';
import { LocalizedField } from './LocalizedField';

type EndingsEditorProps = {
  definition: FormDefinition;
  onEdit: (updater: DefinitionUpdater) => void;
  language: FormLanguage;
  numbering: Record<string, number>;
  showConditions: boolean;
  highlightRuleId?: string;
};

// Endings are checked in order; the first whose condition holds is shown.
// An ending may reference any question because it is chosen after the last
// page.
export const EndingsEditor = ({
  definition,
  onEdit,
  language,
  numbering,
  showConditions,
  highlightRuleId,
}: EndingsEditorProps) => {
  const candidates = listFormQuestions(definition);
  const setEnding = (id: string, patch: Partial<FormEnding>) =>
    onEdit((current) => ({
      ...current,
      endings: current.endings.map((ending) => (ending.id === id ? { ...ending, ...patch } : ending)),
    }));

  return (
    <div className="svb-endings">
      {showConditions && <p className="svb-hint">{TB.endingsHint}</p>}
      {definition.endings.map((ending, index) => (
        <div
          key={ending.id}
          id={`svb-rule-${ending.id}`}
          className={`svb-ending card${highlightRuleId === ending.id ? ' svb-hl' : ''}`}
        >
          <div className="svb-ending-head">
            <h4>{TB.endingN(index + 1)}</h4>
            <button
              type="button"
              className="svb-tool danger"
              aria-label={`${TB.removeEnding} ${index + 1}`}
              title={definition.endings.length <= 1 ? TB.cannotRemoveLastEnding : TB.removeEnding}
              disabled={definition.endings.length <= 1}
              onClick={() =>
                onEdit((current) => ({
                  ...current,
                  endings: current.endings.filter((candidate) => candidate.id !== ending.id),
                }))
              }
            >
              <IconTrash size={14} />
            </button>
          </div>
          <LocalizedField
            label={TB.endingTitle}
            value={ending.title}
            onChange={(title) => setEnding(ending.id, { title })}
            language={language}
            languages={definition.languages}
          />
          <LocalizedField
            label={TB.endingMessage}
            value={ending.message}
            onChange={(message) => setEnding(ending.id, { message })}
            language={language}
            languages={definition.languages}
            multiline
          />
          {showConditions && (
            <fieldset className="svb-group">
              <legend>{TB.endingCondition}</legend>
              {ending.when === undefined ? (
                <>
                  <p className="svb-hint">{TB.endingDefault}</p>
                  <button
                    type="button"
                    className="btn line sm"
                    disabled={candidates.length === 0}
                    onClick={() =>
                      setEnding(ending.id, {
                        when: { mode: 'ALL', conditions: [defaultConditionFor(candidates[candidates.length - 1].question)] },
                      })
                    }
                  >
                    <IconPlus size={14} />
                    {TB.addEndingCondition}
                  </button>
                </>
              ) : (
                <ConditionGroupEditor
                  group={ending.when}
                  onChange={(group) => setEnding(ending.id, { when: groupOrUndefined(group) })}
                  candidates={candidates}
                  definition={definition}
                  numbering={numbering}
                />
              )}
            </fieldset>
          )}
        </div>
      ))}
      <button
        type="button"
        className="btn line sm"
        onClick={() =>
          onEdit((current) => ({
            ...current,
            endings: [...current.endings, { id: generateSurveyId('e'), title: {}, message: {} }],
          }))
        }
      >
        <IconPlus size={14} />
        {TB.addEnding}
      </button>
    </div>
  );
};
