import { ServiceUnavailableException } from '@nestjs/common';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { AuthService } from '../../src/auth/auth.service';

describe('AuthService', () => {
  const user = {
    id: 7,
    name: 'Fresh User',
    email: 'user@example.com',
    role: UserRole.LEADER,
    passwordHash: null,
    googleOauthId: 'google-id',
    coffeeShopAssignments: [],
    cityAssignments: [],
  };

  function createService(overrides: Record<string, unknown> = {}, configOverrides: Record<string, unknown> = {}) {
    const users = {
      findByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(user),
      create: jest.fn(),
      update: jest.fn(),
      hashPassword: jest.fn().mockResolvedValue('hashed-password'),
      validatePassword: jest.fn().mockResolvedValue(true),
      completePasswordReset: jest.fn().mockResolvedValue(true),
      createPasswordResetToken: jest.fn().mockResolvedValue('raw-reset-token'),
      ...overrides,
    };
    const jwt = { sign: jest.fn().mockReturnValue('signed-token') };
    const config = {
      get: jest.fn((key: string) => ({ FRONTEND_URL: 'https://app.example.com', ...configOverrides }[key])),
    };
    const delivery = {
      isConfigured: jest.fn().mockReturnValue(true),
      sendPasswordReset: jest.fn().mockResolvedValue(undefined),
    };
    const service = new (AuthService as any)(users, jwt, config, delivery) as AuthService;
    return { service, users, jwt, delivery };
  }

  it('returns the Google user rather than a login envelope', async () => {
    const { service } = createService({ findByEmail: jest.fn().mockResolvedValue(user) });

    await expect(service.validateGoogleUser({
      email: user.email,
      name: user.name,
      googleOauthId: user.googleOauthId,
    })).resolves.toEqual({
      id: 7,
      name: 'Fresh User',
      email: 'user@example.com',
      role: UserRole.LEADER,
      googleOauthId: 'google-id',
      coffeeShopAssignments: [],
      cityAssignments: [],
    });
  });

  it.each([
    [null, 'password123'],
    ['user@example.com', { value: 'password123' }],
    ['user@example.com', 123456],
  ])('rejects malformed login fields without querying credentials', async (email, password) => {
    const { service, users } = createService({ findByEmail: jest.fn().mockResolvedValue(user) });

    await expect(service.validateUser(email as any, password as any)).resolves.toBeNull();
    expect(users.findByEmail).not.toHaveBeenCalled();
    expect(users.validatePassword).not.toHaveBeenCalled();
  });

  it('always creates public registrations as leaders', async () => {
    const { service, users } = createService({
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation(async (data) => ({ id: 8, ...data })),
    }, { ALLOW_SELF_REGISTRATION: 'true' });

    await service.register({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
      role: UserRole.ADMIN,
    } as any);

    expect(users.create).toHaveBeenCalledWith({
      name: 'New User',
      email: 'new@example.com',
      passwordHash: 'hashed-password',
      role: UserRole.LEADER,
    });
  });

  it('rejects public registration unless explicitly enabled', async () => {
    const { service, users } = createService({ findByEmail: jest.fn().mockResolvedValue(null) });

    await expect(service.register({
      name: 'New User',
      email: 'new@example.com',
      password: 'password123',
    })).rejects.toMatchObject({ status: 403 });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('does not allow Google OAuth to create an unapproved account when registration is disabled', async () => {
    const { service, users } = createService({ findByEmail: jest.fn().mockResolvedValue(null) });

    await expect(service.validateGoogleUser({
      email: 'oauth@example.com',
      name: 'OAuth User',
      googleOauthId: 'oauth-id',
    })).rejects.toMatchObject({ status: 403 });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('delivers a reset URL without logging the reset secret', async () => {
    const { service, delivery } = createService({ findByEmail: jest.fn().mockResolvedValue(user) });
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);

    await service.forgotPassword(user.email);

    expect(delivery.sendPasswordReset).toHaveBeenCalledWith({
      email: user.email,
      resetUrl: 'https://app.example.com/login?resetToken=raw-reset-token',
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('reports unavailable delivery instead of claiming a reset was sent', async () => {
    const { service, delivery } = createService();
    delivery.isConfigured.mockReturnValue(false);

    await expect(service.forgotPassword(user.email)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('completes password replacement through one reset-token operation', async () => {
    const { service, users } = createService();

    await service.resetPassword('raw-reset-token', 'new-password');

    expect(users.completePasswordReset).toHaveBeenCalledWith(
      'raw-reset-token',
      'hashed-password',
    );
  });
});
