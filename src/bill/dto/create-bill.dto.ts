import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

export class CreateBillShareDto {
  @ApiProperty({
    description: 'GroupMember id of the member who owes this share',
    format: 'uuid',
  })
  @IsUUID('4')
  memberId: string;

  @ApiProperty({ example: 75000, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;
}

export class CreateBillItemDto {
  @ApiProperty({ example: 'Pizza', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ example: 150000, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;

  @ApiProperty({ type: [CreateBillShareDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((share: CreateBillShareDto) => share.memberId, {
    message: 'Each member can only have one share per item',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateBillShareDto)
  shares: CreateBillShareDto[];
}

export class CreateBillPayerDto {
  @ApiProperty({
    description: 'GroupMember id of the member who paid',
    format: 'uuid',
  })
  @IsUUID('4')
  memberId: string;

  @ApiProperty({ example: 150000, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(MAX_AMOUNT)
  amount: number;
}

export class CreateBillDto {
  @ApiProperty({ example: 'Friday dinner', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ example: 'Dinner after work', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @ApiPropertyOptional({
    example: 'bills/16fd2706-8baf-433b-82eb-8c7fada847da/2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e.jpg',
    description: 'Object key returned by POST /uploads/presign',
    maxLength: 1024,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  receiptKey?: string | null;

  @ApiPropertyOptional({
    description:
      'Thời điểm hoá đơn thực tế (ISO 8601). Cho phép ngày quá khứ, không cho ngày tương lai.',
    example: '2026-09-20T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiProperty({ type: [CreateBillPayerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((payer: CreateBillPayerDto) => payer.memberId, {
    message: 'Each member can only appear once in payers',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateBillPayerDto)
  payers: CreateBillPayerDto[];

  @ApiProperty({ type: [CreateBillItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateBillItemDto)
  items: CreateBillItemDto[];
}
