import { BadRequestException } from '@nestjs/common';
import { UsersAdminService } from '../../src/users/users-admin.service';

describe('UsersAdminService coffee shop assignment history', () => {
  const oldUser = {
    id: 5,
    name: 'Old leader',
    email: 'old@example.com',
    role: 'LEADER',
    approvedAt: null,
    coffeeShopAssignments: [],
    cityAssignments: [],
  };

  function setup(active: { id: number } | null) {
    const tx = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(oldUser),
        update: jest.fn().mockResolvedValue(oldUser),
      },
      city: { count: jest.fn() },
      userCityAssignment: { deleteMany: jest.fn(), upsert: jest.fn() },
      coffeeShop: { count: jest.fn().mockResolvedValue(1) },
      userCoffeeShopAssignment: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn().mockResolvedValue(active),
        update: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
      },
      configChangeLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    return { service: new UsersAdminService(prisma as any), tx };
  }

  it('closes the selected current assignment without deleting its history', async () => {
    const { service, tx } = setup({ id: 11 });

    await service.update(5, {
      coffeeShopIds: [1],
      assignmentFrom: '2026-01-01',
      assignmentUntil: '2026-08-31',
    }, 1);

    expect(tx.userCoffeeShopAssignment.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        assignedFrom: new Date('2026-01-01'),
        assignedUntil: new Date('2026-08-31'),
      },
    });
    expect(tx.userCoffeeShopAssignment.create).not.toHaveBeenCalled();
  });

  it('creates a new active assignment when the removal date is empty', async () => {
    const { service, tx } = setup(null);

    await service.update(5, {
      coffeeShopIds: [2],
      assignmentFrom: '2026-09-01',
      assignmentUntil: '',
    }, 1);

    expect(tx.userCoffeeShopAssignment.create).toHaveBeenCalledWith({
      data: {
        userId: 5,
        coffeeShopId: 2,
        assignedFrom: new Date('2026-09-01'),
        assignedUntil: null,
      },
    });
  });

  it('rejects a removal date before the appointment date', async () => {
    const { service } = setup({ id: 11 });

    await expect(service.update(5, {
      coffeeShopIds: [1],
      assignmentFrom: '2026-09-01',
      assignmentUntil: '2026-08-31',
    }, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('UsersAdminService SENPAI supervision', () => {
  function setup(role: string, leaderCount = 2) {
    const user = { id: 5, name: 'S', email: 's@example.com', role, approvedAt: null, coffeeShopAssignments: [], cityAssignments: [], supervisions: [] };
    const tx = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(user),
        update: jest.fn().mockResolvedValue(user),
        count: jest.fn().mockResolvedValue(leaderCount),
      },
      userSupervision: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      configChangeLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    return { service: new UsersAdminService(prisma as any), tx };
  }

  it('assigns unique leaders to a SENPAI and removes the others', async () => {
    const { service, tx } = setup('LEADER');
    await service.update(5, { role: 'SENPAI', leaderIds: [1, 2, 2] }, 1);
    expect(tx.user.count).toHaveBeenCalledWith({ where: { id: { in: [1, 2] }, role: 'LEADER' } });
    expect(tx.userSupervision.deleteMany).toHaveBeenCalledWith({ where: { supervisorId: 5, leaderId: { notIn: [1, 2] } } });
    expect(tx.userSupervision.createMany).toHaveBeenCalledWith({
      data: [{ supervisorId: 5, leaderId: 1 }, { supervisorId: 5, leaderId: 2 }],
      skipDuplicates: true,
    });
    expect(tx.configChangeLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects ids that are not all LEADER users', async () => {
    const { service, tx } = setup('SENPAI', 1);
    await expect(service.update(5, { leaderIds: [1, 2] }, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.userSupervision.createMany).not.toHaveBeenCalled();
  });

  it('rejects supervising oneself', async () => {
    const { service } = setup('SENPAI');
    await expect(service.update(5, { leaderIds: [5] }, 1)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects leaderIds for a user who is not SENPAI', async () => {
    const { service, tx } = setup('LEADER');
    await expect(service.update(5, { leaderIds: [1] }, 1)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.userSupervision.createMany).not.toHaveBeenCalled();
  });

  it('clears all supervised leaders with an empty list', async () => {
    const { service, tx } = setup('SENPAI', 0);
    await service.update(5, { leaderIds: [] }, 1);
    expect(tx.userSupervision.deleteMany).toHaveBeenCalledWith({ where: { supervisorId: 5, leaderId: { notIn: [] } } });
    expect(tx.userSupervision.createMany).not.toHaveBeenCalled();
  });

  it('drops all supervisions when SENPAI is demoted without leaderIds', async () => {
    const { service, tx } = setup('SENPAI');
    await service.update(5, { role: 'COO' }, 1);
    expect(tx.userSupervision.deleteMany).toHaveBeenCalledWith({ where: { supervisorId: 5 } });
  });

  it('does not touch supervisions for unrelated updates', async () => {
    const { service, tx } = setup('LEADER');
    await service.update(5, { role: 'COO' }, 1);
    expect(tx.userSupervision.deleteMany).not.toHaveBeenCalled();
  });
});

describe('UsersAdminService admin form payload', () => {
  function setup(role: string) {
    const user = { id: 5, name: 'U', email: 'u@example.com', role, approvedAt: null, coffeeShopAssignments: [], cityAssignments: [], supervisions: [] };
    const tx = {
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue(user), count: jest.fn().mockResolvedValue(0) },
      userSupervision: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }), createMany: jest.fn() },
      coffeeShop: { count: jest.fn().mockResolvedValue(0) },
      city: { count: jest.fn().mockResolvedValue(0) },
      userCoffeeShopAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      userCityAssignment: { deleteMany: jest.fn() },
      configChangeLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = { $transaction: jest.fn((callback) => callback(tx)) };
    return { service: new UsersAdminService(prisma as any), tx };
  }

  it.each(['LEADER', 'COO', 'VIEWER', 'ADMIN', 'CITY_LEADER'])(
    'saves a %s when the form sends the usual payload with an empty leaderIds list',
    async (role) => {
      const { service, tx } = setup(role);
      await expect(service.update(5, { role, cityIds: [], coffeeShopIds: [], leaderIds: [], approvedAt: null }, 1)).resolves.toBeDefined();
      expect(tx.user.update).toHaveBeenCalled();
      expect(tx.userSupervision.createMany).not.toHaveBeenCalled();
    },
  );

  it('still rejects a non-empty leaderIds list for a user who is not SENPAI', async () => {
    const { service } = setup('LEADER');
    await expect(service.update(5, { role: 'LEADER', leaderIds: [1] }, 1)).rejects.toBeInstanceOf(BadRequestException);
  });
});
