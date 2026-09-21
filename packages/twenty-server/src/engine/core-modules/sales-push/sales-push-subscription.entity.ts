import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { WorkspaceRelatedEntity } from 'src/engine/workspace-manager/types/workspace-related-entity';

// One browser/device that asked to be told about the member's reminders.
// Lives in the core schema (server-owned) rather than as a workspace object:
// nothing in the CRM UI needs to see it, and the sweep must read every
// workspace's rows in one place. The endpoint is the subscription's identity
// -- re-registering the same device updates the row instead of duplicating.
@Entity({ name: 'salesPushSubscription', schema: 'core' })
@Unique('IDX_SALES_PUSH_SUBSCRIPTION_ENDPOINT_UNIQUE', ['endpoint'])
@Index('IDX_SALES_PUSH_SUBSCRIPTION_WORKSPACE_MEMBER', [
  'workspaceId',
  'workspaceMemberId',
])
export class SalesPushSubscriptionEntity extends WorkspaceRelatedEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  workspaceMemberId: string;

  @Column({ type: 'text' })
  endpoint: string;

  @Column({ type: 'text' })
  p256dh: string;

  @Column({ type: 'text' })
  auth: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  lastSeenAt: Date;
}
