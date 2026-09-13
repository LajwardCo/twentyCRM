# Sales order history, PDF download, line details — design

Date: 2026-09-13. Scope: the Sales UI (`packages/twenty-sales-app`), its
server proxy (`packages/twenty-server/src/modules/sales-crm/usystems`), the
provisioning script `tools/sales-crm/provision-usystems-link.mjs`, and — in
the separate `usystems_backend` repo — the sales-order line model, dev API,
print context and default template.

## Problems

1. The Deal card's "سفارش فروش" tab shows only the most recently issued
   order; re-issuing overwrites it. Sellers want a list of every order issued
   for the lead, each with a one-click PDF download.
2. Dates in the printed order render as `۲۰ ۱۴۰۵ میزان` (day and year
   adjacent). The Template Studio body wraps dates as
   `{{ltr (jalali document.date)}}`; Usystems' own `jalali` helper emits the
   numeric `1405/07/20`, so `ltr` is harmless there, but the Sales UI's port
   emits `۲۰ میزان ۱۴۰۵`, and forcing that into an LTR span splits it.
3. Each order line carries only the product name. Core's
   `SalesOrderItem.description` is a single 255-character line and the print
   context exposes only `name`/`code`, so the deal line's substance — metric
   quantities and rates, install vs annual, package, discount — never reaches
   the document.

## 1. Order history + download

### Storage

One new field, provisioned by `provision-usystems-link.mjs`:

- `opportunity.usystemsSalesOrders` — RAW_JSON, an array ordered oldest →
  newest of
  ```json
  { "id": "118", "code": "SO-2026-000118", "documentDate": "2026-09-10",
    "validUntil": "2026-10-10", "total": "55000", "currencyCode": "AFN",
    "issuedAt": "2026-09-10T09:15:00Z" }
  ```
  `id` is a string for the same reason the existing id field is TEXT.

The three existing fields (`usystemsSalesOrderCode`, `usystemsSalesOrderId`,
`usystemsSalesOrderValidUntil`) stay and keep meaning "the latest order":
CRM table views and reports read them. Issuing an order writes all four in
one `updateOpportunity`.

Alternatives rejected: a `salesOrderIssue` object (seven fields to provision
and a second query for a list that is rarely longer than three); listing from
Core by contact (no dev-API list endpoint, and Core orders belong to a
contact, not a lead).

### Reading

`fetchLeadUsystemsLink` requests the array alongside the three latest fields.
When the instance has not provisioned it (`Cannot query field
"usystemsSalesOrders"`), the query is retried without it — the same
missing-field-group pattern `fetchProducts` uses — and the UI falls back to
today's single-order behaviour.

`orderHistory(link)` (pure, tested) returns the rows to display, newest
first. When the array is empty or absent but the latest fields are set — a
lead issued an order before this change — it synthesises one row from them
so nothing disappears. When the array's last entry disagrees with the latest
fields (a write that half-failed), the latest fields win for that entry.

### UI

The tab body becomes a list of rows, newest first. Each row: order code
(`.num`), order date, valid-until with the existing `due over|later` pill
(`منقضی شده` / `معتبر تا`), total with currency, and two actions:
**دانلود PDF** and **چاپ**. The hint, notice/error banners, the empty state
and the "صدور سفارش فروش / صدور سفارش جدید" button are unchanged. The Deal
card's summary strip and tab badge keep showing the latest order.

Dates rendered in the list are wrapped in `<bdi>` so a surrounding LTR
context can never split them.

### Download

`downloadSalesOrderPdf(doc, rendered)` in `lib/salesOrderDocument.ts`:

1. Builds the same printable HTML the print window uses, minus the CDN font
   link (the app already ships Vazirmatn locally).
2. Mounts it in an off-screen container in the app document at the
   template's page width, waits for `document.fonts.ready`.
3. Hands the container to `html2pdf.js` with the page size/orientation from
   the template's page settings, `pagebreak: { mode: ['css', 'legacy'] }`,
   `html2canvas: { scale: 2, useCORS: true }`, filename `<order code>.pdf`.
4. Removes the container.

