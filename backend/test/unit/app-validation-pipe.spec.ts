jest.mock('@nestjs/swagger', () => ({
  ApiProperty: () => () => undefined,
}));

import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { createAppValidationPipe } from '../../src/common/app-validation-pipe';

describe('Application validation without automatically resolved optional peers', () => {
  const metadata = { type: 'body' as const, metatype: RegisterDto };
  const validInput = { name: 'Leader', email: 'leader@example.com', password: 'test-password' };

  beforeEach(() => {
    for (const method of ['loadValidator', 'loadTransformer']) {
      const prototype = ValidationPipe.prototype as any;
      const original = prototype[method];
      jest.spyOn(prototype, method).mockImplementation((...args: any[]) => {
        if (!args[0]) {
          throw new Error('Optional package is unavailable from the Nest installation directory');
        }
        return original.call(prototype, args[0]);
      });
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it('creates the validation pipe and transforms a valid registration body', async () => {
    const value = await createAppValidationPipe().transform(validInput, metadata);

    expect(value).toBeInstanceOf(RegisterDto);
    expect(value).toEqual(validInput);
  });

  it.each([
    { ...validInput, email: 'invalid-email' },
    { ...validInput, password: 'short' },
    { ...validInput, role: 'ADMIN' },
  ])('rejects invalid or unexpected registration fields: %j', async (input) => {
    await expect(createAppValidationPipe().transform(input, metadata)).rejects.toBeInstanceOf(BadRequestException);
  });
});
