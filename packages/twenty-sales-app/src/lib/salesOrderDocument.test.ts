// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { type PrintDocument } from '../api/usystems';
import fixture from './__fixtures__/salesOrderPrintDocument.json';
import { buildPageCss, buildPrintableHtml, renderSalesOrderDocument } from './salesOrderDocument';
import { renderTemplateHtml } from './templateHandlebars';

// The fixture is the REAL seeded Sales Order body (localized to fa, as a
// non-English tenant stores it), its sample context, its labels and the
// default partials -- exported from the backend catalog. If a redesign there
// adds a binding this renderer cannot resolve, or a label nobody translated,
// this is where it shows.

const doc = fixture as unknown as PrintDocument;

describe('renderSalesOrderDocument', () => {
  it('renders the seeded body with every binding and label resolved', () => {
    const rendered = renderSalesOrderDocument(doc);
    expect(rendered.ok).toBe(true);
    expect(rendered.direction).toBe('ltr'); // the sample context says ltr
    expect(rendered.html).not.toMatch(/\{\{/); // no unrendered mustache
    // labels came from the served dict, not the key
    expect(rendered.html).toContain('سفارش فروش');
    expect(rendered.html).toContain('معتبر تا');
    // document values landed
    expect(rendered.html).toContain('SO-2026-000118');
    expect(rendered.html).toContain('Sayed Moheb Sadat');
    expect(rendered.html).toContain('Usystems Core - Accounting Package (annual)');
    // amounts formatted by the currency helper, ltr-wrapped
    expect(rendered.html).toContain('55,000');
    expect(rendered.html).toContain('<span dir="ltr">');
    // barcode of the order code was drawn
    expect(rendered.html).toContain('<svg');
    expect(rendered.title).toBe('سفارش فروش SO-2026-000118');
  });

  it('shows the expired state when the deadline has passed', () => {
    const expired: PrintDocument = {
      ...doc,
      context: {
        ...doc.context,
        document: { ...(doc.context.document as object), is_expired: true },
      },
    };
    const rendered = renderSalesOrderDocument(expired);
    expect(rendered.html).toContain('منقضی شده');
    expect(rendered.html).toContain('#8a1c1c');
  });

  it('answers an unknown label with the key itself', () => {
    const out = renderTemplateHtml('<b>{{t "Nope"}}</b> {{t "Valid Until"}}', {}, { labels: { 'Valid Until': 'X' } });
    expect(out.html).toBe('<b>Nope</b> X');
  });

  it('strips scripts and keeps inline svg', () => {
    const out = renderTemplateHtml('<div><script>alert(1)</script>{{barcode "A1"}}</div>', {});
    expect(out.html).not.toContain('<script');
    expect(out.html).toContain('<svg');
  });
});

describe('buildPageCss / buildPrintableHtml', () => {
  it('derives @page from the template page settings', () => {
    const css = buildPageCss({ width: 148, height: 210, unit: 'mm', orientation: 'landscape', margin: { top: 5, right: 6, bottom: 7, left: 8 } });
    expect(css).toContain('@page { size: 210mm 148mm; margin: 5mm 6mm 7mm 8mm; }');
    expect(buildPageCss(undefined)).toContain('size: 210mm 297mm');
  });

  it('wraps the render in a standalone page with the document direction', () => {
    const rendered = renderSalesOrderDocument({ ...doc, context: { ...doc.context, meta: { direction: 'rtl', language: 'fa' } } });
    const html = buildPrintableHtml(doc, rendered);
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="fa" dir="rtl">');
    expect(html).toContain('<title>سفارش فروش SO-2026-000118</title>');
    expect(html).toContain('@page');
  });
});
