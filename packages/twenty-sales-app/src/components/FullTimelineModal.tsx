import { type HistoryTarget } from '../api/recordHistory';
import { type LeadSummary } from '../api/records';
import { T15 } from '../lib/strings';
import { ModalSheet } from './ModalSheet';
import { RecordHistory } from './RecordHistory';

// The lead's whole story in one place: every change to the lead itself and to
// the records hanging off it -- its company and its contact person -- merged
// into a single chronological log. Linked notes and tasks already ride along on
// the opportunity's own timeline, so the three targets below cover "anything
// related" without a query per row.

type FullTimelineModalProps = {
  lead: LeadSummary;
  onClose: () => void;
};

export const FullTimelineModal = ({ lead, onClose }: FullTimelineModalProps) => {
  const targets: HistoryTarget[] = [{ kind: 'opportunity', id: lead.id }];
  if (lead.company) targets.push({ kind: 'company', id: lead.company.id });
  if (lead.pointOfContact)
    targets.push({ kind: 'person', id: lead.pointOfContact.id });

  return (
    <ModalSheet title={T15.showFullHistory} onClose={onClose}>
      <div className="sub" style={{ marginBottom: 10 }}>
        {T15.fullHistoryHint}
      </div>
      <RecordHistory targets={targets} />
    </ModalSheet>
  );
};
