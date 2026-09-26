import {
  type AutomationAction,
  type AutomationRule,
  type FormDefinition,
  generateSurveyId,
  listFormQuestions,
} from '@shared/surveys';
import { useId } from 'react';

import { fetchMembers } from '../../../api/admin';
import { useCached } from '../../../lib/cache';
import { TB } from '../../../lib/forms/builderStrings';
import { defaultConditionFor, groupOrUndefined } from '../../../lib/forms/builder/conditionOptions';
import { type IssueTarget } from '../../../lib/forms/builder/issues';
import { IconPlus, IconTrash } from '../../icons';
import { type DefinitionUpdater } from './builderTypes';
import { ConditionGroupEditor } from './ConditionGroupEditor';
import { LabelledNumber } from './QuestionConfigFields';

const ACTIONS: AutomationAction[] = ['CREATE_LEAD', 'CREATE_TASK', 'NOTIFY'];

type AutomationsEditorProps = {
  definition: FormDefinition;
  onEdit: (updater: DefinitionUpdater) => void;
  numbering: Record<string, number>;
  focus: IssueTarget | null;
};

const AutomationCard = ({
  rule,
  index,
  definition,
  numbering,
  members,
  highlighted,
  onChange,
  onRemove,
}: {
  rule: AutomationRule;
  index: number;
  definition: FormDefinition;
  numbering: Record<string, number>;
  members: { id: string; label: string }[];
  highlighted: boolean;
  onChange: (rule: AutomationRule) => void;
  onRemove: () => void;
}) => {
  const id = useId();
  const candidates = listFormQuestions(definition);
  const set = (patch: Partial<AutomationRule>) => onChange({ ...rule, ...patch });

  return (
    <div id={`svb-rule-${rule.id}`} className={`svb-automation${highlighted ? ' svb-hl' : ''}`}>
      <div className="svb-ending-head">
        <h4>{TB.automationN(index + 1)}</h4>
        <label className="svb-check">
          <input type="checkbox" checked={rule.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
          {TB.automationEnabled}
        </label>
        <button type="button" className="svb-tool danger" aria-label={`${TB.removeAutomation} ${index + 1}`} onClick={onRemove}>
          <IconTrash size={14} />
        </button>
      </div>
      <div className="svb-pair">
        <div className="fld svb-fld">
          <label htmlFor={`${id}-action`}>{TB.automationAction}</label>
          <select id={`${id}-action`} value={rule.action} onChange={(event) => set({ action: event.target.value as AutomationAction })}>
            {ACTIONS.map((action) => (
              <option key={action} value={action}>
                {TB.automationActions[action]}
              </option>
            ))}
          </select>
        </div>
        <div className="fld svb-fld">
          <label htmlFor={`${id}-assignee`}>{TB.assignee}</label>
          <select
            id={`${id}-assignee`}
            value={rule.assigneeMemberId ?? ''}
            onChange={(event) => set({ assigneeMemberId: event.target.value === '' ? undefined : event.target.value })}
          >
            <option value="">{TB.assigneeDefault}</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {rule.action === 'CREATE_TASK' && (
        <div className="svb-pair">
          <div className="fld svb-fld">
            <label htmlFor={`${id}-title`}>{TB.taskTitle}</label>
            <input
              id={`${id}-title`}
              dir="auto"
              value={rule.taskTitle ?? ''}
              onChange={(event) => set({ taskTitle: event.target.value === '' ? undefined : event.target.value })}
            />
          </div>
          <LabelledNumber label={TB.dueInDays} value={rule.dueInDays} onChange={(dueInDays) => set({ dueInDays })} />
        </div>
      )}
      <fieldset className="svb-group">
        <legend>{TB.automationCondition}</legend>
        {rule.when === undefined ? (
          <>
            <p className="svb-hint">{TB.automationAlways}</p>
            <button
              type="button"
              className="btn line sm"
              disabled={candidates.length === 0}
              onClick={() =>
                set({ when: { mode: 'ALL', conditions: [defaultConditionFor(candidates[candidates.length - 1].question)] } })
              }
            >
              <IconPlus size={14} />
              {TB.addCondition}
            </button>
          </>
        ) : (
          <ConditionGroupEditor
            group={rule.when}
            onChange={(group) => set({ when: groupOrUndefined(group) })}
            candidates={candidates}
            definition={definition}
            numbering={numbering}
          />
        )}
      </fieldset>
    </div>
  );
};

// Server-run actions on each submitted response (spec D8): opt-in,
// idempotent per response and never overwriting existing values.
export const AutomationsEditor = ({ definition, onEdit, numbering, focus }: AutomationsEditorProps) => {
  const { data: rawMembers } = useCached('workspace-members', fetchMembers);
  const members = (rawMembers ?? []).map((member) => ({
    id: member.id,
    label: `${member.name.firstName} ${member.name.lastName}`.trim() || (member.userEmail ?? member.id),
  }));
  const setAutomations = (automations: AutomationRule[]) => onEdit((current) => ({ ...current, automations }));

  return (
    <section className="card card-pad">
      <h3>{TB.automationsTitle}</h3>
      <p className="svb-note warn" role="note">
        {TB.automationsWarning}
      </p>
      {definition.automations.length === 0 && <p className="svb-hint">{TB.noAutomations}</p>}
      {definition.automations.map((rule, index) => (
        <AutomationCard
          key={rule.id}
          rule={rule}
          index={index}
          definition={definition}
          numbering={numbering}
          members={members}
          highlighted={focus?.ruleId === rule.id}
          onChange={(next) =>
            setAutomations(definition.automations.map((candidate) => (candidate.id === rule.id ? next : candidate)))
          }
          onRemove={() => setAutomations(definition.automations.filter((candidate) => candidate.id !== rule.id))}
        />
      ))}
      <button
        type="button"
        className="btn line sm"
        onClick={() =>
          setAutomations([
            ...definition.automations,
            // New automations start disabled so nothing runs before it is reviewed.
            { id: generateSurveyId('a'), enabled: false, action: 'CREATE_TASK', dueInDays: 2 },
          ])
        }
      >
        <IconPlus size={14} />
        {TB.addAutomation}
      </button>
    </section>
  );
};
