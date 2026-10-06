import { ForbiddenException } from '@nestjs/common';
import { AccessService } from '../../src/common/access.service';
import { ReportsService } from '../../src/reports/reports.service';

const records = [
  { id: 11, reportId: 51, editedAt: new Date('2026-10-05T10:00:00Z'), editedBy: { id: 4, name: 'Анна' },
    fieldChanged: 'metric:1', oldValue: '"96"', newValue: '"70"',
    report: { id: 51, year: 2026, month: 8, coffeeShop: { id: 7, cityId: 2, name: 'На Ленина' },
      metricValues: [{ metricId: 1, metric: { name: 'eNPS' } }] } },
  { id: 12, reportId: 52, editedAt: new Date('2026-10-05T11:00:00Z'), editedBy: { id: 5, name: 'Иван' },
    fieldChanged: 'analysis:enps_problem', oldValue: '""', newValue: '"Причины"',
    report: { id: 52, year: 2026, month: 9, coffeeShop: { id: 9, cityId: 3, name: 'На Мира' }, metricValues: [] } },
];

function setup() {
  const findMany = jest.fn(async (query) => {
    const scope = query.where?.report?.coffeeShop;
    return records.filter((entry) => !scope ||
      ((!scope.id || scope.id.in.includes(entry.report.coffeeShop.id)) &&
       (!scope.cityId || scope.cityId.in.includes(entry.report.coffeeShop.cityId))));
  });
  const prisma = {
    reportEditLog: { findMany },
    analysisQuestion: { findMany: jest.fn().mockResolvedValue([{ questionKey: 'enps_problem', label: 'Проблемы eNPS' }]) },
  };
  const service = new ReportsService(prisma as any, new AccessService(prisma as any), { get: jest.fn() } as any);
  return { service, findMany, prisma };
}

describe('Report edit history collection', () => {
  it('returns edits only for a leader’s assigned coffee shops with actor and report context', async () => {
    const { service, findMany } = setup();
    const result = await (service as any).getAllEditLogs({ id: 4, role: 'LEADER', coffeeShopAssignments: [{ coffeeShopId: 7 }] });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ editedBy: { name: 'Анна' }, fieldChanged: 'metric:1', oldValue: '"96"', newValue: '"70"',
      report: { year: 2026, month: 8, coffeeShop: { name: 'На Ленина' } } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { report: { coffeeShop: { id: { in: [7] } } } },
      orderBy: [{ editedAt: 'desc' }, { id: 'desc' }],
      include: expect.objectContaining({ editedBy: { select: { id: true, name: true } } }),
    }));
  });

  it('does not show any report history to an unassigned leader', async () => {
    const { service } = setup();
    await expect((service as any).getAllEditLogs({ id: 4, role: 'LEADER' })).resolves.toEqual([]);
  });

  it('restricts city leader history to the assigned cities', async () => {
    const { service } = setup();
    const result = await (service as any).getAllEditLogs({ id: 6, role: 'CITY_LEADER', cityAssignments: [{ cityId: 3 }] });
    expect(result.map((entry: any) => entry.reportId)).toEqual([52]);
    expect(result[0]).toMatchObject({ analysisLabel: 'Проблемы eNPS' });
  });

  it.each(['ADMIN', 'COO'])('allows %s to inspect all report history', async (role) => {
    const { service } = setup();
    const result = await (service as any).getAllEditLogs({ id: 1, role });
    expect(result.map((entry: any) => entry.reportId)).toEqual([51, 52]);
  });

  it('rejects an actor without an authenticated user ID before querying history', async () => {
    const { service, findMany } = setup();
    await expect((service as any).getAllEditLogs({ role: 'LEADER' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(findMany).not.toHaveBeenCalled();
  });
});
