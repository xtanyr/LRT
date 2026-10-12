jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { AuthController } from '../../src/auth/auth.controller';
import { AuthService } from '../../src/auth/auth.service';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { PrismaService } from '../../src/prisma/prisma.service';
import { UsersService } from '../../src/users/users.service';

describe('Report example help account preference', () => {
  let app: INestApplication;
  let auth: AuthService;
  let profiles: Map<number, any>;
  let updateUser: jest.Mock;

  beforeAll(async () => {
    profiles = new Map(Object.values(UserRole).map((role, index) => [index + 1, {
      id: index + 1,
      name: `${role} user`,
      email: `${role.toLowerCase()}@example.com`,
      role,
      passwordHash: 'private-password-hash',
      reportExampleHelpDismissed: false,
      coffeeShopAssignments: [],
      cityAssignments: [],
    }]));
    updateUser = jest.fn(async ({ where, data, select }) => {
      const profile = profiles.get(where.id);
      Object.assign(profile, data);
      return Object.fromEntries(Object.keys(select).map((field) => [field, profile[field]]));
    });
    const prisma = {
      user: {
        findUnique: jest.fn(async ({ where }) => profiles.get(where.id) ?? null),
        update: updateUser,
      },
    };
    const users = new UsersService(prisma as any);
    const jwt = {
      verifyAsync: jest.fn(async (token: string) => ({ sub: Number(token) })),
      sign: jest.fn().mockReturnValue('signed-token'),
    };
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    auth = new AuthService(users, jwt as any, config as any, {} as any);
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: PrismaService, useValue: prisma },
        JwtAuthGuard,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    for (const profile of profiles.values()) profile.reportExampleHelpDismissed = false;
    updateUser.mockClear();
  });

  afterAll(async () => { await app?.close(); });

  it('rejects anonymous requests without changing any account', async () => {
    await request(app.getHttpServer()).patch('/api/auth/report-example-help').expect(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it.each(Object.values(UserRole))('allows %s to dismiss only its own help', async (role) => {
    const profile = [...profiles.values()].find((item) => item.role === role);
    const response = await request(app.getHttpServer())
      .patch('/api/auth/report-example-help')
      .set('Authorization', `Bearer ${profile.id}`)
      .send({ userId: 999, id: 999, reportExampleHelpDismissed: false })
      .expect(200);

    expect(response.body.data).toEqual({ reportExampleHelpDismissed: true });
    expect(updateUser).toHaveBeenCalledWith({
      where: { id: profile.id },
      data: { reportExampleHelpDismissed: true },
      select: { reportExampleHelpDismissed: true },
    });
    expect([...profiles.values()].filter((item) => item.reportExampleHelpDismissed))
      .toEqual([profile]);
  });

  it('keeps repeated dismissal idempotent and exposes the saved value after refresh', async () => {
    await expect(auth.login({ id: 1 })).resolves.toMatchObject({
      user: { reportExampleHelpDismissed: false },
    });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app.getHttpServer())
        .patch('/api/auth/report-example-help')
        .set('Authorization', 'Bearer 1')
        .expect(200);
    }
    const refresh = await request(app.getHttpServer())
      .post('/api/auth/refresh')
      .set('Authorization', 'Bearer 1')
      .expect(200);

    expect(refresh.body.data.user.reportExampleHelpDismissed).toBe(true);
    expect(refresh.body.data.user).not.toHaveProperty('passwordHash');
    expect(refresh.body.data.user).not.toHaveProperty('googleOauthId');
  });
});
