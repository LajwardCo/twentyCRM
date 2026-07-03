# Pricing & Package Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Package + Pricing Version data model (volume-tiered pricing,
deactivate-not-delete versioning) that Deal Product lines can optionally
price against, alongside the existing flat `pricingFactors` path which stays
untouched.

**Architecture:** Two new custom objects (`Package`, `Pricing Version`)
provisioned via Twenty's metadata GraphQL API, two new fields on the
existing `Deal Product` object, a pure calculation utility (unit tested) for
band-matching/aggregation, a service that loads a Pricing Version and
delegates to that utility, a validation service enforcing "active version,
right product," and a create-hook on `Pricing Version` that auto-assigns
`versionNumber` and deactivates whatever was previously active.

**Tech Stack:** NestJS (`WorkspaceQueryHook` pre-query hooks), TypeORM-style
dynamic workspace repositories via `GlobalWorkspaceOrmManager`, Twenty
metadata GraphQL API (Node `fetch`-based provisioning scripts, same pattern
as `tools/sales-crm/provision-phase1.mjs`), Jest.

**Spec:** [`docs/superpowers/specs/2026-07-03-pricing-package-model-design.md`](../specs/2026-07-03-pricing-package-model-design.md)

---

### Task 1: Pure tier-schedule calculation utility

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/utils/pricing-tier-schedule.util.ts`
- Test: `packages/twenty-server/src/modules/sales-crm/utils/pricing-tier-schedule.util.spec.ts`

This is the actual business logic (band matching, `FLAT` vs `PER_UNIT`,
multi-factor aggregation by billing frequency) and the only part of this
plan with branching worth unit testing in isolation — no DB, no NestJS DI.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/twenty-server/src/modules/sales-crm/utils/pricing-tier-schedule.util.spec.ts
import {
  computePriceFromTierSchedule,
  matchTierBand,
} from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';

const OPD_DOCTOR_SCHEDULE = {
  factor: 'doctor',
  billingFrequency: 'MONTHLY' as const,
  bands: [
    { minQty: 1, maxQty: 4, mode: 'FLAT' as const, amount: 2000 },
    { minQty: 5, maxQty: 9, mode: 'PER_UNIT' as const, amount: 400 },
    { minQty: 10, maxQty: 20, mode: 'PER_UNIT' as const, amount: 300 },
    { minQty: 21, maxQty: null, mode: 'PER_UNIT' as const, amount: 250 },
  ],
};

const PHARMACY_EMPLOYEE_SCHEDULE = {
  factor: 'employee',
  billingFrequency: 'ANNUAL' as const,
  bands: [
    { minQty: 1, maxQty: 99, mode: 'PER_UNIT' as const, amount: 0.9 },
    { minQty: 100, maxQty: 199, mode: 'PER_UNIT' as const, amount: 0.7 },
    { minQty: 200, maxQty: 299, mode: 'PER_UNIT' as const, amount: 0.6 },
    { minQty: 300, maxQty: null, mode: 'PER_UNIT' as const, amount: 0.5 },
  ],
};

describe('matchTierBand', () => {
  it('matches a FLAT band and stays flat across the whole band', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 1)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[0],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 4)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[0],
    );
  });

  it('matches band boundaries exactly, including the transition point', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 5)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[1],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 9)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[1],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 10)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[2],
    );
  });

  it('matches an unbounded top band (maxQty null) for any quantity at or above minQty', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 21)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[3],
    );
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 1000)).toEqual(
      OPD_DOCTOR_SCHEDULE.bands[3],
    );
  });

  it('returns undefined when quantity is below every band', () => {
    expect(matchTierBand(OPD_DOCTOR_SCHEDULE.bands, 0)).toBeUndefined();
  });
});

describe('computePriceFromTierSchedule', () => {
  it('computes a FLAT band subtotal regardless of quantity within the band', () => {
    const result = computePriceFromTierSchedule([OPD_DOCTOR_SCHEDULE], {
      doctor: 3,
    });

    expect(result.breakdown).toEqual([
      {
        factor: 'doctor',
        quantity: 3,
        matchedBand: OPD_DOCTOR_SCHEDULE.bands[0],
        subtotal: 2000,
        billingFrequency: 'MONTHLY',
      },
    ]);
    expect(result.totalMonthly).toBe(2000);
    expect(result.totalAnnual).toBe(0);
  });

  it('computes a PER_UNIT band subtotal as amount times quantity', () => {
    const result = computePriceFromTierSchedule([OPD_DOCTOR_SCHEDULE], {
      doctor: 9,
    });

    expect(result.breakdown[0].subtotal).toBe(3600);
    expect(result.totalMonthly).toBe(3600);
  });

  it('aggregates multiple factors into separate monthly/annual totals', () => {
    const result = computePriceFromTierSchedule(
      [OPD_DOCTOR_SCHEDULE, PHARMACY_EMPLOYEE_SCHEDULE],
      { doctor: 5, employee: 150 },
    );

    expect(result.totalMonthly).toBe(2000);
    expect(result.totalAnnual).toBe(105);
    expect(result.breakdown).toHaveLength(2);
  });

  it('skips a factor with no matching quantity entry, without throwing', () => {
    const result = computePriceFromTierSchedule(
      [OPD_DOCTOR_SCHEDULE, PHARMACY_EMPLOYEE_SCHEDULE],
      { doctor: 5 },
    );

    expect(result.breakdown).toHaveLength(1);
    expect(result.totalAnnual).toBe(0);
  });

  it('skips a factor whose quantity matches no band, without throwing', () => {
    const result = computePriceFromTierSchedule([OPD_DOCTOR_SCHEDULE], {
      doctor: 0,
    });

    expect(result.breakdown).toHaveLength(0);
    expect(result.totalMonthly).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/twenty-server && npx jest src/modules/sales-crm/utils/pricing-tier-schedule.util.spec.ts --config=jest.config.mjs`
