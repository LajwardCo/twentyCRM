import { type CurrentUser } from '../../api/auth';
import { type DatasetKey, type ReportDataset } from '../../api/reportsData';
import { type CurrencyTotals } from '../format';

// A report is a declaration, not a screen: it says which datasets it needs,
// how to turn them into rows, and what its columns mean. One runner
// (views/ReportRunnerView) renders every report from that declaration, which
// is what makes filtering, sorting, grouping and CSV export work the same way
// on all of them.

export type ReportCategory = 'pipeline' | 'performance' | 'revenue' | 'activity';

// Drives cell formatting, sort comparison, filter control and CSV encoding.
export type ColumnKind =
  | 'text'
  | 'number'
  | 'money'
  | 'percent'
  | 'days'
  | 'date';

export type ReportColumn = {
  key: string;
  label: string;
  kind: ColumnKind;
  // Offer this column in the filter sheet. 'enum' derives its options from the
  // values actually present in the rows, so a filter never lists a choice that
  // would return nothing.
  filter?: 'enum' | 'text' | 'range' | 'dateRange';
  // Group-by aggregation. Defaults per kind: money/number sum, percent/days
  // average, text takes the first value.
  aggregate?: 'sum' | 'avg' | 'max' | 'min' | 'count' | 'none';
};

export type CellTone = 'good' | 'bad' | 'warn' | 'muted';

export type ReportCell = {
  // What sorting, filtering and CSV read. null means "not recorded", which is
  // never the same as zero.
  value: string | number | null;
  // What the table shows. Defaults to `value` formatted by the column kind.
  text?: string;
  // Money that spans currencies: AFN and USD are different quantities, so the
  // amounts are carried apart and only `value` (the largest single bucket) is
  // used for ranking.
  totals?: CurrencyTotals;
  tone?: CellTone;
};

export type ReportRow = {
  id: string;
  // Clicking the row opens this route, e.g. '/lead/<id>'.
  href?: string;
  cells: Record<string, ReportCell>;
};

export type ReportKpi = {
  label: string;
  value: string;
  hint?: string;
  tone?: CellTone;
};

export type ReportScope = 'me' | 'team';

export type ReportContext = {
  user: CurrentUser;
  scope: ReportScope;
  // Start of the selected period; `null` means "all time".
  start: Date | null;
  now: Date;
};

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  category: ReportCategory;
  needs: readonly DatasetKey[];
  columns: ReportColumn[];
  build: (data: ReportDataset, ctx: ReportContext) => ReportRow[];
  // Computed from the rows left after filtering, so the tiles always describe
  // what is on screen.
  kpis?: (rows: ReportRow[], ctx: ReportContext) => ReportKpi[];
  defaultSort: { key: string; dir: 'asc' | 'desc' };
  // Column keys this report can be grouped by, in the order offered.
  groupBy?: string[];
  // Ranked bar breakdown drawn above the table. `count` names the numeric
  // column the bar measures; without it the bar counts rows, which is only
  // right when a row is a record rather than an already-aggregated group.
  chart?: { groupBy: string; value?: string; count?: string };
  // Reports that are team-wide by definition (leaderboards) hide the me/team
  // switch rather than offering a scope that means nothing.
  scoped?: boolean;
  // Shown when one of `needs` is missing on this instance.
  requires?: string;
};
