import {
  type FormDefinition,
  type FormPage,
  type PageJump,
  generateSurveyId,
  pickLocalizedText,
} from '@shared/surveys';

import { TB } from '../../../lib/forms/builderStrings';
import { defaultConditionFor, jumpTargets, questionsThroughPage } from '../../../lib/forms/builder/conditionOptions';
import { updatePage } from '../../../lib/forms/builder/definitionOps';
import { IconChevronDown, IconPlus, IconTrash } from '../../icons';
import { type DefinitionUpdater } from './builderTypes';
import { ConditionGroupEditor } from './ConditionGroupEditor';

type PageJumpsEditorProps = {
  page: FormPage;
  pageIndex: number;
  definition: FormDefinition;
  numbering: Record<string, number>;
  highlightRuleId: string | undefined;
  onEdit: (updater: DefinitionUpdater) => void;
};

const targetValue = (jump: PageJump) =>
  'pageId' in jump.to ? `page:${jump.to.pageId}` : `end:${jump.to.endingId}`;

const parseTarget = (value: string): PageJump['to'] =>
  value.startsWith('page:') ? { pageId: value.slice(5) } : { endingId: value.slice(4) };

// "After page N, if …, go to page X / end with ending Y". Only later pages are
// offered, so a jump can never loop back.
export const PageJumpsEditor = ({
  page,
  pageIndex,
  definition,
  numbering,
  highlightRuleId,
  onEdit,
}: PageJumpsEditorProps) => {
  const language = definition.languages[0] ?? 'fa';
  const targets = jumpTargets(definition, page.id);
  const candidates = questionsThroughPage(definition, page.id);
  const isLastPage = pageIndex === definition.pages.length - 1;
  const setJumps = (jumps: PageJump[]) => onEdit((current) => updatePage(current, page.id, (existing) => ({ ...existing, jumps })));
  const defaultTarget = (): PageJump['to'] | null => {
    const nextPage = targets.pages[0]?.page;

    if (nextPage !== undefined) return { pageId: nextPage.id };
    if (definition.endings[0] !== undefined) return { endingId: definition.endings[0].id };

    return null;
  };

  const knownTargets = new Set([
    ...targets.pages.map((entry) => `page:${entry.page.id}`),
    ...targets.endings.map((ending) => `end:${ending.id}`),
  ]);

  return (
    <div className="svb-jumps">
      <h4>{TB.afterPage(pageIndex + 1)}</h4>
      {page.jumps.length === 0 && (
        <p className="svb-hint">{isLastPage ? TB.lastPageNoJumps : TB.noJumps}</p>
      )}
      {page.jumps.length > 1 && <p className="svb-hint">{TB.jumpOrderHint}</p>}
      <ol className="svb-jump-list">
        {page.jumps.map((jump, index) => (
          <li
            key={jump.id}
            id={`svb-rule-${jump.id}`}
            className={`svb-jump${highlightRuleId === jump.id ? ' svb-hl' : ''}`}
          >
            <div className="svb-jump-if">
              <span className="svb-jump-word">{TB.jumpIf}</span>
              <ConditionGroupEditor
                group={jump.when}
                onChange={(when) =>
                  setJumps(page.jumps.map((candidate) => (candidate.id === jump.id ? { ...candidate, when } : candidate)))
                }
                candidates={candidates}
                definition={definition}
                numbering={numbering}
                emptyText={TB.jumpAlways}
              />
            </div>
            <div className="svb-jump-to">
              <label className="svb-jump-word" htmlFor={`svb-jump-target-${jump.id}`}>
                {TB.jumpGoTo}
              </label>
              <select
                id={`svb-jump-target-${jump.id}`}
                value={targetValue(jump)}
                aria-invalid={!knownTargets.has(targetValue(jump))}
                onChange={(event) =>
                  setJumps(
                    page.jumps.map((candidate) =>
                      candidate.id === jump.id ? { ...candidate, to: parseTarget(event.target.value) } : candidate,
                    ),
                  )
                }
              >
                {!knownTargets.has(targetValue(jump)) && <option value={targetValue(jump)}>⚠ {TB.jumpTarget}</option>}
                {targets.pages.map((entry) => (
                  <option key={entry.page.id} value={`page:${entry.page.id}`}>
                    {TB.goToPage(entry.pageIndex + 1, pickLocalizedText(entry.page.title, language, definition.languages))}
                  </option>
                ))}
                {targets.endings.map((ending, endingIndex) => (
                  <option key={ending.id} value={`end:${ending.id}`}>
                    {TB.endWith(pickLocalizedText(ending.title, language, definition.languages) || TB.endingN(endingIndex + 1))}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="svb-tool"
                aria-label={TB.moveJumpUp}
                title={TB.moveJumpUp}
                disabled={index === 0}
                onClick={() => {
                  const jumps = [...page.jumps];

                  [jumps[index - 1], jumps[index]] = [jumps[index], jumps[index - 1]];
                  setJumps(jumps);
                }}
              >
                <span className="svb-rot180" aria-hidden="true">
                  <IconChevronDown size={14} />
                </span>
              </button>
              <button
                type="button"
                className="svb-tool danger"
                aria-label={TB.removeJump}
                title={TB.removeJump}
                onClick={() => setJumps(page.jumps.filter((candidate) => candidate.id !== jump.id))}
              >
                <IconTrash size={14} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn line sm"
        disabled={defaultTarget() === null}
        onClick={() => {
          const to = defaultTarget();
          const lastQuestion = candidates[candidates.length - 1];

          if (to === null) return;

          // Starts conditional on the page's last question; removing every
          // condition turns it into an "always" jump.
          setJumps([
            ...page.jumps,
            {
              id: generateSurveyId('j'),
              when: {
                mode: 'ALL',
                conditions: lastQuestion === undefined ? [] : [defaultConditionFor(lastQuestion.question)],
              },
              to,
            },
          ]);
        }}
      >
        <IconPlus size={14} />
        {TB.addJump}
      </button>
    </div>
  );
};
