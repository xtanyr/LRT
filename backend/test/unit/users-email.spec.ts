import { UsersService } from '../../src/users/users.service';

describe('Account email handling', () => {
  it('looks up existing addresses without case sensitivity or surrounding spaces', async () => {
    const profile = { id: 5, email: 'Leader@Example.com' };
    const findFirst = jest.fn().mockImplementation(async ({ where }) =>
      where.email.mode === 'insensitive' && where.email.equals === 'leader@example.com'
        ? profile : null);
    const users = new UsersService({ user: { findFirst } } as any);

    await expect(users.findByEmail('  LEADER@Example.com  ')).resolves.toEqual(profile);
  });

  it('stores new addresses consistently without changing the displayed name', async () => {
    const create = jest.fn().mockImplementation(async ({ data }) => ({ id: 6, ...data }));
    const users = new UsersService({ user: { create } } as any);

    const result = await users.create({ name: 'Анна Иванова', email: '  ANNA@Example.com  ' });

    expect(result).toMatchObject({ name: 'Анна Иванова', email: 'anna@example.com' });
  });

  it('normalizes a changed address', async () => {
    const update = jest.fn().mockImplementation(async ({ data }) => ({ id: 6, ...data }));
    const users = new UsersService({ user: { update } } as any);

    await expect(users.update(6, { email: '  ANNA@Example.com  ' }))
      .resolves.toMatchObject({ email: 'anna@example.com' });
  });
});
