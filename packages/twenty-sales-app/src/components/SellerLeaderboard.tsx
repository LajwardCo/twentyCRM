import { useMemo } from 'react';

import { fetchDoneTasksSince, type LeadSummary } from '../api/records';
import { useCached } from '../lib/cache';
import {
  type CurrencyTotals,
  formatMoneyTotals,
  sumByCurrency,
} from '../lib/format';
import { toPersianDigits } from '../lib/jalali';
import { T2 } from '../lib/strings';

type SellerLeaderboardProps = {
  leads: LeadSummary[];
  periodStartIso: string;
  // Members that are external marketers/partners. They own the leads they
  // bring, so they must be kept out of a ranking of the sales team.
  externalMemberIds: Set<string>;
};

type SellerRow = {
  sellerId: string;
  name: string;
  registered: number;
  won: number;
  winRate: number;
  pipelineValue: CurrencyTotals;
  tasksDone: number;
};

export const SellerLeaderboard = ({
  leads,
  periodStartIso,
  externalMemberIds,
}: SellerLeaderboardProps) => {
  const { data: doneTasks } = useCached(`seller-leaderboard-tasks:${periodStartIso}`, () =>
    fetchDoneTasksSince(periodStartIso),
  );

  const rows = useMemo<SellerRow[]>(() => {
    const bySeller = new Map<string, { name: string; leads: LeadSummary[] }>();
    for (const lead of leads) {
      if (!lead.owner) continue;
      if (externalMemberIds.has(lead.owner.id)) continue;
      const key = lead.owner.id;
      const entry = bySeller.get(key) ?? {
        name: `${lead.owner.name.firstName} ${lead.owner.name.lastName}`.trim(),
        leads: [],
      };
      entry.leads.push(lead);
      bySeller.set(key, entry);
    }

    const tasksBySeller = new Map<string, number>();
    for (const task of doneTasks ?? []) {
      if (!task.assignee) continue;
      if (externalMemberIds.has(task.assignee.id)) continue;
      tasksBySeller.set(task.assignee.id, (tasksBySeller.get(task.assignee.id) ?? 0) + 1);
    }

    return [...bySeller.entries()]
      .map(([sellerId, entry]) => {
        const won = entry.leads.filter((l) => l.stage === 'ACTIVE_CUSTOMER').length;
        const openLeads = entry.leads.filter(
          (l) => l.stage !== 'ACTIVE_CUSTOMER' && l.stage !== 'LOST_MISSED',
        );
        return {
          sellerId,
          name: entry.name,
          registered: entry.leads.length,
          won,
          winRate: entry.leads.length > 0 ? Math.round((won / entry.leads.length) * 100) : 0,
          pipelineValue: sumByCurrency(openLeads),
          tasksDone: tasksBySeller.get(sellerId) ?? 0,
        };
      })
      .sort((a, b) => b.registered - a.registered);
  }, [leads, doneTasks, externalMemberIds]);

  if (rows.length === 0) {
    return <div className="empty-state">{T2.noData}</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="leads">
        <thead>
          <tr>
            <th>{T2.seller}</th>
            <th>{T2.leadsRegistered}</th>
            <th>{T2.wonLbl}</th>
            <th>{T2.winRateLbl}</th>
            <th>{T2.openPipelineValue}</th>
            <th>{T2.tasksDone}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sellerId}>
              <td>{row.name}</td>
              <td className="num">{toPersianDigits(row.registered)}</td>
              <td className="num">{toPersianDigits(row.won)}</td>
              <td className="num">{toPersianDigits(row.winRate)}٪</td>
              <td className="num">{formatMoneyTotals(row.pipelineValue)}</td>
              <td className="num">{toPersianDigits(row.tasksDone)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
