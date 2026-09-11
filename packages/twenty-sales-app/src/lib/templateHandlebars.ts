/**
 * Template Studio v2 renderer — a port of the Usystems frontend's
 * `src/utils/templateHandlebars.ts`, kept as close to byte-identical as the
 * two apps allow so a stored template renders the same document here as it
 * does in Usystems. The helper set (currency, number, jalali, t, en, ltr,
 * barcode, qr, image, eq, gt/lt/gte/lte, add, subtract, repeat) and the
 * partial and sanitizer behaviour are the originals; the three app-internal
 * imports are replaced:
 *
 *   - `t` reads the `labels` dict the print-document endpoint ships (the
 *     original reads the app's translation catalog). The `lang="fa"` hash the
 *     seeded bodies carry is honoured by the server: it resolves the labels
 *     in that same tenant language, so here the hash is accepted and ignored.
 *   - `jalali` formats with this app's own Jalali formatter.
 *   - `words` (amount in words) has no counterpart here and renders empty; the
 *     seeded Sales Order body does not use it.
 */

import DOMPurify from 'dompurify';
import Handlebars from 'handlebars';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

import { formatJalaliDate } from './jalali';

export interface PartialLike {
  key: string;
  bodyHtml?: string;
}

export interface RenderTemplateOptions {
  partials?: PartialLike[];
  /** `{{t "Key"}}` answers from here; a missing key renders as the key itself. */
  labels?: Record<string, string>;
  /** Merged into the context root under `vars.*` and at top level (legacy {{var}}). */
  variables?: Record<string, unknown>;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Module-level so the helper closure sees the labels of the render in flight.
let currentLabels: Record<string, string> = {};

let helpersRegistered = false;

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n =
    typeof value === 'number' ? value : parseFloat(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** Group with thousands separators; up to 2 dp; optional currency symbol. */
const formatAmount = (value: unknown, symbol?: string): string => {
  const n = toNumber(value);
  if (n === null) return value == null ? '' : String(value);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
  const sym = symbol ? String(symbol).trim() : '';
  return sym ? `${sym}${formatted}` : formatted;
};

const barcodeSvg = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  try {
    const svg = document.createElementNS(SVG_NS, 'svg');
    JsBarcode(svg, String(value), {
      format: 'CODE128',
      displayValue: false,
      height: 40,
      width: 1.6,
      margin: 0,
    });
    return new XMLSerializer().serializeToString(svg);
  } catch {
    return '';
  }
};

const qrSvg = (value: unknown, size = 96): string => {
  if (value === null || value === undefined || value === '') return '';
  let out = '';
  // qrcode invokes the callback synchronously for the SVG string type.
  QRCode.toString(String(value), { type: 'svg', margin: 1, width: size }, (err, svg) => {
    if (!err && svg) out = svg;
  });
  return out;
};

const registerHelpers = () => {
  if (helpersRegistered) return;
  helpersRegistered = true;

  Handlebars.registerHelper('currency', (amount: unknown, symbol?: unknown) => {
    const sym = typeof symbol === 'string' ? symbol : undefined;
    return new Handlebars.SafeString(
      Handlebars.escapeExpression(formatAmount(amount, sym)),
    );
  });

  Handlebars.registerHelper('number', (value: unknown) => formatAmount(value));

  Handlebars.registerHelper('jalali', (value: unknown) => {
    if (!value) return '';
    try {
      return formatJalaliDate(String(value)) || String(value);
    } catch {
      return String(value);
    }
  });

  Handlebars.registerHelper('t', (key: unknown) => {
    if (!key) return '';
    const text = String(key);
    return currentLabels[text] ?? text;
  });

  Handlebars.registerHelper('words', () => '');

  Handlebars.registerHelper('en', (value: unknown) => {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
      .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  });

  Handlebars.registerHelper('ltr', (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return new Handlebars.SafeString(
      `<span dir="ltr">${Handlebars.escapeExpression(text)}</span>`,
    );
  });

  Handlebars.registerHelper(
    'barcode',
    (value: unknown) => new Handlebars.SafeString(barcodeSvg(value)),
  );

  Handlebars.registerHelper(
    'qr',
    (value: unknown, size?: unknown) =>
      new Handlebars.SafeString(qrSvg(value, typeof size === 'number' ? size : 96)),
  );

  Handlebars.registerHelper('image', (url: unknown, alt?: unknown) => {
    if (!url) return '';
    const src = Handlebars.escapeExpression(String(url));
    const altText = typeof alt === 'string' ? Handlebars.escapeExpression(alt) : '';
    return new Handlebars.SafeString(
      `<img src="${src}" alt="${altText}" style="max-width:100%;height:auto;" />`,
    );
  });

  Handlebars.registerHelper(
    'eq',
    (a: unknown, b: unknown) =>
      a === b || (a != null && b != null && String(a) === String(b)),
  );

  const cmp = (a: unknown, b: unknown): number => {
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  };
  Handlebars.registerHelper('gt', (a: unknown, b: unknown) => cmp(a, b) > 0);
  Handlebars.registerHelper('lt', (a: unknown, b: unknown) => cmp(a, b) < 0);
  Handlebars.registerHelper('gte', (a: unknown, b: unknown) => cmp(a, b) >= 0);
  Handlebars.registerHelper('lte', (a: unknown, b: unknown) => cmp(a, b) <= 0);

  Handlebars.registerHelper('add', (...args: unknown[]) => {
    args.pop(); // drop the Handlebars options object
    return args.reduce<number>((sum, x) => sum + (Number(x) || 0), 0);
  });
  Handlebars.registerHelper(
    'subtract',
    (a: unknown, b: unknown) => (Number(a) || 0) - (Number(b) || 0),
  );

  Handlebars.registerHelper('repeat', function (this: unknown, count: unknown, options: Handlebars.HelperOptions) {
    const n = Math.max(0, Math.min(500, Math.floor(Number(count) || 0)));
    if (n === 0) return options.inverse ? options.inverse(this) : '';
    let out = '';
    for (let i = 0; i < n; i += 1) {
      out += options.fn(this, {
        data: { ...(options.data || {}), index: i, first: i === 0, last: i === n - 1 },
      });
    }
    return out;
  });
};

// ---------------------------------------------------------------------------
// Partials
// ---------------------------------------------------------------------------

const REFERENCED_PARTIAL_RE = /\{\{>\s*([a-zA-Z0-9_-]+)/g;

const syncPartials = (bodyHtml: string, partials: PartialLike[]) => {
  const provided = new Set<string>();
  partials.forEach((p) => {
    if (p && p.key) provided.add(p.key);
  });

  Object.keys(Handlebars.partials).forEach((key) => {
    if (!provided.has(key)) Handlebars.unregisterPartial(key);
  });

  partials.forEach((p) => {
    if (p && p.key) Handlebars.registerPartial(p.key, p.bodyHtml || '');
  });

  let match: RegExpExecArray | null;
  REFERENCED_PARTIAL_RE.lastIndex = 0;
  // eslint-disable-next-line no-cond-assign
  while ((match = REFERENCED_PARTIAL_RE.exec(bodyHtml))) {
    const key = match[1];
    if (!Handlebars.partials[key]) {
      Handlebars.registerPartial(key, '');
    }
  }
};

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

const SANITIZE_CONFIG = {
  ADD_TAGS: ['svg', 'path', 'rect', 'g', 'line', 'text', 'tspan', 'defs', 'clipPath', 'polygon', 'polyline', 'circle'],
  ADD_ATTR: [
    'dir', 'colspan', 'rowspan', 'style',
    'viewBox', 'xmlns', 'x', 'y', 'width', 'height', 'rx', 'ry',
    'fill', 'stroke', 'stroke-width', 'd', 'transform', 'points', 'text-anchor', 'font-size', 'font-family',
  ],
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|callto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  ADD_DATA_URI_TAGS: ['img'],
  FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'meta', 'style'],
};

export const sanitizeTemplateHtml = (html: string): string =>
  DOMPurify.sanitize(html, SANITIZE_CONFIG) as unknown as string;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RenderResult {
  html: string;
  ok: boolean;
  error?: string;
}

/** Compile + render a Handlebars body against a context, returning sanitized HTML. */
export const renderTemplateHtml = (
  bodyHtml: string,
  context: Record<string, unknown>,
  options: RenderTemplateOptions = {},
): RenderResult => {
  registerHelpers();
  const partials = options.partials || [];
  const source = bodyHtml || '';
  currentLabels = options.labels || {};

  try {
    syncPartials(source, partials);
    const compiled = Handlebars.compile(source, { noEscape: false });
    const vars = options.variables || {};
    const fullContext = { ...vars, ...context, vars };
    const rendered = compiled(fullContext);
    return { html: sanitizeTemplateHtml(rendered), ok: true };
  } catch (error) {
    const message = (error as Error)?.message || 'Template render error';
    return {
      html: `<div style="color:#b91c1c;font-size:12px;padding:8px;border:1px solid #fca5a5;border-radius:6px;">Template error: ${Handlebars.escapeExpression(
        message,
      )}</div>`,
      ok: false,
      error: message,
    };
  } finally {
    currentLabels = {};
  }
};
