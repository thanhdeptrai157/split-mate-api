import { ConflictException, NotFoundException } from '@nestjs/common';

import { GroupRole, Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { GroupService } from './group.service.js';

describe('GroupService', () => {
  const group = {
    id: 'group-id',
    name: 'Summer trip',
    avatarUrl: null,
    inviteCode: '7KMQ4WXP',
    createdById: 'owner-id',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let transaction: ReturnType<typeof vi.fn>;
  let groupFindUnique: ReturnType<typeof vi.fn>;
  let groupFindFirst: ReturnType<typeof vi.fn>;
  let groupFindMany: ReturnType<typeof vi.fn>;
  let groupMemberCreate: ReturnType<typeof vi.fn>;
  let service: GroupService;

  beforeEach(() => {
    transaction = vi.fn();
    groupFindUnique = vi.fn();
    groupFindFirst = vi.fn();
    groupFindMany = vi.fn();
    groupMemberCreate = vi.fn();

    const prisma = {
      $transaction: transaction,
      group: {
        findUnique: groupFindUnique,
        findFirst: groupFindFirst,
        findMany: groupFindMany,
      },
      groupMember: {
        create: groupMemberCreate,
      },
    } as unknown as PrismaService;

    service = new GroupService(prisma);
  });

  it('creates a group with an invite code and OWNER membership', async () => {
    const txGroupCreate = vi.fn(async ({ data }) => ({
      ...group,
      ...data,
    }));
    const txGroupMemberCreate = vi.fn().mockResolvedValue({});

    transaction.mockImplementation((callback) =>
      callback({
        group: { create: txGroupCreate },
        groupMember: { create: txGroupMemberCreate },
      }),
    );

    const result = await service.createGroup('owner-id', 'Summer trip');

    expect(result.inviteCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(txGroupMemberCreate).toHaveBeenCalledWith({
      data: {
        groupId: 'group-id',
        userId: 'owner-id',
        role: GroupRole.OWNER,
      },
    });
  });

  it('joins a group and normalizes the invite code', async () => {
    groupFindUnique.mockResolvedValue(group);
    groupMemberCreate.mockResolvedValue({});

    await expect(service.joinGroup('user-id', ' 7kmq4wxp ')).resolves.toEqual(
      group,
    );
    expect(groupFindUnique).toHaveBeenCalledWith({
      where: { inviteCode: '7KMQ4WXP' },
    });
    expect(groupMemberCreate).toHaveBeenCalledWith({
      data: {
        groupId: group.id,
        userId: 'user-id',
        role: GroupRole.MEMBER,
      },
    });
  });

  it('rejects an invalid invite code', async () => {
    groupFindUnique.mockResolvedValue(null);

    await expect(service.joinGroup('user-id', 'BADCODE2')).rejects.toThrow(
      NotFoundException,
    );
    expect(groupMemberCreate).not.toHaveBeenCalled();
  });

  it('rejects a user who is already a group member', async () => {
    const uniqueConstraintError = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint failed',
      { code: 'P2002', clientVersion: '7.10.0' },
    );

    groupFindUnique.mockResolvedValue(group);
    groupMemberCreate.mockRejectedValue(uniqueConstraintError);

    await expect(
      service.joinGroup('user-id', group.inviteCode),
    ).rejects.toThrow(ConflictException);
  });

  it('gets group details with flattened member profiles', async () => {
    const joinedAt = new Date();
    groupFindFirst.mockResolvedValue({
      ...group,
      members: [
        {
          id: 'membership-id',
          role: GroupRole.OWNER,
          joinedAt,
          user: {
            id: 'owner-id',
            name: 'Owner',
            email: 'owner@example.com',
            avatarUrl: null,
          },
        },
      ],
    });

    await expect(
      service.getGroupDetail('owner-id', 'group-id'),
    ).resolves.toEqual({
      ...group,
      members: [
        {
          membershipId: 'membership-id',
          id: 'owner-id',
          name: 'Owner',
          email: 'owner@example.com',
          avatarUrl: null,
          role: GroupRole.OWNER,
          joinedAt,
        },
      ],
    });
    expect(groupFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-id',
        members: {
          some: {
            userId: 'owner-id',
          },
        },
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        inviteCode: true,
        createdById: true,
        createdAt: true,
        updatedAt: true,
        members: {
          orderBy: {
            joinedAt: 'asc',
          },
          select: {
            id: true,
            role: true,
            joinedAt: true,
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
    });
  });

  it('rejects group details when the group is unavailable to the user', async () => {
    groupFindFirst.mockResolvedValue(null);

    await expect(service.getGroupDetail('user-id', 'group-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
