import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { GroupController } from './group.controller.js';
import { GroupService } from './group.service.js';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [GroupController],
  providers: [GroupService],
})
export class GroupModule {}
