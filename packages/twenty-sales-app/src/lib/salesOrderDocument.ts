import { type PrintDocument } from '../api/usystems';
import { renderTemplateHtml } from './templateHandlebars';

// Turning a print-document bundle into a page the browser can print. Chrome's
// print dialog then writes a real PDF -- vector text, embedded fonts, correct
// RTL -- which is the same path the Usystems frontend itself prints through.

type Page = {
  width?: number;
  height?: number;
  unit?: string;
  orientation?: string;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  background?: string;
};

const num = (value: unknown, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** The `@page` rule and a matching body box, from the template's page settings. */
export const buildPageCss = (page: Page | undefined): string => {
  const unit = page?.unit === 'in' || page?.unit === 'cm' ? page.unit : 'mm';
  const width = num(page?.width, 210);
  const height = num(page?.height, 297);
  const landscape = page?.orientation === 'landscape';
  const m = page?.margin ?? {};
  const margin = `${num(m.top, 12)}${unit} ${num(m.right, 12)}${unit} ${num(m.bottom, 12)}${unit} ${num(m.left, 12)}${unit}`;
  const [w, h] = landscape ? [height, width] : [width, height];

  return [
    `@page { size: ${w}${unit} ${h}${unit}; margin: ${margin}; }`,
    `html, body { margin: 0; padding: 0; background: ${page?.background ?? '#FFFFFF'}; }`,
    `body { width: ${w}${unit}; min-height: ${h}${unit}; box-sizing: border-box; padding: ${margin}; }`,
    `@media print { body { padding: 0; min-height: 0; } }`,
    `.tpl-page { width: 100%; }`,
    `img { max-width: 100%; }`,
    `table { page-break-inside: auto; } tr { page-break-inside: avoid; }`,
  ].join('\n');
};

export type RenderedDocument = {
  html: string;
  ok: boolean;
  error?: string;
  direction: 'rtl' | 'ltr';
  language: string;
  title: string;
};

export const renderSalesOrderDocument = (doc: PrintDocument): RenderedDocument => {
  const meta = (doc.context?.meta ?? {}) as { direction?: string };
  const direction = meta.direction === 'rtl' ? 'rtl' : 'ltr';
  const document = (doc.context?.document ?? {}) as { number?: string };
  const result = renderTemplateHtml(doc.template.body_html, doc.context, {
    partials: doc.partials,
    labels: doc.labels,
  });

  return {
    ...result,
    direction,
    language: doc.language,
    title: `${doc.labels['Sales Order'] ?? 'Sales Order'} ${document.number ?? ''}`.trim(),
  };
};

const DOCUMENT_FONT_STACK = 'Vazirmatn, Inter, system-ui, sans-serif';

/** A full standalone HTML page for a print window / iframe. */
export const buildPrintableHtml = (doc: PrintDocument, rendered: RenderedDocument): string => {
  const css = buildPageCss(doc.template.page as Page);

  return [
    '<!doctype html>',
    `<html lang="${rendered.language}" dir="${rendered.direction}">`,
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(rendered.title)}</title>`,
    // Vazirmatn is what the Sales UI itself uses; Studio bodies fall back to
    // system fonts when they name something not installed here.
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vazirmatn@33.0.3/Vazirmatn-font-face.css" />',
    `<style>${css}\nbody { font-family: ${DOCUMENT_FONT_STACK}; color: #0B253F; }</style>`,
    '</head>',
    `<body>${rendered.html}</body>`,
    '</html>',
  ].join('\n');
};

// The page box in CSS pixels, for laying the document out inside the app
// before it is rasterised: 96 px per inch, 25.4 mm per inch.
const PX_PER_MM = 96 / 25.4;

type PageBox = { widthMm: number; heightMm: number; orientation: 'portrait' | 'landscape' };

export const pageBox = (page: Page | undefined): PageBox => {
  const unit = page?.unit === 'in' || page?.unit === 'cm' ? page.unit : 'mm';
  const toMm = unit === 'in' ? 25.4 : unit === 'cm' ? 10 : 1;
  const width = Math.round(num(page?.width, 210) * toMm * 100) / 100;
  const height = Math.round(num(page?.height, 297) * toMm * 100) / 100;
  const landscape = page?.orientation === 'landscape';
  return {
    widthMm: landscape ? height : width,
    heightMm: landscape ? width : height,
    orientation: landscape ? 'landscape' : 'portrait',
  };
};

/**
 * Write the document straight to a .pdf file named by the order code.
 *
 * The page is laid out inside the app document at its real width -- the app
 * already ships Vazirmatn, so no stylesheet has to load -- then rasterised
 * by html2pdf (html2canvas → jsPDF), the same library Usystems' own print
 * agent uses. The text in the file is an image; the print window stays the
 * way to a vector PDF.
 */
export const downloadSalesOrderPdf = async (
  doc: PrintDocument,
  rendered: RenderedDocument,
): Promise<void> => {
  const page = doc.template.page as Page | undefined;
  const box = pageBox(page);
  const m = page?.margin ?? {};
  const unit = page?.unit === 'in' || page?.unit === 'cm' ? page.unit : 'mm';
  const toMm = unit === 'in' ? 25.4 : unit === 'cm' ? 10 : 1;
  const margin: [number, number, number, number] = [
    num(m.top, 12) * toMm,
    num(m.right, 12) * toMm,
    num(m.bottom, 12) * toMm,
    num(m.left, 12) * toMm,
  ];

  const host = document.createElement('div');
  host.setAttribute('dir', rendered.direction);
  host.setAttribute('lang', rendered.language);
  host.style.cssText = [
    'position:fixed',
    'left:0',
    'top:0',
    'z-index:-1',
    'opacity:0',
    'pointer-events:none',
    `width:${Math.round((box.widthMm - margin[1] - margin[3]) * PX_PER_MM)}px`,
    'background:#fff',
    `font-family:${DOCUMENT_FONT_STACK}`,
    'color:#0B253F',
  ].join(';');
  host.innerHTML = rendered.html;
  document.body.appendChild(host);

  try {
    await document.fonts?.ready;
    const { default: html2pdf } = await import('html2pdf.js');
    // html2pdf's typings omit `pagebreak`; a variable sidesteps the literal check.
    const options = {
      margin,
      filename: `${safeFilename(rendered.title)}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
      jsPDF: { unit: 'mm', format: [box.widthMm, box.heightMm] as [number, number], orientation: box.orientation },
      pagebreak: { mode: ['css', 'legacy'] },
    };
    await html2pdf().set(options).from(host).save();
  } finally {
    host.remove();
  }
};

const safeFilename = (title: string): string =>
  title.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'sales-order';

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * Open the document in a new window and hand it to the browser's print
 * dialog, where "Save as PDF" writes the file. Returns false when the popup
 * was blocked so the caller can tell the seller.
 */
export const openPrintWindow = (html: string): boolean => {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // Fonts and barcode SVGs are inline or cached; a short defer lets the
  // stylesheet link resolve before the dialog snapshots the page.
  win.addEventListener('load', () => {
    win.focus();
    setTimeout(() => win.print(), 300);
  });
  return true;
};