`html2pdf.js` is imported dynamically so it lands in its own chunk; the main
bundle does not grow. It is the library Usystems' own print agent uses, so
the two apps produce the same kind of file. Output is rasterised text; the
**چاپ** button (vector, via the browser's print dialog) stays for anyone who
needs selectable text.

The row's Download button shows `در حال آماده‌سازی…` while working;
failures surface in the tab's existing error banner (`T18.printFailed`).

## 2. Date direction

`ltr` helper in `lib/templateHandlebars.ts`: when the value contains a
strong right-to-left letter (`\p{Script=Arabic}` or `\p{Script=Hebrew}`,
digits excluded), emit `<span dir="rtl">…</span>`; otherwise `<span
dir="ltr">…</span>` as today. Codes, amounts and phones keep LTR; a Jalali
date with a month name stays whole. The `dir` attribute already isolates in
every browser this runs in, so no extra `unicode-bidi` is needed.

Test: render the fixture and assert the date cells contain
`dir="rtl"` around the Jalali date and `dir="ltr"` around the number and
phone.

## 3. Line details

### Core (`usystems_backend`, branch `feature/sales-order-line-details-<date>`)

- `SalesOrderItem.details` — `TextField(blank=True, default="")`, with
  migration. Free text, newline-separated, for what the line is made of.
- `SalesOrderItemSerializer.Meta.fields` gains `details`; it is writable
  and optional.
- Dev API `create_sales_order`: `details` on an item passes through the
  serializer unchanged (no special handling needed beyond the field being
  in `fields`); a test in `devapi/tests_sales_crm.py` issues a free-text
  line with `details` and reads it back from the print document.
- `sales_order/services/print_context.py::_line_blocks` adds
  `"details": _text(getattr(line, "details", ""))`.
- Default `sales_order` template (`print_templates/catalog_data.py`,
  `_SALES_ORDER_HTML`): inside the item `<td>`, after the code line:
  `{{#if this.details}}<div style="font-size:10px;color:#5b6b7b;white-space:pre-line;margin-top:2px;">{{this.details}}</div>{{/if}}`.
  `DEFAULT_BODY_VERSION` increments so locked system defaults re-sync on
  the next seeding pass (templates collection GET, print dialog, or the dev
  API's print-document call when no template exists). A tenant that
  unlocked and customised its template keeps its body and adds
  `{{this.details}}` in Template Studio.
- The Core frontend's sales-order screens are unchanged; `details` is
  available in the serializer for a later display.

### twenty-server proxy

`SalesOrderLineInput` (controller body) and `UsystemsSalesOrderLine` gain
`details?: string`; the controller maps `line.details` → `details`.

### Sales UI

- `api/usystems.ts`: `SalesOrderLineInput.details?: string`.
- `lib/salesOrderLineDetails.ts` — `describeDealLine(line, product): string[]`,
  pure and tested. Produces, in order, only the parts that apply:
  1. Package / pricing version: `بسته: <packageName> (نسخه ۳)` from
     `priceSnapshot`.
  2. Fixed amounts: `نصب: <formatMoney>` when `installPrice` is set and the
     product is not purely metric; `سالانه: <formatMoney>` when `annualPrice`
     is set.
  3. Metrics, one line each: `<metric label> × <qty> @ <rate> = <subtotal>
     (<per period>)`. Source in priority order: `priceSnapshot.breakdown`
     (quantity, `matchedBand.amount`, `subtotal`, `billingFrequency`); else
     `factorQuantities` with the rate from `priceOverrides.factorRates`,
     else the product's `pricingFactors[].unitPrice`. A metric's name is
     the free text the catalog admin typed (e.g. `کاربر`), so it prints
     as-is; the period label comes from `BILLING_FREQUENCY_LABELS`.
  4. Discount: `تخفیف: <n>٪` from `discountPercent` when > 0.
  Joined with `\n` when sent.
- `api/records.ts`: `fetchLeadPricing` also requests `factorQuantities`,
  `priceOverrides`, `priceSnapshot` on deal lines as one optional field
  group (dropped together on a `Cannot query field` error, same pattern as
  `fetchProducts`). `DealProductLine` gains the three optional members.
- `lib/salesOrderDraft.ts`: `DraftLine.details: string`;
  `draftLinesFromDeal(lines, productsById)` fills it from
  `describeDealLine`; `validDraftLines` sends `details` when non-empty
  (trimmed).
- `IssueSalesOrderModal`: under each line's grid row, a one-row
  auto-growing `<textarea aria-label="جزئیات">` bound to `line.details`.
  `emptyLine()` starts with `''`. The modal receives `products` (the
  catalog options the products tab already caches under `catalog:products`)
  to resolve metric rates and labels.

## Not in scope

- Deleting or voiding an order from the CRM (Core is the record of truth).
- Showing `details` in the Core frontend's sales-order screens.
- Server-side PDF rendering.

## Testing

- Sales UI (vitest): `orderHistory`, `describeDealLine`,
  `draftLinesFromDeal` with details, the `ltr` helper, `buildPrintableHtml`
  without the font link, and `validDraftLines` carrying `details`.
- twenty-server (jest): controller/service spec asserts `details` reaches
  the Core payload.
- Core (Django, `USE_SQLITE=true`): dev-API round trip of `details`; print
  context includes it; default template renders it.
- Browser: the Deal card tab lists two orders after two issues, Download
  produces a `.pdf` named by code, the date band reads `۲۰ میزان ۱۴۰۵`.

## Delivery

- `twentyCRM`: branch `feat/sales-order-history-download` from
  `origin/main` (local `main` is behind and carries another agent's WIP),
  one PR. After merge, Rashid runs `provision-usystems-link.mjs` against
  prod (it is idempotent; the one new field is added, the rest skip).
- `usystems_backend`: one PR to `development`; the migration ships with the
  normal deploy. Until it lands, Core ignores the `details` key (DRF drops
  unknown keys), so the CRM side can deploy first without breaking issuing.
