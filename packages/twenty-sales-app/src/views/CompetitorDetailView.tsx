import { useMemo, useRef } from 'react';

import {
  fetchCompetitorById,
  fetchCompetitorProducts,
  fetchCompetitorUpdates,
  fetchCompetitorUsages,
} from '../api/competitors';
import { ActionBar, type ActionBarItem } from '../components/ActionBar';
import {
  CompetitorOverviewCard,
  type CompetitorOverviewHandle,
} from '../components/competitor/CompetitorOverviewCard';
import {
  CompetitorProductsSection,
  type CompetitorSectionHandle,
} from '../components/competitor/CompetitorProductsSection';
import { CompetitorUpdatesSection } from '../components/competitor/CompetitorUpdatesSection';
import { CompetitorUsageSection } from '../components/competitor/CompetitorUsageSection';
import { IconEdit, IconFlame, IconLeads, IconNote, IconPackage } from '../components/icons';
import { useCached } from '../lib/cache';
import { toPersianDigits } from '../lib/jalali';
import {
  COMPETITOR_STATUS_LABELS,
  COMPETITOR_THREAT_LABELS,
  COMPETITOR_TIER_LABELS,
  T4,
  T5,
} from '../lib/strings';

const threatClass = (t: string | null) =>
  t === 'HIGH' ? 'hot' : t === 'MEDIUM' ? 'warm' : 'cold';

const ViewSkeleton = () => (
  <main className="page">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="skeleton" style={{ height: 56, maxWidth: 420 }} />
      <div className="skeleton" style={{ height: 200 }} />
    </div>
  </main>
);

const Kpi = ({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: 'blue' | 'red' | 'amber' | 'green';
  label: string;
  value: number;
}) => (
  <div className="card kpi">
    <div className="top">
      <div className={`k-ico ${tone}`}>{icon}</div>
      <span className="lbl">{label}</span>
    </div>
    <div className="row">
      <span className="big num">{toPersianDigits(value)}</span>
    </div>
  </div>
);

