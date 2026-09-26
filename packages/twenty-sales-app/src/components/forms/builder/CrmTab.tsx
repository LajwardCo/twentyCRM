import {
  type CrmMappingRule,
  type CrmTargetField,
  type FormDefinition,
  generateSurveyId,
  isMappingCompatible,
  listFormQuestions,
  pickLocalizedText,
} from '@shared/surveys';

import { TB, formatCount } from '../../../lib/forms/builderStrings';
import { type IssueTarget } from '../../../lib/forms/builder/issues';
import { IconPlus, IconTrash } from '../../icons';
import { AutomationsEditor } from './AutomationsEditor';
import { type EditorProps } from './builderTypes';

const CRM_FIELDS = Object.keys(TB.crmFields) as CrmTargetField[];

type CrmTabProps = EditorProps & {
  numbering: Record<string, number>;
  focus: IssueTarget | null;
};

const questionLabel = (definition: FormDefinition, questionId: string, numbering: Record<string, number>) => {
  const question = listFormQuestions(definition).find((listed) => listed.question.id === questionId)?.question;
  const label = pickLocalizedText(question?.label, definition.languages[0] ?? 'fa', definition.languages) || TB.noLabel;
  const number = numbering[questionId];

  return number === undefined ? label : `${formatCount(number)}. ${label}`;
};

export const CrmTab = ({ definition, onEdit, readOnly, numbering, focus }: CrmTabProps) => {
  const questions = listFormQuestions(definition);
  const byId = new Map(questions.map((listed) => [listed.question.id, listed.question]));
  const setMapping = (crmMapping: CrmMappingRule[]) => onEdit((current) => ({ ...current, crmMapping }));

  const addMapping = () => {
    for (const listed of questions) {
      const field = CRM_FIELDS.find((candidate) => isMappingCompatible(listed.question.type, candidate));

      if (field !== undefined) {
        setMapping([...definition.crmMapping, { id: generateSurveyId('m'), questionId: listed.question.id, field }]);

        return;
      }
    }
  };

  return (
    <fieldset disabled={readOnly} className="svb-fieldset svb-crm">
      <section className="card card-pad">
        <h3>{TB.crmMappingTitle}</h3>
        <p className="svb-note">{TB.crmMappingIntro}</p>
        {definition.crmMapping.length === 0 && (
          <p className="svb-hint">{questions.length === 0 ? TB.noQuestionsYet : TB.noMappings}</p>
        )}
        {definition.crmMapping.length > 0 && (
          <table className="svb-map-table">
            <thead>
              <tr>
                <th scope="col">{TB.mappingQuestion}</th>
                <th scope="col">{TB.mappingField}</th>
                <th scope="col">
                  <span className="svb-sr">{TB.removeMapping}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {definition.crmMapping.map((rule, index) => {
                const question = byId.get(rule.questionId);
                const compatible = question !== undefined && isMappingCompatible(question.type, rule.field);

                return (
                  <tr
                    key={rule.id}
                    id={`svb-rule-${rule.id}`}
                    className={focus?.ruleId === rule.id ? 'svb-hl' : ''}
                  >
                    <td data-label={TB.mappingQuestion}>
                      <select
                        aria-label={`${TB.mappingQuestion} ${formatCount(index + 1)}`}
                        value={rule.questionId}
                        aria-invalid={question === undefined}
                        onChange={(event) => {
                          const next = byId.get(event.target.value);
                          const field =
                            next !== undefined && !isMappingCompatible(next.type, rule.field)
                              ? (CRM_FIELDS.find((candidate) => isMappingCompatible(next.type, candidate)) ?? rule.field)
                              : rule.field;

                          setMapping(
                            definition.crmMapping.map((candidate) =>
                              candidate.id === rule.id ? { ...candidate, questionId: event.target.value, field } : candidate,
                            ),
                          );
                        }}
                      >
                        {question === undefined && <option value={rule.questionId}>⚠ {rule.questionId}</option>}
                        {questions.map((listed) => (
                          <option key={listed.question.id} value={listed.question.id}>
                            {questionLabel(definition, listed.question.id, numbering)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td data-label={TB.mappingField}>
                      <select
                        aria-label={`${TB.mappingField} ${formatCount(index + 1)}`}
                        value={rule.field}
                        aria-invalid={!compatible}
                        onChange={(event) =>
                          setMapping(
                            definition.crmMapping.map((candidate) =>
                              candidate.id === rule.id
                                ? { ...candidate, field: event.target.value as CrmTargetField }
                                : candidate,
                            ),
                          )
                        }
                      >
                        {CRM_FIELDS.filter(
                          (field) => field === rule.field || question === undefined || isMappingCompatible(question.type, field),
                        ).map((field) => (
                          <option key={field} value={field}>
                            {TB.crmFields[field]}
                          </option>
                        ))}
                      </select>
                      {question !== undefined && !compatible && <p className="svb-hint error">{TB.noCompatibleFields}</p>}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="svb-tool danger"
                        aria-label={`${TB.removeMapping} ${formatCount(index + 1)}`}
                        onClick={() => setMapping(definition.crmMapping.filter((candidate) => candidate.id !== rule.id))}
                      >
                        <IconTrash size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <button type="button" className="btn line sm" disabled={questions.length === 0} onClick={addMapping}>
          <IconPlus size={14} />
          {TB.addMapping}
        </button>
      </section>
      <AutomationsEditor definition={definition} onEdit={onEdit} numbering={numbering} focus={focus} />
    </fieldset>
  );
};
