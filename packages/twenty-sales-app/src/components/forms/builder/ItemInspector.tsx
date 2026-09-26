import { type FormItem } from '@shared/surveys';

import { TB, formatCount } from '../../../lib/forms/builderStrings';
import { locateItem, updateItem, updatePage } from '../../../lib/forms/builder/definitionOps';
import { QUESTION_TYPE_LABELS } from '../../../lib/forms/surveyStrings';
import { DisplayBlockInspector, PageInspector, SectionInspector } from './BlockInspector';
import { type BuilderSelection, type EditorProps } from './builderTypes';
import { LanguageTabs } from './LocalizedField';
import { QuestionInspector } from './QuestionInspector';

type ItemInspectorProps = EditorProps & {
  selection: BuilderSelection;
  numbering: Record<string, number>;
  onOpenLogic: () => void;
};

const titleOf = (item: FormItem): string =>
  item.kind === 'question' ? QUESTION_TYPE_LABELS[item.type] : TB.blockLabels[item.kind];

// Edits whatever is selected on the canvas. Read-only users see the same
// panel with every control disabled.
export const ItemInspector = ({
  definition,
  onEdit,
  readOnly,
  editLanguage,
  onEditLanguageChange,
  selection,
  numbering,
  onOpenLogic,
}: ItemInspectorProps) => {
  if (selection === null) {
    return <p className="svb-inspector-empty">{TB.inspectorEmpty}</p>;
  }

  if (selection.kind === 'page') {
    const pageIndex = definition.pages.findIndex((page) => page.id === selection.id);
    const page = definition.pages[pageIndex];

    if (page === undefined) return <p className="svb-inspector-empty">{TB.inspectorEmpty}</p>;

    return (
      <>
        <div className="svb-inspector-head">
          <h3>{TB.pageN(pageIndex + 1)}</h3>
          <LanguageTabs languages={definition.languages} value={editLanguage} onChange={onEditLanguageChange} />
        </div>
        <fieldset disabled={readOnly} className="svb-fieldset">
          <PageInspector
            page={page}
            definition={definition}
            language={editLanguage}
            onChange={(next) => onEdit((current) => updatePage(current, page.id, () => next))}
            onOpenLogic={onOpenLogic}
          />
        </fieldset>
      </>
    );
  }

  const location = locateItem(definition, selection.id);

  if (location === null) return <p className="svb-inspector-empty">{TB.inspectorEmpty}</p>;

  const { item } = location;
  const replace = (next: FormItem) => onEdit((current) => updateItem(current, item.id, () => next));

  return (
    <>
      <div className="svb-inspector-head">
        <h3>
          {titleOf(item)}
          {numbering[item.id] !== undefined && <span className="svb-muted"> · {formatCount(numbering[item.id])}</span>}
        </h3>
        <LanguageTabs languages={definition.languages} value={editLanguage} onChange={onEditLanguageChange} />
      </div>
      <fieldset disabled={readOnly} className="svb-fieldset">
        {item.kind === 'question' && (
          <QuestionInspector
            key={item.id}
            question={item}
            definition={definition}
            numbering={numbering}
            language={editLanguage}
            onChange={replace}
            onOpenLogic={onOpenLogic}
          />
        )}
        {item.kind === 'section' && (
          <SectionInspector
            key={item.id}
            section={item}
            definition={definition}
            numbering={numbering}
            language={editLanguage}
            onChange={replace}
            onOpenLogic={onOpenLogic}
          />
        )}
        {item.kind !== 'question' && item.kind !== 'section' && (
          <DisplayBlockInspector
            key={item.id}
            block={item}
            definition={definition}
            language={editLanguage}
            onChange={replace}
          />
        )}
      </fieldset>
    </>
  );
};
