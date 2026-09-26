import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { ConfigService } from '@nestjs/config';
import { GoogleLoginDto } from './dto/google-login.dto.js';
import type { CookieOptions, Response, Request } from 'express';
import type { AccessTokenPayload } from './strategies/access-token.strategy.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { CurrentUser } from './decorators/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  private readonly authService: AuthService;
  private readonly configService: ConfigService;

  constructor(authService: AuthService, configService: ConfigService) {
    this.authService = authService;
    this.configService = configService;
  }
  private setRefreshCookie(response: Response, refreshToken: string) {
    const ttlDays =
      this.configService.get<number>('REFRESH_TOKEN_TTL_DAYS') ?? 30;

    response.cookie('refresh_token', refreshToken, {
      ...this.getCookieOptions(),
      maxAge: ttlDays * 24 * 60 * 60 * 1000,
    });
  }
  private getCookieOptions(): CookieOptions {
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    const sameSite =
      this.configService.get<'lax' | 'strict' | 'none'>('COOKIE_SAME_SITE') ??
      'lax';

    return {
      httpOnly: true,
      secure: isProduction,
      sameSite,
      path: '/api/auth',
    };
  }
  @Post('google-login')
  async googleLogin(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginWithGoogle(dto.credential);

    this.setRefreshCookie(response, result.refreshToken);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refresh_token;
    if (!refreshToken) {
      throw new Error('Refresh token not found');
    }

    const result = await this.authService.refresh(refreshToken);
    if (!result) {
      throw new Error('Refresh token invalid');
    }
    this.setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.refresh_token;

    await this.authService.logout(refreshToken);

    response.clearCookie('refresh_token', this.getCookieOptions());

    return {
      success: true,
    };
  }
  @Get('me')
  @UseGuards(AccessTokenGuard)
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.authService.getMe(user.sub);
  }
}
