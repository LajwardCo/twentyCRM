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
import { DemoSystemsService } from 'src/modules/sales-crm/demo-systems/services/demo-systems.service';

// Minimal shape of the authenticated user we read for stamping the creating agent.
type AuthUserLike = { email?: string; firstName?: string; lastName?: string };

function agentIdentity(user: AuthUserLike): { agent_email: string; agent_name: string } {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return { agent_email: (user.email ?? '').toLowerCase(), agent_name: name };
}

/**
 * Proxies the sales app's demo-workspace requests to the Usystems Core partner
 * API, so the Core API key stays on the server. Any authenticated sales user may
 * create and view demos; there is no elevated CRM permission for this internal
 * tooling, hence NoPermissionGuard.
 */
@Controller('rest/sales/demo-systems')
@UseGuards(JwtAuthGuard, WorkspaceAuthGuard)
@UseFilters(RestApiExceptionFilter)
export class DemoSystemsController {
  constructor(private readonly demoSystemsService: DemoSystemsService) {}

  @Post('check-subdomain')
  @UseGuards(NoPermissionGuard)
  async checkSubdomain(@Body('subdomain') subdomain: string) {
    return this.demoSystemsService.checkSubdomain((subdomain ?? '').toString());
  }

  @Post()
  @UseGuards(NoPermissionGuard)
  async create(@AuthUser() user: AuthUserLike, @Body() body: Record<string, unknown>) {
    // Stamp the creating agent from the authenticated session, never trusting a
    // client-supplied identity.
    const payload = { ...body, ...agentIdentity(user) };
    return this.demoSystemsService.createDemo(payload);
  }

  @Get()
  @UseGuards(NoPermissionGuard)
  async list(@AuthUser() user: AuthUserLike, @Query('scope') scope?: string, @Query('status') status?: string) {
    // Agents see their own demos by default; scope=all lists every demo.
    const agentEmail = scope === 'all' ? undefined : (user.email ?? '').toLowerCase();
    return this.demoSystemsService.listDemos({ agentEmail, status });
  }

  @Get(':id')
  @UseGuards(NoPermissionGuard)
  async status(@Param('id') id: string) {
    return this.demoSystemsService.getDemo(id);
  }

  @Get(':id/details')
  @UseGuards(NoPermissionGuard)
  async details(@Param('id') id: string) {
    return this.demoSystemsService.getDemoDetails(id);
  }

  @Post(':id/regenerate-credentials')
  @UseGuards(NoPermissionGuard)
  async regenerate(@Param('id') id: string) {
    return this.demoSystemsService.regenerateCredentials(id);
  }

  @Post(':id/stop')
  @UseGuards(NoPermissionGuard)
  async stop(@Param('id') id: string) {
    return this.demoSystemsService.stopDemo(id);
  }

  @Post(':id/remove')
  @UseGuards(NoPermissionGuard)
  async remove(@Param('id') id: string) {
    return this.demoSystemsService.removeDemo(id);
  }
}
