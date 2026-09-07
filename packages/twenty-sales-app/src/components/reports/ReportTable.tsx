import { formatCell } from '../../lib/reports/engine';
import { navigate } from '../../lib/router';
import { RT } from '../../lib/reports/strings';
import {
  type CellTone,
  type ReportColumn,
  type ReportRow,
} from '../../lib/reports/types';
import { IconChevronDown } from '../icons';

type ReportTableProps = {
  columns: ReportColumn[];
  rows: ReportRow[];
  sort: { key: string; dir: 'asc' | 'desc' };
  onSort: (key: string) => void;
};

const TONE_CLASS: Record<CellTone, string> = {
  good: 'rpt-good',
  bad: 'rpt-bad',
  warn: 'rpt-warn',
  muted: 'rpt-muted',
};

const NUMERIC = new Set(['number', 'money', 'percent', 'days']);

// One table for every report. Sorting is a column header away, the row opens
// whatever record it describes, and numbers keep the .num class so Persian
// digits stay aligned.
export const ReportTable = ({ columns, rows, sort, onSort }: ReportTableProps) => {
  if (rows.length === 0) {
    return <div className="empty-state">{RT.noRows}</div>;
  }

  return (
    <div className="rpt-table-wrap">
      <table className="leads rpt-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>
                <button
                  type="button"
                  className={`rpt-sort${sort.key === column.key ? ' on' : ''}`}
                  onClick={() => onSort(column.key)}
                >
                  {column.label}
                  {sort.key === column.key && (
                    <span className={`rpt-caret${sort.dir === 'asc' ? ' up' : ''}`}>
                      <IconChevronDown size={12} />
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={row.href ? 'rpt-clickable' : undefined}
              onClick={row.href ? () => navigate(row.href as string) : undefined}
            >
              {columns.map((column) => {
                const cell = row.cells[column.key] ?? { value: null };
                const numeric = NUMERIC.has(column.kind) || column.kind === 'date';
                return (
                  <td
                    key={column.key}
                    className={[
                      numeric ? 'num' : '',
                      cell.tone ? TONE_CLASS[cell.tone] : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {formatCell(column.kind, cell)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
