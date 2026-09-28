import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

const selfProfileSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  qrUrl: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

const publicProfileSelect = {
  id: true,
  name: true,
  avatarUrl: true,
  qrUrl: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: selfProfileSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          name: dto.name,
          avatarUrl: dto.avatarUrl,
          qrUrl: dto.qrUrl,
        },
        select: selfProfileSelect,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('User not found');
      }

      throw error;
    }
  }

  /** Hồ sơ công khai để hiển thị avatar/QR của thành viên khác. */
  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicProfileSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
