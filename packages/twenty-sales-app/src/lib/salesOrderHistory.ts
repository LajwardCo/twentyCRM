import {
  type IssuedSalesOrder,
  type LeadUsystemsLink,
  type SalesOrderHistoryEntry,
} from '../api/usystems';

// The orders issued for a lead, as the Sales Order tab lists them.
//
// The CRM keeps the whole history in opportunity.usystemsSalesOrders (oldest
// first) and the latest order again in the three older fields, which CRM table
// views and reports read. Leads issued an order before the history field
// existed have only those three; they still get one row.

export const orderHistory = (link: LeadUsystemsLink): SalesOrderHistoryEntry[] => {
  const stored = Array.isArray(link.usystemsSalesOrders)
    ? link.usystemsSalesOrders.filter((entry) => entry && typeof entry.code === 'string')
    : [];
  const latestCode = link.usystemsSalesOrderCode;

  if (stored.length === 0) {
    if (!latestCode) return [];
    return [
      {
        id: link.usystemsSalesOrderId,
        code: latestCode,
        documentDate: null,
        validUntil: link.usystemsSalesOrderValidUntil,
        total: null,
        currencyCode: null,
        issuedAt: null,
      },
    ];
  }

  // A half-failed write can leave the two out of step; the latest fields are
  // what the rest of the CRM shows, so they win for the newest row.
  const newest = stored[stored.length - 1];
  const reconciled =
    latestCode && newest.code === latestCode
      ? [
          ...stored.slice(0, -1),
          {
            ...newest,
            id: link.usystemsSalesOrderId ?? newest.id,
            validUntil: link.usystemsSalesOrderValidUntil ?? newest.validUntil,
          },
        ]
      : stored;

  return [...reconciled].reverse();
};

export type LeadUsystemsLinkWithHistory = LeadUsystemsLink & {
  usystemsSalesOrders: SalesOrderHistoryEntry[];
};

/** The link to save after issuing `order`: history appended, latest fields set. */
export const withIssuedOrder = (
  link: LeadUsystemsLink | null,
  order: IssuedSalesOrder,
  issuedAt = new Date().toISOString(),
): LeadUsystemsLinkWithHistory => {
  const previous = link ? orderHistory(link).slice().reverse() : [];
  const entry: SalesOrderHistoryEntry = {
    id: order.id ? String(order.id) : null,
    code: order.code,
    documentDate: order.documentDate,
    validUntil: order.validUntil,
    total: order.total || null,
    currencyCode: order.currencyCode,
    issuedAt,
  };
  return {
    usystemsSalesOrderCode: order.code,
    usystemsSalesOrderId: entry.id,
    usystemsSalesOrderValidUntil: order.validUntil,
    usystemsSalesOrders: [...previous.filter((item) => item.code !== order.code), entry],
  };
};
