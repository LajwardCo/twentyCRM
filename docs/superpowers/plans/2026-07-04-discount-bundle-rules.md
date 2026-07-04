# Discount & Bundle Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-typed `DealProduct.discountPercent` with a curated
`DiscountRule` a seller selects (never types), rejecting the selection
outright if the rule's condition isn't met — with bundles modeled as the same
`DiscountRule` object, just with a condition that checks a sibling Deal
Product's Product instead of this line's own quantity.

**Architecture:** One new custom object (`Discount Rule`) provisioned via
Twenty's metadata GraphQL API, one new nullable field on the existing `Deal
Product` object, a pure condition-evaluator utility (unit tested), a
validation service (rejects bad selections), an application service (computes
the discount effect), wired into the existing Deal Product create/update
hooks alongside the Pricing Version logic already there.

**Tech Stack:** NestJS (`WorkspaceQueryHook` pre-query hooks), TypeORM-style
dynamic workspace repositories via `GlobalWorkspaceOrmManager`, Twenty
metadata GraphQL API provisioning scripts, Jest.

**Spec:** [`docs/superpowers/specs/2026-07-04-discount-bundle-rules-design.md`](../specs/2026-07-04-discount-bundle-rules-design.md)

---

### Task 1: Pure discount rule condition evaluator

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/utils/discount-rule-condition.util.ts`
- Test: `packages/twenty-server/src/modules/sales-crm/utils/discount-rule-condition.util.spec.ts`

This is the actual decision logic (three condition types) and the only part
of this plan worth unit testing in isolation — no DB, no NestJS DI. Mirrors
the pattern already established by `pricing-tier-schedule.util.ts`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/twenty-server/src/modules/sales-crm/utils/discount-rule-condition.util.spec.ts
import {
  evaluateDiscountRuleCondition,
  type DiscountRuleCondition,
} from 'src/modules/sales-crm/utils/discount-rule-condition.util';

