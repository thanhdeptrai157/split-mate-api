import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Prisma mặc định đóng transaction sau 5s (timeout) và chỉ chờ tối đa 2s để lấy
 * connection (maxWait). Với server yếu / DB chậm, các transaction ghi bill có thể
 * vượt 5s và trả lỗi 500. Nâng mặc định lên và cho phép ghi đè bằng biến môi trường:
 *   PRISMA_TRANSACTION_TIMEOUT_MS  (mặc định 20000)
 *   PRISMA_TRANSACTION_MAX_WAIT_MS (mặc định 10000)
 */
const DEFAULT_TRANSACTION_TIMEOUT_MS = 20_000;
const DEFAULT_TRANSACTION_MAX_WAIT_MS = 10_000;

function readPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.getOrThrow<string>('DATABASE_URL'),
    });

    super({
      adapter,
      transactionOptions: {
        timeout: readPositiveInt(
          configService.get<string>('PRISMA_TRANSACTION_TIMEOUT_MS'),
          DEFAULT_TRANSACTION_TIMEOUT_MS,
        ),
        maxWait: readPositiveInt(
          configService.get<string>('PRISMA_TRANSACTION_MAX_WAIT_MS'),
          DEFAULT_TRANSACTION_MAX_WAIT_MS,
        ),
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