Expected: FAIL with "Cannot find module 'src/modules/sales-crm/utils/pricing-tier-schedule.util'"

- [ ] **Step 3: Write the implementation**

```typescript
// packages/twenty-server/src/modules/sales-crm/utils/pricing-tier-schedule.util.ts
export type BillingFrequency = 'MONTHLY' | 'ANNUAL';
export type TierBandMode = 'FLAT' | 'PER_UNIT';

export type TierBand = {
  minQty: number;
  maxQty: number | null;
  mode: TierBandMode;
  amount: number;
};

export type FactorTierSchedule = {
  factor: string;
  billingFrequency: BillingFrequency;
  bands: TierBand[];
};

export type FactorBreakdownEntry = {
  factor: string;
  quantity: number;
  matchedBand: TierBand;
  subtotal: number;
  billingFrequency: BillingFrequency;
};

export type TierScheduleComputation = {
  breakdown: FactorBreakdownEntry[];
  totalMonthly: number;
  totalAnnual: number;
};

// Volume/threshold tiering: the matched band's rate applies to the ENTIRE
// quantity, not a graduated/marginal split across bands (see design spec
// "Tiering model" section for why).
export function matchTierBand(
  bands: TierBand[],
  quantity: number,
): TierBand | undefined {
  return bands.find(
    (band) =>
      quantity >= band.minQty &&
      (band.maxQty === null || quantity <= band.maxQty),
  );
}

export function computePriceFromTierSchedule(
  tierSchedule: FactorTierSchedule[],
  factorQuantities: Record<string, number>,
): TierScheduleComputation {
  const breakdown: FactorBreakdownEntry[] = [];
  let totalMonthly = 0;
  let totalAnnual = 0;

  for (const factorSchedule of tierSchedule) {
    const quantity = factorQuantities[factorSchedule.factor];

    if (typeof quantity !== 'number') {
      continue;
    }

    const matchedBand = matchTierBand(factorSchedule.bands, quantity);

    if (!matchedBand) {
      continue;
    }

    const subtotal =
      matchedBand.mode === 'FLAT'
        ? matchedBand.amount
        : matchedBand.amount * quantity;

    breakdown.push({
      factor: factorSchedule.factor,
      quantity,
      matchedBand,
      subtotal,
      billingFrequency: factorSchedule.billingFrequency,
    });

    if (factorSchedule.billingFrequency === 'MONTHLY') {
      totalMonthly += subtotal;
    } else {
      totalAnnual += subtotal;
    }
  }

  return { breakdown, totalMonthly, totalAnnual };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/twenty-server && npx jest src/modules/sales-crm/utils/pricing-tier-schedule.util.spec.ts --config=jest.config.mjs`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/utils/pricing-tier-schedule.util.ts packages/twenty-server/src/modules/sales-crm/utils/pricing-tier-schedule.util.spec.ts
