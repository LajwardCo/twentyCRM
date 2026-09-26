import {
  type DisplayBlock,
  type FormDefinition,
  type FormLanguage,
  type FormPage,
  type SectionBlock,
  describeConditionGroup,
} from '@shared/surveys';
import { useId, useState } from 'react';

import { TB } from '../../../lib/forms/builderStrings';
import { LocalizedField } from './LocalizedField';

export const isHttpsUrl = (value: string): boolean => {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
};

// Text boxes for https-only URLs: the draft only takes the value once it is
// empty or a valid https address, so a half-typed URL never reaches it.
export const HttpsUrlField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) => {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const invalid = text.trim() !== '' && !isHttpsUrl(text.trim());

  return (
    <div className="fld svb-fld">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        dir="ltr"
        inputMode="url"
        value={text}
        aria-invalid={invalid}
        aria-describedby={`${id}-hint`}
        placeholder="https://"
        onChange={(event) => {
          const next = event.target.value;

          setText(next);
          if (next.trim() === '') onChange(undefined);
          else if (isHttpsUrl(next.trim())) onChange(next.trim());
        }}
      />
      <p id={`${id}-hint`} className={`svb-hint${invalid ? ' error' : ''}`}>
        {TB.httpsOnly}
      </p>
    </div>
  );
};

type SectionInspectorProps = {
  section: SectionBlock;
  definition: FormDefinition;
  numbering: Record<string, number>;
  language: FormLanguage;
  onChange: (section: SectionBlock) => void;
  onOpenLogic: () => void;
};

export const SectionInspector = ({
  section,
  definition,
  numbering,
  language,
  onChange,
  onOpenLogic,
}: SectionInspectorProps) => (
  <div className="svb-inspector-body">
    <LocalizedField
      label={TB.sectionTitle}
      value={section.title}
      onChange={(title) => onChange({ ...section, title })}
      language={language}
      languages={definition.languages}
    />
    <LocalizedField
      label={TB.description}
      value={section.description}
      onChange={(description) => onChange({ ...section, description })}
      language={language}
      languages={definition.languages}
      multiline
    />
    <fieldset className="svb-group">
      <legend>{TB.rulesSection}</legend>
      <p className="svb-hint">
        {section.visibleWhen === undefined
          ? TB.rulesSummaryNone
          : `${TB.showWhenShort}: ${describeConditionGroup(section.visibleWhen, definition, 'fa', numbering)}`}
      </p>
      <button type="button" className="btn line sm" onClick={onOpenLogic}>
        {TB.editLogic}
      </button>
    </fieldset>
  </div>
);

type DisplayBlockInspectorProps = {
  block: DisplayBlock;
  definition: FormDefinition;
  language: FormLanguage;
  onChange: (block: DisplayBlock) => void;
};

export const DisplayBlockInspector = ({ block, definition, language, onChange }: DisplayBlockInspectorProps) => {
  const id = useId();

  return (
    <div className="svb-inspector-body">
      {(block.kind === 'heading' || block.kind === 'paragraph') && (
        <LocalizedField
          label={TB.blockText}
          value={block.text}
          onChange={(text) => onChange({ ...block, text })}
          language={language}
          languages={definition.languages}
          multiline={block.kind === 'paragraph'}
          rows={4}
        />
      )}
      {block.kind === 'image' && (
        <>
          <HttpsUrlField
            key={block.id}
            label={TB.imageUrl}
            value={block.imageUrl}
            onChange={(imageUrl) => onChange({ ...block, imageUrl })}
          />
          <LocalizedField
            label={TB.imageAlt}
            value={block.imageAlt}
            onChange={(imageAlt) => onChange({ ...block, imageAlt })}
            language={language}
            languages={definition.languages}
          />
        </>
      )}
      {block.kind === 'divider' && <p className="svb-hint">{TB.dividerHint}</p>}
      <div className="fld svb-fld">
        <label htmlFor={`${id}-audience`}>{TB.blockAudience}</label>
        <select
          id={`${id}-audience`}
          value={block.audience ?? 'ALL'}
          onChange={(event) =>
            onChange({ ...block, audience: event.target.value === 'STAFF_ONLY' ? 'STAFF_ONLY' : 'ALL' })
          }
        >
          <option value="ALL">{TB.audienceAll}</option>
          <option value="STAFF_ONLY">{TB.audienceStaff}</option>
        </select>
      </div>
    </div>
  );
};

type PageInspectorProps = {
  page: FormPage;
  definition: FormDefinition;
  language: FormLanguage;
  onChange: (page: FormPage) => void;
  onOpenLogic: () => void;
};

export const PageInspector = ({ page, definition, language, onChange, onOpenLogic }: PageInspectorProps) => (
  <div className="svb-inspector-body">
    <LocalizedField
      label={TB.pageTitle}
      value={page.title}
      onChange={(title) => onChange({ ...page, title })}
      language={language}
      languages={definition.languages}
    />
    <LocalizedField
      label={TB.pageDescription}
      value={page.description}
      onChange={(description) => onChange({ ...page, description })}
      language={language}
      languages={definition.languages}
      multiline
    />
    <fieldset className="svb-group">
      <legend>{TB.pageJumps}</legend>
      <p className="svb-hint">{page.jumps.length > 0 ? TB.jumpsN(page.jumps.length) : TB.pageJumpsHint}</p>
      <button type="button" className="btn line sm" onClick={onOpenLogic}>
        {TB.editLogic}
      </button>
    </fieldset>
  </div>
);
