import { CitiesService } from '../../src/cities/cities.service';
import { CitiesController } from '../../src/cities/cities.controller';
import { DashboardService } from '../../src/dashboard/dashboard.service';

// Swagger-декораторы не нужны в юнит-тесте и не загружаются в jest-окружении проекта.
jest.mock('@nestjs/swagger', () => new Proxy({}, { get: () => () => () => undefined }));

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const F = { assignments: { some: { marker: true } } };
const senpai = { id: 9, role: 'SENPAI' };

describe('Senpai scoping of nested shop lists', () => {
  describe('CitiesService', () => {
    function setup() {
      const prisma: any = { city: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue(null) } };
      return { prisma, service: new CitiesService(prisma) };
    }

    it('keeps the unscoped list query unchanged', async () => {
      const { prisma, service } = setup();
      await service.findAll();
      expect(prisma.city.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        include: {
          coffeeShops: { where: { isActive: true }, orderBy: { name: 'asc' } },
          _count: { select: { coffeeShops: true } },
        },
        orderBy: { name: 'asc' },
      });
    });
    it('lists only cities and shops under the shop filter, and counts only those shops', async () => {
      const { prisma, service } = setup();
      await service.findAll(undefined, false, F);
      expect(prisma.city.findMany).toHaveBeenCalledWith({
        where: { isActive: true, coffeeShops: { some: { isActive: true, ...F } } },
        include: {
          coffeeShops: { where: { isActive: true, ...F }, orderBy: { name: 'asc' } },
          _count: { select: { coffeeShops: { where: F } } },
        },
        orderBy: { name: 'asc' },
      });
    });
    it('keeps the unscoped single-city query unchanged', async () => {
      const { prisma, service } = setup();
      await service.findOne(3);
      expect(prisma.city.findUnique).toHaveBeenCalledWith({ where: { id: 3 }, include: { coffeeShops: { where: { isActive: true } } } });
    });
    it('returns only shops under the shop filter for a single city', async () => {
      const { prisma, service } = setup();
      await service.findOne(3, F);
      expect(prisma.city.findUnique).toHaveBeenCalledWith({ where: { id: 3 }, include: { coffeeShops: { where: { isActive: true, ...F } } } });
    });
  });

  describe('CitiesController.findAll', () => {
    it('passes the senpai shop filter and no city ids', () => {
      const citiesService: any = { findAll: jest.fn() };
      const access: any = { global: jest.fn().mockReturnValue(false), shopWhere: jest.fn().mockReturnValue(F) };
      new CitiesController(citiesService, access).findAll(senpai, undefined);
      expect(citiesService.findAll).toHaveBeenCalledWith(undefined, false, F);
    });
    it('keeps the city leader behaviour: city ids from assignments, no shop filter', () => {
      const citiesService: any = { findAll: jest.fn() };
      const access: any = { global: jest.fn().mockReturnValue(false), shopWhere: jest.fn() };
      new CitiesController(citiesService, access).findAll({ id: 1, role: 'CITY_LEADER', cityAssignments: [{ cityId: 5 }] }, undefined);
      expect(citiesService.findAll).toHaveBeenCalledWith([5], false, undefined);
    });
  });

  describe('DashboardService.getCooDashboard', () => {
    function setup(global: boolean) {
      const prisma: any = {
        coffeeShop: { findMany: jest.fn().mockResolvedValue([]) },
        iPVStatus: { findMany: jest.fn().mockResolvedValue([]) },
        triggerConfig: { findMany: jest.fn().mockResolvedValue([]) },
        city: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const access: any = { global: jest.fn().mockReturnValue(global), shopWhere: jest.fn().mockReturnValue(global ? {} : F) };
      const reports: any = { getReportsByUser: jest.fn().mockResolvedValue([]) };
      return { prisma, service: new DashboardService(prisma, access, reports) };
    }

    it('keeps the global city list unchanged for the COO and the viewer', async () => {
      const { prisma, service } = setup(true);
      await service.getCooDashboard({ id: 1, role: 'COO' });
      expect(prisma.city.findMany).toHaveBeenCalledWith({ where: { isActive: true }, include: { coffeeShops: { where: { isActive: true } } } });
    });
    it('shows the senpai only cities and shops under the shop filter', async () => {
      const { prisma, service } = setup(false);
      const result = await service.getCooDashboard(senpai);
      expect(prisma.city.findMany).toHaveBeenCalledWith({
        where: { isActive: true, coffeeShops: { some: { isActive: true, ...F } } },
        include: { coffeeShops: { where: { isActive: true, ...F } } },
      });
      expect(result).toMatchObject({ coffeeShops: [], reports: [], cities: [] });
    });
  });
});

describe('Role lists on controllers', () => {
  const srcDir = join(__dirname, '..', '..', 'src');
  const controllers = (readdirSync(srcDir, { recursive: true }) as string[])
    .filter((file) => String(file).endsWith('.controller.ts'))
    .map((file) => ({ file: String(file), source: readFileSync(join(srcDir, String(file)), 'utf8') }));

  it('finds the controllers', () => {
    expect(controllers.length).toBeGreaterThan(5);
  });
  it('lists the senpai wherever the viewer or the leader is allowed (he is both: views supervised shops, runs his own)', () => {
    const missing: string[] = [];
    for (const { file, source } of controllers) {
      for (const match of source.matchAll(/@Roles\(([^)]*)\)/g)) {
        const hasViewer = match[1].includes('UserRole.VIEWER');
        const hasLeader = /UserRole\.LEADER\b/.test(match[1]);
        const hasSenpai = match[1].includes('UserRole.SENPAI');
        if ((hasViewer || hasLeader) !== hasSenpai) missing.push(`${file}: ${match[0]}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
