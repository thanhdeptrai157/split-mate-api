import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { IsOptional, IsUUID } from 'class-validator';

export class QueryBillDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by bill type' })
  @IsOptional()
  @IsUUID()
  createdById?: string;
}



