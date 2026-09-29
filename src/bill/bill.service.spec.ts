import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { GroupRole } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { UploadService } from '../upload/upload.service.js';
import { BillService } from './bill.service.js';
import type { CreateBillDto } from './dto/create-bill.dto.js';

describe('BillService', () => {
  const createdAt = new Date('2026-09-27T00:00:00.000Z');
  const updatedAt = new Date('2026-09-27T01:00:00.000Z');
  const ownerMembership = {
    id: 'owner-membership-id',
    role: GroupRole.OWNER,
  };
  const member = {
    id: 'member-id',
    role: GroupRole.MEMBER,
    user: {
      id: 'member-user-id',
      name: 'Member',
      email: 'member@example.com',
      avatarUrl: null,
    },
  };
  const bill = {
    id: 'bill-id',
    name: 'Dinner',
    note: null,
    receiptKey: null,
    groupId: 'group-id',
    createdById: 'owner-user-id',
    occurredAt: createdAt,
    createdAt,
    updatedAt,
    createdBy: {
      id: 'owner-user-id',
      name: 'Owner',
      avatarUrl: null,
    },
    payers: [
      {
        id: 'payer-id',
        memberId: member.id,
        amount: 150000n,
        member,
      },
    ],
    items: [
      {
        id: 'item-id',
        name: 'Pizza',
        amount: 150000n,
        createdAt,
        updatedAt,
        shares: [
          {
            id: 'share-id',
            memberId: member.id,
            amount: 150000n,
            member,
          },
        ],
      },
    ],
  };
  const dto: CreateBillDto = {
    name: 'Dinner',
    payers: [{ memberId: member.id, amount: 150000 }],
    items: [
      {
        name: 'Pizza',
        amount: 150000,
        shares: [{ memberId: member.id, amount: 150000 }],
      },
    ],
  };

  let transaction: ReturnType<typeof vi.fn>;
  let transactionQueryRaw: ReturnType<typeof vi.fn>;
  let groupMemberFindUnique: ReturnType<typeof vi.fn>;
  let groupMemberFindMany: ReturnType<typeof vi.fn>;
  let billCreate: ReturnType<typeof vi.fn>;
  let billFindFirst: ReturnType<typeof vi.fn>;
  let billFindMany: ReturnType<typeof vi.fn>;
  let billUpdate: ReturnType<typeof vi.fn>;
  let billDelete: ReturnType<typeof vi.fn>;
  let billItemDeleteMany: ReturnType<typeof vi.fn>;
  let billPayerDeleteMany: ReturnType<typeof vi.fn>;
  let service: BillService;

  beforeEach(() => {
    transactionQueryRaw = vi.fn();
    groupMemberFindUnique = vi.fn().mockResolvedValue(ownerMembership);
    groupMemberFindMany = vi.fn().mockResolvedValue([{ id: member.id }]);
    billCreate = vi.fn().mockResolvedValue(bill);
    billFindFirst = vi.fn();
    billFindMany = vi.fn();
    billUpdate = vi.fn();
    billDelete = vi.fn();
    billItemDeleteMany = vi.fn();
    billPayerDeleteMany = vi.fn();

    const transactionClient = {
      $queryRaw: transactionQueryRaw,
      groupMember: {
        findUnique: groupMemberFindUnique,
        findMany: groupMemberFindMany,
      },
      bill: {
        create: billCreate,
        findFirst: billFindFirst,
        update: billUpdate,
        delete: billDelete,
      },
      billItem: { deleteMany: billItemDeleteMany },
      billPayer: { deleteMany: billPayerDeleteMany },
    };

    transaction = vi.fn((callback) => callback(transactionClient));

    const prisma = {
      $transaction: transaction,
      groupMember: {
        findUnique: groupMemberFindUnique,
        findMany: groupMemberFindMany,
      },
      bill: {
        findFirst: billFindFirst,
        findMany: billFindMany,
      },
    } as unknown as PrismaService;

    service = new BillService(prisma, {
      buildPublicUrl: (key: string | null | undefined) =>
        key ? `https://cdn.test/${key}` : null,
    } as unknown as UploadService);
  });

  it('creates all bill relations atomically and serializes BigInt amounts', async () => {
    await expect(
      service.createBill('owner-user-id', 'group-id', dto),
    ).resolves.toMatchObject({
      id: bill.id,
      totalAmount: 150000,
      payers: [{ amount: 150000 }],
      items: [{ amount: 150000, shares: [{ amount: 150000 }] }],
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(billCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          name: dto.name,
          note: undefined,
          receiptKey: undefined,
          groupId: 'group-id',
          createdById: 'owner-user-id',
          payers: {
            create: [{ memberId: member.id, amount: 150000n }],
          },
          items: {
            create: [
              {
                name: 'Pizza',
                amount: 150000n,
                shares: {
                  create: [{ memberId: member.id, amount: 150000n }],
                },
              },
            ],
          },
        },
      }),
    );
  });

  it('rejects an unbalanced payer total before opening a transaction', async () => {
    const invalidDto = {
      ...dto,
      payers: [{ memberId: member.id, amount: 100000 }],
    };

    await expect(
      service.createBill('owner-user-id', 'group-id', invalidDto),
    ).rejects.toThrow(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('tạo bill với ngày trong quá khứ', async () => {
    const past = '2026-09-01T00:00:00.000Z';

    await service.createBill('owner-user-id', 'group-id', {
      ...dto,
      occurredAt: past,
    });

    expect(billCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ occurredAt: new Date(past) }),
      }),
    );
  });

  it('từ chối bill có ngày ở tương lai trước khi mở transaction', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await expect(
      service.createBill('owner-user-id', 'group-id', {
        ...dto,
        occurredAt: future,
      }),
    ).rejects.toThrow('Bill date cannot be in the future');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects an unbalanced item share total', async () => {
    const invalidDto = {
      ...dto,
      items: [
        {
          ...dto.items[0],
          shares: [{ memberId: member.id, amount: 100000 }],
        },
      ],
    };

    await expect(
      service.createBill('owner-user-id', 'group-id', invalidDto),
    ).rejects.toThrow('Total share amount must equal');
  });

  it('rejects payer or share memberships from another group', async () => {
    groupMemberFindMany.mockResolvedValue([]);

    await expect(
      service.createBill('owner-user-id', 'group-id', dto),
    ).rejects.toThrow(BadRequestException);
    expect(billCreate).not.toHaveBeenCalled();
  });

  it('hides bill details from users outside the group', async () => {
    billFindFirst.mockResolvedValue(null);

    await expect(
      service.getBillDetail('stranger-id', 'group-id', 'bill-id'),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not allow a regular member to update another member bill', async () => {
    groupMemberFindUnique.mockResolvedValue({
      id: 'regular-membership-id',
      role: GroupRole.MEMBER,
    });
    billFindFirst.mockResolvedValue(bill);

    await expect(
      service.updateBill('regular-user-id', 'group-id', bill.id, {
        name: 'Changed',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(billUpdate).not.toHaveBeenCalled();
  });

  it('allows a group administrator to delete a bill', async () => {
    groupMemberFindUnique.mockResolvedValue({
      id: 'admin-membership-id',
      role: GroupRole.ADMIN,
    });
    billFindFirst.mockResolvedValue({ createdById: 'another-user-id' });

    await service.deleteBill('admin-user-id', 'group-id', bill.id);

    expect(billDelete).toHaveBeenCalledWith({ where: { id: bill.id } });
  });

  it('locks the bill row before replacing items so concurrent updates cannot duplicate', async () => {
    billFindFirst.mockResolvedValue(bill);
    billUpdate.mockResolvedValue(bill);

    await service.updateBill('owner-user-id', 'group-id', bill.id, {
      payers: [{ memberId: member.id, amount: 150000 }],
      items: [
        {
          name: 'Pizza',
          amount: 150000,
          shares: [{ memberId: member.id, amount: 150000 }],
        },
      ],
    });

    expect(transactionQueryRaw).toHaveBeenCalledOnce();
    expect(billItemDeleteMany).toHaveBeenCalledWith({
      where: { billId: bill.id },
    });
    expect(
      transactionQueryRaw.mock.invocationCallOrder[0],
    ).toBeLessThan(billItemDeleteMany.mock.invocationCallOrder[0]);
  });
});
