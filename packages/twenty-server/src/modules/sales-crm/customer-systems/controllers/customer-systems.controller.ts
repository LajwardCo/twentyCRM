import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseFilters,
  UseGuards,
} from '@nestjs/common';

import { RestApiExceptionFilter } from 'src/engine/api/rest/rest-api-exception.filter';
import { AuthUser } from 'src/engine/decorators/auth/auth-user.decorator';
import { JwtAuthGuard } from 'src/engine/guards/jwt-auth.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { CustomerSystemsService } from 'src/modules/sales-crm/customer-systems/services/customer-systems.service';

// Minimal shape of the authenticated user we read for stamping the creating agent.
type AuthUserLike = { email?: string; firstName?: string; lastName?: string };

function agentIdentity(user: AuthUserLike): { agent_email: string; agent_name: string } {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return { agent_email: (user.email ?? '').toLowerCase(), agent_name: name };
}

/**
 * Proxies the sales app's real customer-system requests to the Usystems Core
 * partner API, so the Core API key stays on the server. Any authenticated sales
 * user may issue and view systems; there is no elevated CRM permission for this
 * internal tooling, hence NoPermissionGuard.
 */
@Controller('rest/sales/customer-systems')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class CustomerSystemsController {
  constructor(private readonly customerSystemsService: CustomerSystemsService) {}

  @Post('check-subdomain')
  @UseGuards(NoPermissionGuard)
  async checkSubdomain(@Body('subdomain') subdomain: string) {
    return this.customerSystemsService.checkSubdomain((subdomain ?? '').toString());
  }

  @Post()
  @UseGuards(NoPermissionGuard)
  async create(@AuthUser() user: AuthUserLike, @Body() body: Record<string, unknown>) {
    // Stamp the creating agent from the authenticated session, never trusting a
    // client-supplied identity.
    const payload = { ...body, ...agentIdentity(user) };
    return this.customerSystemsService.createSystem(payload);
  }

  @Get()
  @UseGuards(NoPermissionGuard)
  async list(
    @AuthUser() user: AuthUserLike,
    @Query('scope') scope?: string,
    @Query('status') status?: string,
    @Query('crm_lead_id') crmLeadId?: string,
  ) {
    // Agents see their own systems by default; scope=all lists every system.
    const agentEmail = scope === 'all' ? undefined : (user.email ?? '').toLowerCase();
    return this.customerSystemsService.listSystems({ agentEmail, status, crmLeadId });
  }

  @Get(':id')
  @UseGuards(NoPermissionGuard)
  async status(@Param('id') id: string) {
    return this.customerSystemsService.getSystem(id);
  }

  @Get(':id/details')
  @UseGuards(NoPermissionGuard)
  async details(@Param('id') id: string) {
    return this.customerSystemsService.getSystemDetails(id);
  }

  @Post(':id/regenerate-credentials')
  @UseGuards(NoPermissionGuard)
  async regenerate(@Param('id') id: string) {
    return this.customerSystemsService.regenerateCredentials(id);
  }
}
