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
    ).toEqual({ passed: false, failureReason: 'MISSING_MIN_QUANTITY_CONFIG' });
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
    ).toEqual({ passed: false, failureReason: 'MISSING_SIBLING_CONFIG' });
  });
});
