import {
  Controller,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ApiResponseDto } from '../common/dto/response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Response } from 'express';
import { GoogleAuthGuard } from './guards/google-auth.guard';

const SESSION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000;

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('local'))
  async login(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const user = req.user;
    const result = await this.authService.login(user);
    this.setSessionCookie(res, result.accessToken);
    return new ApiResponseDto(true, result, 'Login successful');
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(registerDto);
    this.setSessionCookie(res, result.accessToken);
    return new ApiResponseDto(true, result, 'Registration successful');
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  async googleAuth() {
    return { message: 'Google authentication initiated' };
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleAuthRedirect(@Req() req: any, @Res() res: Response) {
    const result = await this.authService.login(req.user);
    this.setSessionCookie(res, result.accessToken);
    return res.redirect(process.env.FRONTEND_URL || 'http://localhost:3000');
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const user = req.user;
    const result = await this.authService.login(user);
    this.setSessionCookie(res, result.accessToken);
    return new ApiResponseDto(true, result, 'Token refreshed');
  }

  @Patch('report-example-help')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async dismissReportExampleHelp(@Req() req: any) {
    const result = await this.authService.dismissReportExampleHelp(req.user.id);
    return new ApiResponseDto(true, result, 'Report example help preference saved');
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(forgotPasswordDto.email);
    return new ApiResponseDto(true, result, result.message);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.password);
    return new ApiResponseDto(true, result, result.message);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async getCurrentUser(@Req() req: any) {
    return new ApiResponseDto(true, req.user, 'Current user retrieved');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Res() res: Response) {
    res.clearCookie('accessToken', sessionCookieOptions());
    return new ApiResponseDto(true, null, 'Logged out successfully');
  }

  private setSessionCookie(res: Response, token: string) {
    res.cookie('accessToken', token, {
      ...sessionCookieOptions(),
      maxAge: SESSION_MAX_AGE_MS,
    });
  }
}
