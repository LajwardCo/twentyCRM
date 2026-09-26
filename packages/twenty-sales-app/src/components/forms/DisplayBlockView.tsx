import { type DisplayBlock, type FormDefinition, type FormLanguage, type SectionBlock } from '@shared/surveys';

import { formText } from '../../lib/forms/formText';

// Display-only content. Text is rendered as text (never as HTML), and images
// only from https URLs.
export const DisplayBlockView = ({
  block,
  definition,
  language,
}: {
  block: DisplayBlock | SectionBlock;
  definition: FormDefinition;
  language: FormLanguage;
}) => {
  if (block.kind === 'section') {
    const description = formText(block.description, definition, language);

    return (
      <div className="sv-section">
        <h3 dir="auto">{formText(block.title, definition, language)}</h3>
        {description !== '' && <p dir="auto">{description}</p>}
      </div>
    );
  }

  switch (block.kind) {
    case 'heading':
      return <h3 className="sv-heading" dir="auto">{formText(block.text, definition, language)}</h3>;
    case 'paragraph':
      return <p className="sv-paragraph" dir="auto">{formText(block.text, definition, language)}</p>;
    case 'divider':
      return <hr className="sv-divider" />;
    case 'image':
      return block.imageUrl !== undefined && /^https:\/\//.test(block.imageUrl) ? (
        <img
          className="sv-image"
          src={block.imageUrl}
          alt={formText(block.imageAlt, definition, language)}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null;
  }
};