git commit -m "feat(sales-crm): volume-tiered pricing calculation utility"
```

---

### Task 2: Extend the price calculation service for Pricing Versions

**Files:**
- Modify: `packages/twenty-server/src/modules/sales-crm/services/deal-product-price-calculation.service.ts`

The existing `calculateInstallPrice` method (the `pricingModel === 'PER_FACTOR'`
path) is left completely unchanged — this task only adds a new method. No
unit test is added for this method, matching the existing untested pattern
of `calculateInstallPrice` and `DealProductDiscountValidationService.validate`
in this same module (both are thin DB-orchestration wrappers around
`GlobalWorkspaceOrmManager`, with no branching logic of their own — all real
logic lives in Task 1's pure utility, which is unit tested). This gets
exercised by the live functional check in Task 8.

- [ ] **Step 1: Add the new method**

Replace the full file content with:

```typescript
import { Injectable } from '@nestjs/common';

import { isDefined } from 'twenty-shared/utils';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';
import {
  computePriceFromTierSchedule,
  type FactorTierSchedule,
} from 'src/modules/sales-crm/utils/pricing-tier-schedule.util';

type PricingFactor = { name: string; unitPrice: number };
type FactorQuantities = Record<string, number>;
type CurrencyValue = {
  amountMicros: number | null;
  currencyCode: string | null;
};

export type PriceSnapshot = {
  packageId: string | null;
  packageName: string | null;
  pricingVersionId: string;
  versionNumber: number;
  evaluatedAt: string;
  breakdown: ReturnType<typeof computePriceFromTierSchedule>['breakdown'];
  totalMonthly: number;
  totalAnnual: number;
};

const FALLBACK_CURRENCY_CODE = 'USD';

