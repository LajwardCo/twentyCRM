import { Injectable } from '@nestjs/common';

import { msg } from '@lingui/core/macro';
import { isDefined } from 'twenty-shared/utils';

import {
  CommonQueryRunnerException,
  CommonQueryRunnerExceptionCode,
} from 'src/engine/api/common/common-query-runners/errors/common-query-runner.exception';
import { type DealProductPricingVersionLookupService } from 'src/modules/sales-crm/services/deal-product-pricing-version-lookup.service';

// Enforces that a Deal Product can only reference an ACTIVE Pricing Version
// belonging to a Package on the same Product as the line -- this is the
// "sellers can't sell something else by mistake" guarantee for the
// Package/Pricing Version path (mirrors the discount-ceiling hook's role for
// the legacy PER_FACTOR path). Takes the Pricing Version and Package already
// fetched by DealProductPricingVersionLookupService rather than re-querying
// them.
@Injectable()
export class DealProductPricingVersionValidationService {
  async validate({
    productId,
    pricingVersionId,
    pricingVersion,
    packageRecord,
  }: {
    productId: string | null | undefined;
    pricingVersionId: string | null | undefined;
    pricingVersion: Awaited<
      ReturnType<DealProductPricingVersionLookupService['findWithPackage']>
    >['pricingVersion'];
    packageRecord: Awaited<
      ReturnType<DealProductPricingVersionLookupService['findWithPackage']>
    >['packageRecord'];
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
