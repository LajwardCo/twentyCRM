import { type LeadSummary } from '../../api/records';
import {
  type ReportDealProduct,
  type ReportLeadReferrer,
} from '../../api/reportsData';
import {
  addCurrencyTotals,
  type CurrencyTotals,
  personName,
} from '../format';
import { STAGE_LABELS } from '../strings';
import {
  amountCell,
  averageNumber,
  countKpi,
  countWhere,
  dateCell,
  daysCell,
  kpi,
  moneyCell,
  moneyKpi,
  numberCell,
  percentCell,
  percentKpi,
  sumMoney,
  sumNumber,
  textCell,
  topLabel,
} from './engine';
import { DAY_MS, isWon, withinPeriod } from './shared';
import { RT } from './strings';
import { type ReportDefinition } from './types';

// Revenue reports read the rows that carry money: deal lines, subscriptions,
// offers and commission credit. Three of the four depend on objects that only
// exist once a provisioning script has run, so each declares `requires` and the
// runner says so rather than showing an empty table.

const SUBSCRIPTION_STATUS: Record<string, string> = {
  ACTIVE: RT.subActive,
  PENDING: RT.subPending,
  EXPIRED: RT.subExpired,
  CANCELLED: RT.subCancelled,
};

const BILLING_PERIOD: Record<string, string> = {
  MONTHLY: RT.billingMonthly,
  ANNUAL: RT.billingAnnual,
};

const OFFER_STATUS: Record<string, string> = {
  PROPOSED: RT.offerProposed,
  ACCEPTED: RT.offerAccepted,
  REJECTED: RT.offerRejected,
  SUPERSEDED: RT.offerSuperseded,
};

const REFERRER_ROLE: Record<string, string> = {
  FINDER: RT.roleFinder,
  INTRODUCER: RT.roleIntroducer,
  CLOSER: RT.roleCloser,
  OTHER: RT.roleOther,
};

const lineTotals = (line: ReportDealProduct): CurrencyTotals => {
  const totals: CurrencyTotals = {};
  addCurrencyTotals(
    totals,
    line.installPrice?.amountMicros,
    line.installPrice?.currencyCode,
  );
  addCurrencyTotals(
    totals,
    line.annualPrice?.amountMicros,
    line.annualPrice?.currencyCode,
  );
  return totals;
};

const productName = (line: ReportDealProduct): string =>
  line.product?.name ?? line.name ?? RT.noValue;

const productRevenueReport: ReportDefinition = {
  id: 'product-revenue',
  title: RT.rProductTitle,
  description: RT.rProductDesc,
  category: 'revenue',
  needs: ['dealProducts'],
  requires: 'dealProduct',
  defaultSort: { key: 'lineTotal', dir: 'desc' },
  groupBy: ['product', 'owner', 'stage'],
  chart: { groupBy: 'product', value: 'lineTotal' },
  columns: [
    { key: 'product', label: RT.colProduct, kind: 'text', filter: 'enum' },
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'owner', label: RT.colOwner, kind: 'text', filter: 'enum' },
    { key: 'stage', label: RT.colStage, kind: 'text', filter: 'enum' },
    { key: 'quantity', label: RT.colQuantity, kind: 'number', filter: 'range' },
    { key: 'install', label: RT.colInstall, kind: 'money' },
    { key: 'annual', label: RT.colAnnual, kind: 'money' },
    { key: 'lineTotal', label: RT.colLineTotal, kind: 'money', filter: 'range' },
    { key: 'discount', label: RT.colDiscount, kind: 'percent', filter: 'range' },
    { key: 'created', label: RT.colDate, kind: 'date', filter: 'dateRange' },
  ],
  build: (data) =>
    data.dealProducts.map((line) => ({
      id: line.id,
      href: line.opportunity ? `/lead/${line.opportunity.id}` : undefined,
      cells: {
        product: textCell(productName(line)),
        lead: textCell(line.opportunity?.name ?? null),
        owner: textCell(
          line.opportunity?.owner ? personName(line.opportunity.owner) : null,
        ),
        stage: textCell(
          line.opportunity?.stage
            ? (STAGE_LABELS[line.opportunity.stage] ?? line.opportunity.stage)
            : null,
        ),
        quantity: numberCell(line.quantity ?? null),
        install: amountCell(
          line.installPrice?.amountMicros,
          line.installPrice?.currencyCode,
        ),
        annual: amountCell(
          line.annualPrice?.amountMicros,
          line.annualPrice?.currencyCode,
        ),
        lineTotal: moneyCell(lineTotals(line)),
        discount: percentCell(line.discountPercent ?? null),
        created: dateCell(line.createdAt),
      },
    })),
  kpis: (rows) => [
    countKpi(RT.kLines, rows.length),
    countKpi(RT.kUnits, sumNumber(rows, 'quantity')),
    moneyKpi(RT.kInstallRevenue, sumMoney(rows, 'install')),
    moneyKpi(RT.kAnnualRevenue, sumMoney(rows, 'annual')),
    percentKpi(RT.kAvgDiscount, averageNumber(rows, 'discount')),
  ],
};