// Computes installPrice for a Deal Product line from the linked Product's
// per-factor rate table (Product.pricingFactors) and this line's quantities
// (DealProduct.factorQuantities) -- e.g. OPD priced per doctor + per
// employee, accounting priced per user + per inventory item. The actual
// rates are entered by whoever manages the Product catalog; this service has
// no hardcoded business numbers.
//
// Only runs when pricingModel === 'PER_FACTOR' and factorQuantities is
// present -- FLAT-priced products are left untouched (installPrice is set
// directly by whoever creates the Deal Product line).
@Injectable()
export class DealProductPriceCalculationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async calculateInstallPrice({
    workspaceId,
    productId,
    factorQuantities,
  }: {
    workspaceId: string;
    productId: string | null | undefined;
    factorQuantities: FactorQuantities | null | undefined;
  }): Promise<CurrencyValue | undefined> {
    if (!isDefined(productId) || !isDefined(factorQuantities)) {
      return undefined;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const product =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const productRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'product',
              { shouldBypassPermissionChecks: true },
            );

          return productRepository.findOne({ where: { id: productId } });
        },
        authContext,
      );

    if (product?.pricingModel !== 'PER_FACTOR') {
      return undefined;
    }

    const pricingFactors = product.pricingFactors as PricingFactor[] | null;

    if (!isDefined(pricingFactors) || !Array.isArray(pricingFactors)) {
      return undefined;
    }

    let total = 0;

    for (const factor of pricingFactors) {
      const quantity = factorQuantities[factor.name];

      if (isDefined(quantity) && typeof quantity === 'number') {
        total += factor.unitPrice * quantity;
      }
    }

    // installPrice/annualPrice are CURRENCY composite fields ({amountMicros,
    // currencyCode}), not plain numbers -- writing a raw number is silently
    // dropped. Reuse whichever currency the product's own base price is
    // already denominated in (set by whoever entered the catalog data),
    // falling back to USD only if that's also unset.
    const baseInstallPrice = product.baseInstallPrice as CurrencyValue | null;
    const currencyCode =
      baseInstallPrice?.currencyCode ?? FALLBACK_CURRENCY_CODE;

    return {
      amountMicros: Math.round(total * 1_000_000),
      currencyCode,
    };
  }

  // Computes installPrice/annualPrice from a Package's Pricing Version
  // (volume-tiered rate table) instead of the flat Product.pricingFactors
  // table -- see docs/superpowers/specs/2026-07-03-pricing-package-model-design.md.
  // Returns undefined if the version, its package, or its tierSchedule can't
  // be found -- callers should leave installPrice/annualPrice untouched in
  // that case (the pre-query hook's validation service is what rejects bad
  // input; this method only computes).
  async calculateFromPricingVersion({
    workspaceId,
    pricingVersionId,
    factorQuantities,
  }: {
    workspaceId: string;
    pricingVersionId: string | null | undefined;
    factorQuantities: FactorQuantities | null | undefined;
  }): Promise<
    | {
        installPrice: CurrencyValue;
        annualPrice: CurrencyValue;
        priceSnapshot: PriceSnapshot;
      }
    | undefined
  > {
    if (!isDefined(pricingVersionId) || !isDefined(factorQuantities)) {
      return undefined;
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const { pricingVersion, packageRecord, product } =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const pricingVersionRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'pricingVersion',
              { shouldBypassPermissionChecks: true },
            );

          const foundPricingVersion = await pricingVersionRepository.findOne({
            where: { id: pricingVersionId },
          });

          if (!isDefined(foundPricingVersion)) {
            return {
              pricingVersion: undefined,
              packageRecord: undefined,
              product: undefined,
            };
          }

          const packageRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'package',
              { shouldBypassPermissionChecks: true },
            );

          const foundPackage = await packageRepository.findOne({
            where: { id: foundPricingVersion.packageId as string },
          });

          const productRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'product',
              { shouldBypassPermissionChecks: true },
            );

          const foundProduct = isDefined(foundPackage)
            ? await productRepository.findOne({
                where: { id: foundPackage.productId as string },
              })
            : undefined;

          return {
            pricingVersion: foundPricingVersion,
            packageRecord: foundPackage,
            product: foundProduct,
          };
        },
        authContext,
      );

    if (!isDefined(pricingVersion)) {
      return undefined;
    }

    const tierSchedule = pricingVersion.tierSchedule as
      | FactorTierSchedule[]
      | null;

    if (!isDefined(tierSchedule) || !Array.isArray(tierSchedule)) {
      return undefined;
    }

    const { breakdown, totalMonthly, totalAnnual } =
      computePriceFromTierSchedule(tierSchedule, factorQuantities);

    const currencyCode =
      (pricingVersion.currencyCode as string | null | undefined) ??
      (product?.baseInstallPrice as CurrencyValue | null | undefined)
        ?.currencyCode ??
      FALLBACK_CURRENCY_CODE;

    const priceSnapshot: PriceSnapshot = {
      packageId: (packageRecord?.id as string | undefined) ?? null,
      packageName: (packageRecord?.name as string | null | undefined) ?? null,
      pricingVersionId: pricingVersion.id as string,
      versionNumber: pricingVersion.versionNumber as number,
      evaluatedAt: new Date().toISOString(),
      breakdown,
      totalMonthly,
      totalAnnual,
    };

    return {
      installPrice: {
        amountMicros: Math.round(totalMonthly * 1_000_000),
        currencyCode,
      },
      annualPrice: {
        amountMicros: Math.round(totalAnnual * 1_000_000),
        currencyCode,
      },
      priceSnapshot,
    };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx nx typecheck twenty-server`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/services/deal-product-price-calculation.service.ts
git commit -m "feat(sales-crm): compute Deal Product price from a Pricing Version"
```

---

### Task 3: Pricing Version validation service

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/services/deal-product-pricing-version-validation.service.ts`

Enforces "the pricing rules" guarantee from the spec: a Deal Product can
only reference an **active** Pricing Version that belongs to a Package on
the **same Product** as the line itself.

- [ ] **Step 1: Write the implementation**

```typescript
// packages/twenty-server/src/modules/sales-crm/services/deal-product-pricing-version-validation.service.ts
import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

