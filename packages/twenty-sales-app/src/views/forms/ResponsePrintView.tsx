import { analysePrintability } from '@shared/surveys';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  type SurveyFormVersion,
  type SurveyResponse,
  fetchResponse,
  fetchVersion,
} from '../../api/surveys';
import { PrintPageStyle, PrintToolbar } from '../../components/forms/print/PrintChrome';
import { type PrintMetaRow, PrintDocument } from '../../components/forms/print/PrintDocument';
import { PRINT_CHROME, TC } from '../../lib/forms/collectStrings';
import { COMPLETION_LABELS, INTEREST_LABELS, SOURCE_LABELS } from '../../lib/forms/surveyStrings';
import { formatJalaliDate, formatJalaliDateTime } from '../../lib/jalali';

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; response: SurveyResponse; version: SurveyFormVersion };

const memberName = (member: SurveyResponse['collector']): string =>
  member === null ? '' : `${member.name.firstName} ${member.name.lastName}`.trim();

// One response on the same A4 layout as the blank questionnaire, answered —
// always against the version the response was given on.
export const ResponsePrintView = ({ responseId }: { responseId: string }) => {
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const printed = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetchResponse(responseId);
        const version = response === null ? null : await fetchVersion(response.formVersionId);

        if (cancelled) return;

        setLoaded(
          response === null || version === null
            ? { status: 'error', message: TC.responseNotFound }
            : { status: 'ready', response, version },
        );
      } catch {
        if (!cancelled) setLoaded({ status: 'error', message: TC.loadFailed });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [responseId]);

  const language = loaded.status === 'ready' ? (loaded.version.definition.languages[0] ?? 'fa') : 'fa';
  const analysis = useMemo(
    () =>
      loaded.status === 'ready'
        ? analysePrintability(loaded.version.definition, { audience: 'STAFF', language })
        : null,
    [loaded, language],
  );

  useEffect(() => {
    if (loaded.status !== 'ready' || printed.current) return;

    printed.current = true;
    document.title = `${loaded.response.form?.name ?? ''} — ${loaded.response.name}`;
    void document.fonts.ready.then(() => window.setTimeout(() => window.print(), 300));
  }, [loaded]);

  if (loaded.status !== 'ready' || analysis === null) {
    return (
      <div className="svc-print-screen">
        <div className="svc-print-status" role={loaded.status === 'error' ? 'alert' : 'status'}>
          {loaded.status === 'error' ? loaded.message : TC.loading}
        </div>
      </div>
    );
  }

  const { response, version } = loaded;
  const chrome = PRINT_CHROME[language];
  const formName = response.form?.name ?? '';
  const rows: PrintMetaRow[] = [
    { label: chrome.meta.form, value: formName },
    { label: chrome.meta.version, value: version.printCode },
    { label: chrome.meta.source, value: SOURCE_LABELS[response.source] ?? response.source },
    { label: chrome.meta.completion, value: COMPLETION_LABELS[response.completionStatus] ?? '' },
    { label: chrome.meta.collectedAt, value: response.collectedAt === null ? '' : formatJalaliDateTime(response.collectedAt) },
    { label: chrome.meta.enteredAt, value: response.enteredAt === null ? '' : formatJalaliDate(response.enteredAt) },
    { label: chrome.meta.collector, value: memberName(response.collector) },
    { label: chrome.meta.enteredBy, value: memberName(response.enteredBy) },
    { label: chrome.meta.paperReference, value: response.paperReference },
    { label: chrome.meta.interest, value: response.buyingInterest === null ? '' : INTEREST_LABELS[response.buyingInterest] },
    { label: chrome.meta.place, value: [response.city, response.area].filter((part) => part !== '').join('، ') },
    { label: chrome.meta.reviewNotes, value: response.paperReviewNotes },
  ].filter((row) => row.value !== '');

  return (
    <div className="svc-print-screen">
      <PrintToolbar>
        <b dir="auto">{response.name}</b>
        <span dir="ltr">{version.printCode}</span>
        <span className="svc-spacer" />
        <button type="button" className="btn gold" onClick={() => window.print()}>
          {TC.printButton}
        </button>
      </PrintToolbar>
      <PrintPageStyle footer={[formName, version.printCode, response.name].join('  ·  ')} language={language} />
      <PrintDocument
        definition={version.definition}
        analysis={analysis}
        audience="STAFF"
        language={language}
        title={formName}
        printCode={version.printCode}
        draft={false}
        draftLabel=""
        sheetRef={response.paperReference === '' ? null : response.paperReference}
        qrDataUrl={null}
        campaign={response.campaign === null ? null : { name: response.campaign.name, code: '' }}
        filled={{ answers: response.answers, skippedByLogic: response.skippedByLogic }}
        metaRows={rows}
      />
    </div>
  );
};
