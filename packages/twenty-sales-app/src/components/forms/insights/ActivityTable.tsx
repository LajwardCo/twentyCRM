import { type ActivityRow } from '../../../lib/forms/insights';
import { TINS } from '../../../lib/forms/insightStrings';
import { toPersianDigits } from '../../../lib/jalali';

// Completed / partial / total per group (campaign, collector, place…).
export const ActivityTable = ({
  title,
  rows,
  nullLabel,
}: {
  title: string;
  rows: ActivityRow[];
  nullLabel: string;
}) => (
  <section className="card card-pad svk-activity">
    <h3>{title}</h3>
    {rows.length === 0 ? (
      <div className="svk-muted-note">—</div>
    ) : (
      <div className="svk-table-scroll">
        <table className="svk-table">
          <thead>
            <tr>
              <th scope="col">{TINS.name}</th>
              <th scope="col">{TINS.completed}</th>
              <th scope="col">{TINS.partial}</th>
              <th scope="col">{TINS.total}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key ?? '__null'}>
                <td dir="auto" className={row.key === null ? 'svk-muted' : undefined}>
                  {row.label ?? nullLabel}
                </td>
                <td className="num">{toPersianDigits(row.completed)}</td>
                <td className="num">{toPersianDigits(row.partial)}</td>
                <td className="num">
                  <b>{toPersianDigits(row.total)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </section>
);

// Simple two-column count table (visits per employee and similar).
export const CountTable = ({
  title,
  rows,
  nullLabel,
}: {
  title: string;
  rows: { key: string | null; label: string | null; count: number }[];
  nullLabel: string;
}) => (
  <section className="card card-pad svk-activity">
    <h3>{title}</h3>
    {rows.length === 0 ? (
      <div className="svk-muted-note">—</div>
    ) : (
      <table className="svk-table">
        <thead>
          <tr>
            <th scope="col">{TINS.name}</th>
            <th scope="col">{TINS.count}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key ?? '__null'}>
              <td dir="auto" className={row.key === null ? 'svk-muted' : undefined}>
                {row.label ?? nullLabel}
              </td>
              <td className="num">
                <b>{toPersianDigits(row.count)}</b>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </section>
);
