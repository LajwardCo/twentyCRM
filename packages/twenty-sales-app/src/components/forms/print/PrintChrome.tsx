import { type FormLanguage, type PrintIssue } from '@shared/surveys';
import { type ReactNode, useEffect } from 'react';

import { PRINT_CHROME, TC } from '../../../lib/forms/collectStrings';
import { cssString } from '../../../lib/forms/print/printLayout';

// The running footer on every printed page (form title · version code · page
// x of y) uses CSS paged media margin boxes, which only a stylesheet can
// express. The user-controlled parts go through cssString, which hex-escapes
// everything but letters, digits and spaces.
export const PrintPageStyle = ({ footer, language }: { footer: string; language: FormLanguage }) => {
  useEffect(() => {
    const chrome = PRINT_CHROME[language];
    const counterStyle = language === 'en' ? 'decimal' : 'persian';
    const style = document.createElement('style');

    style.setAttribute('data-svc-print', '');
    style.textContent = `@page {
  size: A4;
  margin: 14mm 13mm 18mm;
  @bottom-center {
    content: ${cssString(footer)} "  ·  " ${cssString(chrome.pageFooter.page)} " " counter(page, ${counterStyle}) " " ${cssString(chrome.pageFooter.of)} " " counter(pages, ${counterStyle});
    font-family: Vazirmatn, Tahoma, sans-serif;
    font-size: 8.5pt;
    color: #4a5164;
  }
}`;
    document.head.appendChild(style);

    return () => style.remove();
  }, [footer, language]);

  return null;
};

export const PrintToolbar = ({ children }: { children: ReactNode }) => (
  <div className="svc-print-toolbar">{children}</div>
);

// Printing is refused when a digital rule cannot be written down without
// ambiguity; the message says what to change.
export const PrintBlockers = ({ blockers }: { blockers: PrintIssue[] }) => (
  <section className="card svc-blockers" role="alert">
    <h2>{TC.printBlockedTitle}</h2>
    <ul>
      {blockers.map((blocker, index) => (
        <li key={`${blocker.itemId ?? blocker.pageId ?? ''}-${index}`} dir="auto">
          {blocker.message}
        </li>
      ))}
    </ul>
    <p>{TC.printBlockedHint}</p>
  </section>
);
