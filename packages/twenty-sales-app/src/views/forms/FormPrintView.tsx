import { type FormDefinition, analysePrintability } from '@shared/surveys';
import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchCampaign, fetchForm, fetchVersion, fetchVersions } from '../../api/surveys';
import { PrintBlockers, PrintPageStyle, PrintToolbar } from '../../components/forms/print/PrintChrome';
import { PrintDocument } from '../../components/forms/print/PrintDocument';
import { TC } from '../../lib/forms/collectStrings';
import { parsePrintOptions, sheetReferences } from '../../lib/forms/print/printLayout';
import { toPersianDigits } from '../../lib/jalali';
import { renderQrDataUrl } from '../../lib/qr';

type Loaded =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | {
      status: 'ready';
      title: string;
      definition: FormDefinition;
      printCode: string | null;
      publicUrl: string | null;
      campaign: { name: string; code: string } | null;
    };

// The A4 questionnaire (#/form/:id/print), rendered without the app shell so
// the printed pages hold only the form. Opens the print dialog by itself
// unless embedded in the builder preview.
export const FormPrintView = ({ formId, query }: { formId: string; query: string }) => {
  const options = useMemo(() => parsePrintOptions(query), [query]);
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [qr, setQr] = useState<string | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    let cancelled = false;

    setLoaded({ status: 'loading' });
    void (async () => {
      try {
        const form = await fetchForm(formId);
        let definition: FormDefinition | null = null;
        let printCode: string | null = null;

        if (options.draft) {
          definition = form.draftDefinition;
        } else {
          const version =
            options.versionNumber !== null
              ? ((await fetchVersions(formId)).find((candidate) => candidate.versionNumber === options.versionNumber) ?? null)
              : form.publishedVersion === null
                ? null
                : await fetchVersion(form.publishedVersion.id);

          definition = version?.definition ?? null;
          printCode = version?.printCode ?? null;
        }

        if (definition === null) {
          if (!cancelled) setLoaded({ status: 'error', message: form.publishedVersion === null ? TC.notPublished : TC.printNotFound });

          return;
        }

        const campaign = options.campaignId === null ? null : await fetchCampaign(options.campaignId).catch(() => null);
        const campaignQuery = campaign !== null && campaign.campaignStatus === 'ACTIVE' && campaign.publicCode !== ''
          ? `?c=${encodeURIComponent(campaign.publicCode)}`
          : '';
        const publicUrl =
          !options.draft && form.publicEnabled && form.publicSlug !== ''
            ? `${window.location.origin}/sales/#/f/${form.publicSlug}${campaignQuery}`
            : null;

        if (!cancelled) {
          setLoaded({
            status: 'ready',
            title: form.name,
            definition,
            printCode,
            publicUrl,
            campaign: campaign === null ? null : { name: campaign.name, code: campaign.publicCode },
          });
        }
      } catch {
        if (!cancelled) setLoaded({ status: 'error', message: TC.loadFailed });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [formId, options]);

  const publicUrl = loaded.status === 'ready' ? loaded.publicUrl : null;

  // The view stays mounted when only the query changes; never keep a QR
  // that belongs to other options (a draft must not carry the live link).
  useEffect(() => {
    setQr(null);

    if (!options.qr || publicUrl === null) return;

    renderQrDataUrl(publicUrl).then(setQr).catch(() => setQr(null));
  }, [options.qr, publicUrl]);

  const ready = loaded.status === 'ready';
  const language = loaded.status === 'ready' ? (loaded.definition.languages[0] ?? 'fa') : 'fa';
  const analysis = useMemo(
    () =>
      loaded.status === 'ready'
        ? analysePrintability(loaded.definition, { audience: options.audience, language })
        : null,
    [loaded, options.audience, language],
  );
  const blocked = analysis !== null && analysis.blockers.length > 0;
  const qrPending = options.qr && publicUrl !== null && qr === null;

  useEffect(() => {
    if (loaded.status !== 'ready') return;

    document.title = loaded.printCode === null ? loaded.title : `${loaded.title} — ${loaded.printCode}`;
  }, [loaded]);

  // Wait for the webfont and the QR so the first print already looks right.
  useEffect(() => {
    if (!ready || blocked || qrPending || options.embed || printed.current) return;

    printed.current = true;
    void document.fonts.ready.then(() => window.setTimeout(() => window.print(), 300));
  }, [ready, blocked, qrPending, options.embed]);

  if (loaded.status === 'loading') {
    return <div className="svc-print-screen"><div className="svc-print-status">{TC.loading}</div></div>;
  }

  if (loaded.status === 'error' || analysis === null) {
    return (
      <div className="svc-print-screen">
        <div className="svc-print-status" role="alert">{loaded.status === 'error' ? loaded.message : TC.loadFailed}</div>
      </div>
    );
  }

  const references = sheetReferences(loaded.printCode, options.copies, options.sheetRefs);
  const footer = [loaded.title, loaded.printCode ?? TC.printDraftWatermark].join('  ·  ');

  return (
    <div className="svc-print-screen">
      {!options.embed && (
        <PrintToolbar>
          <b dir="auto">{loaded.title}</b>
          {loaded.printCode !== null && <span dir="ltr">{loaded.printCode}</span>}
          <span>{TC.printCopies(toPersianDigits(options.copies))}</span>
          <span className="svc-spacer" />
          {!blocked && (
            <button type="button" className="btn gold" onClick={() => window.print()}>
              {TC.printButton}
            </button>
          )}
        </PrintToolbar>
      )}

      {blocked ? (
        <PrintBlockers blockers={analysis.blockers} />
      ) : (
        <>
          <PrintPageStyle footer={footer} language={language} />
          {references.map((sheetRef, index) => (
            <PrintDocument
              key={index}
              definition={loaded.definition}
              analysis={analysis}
              audience={options.audience}
              language={language}
              title={loaded.title}
              printCode={loaded.printCode}
              draft={options.draft}
              draftLabel={TC.printDraftWatermark}
              sheetRef={sheetRef}
              qrDataUrl={qr}
              campaign={loaded.campaign}
            />
          ))}
        </>
      )}
    </div>
  );
};
