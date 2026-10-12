import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../common/enums/user-role.enum';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';

function digestResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        coffeeShopAssignments: { include: { coffeeShop: true } },
        cityAssignments: { include: { city: true } },
      },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        coffeeShopAssignments: { include: { coffeeShop: true } },
        cityAssignments: { include: { city: true } },
      },
    });
  }

  async create(data: {
    name: string;
    email: string;
    passwordHash?: string;
    googleOauthId?: string;
    role?: UserRole;
  }) {
    return this.prisma.user.create({
      data,
      include: {
        coffeeShopAssignments: { include: { coffeeShop: true } },
        cityAssignments: { include: { city: true } },
      },
    });
  }

  async update(id: number, data: Partial<{ name: string; email: string; passwordHash: string; googleOauthId: string; role: UserRole }>) {
    return this.prisma.user.update({
      where: { id },
      data,
      include: {
        coffeeShopAssignments: { include: { coffeeShop: true } },
        cityAssignments: { include: { city: true } },
      },
    });
  }

  async dismissReportExampleHelp(id: number) {
    return this.prisma.user.update({
      where: { id },
      data: { reportExampleHelpDismissed: true },
      select: { reportExampleHelpDismissed: true },
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async createPasswordResetToken(userId: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        token: digestResetToken(token),
        expiresAt,
      },
    });
    return token;
  }

  async findByResetToken(token: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token: digestResetToken(token) },
      include: { user: true },
    });
    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      return null;
    }
    return resetToken.user;
  }

  async invalidateResetToken(token: string) {
    await this.prisma.passwordResetToken.update({
      where: { token: digestResetToken(token) },
      data: { usedAt: new Date() },
    });
  }

  async completePasswordReset(token: string, passwordHash: string): Promise<boolean> {
    const tokenDigest = digestResetToken(token);
    return this.prisma.$transaction(async (transaction) => {
      const now = new Date();
      const resetToken = await transaction.passwordResetToken.findUnique({
        where: { token: tokenDigest },
        select: { id: true, userId: true, usedAt: true, expiresAt: true },
      });
      if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now) {
        return false;
      }

      const claimed = await transaction.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          expiresAt: { gt: now },
        },
        data: { usedAt: now },
      });
      if (claimed.count !== 1) {
        return false;
      }

      await transaction.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });
      return true;
    });
  }

  async assignCoffeeShop(userId: number, coffeeShopId: number) {
    return this.prisma.userCoffeeShopAssignment.create({
      data: { userId, coffeeShopId },
      include: { coffeeShop: true },
    });
  }

  async assignCity(userId: number, cityId: number) {
    return this.prisma.userCityAssignment.create({
      data: { userId, cityId },
      include: { city: true },
    });
  }

  async replaceCities(userId: number, cityIds: number[]) {
    await this.prisma.userCityAssignment.deleteMany({ where: { userId } });
    if (cityIds.length > 0) {
      await this.prisma.userCityAssignment.createMany({
        data: cityIds.map((cityId) => ({ userId, cityId })),
      });
    }
    return this.findById(userId);
  }

  async replaceCoffeeShops(userId: number, coffeeShopIds: number[]) {
    await this.prisma.userCoffeeShopAssignment.deleteMany({ where: { userId } });
    if (coffeeShopIds.length > 0) {
      await this.prisma.userCoffeeShopAssignment.createMany({
        data: coffeeShopIds.map((coffeeShopId) => ({ userId, coffeeShopId })),
      });
    }
    return this.findById(userId);
  }
}
