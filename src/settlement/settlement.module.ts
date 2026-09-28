import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { SettlementController } from './settlement.controller.js';
import { SettlementService } from './settlement.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SettlementController],
  providers: [SettlementService],
  exports: [SettlementService],
})
export class SettlementModule {}
