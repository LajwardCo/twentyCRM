export type DiscountRuleConditionType =
  | 'ALWAYS'
  | 'MIN_QUANTITY'
  | 'MIN_METRIC_QUANTITY'
  | 'SIBLING_PRODUCT_PURCHASED';

export type DiscountRuleCondition = {
  conditionType: DiscountRuleConditionType;
  conditionMinQuantity: number | null | undefined;
  conditionSiblingProduct: string | null | undefined;
  // Only used by MIN_METRIC_QUANTITY.
  conditionMetric?: string | null | undefined;
};

export type DiscountRuleConditionFacts = {
  quantity: number | null | undefined;
  siblingProductIds: string[];
  // Per-metric quantities entered on the Deal Product line
  // (DealProduct.factorQuantities), keyed by metric name. Only used by
  // MIN_METRIC_QUANTITY.
  factorQuantities?: Record<string, number> | null | undefined;
};

export type DiscountRuleConditionFailureReason =
  | 'MISSING_MIN_QUANTITY_CONFIG'
  | 'MISSING_METRIC_CONFIG'
  | 'MISSING_SIBLING_CONFIG'
  | 'BELOW_MIN_QUANTITY'
  | 'BELOW_METRIC_MIN_QUANTITY'
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

  // MIN_METRIC_QUANTITY thresholds a specific pricing metric's quantity
  // (e.g. "Inventory >= 2") rather than the whole line quantity.
  if (condition.conditionType === 'MIN_METRIC_QUANTITY') {
    if (
      typeof condition.conditionMinQuantity !== 'number' ||
      !condition.conditionMetric
    ) {
      return { passed: false, failureReason: 'MISSING_METRIC_CONFIG' };
    }

    const metricQuantity = facts.factorQuantities?.[condition.conditionMetric];

    if (
      typeof metricQuantity !== 'number' ||
      metricQuantity < condition.conditionMinQuantity
    ) {
      return { passed: false, failureReason: 'BELOW_METRIC_MIN_QUANTITY' };
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
