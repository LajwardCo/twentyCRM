import { Module } from '@nestjs/common';

import { TwentyORMModule } from 'src/engine/twenty-orm/twenty-orm.module';
import { DealProductCreateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/deal-product-create-one.pre-query.hook';
import { DealProductUpdateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/deal-product-update-one.pre-query.hook';
import { PricingVersionCreateOnePreQueryHook } from 'src/modules/sales-crm/query-hooks/pricing-version-create-one.pre-query.hook';
import { DealProductDiscountRuleApplicationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-application.service';
import { DealProductDiscountRuleLookupService } from 'src/modules/sales-crm/services/deal-product-discount-rule-lookup.service';
import { DealProductDiscountRuleValidationService } from 'src/modules/sales-crm/services/deal-product-discount-rule-validation.service';
import { DealProductDiscountValidationService } from 'src/modules/sales-crm/services/deal-product-discount-validation.service';
import { DealProductPriceCalculationService } from 'src/modules/sales-crm/services/deal-product-price-calculation.service';
import { DealProductPricingVersionLookupService } from 'src/modules/sales-crm/services/deal-product-pricing-version-lookup.service';
import { DealProductPricingVersionValidationService } from 'src/modules/sales-crm/services/deal-product-pricing-version-validation.service';

@Module({
  imports: [TwentyORMModule],
  providers: [
    DealProductDiscountValidationService,
    DealProductPriceCalculationService,
    DealProductPricingVersionLookupService,
    DealProductPricingVersionValidationService,
    DealProductDiscountRuleLookupService,
    DealProductDiscountRuleValidationService,
    DealProductDiscountRuleApplicationService,
    DealProductCreateOnePreQueryHook,
    DealProductUpdateOnePreQueryHook,
    PricingVersionCreateOnePreQueryHook,
  ],
})
export class SalesCrmQueryHookModule {}
