import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class PushSubscriptionKeysInput {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  p256dh: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  auth: string;
}

// The browser's PushSubscription.toJSON() shape, plus the user agent for
// support ("which of my phones is this?").
export class RegisterPushSubscriptionInput {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;

  @ValidateNested()
  @Type(() => PushSubscriptionKeysInput)
  keys: PushSubscriptionKeysInput;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;
}

export class UnregisterPushSubscriptionInput {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2048)
  endpoint: string;
}
