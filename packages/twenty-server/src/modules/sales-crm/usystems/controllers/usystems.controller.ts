import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import {
  IssueSalesOrderInput,
  RegisterContactInput,
} from 'src/modules/sales-crm/usystems/dtos/issue-sales-order.input';
import {
  UsystemsApiError,
  UsystemsClientService,
} from 'src/modules/sales-crm/usystems/services/usystems-client.service';

/**
 * Same-origin door from the Sales UI to Usystems Core. The seller is
 * authenticated with their Twenty token; the Usystems API key stays in
 * UsystemsClientService. Every route is a thin pass-through so the Sales UI
 * sees Core's own validation messages.
 */
@Controller('rest/sales/usystems')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class UsystemsController {
  constructor(private readonly usystemsClient: UsystemsClientService) {}

  private async pass<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof UsystemsApiError) {
        throw new HttpException(
          { message: error.message, details: error.details ?? null },
          error.status,
        );
      }
      throw error;
    }
  }

  @Get('status')
  @UseGuards(NoPermissionGuard)
  status() {
    return { configured: this.usystemsClient.isConfigured() };
  }

  @Get('contacts/search')
  @UseGuards(NoPermissionGuard)
  searchContacts(@Query('q') q?: string) {
    return this.pass(() => this.usystemsClient.searchContacts(q ?? ''));
  }

  @Post('contacts')
  @UseGuards(NoPermissionGuard)
  registerContact(@Body() body: RegisterContactInput) {
    return this.pass(() =>
      this.usystemsClient.createContact({
        name: body.name,
        phone: body.phone,
        email: body.email,
        organization: body.organization,
        address_line1: body.addressLine1,
        city: body.city,
        country: body.country,
      }),
    );
  }

  @Get('currencies')
  @UseGuards(NoPermissionGuard)
  listCurrencies() {
    return this.pass(() => this.usystemsClient.listCurrencies());
  }

  @Post('sales-orders')
  @UseGuards(NoPermissionGuard)
  issueSalesOrder(@Body() body: IssueSalesOrderInput) {
    return this.pass(() =>
      this.usystemsClient.issueSalesOrder({
        contact_id: body.contactId,
        currency: body.currencyId,
        document_date: body.documentDate,
        valid_until: body.validUntil,
        memo: body.memo,
        items: body.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          unit_of_measure: line.unit,
        })),
      }),
    );
  }

  @Get('sales-orders/:id')
  @UseGuards(NoPermissionGuard)
  getSalesOrder(@Param('id', ParseIntPipe) id: number) {
    return this.pass(() => this.usystemsClient.getSalesOrder(id));
  }

  @Get('sales-orders/:id/print-document')
  @UseGuards(NoPermissionGuard)
  getPrintDocument(
    @Param('id', ParseIntPipe) id: number,
    @Query('lang') lang?: string,
  ) {
    return this.pass(() => this.usystemsClient.getPrintDocument(id, lang));
  }
}