describe('evaluateDiscountRuleCondition', () => {
  it('ALWAYS always passes', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'ALWAYS',
      conditionMinQuantity: null,
      conditionSiblingProduct: null,
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: null,
        siblingProductIds: [],
      }),
    ).toEqual({ passed: true });
  });

  it('MIN_QUANTITY passes when quantity meets the threshold exactly', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'MIN_QUANTITY',
      conditionMinQuantity: 10,
      conditionSiblingProduct: null,
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: 10,
        siblingProductIds: [],
      }),
    ).toEqual({ passed: true });
  });

  it('MIN_QUANTITY passes when quantity exceeds the threshold', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'MIN_QUANTITY',
      conditionMinQuantity: 10,
      conditionSiblingProduct: null,
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: 15,
        siblingProductIds: [],
      }),
    ).toEqual({ passed: true });
  });

  it('MIN_QUANTITY fails when quantity is below the threshold', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'MIN_QUANTITY',
      conditionMinQuantity: 10,
      conditionSiblingProduct: null,
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: 9,
        siblingProductIds: [],
      }),
    ).toEqual({ passed: false, failureReason: 'BELOW_MIN_QUANTITY' });
  });

  it('MIN_QUANTITY fails when quantity is missing', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'MIN_QUANTITY',
      conditionMinQuantity: 10,
      conditionSiblingProduct: null,
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: null,
        siblingProductIds: [],
      }),
    ).toEqual({ passed: false, failureReason: 'BELOW_MIN_QUANTITY' });
  });

  it('MIN_QUANTITY fails when the rule has no threshold configured', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'MIN_QUANTITY',
      conditionMinQuantity: null,
      conditionSiblingProduct: null,
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: 100,
        siblingProductIds: [],
      }),
    ).toEqual({ passed: false, failureReason: 'MISCONFIGURED' });
  });

  it('SIBLING_PRODUCT_PURCHASED passes when the sibling product is present', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'SIBLING_PRODUCT_PURCHASED',
      conditionMinQuantity: null,
      conditionSiblingProduct: 'opd-product-id',
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: null,
        siblingProductIds: ['opd-product-id', 'other-product-id'],
      }),
    ).toEqual({ passed: true });
  });

  it('SIBLING_PRODUCT_PURCHASED fails when the sibling product is absent', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'SIBLING_PRODUCT_PURCHASED',
      conditionMinQuantity: null,
      conditionSiblingProduct: 'opd-product-id',
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: null,
        siblingProductIds: ['other-product-id'],
      }),
    ).toEqual({ passed: false, failureReason: 'SIBLING_PRODUCT_MISSING' });
  });

  it('SIBLING_PRODUCT_PURCHASED fails when there are no siblings at all', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'SIBLING_PRODUCT_PURCHASED',
      conditionMinQuantity: null,
      conditionSiblingProduct: 'opd-product-id',
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: null,
        siblingProductIds: [],
      }),
    ).toEqual({ passed: false, failureReason: 'SIBLING_PRODUCT_MISSING' });
  });

  it('SIBLING_PRODUCT_PURCHASED fails when the rule has no sibling product configured', () => {
    const condition: DiscountRuleCondition = {
      conditionType: 'SIBLING_PRODUCT_PURCHASED',
      conditionMinQuantity: null,
      conditionSiblingProduct: null,
    };

    expect(
      evaluateDiscountRuleCondition(condition, {
        quantity: null,
        siblingProductIds: ['opd-product-id'],
      }),
    ).toEqual({ passed: false, failureReason: 'MISCONFIGURED' });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/twenty-server && npx jest src/modules/sales-crm/utils/discount-rule-condition.util.spec.ts --config=jest.config.mjs`
Expected: FAIL with "Cannot find module 'src/modules/sales-crm/utils/discount-rule-condition.util'"

- [ ] **Step 3: Write the implementation**

```typescript
// packages/twenty-server/src/modules/sales-crm/utils/discount-rule-condition.util.ts
export type DiscountRuleConditionType =
  | 'ALWAYS'
  | 'MIN_QUANTITY'
  | 'SIBLING_PRODUCT_PURCHASED';

export type DiscountRuleCondition = {
  conditionType: DiscountRuleConditionType;
  conditionMinQuantity: number | null | undefined;
  conditionSiblingProduct: string | null | undefined;
};

export type DiscountRuleConditionFacts = {
  quantity: number | null | undefined;
  siblingProductIds: string[];
};

export type DiscountRuleConditionFailureReason =
  | 'MISCONFIGURED'
  | 'BELOW_MIN_QUANTITY'
  | 'SIBLING_PRODUCT_MISSING';

export type DiscountRuleConditionEvaluation =
  | { passed: true }
  | { passed: false; failureReason: DiscountRuleConditionFailureReason };

// Bundles are not a separate concept -- a "bundle" is just a rule whose
// condition is SIBLING_PRODUCT_PURCHASED (see design spec "Key modeling
// decision"). This function is the single place both volume discounts and
// bundles get evaluated.
export function evaluateDiscountRuleCondition(
  condition: DiscountRuleCondition,
  facts: DiscountRuleConditionFacts,
): DiscountRuleConditionEvaluation {
  if (condition.conditionType === 'ALWAYS') {
    return { passed: true };
  }

  if (condition.conditionType === 'MIN_QUANTITY') {
    if (typeof condition.conditionMinQuantity !== 'number') {
      return { passed: false, failureReason: 'MISCONFIGURED' };
    }

    if (
      typeof facts.quantity !== 'number' ||
      facts.quantity < condition.conditionMinQuantity
    ) {
      return { passed: false, failureReason: 'BELOW_MIN_QUANTITY' };
    }

    return { passed: true };
  }

  // SIBLING_PRODUCT_PURCHASED
  if (!condition.conditionSiblingProduct) {
    return { passed: false, failureReason: 'MISCONFIGURED' };
  }

  if (!facts.siblingProductIds.includes(condition.conditionSiblingProduct)) {
    return { passed: false, failureReason: 'SIBLING_PRODUCT_MISSING' };
  }

  return { passed: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/twenty-server && npx jest src/modules/sales-crm/utils/discount-rule-condition.util.spec.ts --config=jest.config.mjs`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/utils/discount-rule-condition.util.ts packages/twenty-server/src/modules/sales-crm/utils/discount-rule-condition.util.spec.ts
git commit -m "feat(sales-crm): discount rule condition evaluator (volume + bundle)"
```

---

### Task 2: Discount rule validation service

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/services/deal-product-discount-rule-validation.service.ts`

Enforces "the seller can only select from those, and if that does not match
the rule, does not allow using it": a Deal Product can only reference an
`ACTIVE` Discount Rule whose `appliesToProduct` matches the line's Product,
AND whose condition actually holds.

- [ ] **Step 1: Write the implementation**

```typescript
// packages/twenty-server/src/modules/sales-crm/services/deal-product-discount-rule-validation.service.ts
import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  evaluateDiscountRuleCondition,
  type DiscountRuleConditionType,
} from 'src/modules/sales-crm/utils/discount-rule-condition.util';

// Enforces that a Deal Product can only reference an ACTIVE Discount Rule
// belonging to the same Product as the line, whose condition (volume
// threshold, or a sibling Deal Product for a bundled Product) is actually
// satisfied -- the "seller can't invent a discount" guarantee. Mirrors
// DealProductPricingVersionValidationService's role for the Package path.
@Injectable()
export class DealProductDiscountRuleValidationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async validate({
    workspaceId,
    productId,
    opportunityId,
    quantity,
    discountRuleId,
  }: {
    workspaceId: string;
    productId: string | null | undefined;
    opportunityId: string | null | undefined;
    quantity: number | null | undefined;
    discountRuleId: string | null | undefined;
  }): Promise<void> {
    if (!isDefined(discountRuleId)) {
      return;
    }

    if (!isDefined(productId)) {
      throw new CommonQueryRunnerException(
        'A discount rule cannot be set without a linked Product.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`A discount rule cannot be set without a linked Product.`,
        },
      );
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const { discountRule, siblingProductIds } =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const discountRuleRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'discountRule',
              { shouldBypassPermissionChecks: true },
            );

          const foundDiscountRule = await discountRuleRepository.findOne({
            where: { id: discountRuleId },
          });

          if (
            !isDefined(foundDiscountRule) ||
            foundDiscountRule.conditionType !== 'SIBLING_PRODUCT_PURCHASED' ||
            !isDefined(opportunityId)
          ) {
            return { discountRule: foundDiscountRule, siblingProductIds: [] };
          }

          const dealProductRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'dealProduct',
              { shouldBypassPermissionChecks: true },
            );

          const siblingDealProducts = await dealProductRepository.find({
            where: { opportunityId },
          });

          return {
            discountRule: foundDiscountRule,
            siblingProductIds: siblingDealProducts
              .map(
                (dealProduct) =>
                  dealProduct.productId as string | null | undefined,
              )
              .filter((id): id is string => isDefined(id)),
          };
        },
        authContext,
      );

    if (!isDefined(discountRule)) {
      throw new CommonQueryRunnerException(
        'The linked discount rule does not exist.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`The selected discount rule could not be found.`,
        },
      );
    }

    if (discountRule.status !== 'ACTIVE') {
      throw new CommonQueryRunnerException(
        'The linked discount rule is not active.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`This discount rule has been archived. Select an active rule instead.`,
        },
      );
    }

    if (
      (discountRule.appliesToProductId as string | undefined) !== productId
    ) {
      throw new CommonQueryRunnerException(
        'The linked discount rule applies to a different Product.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`This discount rule doesn't apply to this line's Product.`,
        },
      );
    }

    const evaluation = evaluateDiscountRuleCondition(
      {
        conditionType: discountRule.conditionType as DiscountRuleConditionType,
        conditionMinQuantity: discountRule.conditionMinQuantity as
          | number
          | null
          | undefined,
        conditionSiblingProduct: discountRule.conditionSiblingProductId as
          | string
          | null
          | undefined,
      },
      { quantity, siblingProductIds },
    );

    if (!evaluation.passed) {
      const userFriendlyMessage =
        evaluation.failureReason === 'BELOW_MIN_QUANTITY'
          ? msg`This discount rule requires a higher quantity on this line.`
          : evaluation.failureReason === 'SIBLING_PRODUCT_MISSING'
            ? msg`This discount rule requires another line for its linked product on the same Lead.`
            : msg`This discount rule is not configured correctly.`;

      throw new CommonQueryRunnerException(
        `Discount rule condition not met (${evaluation.failureReason}).`,
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        { userFriendlyMessage },
      );
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx nx typecheck twenty-server`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/services/deal-product-discount-rule-validation.service.ts
git commit -m "feat(sales-crm): validate Discount Rule is active, matches Product, and its condition holds"
```

---

### Task 3: Discount rule application service

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/services/deal-product-discount-rule-application.service.ts`

Computes the discount effect once validation has already passed: either a
`discountPercent` to set (which the existing ceiling check still applies to),
or a reduced `installPrice` (for fixed-amount discounts).

- [ ] **Step 1: Write the implementation**

```typescript
// packages/twenty-server/src/modules/sales-crm/services/deal-product-discount-rule-application.service.ts
import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

// Computes the discount effect of an already-validated Discount Rule --
// PERCENTAGE rules set discountPercent (still subject to the existing
// maxDiscountPercent ceiling check, run by the caller afterward); FIXED_AMOUNT
// rules reduce the already-computed installPrice directly, floored at 0.
// Assumes DealProductDiscountRuleValidationService.validate() already ran
// and passed -- this service does not re-validate, only computes.
@Injectable()
export class DealProductDiscountRuleApplicationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async apply({
    workspaceId,
    discountRuleId,
    installPrice,
  }: {
    workspaceId: string;
    discountRuleId: string | null | undefined;
    installPrice: CurrencyValue | null | undefined;
  }): Promise<
    { discountPercent: number; installPrice?: never }
    | { discountPercent?: never; installPrice: CurrencyValue }
    | undefined
  > {
    if (!isDefined(discountRuleId)) {
      return undefined;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const discountRule =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const discountRuleRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'discountRule',
              { shouldBypassPermissionChecks: true },
            );

          return discountRuleRepository.findOne({
            where: { id: discountRuleId },
          });
        },
        authContext,
      );

    if (!isDefined(discountRule)) {
      return undefined;
    }

    if (discountRule.discountType === 'PERCENTAGE') {
      const discountPercentValue = discountRule.discountPercentValue as
        | number
        | null
        | undefined;

      if (!isDefined(discountPercentValue)) {
        return undefined;
      }

      return { discountPercent: discountPercentValue };
    }

    if (discountRule.discountType === 'FIXED_AMOUNT') {
      const discountFixedAmount = discountRule.discountFixedAmount as
        | CurrencyValue
        | null
        | undefined;

      if (
        !isDefined(discountFixedAmount?.amountMicros) ||
        !isDefined(installPrice?.amountMicros)
      ) {
        return undefined;
      }

      const adjustedAmountMicros = Math.max(
        0,
        (installPrice.amountMicros as number) -
          (discountFixedAmount.amountMicros as number),
      );

      return {
        installPrice: {
          amountMicros: adjustedAmountMicros,
          currencyCode: installPrice?.currencyCode ?? null,
        },
      };
    }

    return undefined;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx nx typecheck twenty-server`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/services/deal-product-discount-rule-application.service.ts
git commit -m "feat(sales-crm): compute Discount Rule effect (percentage or fixed amount)"
```

