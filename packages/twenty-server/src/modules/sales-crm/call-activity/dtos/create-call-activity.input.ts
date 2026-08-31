import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_CALL_SECONDS = 60 * 60 * 12;

export class CreateCallActivityInput {
  /** Stable per-device id for this call; the idempotency key. */
  @IsString()
  @MaxLength(128)
  deviceCallId: string;

  @IsIn(['INBOUND', 'OUTBOUND', 'MISSED'])
  direction: 'INBOUND' | 'OUTBOUND' | 'MISSED';

  @IsIn(['PHONE', 'WHATSAPP', 'TELEGRAM'])
  channel: 'PHONE' | 'WHATSAPP' | 'TELEGRAM';

  /** Absent for WhatsApp/Telegram calls, which carry no number. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;

  @IsISO8601()
  startedAt: string;

  @IsInt()
  @Min(0)
  @Max(MAX_CALL_SECONDS)
  durationSeconds: number;

  @IsIn(['CALL_LOG', 'ESTIMATED', 'MANUAL'])
  durationSource: 'CALL_LOG' | 'ESTIMATED' | 'MANUAL';
}
