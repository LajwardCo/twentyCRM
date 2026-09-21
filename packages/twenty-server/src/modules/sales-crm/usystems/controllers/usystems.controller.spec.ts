import { HttpException } from '@nestjs/common';

import { UsystemsController } from 'src/modules/sales-crm/usystems/controllers/usystems.controller';
import {
  UsystemsApiError,
  type UsystemsClientService,
} from 'src/modules/sales-crm/usystems/services/usystems-client.service';

describe('UsystemsController', () => {
  const issueSalesOrder = jest.fn();
  const controller = new UsystemsController({
    issueSalesOrder,
  } as unknown as UsystemsClientService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps the Sales UI line shape onto the Developer API item, details included', async () => {
    issueSalesOrder.mockResolvedValue({ sales_order: { code: 'SO-1' } });

    await controller.issueSalesOrder({
      contactId: 7,
      currencyId: 2,
      documentDate: '2026-09-10',
      validUntil: '2026-10-10',
      memo: 'm',
      lines: [
        {
          description: 'Package',
          quantity: 1,
          unitPrice: '10',
          unit: 'license',
          details: 'کاربر × ۵',
        },
        { description: 'Bare', quantity: 2, unitPrice: 3 },
      ],
    });

    expect(issueSalesOrder).toHaveBeenCalledWith({
      contact_id: 7,
      currency: 2,
      document_date: '2026-09-10',
      valid_until: '2026-10-10',
      memo: 'm',
      items: [
        {
          description: 'Package',
          quantity: 1,
          unit_price: '10',
          unit_of_measure: 'license',
          details: 'کاربر × ۵',
        },
        {
          description: 'Bare',
          quantity: 2,
          unit_price: 3,
          unit_of_measure: undefined,
        },
      ],
    });
  });

  it("turns Core's validation error into an HttpException with its status", async () => {
    issueSalesOrder.mockRejectedValue(
      new UsystemsApiError('bad', 400, { items: ['required'] }),
    );

    await expect(
      controller.issueSalesOrder({
        contactId: 1,
        lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      }),
    ).rejects.toMatchObject(
      new HttpException(
        { message: 'bad', details: { items: ['required'] } },
        400,
      ),
    );
  });
});