const discountReport: ReportDefinition = {
  id: 'discount-analysis',
  title: RT.rDiscountTitle,
  description: RT.rDiscountDesc,
  category: 'revenue',
  needs: ['dealProducts'],
  requires: 'dealProduct',
  defaultSort: { key: 'avgDiscount', dir: 'desc' },
  chart: { groupBy: 'product', count: 'lines', value: 'revenue' },
  columns: [
    { key: 'product', label: RT.colProduct, kind: 'text', filter: 'enum' },
    { key: 'lines', label: RT.colLines, kind: 'number', filter: 'range' },
    { key: 'units', label: RT.colUnits, kind: 'number' },
    { key: 'avgDiscount', label: RT.colAvgDiscount, kind: 'percent', filter: 'range' },
    { key: 'maxDiscount', label: RT.colMaxDiscount, kind: 'percent' },
    { key: 'discounted', label: RT.colDiscountedLines, kind: 'number' },
    { key: 'revenue', label: RT.colLineTotal, kind: 'money' },
  ],
  build: (data) => {
    const groups = new Map<string, ReportDealProduct[]>();
    for (const line of data.dealProducts) {
      const key = productName(line);
      groups.set(key, [...(groups.get(key) ?? []), line]);
    }

    return [...groups.entries()].map(([product, lines]) => {
      // A line with no discount recorded is not a 0% discount: averaging the
      // absent ones in would understate every real concession.
      const discounts = lines
        .map((line) => line.discountPercent)
        .filter((percent): percent is number => percent !== null && percent !== undefined);
      const revenue: CurrencyTotals = {};
      for (const line of lines) {
        for (const [code, micros] of Object.entries(lineTotals(line))) {
          addCurrencyTotals(revenue, micros, code);
        }
      }
      return {
        id: product,
        cells: {
          product: textCell(product),
          lines: numberCell(lines.length),
          units: numberCell(
            lines.reduce((sum, line) => sum + (line.quantity ?? 0), 0),
          ),
          avgDiscount: percentCell(
            discounts.length > 0
              ? discounts.reduce((sum, d) => sum + d, 0) / discounts.length
              : null,
          ),
          maxDiscount: percentCell(
            discounts.length > 0 ? Math.max(...discounts) : null,
          ),
          discounted: numberCell(discounts.filter((d) => d > 0).length),
          revenue: moneyCell(revenue),
        },
      };
    });
  },
  kpis: (rows) => {
    const lines = sumNumber(rows, 'lines');
    const discounted = sumNumber(rows, 'discounted');
    return [
      countKpi(RT.kLines, lines),
      percentKpi(RT.kAvgDiscount, averageNumber(rows, 'avgDiscount')),
      percentKpi(
        RT.kDiscountedShare,
        lines > 0 ? (discounted / lines) * 100 : null,
      ),
      moneyKpi(RT.kAnnualRevenue, sumMoney(rows, 'revenue')),
    ];
  },
};

type Credit = {
  partner: string;
  partnerType: string | null;
  percent: number | null;
  lead: LeadSummary;
};

