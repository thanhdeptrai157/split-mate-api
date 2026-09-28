import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../prisma/prisma.service.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
    );
  }
  private async createAccessToken(userId: string, email: string) {
    const expiresIn = Number(
      this.configService.getOrThrow<string>('JWT_ACCESS_EXPIRES_IN'),
    );

    if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new Error('JWT_ACCESS_EXPIRES_IN must be a positive number');
    }

    return this.jwtService.signAsync(
      {
        sub: userId,
        email: email,
      },
      {
        expiresIn: expiresIn,
        secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      },
    );
  }
  private generateRefreshToken() {
    return randomBytes(64).toString('base64url');
  }
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private async createRefreshTokens(userId: string) {
    const refreshToken = this.generateRefreshToken();
    const tokenHash = this.hashToken(refreshToken);

    const expiresIn = this.configService.getOrThrow<number>(
      'JWT_REFRESH_EXPIRES_IN',
    );
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: userId,
        tokenHash: tokenHash,
        expiresAt: expiresAt,
      },
    });
    return refreshToken;
  }
  private async verifyGoogleToken(credential: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: credential,
        audience: this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email || !payload.sub) {
        throw new UnauthorizedException('Invalid Google User');
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email,
        picture: payload.picture ?? null,
      };
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
  }
  async loginWithGoogle(credential: string) {
    const googleUser = await this.verifyGoogleToken(credential);
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ googleId: googleUser.googleId }, { email: googleUser.email }],
      },
    });

    if (user) {
      if (user.googleId && user.googleId !== googleUser.googleId) {
        throw new UnauthorizedException('Google account does not match');
      }

      user = await this.prisma.user.update({
        where: {
          id: user.id,
        },
        data: {
          googleId: googleUser.googleId,
          email: googleUser.email,
          // Giữ tên/ảnh người dùng đã chỉnh trong hồ sơ; chỉ điền avatar từ
          // Google khi người dùng chưa có ảnh.
          ...(user.avatarUrl ? {} : { avatarUrl: googleUser.picture }),
        },
      });
    } else {
      user = await this.prisma.user.create({
        data: {
          googleId: googleUser.googleId,
          email: googleUser.email,
          name: googleUser.name,
          avatarUrl: googleUser.picture,
        },
      });
    }

    const accessToken = await this.createAccessToken(user.id, user.email);
    const refreshToken = await this.createRefreshTokens(user.id);

    return { user, accessToken, refreshToken };
  }
  async refresh(rawRefreshToken: string) {
    const tokenHash = this.hashToken(rawRefreshToken);

    const storedToken = await this.prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        user: true,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (storedToken.revokedAt) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (storedToken.expiresAt <= new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const newRefreshToken = this.generateRefreshToken();
    const newRefreshTokenHash = this.hashToken(newRefreshToken);

    const refreshTokenTtlDays =
      this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30;

    const expiresAt = new Date(
      Date.now() + refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.$transaction(async (tx: any) => {
      const result = await tx.refreshToken.updateMany({
        where: {
          id: storedToken.id,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      if (result.count !== 1) {
        throw new UnauthorizedException('Refresh token already used');
      }

      await tx.refreshToken.create({
        data: {
          userId: storedToken.userId,
          tokenHash: newRefreshTokenHash,
          expiresAt,
        },
      });
    });

    const accessToken = await this.createAccessToken(
      storedToken.user.id,
      storedToken.user.email,
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }
  async logout(rawRefreshToken?: string) {
    if (!rawRefreshToken) {
      return;
    }

    const tokenHash = this.hashToken(rawRefreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException();
    }

    return user;
  }
}
