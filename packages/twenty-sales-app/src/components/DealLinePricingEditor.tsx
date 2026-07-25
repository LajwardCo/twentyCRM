import {
  type CatalogDiscountRule,
  type CatalogPackage,
  type CatalogPricingVersion,
  SUPPORTED_CURRENCIES,
} from '../api/catalog';
import { type ProductOption } from '../api/records';
import {
  buildFactorQuantities,
  catalogFixedAmounts,
  catalogMetricRate,
  type DealLineDraft,
  effectiveFixedAmounts,
  effectivePricingFactors,
  isCurrencyPricedInCatalog,
  lineCurrencyOptions,
} from '../lib/dealLinePricing';
import { formatMoney } from '../lib/format';
import { estimateProductPrice, hasPriceEstimate } from '../lib/productPricing';
import {
  BILLING_FREQUENCY_LABELS,
  CONDITION_TYPE_LABELS,
  CURRENCY_LABELS,
  T2,
  T4,
} from '../lib/strings';
import { groupProductsByCategory } from '../lib/taxonomy';

// The whole "what are we selling and at what price" form, shared by the lead
// detail pricing card and the new-lead registration page so a seller meets the
// same pricing UI in both places. Fully controlled: the parent owns the draft
// and decides what to do with it on submit.

const CURRENCY_SYMBOLS: Record<string, string> = { AFN: '؋', USD: '$' };

const SECTION_STYLE = {
  background: 'var(--surface-2, rgba(127,127,127,.06))',
  marginBottom: 8,
} as const;

type DealLinePricingEditorProps = {
  draft: DealLineDraft;
  onChange: (patch: Partial<DealLineDraft>) => void;
  products: ProductOption[];
  packages?: CatalogPackage[];
  pricingVersions?: CatalogPricingVersion[];
  discountRules?: CatalogDiscountRule[];
  // The registration form has no package/discount catalog loaded yet -- it
  // sells the product at its own rates and leaves packages to the lead page.
  showPackages?: boolean;
  showDiscountRules?: boolean;
};

// One line describing what a Discount Rule needs to actually apply --
// enforcement is still server-side, this is just so the seller isn't guessing
// why a rule got rejected on submit.
const discountRuleHint = (rule: CatalogDiscountRule): string | null => {
  if (rule.conditionType === 'MIN_QUANTITY' && rule.conditionMinQuantity) {
    return T4.minQuantityHint(rule.conditionMinQuantity);
  }
  if (
    rule.conditionType === 'MIN_METRIC_QUANTITY' &&
    rule.conditionMinQuantity &&
    rule.conditionMetric
  ) {
    return T4.metricQuantityHint(rule.conditionMinQuantity, rule.conditionMetric);
  }
  if (rule.conditionType === 'SIBLING_PRODUCT_PURCHASED' && rule.conditionSiblingProduct) {
    return T4.siblingProductHint(rule.conditionSiblingProduct.name);
  }
  return null;
};

// Metric names this line prices: whatever the package tiers, plus every
// product metric it doesn't tier (those are billed on top at the product's own
// rate). Without a package the product's whole metric table applies.
export const lineMetricNames = (
  product: ProductOption | undefined,
  tierSchedule: { factor: string }[],
): string[] => {
  const productMetrics =
    product?.pricingModel === 'PER_FACTOR'
      ? (product.pricingFactors ?? [])
          .map((metric) => metric.name)
          .filter((name) => !tierSchedule.some((factor) => factor.factor === name))
      : [];

  return [...tierSchedule.map((factor) => factor.factor), ...productMetrics];
};

