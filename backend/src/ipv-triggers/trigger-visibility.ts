import { getCurrentLeaders, TriggerAssignment, TriggerConfiguration } from './trigger-evaluation';
import { monthsOld } from './trigger-rules';

export const triggerLeaderInclude = {
  assignments: {
    include: {
      user: {
        select: {
          id: true, name: true, role: true, approvedAt: true,
          exemptions: { where: { isActive: true }, select: { id: true, reason: true, setById: true, isActive: true } },
        },
      },
    },
  },
};

export function currentAssignmentWhere(now = new Date()) {
  return { assignedFrom: { lte: now }, OR: [{ assignedUntil: null }, { assignedUntil: { gt: now } }] };
}

// Clearing an exemption restores the saved signal: no event or notification is deleted.
export function isPendingTriggerSuppressed(shop: { assignments: TriggerAssignment[] }, now = new Date(), config?: TriggerConfiguration) {
  if (!config?.isActive) return true;
  const leaders = getCurrentLeaders(shop.assignments, now);
  return !leaders.some(a => monthsOld(a.assignedFrom, config.minMonthsOnPosition, now)
    && monthsOld(a.user.approvedAt, config.minMonthsSinceApproval, now)
    && !a.user.exemptions.some(e => e.isActive !== false));
}
