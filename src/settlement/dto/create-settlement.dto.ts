import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

export class CreateSettlementDto {
  @ApiProperty({
    description: 'GroupMember id of the creditor who receives the money',
    format: 'uuid',
  })
  @IsUUID('4')
  toMemberId: string;

  @ApiProperty({ example: 100000, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiPropertyOptional({ example: 'Trả trước một phần', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}
