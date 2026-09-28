import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { GroupRole, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UploadService } from '../upload/upload.service.js';
import {
  CreateBillDto,
  CreateBillItemDto,
  CreateBillPayerDto,
} from './dto/create-bill.dto.js';
import { UpdateBillDto } from './dto/update-bill.dto.js';

const billDetailSelect = {
  id: true,
  name: true,
  note: true,
  receiptKey: true,
  groupId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      avatarUrl: true,
    },
  },
  payers: {
    orderBy: { id: 'asc' },
    select: {
      id: true,
      memberId: true,
      amount: true,
      member: {
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
    },
  },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      amount: true,
      createdAt: true,
      updatedAt: true,
      shares: {
        orderBy: { id: 'asc' },
        select: {
          id: true,
          memberId: true,
          amount: true,
          member: {
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
        },
      },
    },
  },
} satisfies Prisma.BillSelect;

type BillDetail = Prisma.BillGetPayload<{ select: typeof billDetailSelect }>;
type BillWriteClient = Prisma.TransactionClient;

@Injectable()
export class BillService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
  ) {}

  async createBill(userId: string, groupId: string, dto: CreateBillDto) {
    this.validateFinancialData(dto.items, dto.payers);

    const bill = await this.prisma.$transaction(async (prisma) => {
      await this.requireGroupMembership(prisma, userId, groupId);
      await this.requireReferencedMembers(
        prisma,
        groupId,
        this.getReferencedMemberIds(dto.items, dto.payers),
      );

      return prisma.bill.create({
        data: {
          name: dto.name,
          note: dto.note,
          receiptKey: dto.receiptKey,
          groupId,
          createdById: userId,
          payers: {
            create: this.toPayerCreates(dto.payers),
          },
          items: {
            create: this.toItemCreates(dto.items),
          },
        },
        select: billDetailSelect,
      });
    });

    return this.toResponse(bill);
  }

  async getGroupBills(userId: string, groupId: string) {
    await this.requireGroupMembership(this.prisma, userId, groupId);

    const bills = await this.prisma.bill.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      select: billDetailSelect,
    });

    return bills.map((bill) => this.toResponse(bill));
  }

  async getBillDetail(userId: string, groupId: string, billId: string) {
    const bill = await this.prisma.bill.findFirst({
      where: {
        id: billId,
        groupId,
        group: {
          members: {
            some: { userId },
          },
        },
      },
      select: billDetailSelect,
    });

    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    return this.toResponse(bill);
  }

  async updateBill(
    userId: string,
    groupId: string,
    billId: string,
    dto: UpdateBillDto,
  ) {
    const updatedBill = await this.prisma.$transaction(async (prisma) => {
      const membership = await this.requireGroupMembership(
        prisma,
        userId,
        groupId,
      );
      // Serialize updates per bill. Without this, concurrent PATCH requests
      // (e.g. the split screen saving on every member toggle) interleave
      // delete-then-create and leave duplicate items behind.
      await this.lockBill(prisma, billId);
      const currentBill = await prisma.bill.findFirst({
        where: { id: billId, groupId },
        select: billDetailSelect,
      });

      if (!currentBill) {
        throw new NotFoundException('Bill not found');
      }

      this.requireManagePermission(
        currentBill.createdById,
        userId,
        membership.role,
      );

      const items = dto.items ?? this.itemsFromBill(currentBill);
      const payers = dto.payers ?? this.payersFromBill(currentBill);

      if (dto.items || dto.payers) {
        this.validateFinancialData(items, payers);
        await this.requireReferencedMembers(
          prisma,
          groupId,
          this.getReferencedMemberIds(items, payers),
        );
      }

      if (dto.items) {
        await prisma.billItem.deleteMany({ where: { billId } });
      }

      if (dto.payers) {
        await prisma.billPayer.deleteMany({ where: { billId } });
      }

      return prisma.bill.update({
        where: { id: billId },
        data: {
          name: dto.name,
          note: dto.note,
          receiptKey: dto.receiptKey,
          items: dto.items
            ? { create: this.toItemCreates(dto.items) }
            : undefined,
          payers: dto.payers
            ? { create: this.toPayerCreates(dto.payers) }
            : undefined,
        },
        select: billDetailSelect,
      });
    });

    return this.toResponse(updatedBill);
  }

  async deleteBill(userId: string, groupId: string, billId: string) {
    await this.prisma.$transaction(async (prisma) => {
      const membership = await this.requireGroupMembership(
        prisma,
        userId,
        groupId,
      );
      const bill = await prisma.bill.findFirst({
        where: { id: billId, groupId },
        select: { createdById: true },
      });

      if (!bill) {
        throw new NotFoundException('Bill not found');
      }

      this.requireManagePermission(bill.createdById, userId, membership.role);
      await prisma.bill.delete({ where: { id: billId } });
    });
  }

  private async requireGroupMembership(
    prisma: BillWriteClient,
    userId: string,
    groupId: string,
  ) {
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: { groupId, userId },
      },
      select: { id: true, role: true },
    });

    if (!membership) {
      throw new NotFoundException('Group not found');
    }

    return membership;
  }

  private async lockBill(prisma: BillWriteClient, billId: string) {
    // Row lock held for the rest of the transaction so concurrent writers
    // queue up instead of racing the delete-then-create replace.
    await prisma.$queryRaw`SELECT "id" FROM "bills" WHERE "id" = ${billId} FOR UPDATE`;
  }

  private async requireReferencedMembers(
    prisma: BillWriteClient,
    groupId: string,
    memberIds: string[],
  ) {
    const members = await prisma.groupMember.findMany({
      where: {
        groupId,
        id: { in: memberIds },
      },
      select: { id: true },
    });

    if (members.length !== memberIds.length) {
      throw new BadRequestException(
        'Every payer and share member must belong to the bill group',
      );
    }
  }

  private requireManagePermission(
    createdById: string,
    userId: string,
    role: GroupRole,
  ) {
    const canManage =
      createdById === userId ||
      role === GroupRole.OWNER ||
      role === GroupRole.ADMIN;

    if (!canManage) {
      throw new ForbiddenException(
        'Only the bill creator or a group administrator can modify this bill',
      );
    }
  }

  private validateFinancialData(
    items: CreateBillItemDto[],
    payers: CreateBillPayerDto[],
  ) {
    this.requireUniqueMemberIds(
      payers.map(({ memberId }) => memberId),
      'Each member can only appear once in payers',
    );

    const itemTotal = items.reduce(
      (total, item) => total + BigInt(item.amount),
      0n,
    );
    const payerTotal = payers.reduce(
      (total, payer) => total + BigInt(payer.amount),
      0n,
    );

    if (itemTotal > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new BadRequestException(
        'Total bill amount exceeds JavaScript safe integer range',
      );
    }

    if (itemTotal !== payerTotal) {
      throw new BadRequestException(
        'Total payer amount must equal total bill item amount',
      );
    }

    for (const item of items) {
      this.requireUniqueMemberIds(
        item.shares.map(({ memberId }) => memberId),
        `Each member can only have one share for item "${item.name}"`,
      );

      const shareTotal = item.shares.reduce(
        (total, share) => total + BigInt(share.amount),
        0n,
      );

      if (shareTotal !== BigInt(item.amount)) {
        throw new BadRequestException(
          `Total share amount must equal the amount of item "${item.name}"`,
        );
      }
    }
  }

  private requireUniqueMemberIds(memberIds: string[], message: string) {
    if (new Set(memberIds).size !== memberIds.length) {
      throw new BadRequestException(message);
    }
  }

  private getReferencedMemberIds(
    items: CreateBillItemDto[],
    payers: CreateBillPayerDto[],
  ) {
    return [
      ...new Set([
        ...payers.map(({ memberId }) => memberId),
        ...items.flatMap(({ shares }) =>
          shares.map(({ memberId }) => memberId),
        ),
      ]),
    ];
  }

  private toPayerCreates(payers: CreateBillPayerDto[]) {
    return payers.map(({ memberId, amount }) => ({
      memberId,
      amount: BigInt(amount),
    }));
  }

  private toItemCreates(items: CreateBillItemDto[]) {
    return items.map(({ name, amount, shares }) => ({
      name,
      amount: BigInt(amount),
      shares: {
        create: shares.map(({ memberId, amount: shareAmount }) => ({
          memberId,
          amount: BigInt(shareAmount),
        })),
      },
    }));
  }

  private itemsFromBill(bill: BillDetail): CreateBillItemDto[] {
    return bill.items.map((item) => ({
      name: item.name,
      amount: this.toSafeNumber(item.amount),
      shares: item.shares.map((share) => ({
        memberId: share.memberId,
        amount: this.toSafeNumber(share.amount),
      })),
    }));
  }

  private payersFromBill(bill: BillDetail): CreateBillPayerDto[] {
    return bill.payers.map((payer) => ({
      memberId: payer.memberId,
      amount: this.toSafeNumber(payer.amount),
    }));
  }

  private toResponse(bill: BillDetail) {
    const items = bill.items.map((item) => ({
      ...item,
      amount: this.toSafeNumber(item.amount),
      shares: item.shares.map((share) => ({
        ...share,
        amount: this.toSafeNumber(share.amount),
        member: {
          membershipId: share.member.id,
          role: share.member.role,
          ...share.member.user,
        },
      })),
    }));

    return {
      ...bill,
      receiptUrl: this.uploadService.buildPublicUrl(bill.receiptKey),
      totalAmount: this.toSafeNumber(
        bill.items.reduce((total, item) => total + item.amount, 0n),
      ),
      payers: bill.payers.map((payer) => ({
        ...payer,
        amount: this.toSafeNumber(payer.amount),
        member: {
          membershipId: payer.member.id,
          role: payer.member.role,
          ...payer.member.user,
        },
      })),
      items,
    };
  }

  private toSafeNumber(amount: bigint) {
    const value = Number(amount);

    if (!Number.isSafeInteger(value)) {
      throw new RangeError('Bill amount exceeds JavaScript safe integer range');
    }

    return value;
  }
}
