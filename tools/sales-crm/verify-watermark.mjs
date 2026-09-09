// Run from the repo root: `node tools/sales-crm/verify-watermark.mjs`
// (uses playwright + pngjs from the root node_modules).
//
// Renders the SHIPPED .audit-watermark rules over a set of backgrounds, twice
// (with and without the overlay), and measures the exact per-pixel shift the
// overlay causes. That shift is the whole feature: too small and a screenshot
// carries nothing, too large and a person sees it.
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const css = fs.readFileSync('packages/twenty-sales-app/src/styles.css', 'utf8');
const block = css.slice(
  css.indexOf('/* ---- audit watermark ---'),
  css.indexOf('/* ---- audit log ---'),
);

const PATCHES = [
  ['white', '#ffffff'],
  ['black', '#000000'],
  ['card', '#f6f6f8'],
  ['dark-card', '#1b1b1f'],
  ['accent', '#4c8dff'],
  ['ink-match', '#030303'],
];

const lines = ['Rashid Ahmadi', 'rashid@lajward.dev', '۱۴۰۵/۰۶/۱۸ ۰۹:۳۰'];
const tile = `<div class="audit-watermark-tile">${lines.map((l) => `<div>${l}</div>`).join('')}</div>`;
const rows = Array.from({ length: 5 }, () => `<div class="audit-watermark-row">${tile}${tile}</div>`).join('');

const page = (withMark, wrapped) => `<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0;height:100%}
  .bg{position:absolute;inset:0;display:flex;flex-direction:column}
  .bg div{flex:1}
  ${block}
  /* the failure mode the portal exists to avoid */
  .isolated{transform:translateZ(0)}
</style>
<div class="bg">${PATCHES.map(([, c]) => `<div style="background:${c}"></div>`).join('')}</div>
${withMark ? (wrapped ? `<div class="isolated"><div class="audit-watermark">${rows}</div></div>` : `<div class="audit-watermark">${rows}</div>`) : ''}`;

const shot = async (browser, html) => {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(html);
  await p.waitForTimeout(120);
  const buf = await p.screenshot({ type: 'png' });
  await p.close();
  return PNG.sync.read(buf);
};

const compare = (a, b, label) => {
  const h = a.height, w = a.width, band = Math.floor(h / PATCHES.length);
  console.log(`\n== ${label} ==`);
  let worst = 0;
  PATCHES.forEach(([name], i) => {
    let max = 0, shifted = 0, total = 0, sum = 0;
    for (let y = i * band + 4; y < (i + 1) * band - 4; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const d = Math.abs(a.data[o + c] - b.data[o + c]);
          if (d > max) max = d;
          if (d > 0) { shifted++; sum += d; }
          total++;
        }
      }
    }
    worst = Math.max(worst, max);
    const pct = ((shifted / total) * 100).toFixed(1);
    console.log(
      `${name.padEnd(10)} max shift ${String(max).padStart(3)}/255` +
      `  coverage ${pct.padStart(5)}%  mean shift ${(sum / Math.max(shifted, 1)).toFixed(2)}`,
    );
  });
  return worst;
};

const browser = await chromium.launch();
const clean = await shot(browser, page(false, false));
const marked = await shot(browser, page(true, false));
const trapped = await shot(browser, page(true, true));
await browser.close();

const portalMax = compare(clean, marked, 'as shipped (overlay is a child of <body>)');
const trappedMax = compare(clean, trapped, 'if it were trapped in a transformed ancestor');

console.log(`\nworst shift as shipped: ${portalMax}/255 (${((portalMax / 255) * 100).toFixed(1)}%)`);
console.log(`worst shift when trapped: ${trappedMax}/255`);
process.exit(portalMax > 0 && portalMax <= 3 ? 0 : 1);
