import { Injectable } from '@nestjs/common';

import { SalesPushSubscriptionEntity } from 'src/engine/core-modules/sales-push/sales-push-subscription.entity';
import { InjectWorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/inject-workspace-scoped-repository.decorator';
import { type WorkspaceScopedRepository } from 'src/engine/twenty-orm/workspace-scoped-repository/workspace-scoped-repository';

type RegisterInput = {
  workspaceId: string;
  workspaceMemberId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

@Injectable()
export class PushSubscriptionService {
  constructor(
    @InjectWorkspaceScopedRepository(SalesPushSubscriptionEntity)
    private readonly subscriptionRepository: WorkspaceScopedRepository<SalesPushSubscriptionEntity>,
  ) {}

  // Upsert by endpoint. The same device re-registering (every launch, or
  // after the browser rotated its keys) refreshes the row; a device that
  // changed hands between members -- or workspaces -- follows the token,
  // never the old owner, which is why the conflict target is the endpoint
  // alone and every other column is overwritten.
  async register(input: RegisterInput): Promise<{ id: string }> {
    await this.subscriptionRepository.upsert(
      input.workspaceId,
      {
        workspaceMemberId: input.workspaceMemberId,
        endpoint: input.endpoint,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent,
        lastSeenAt: new Date(),
      },
      ['endpoint'],
    );

    const saved = await this.subscriptionRepository.findOneOrFail(
      input.workspaceId,
      { where: { endpoint: input.endpoint } },
    );

    return { id: saved.id };
  }

  // Only the owner may remove a subscription; an endpoint that is not theirs
  // is simply "not found" rather than a hint that it exists.
  async unregister(input: {
    workspaceId: string;
    workspaceMemberId: string;
    endpoint: string;
  }): Promise<{ deleted: boolean }> {
    const result = await this.subscriptionRepository.delete(input.workspaceId, {
      endpoint: input.endpoint,
      workspaceMemberId: input.workspaceMemberId,
    });

    return { deleted: (result.affected ?? 0) > 0 };
  }
}
