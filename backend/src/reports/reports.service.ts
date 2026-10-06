import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService, Actor } from '../common/access.service';
import { reportPeriodState } from '../common/report-period';
import { nonNegativeNumberValue, numberValue, positiveId } from '../common/validation';
import { calculateScore } from '../scoring/rating-calculator';

const includeReport = {
  coffeeShop: { include: { city: true } },
  metricValues: { include: { metric: true } },
  analyses: true,
  submittedBy: { select: { id: true, name: true } },
};
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService, private readonly config: ConfigService) {}

  getEditingPolicy() {
    return { historicalEditingEnabled: this.config.get<string>('ALLOW_HISTORICAL_REPORT_EDITING') === 'true' };
  }

  private decorate(report: any, metrics: any[]) {
    if (!report) return null;
    const state = reportPeriodState(report.year, report.month);
    const imported = report.ratingSnapshot?.source?.policy === 'preserve-source-score';
    const isLocked = Boolean(imported || report.isLocked || state.locked);
    return { ...report, isLocked, isEditable: !imported && (!isLocked || this.getEditingPolicy().historicalEditingEnabled),
      status: report.status === 'SUBMITTED' ? 'SUBMITTED' : state.overdue ? 'OVERDUE' : 'NOT_FILLED',
      score: isLocked ? report.ratingSnapshot : calculateScore(metrics, report) };
  }
  private editable(report: any) {
    if (report.ratingSnapshot?.source?.policy === 'preserve-source-score') throw new ForbiddenException('Импортированный исторический отчёт доступен только для чтения: исходный рейтинг сохраняется.');
    const state = reportPeriodState(report.year, report.month);
    if ((report.isLocked || state.locked) && !this.getEditingPolicy().historicalEditingEnabled) throw new ForbiddenException('Исторический отчёт доступен только для чтения');
  }
  async getReports(coffeeShopId: number, year: number, month: number, user: Actor) {
    await this.access.requireShop(user, coffeeShopId);
    reportPeriodState(year, month);
    const report = await this.prisma.monthlyReport.findUnique({ where: { coffeeShopId_year_month: { coffeeShopId, year, month } }, include: includeReport });
    return this.decorate(report, await this.prisma.metric.findMany({ where: { isActive: true } }));
  }
  async getReportById(id: number, user: Actor) {
    await this.access.requireReport(user, id);
    return this.decorate(await this.prisma.monthlyReport.findUnique({ where: { id }, include: includeReport }), await this.prisma.metric.findMany({ where: { isActive: true } }));
  }
  async getReportsByUser(user: Actor) {
    const reports = await this.prisma.monthlyReport.findMany({ where: { coffeeShop: this.access.shopWhere(user) }, include: includeReport, orderBy: [{ year: 'desc' }, { month: 'desc' }] });
    const metrics = await this.prisma.metric.findMany({ where: { isActive: true }, orderBy: { displayOrder: 'asc' } });
    return reports.map(r => this.decorate(r, metrics));
  }
  async createOrUpdateDraft(data: any, user: Actor) {
    if (!data || typeof data !== 'object' || (data.metricValues !== undefined && !Array.isArray(data.metricValues)) || (data.analyses !== undefined && !Array.isArray(data.analyses)) || (data.formData !== undefined && (!data.formData || typeof data.formData !== 'object' || Array.isArray(data.formData)))) throw new BadRequestException('Некорректная структура отчёта');
    const coffeeShopId = positiveId(data.coffeeShopId), year = Number(data.year), month = Number(data.month);
    const shop = await this.access.requireShop(user, coffeeShopId);
    if (!shop.isActive) throw new ForbiddenException('Кофейня закрыта');
    this.editable({ year, month });
    const revenue = numberValue(data.revenue ?? 0, 'Выручка')!, drinksCount = numberValue(data.drinksCount ?? 0, 'Напитки')!;
    if (revenue < 0 || drinksCount < 0 || !Number.isInteger(drinksCount)) throw new BadRequestException('Выручка неотрицательна, напитки — целое неотрицательное число');
    const where = { coffeeShopId_year_month: { coffeeShopId, year, month } };
    const existing = await this.prisma.monthlyReport.findUnique({ where });
    if (existing) this.editable(existing);
    const metrics = await this.prisma.metric.findMany({ where: { isActive: true } });
    const values = (data.metricValues || []).map((v: any) => {
      const metricId = positiveId(v?.metricId);
      const metric = metrics.find(m => m.id === metricId);
      if (!metric) throw new BadRequestException('Неизвестная или архивная метрика');
      return { metricId, absoluteValue: nonNegativeNumberValue(v.absoluteValue, metric.name, true) };
    });
    const questions = await this.prisma.analysisQuestion.findMany({ where: { isActive: true } });
    const analyses = (data.analyses || []).map((a: any) => {
      if (!a || !questions.some(q => q.questionKey === a.questionKey) || typeof a.content !== 'string' || a.content.length > 20000) throw new BadRequestException('Некорректный ответ анализа');
      return { questionKey: a.questionKey, content: a.content };
    });
    const formData: Record<string, number | string | null> = {};
    for (const [key, value] of Object.entries(data.formData || {})) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(key)) throw new BadRequestException('Некорректное поле формы');
      if (key === 'giftsLink' || key === 'equipmentLink') {
        if (value === '' || value === null) { formData[key] = null; continue; }
        try { const url = new URL(String(value)); if (!['http:', 'https:'].includes(url.protocol) || url.href.length > 2000) throw new Error(); formData[key] = url.href; }
        catch { throw new BadRequestException('Ссылка должна начинаться с https:// или http://'); }
      } else formData[key] = nonNegativeNumberValue(value, 'Показатель отчёта', true);
    }
    return this.prisma.$transaction(async tx => {
      const before = await tx.monthlyReport.findUnique({ where, include: includeReport });
      if (before) this.editable(before);
      const saved = await tx.monthlyReport.upsert({ where,
        create: { coffeeShopId, year, month, revenue, drinksCount, formData },
        update: { revenue, drinksCount, ...(data.formData !== undefined ? { formData } : {}) } });
      for (const value of values) await tx.metricValue.upsert({ where: { reportId_metricId: { reportId: saved.id, metricId: value.metricId } }, create: { reportId: saved.id, ...value }, update: { absoluteValue: value.absoluteValue } });
      for (const a of analyses) await tx.reportAnalysis.upsert({ where: { reportId_questionKey: { reportId: saved.id, questionKey: a.questionKey } }, create: { reportId: saved.id, ...a }, update: { content: a.content } });
      const after = await tx.monthlyReport.findUniqueOrThrow({ where: { id: saved.id }, include: includeReport });
      const snapshot = calculateScore(metrics, after);
      await tx.monthlyReport.update({ where: { id: saved.id }, data: { ratingSnapshot: snapshot as any } });
      for (const r of snapshot.results) await tx.metricValue.updateMany({ where: { reportId: saved.id, metricId: r.metricId }, data: { computedPercent: r.computedPercent, zone: r.zone, pointsAwarded: r.pointsAwarded } });
      const changes: [string, unknown, unknown][] = [['revenue', before?.revenue?.toString(), String(revenue)], ['drinksCount', before?.drinksCount, drinksCount]];
      const previousFormData = before?.formData && typeof before.formData === 'object' && !Array.isArray(before.formData) ? before.formData : {};
      const nextFormData = after.formData && typeof after.formData === 'object' && !Array.isArray(after.formData) ? after.formData : {};
      for (const key of new Set([...Object.keys(previousFormData), ...Object.keys(nextFormData)])) {
        changes.push([`formData:${key}`, previousFormData[key], nextFormData[key]]);
      }
      for (const v of values) changes.push([`metric:${v.metricId}`, before?.metricValues.find(m => m.metricId === v.metricId)?.absoluteValue?.toString() ?? null, v.absoluteValue?.toString() ?? null]);
      for (const a of analyses) changes.push([`analysis:${a.questionKey}`, before?.analyses.find(x => x.questionKey === a.questionKey)?.content ?? '', a.content]);
      for (const [fieldChanged, oldValue, newValue] of changes) if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) await tx.reportEditLog.create({ data: { reportId: saved.id, editedById: user.id!, fieldChanged, oldValue: JSON.stringify(oldValue) ?? null, newValue: JSON.stringify(newValue) ?? null } });
      return this.decorate({ ...after, ratingSnapshot: snapshot }, metrics);
    });
  }
  async updateMetricValue(id: number, metricId: number, data: any, user: Actor) {
    const report = await this.access.requireReport(user, id);
    return this.createOrUpdateDraft({ ...report, metricValues: [{ metricId, absoluteValue: data.absoluteValue }] }, user);
  }
  async updateAnalysis(id: number, questionKey: string, content: string, user: Actor) {
    const report = await this.access.requireReport(user, id);
    return this.createOrUpdateDraft({ ...report, analyses: [{ questionKey, content }] }, user);
  }
  async submitReport(id: number, user: Actor) {
    await this.access.requireReport(user, id);
    return this.prisma.$transaction(async tx => {
      const report = await tx.monthlyReport.findUniqueOrThrow({ where: { id }, include: includeReport });
      this.editable(report);
      const metrics = await tx.metric.findMany({ where: { isActive: true } });
      if (Number(report.revenue) <= 0 || !report.drinksCount || metrics.some(m => !report.metricValues.some(v => v.metricId === m.id && v.absoluteValue !== null))) throw new BadRequestException('Заполните выручку, напитки и все метрики');
      const snapshot = calculateScore(metrics, report);
      if (snapshot.results.some(r => r.zone === null)) throw new BadRequestException('Не все метрики можно рассчитать');
      const submittedAt = new Date();
      const saved = await tx.monthlyReport.update({ where: { id }, data: { status: 'SUBMITTED', submittedAt, submittedById: report.submittedById || user.id, ratingSnapshot: snapshot as any }, include: includeReport });
      if (report.status !== 'SUBMITTED') await tx.reportEditLog.create({ data: { reportId: id, editedById: user.id!, fieldChanged: 'status', oldValue: report.status, newValue: 'SUBMITTED' } });
      if (report.submittedAt?.getTime() !== submittedAt.getTime()) await tx.reportEditLog.create({ data: { reportId: id, editedById: user.id!, fieldChanged: 'submittedAt', oldValue: report.submittedAt?.toISOString() ?? null, newValue: submittedAt.toISOString() } });
      return this.decorate(saved, metrics);
    });
  }
  async getAllEditLogs(user: Actor) {
    const logs = await this.prisma.reportEditLog.findMany({
      where: { report: { coffeeShop: this.access.shopWhere(user) } },
      include: {
        editedBy: { select: { id: true, name: true } },
        report: { select: {
          id: true, year: true, month: true,
          coffeeShop: { select: { id: true, name: true } },
          metricValues: { select: { metricId: true, metric: { select: { name: true } } } },
        } },
      },
      orderBy: [{ editedAt: 'desc' }, { id: 'desc' }],
    });
    const questionKeys = [...new Set(logs.filter(log => log.fieldChanged.startsWith('analysis:')).map(log => log.fieldChanged.slice('analysis:'.length)))];
    const questions = questionKeys.length ? await this.prisma.analysisQuestion.findMany({
      where: { questionKey: { in: questionKeys } }, select: { questionKey: true, label: true },
    }) : [];
    const labels = new Map(questions.map(question => [question.questionKey, question.label]));
    return logs.map(log => {
      const analysisLabel = log.fieldChanged.startsWith('analysis:') ? labels.get(log.fieldChanged.slice('analysis:'.length)) : undefined;
      return analysisLabel ? { ...log, analysisLabel } : log;
    });
  }
  async getEditLogs(id: number, user: Actor) {
    await this.access.requireReport(user, id);
    return this.prisma.reportEditLog.findMany({ where: { reportId: id }, include: { editedBy: { select: { id: true, name: true } } }, orderBy: { editedAt: 'desc' } });
  }
}
