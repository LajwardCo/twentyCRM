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
  | 'MISSING_MIN_QUANTITY_CONFIG'
  | 'MISSING_SIBLING_CONFIG'
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
      return { passed: false, failureReason: 'MISSING_MIN_QUANTITY_CONFIG' };
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
    return { passed: false, failureReason: 'MISSING_SIBLING_CONFIG' };
  }

  if (!facts.siblingProductIds.includes(condition.conditionSiblingProduct)) {
    return { passed: false, failureReason: 'SIBLING_PRODUCT_MISSING' };
  }

  return { passed: true };
}