---

### Task 4: Wire the create hook

**Files:**
- Modify: `packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook.ts`

- [ ] **Step 1: Replace the full file content**

```typescript
// packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook.ts
import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { DealProductDiscountRuleApplicationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-application.service';
import { DealProductDiscountRuleValidationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-validation.service';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

@Injectable()
@WorkspaceQueryHook(`dealProduct.createOne`)
export class DealProductCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly discountValidationService: DealProductDiscountValidationService,
    private readonly priceCalculationService: DealProductPriceCalculationService,
    private readonly pricingVersionValidationService: DealProductPricingVersionValidationService,
    private readonly discountRuleValidationService: DealProductDiscountRuleValidationService,
    private readonly discountRuleApplicationService: DealProductDiscountRuleApplicationService,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    const productId = payload.data.productId as string | null | undefined;
    const pricingVersionId = payload.data.pricingVersionId as
      | string
      | null
      | undefined;
    const factorQuantities = payload.data.factorQuantities as
      | Record<string, number>
      | null
      | undefined;
    const opportunityId = payload.data.opportunityId as
      | string
      | null
      | undefined;
    const quantity = payload.data.quantity as number | null | undefined;
    const discountRuleId = payload.data.discountRuleId as
      | string
      | null
      | undefined;

    await this.pricingVersionValidationService.validate({
      workspaceId: workspace.id,
      productId,
      pricingVersionId,
    });

    if (isDefined(pricingVersionId)) {
      const calculated =
        await this.priceCalculationService.calculateFromPricingVersion({
          workspaceId: workspace.id,
          pricingVersionId,
          factorQuantities,
        });

      if (isDefined(calculated)) {
        payload.data.installPrice = calculated.installPrice;
        payload.data.annualPrice = calculated.annualPrice;
        payload.data.priceSnapshot = calculated.priceSnapshot;
      }
    } else {
      const calculatedInstallPrice =
        await this.priceCalculationService.calculateInstallPrice({
          workspaceId: workspace.id,
          productId,
          factorQuantities,
        });

      if (isDefined(calculatedInstallPrice)) {
        payload.data.installPrice = calculatedInstallPrice;
      }
    }

    await this.discountRuleValidationService.validate({
      workspaceId: workspace.id,
      productId,
      opportunityId,
      quantity,
      discountRuleId,
    });

    const discountRuleEffect = await this.discountRuleApplicationService.apply(
      {
        workspaceId: workspace.id,
        discountRuleId,
        installPrice: payload.data.installPrice as
          | CurrencyValue
          | null
          | undefined,
      },
    );

    if (isDefined(discountRuleEffect)) {
      if (isDefined(discountRuleEffect.discountPercent)) {
        payload.data.discountPercent = discountRuleEffect.discountPercent;
      }

      if (isDefined(discountRuleEffect.installPrice)) {
        payload.data.installPrice = discountRuleEffect.installPrice;
      }
    }

    await this.discountValidationService.validate({
      workspaceId: workspace.id,
      productId,
      discountPercent: payload.data.discountPercent as
        | number
        | null
        | undefined,
    });

    return payload;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx nx typecheck twenty-server`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook.ts
