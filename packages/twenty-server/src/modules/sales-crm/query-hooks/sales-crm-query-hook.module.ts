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
