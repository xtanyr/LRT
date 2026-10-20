import { api } from './api';

export type ReportDraftPayload = {
  coffeeShopId: number;
  year: number;
  month: number;
  revenue: string | number;
  drinksCount: string | number;
  metricValues: { metricId: number; absoluteValue: string | number | null }[];
  analyses: { questionKey: string; content: string }[];
  formData: Record<string, unknown>;
};

const pendingSaves = new Map<string, Promise<unknown>>();
const keyFor = (shopId: number, year: number, month: number) => `${shopId}:${year}:${month}`;

export function saveReportDraft(payload: ReportDraftPayload) {
  const key = keyFor(payload.coffeeShopId, payload.year, payload.month);
  const pending = pendingSaves.get(key);
  const request = pending
    ? pending.catch(() => undefined).then(() => api.post('/reports/draft', payload))
    : api.post('/reports/draft', payload);

  pendingSaves.set(key, request);
  const clear = () => {
    if (pendingSaves.get(key) === request) pendingSaves.delete(key);
  };
  void request.then(clear, clear);
  return request;
}

export async function waitForReportDraftSave(coffeeShopId: number, year: number, month: number) {
  await pendingSaves.get(keyFor(coffeeShopId, year, month));
}
