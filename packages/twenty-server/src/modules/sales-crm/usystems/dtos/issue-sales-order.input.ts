import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * What the seller sends to issue an order. Lines are description-only on
 * purpose: the CRM sells software packages, which are not stock in Usystems,
 * so no catalog item is referenced. Amounts travel as strings to keep their
 * precision; Core validates them.
 */
export class IssueSalesOrderInput {
  @IsInt()
  contactId: number;

  @IsOptional()
  currencyId?: number;

  @IsOptional()
  @IsString()
  documentDate?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  memo?: string;

  @IsArray()
  @ArrayMinSize(1)
  lines: {
    description: string;
    quantity: number | string;
    unitPrice: number | string;
    unit?: string;
  }[];
}

export class RegisterContactInput {
  @IsString()
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  organization?: string;

  @IsOptional()
  @IsString()
  addressLine1?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;
}