// Commission credit comes from two places: the lead's primary referrer, and
// the leadReferrer join rows that add further partners to the same deal. A
// partner named by both is counted once, with the join row's negotiated rate
// winning over the partner's default.
const collectCredits = (
  leads: LeadSummary[],
  joins: ReportLeadReferrer[],
): Credit[] => {
  const byLead = new Map(leads.map((lead) => [lead.id, lead]));
  const seen = new Set<string>();
  const credits: Credit[] = [];

  for (const join of joins) {
    const lead = join.opportunity ? byLead.get(join.opportunity.id) : undefined;
    if (!lead || !join.partner) continue;
    const key = `${join.partner.name}::${lead.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({
      partner: join.partner.name,
      partnerType: join.referrerRole
        ? (REFERRER_ROLE[join.referrerRole] ?? join.referrerRole)
        : join.partner.partnerType,
      percent: join.commissionPercent ?? null,
      lead,
    });
  }

  for (const lead of leads) {
    if (!lead.referrer) continue;
    const key = `${lead.referrer.name}::${lead.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    credits.push({
      partner: lead.referrer.name,
      partnerType: RT.primaryReferrer,
      percent: lead.referrer.commissionPercent ?? null,
      lead,
    });
  }

  return credits;
};

const commissionReport: ReportDefinition = {
  id: 'referrer-commission',
  title: RT.rCommissionTitle,
  description: RT.rCommissionDesc,
  category: 'revenue',
  needs: ['leads', 'leadReferrers'],
  defaultSort: { key: 'commissionDue', dir: 'desc' },
  chart: { groupBy: 'partner', count: 'leads', value: 'commissionDue' },
  columns: [
    { key: 'partner', label: RT.colPartner, kind: 'text', filter: 'enum' },
    { key: 'partnerType', label: RT.colPartnerType, kind: 'text', filter: 'enum' },
    { key: 'leads', label: RT.colLeads, kind: 'number', filter: 'range' },
    { key: 'won', label: RT.colWon, kind: 'number', filter: 'range' },
    { key: 'winRate', label: RT.colWinRate, kind: 'percent' },
    { key: 'wonValue', label: RT.colWonValue, kind: 'money' },
    { key: 'rate', label: RT.colCommissionRate, kind: 'percent' },
    { key: 'commissionDue', label: RT.colCommissionDue, kind: 'money' },
  ],
  build: (data, ctx) => {
    const credits = collectCredits(data.leads, data.leadReferrers).filter(
      (credit) => withinPeriod(credit.lead.createdAt, ctx),
    );

    const groups = new Map<string, Credit[]>();
    for (const credit of credits) {
      groups.set(credit.partner, [...(groups.get(credit.partner) ?? []), credit]);
    }

    return [...groups.entries()].map(([partner, list]) => {
      const won = list.filter((credit) => isWon(credit.lead));
      const wonValue: CurrencyTotals = {};
      const commission: CurrencyTotals = {};
      for (const credit of won) {
        const micros = credit.lead.amount?.amountMicros ?? null;
        const code = credit.lead.amount?.currencyCode;
        addCurrencyTotals(wonValue, micros, code);
        if (micros && credit.percent) {
          addCurrencyTotals(commission, (micros * credit.percent) / 100, code);
        }
      }
      const rates = list
        .map((credit) => credit.percent)
        .filter((percent): percent is number => percent !== null);

      return {
        id: partner,
        cells: {
          partner: textCell(partner),
          partnerType: textCell(list[0]?.partnerType ?? null),
          leads: numberCell(list.length),
          won: numberCell(won.length),
          winRate: percentCell(
            list.length > 0 ? (won.length / list.length) * 100 : null,
          ),
          wonValue: moneyCell(wonValue),
          rate: percentCell(
            rates.length > 0
              ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length
              : null,
          ),
          commissionDue: moneyCell(commission),
        },
      };
    });
  },
  kpis: (rows) => [
    countKpi(RT.kPartners, rows.length),
    countKpi(RT.kRegistered, sumNumber(rows, 'leads')),
    countKpi(RT.kTeamWon, sumNumber(rows, 'won')),
    moneyKpi(RT.kWonValue, sumMoney(rows, 'wonValue')),
    moneyKpi(RT.kCommissionDue, sumMoney(rows, 'commissionDue'), { tone: 'warn' }),
  ],
};

const subscriptionReport: ReportDefinition = {
  id: 'subscriptions',
  title: RT.rSubscriptionTitle,
  description: RT.rSubscriptionDesc,
  category: 'revenue',
  needs: ['subscriptions'],
  requires: 'subscription',
  defaultSort: { key: 'annualized', dir: 'desc' },
  groupBy: ['status', 'product', 'billingPeriod'],
  chart: { groupBy: 'status', value: 'annualized' },
  columns: [
    { key: 'customer', label: RT.colCustomer, kind: 'text', filter: 'text' },
    { key: 'product', label: RT.colProduct, kind: 'text', filter: 'enum' },
    { key: 'status', label: RT.colStatus, kind: 'text', filter: 'enum' },
    { key: 'billingPeriod', label: RT.colBillingPeriod, kind: 'text', filter: 'enum' },
    { key: 'recurring', label: RT.colRecurring, kind: 'money', filter: 'range' },
    { key: 'annualized', label: RT.colAnnualized, kind: 'money' },
    { key: 'start', label: RT.colStart, kind: 'date', filter: 'dateRange' },
    { key: 'end', label: RT.colEnd, kind: 'date', filter: 'dateRange' },
    { key: 'daysToRenewal', label: RT.colDaysToRenewal, kind: 'days', filter: 'range' },
    { key: 'autoRenew', label: RT.colAutoRenew, kind: 'text', filter: 'enum' },
  ],
  build: (data, ctx) =>
    data.subscriptions.map((subscription) => {
      const micros = subscription.recurringAmount?.amountMicros ?? null;
      const code = subscription.recurringAmount?.currencyCode;
      // Annualised so a monthly and an annual plan can sit in the same column
      // without one of them looking twelve times smaller than it is.
      const multiplier = subscription.billingPeriod === 'MONTHLY' ? 12 : 1;
      const annualized: CurrencyTotals = {};
      if (micros) addCurrencyTotals(annualized, micros * multiplier, code);

      const end = subscription.endDate;
      const daysToRenewal = end
        ? Math.round((new Date(end).getTime() - ctx.now.getTime()) / DAY_MS)
        : null;

      return {
        id: subscription.id,
        cells: {
          customer: textCell(subscription.company?.name ?? null),
          product: textCell(subscription.product?.name ?? null),
          status: textCell(
            subscription.subscriptionStatus
              ? (SUBSCRIPTION_STATUS[subscription.subscriptionStatus] ??
                subscription.subscriptionStatus)
              : null,
            { tone: subscription.subscriptionStatus === 'ACTIVE' ? 'good' : undefined },
          ),
          billingPeriod: textCell(
            subscription.billingPeriod
              ? (BILLING_PERIOD[subscription.billingPeriod] ??
                subscription.billingPeriod)
              : null,
          ),
          recurring: amountCell(micros, code),
          annualized: moneyCell(annualized),
          start: dateCell(subscription.startDate),
          end: dateCell(subscription.endDate),
          daysToRenewal: daysCell(daysToRenewal, {
            tone:
              daysToRenewal !== null && daysToRenewal <= 30 ? 'warn' : undefined,
          }),
          autoRenew: textCell(subscription.autoRenew ? RT.yes : RT.no),
        },
      };
    }),
  kpis: (rows) => {
    const active = rows.filter((row) => row.cells.status?.value === RT.subActive);
    return [
      countKpi(RT.kActiveSubs, active.length, { tone: 'good' }),
      moneyKpi(RT.kAnnualized, sumMoney(active, 'annualized')),
      moneyKpi(RT.colRecurring, sumMoney(active, 'recurring')),
      countKpi(
        RT.kRenewals60,
        countWhere(rows, (row) => {
          const days = row.cells.daysToRenewal?.value;
          return typeof days === 'number' && days >= 0 && days <= 60;
        }),
        { tone: 'warn' },
      ),
    ];
  },
};

const offerReport: ReportDefinition = {
  id: 'offers',
  title: RT.rOfferTitle,
  description: RT.rOfferDesc,
  category: 'revenue',
  needs: ['offers'],
  requires: 'leadOffer',
  defaultSort: { key: 'offeredAt', dir: 'desc' },
  groupBy: ['status', 'offeredBy'],
  chart: { groupBy: 'status', value: 'amount' },
  columns: [
    { key: 'lead', label: RT.colLead, kind: 'text', filter: 'text' },
    { key: 'amount', label: RT.colAmount, kind: 'money', filter: 'range' },
    { key: 'status', label: RT.colStatus, kind: 'text', filter: 'enum' },
    { key: 'offeredBy', label: RT.colOfferedBy, kind: 'text', filter: 'enum' },
    { key: 'offeredAt', label: RT.colOfferedAt, kind: 'date', filter: 'dateRange' },
  ],
  build: (data) =>
    data.offers.map((offer) => ({
      id: offer.id,
      href: offer.opportunity ? `/lead/${offer.opportunity.id}` : undefined,
      cells: {
        lead: textCell(offer.opportunity?.name ?? null),
        amount: amountCell(offer.amount?.amountMicros, offer.amount?.currencyCode),
        status: textCell(
          offer.offerStatus
            ? (OFFER_STATUS[offer.offerStatus] ?? offer.offerStatus)
            : null,
          {
            tone:
              offer.offerStatus === 'ACCEPTED'
                ? 'good'
                : offer.offerStatus === 'REJECTED'
                  ? 'bad'
                  : undefined,
          },
        ),
        offeredBy: textCell(
          offer.offeredBy ? personName(offer.offeredBy) : null,
        ),
        offeredAt: dateCell(offer.offeredAt ?? offer.createdAt),
      },
    })),
  kpis: (rows) => {
    const accepted = rows.filter(
      (row) => row.cells.status?.value === RT.offerAccepted,
    );
    const decided = rows.filter(
      (row) =>
        row.cells.status?.value === RT.offerAccepted ||
        row.cells.status?.value === RT.offerRejected,
    );
    return [
      countKpi(RT.kOffers, rows.length),
      countKpi(RT.kAccepted, accepted.length, { tone: 'good' }),
      percentKpi(
        RT.kAcceptRate,
        decided.length > 0 ? (accepted.length / decided.length) * 100 : null,
      ),
      moneyKpi(RT.kWonValue, sumMoney(accepted, 'amount')),
      kpi(RT.kTopType, topLabel(rows, 'offeredBy')),
    ];
  },
};

export const REVENUE_REPORTS: ReportDefinition[] = [
  productRevenueReport,
  discountReport,
  commissionReport,
  subscriptionReport,
  offerReport,
];