// Enforces that a Deal Product can only reference an ACTIVE Pricing Version
// belonging to a Package on the same Product as the line -- this is the
// "sellers can't sell something else by mistake" guarantee for the
// Package/Pricing Version path (mirrors the discount-ceiling hook's role for
// the legacy PER_FACTOR path).
@Injectable()
export class DealProductPricingVersionValidationService {
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async validate({
    workspaceId,
    productId,
    pricingVersionId,
  }: {
    workspaceId: string;
    productId: string | null | undefined;
    pricingVersionId: string | null | undefined;
  }): Promise<void> {
    if (!isDefined(pricingVersionId)) {
      return;
    }

    if (!isDefined(productId)) {
      throw new CommonQueryRunnerException(
        'A pricing version cannot be set without a linked Product.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`A pricing version cannot be set without a linked Product.`,
        },
      );
    }

    const authContext = buildSystemAuthContext(workspaceId);

    const { pricingVersion, packageRecord } =
      await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
        async () => {
          const pricingVersionRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'pricingVersion',
              { shouldBypassPermissionChecks: true },
            );

          const foundPricingVersion = await pricingVersionRepository.findOne({
            where: { id: pricingVersionId },
          });

          if (!isDefined(foundPricingVersion)) {
            return { pricingVersion: undefined, packageRecord: undefined };
          }

          const packageRepository =
            await this.globalWorkspaceOrmManager.getRepository(
              workspaceId,
              'package',
              { shouldBypassPermissionChecks: true },
            );

          const foundPackage = await packageRepository.findOne({
            where: { id: foundPricingVersion.packageId as string },
          });

