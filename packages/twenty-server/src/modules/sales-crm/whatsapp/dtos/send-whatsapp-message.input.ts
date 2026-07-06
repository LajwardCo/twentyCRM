import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class SendWhatsappMessageInput {
  @Field(() => String)
  personId: string;

  @Field(() => String, { nullable: true })
  opportunityId?: string;

  @Field(() => String, { nullable: true })
  text?: string;

  @Field(() => String, { nullable: true })
  templateName?: string;

  @Field(() => String, { nullable: true })
  templateLanguage?: string;

  @Field(() => [String], { nullable: true })
  templateBodyParams?: string[];
}
