import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  GroupRole,
  Prisma,
  SettlementStatus,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateSettlementDto } from './dto/create-settlement.dto.js';

const settlementSelect = {
  id: true,
  amount: true,
  note: true,
  status: true,
  confirmedAt: true,
  createdAt: true,
  updatedAt: true,
  groupId: true,
  fromMember: {
    select: {
      id: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  },
  toMember: {
    select: {
      id: true,
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
  },
} satisfies Prisma.SettlementSelect;

type SettlementDetail = Prisma.SettlementGetPayload<{
  select: typeof settlementSelect;
}>;
type SettlementWriteClient = Prisma.TransactionClient;

@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  async createSettlement(
    userId: string,
    groupId: string,
    dto: CreateSettlementDto,
  ) {
    const settlement = await this.prisma.$transaction(async (prisma) => {
      const membership = await this.requireGroupMembership(
        prisma,
        userId,
        groupId,
      );

      if (dto.toMemberId === membership.id) {
        throw new BadRequestException('You cannot settle with yourself');
      }

      await this.requireReferencedMember(prisma, groupId, dto.toMemberId);

      return prisma.settlement.create({
        data: {
          amount: BigInt(dto.amount),
          note: dto.note,
          groupId,
          fromMemberId: membership.id,
          toMemberId: dto.toMemberId,
        },
        select: settlementSelect,
      });
    });

    return this.toResponse(settlement);
  }

  async getGroupSettlements(userId: string, groupId: string) {
    await this.requireGroupMembership(this.prisma, userId, groupId);

    const settlements = await this.prisma.settlement.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      select: settlementSelect,
    });

    return settlements.map((settlement) => this.toResponse(settlement));
  }

  async confirmSettlement(
    userId: string,
    groupId: string,
    settlementId: string,
  ) {
    return this.updateStatus(
      userId,
      groupId,
      settlementId,
      SettlementStatus.CONFIRMED,
    );
  }

  async rejectSettlement(
    userId: string,
    groupId: string,
    settlementId: string,
  ) {
    return this.updateStatus(
      userId,
      groupId,
      settlementId,
      SettlementStatus.REJECTED,
    );
  }

  async deleteSettlement(
    userId: string,
    groupId: string,
    settlementId: string,
  ) {
    await this.prisma.$transaction(async (prisma) => {
      const membership = await this.requireGroupMembership(
        prisma,
        userId,
        groupId,
      );
      const settlement = await prisma.settlement.findFirst({
        where: { id: settlementId, groupId },
        select: { fromMemberId: true, status: true },
      });

      if (!settlement) {
        throw new NotFoundException('Settlement not found');
      }

      const canDelete =
        settlement.fromMemberId === membership.id ||
        membership.role === GroupRole.OWNER ||
        membership.role === GroupRole.ADMIN;

      if (!canDelete) {
        throw new ForbiddenException(
          'Only the payer or a group administrator can delete this settlement',
        );
      }

      if (settlement.status === SettlementStatus.CONFIRMED) {
        throw new ConflictException(
          'Confirmed settlements cannot be deleted',
        );
      }

      await prisma.settlement.delete({ where: { id: settlementId } });
    });
  }

  private async updateStatus(
    userId: string,
    groupId: string,
    settlementId: string,
    status: typeof SettlementStatus.CONFIRMED | typeof SettlementStatus.REJECTED,
  ) {
    const updated = await this.prisma.$transaction(async (prisma) => {
      const membership = await this.requireGroupMembership(
        prisma,
        userId,
        groupId,
      );
      const settlement = await prisma.settlement.findFirst({
        where: { id: settlementId, groupId },
        select: { id: true, toMemberId: true, status: true },
      });

      if (!settlement) {
        throw new NotFoundException('Settlement not found');
      }

      if (settlement.toMemberId !== membership.id) {
        throw new ForbiddenException(
          'Only the receiver can confirm or reject this settlement',
        );
      }

      if (settlement.status !== SettlementStatus.PENDING) {
        throw new ConflictException(
          'Only pending settlements can be updated',
        );
      }

      // Cập nhật có điều kiện để hai request đồng thời không ghi đè nhau.
      const result = await prisma.settlement.updateMany({
        where: { id: settlementId, status: SettlementStatus.PENDING },
        data: {
          status,
          confirmedAt:
            status === SettlementStatus.CONFIRMED ? new Date() : null,
        },
      });

      if (result.count === 0) {
        throw new ConflictException(
          'Only pending settlements can be updated',
        );
      }

      return prisma.settlement.findUniqueOrThrow({
        where: { id: settlementId },
        select: settlementSelect,
      });
    });

    return this.toResponse(updated);
  }

  private async requireGroupMembership(
    prisma: SettlementWriteClient,
    userId: string,
    groupId: string,
  ) {
    const membership = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      select: { id: true, role: true },
    });

    if (!membership) {
      throw new NotFoundException('Group not found');
    }

    return membership;
  }

  private async requireReferencedMember(
    prisma: SettlementWriteClient,
    groupId: string,
    memberId: string,
  ) {
    const member = await prisma.groupMember.findFirst({
      where: { id: memberId, groupId },
      select: { id: true },
    });

    if (!member) {
      throw new BadRequestException(
        'The receiver must belong to the settlement group',
      );
    }
  }

  private toResponse(settlement: SettlementDetail) {
    return {
      id: settlement.id,
      groupId: settlement.groupId,
      amount: this.toSafeNumber(settlement.amount),
      note: settlement.note,
      status: settlement.status,
      confirmedAt: settlement.confirmedAt,
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      fromMember: this.toMember(settlement.fromMember),
      toMember: this.toMember(settlement.toMember),
    };
  }

  private toMember(member: SettlementDetail['fromMember']) {
    return {
      membershipId: member.id,
      role: member.role,
      ...member.user,
    };
  }

  private toSafeNumber(amount: bigint) {
    const value = Number(amount);

    if (!Number.isSafeInteger(value)) {
      throw new RangeError(
        'Settlement amount exceeds JavaScript safe integer range',
      );
    }

    return value;
  }
}
