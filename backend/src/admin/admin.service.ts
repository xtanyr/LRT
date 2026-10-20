import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnalysisSection } from '@prisma/client';
import { numberValue } from '../common/validation';
import { metricCodesForAnalysisQuestion } from '../common/analysis-metric-links';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getRatingColorConfig() {
    return this.prisma.ratingColorConfig.findFirst();
  }

  async updateRatingColorConfig(input: { greenThreshold: number; redThreshold: number }, changedById: number) {
    const data = { greenThreshold: numberValue(input.greenThreshold, 'Зелёный порог')!, redThreshold: numberValue(input.redThreshold, 'Красный порог')! };
    if (data.redThreshold < 0 || data.greenThreshold > 100 || data.redThreshold >= data.greenThreshold) throw new BadRequestException('Пороги: 0 ≤ красный < зелёный ≤ 100');
    return this.prisma.$transaction(async tx => {
    const config = await tx.ratingColorConfig.findFirst();
    const result = config ? await tx.ratingColorConfig.update({ where: { id: config.id }, data }) : await tx.ratingColorConfig.create({ data });
    await tx.configChangeLog.create({ data: { changedById, fieldChanged: 'ratingColors', oldValue: JSON.stringify(config), newValue: JSON.stringify(result) } });
    return result;
    });
  }

  async logConfigChange(data: { changedById: number; fieldChanged: string; oldValue?: string; newValue?: string }) {
    return this.prisma.configChangeLog.create({
      data,
      include: { changedBy: { select: { id: true, name: true } } },
    });
  }

  async getConfigChangeLogs() {
    return this.prisma.configChangeLog.findMany({
      include: { changedBy: { select: { id: true, name: true } } },
      orderBy: { changedAt: 'desc' },
    });
  }

  async getAnalysisQuestions() {
    const questions = await this.prisma.analysisQuestion.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
    return questions.map(question => ({
      ...question,
      metricCodes: metricCodesForAnalysisQuestion(question),
    }));
  }

  async getTriggerConfigs() {
    return this.prisma.triggerConfig.findMany();
  }

  async getUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true, name: true, email: true, role: true, approvedAt: true,
        cityAssignments: { include: { city: true } },
        coffeeShopAssignments: { include: { coffeeShop: { include: { city: true } } } },
      },
    });
  }

  async createAnalysisQuestion(data: { section: AnalysisSection; questionKey: string; label: string; displayOrder?: number }) {
    return this.prisma.analysisQuestion.create({
      data: {
        ...data,
        displayOrder: data.displayOrder ?? 0,
      },
    });
  }

  async updateAnalysisQuestion(id: number, data: { label?: string; isActive?: boolean; displayOrder?: number }) {
    return this.prisma.analysisQuestion.update({
      where: { id },
      data,
    });
  }

  async removeAnalysisQuestion(id: number) {
    return this.prisma.analysisQuestion.update({ where: { id }, data: { isActive: false } });
  }
}