git commit -m "feat(sales-crm): wire Discount Rule into Deal Product create"
```

---

### Task 5: Wire the update hook

**Files:**
- Modify: `packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook.ts`

The existing "look up existing record when the partial payload omits a
needed field" block gets extended to also backfill `quantity` and
`opportunityId` when `discountRuleId` is set but they're not in this payload.

- [ ] **Step 1: Replace the full file content**

```typescript
// packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook.ts
import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type UpdateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import { DealProductDiscountRuleApplicationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-application.service';
import { DealProductDiscountRuleValidationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-validation.service';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

@Injectable()
@WorkspaceQueryHook(`dealProduct.updateOne`)
export class DealProductUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly discountValidationService: DealProductDiscountValidationService,
    private readonly priceCalculationService: DealProductPriceCalculationService,
    private readonly pricingVersionValidationService: DealProductPricingVersionValidationService,
    private readonly discountRuleValidationService: DealProductDiscountRuleValidationService,
    private readonly discountRuleApplicationService: DealProductDiscountRuleApplicationService,
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: UpdateOneResolverArgs,
  ): Promise<UpdateOneResolverArgs> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    const discountPercent = payload.data.discountPercent as
      | number
      | null
      | undefined;
    let factorQuantities = payload.data.factorQuantities as
      | Record<string, number>
      | null
      | undefined;
    const pricingVersionId = payload.data.pricingVersionId as
      | string
      | null
      | undefined;
    const discountRuleId = payload.data.discountRuleId as
      | string
      | null
      | undefined;
    let quantity = payload.data.quantity as number | null | undefined;
    let opportunityId = payload.data.opportunityId as
      | string
      | null
      | undefined;

    // Neither pricing- nor discount-related field changed -- an unrelated
    // field edit (e.g. lineStatus) shouldn't require any Product/Package/
    // Discount Rule lookup at all.
    if (
      !isDefined(discountPercent) &&
      !isDefined(factorQuantities) &&
      !isDefined(pricingVersionId) &&
      payload.data.pricingVersionId !== null &&
      !isDefined(discountRuleId)
    ) {
      return payload;
    }

    let productId = payload.data.productId as string | null | undefined;

    // Partial update payloads often omit unchanged fields -- if productId
    // (or factorQuantities, when switching pricingVersion without re-sending
    // quantities, or quantity/opportunityId, when setting a discountRule
    // without re-sending them) isn't in THIS payload, it wasn't changed, so
    // look up the existing record.
    if (
      !isDefined(productId) ||
      (isDefined(pricingVersionId) && !isDefined(factorQuantities)) ||
      (isDefined(discountRuleId) &&
        (!isDefined(quantity) || !isDefined(opportunityId)))
    ) {
      const authContextForLookup = buildSystemAuthContext(workspace.id);

      const existing =
        await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
          async () => {
            const dealProductRepository =
              await this.globalWorkspaceOrmManager.getRepository(
                workspace.id,
                'dealProduct',
                { shouldBypassPermissionChecks: true },
              );

            return dealProductRepository.findOne({
              where: { id: payload.id },
            });
          },
          authContextForLookup,
        );

      if (!isDefined(productId)) {
        productId = existing?.productId as string | null | undefined;
      }

      if (isDefined(pricingVersionId) && !isDefined(factorQuantities)) {
        factorQuantities = existing?.factorQuantities as
          | Record<string, number>
          | null
          | undefined;
      }

      if (isDefined(discountRuleId) && !isDefined(quantity)) {
        quantity = existing?.quantity as number | null | undefined;
      }

      if (isDefined(discountRuleId) && !isDefined(opportunityId)) {
        opportunityId = existing?.opportunityId as string | null | undefined;
      }
    }

    await this.pricingVersionValidationService.validate({
      workspaceId: workspace.id,
      productId,
      pricingVersionId,
    });

    if (isDefined(pricingVersionId)) {
      const calculated =
        await this.priceCalculationService.calculateFromPricingVersion({
          workspaceId: workspace.id,
          pricingVersionId,
          factorQuantities,
        });

      if (isDefined(calculated)) {
        payload.data.installPrice = calculated.installPrice;
        payload.data.annualPrice = calculated.annualPrice;
        payload.data.priceSnapshot = calculated.priceSnapshot;
      }
    } else if (isDefined(factorQuantities)) {
      const calculatedInstallPrice =
        await this.priceCalculationService.calculateInstallPrice({
          workspaceId: workspace.id,
          productId,
          factorQuantities,
        });

      if (isDefined(calculatedInstallPrice)) {
        payload.data.installPrice = calculatedInstallPrice;
      }
    }

    // An explicit `pricingVersionId: null` detaches the line from its
    // Pricing Version -- the old priceSnapshot no longer reflects reality
    // and must be cleared, regardless of which branch above fired.
    if (payload.data.pricingVersionId === null) {
      payload.data.priceSnapshot = null;
    }

    await this.discountRuleValidationService.validate({
      workspaceId: workspace.id,
      productId,
      opportunityId,
      quantity,
      discountRuleId,
    });

    const discountRuleEffect = await this.discountRuleApplicationService.apply(
      {
        workspaceId: workspace.id,
        discountRuleId,
        installPrice: payload.data.installPrice as
          | CurrencyValue
          | null
          | undefined,
      },
    );

    if (isDefined(discountRuleEffect)) {
      if (isDefined(discountRuleEffect.discountPercent)) {
        payload.data.discountPercent = discountRuleEffect.discountPercent;
      }

      if (isDefined(discountRuleEffect.installPrice)) {
        payload.data.installPrice = discountRuleEffect.installPrice;
      }
    }

    await this.discountValidationService.validate({
      workspaceId: workspace.id,
      productId,
      discountPercent: payload.data.discountPercent as
        | number
        | null
        | undefined,
    });

    return payload;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx nx typecheck twenty-server`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook.ts
git commit -m "feat(sales-crm): wire Discount Rule into Deal Product update"
```

