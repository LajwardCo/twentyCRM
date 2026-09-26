import {
  type ConditionGroup,
  type FormItem,
  type PublishIssue,
  type PublishValidation,
  pickLocalizedText,
} from '@shared/surveys';
import { useEffect } from 'react';

import { TB, formatCount } from '../../../lib/forms/builderStrings';
import {
  defaultConditionFor,
  groupOrUndefined,
  questionsBeforeItem,
} from '../../../lib/forms/builder/conditionOptions';
import { updateItem } from '../../../lib/forms/builder/definitionOps';
import { type IssueTarget } from '../../../lib/forms/builder/issues';
import { itemText } from '../../../lib/forms/builder/palette';
import { QUESTION_TYPE_LABELS } from '../../../lib/forms/surveyStrings';
import { IconPlus, IconTrash } from '../../icons';
import { type EditorProps } from './builderTypes';
import { ConditionGroupEditor } from './ConditionGroupEditor';
import { EndingsEditor } from './EndingsEditor';
import { IssueList } from './IssueList';
import { LanguageTabs } from './LocalizedField';
import { PageJumpsEditor } from './PageJumpsEditor';

type LogicTabProps = EditorProps & {
  numbering: Record<string, number>;
  validation: PublishValidation;
  focus: IssueTarget | null;
  onIssue: (issue: PublishIssue) => void;
};

type RuleField = 'visibleWhen' | 'requiredWhen';

const setRule = (item: FormItem, field: RuleField, group: ConditionGroup | undefined): FormItem => {
  if (item.kind === 'question') return { ...item, [field]: group };
  if (item.kind === 'section' && field === 'visibleWhen') return { ...item, visibleWhen: group };

  return item;
};

export const LogicTab = ({
  definition,
  onEdit,
  readOnly,
  editLanguage,
  onEditLanguageChange,
  numbering,
  validation,
  focus,
  onIssue,
}: LogicTabProps) => {
  const language = definition.languages[0] ?? 'fa';

  useEffect(() => {
    if (focus === null) return;

    const candidates = [
      focus.ruleId !== undefined ? `svb-rule-${focus.ruleId}` : null,
      focus.itemId !== undefined ? `svb-logic-${focus.itemId}` : null,
      focus.pageId !== undefined ? `svb-logic-page-${focus.pageId}` : null,
    ];
    const element = candidates
      .map((id) => (id === null ? null : document.getElementById(id)))
      .find((found) => found !== null);

    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus]);

  const ruleBlock = (item: FormItem, field: RuleField, group: ConditionGroup | undefined) => {
    const candidates = questionsBeforeItem(definition, item.id);
    const title = field === 'visibleWhen' ? TB.showWhen : TB.requiredWhen;
    const change = (next: ConditionGroup | undefined) =>
      onEdit((current) => updateItem(current, item.id, (existing) => setRule(existing, field, next)));

    if (group === undefined) {
      return (
        <button
          type="button"
          className="btn line sm"
          disabled={candidates.length === 0}
          title={candidates.length === 0 ? TB.noEarlierQuestions : undefined}
          onClick={() =>
            change({ mode: 'ALL', conditions: [defaultConditionFor(candidates[candidates.length - 1].question)] })
          }
        >
          <IconPlus size={14} />
          {field === 'visibleWhen' ? TB.addShowWhen : TB.addRequiredWhen}
        </button>
      );
    }

    return (
      <div className="svb-rule">
        <div className="svb-rule-head">
          <h5>{title}</h5>
          <button type="button" className="svb-tool danger" aria-label={`${TB.removeRule}: ${title}`} onClick={() => change(undefined)}>
            <IconTrash size={14} />
          </button>
        </div>
        <ConditionGroupEditor
          group={group}
          onChange={(next) => change(groupOrUndefined(next))}
          candidates={candidates}
          definition={definition}
          numbering={numbering}
        />
      </div>
    );
  };

  return (
    <div className="svb-logic">
      <aside className="svb-logic-side">
        <section className="card card-pad svb-issues-card" aria-label={TB.issues}>
          <h3>{TB.issues}</h3>
          <IssueList validation={validation} onSelect={onIssue} />
        </section>
      </aside>
      <fieldset disabled={readOnly} className="svb-fieldset svb-logic-main">
        <p className="svb-hint svb-logic-intro">{TB.logicIntro}</p>
        {definition.pages.map((page, pageIndex) => {
          const title = pickLocalizedText(page.title, language, definition.languages);
          const ruleItems = page.items.filter((item) => item.kind === 'question' || item.kind === 'section');

          return (
            <section
              key={page.id}
              id={`svb-logic-page-${page.id}`}
              className={`card card-pad svb-logic-page${focus?.pageId === page.id && focus.itemId === undefined ? ' svb-hl' : ''}`}
            >
              <h3>
                {TB.pageN(pageIndex + 1)}
                {title !== '' && <span className="svb-muted"> — {title}</span>}
              </h3>
              {ruleItems.length > 0 && <h4 className="svb-sub">{TB.sectionsAndQuestions}</h4>}
              {ruleItems.map((item) => {
                const number = numbering[item.id];
                const text = itemText(item, definition);

                return (
                  <div
                    key={item.id}
                    id={`svb-logic-${item.id}`}
                    className={`svb-logic-item${focus?.itemId === item.id ? ' svb-hl' : ''}`}
                  >
                    <div className="svb-logic-item-head" dir="auto">
                      {number !== undefined && <span className="svb-item-num">{formatCount(number)}.</span>}
                      <span>{text || TB.noLabel}</span>
                      <span className="svb-muted">
                        {item.kind === 'question' ? QUESTION_TYPE_LABELS[item.type] : TB.blockLabels.section}
                      </span>
                    </div>
                    <div className="svb-logic-rules">
                      {item.kind === 'question' || item.kind === 'section'
                        ? ruleBlock(item, 'visibleWhen', item.visibleWhen)
                        : null}
                      {item.kind === 'question' &&
                        (!item.required || item.requiredWhen !== undefined) &&
                        ruleBlock(item, 'requiredWhen', item.requiredWhen)}
                    </div>
                  </div>
                );
              })}
              <PageJumpsEditor
                page={page}
                pageIndex={pageIndex}
                definition={definition}
                numbering={numbering}
                highlightRuleId={focus?.ruleId}
                onEdit={onEdit}
              />
            </section>
          );
        })}
        <section className="card card-pad svb-logic-page">
          <div className="svb-inspector-head">
            <h3>{TB.endings}</h3>
            <LanguageTabs languages={definition.languages} value={editLanguage} onChange={onEditLanguageChange} />
          </div>
          <EndingsEditor
            definition={definition}
            onEdit={onEdit}
            language={editLanguage}
            numbering={numbering}
            showConditions
            highlightRuleId={focus?.ruleId}
          />
        </section>
      </fieldset>
    </div>
  );
};
