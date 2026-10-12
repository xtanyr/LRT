import {
  Injectable,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UserRole } from '../common/enums/user-role.enum';
import { PasswordResetDeliveryService } from './password-reset-delivery.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly passwordResetDelivery: PasswordResetDeliveryService,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
      return null;
    }
    const user = await this.usersService.findByEmail(email);
    if (!user || !user.passwordHash) {
      return null;
    }
    const isPasswordValid = await this.usersService.validatePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return null;
    }
    const { passwordHash, ...result } = user;
    return result;
  }

  async login(user: any) {
    const profile = await this.usersService.findById(user.id);
    if (!profile) {
      throw new BadRequestException('User no longer exists');
    }
    const payload = {
      sub: profile.id,
      email: profile.email,
      role: profile.role,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: profile.id,
        name: profile.name,
        email: profile.email,
        role: profile.role,
        reportExampleHelpDismissed: profile.reportExampleHelpDismissed,
        coffeeShops: profile.coffeeShopAssignments
          .filter((assignment) => assignment.assignedUntil === null)
          .map((assignment) => ({ id: assignment.coffeeShop.id, name: assignment.coffeeShop.name })),
        cities: profile.cityAssignments.map((assignment) => ({ id: assignment.city.id, name: assignment.city.name })),
      },
    };
  }

  async dismissReportExampleHelp(userId: number) {
    return this.usersService.dismissReportExampleHelp(userId);
  }

  async register(registerDto: {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
  }) {
    if (this.configService.get<string>('ALLOW_SELF_REGISTRATION') !== 'true') {
      throw new ForbiddenException('Public registration is disabled');
    }
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }
    const passwordHash = await this.usersService.hashPassword(registerDto.password);
    const user = await this.usersService.create({
      name: registerDto.name,
      email: registerDto.email,
      passwordHash,
      role: UserRole.LEADER,
    });
    const { passwordHash: _, ...result } = user;
    return this.login(result);
  }

  async validateGoogleUser(googleProfile: { email: string; name: string; googleOauthId: string }) {
    let user = await this.usersService.findByEmail(googleProfile.email);
    if (!user) {
      if (this.configService.get<string>('ALLOW_SELF_REGISTRATION') !== 'true') {
        throw new ForbiddenException('Public registration is disabled');
      }
      user = await this.usersService.create({
        name: googleProfile.name,
        email: googleProfile.email,
        googleOauthId: googleProfile.googleOauthId,
        role: UserRole.LEADER,
      });
    } else if (!user.googleOauthId) {
      user = await this.usersService.update(user.id, {
        googleOauthId: googleProfile.googleOauthId,
      });
    }
    const { passwordHash, ...result } = user;
    return result;
  }

  async forgotPassword(email: string) {
    if (!this.passwordResetDelivery.isConfigured()) {
      throw new ServiceUnavailableException('Password reset email delivery is not configured');
    }
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return { message: 'If the email exists, a reset link will be sent' };
    }
    const token = await this.usersService.createPasswordResetToken(user.id);
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const resetUrl = new URL('/login', frontendUrl);
    resetUrl.searchParams.set('resetToken', token);
    await this.passwordResetDelivery.sendPasswordReset({
      email: user.email,
      resetUrl: resetUrl.toString(),
    });
    return { message: 'If the email exists, a reset link will be sent' };
  }

  async resetPassword(token: string, newPassword: string) {
    const passwordHash = await this.usersService.hashPassword(newPassword);
    const completed = await this.usersService.completePasswordReset(token, passwordHash);
    if (!completed) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    return { message: 'Password reset successfully' };
  }
}
