import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class SendWhatsappMessageOutputDTO {
  @Field(() => Boolean)
  success: boolean;

  @Field(() => String, { nullable: true })
  waMessageId?: string | null;

  @Field(() => String, { nullable: true })
  error?: string | null;
}
