import { randomInt } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import { GroupRole, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_CODE_LENGTH = 8;
const MAX_INVITE_CODE_ATTEMPTS = 5;

@Injectable()
export class GroupService {
  constructor(private readonly prisma: PrismaService) {}

  async createGroup(userId: string, name: string, avatarUrl?: string) {
    for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt += 1) {
      const inviteCode = this.generateInviteCode();

      try {
        return await this.prisma.$transaction(async (prisma) => {
          const group = await prisma.group.create({
            data: {
              name,
              avatarUrl,
              inviteCode,
              createdById: userId,
            },
          });

          await prisma.groupMember.create({
            data: {
              groupId: group.id,
              userId,
              role: GroupRole.OWNER,
            },
          });

          return group;
        });
      } catch (error) {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    throw new InternalServerErrorException(
      'Could not generate a unique invite code',
    );
  }

  async joinGroup(userId: string, inviteCode: string) {
    const group = await this.prisma.group.findUnique({
      where: {
        inviteCode: inviteCode.trim().toUpperCase(),
      },
    });

    if (!group) {
      throw new NotFoundException('Invite code is invalid');
    }

    try {
      await this.prisma.groupMember.create({
        data: {
          groupId: group.id,
          userId,
          role: GroupRole.MEMBER,
        },
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('You are already a member of this group');
      }

      throw error;
    }

    return group;
  }

  async getMyGroups(userId: string) {
    return this.prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async getGroupDetail(userId: string, groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: {
        id: groupId,
        members: {
          some: {
            userId,
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

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    const { members, ...groupDetail } = group;

    return {
      ...groupDetail,
      members: members.map(({ id: membershipId, role, joinedAt, user }) => ({
        membershipId,
        ...user,
        role,
        joinedAt,
      })),
    };
  }

  private generateInviteCode() {
    return Array.from(
      { length: INVITE_CODE_LENGTH },
      () => INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)],
    ).join('');
  }

  private isUniqueConstraintError(
    error: unknown,
  ): error is Prisma.PrismaClientKnownRequestError {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
