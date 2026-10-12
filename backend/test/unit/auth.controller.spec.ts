jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
  ApiPropertyOptional: () => () => undefined,
}));

import { AuthController } from '../../src/auth/auth.controller';
import { Test } from '@nestjs/testing';
import { AuthService } from '../../src/auth/auth.service';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';

describe('AuthController session cookies', () => {
  const user = { id: 3, name: 'User', email: 'user@example.com', role: 'LEADER' };

  function createController() {
    const auth = {
      login: jest.fn().mockResolvedValue({ accessToken: 'signed-token', user }),
    };
    const response = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    };
    return {
      controller: new AuthController(auth as any),
      auth,
      response,
    };
  }

  it('sets the 60-day HTTP-only cookie after password login', async () => {
    const { controller, response } = createController();

    await controller.login({ user }, response as any);

    expect(response.cookie).toHaveBeenCalledWith('accessToken', 'signed-token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 24 * 60 * 60 * 1000,
    }));
  });

  it('renews the session cookie through refresh', async () => {
    const { controller, response } = createController();

    await controller.refresh({ user }, response as any);

    expect(response.cookie).toHaveBeenCalledWith('accessToken', 'signed-token', expect.any(Object));
  });

  it('clears the cookie with the same security attributes on logout', async () => {
    const { controller, response } = createController();

    await controller.logout(response as any);

    expect(response.clearCookie).toHaveBeenCalledWith('accessToken', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax',
    }));
  });

  it('finishes the HTTP logout response and clears the browser cookie', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    try {
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .timeout({ response: 500, deadline: 1000 })
        .expect(200);

      expect(response.body).toEqual({ success: true, data: null, message: 'Logged out successfully' });
      expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([
        expect.stringContaining('accessToken=;'),
      ]));
    } finally {
      await app.close();
    }
  });
});
