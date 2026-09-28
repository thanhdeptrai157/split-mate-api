import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { GroupRole, SettlementStatus } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { SettlementService } from './settlement.service.js';

describe('SettlementService', () => {
  const createdAt = new Date('2026-09-28T00:00:00.000Z');
  const updatedAt = new Date('2026-09-28T01:00:00.000Z');
  const creditorMembership = { id: 'creditor-membership-id', role: GroupRole.MEMBER };
  const ownerMembership = { id: 'owner-membership-id', role: GroupRole.OWNER };
  const creditorUser = {
    id: 'creditor-user-id',
    name: 'Creditor',
    email: 'creditor@example.com',
    avatarUrl: null,
  };
  const ownerUser = {
    id: 'owner-user-id',
    name: 'Owner',
    email: 'owner@example.com',
    avatarUrl: null,
  };
  const settlement = {
    id: 'settlement-id',
    groupId: 'group-id',
    amount: 100000n,
    note: null as string | null,
    status: SettlementStatus.PENDING,
    confirmedAt: null as Date | null,
    createdAt,
    updatedAt,
    fromMember: { id: ownerMembership.id, role: GroupRole.OWNER, user: ownerUser },
    toMember: { id: creditorMembership.id, role: GroupRole.MEMBER, user: creditorUser },
  };

  let transaction: ReturnType<typeof vi.fn>;
  let groupMemberFindUnique: ReturnType<typeof vi.fn>;
  let groupMemberFindFirst: ReturnType<typeof vi.fn>;
  let settlementCreate: ReturnType<typeof vi.fn>;
  let settlementFindFirst: ReturnType<typeof vi.fn>;
  let settlementFindMany: ReturnType<typeof vi.fn>;
  let settlementUpdateMany: ReturnType<typeof vi.fn>;
  let settlementFindUniqueOrThrow: ReturnType<typeof vi.fn>;
  let settlementDelete: ReturnType<typeof vi.fn>;
  let service: SettlementService;

  beforeEach(() => {
    groupMemberFindUnique = vi.fn().mockResolvedValue(ownerMembership);
    groupMemberFindFirst = vi.fn().mockResolvedValue({ id: creditorMembership.id });
    settlementCreate = vi.fn().mockResolvedValue(settlement);
    settlementFindFirst = vi.fn();
    settlementFindMany = vi.fn();
    settlementUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    settlementFindUniqueOrThrow = vi.fn().mockResolvedValue(settlement);
    settlementDelete = vi.fn();

    const transactionClient = {
      groupMember: {
        findUnique: groupMemberFindUnique,
        findFirst: groupMemberFindFirst,
      },
      settlement: {
        create: settlementCreate,
        findFirst: settlementFindFirst,
        findMany: settlementFindMany,
        updateMany: settlementUpdateMany,
        findUniqueOrThrow: settlementFindUniqueOrThrow,
        delete: settlementDelete,
      },
    };

    transaction = vi.fn((callback) => callback(transactionClient));

    const prisma = {
      $transaction: transaction,
      groupMember: {
        findUnique: groupMemberFindUnique,
        findFirst: groupMemberFindFirst,
      },
      settlement: {
        findMany: settlementFindMany,
      },
    } as unknown as PrismaService;

    service = new SettlementService(prisma);
  });

  it('records a repayment from the current user to the receiver', async () => {
    await expect(
      service.createSettlement('owner-user-id', 'group-id', {
        toMemberId: creditorMembership.id,
        amount: 100000,
      }),
    ).resolves.toMatchObject({
      id: settlement.id,
      amount: 100000,
      status: SettlementStatus.PENDING,
      fromMember: { membershipId: ownerMembership.id, id: ownerUser.id },
      toMember: { membershipId: creditorMembership.id, id: creditorUser.id },
    });

    expect(settlementCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          amount: 100000n,
          note: undefined,
          groupId: 'group-id',
          fromMemberId: ownerMembership.id,
          toMemberId: creditorMembership.id,
        },
      }),
    );
  });

  it('rejects settling with yourself', async () => {
    await expect(
      service.createSettlement('owner-user-id', 'group-id', {
        toMemberId: ownerMembership.id,
        amount: 100000,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(settlementCreate).not.toHaveBeenCalled();
  });

  it('rejects a receiver outside the group', async () => {
    groupMemberFindFirst.mockResolvedValue(null);

    await expect(
      service.createSettlement('owner-user-id', 'group-id', {
        toMemberId: 'stranger-membership-id',
        amount: 100000,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(settlementCreate).not.toHaveBeenCalled();
  });

  it('requires the receiver to confirm a settlement', async () => {
    settlementFindFirst.mockResolvedValue({
      id: settlement.id,
      toMemberId: creditorMembership.id,
      status: SettlementStatus.PENDING,
    });

    await expect(
      service.confirmSettlement('owner-user-id', 'group-id', settlement.id),
    ).rejects.toThrow(ForbiddenException);
    expect(settlementUpdateMany).not.toHaveBeenCalled();
  });

  it('confirms a pending settlement for the receiver', async () => {
    groupMemberFindUnique.mockResolvedValue(creditorMembership);
    settlementFindFirst.mockResolvedValue({
      id: settlement.id,
      toMemberId: creditorMembership.id,
      status: SettlementStatus.PENDING,
    });
    settlementFindUniqueOrThrow.mockResolvedValue({
      ...settlement,
      status: SettlementStatus.CONFIRMED,
      confirmedAt: createdAt,
    });

    await expect(
      service.confirmSettlement('creditor-user-id', 'group-id', settlement.id),
    ).resolves.toMatchObject({ status: SettlementStatus.CONFIRMED });

    expect(settlementUpdateMany).toHaveBeenCalledWith({
      where: { id: settlement.id, status: SettlementStatus.PENDING },
      data: { status: SettlementStatus.CONFIRMED, confirmedAt: expect.any(Date) },
    });
  });

  it('refuses to confirm an already settled settlement', async () => {
    groupMemberFindUnique.mockResolvedValue(creditorMembership);
    settlementFindFirst.mockResolvedValue({
      id: settlement.id,
      toMemberId: creditorMembership.id,
      status: SettlementStatus.REJECTED,
    });

    await expect(
      service.confirmSettlement('creditor-user-id', 'group-id', settlement.id),
    ).rejects.toThrow(ConflictException);
  });

  it('refuses to delete a confirmed settlement', async () => {
    settlementFindFirst.mockResolvedValue({
      fromMemberId: ownerMembership.id,
      status: SettlementStatus.CONFIRMED,
    });

    await expect(
      service.deleteSettlement('owner-user-id', 'group-id', settlement.id),
    ).rejects.toThrow(ConflictException);
    expect(settlementDelete).not.toHaveBeenCalled();
  });

  it('does not let a regular member delete someone else settlement', async () => {
    groupMemberFindUnique.mockResolvedValue({
      id: 'other-membership-id',
      role: GroupRole.MEMBER,
    });
    settlementFindFirst.mockResolvedValue({
      fromMemberId: ownerMembership.id,
      status: SettlementStatus.PENDING,
    });

    await expect(
      service.deleteSettlement('other-user-id', 'group-id', settlement.id),
    ).rejects.toThrow(ForbiddenException);
    expect(settlementDelete).not.toHaveBeenCalled();
  });

  it('hides settlements from users outside the group', async () => {
    groupMemberFindUnique.mockResolvedValue(null);

    await expect(
      service.getGroupSettlements('stranger-id', 'group-id'),
    ).rejects.toThrow(NotFoundException);
  });
});
