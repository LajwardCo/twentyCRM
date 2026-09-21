import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// "This reminder time has been pushed." Keyed by (taskId, remindAt) so a
// snooze or reschedule -- which produces a new remindAt -- re-arms on its own,
// and the task record needs no bookkeeping field for the server's benefit.
@Entity({ name: 'salesReminderDispatch', schema: 'core' })
@Index('IDX_SALES_REMINDER_DISPATCH_WORKSPACE_SENT_AT', [
  'workspaceId',
  'sentAt',
])
export class SalesReminderDispatchEntity {
  @PrimaryColumn({ type: 'uuid' })
  taskId: string;

  @PrimaryColumn({ type: 'timestamptz' })
  remindAt: Date;

  @Column({ type: 'uuid' })
  workspaceId: string;

  @Column({ type: 'timestamptz' })
  sentAt: Date;
}
