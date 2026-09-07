import { ACTIVITY_REPORTS } from './activityReports';
import { PERFORMANCE_REPORTS } from './performanceReports';
import { PIPELINE_REPORTS } from './pipelineReports';
import { REVENUE_REPORTS } from './revenueReports';
import { RT } from './strings';
import { type ReportCategory, type ReportDefinition } from './types';

export * from './types';
export { RT } from './strings';

// The catalog. Order here is the order of the library page and of the sidebar
// sub-menu, so it reads as a table of contents rather than a bag of screens.
export const REPORTS: readonly ReportDefinition[] = [
  ...PIPELINE_REPORTS,
  ...PERFORMANCE_REPORTS,
  ...REVENUE_REPORTS,
  ...ACTIVITY_REPORTS,
];

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  pipeline: RT.catPipeline,
  performance: RT.catPerformance,
  revenue: RT.catRevenue,
  activity: RT.catActivity,
};

export const CATEGORY_ORDER: ReportCategory[] = [
  'pipeline',
  'performance',
  'revenue',
  'activity',
];

export const findReport = (id: string): ReportDefinition | undefined =>
  REPORTS.find((report) => report.id === id);

export const reportsByCategory = (): {
  category: ReportCategory;
  label: string;
  reports: ReportDefinition[];
}[] =>
  CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    reports: REPORTS.filter((report) => report.category === category),
  })).filter((group) => group.reports.length > 0);

// Matches a report on title, description or category, so the library's search
// box finds "کمیسیون" as readily as "درآمد".
export const searchReports = (query: string): readonly ReportDefinition[] => {
  const needle = query.trim().replace(/ي/g, 'ی').replace(/ك/g, 'ک');
  if (needle === '') return REPORTS;
  return REPORTS.filter((report) =>
    [report.title, report.description, CATEGORY_LABELS[report.category], report.id]
      .join(' ')
      .replace(/ي/g, 'ی')
      .replace(/ك/g, 'ک')
      .includes(needle),
  );
};

// The Reports sub-menu rendered in the desktop sidebar. The dashboard leads,
// then the catalog in category order.
export const reportNavItems = (): { route: string; label: string }[] => [
  { route: '/reports', label: RT.library },
  { route: '/reports/dashboard', label: RT.dashboard },
  ...REPORTS.map((report) => ({
    route: `/reports/${report.id}`,
    label: report.title,
  })),
];