// Full competitor file: identity and positioning up top, then the three
// nested record sets (products, updates, usage) that make up the research.
export const CompetitorDetailView = ({ competitorId }: { competitorId: string }) => {
  // The mobile action bar drives the forms that live inside the sections.
  const overviewRef = useRef<CompetitorOverviewHandle>(null);
  const productsRef = useRef<CompetitorSectionHandle>(null);
  const updatesRef = useRef<CompetitorSectionHandle>(null);

  const { data: competitor, error: loadError, refresh } = useCached(
    `competitor:${competitorId}`,
    () => fetchCompetitorById(competitorId),
  );
  const {
    data: products,
    error: productsError,
    refresh: refreshProducts,
  } = useCached(`competitor:products:${competitorId}`, () => fetchCompetitorProducts(competitorId));
  const {
    data: updates,
    error: updatesError,
    refresh: refreshUpdates,
  } = useCached(`competitor:updates:${competitorId}`, () => fetchCompetitorUpdates(competitorId));
  const {
    data: usages,
    error: usagesError,
    refresh: refreshUsages,
  } = useCached(`competitor:usages:${competitorId}`, () => fetchCompetitorUsages(competitorId));

  // Per-product roll-ups shown on each product row.
  const updateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of updates ?? []) {
      if (u.productId) counts[u.productId] = (counts[u.productId] ?? 0) + 1;
    }
    return counts;
  }, [updates]);

  const usageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const u of usages ?? []) {
      if (u.productId) counts[u.productId] = (counts[u.productId] ?? 0) + 1;
    }
    return counts;
  }, [usages]);

  // Price range across the products that carry a starting price. Mixed
  // currencies are rare here, so the first priced product sets the unit.
  const priceRange = useMemo(() => {
    const priced = (products ?? []).filter((p) => p.startingPrice?.amountMicros);
    if (priced.length === 0) return null;
    const amounts = priced.map((p) => p.startingPrice?.amountMicros ?? 0);
    return {
      minMicros: Math.min(...amounts),
      maxMicros: Math.max(...amounts),
      currencyCode: priced[0].startingPrice?.currencyCode ?? 'AFN',
    };
  }, [products]);

  const activeUsers = (usages ?? []).filter((u) => u.status === 'CURRENT_USER').length;
  const switchers = (usages ?? []).filter(
    (u) => u.switchingSignal === 'ACTIVELY_LOOKING' || u.switchingSignal === 'COMMITTED',
  ).length;
  const lastUpdateIso = (updates ?? []).find((u) => u.date !== null)?.date ?? null;

  if (competitor === null && loadError === null) return <ViewSkeleton />;
  if (!competitor) {
    return (
      <main className="page">
        <div className="error-banner">{loadError ?? T5.competitorNotFound}</div>
      </main>
    );
  }

  const barActions: ActionBarItem[] = [
    { key: 'edit', label: T4.edit, icon: IconEdit, onClick: () => overviewRef.current?.openEdit() },
    {
      key: 'product',
      label: T5.newCompetitorProduct,
      icon: IconFlame,
      onClick: () => productsRef.current?.openNewDraft(),
    },
    {
      key: 'update',
      label: T5.newCompetitorUpdate,
      icon: IconNote,
      primary: true,
      onClick: () => updatesRef.current?.openNewDraft(),
    },
  ];

  return (
    <main className="page" style={{ maxWidth: 900 }}>
      <div className="lead-hero anim">
        <div className="hero-logo">{competitor.name.charAt(0)}</div>
        <div className="hero-main">
          <h1>{competitor.name}</h1>
          <div className="hero-meta">
            {competitor.threatLevel && (
              <span className={`pill ${threatClass(competitor.threatLevel)}`}>
                {COMPETITOR_THREAT_LABELS[competitor.threatLevel]}
              </span>
            )}
            {competitor.tier && (
              <span className="pill stage">{COMPETITOR_TIER_LABELS[competitor.tier]}</span>
            )}
            {competitor.status && (
              <span className="pill ok">{COMPETITOR_STATUS_LABELS[competitor.status]}</span>
            )}
            {competitor.website?.primaryLinkUrl && (
              <a
                href={competitor.website.primaryLinkUrl}
                target="_blank"
                rel="noreferrer"
                className="lead-chip"
                dir="ltr"
              >
                {competitor.website.primaryLinkUrl.replace(/^https?:\/\//, '')}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="stats anim d1">
        <Kpi icon={<IconPackage size={17} />} tone="blue" label={T5.kpiProducts} value={products?.length ?? 0} />
        <Kpi icon={<IconNote size={17} />} tone="amber" label={T5.kpiUpdates} value={updates?.length ?? 0} />
        <Kpi icon={<IconLeads size={17} />} tone="green" label={T5.kpiUsers} value={activeUsers} />
        <Kpi icon={<IconFlame size={17} />} tone="red" label={T5.kpiSwitching} value={switchers} />
      </div>

      <CompetitorOverviewCard
        ref={overviewRef}
        competitor={competitor}
        priceRange={priceRange}
        lastUpdateIso={lastUpdateIso}
        onSaved={refresh}
      />

      <CompetitorProductsSection
        ref={productsRef}
        competitorId={competitorId}
        products={products}
        error={productsError}
        updateCounts={updateCounts}
        usageCounts={usageCounts}
        onChanged={refreshProducts}
      />

      <CompetitorUpdatesSection
        ref={updatesRef}
        competitorId={competitorId}
        updates={updates}
        error={updatesError}
        products={products}
        onChanged={refreshUpdates}
      />

      <CompetitorUsageSection
        competitorId={competitorId}
        usages={usages}
        error={usagesError}
        products={products}
        onChanged={refreshUsages}
      />

      <ActionBar items={barActions} />
    </main>
  );
};
