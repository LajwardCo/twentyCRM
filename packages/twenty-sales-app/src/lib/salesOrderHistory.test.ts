import { describe, expect, it } from 'vitest';

import { type SalesOrderHistoryEntry } from '../api/usystems';
import { orderHistory, withIssuedOrder } from './salesOrderHistory';

const entry = (code: string, extra: Partial<SalesOrderHistoryEntry> = {}): SalesOrderHistoryEntry => ({
  id: code.slice(-3),
  code,
  documentDate: '2026-09-01',
  validUntil: '2026-10-01',
  total: '1000',
  currencyCode: 'AFN',
  issuedAt: '2026-09-01T08:00:00Z',
  ...extra,
});

describe('orderHistory', () => {
  it('is empty when nothing was issued', () => {
    expect(
      orderHistory({
        usystemsSalesOrderCode: null,
        usystemsSalesOrderId: null,
        usystemsSalesOrderValidUntil: null,
        usystemsSalesOrders: [],
      }),
    ).toEqual([]);
  });

  it('lists newest first', () => {
    const rows = orderHistory({
      usystemsSalesOrderCode: 'SO-3',
      usystemsSalesOrderId: 'O-3',
      usystemsSalesOrderValidUntil: '2026-10-03',
      usystemsSalesOrders: [entry('SO-1'), entry('SO-2'), entry('SO-3', { id: 'O-3', validUntil: '2026-10-03' })],
    });
    expect(rows.map((r) => r.code)).toEqual(['SO-3', 'SO-2', 'SO-1']);
  });

  it('synthesises one row from the latest fields when the history is missing', () => {
    const rows = orderHistory({
      usystemsSalesOrderCode: 'SO-9',
      usystemsSalesOrderId: '9',
      usystemsSalesOrderValidUntil: '2026-10-09',
      usystemsSalesOrders: null,
    });
    expect(rows).toEqual([
      { id: '9', code: 'SO-9', documentDate: null, validUntil: '2026-10-09', total: null, currencyCode: null, issuedAt: null },
    ]);
  });

  it('lets the latest fields win for the newest row when the two disagree', () => {
    const rows = orderHistory({
      usystemsSalesOrderCode: 'SO-2',
      usystemsSalesOrderId: 'fixed-id',
      usystemsSalesOrderValidUntil: '2026-12-31',
      usystemsSalesOrders: [entry('SO-1'), entry('SO-2', { id: null, validUntil: null })],
    });
    expect(rows[0]).toMatchObject({ code: 'SO-2', id: 'fixed-id', validUntil: '2026-12-31' });
  });

  it('ignores malformed history entries', () => {
    const rows = orderHistory({
      usystemsSalesOrderCode: 'SO-1',
      usystemsSalesOrderId: '1',
      usystemsSalesOrderValidUntil: null,
      usystemsSalesOrders: [null as never, {} as never, entry('SO-1')],
    });
    expect(rows.map((r) => r.code)).toEqual(['SO-1']);
  });
});

describe('withIssuedOrder', () => {
  const order = {
    id: 118,
    code: 'SO-118',
    validUntil: '2026-10-10',
    documentDate: '2026-09-10',
    isExpired: false,
    total: '55000',
    currencyCode: 'AFN',
  };

  it('appends to the history and moves the latest fields', () => {
    const next = withIssuedOrder(
      {
        usystemsSalesOrderCode: 'SO-1',
        usystemsSalesOrderId: '1',
        usystemsSalesOrderValidUntil: '2026-09-30',
        usystemsSalesOrders: [entry('SO-1', { id: '1', validUntil: '2026-09-30' })],
      },
      order,
      '2026-09-10T09:15:00Z',
    );
    expect(next.usystemsSalesOrderCode).toBe('SO-118');
    expect(next.usystemsSalesOrderId).toBe('118');
    expect(next.usystemsSalesOrderValidUntil).toBe('2026-10-10');
    expect(next.usystemsSalesOrders.map((e) => e.code)).toEqual(['SO-1', 'SO-118']);
    expect(next.usystemsSalesOrders[1]).toEqual({
      id: '118',
      code: 'SO-118',
      documentDate: '2026-09-10',
      validUntil: '2026-10-10',
      total: '55000',
      currencyCode: 'AFN',
      issuedAt: '2026-09-10T09:15:00Z',
    });
  });

  it('keeps a pre-history latest order as the first entry', () => {
    const next = withIssuedOrder(
      {
        usystemsSalesOrderCode: 'SO-old',
        usystemsSalesOrderId: 'old',
        usystemsSalesOrderValidUntil: '2026-09-01',
        usystemsSalesOrders: null,
      },
      order,
    );
    expect(next.usystemsSalesOrders.map((e) => e.code)).toEqual(['SO-old', 'SO-118']);
  });

  it('starts a history from nothing', () => {
    expect(withIssuedOrder(null, order).usystemsSalesOrders.map((e) => e.code)).toEqual(['SO-118']);
  });
});
