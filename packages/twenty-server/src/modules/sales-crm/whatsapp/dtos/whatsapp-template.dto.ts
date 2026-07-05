import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class WhatsappTemplateDTO {
  @Field(() => String)
  name: string;

  @Field(() => String)
  language: string;

  @Field(() => String)
  status: string;

  @Field(() => String)
  bodyText: string;

  @Field(() => Int)
  variableCount: number;
}