          return {
            pricingVersion: foundPricingVersion,
            packageRecord: foundPackage,
          };
        },
        authContext,
      );

    if (!isDefined(pricingVersion)) {
      throw new CommonQueryRunnerException(
        'The linked pricing version does not exist.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`The selected pricing version could not be found.`,
        },
      );
    }

    if (pricingVersion.isActive !== true) {
      throw new CommonQueryRunnerException(
        'The linked pricing version is not active. Select the current active version for this package.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`This pricing version has been superseded. Select the package's current version instead.`,
        },
      );
    }

    if (
      !isDefined(packageRecord) ||
      (packageRecord.productId as string | undefined) !== productId
    ) {
      throw new CommonQueryRunnerException(
        'The linked pricing version belongs to a package for a different Product.',
        CommonQueryRunnerExceptionCode.INVALID_ARGS_DATA,
        {
          userFriendlyMessage: msg`This pricing version doesn't belong to this line's Product.`,
        },
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
git add packages/twenty-server/src/modules/sales-crm/services/deal-product-pricing-version-validation.service.ts
git commit -m "feat(sales-crm): validate Pricing Version is active and matches the line's Product"
```

---

### Task 4: Pricing Version create pre-query hook

**Files:**
- Create: `packages/twenty-server/src/modules/sales-crm/query-hooks/pricing-version-create-one.pre-query.hook.ts`

Auto-assigns `versionNumber` (max existing + 1 per package) and, when the
new version is created active, deactivates whatever was previously active
under the same package — this is the entire "deactivate, never delete"
mechanism from the spec.

- [ ] **Step 1: Write the implementation**

```typescript
// packages/twenty-server/src/modules/sales-crm/query-hooks/pricing-version-create-one.pre-query.hook.ts
import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { buildSystemAuthContext } from 'src/engine/twenty-orm/utils/build-system-auth-context.util';

@Injectable()
@WorkspaceQueryHook(`pricingVersion.createOne`)
export class PricingVersionCreateOnePreQueryHook
  implements WorkspacePreQueryHookInstance
{
  constructor(
    private readonly globalWorkspaceOrmManager: GlobalWorkspaceOrmManager,
  ) {}

  async execute(
    authContext: WorkspaceAuthContext,
    _objectName: string,
    payload: CreateOneResolverArgs,
  ): Promise<CreateOneResolverArgs> {
    const workspace = authContext.workspace;

    assertIsDefinedOrThrow(workspace, WorkspaceNotFoundDefaultError);

    const packageId = payload.data.packageId as string | null | undefined;

    if (!isDefined(packageId)) {
      return payload;
    }

    const systemAuthContext = buildSystemAuthContext(workspace.id);

    await this.globalWorkspaceOrmManager.executeInWorkspaceContext(
      async () => {
        const pricingVersionRepository =
          await this.globalWorkspaceOrmManager.getRepository(
            workspace.id,
            'pricingVersion',
            { shouldBypassPermissionChecks: true },
          );

        const existingVersions = await pricingVersionRepository.find({
          where: { packageId },
        });

        const nextVersionNumber =
          existingVersions.reduce(
            (max, version) =>
              Math.max(max, (version.versionNumber as number) ?? 0),
            0,
          ) + 1;

        payload.data.versionNumber = nextVersionNumber;

        const isActive = payload.data.isActive as boolean | null | undefined;

        if (isActive !== true) {
          return;
        }

        const previouslyActiveVersions = existingVersions.filter(
          (version) => version.isActive === true,
        );

        for (const previouslyActiveVersion of previouslyActiveVersions) {
          await pricingVersionRepository.update(
            { id: previouslyActiveVersion.id as string },
            { isActive: false, deactivatedAt: new Date() },
          );
        }
      },
      systemAuthContext,
    );

    return payload;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx nx typecheck twenty-server`
Expected: no new errors from this file

- [ ] **Step 3: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/query-hooks/pricing-version-create-one.pre-query.hook.ts
git commit -m "feat(sales-crm): auto-version and deactivate superseded Pricing Versions"
```

---

### Task 5: Wire Deal Product create/update hooks to the Pricing Version path

**Files:**
- Modify: `packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook.ts`
- Modify: `packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook.ts`

- [ ] **Step 1: Update the create hook**

Replace the full file content with:

```typescript
// packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook.ts
import { Injectable } from '@nestjs/common';

import { assertIsDefinedOrThrow, isDefined } from 'twenty-shared/utils';

import { type WorkspacePreQueryHookInstance } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/interfaces/workspace-query-hook.interface';
import { type CreateOneResolverArgs } from 'src/engine/api/graphql/workspace-resolver-builder/interfaces/workspace-resolvers-builder.interface';

import { WorkspaceQueryHook } from 'src/engine/api/graphql/workspace-query-runner/workspace-query-hook/decorators/workspace-query-hook.decorator';
import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { WorkspaceNotFoundDefaultError } from 'src/engine/core-modules/workspace/workspace.exception';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

@Injectable()
@WorkspaceQueryHook(`dealProduct.createOne`)
export class DealProductCreateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly discountValidationService: DealProductDiscountValidationService,
    private readonly priceCalculationService: DealProductPriceCalculationService,
    private readonly pricingVersionValidationService: DealProductPricingVersionValidationService,
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

- [ ] **Step 2: Update the update hook**

Replace the full file content with:

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
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

@Injectable()
@WorkspaceQueryHook(`dealProduct.updateOne`)
export class DealProductUpdateOnePreQueryHook implements WorkspacePreQueryHookInstance {
  constructor(
    private readonly discountValidationService: DealProductDiscountValidationService,
    private readonly priceCalculationService: DealProductPriceCalculationService,
    private readonly pricingVersionValidationService: DealProductPricingVersionValidationService,
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

    // Neither pricing-related field changed -- an unrelated field edit
    // (e.g. lineStatus) shouldn't require any Product/Package lookup at all.
    if (
      !isDefined(discountPercent) &&
      !isDefined(factorQuantities) &&
      !isDefined(pricingVersionId)
    ) {
      return payload;
    }

    let productId = payload.data.productId as string | null | undefined;

    // Partial update payloads often omit unchanged fields -- if productId
    // (or factorQuantities, when switching pricingVersion without re-sending
    // quantities) isn't in THIS payload, it wasn't changed, so look up the
    // existing record.
    if (!isDefined(productId) || (isDefined(pricingVersionId) && !isDefined(factorQuantities))) {
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

    if (isDefined(discountPercent)) {
      await this.discountValidationService.validate({
        workspaceId: workspace.id,
        productId,
        discountPercent,
      });
    }

    return payload;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx nx typecheck twenty-server`
Expected: no new errors from these two files

- [ ] **Step 4: Commit**

```bash
git add packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook.ts packages/twenty-server/src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook.ts
git commit -m "feat(sales-crm): wire Deal Product hooks to the Pricing Version path"
```

---

### Task 6: Register the new providers in the query-hook module

**Files:**
- Modify: `packages/twenty-server/src/modules/sales-crm/query-hooks/sales-crm-query-hook.module.ts`

- [ ] **Step 1: Update the module**

Replace the full file content with:

```typescript
// packages/twenty-server/src/modules/sales-crm/query-hooks/sales-crm-query-hook.module.ts
import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { DealProductCreateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook';
import { DealProductUpdateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook';
import { PricingVersionCreateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/pricing-version-create-one.pre-query.hook';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

@Module({
  imports: [TwentyORMModule],
  providers: [
    DealProductDiscountValidationService,
    DealProductPriceCalculationService,
    DealProductPricingVersionValidationService,
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
git commit -m "feat(sales-crm): register Pricing Version validation + hook"
```

---

### Task 7: Provisioning script for Package / Pricing Version objects

**Files:**
- Create: `tools/sales-crm/provision-pricing-package-model.mjs`

Follows the exact idempotent pattern of `tools/sales-crm/provision-phase1.mjs`
and `tools/sales-crm/provision-pricing-fields.mjs`: creates the `package` and
`pricingVersion` objects, their scalar fields, the two new fields on
`dealProduct`, and the three relations.

- [ ] **Step 1: Write the script**

```javascript
// tools/sales-crm/provision-pricing-package-model.mjs
// Package + Pricing Version objects, plus the two new Deal Product fields
// that reference them. See docs/superpowers/specs/2026-07-03-pricing-package-model-design.md.
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
  { nameSingular: 'package', namePlural: 'packages', labelSingular: 'Package', labelPlural: 'Packages', icon: 'IconPackage', description: 'A named, sellable pricing plan for one Product' },
  { nameSingular: 'pricingVersion', namePlural: 'pricingVersions', labelSingular: 'Pricing Version', labelPlural: 'Pricing Versions', icon: 'IconVersions', description: 'A versioned, banded rate table under a Package -- old versions are deactivated, never deleted' },
];

const FIELDS = {
  package: [
    { name: 'status', label: 'Status', type: 'SELECT', options: [opt('ACTIVE', 'Active', 0, 'green'), opt('ARCHIVED', 'Archived', 1, 'gray')] },
    { name: 'allowsCustomPricing', label: 'Allows Custom Pricing', type: 'BOOLEAN' },
    { name: 'notes', label: 'Notes', type: 'TEXT' },
  ],
  pricingVersion: [
    { name: 'versionNumber', label: 'Version Number', type: 'NUMBER' },
    { name: 'isActive', label: 'Active', type: 'BOOLEAN' },
    { name: 'effectiveFrom', label: 'Effective From', type: 'DATE_TIME' },
    { name: 'deactivatedAt', label: 'Deactivated At', type: 'DATE_TIME' },
    { name: 'currencyCode', label: 'Currency Code', type: 'TEXT', description: 'ISO code the tierSchedule amounts are denominated in; falls back to the Product base price currency if unset.' },
    { name: 'tierSchedule', label: 'Tier Schedule', type: 'RAW_JSON', description: 'Array of {factor, billingFrequency, bands:[{minQty,maxQty,mode,amount}]} -- see design spec for the exact format.' },
  ],
  dealProduct: [
    { name: 'priceSnapshot', label: 'Price Snapshot', type: 'RAW_JSON', description: 'Frozen breakdown of the Pricing Version computation that produced installPrice/annualPrice -- see design spec.' },
  ],
};

// relations: created on `source` object, pointing to `target` object
const RELATIONS = [
  { source: 'package', name: 'product', label: 'Product', target: 'product', targetFieldLabel: 'Packages', targetFieldIcon: 'IconPackage', icon: 'IconBox' },
  { source: 'pricingVersion', name: 'package', label: 'Package', target: 'package', targetFieldLabel: 'Pricing Versions', targetFieldIcon: 'IconVersions', icon: 'IconPackage' },
  { source: 'dealProduct', name: 'pricingVersion', label: 'Pricing Version', target: 'pricingVersion', targetFieldLabel: 'Deal Products', targetFieldIcon: 'IconShoppingCart', icon: 'IconVersions' },
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
      if (obj.fields.has(f.name)) { rec('field', `${objName}.${f.name}`, 'skip', 'exists'); continue; }
      try { await createField({ objectMetadataId: obj.id, ...f }); rec('field', `${objName}.${f.name}`, 'created'); }
      catch (e) { rec('field', `${objName}.${f.name}`, 'FAIL', e.message); }
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

- [ ] **Step 2: Commit**

```bash
git add tools/sales-crm/provision-pricing-package-model.mjs
git commit -m "feat(sales-crm): provisioning script for Package/Pricing Version objects"
```

---

### Task 8: Run against local dev, verify end-to-end, update status doc

**Files:**
- Modify: `docs/sales-crm/PROJECT-STATUS.md`

- [ ] **Step 1: Ensure local dev is up**

Run: `bash packages/twenty-utils/setup-dev-env.sh` (idempotent, safe to re-run)
Then in separate terminals: `npx nx start twenty-server` and `npx nx start twenty-front`
(and `npx nx run twenty-server:worker` if not already running).

- [ ] **Step 2: Run the provisioning script**

Run: `node tools/sales-crm/provision-pricing-package-model.mjs`
Expected: objects/fields/relations created (or skipped if re-run), 0 failed in the summary line.

- [ ] **Step 3: Functional verification via GraphQL**

Using the same login pattern as the provisioning scripts (or the Twenty UI
at `http://localhost:3011`):

1. Create a `Product` (or reuse an existing sellable one).
2. Create a `Package` linked to that Product, `status: ACTIVE`.
3. Create a `Pricing Version` linked to that Package, `isActive: true`,
   `effectiveFrom: now`, and `tierSchedule` set to the OPD example from the
   spec (doctor + employee bands).
4. Create a second `Pricing Version` on the same Package, also
   `isActive: true` — confirm the first version's `isActive` flips to
   `false` and `deactivatedAt` gets set (the deactivate-not-delete check).
5. Create a `Deal Product` referencing that Product, this Package's
   currently-active Pricing Version, and `factorQuantities: {"doctor": 5}` —
   confirm `installPrice` computes to the correct amount (400 × 5 = 2000 in
   the Product's currency) and `priceSnapshot` is populated with a matching
   breakdown.
6. Attempt a `Deal Product` with a `pricingVersion` that belongs to a
   different Product's Package — confirm it's rejected.
7. Attempt a `Deal Product` with a deactivated (non-active) `pricingVersion`
   — confirm it's rejected.
8. Clean up test records (`delete*` then `destroy*` mutations — Twenty
   soft-deletes by default).

- [ ] **Step 4: Update the status doc**

Add a new "Phase 4 — Package & Pricing Version model" section to
`docs/sales-crm/PROJECT-STATUS.md` (after the existing Phase 3 section),
summarizing what was built, linking to this plan and its spec, and
recording the verification results from Step 3. Follow the exact style of
the existing Phase 1-3 sections in that file (what/where/how-to-reverify).

- [ ] **Step 5: Commit**

```bash
git add docs/sales-crm/PROJECT-STATUS.md
git commit -m "docs(sales-crm): document Package/Pricing Version model (Phase 4)"
```

---

## Self-review notes

- **Spec coverage**: Package + Pricing Version objects (Task 7), tiered
  calculation (Task 1/2), deactivate-not-delete versioning (Task 4),
  snapshotting (Task 2/priceSnapshot), validation against product/active
  version (Task 3/5), backward compatibility (Task 2 — legacy method
  untouched) are all covered. Provisioning + live verification (Task 7/8)
  covers the "actually works" requirement.
- **Not in this plan** (explicitly deferred per the spec's decomposition):
  discount/bundle rules, Contract entity, Payment model, Lead Overview tab,
  Opportunity→Lead rename. These are separate specs/plans.
