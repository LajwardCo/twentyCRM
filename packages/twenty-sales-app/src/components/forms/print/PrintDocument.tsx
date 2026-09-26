import {
  type FormAudience,
  type FormDefinition,
  type FormLanguage,
  type PrintAnalysis,
  pickLocalizedText,
} from '@shared/surveys';
import { useMemo } from 'react';

import { PRINT_CHROME } from '../../../lib/forms/collectStrings';
import { directionOf } from '../../../lib/forms/formText';
import { buildPrintPages, filledStatus } from '../../../lib/forms/print/printLayout';
import { PrintQuestion } from './PrintQuestion';

export type PrintMetaRow = { label: string; value: string };

type PrintDocumentProps = {
  definition: FormDefinition;
  analysis: PrintAnalysis;
  audience: FormAudience;
  language: FormLanguage;
  title: string;
  printCode: string | null;
  draft: boolean;
  draftLabel: string;
  sheetRef: string | null;
  qrDataUrl: string | null;
  campaign: { name: string; code: string } | null;
  filled?: { answers: Record<string, unknown>; skippedByLogic: string[] };
  metaRows?: PrintMetaRow[];
};

const safeLogo = (url: string | undefined): string | null =>
  url !== undefined && /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : null;

// One printed copy of the questionnaire (blank, or filled for a response).
// Built from React text nodes only — no HTML from the form is ever injected.
export const PrintDocument = ({
  definition,
  analysis,
  audience,
  language,
  title,
  printCode,
  draft,
  draftLabel,
  sheetRef,
  qrDataUrl,
  campaign,
  filled,
  metaRows,
}: PrintDocumentProps) => {
  const chrome = PRINT_CHROME[language];
  const pages = useMemo(
    () => buildPrintPages(definition, audience, analysis, language),
    [definition, audience, analysis, language],
  );
  const logo = safeLogo(definition.appearance.logoUrl);
  const instructions = pickLocalizedText(definition.print?.instructions, language, definition.languages);

  return (
    <article className="svc-print-doc" dir={directionOf(language)}>
      {draft && <div className="svc-watermark" aria-hidden="true">{draftLabel}</div>}

      <header className="svc-print-head">
        <div className="svc-print-title">
          {logo !== null && <img src={logo} alt="" className="svc-print-logo" referrerPolicy="no-referrer" />}
          <div>
            <h1 dir="auto">{title}</h1>
            {printCode !== null && <div className="svc-print-code" dir="ltr">{printCode}</div>}
            {draft && <div className="svc-print-draft">{draftLabel}</div>}
          </div>
        </div>
        <div className="svc-print-aside">
          {sheetRef !== null && (
            <div className="svc-sheet-ref">
              <small>{chrome.sheetReference}</small>
              <b dir="ltr">{sheetRef}</b>
            </div>
          )}
          {qrDataUrl !== null && (
            <figure className="svc-print-qr">
              <img src={qrDataUrl} alt="" />
              <figcaption>{chrome.scanToFill}</figcaption>
            </figure>
          )}
        </div>
      </header>

      {metaRows !== undefined && metaRows.length > 0 && (
        <dl className="svc-print-meta">
          {metaRows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd dir="auto">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {campaign !== null && (
        <div className="svc-print-campaign">
          <span>{chrome.campaign}:</span> <b dir="auto">{campaign.name}</b>
          {campaign.code !== '' && (
            <span className="svc-print-campaign-code">
              {chrome.campaignCode}: <span dir="ltr">{campaign.code}</span>
            </span>
          )}
        </div>
      )}

      {(instructions !== '' || analysis.notes.length > 0) && filled === undefined && (
        <section className="svc-print-instructions">
          <h2>{chrome.instructionsTitle}</h2>
          {instructions !== '' && <p dir="auto">{instructions}</p>}
          {analysis.notes.map((note) => (
            <p key={note} dir="auto">{note}</p>
          ))}
        </section>
      )}

      {pages.map((page) => (
        <section key={page.id} className="svc-print-page">
          {page.title !== '' && <h2 className="svc-print-page-title" dir="auto">{page.title}</h2>}
          {page.description !== '' && <p className="svc-print-page-desc" dir="auto">{page.description}</p>}
          {page.entries.map((entry) => {
            if (entry.kind === 'section') {
              return (
                <div key={entry.id} className="svc-print-section">
                  <h3 dir="auto">{entry.title}</h3>
                  {entry.description !== '' && <p dir="auto">{entry.description}</p>}
                  {entry.instruction !== null && <p className="svc-q-instruction" dir="auto">{entry.instruction}</p>}
                </div>
              );
            }

            if (entry.kind === 'block') {
              if (entry.block.kind === 'divider') return <hr key={entry.id} className="svc-print-divider" />;
              if (entry.block.kind === 'image') {
                return (
                  <p key={entry.id} className="svc-print-image-alt" dir="auto">
                    {[entry.text, entry.alternative].filter((part) => part !== null && part !== '').join(' ')}
                  </p>
                );
              }

              return entry.block.kind === 'heading' ? (
                <h3 key={entry.id} className="svc-print-heading" dir="auto">{entry.text}</h3>
              ) : (
                <p key={entry.id} className="svc-print-paragraph" dir="auto">{entry.text}</p>
              );
            }

            return (
              <PrintQuestion
                key={entry.id}
                question={entry.question}
                number={entry.number}
                label={entry.label}
                description={entry.description}
                instruction={entry.instruction}
                alternative={filled === undefined ? entry.alternative : null}
                definition={definition}
                language={language}
                chrome={chrome}
                filled={
                  filled === undefined
                    ? undefined
                    : {
                        value: filled.answers[entry.id],
                        status: filledStatus(entry.id, filled.answers, filled.skippedByLogic),
                      }
                }
              />
            );
          })}
          {page.jumps.length > 0 && filled === undefined && (
            <div className="svc-print-jumps">
              {page.jumps.map((jump) => (
                <p key={jump} dir="auto">{directionOf(language) === 'rtl' ? '⬅' : '➜'} {jump}</p>
              ))}
            </div>
          )}
        </section>
      ))}
    </article>
  );
};