---

### Task 6: Register the new providers in the query-hook module

**Files:**
- Modify: `packages/twenty-server/src/modules/sales-crm/query-hooks/sales-crm-query-hook.module.ts`

- [ ] **Step 1: Replace the full file content**

```typescript
// packages/twenty-server/src/modules/sales-crm/query-hooks/sales-crm-query-hook.module.ts
import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { DealProductCreateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook';
import { DealProductUpdateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook';
import { PricingVersionCreateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/pricing-version-create-one.pre-query.hook';
import { DealProductDiscountRuleApplicationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-application.service';
import { DealProductDiscountRuleValidationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-validation.service';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

@Module({
  imports: [TwentyORMModule],
  providers: [
    DealProductDiscountValidationService,
    DealProductPriceCalculationService,
    DealProductPricingVersionValidationService,
    DealProductDiscountRuleValidationService,
    DealProductDiscountRuleApplicationService,
    DealProductCreateOnePreQueryHook,
    DealProductUpdateOnePreQueryHook,
    PricingVersionCreateOnePreQueryHook,
  ],
})
export class SalesCrmQueryHookModule {}
```

- [ ] **Step 2: Typecheck the whole module**

Run: `npx nx typecheck twenty-server`
Expected: PASS, no errors

- [ ] **Step 3: Lint**