export const DealLinePricingEditor = ({
  draft,
  onChange,
  products,
  packages = [],
  pricingVersions = [],
  discountRules = [],
  showPackages = true,
  showDiscountRules = true,
}: DealLinePricingEditorProps) => {
  const selectedProduct = products.find((p) => p.id === draft.productId);
  const activePackages = packages.filter((p) => p.status === 'ACTIVE');
  const activeVersion = pricingVersions.find((v) => v.isActive) ?? null;
  const tierSchedule = activeVersion?.tierSchedule ?? [];
  const metricNames = lineMetricNames(selectedProduct, tierSchedule);
  const currencyCode = draft.currencyCode || SUPPORTED_CURRENCIES[0];
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;
  const catalogFixed = catalogFixedAmounts(selectedProduct, currencyCode);
  const fixed = effectiveFixedAmounts(selectedProduct, draft);

  const eligibleRules = discountRules.filter(
    (rule) => rule.appliesToProductId === draft.productId && rule.status === 'ACTIVE',
  );
  const selectedRule = eligibleRules.find((rule) => rule.id === draft.discountRuleId);

  // Estimated client-side only for the package-less path -- with a package the
  // server prices off tier bands this component doesn't evaluate, so showing a
  // product-only number would be wrong rather than merely incomplete.
  const estimate =
    activeVersion === null && draft.productId !== ''
      ? estimateProductPrice({
          pricingFactors: effectivePricingFactors(selectedProduct, draft, metricNames),
          factorQuantities: buildFactorQuantities(draft, metricNames),
          fixedInstall: fixed.install,
          fixedAnnual: fixed.annual,
        })
      : null;

  const setMetric = (
    key: 'metricRates' | 'metricQuantities',
    metricName: string,
    value: string,
  ) => onChange({ [key]: { ...draft[key], [metricName]: value } });

  return (
    <>
      <div className="f2">
        <div className="fld" style={{ marginBottom: 8 }}>
          <label>{T2.productLbl}</label>
          <select
            value={draft.productId}
            onChange={(e) => onChange({ productId: e.target.value })}
          >
            <option value="">انتخاب…</option>
            {groupProductsByCategory(products).map((group) => (
              <optgroup
                key={group.category ?? '__none__'}
                label={group.category ?? T4.noCategory}
              >
                {group.products.map((p: ProductOption) => (
                  <option key={p.id} value={p.id}>
                    {p.brand ? `${p.brand} · ` : ''}
                    {p.name}
                    {p.baseInstallPrice?.amountMicros
                      ? ` — ${formatMoney(p.baseInstallPrice.amountMicros, p.baseInstallPrice.currencyCode)}`
                      : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="fld" style={{ marginBottom: 8 }}>
          <label>{T2.quantityLbl}</label>
          <input
            inputMode="numeric"
            dir="ltr"
            value={draft.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
          />
        </div>
      </div>

      {draft.productId !== '' && (
        <div className="fld" style={{ marginBottom: 8 }}>
          <label>{T4.lineCurrencyLbl}</label>
          <select
            value={currencyCode}
            onChange={(e) => onChange({ currencyCode: e.target.value })}
          >
            {lineCurrencyOptions(selectedProduct).map((code) => (
              <option key={code} value={code}>
                {CURRENCY_LABELS[code] ?? code}
                {isCurrencyPricedInCatalog(selectedProduct, code)
                  ? ''
                  : ` — ${T4.currencyNotInCatalog}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {showPackages && draft.productId !== '' && activePackages.length > 0 && (
        <div className="fld" style={{ marginBottom: 8 }}>
          <label>{T4.packageLbl}</label>
          <select
            value={draft.packageId}
            onChange={(e) => onChange({ packageId: e.target.value })}
          >
            <option value="">{T4.noPackageOption}</option>
            {activePackages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name}
              </option>
            ))}
          </select>
          {draft.packageId !== '' && !activeVersion && (
            <div className="sub" style={{ marginTop: 4 }}>
              {T4.noActiveVersionNote}
            </div>
          )}
        </div>
      )}

      {draft.productId !== '' && (
        <div className="card card-pad" style={SECTION_STYLE}>
          <div className="sub" style={{ marginBottom: 8 }}>
            {T4.lineFixedSection}
          </div>
          <div className="f2">
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>
                {T4.fixedInstallLbl} ({symbol})
              </label>
              <input
                inputMode="decimal"
                dir="ltr"
                placeholder={
                  catalogFixed.install === null
                    ? T4.noCatalogPrice
                    : String(catalogFixed.install)
                }
                value={draft.fixedInstall}
                onChange={(e) => onChange({ fixedInstall: e.target.value })}
              />
            </div>
            <div className="fld" style={{ marginBottom: 0 }}>
              <label>
                {T4.fixedAnnualLbl} ({symbol})
              </label>
              <input
                inputMode="decimal"
                dir="ltr"
                placeholder={
                  catalogFixed.annual === null
                    ? T4.noCatalogPrice
                    : String(catalogFixed.annual)
                }
                value={draft.fixedAnnual}
                onChange={(e) => onChange({ fixedAnnual: e.target.value })}
              />
            </div>
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            {T4.suggestedPriceHint}
          </div>
        </div>
      )}

      {metricNames.length > 0 && (
        <div className="card card-pad" style={SECTION_STYLE}>
          <div className="sub" style={{ marginBottom: 8 }}>
            {T4.lineMetricsSection}
          </div>
          <div className="sub" style={{ marginBottom: 8 }}>
            {T4.metricQuantitiesHint}
          </div>
          {metricNames.map((metricName) => {
            const suggested = catalogMetricRate(selectedProduct, metricName, currencyCode);
            const isTiered = tierSchedule.some((factor) => factor.factor === metricName);

            return (
              <div
                key={metricName}
                style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}
              >
                <div className="fld" style={{ flex: 1, minWidth: 120 }}>
                  <label dir="ltr">
                    {metricName}
                    <span style={{ color: 'var(--ink-3)' }}>
                      {' '}
                      ·{' '}
                      {BILLING_FREQUENCY_LABELS[
                        (selectedProduct?.pricingFactors ?? []).find(
                          (factor) => factor.name === metricName,
                        )?.billingFrequency ?? 'MONTHLY'
                      ] ?? ''}
                    </span>
                  </label>
                  <input
                    inputMode="numeric"
                    dir="ltr"
                    placeholder={T4.metricQuantityPlaceholder}
                    value={draft.metricQuantities[metricName] ?? ''}
                    onChange={(e) =>
                      setMetric('metricQuantities', metricName, e.target.value)
                    }
                  />
                </div>
                <div className="fld" style={{ maxWidth: 140 }}>
                  <label>
                    {T4.metricUnitPriceLbl} ({symbol})
                  </label>
                  <input
                    inputMode="decimal"
                    dir="ltr"
                    placeholder={
                      isTiered
                        ? T4.tieredByPackage
                        : suggested === null
                          ? T4.noCatalogPrice
                          : String(suggested)
                    }
                    value={draft.metricRates[metricName] ?? ''}
                    onChange={(e) => setMetric('metricRates', metricName, e.target.value)}
                  />
                </div>
              </div>
            );
          })}
          <div className="sub" style={{ marginTop: 6 }}>
            {activeVersion === null ? T4.metricRateHint : T4.metricRateOverridesTiersHint}
          </div>
        </div>
      )}

      {estimate !== null && hasPriceEstimate(estimate) && (
        <div className="card card-pad" style={SECTION_STYLE}>
          <div className="sub" style={{ marginBottom: 6 }}>
            {T4.estimateSection}
          </div>
          <div className="contact-rows">
            <div className="c-row">
              <span>{T4.estimateInstallLbl}</span>
              <b className="num">
                {formatMoney(estimate.installTotal * 1_000_000, currencyCode)}
              </b>
            </div>
            {estimate.annualTotal > 0 && (
              <div className="c-row">
                <span>{T4.estimateAnnualLbl}</span>
                <b className="num">
                  {formatMoney(estimate.annualTotal * 1_000_000, currencyCode)}
                </b>
              </div>
            )}
          </div>
          <div className="sub" style={{ marginTop: 6 }}>
            {[
              estimate.fixedInstall > 0 &&
                `${T4.estimateFixedPart} ${formatMoney(estimate.fixedInstall * 1_000_000, currencyCode)}`,
              estimate.monthly > 0 &&
                `${T4.estimateMonthlyPart} ${formatMoney(estimate.monthly * 1_000_000, currencyCode)}`,
              estimate.hourly > 0 &&
                `${T4.estimateHourlyPart} ${formatMoney(estimate.hourly * 1_000_000, currencyCode)}`,
              estimate.annualTotal > 0 &&
                `${T4.estimateAnnualPart} ${formatMoney(estimate.annualTotal * 1_000_000, currencyCode)}`,
            ]
              .filter(Boolean)
              .join(' + ')}
          </div>
          <div className="sub" style={{ marginTop: 4 }}>
            {T4.estimateNote}
          </div>
        </div>
      )}

      {showDiscountRules && draft.productId !== '' && eligibleRules.length > 0 && (
        <div className="fld" style={{ marginBottom: 8 }}>
          <label>{T4.discountRuleLbl}</label>
          <select
            value={draft.discountRuleId}
            onChange={(e) => onChange({ discountRuleId: e.target.value })}
          >
            <option value="">{T4.noDiscountOption}</option>
            {eligibleRules.map((rule) => (
              <option key={rule.id} value={rule.id}>
                {rule.name} (
                {CONDITION_TYPE_LABELS[rule.conditionType ?? ''] ?? rule.conditionType})
              </option>
            ))}
          </select>
          {selectedRule && discountRuleHint(selectedRule) && (
            <div className="sub" style={{ marginTop: 4 }}>
              {discountRuleHint(selectedRule)}
            </div>
          )}
        </div>
      )}
    </>
  );
};
