import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { UploadModule } from '../upload/upload.module.js';
import { BillImportService } from './bill-import.service.js';
import { BillController } from './bill.controller.js';
import { BillService } from './bill.service.js';

@Module({
  imports: [AuthModule, PrismaModule, UploadModule],
  controllers: [BillController],
  providers: [BillService, BillImportService],
  exports: [BillService],
})
export class BillModule {}