Run: `npx nx lint:diff-with-main twenty-server`
Expected: PASS, no errors on changed files

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/query-hooks/sales-crm-query-hook.module.ts
git commit -m "feat(sales-crm): register Discount Rule validation and application services"
```

---

### Task 7: Provisioning script for the Discount Rule object

**Files:**
- Create: `tools/sales-crm/provision-discount-bundle-rules.mjs`

Follows the exact idempotent pattern of
`tools/sales-crm/provision-pricing-package-model.mjs`.

- [ ] **Step 1: Write the script**

```javascript
// tools/sales-crm/provision-discount-bundle-rules.mjs
// Discount Rule object, plus the one new Deal Product field that references
// it. See docs/superpowers/specs/2026-07-04-discount-bundle-rules-design.md.
// Idempotent: skips objects/fields that already exist. Non-fatal per item.
const META = process.env.TWENTY_META ?? 'http://localhost:3010/metadata';
const ORIGIN = process.env.TWENTY_ORIGIN ?? 'http://localhost:3011';
const EMAIL = process.env.TWENTY_EMAIL ?? 'tim@apple.dev';
const PASSWORD = process.env.TWENTY_PASSWORD ?? 'tim@apple.dev';

let TOKEN = null;
async function gql(query, variables) {
  const res = await fetch(META, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: ORIGIN,
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors.map((e) => e.message)));
  return json.data;
}

