import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import type { AccessTokenPayload } from '../auth/strategies/access-token.strategy.js';
import {
  BILL_IMPORT_TEMPLATE_FILE_NAME,
  BillImportService,
} from './bill-import.service.js';
import { BillService } from './bill.service.js';
import { CreateBillDto } from './dto/create-bill.dto.js';
import { UpdateBillDto } from './dto/update-bill.dto.js';

const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Controller('group/:groupId/bills')
@UseGuards(AccessTokenGuard)
@ApiTags('bills')
@ApiBearerAuth()
@ApiParam({ name: 'groupId', format: 'uuid' })
export class BillController {
  constructor(
    private readonly billService: BillService,
    private readonly billImportService: BillImportService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a bill in a group' })
  createBill(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Body() dto: CreateBillDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.billService.createBill(user.sub, groupId, dto);
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Import bill items from an Excel file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_SIZE } }),
  )
  importBill(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException('Excel file is required');
    }

    return this.billImportService.parse(file.originalname, file.buffer);
  }

  @Get()
  @ApiOperation({ summary: 'Get all bills in a group' })
  getGroupBills(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.billService.getGroupBills(user.sub, groupId);
  }

  @Get('import/template')
  @ApiOperation({ summary: 'Download the Excel template for importing bills' })
  @ApiProduces(XLSX_CONTENT_TYPE)
  async downloadImportTemplate(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) _groupId: string,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.billImportService.buildTemplate();

    response.set({
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${BILL_IMPORT_TEMPLATE_FILE_NAME}"`,
      'Content-Length': file.length.toString(),
    });
    response.end(file);
  }

  @Get(':billId')
  @ApiOperation({ summary: 'Get bill details' })
  @ApiParam({ name: 'billId', format: 'uuid' })
  getBillDetail(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('billId', new ParseUUIDPipe({ version: '4' })) billId: string,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.billService.getBillDetail(user.sub, groupId, billId);
  }

  @Patch(':billId')
  @ApiOperation({ summary: 'Update a bill' })
  @ApiParam({ name: 'billId', format: 'uuid' })
  updateBill(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('billId', new ParseUUIDPipe({ version: '4' })) billId: string,
    @Body() dto: UpdateBillDto,
    @CurrentUser() user: AccessTokenPayload,
  ) {
    return this.billService.updateBill(user.sub, groupId, billId, dto);
  }

  @Delete(':billId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a bill' })
  @ApiParam({ name: 'billId', format: 'uuid' })
  @ApiNoContentResponse()
  async deleteBill(
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Param('billId', new ParseUUIDPipe({ version: '4' })) billId: string,
    @CurrentUser() user: AccessTokenPayload,
  ): Promise<void> {
    await this.billService.deleteBill(user.sub, groupId, billId);
  }
}
