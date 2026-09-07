import { Logger, UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { Args, Mutation, Query } from '@nestjs/graphql';

import { MetadataResolver } from 'src/engine/api/graphql/graphql-config/decorators/metadata-resolver.decorator';
import { AuthGraphqlApiExceptionFilter } from 'src/engine/core-modules/auth/filters/auth-graphql-api-exception.filter';
import { ResolverValidationPipe } from 'src/engine/core-modules/graphql/pipes/resolver-validation.pipe';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { AuthWorkspace } from 'src/engine/decorators/auth/auth-workspace.decorator';
import { CustomPermissionGuard } from 'src/engine/guards/custom-permission.guard';
import { NoPermissionGuard } from 'src/engine/guards/no-permission.guard';
import { WorkspaceAuthGuard } from 'src/engine/guards/workspace-auth.guard';
import { SendWhatsappMessageOutputDTO } from 'src/modules/sales-crm/whatsapp/dtos/send-whatsapp-message-output.dto';
import { SendWhatsappMessageInput } from 'src/modules/sales-crm/whatsapp/dtos/send-whatsapp-message.input';
import { WhatsappTemplateDTO } from 'src/modules/sales-crm/whatsapp/dtos/whatsapp-template.dto';
import { WhatsappCloudApiClientService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-cloud-api-client.service';
import { WhatsappSendMessageService } from 'src/modules/sales-crm/whatsapp/services/whatsapp-send-message.service';

@MetadataResolver()
@UsePipes(ResolverValidationPipe)
@UseFilters(AuthGraphqlApiExceptionFilter)
@UseGuards(WorkspaceAuthGuard)
export class WhatsappResolver {
  private readonly logger = new Logger(WhatsappResolver.name);

  constructor(
    private readonly whatsappSendMessageService: WhatsappSendMessageService,
    private readonly whatsappCloudApiClientService: WhatsappCloudApiClientService,
  ) {}

  // Sends only ever go out for the caller's own workspace -- the id comes from
  // the token, never the input -- so that scoping is the check.
  @Mutation(() => SendWhatsappMessageOutputDTO)
  @UseGuards(CustomPermissionGuard)
  async sendWhatsappMessage(
    @Args('input') input: SendWhatsappMessageInput,
    @AuthWorkspace() workspace: WorkspaceEntity,
  ): Promise<SendWhatsappMessageOutputDTO> {
    const hasTemplate = Boolean(input.templateName);
    const hasText = Boolean(input.text);

    if (hasTemplate === hasText) {
      return {
        success: false,
        error: 'Provide exactly one of templateName or text',
      };
    }

    try {
      return await this.whatsappSendMessageService.send({
        workspaceId: workspace.id,
        ...input,
      });
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message: ${error}`);

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to send WhatsApp message',
      };
    }
  }

  // Reads the server's own Cloud API template list, which carries no workspace
  // data; any signed-in member may list it.
  @Query(() => [WhatsappTemplateDTO])
  @UseGuards(NoPermissionGuard)
  async whatsappTemplates(): Promise<WhatsappTemplateDTO[]> {
    return this.whatsappCloudApiClientService.listTemplates();
  }
}