async function login() {
  const a = await gql(
    `mutation($e:String!,$p:String!,$o:String!){getLoginTokenFromCredentials(email:$e,password:$p,origin:$o){loginToken{token}}}`,
    { e: EMAIL, p: PASSWORD, o: ORIGIN },
  );
  const loginToken = a.getLoginTokenFromCredentials.loginToken.token;
  const b = await gql(
    `mutation($t:String!,$o:String!){getAuthTokensFromLoginToken(loginToken:$t,origin:$o){tokens{accessOrWorkspaceAgnosticToken{token}}}}`,
    { t: loginToken, o: ORIGIN },
  );
  TOKEN = b.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

async function fetchObjects() {
  const d = await gql(`query {
    objects(paging:{first:500}) { edges { node {
      id nameSingular isSystem
      fields(paging:{first:500}) { edges { node { name } } }
    } } }
  }`);
  const map = {};
  for (const { node } of d.objects.edges) {
    map[node.nameSingular] = {
      id: node.id,
      fields: new Set(node.fields.edges.map((e) => e.node.name)),
    };
  }
  return map;
}

async function createObject(spec) {
  const d = await gql(
    `mutation($input:CreateOneObjectInput!){createOneObject(input:$input){id nameSingular}}`,
    { input: { object: spec } },
  );
  return d.createOneObject;
}

async function createField(input) {
  const d = await gql(
    `mutation($input:CreateOneFieldMetadataInput!){createOneField(input:$input){id name}}`,
    { input: { field: input } },
  );
  return d.createOneField;
}

const opt = (value, label, position, color) => ({ value, label, position, color });

// ---- model ----
const OBJECTS = [
  { nameSingular: 'discountRule', namePlural: 'discountRules', labelSingular: 'Discount Rule', labelPlural: 'Discount Rules', icon: 'IconDiscount2', description: 'A curated, condition-gated discount a seller selects (never types) -- bundles are rules whose condition checks a sibling Deal Product' },
];

const FIELDS = {
  discountRule: [
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('ACTIVE', 'Active', 0, 'green'), opt('ARCHIVED', 'Archived', 1, 'gray')] },
    { name: 'conditionType', label: 'Condition Type', type: 'SELECT', options: [opt('ALWAYS', 'Always', 0, 'gray'), opt('MIN_QUANTITY', 'Minimum Quantity', 1, 'blue'), opt('SIBLING_PRODUCT_PURCHASED', 'Sibling Product Purchased (Bundle)', 2, 'purple')] },
    { name: 'conditionMinQuantity', label: 'Condition: Min Quantity', type: 'NUMBER', description: 'Used when conditionType = MIN_QUANTITY.' },
    { name: 'discountType', label: 'Discount Type', type: 'SELECT', options: [opt('PERCENTAGE', 'Percentage', 0, 'blue'), opt('FIXED_AMOUNT', 'Fixed Amount', 1, 'turquoise')] },
    { name: 'discountPercentValue', label: 'Discount: Percent Value', type: 'NUMBER', description: 'Used when discountType = PERCENTAGE.' },
    { name: 'discountFixedAmount', label: 'Discount: Fixed Amount', type: 'CURRENCY', description: 'Used when discountType = FIXED_AMOUNT.' },
    { name: 'notes', label: 'Notes', type: 'TEXT' },
  ],
  dealProduct: [
    { name: 'quantity', label: 'Quantity', type: 'NUMBER', __skipIfExists: true },
  ],
};

// relations: created on `source` object, pointing to `target` object
const RELATIONS = [
  { source: 'discountRule', name: 'appliesToProduct', label: 'Applies To Product', target: 'product', targetFieldLabel: 'Discount Rules (Applies To)', targetFieldIcon: 'IconDiscount2', icon: 'IconBox' },
  { source: 'discountRule', name: 'conditionSiblingProduct', label: 'Condition: Sibling Product', target: 'product', targetFieldLabel: 'Discount Rules (Sibling Condition)', targetFieldIcon: 'IconDiscount2', icon: 'IconBox' },
  { source: 'dealProduct', name: 'discountRule', label: 'Discount Rule', target: 'discountRule', targetFieldLabel: 'Deal Products', targetFieldIcon: 'IconShoppingCart', icon: 'IconDiscount2' },
];

const log = [];
const rec = (kind, name, status, detail = '') => { log.push({ kind, name, status, detail }); console.log(`  [${status}] ${kind}: ${name}${detail ? ' — ' + detail : ''}`); };

