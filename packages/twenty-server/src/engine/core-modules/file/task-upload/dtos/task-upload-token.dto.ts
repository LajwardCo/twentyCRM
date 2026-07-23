import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('TaskUploadToken')
export class TaskUploadTokenDTO {
  // The signed, short-lived, upload-only JWT to embed in the QR code.
  @Field()
  token: string;

  // ISO timestamp at which the token stops working (for the countdown UI).
  @Field()
  expiresAt: string;

  // Human-readable task label to echo back on the public page.
  @Field()
  taskLabel: string;
}