async function main() {
  await login();
  console.log('authenticated.\n');

  let objs = await fetchObjects();

  console.log('== objects ==');
  for (const spec of OBJECTS) {
    if (objs[spec.nameSingular]) { rec('object', spec.nameSingular, 'skip', 'exists'); continue; }
    try { const o = await createObject(spec); rec('object', o.nameSingular, 'created', o.id); }
    catch (e) { rec('object', spec.nameSingular, 'FAIL', e.message); }
  }
  objs = await fetchObjects(); // refresh to get new object ids

  console.log('\n== fields ==');
  for (const [objName, fields] of Object.entries(FIELDS)) {
    const obj = objs[objName];
    if (!obj) { rec('field', objName + '.*', 'FAIL', 'object missing'); continue; }
    for (const f of fields) {
      const { __skipIfExists, ...fieldInput } = f;
      if (obj.fields.has(fieldInput.name)) { rec('field', `${objName}.${fieldInput.name}`, 'skip', 'exists'); continue; }
      try { await createField({ objectMetadataId: obj.id, ...fieldInput }); rec('field', `${objName}.${fieldInput.name}`, 'created'); }
      catch (e) { rec('field', `${objName}.${fieldInput.name}`, 'FAIL', e.message); }
    }
  }
  objs = await fetchObjects();

  console.log('\n== relations ==');
  for (const r of RELATIONS) {
    const src = objs[r.source], tgt = objs[r.target];
    if (!src || !tgt) { rec('relation', `${r.source}.${r.name}`, 'FAIL', 'src/tgt missing'); continue; }
    if (src.fields.has(r.name)) { rec('relation', `${r.source}.${r.name}`, 'skip', 'exists'); continue; }
    try {
      await createField({
        objectMetadataId: src.id,
        name: r.name,
        label: r.label,
        type: 'RELATION',
        icon: r.icon,
        relationCreationPayload: {
          type: 'MANY_TO_ONE',
          targetObjectMetadataId: tgt.id,
          targetFieldLabel: r.targetFieldLabel,
          targetFieldIcon: r.targetFieldIcon,
        },
      });
      rec('relation', `${r.source}.${r.name} -> ${r.target}`, 'created');
    } catch (e) { rec('relation', `${r.source}.${r.name}`, 'FAIL', e.message); }
  }

  const fails = log.filter((l) => l.status === 'FAIL');
  console.log(`\n==== SUMMARY: ${log.filter(l=>l.status==='created').length} created, ${log.filter(l=>l.status==='skip').length} skipped, ${fails.length} failed ====`);
  if (fails.length) process.exitCode = 1;
}
main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
```

Note: `dealProduct.quantity` already exists (created in Phase 1) — the
`FIELDS.dealProduct` entry is a no-op safety net (the script's own
skip-if-exists check on `obj.fields.has(fieldInput.name)` means this never
actually attempts creation in practice, since Phase 1 already ran
everywhere this script will run); it's listed here only so `fetchObjects()`'s
membership check has something to verify against, matching the defensive
style already used for `dealProduct` fields in other scripts.

- [ ] **Step 2: Commit**

```bash
git add tools/sales-crm/provision-discount-bundle-rules.mjs
git commit -m "feat(sales-crm): provisioning script for Discount Rule object"
```

---

### Task 8: Run against local dev, verify end-to-end, update PROJECT-STATUS.md

**Files:**
- Modify: `docs/sales-crm/PROJECT-STATUS.md`

- [ ] **Step 1: Ensure local dev is up**

Run: `bash packages/twenty-utils/setup-dev-env.sh` (idempotent)
Then: `npx nx start twenty-server` / `npx nx start twenty-front` (and
`npx nx run twenty-server:worker` for parity with the documented setup).

- [ ] **Step 2: Run the provisioning script**

Run: `node tools/sales-crm/provision-discount-bundle-rules.mjs`
Expected: objects/fields/relations created (or skipped if re-run), 0 failed.

- [ ] **Step 3: Functional verification via GraphQL**

1. Create (or reuse) a `Product`.
2. Create an `ALWAYS` Discount Rule for that Product,
   `discountType: PERCENTAGE`, `discountPercentValue: 5`. Create a Deal
   Product referencing that Product and this rule — confirm
   `discountPercent` becomes `5`.
3. Create a `MIN_QUANTITY` rule (`conditionMinQuantity: 10`,
   `discountType: PERCENTAGE`, `discountPercentValue: 15`). Create a Deal
   Product with `quantity: 5` and this rule — confirm it's **rejected**.
   Retry with `quantity: 10` — confirm it's **accepted** and
   `discountPercent` becomes `15`.
4. Create a second Product (e.g. "Prescription") and a
   `SIBLING_PRODUCT_PURCHASED` rule on it (`conditionSiblingProduct` = the
   first Product, `discountType: FIXED_AMOUNT`, a real `discountFixedAmount`).
   Create a Deal Product for "Prescription" + this rule on a Lead with NO
   sibling Deal Product for the first Product yet — confirm **rejected**.
   Add a Deal Product for the first Product to the same Lead, then retry the
   Prescription line — confirm **accepted** and `installPrice` reduced by
   the fixed amount (floored at 0 if it would go negative).
5. Confirm a rule with `status: ARCHIVED` is rejected when selected.
6. Confirm a rule whose `appliesToProduct` doesn't match the line's Product
   is rejected.
7. Clean up all test records (`delete*` then `destroy*`).

- [ ] **Step 4: Update the status doc**

Add a "Phase 5 — Discount & Bundle Rules" section to
`docs/sales-crm/PROJECT-STATUS.md` (after Phase 4), matching the existing
sections' style, recording the verification results from Step 3.

- [ ] **Step 5: Commit**

```bash
git add docs/sales-crm/PROJECT-STATUS.md
git commit -m "docs(sales-crm): document Discount & Bundle Rules (Phase 5)"
```

---

## Self-review notes

- **Spec coverage**: curated rule selection (Task 2), condition evaluation
  for all three types including bundles (Task 1), percentage + fixed-amount
  discount application (Task 3), integration into both hooks (Tasks 4-5),
  provisioning (Task 7), live verification of every condition/discount-type
  combination plus both rejection paths (Task 8) are all covered.
- **Backward compatibility**: every change to the two hooks is additive —
  the existing Pricing Version and legacy `PER_FACTOR` logic is untouched;
  a Deal Product with no `discountRuleId` behaves exactly as before this
  plan.
- **Not in this plan** (explicitly deferred per the spec): the Contract
  entity, the Payment model, the Lead Overview tab, and the Opportunity→Lead
  rename remain separate specs/plans.
