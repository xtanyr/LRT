import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../contexts/AuthProvider';
import LoadingState from '../../components/LoadingState';
import '../../styles/pages.css';

interface ConfigEntry {
  id: number;
  changedAt: string;
  changedBy: { name: string };
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
}

interface ReportContext {
  id: number;
  year: number;
  month: number;
  coffeeShop: { id: number; name: string };
  metricValues: { metricId: number; metric: { name: string } }[];
}

interface ReportEntry {
  id: number;
  reportId: number;
  editedAt: string;
  editedBy: { id: number; name: string };
  fieldChanged: string;
  oldValue: string | null;
  newValue: string | null;
  report: ReportContext;
  analysisLabel?: string;
}

interface HistoryEntry extends ConfigEntry {
  rowId: string;
  source: 'config' | 'report';
  report?: ReportContext;
  analysisLabel?: string;
}

const CATEGORIES = [
  { key: 'ALL', label: 'Все' },
  { key: 'report', label: 'Отчёты' },
  { key: 'metric', label: 'Метрики' },
  { key: 'threshold', label: 'Пороги' },
  { key: 'structure', label: 'Структура' },
  { key: 'user', label: 'Пользователи' },
  { key: 'rating', label: 'Рейтинг' },
  { key: 'trigger', label: 'Триггеры' },
] as const;

const FORM_FIELDS: Record<string, string> = {
  inps: 'ИНПС', gifts: 'Подарки, ₽', personnelCosts: 'Расходы на персонал, ₽',
  freeAccess: 'Свободный доступ, ₽', adminCosts: 'Административные затраты, ₽',
  rent: 'Аренда, ₽', equipment: 'Оборудование, материалы, ремонт, ₽',
  revenuePlan: 'План выручки', drinksPlan: 'План напитков',
  giftsLink: 'Ссылка на подарки', equipmentLink: 'Ссылка на план затрат на оборудование',
};

async function fetchEntries<T>(url: string): Promise<T[]> {
  const response = await api.get(url);
  const data = response.data?.data ?? response.data;
  if (!Array.isArray(data)) throw new Error('Некорректный ответ истории');
  return data;
}

function formObject(value: string | null): Record<string, unknown> | null {
  if (value === null) return {};
  try {
    const parsed = JSON.parse(value);
    if (parsed === null) return {};
    return typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function reportEntries(entry: ReportEntry): HistoryEntry[] {
  const normalized: HistoryEntry = {
    ...entry, rowId: `report:${entry.id}`, source: 'report',
    changedAt: entry.editedAt, changedBy: entry.editedBy,
  };
  if (entry.fieldChanged !== 'formData') return [normalized];
  const before = formObject(entry.oldValue), after = formObject(entry.newValue);
  if (!before || !after) return [normalized];
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      ...normalized, rowId: `${normalized.rowId}:${key}`, fieldChanged: `formData:${key}`,
      oldValue: JSON.stringify(before[key] ?? null), newValue: JSON.stringify(after[key] ?? null),
    }));
}

function contextLabel(entry: HistoryEntry): string {
  if (!entry.report) return 'Конфигурация';
  return `${entry.report.coffeeShop.name} · ${String(entry.report.month).padStart(2, '0')}/${entry.report.year}`;
}

function fieldLabel(entry: HistoryEntry): string {
  const field = entry.fieldChanged, parts = field.split(':');
  if (entry.source === 'report') {
    const metricName = (id: number) => entry.report?.metricValues.find((value) => value.metricId === id)?.metric.name || `Метрика #${id}`;
    if (field === 'revenue') return 'Выручка, ₽';
    if (field === 'drinksCount') return 'Количество напитков';
    if (field === 'status') return 'Статус отчёта';
    if (field === 'submittedAt') return 'Дата отправки';
    if (parts[0] === 'metric') return `${metricName(Number(parts[1]))} · факт`;
    if (parts[0] === 'analysis') return `Анализ: ${entry.analysisLabel || parts.slice(1).join(':')}`;
    if (field === 'formData') return 'Данные формы';
    if (parts[0] === 'formData') {
      const key = parts[1];
      const metricPlan = /^metricPlan_(\d+)$/.exec(key);
      if (metricPlan) return `План: ${metricName(Number(metricPlan[1]))}`;
      if (FORM_FIELDS[key]) return FORM_FIELDS[key];
      if (key.endsWith('Plan') && FORM_FIELDS[key.slice(0, -4)]) return `План: ${FORM_FIELDS[key.slice(0, -4)]}`;
      return `Поле формы: ${key}`;
    }
    return field;
  }
  const actions: Record<string, string> = { create: 'создание', update: 'изменение', archive: 'архивация', restore: 'восстановление' };
  if (parts[0] === 'metric') return `Метрика #${parts[1]} · ${actions[parts[2]] || parts[2] || 'изменение'}`;
  if (parts[0] === 'structure' && parts[1] === 'coffee-shop') return `Кофейня #${parts[2]} · ${actions[parts[3]] || 'изменение'}`;
  if (parts[0] === 'structure' && parts[1] === 'city') return `Город #${parts[2]} · ${actions[parts[3]] || 'изменение'}`;
  if (parts[0] === 'user') return `Пользователь #${parts[1]}`;
  if (parts[0] === 'trigger') return `Триггер #${parts[1]}`;
  if (parts[0] === 'ipv') return `ИПВ #${parts[1]}`;
  if (parts[0] === 'import') return `Импорт отчёта #${parts[1]}`;
  if (field === 'ratingColors') return 'Цветовые пороги рейтинга';
  return field;
}

function valueLabel(entry: HistoryEntry, value: string | null): string {
  if (value === null) return '—';
  if (value === '') return 'Пусто';
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { parsed = value; }
  if (parsed === null) return '—';
  if (parsed === '') return 'Пусто';
  if (entry.source === 'report' && entry.fieldChanged === 'submittedAt' && typeof parsed === 'string') {
    const date = new Date(parsed);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК';
  }
  if (entry.source === 'report' && entry.fieldChanged === 'status') {
    const statuses: Record<string, string> = { NOT_FILLED: 'Не заполнено', OVERDUE: 'Просрочено', SUBMITTED: 'Отправлен' };
    return statuses[String(parsed)] || String(parsed);
  }
  if (typeof parsed !== 'object') return String(parsed);
  const labels: Array<[string, string]> = [
    ['name', 'Название'], ['code', 'Код'], ['role', 'Роль'], ['isActive', 'Активна'],
    ['thresholdStrong', 'Цель'], ['thresholdMedium', 'Ниже цели'],
    ['pointsStrong', 'Баллы цели'], ['pointsMedium', 'Баллы ниже цели'],
    ['greenThreshold', 'Зелёная граница'], ['redThreshold', 'Красная граница'],
  ];
  const object = parsed as Record<string, unknown>;
  const summary = labels.filter(([key]) => Object.prototype.hasOwnProperty.call(object, key))
    .map(([key, label]) => `${label}: ${typeof object[key] === 'boolean' ? (object[key] ? 'да' : 'нет') : object[key]}`);
  return summary.length ? summary.join(' · ') : JSON.stringify(parsed);
}

export default function AdminHistoryPage() {
  const { user, viewAsRole } = useAuth();
  const role = viewAsRole || user?.role;
  const canViewConfig = role === 'ADMIN';
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<string>('ALL');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setEntries([]);
    if (!canViewConfig) setCategory('ALL');
    void (async () => {
      const [reports, configs] = await Promise.allSettled([
        fetchEntries<ReportEntry>('/reports/edit-logs'),
        canViewConfig ? fetchEntries<ConfigEntry>('/admin/config-logs') : Promise.resolve([]),
      ]);
      if (!active) return;
      const combined: HistoryEntry[] = [];
      const errors: string[] = [];
      if (reports.status === 'fulfilled') combined.push(...reports.value.flatMap(reportEntries));
      else errors.push('Не удалось загрузить историю отчётов.');
      if (configs.status === 'fulfilled') combined.push(...configs.value.map((entry): HistoryEntry => ({ ...entry, source: 'config', rowId: `config:${entry.id}` })));
      else errors.push('Не удалось загрузить историю конфигурации.');
      combined.sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt) || b.id - a.id || a.rowId.localeCompare(b.rowId));
      setEntries(combined);
      setError(errors.join(' '));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [role, refresh]);

  const categories = CATEGORIES.filter((item) => canViewConfig || item.key === 'ALL' || item.key === 'report');
  const filtered = entries.filter((entry) => category === 'ALL' || (category === 'report'
    ? entry.source === 'report'
    : entry.source === 'config' && entry.fieldChanged.includes(category)));

  const csvCell = (value: string) => {
    const formula = /^[\s\u0000-\u001f\u007f-\u009f]*[=+\-@]/.test(value);
    const negativeNumber = /^-(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(value);
    const text = formula && !negativeNumber ? `'${value}` : value;
    return `"${text.replaceAll('"', '""')}"`;
  };

  const exportCsv = () => {
    const header = 'Дата;Пользователь;Объект;Поле;Было;Стало';
    const rows = filtered.map((e) => {
      const date = new Date(e.changedAt).toLocaleString('ru-RU');
      return [date, e.changedBy?.name || '—', contextLabel(e), fieldLabel(e), valueLabel(e, e.oldValue), valueLabel(e, e.newValue)].map(csvCell).join(';');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `history_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingState />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">История изменений</h1>
          <div className="page-sub">{canViewConfig ? 'аудит: отчёты, метрики, структура, права' : 'аудит изменений отчётов'}</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setRefresh((value) => value + 1)}>Обновить</button>
          <button className="btn btn-ghost btn-sm" disabled={filtered.length === 0} onClick={exportCsv}>Экспорт CSV</button>
        </div>
      </div>

      <div className="tabs">
        {categories.map((c) => (
          <button key={c.key} className={`tab${category === c.key ? ' active' : ''}`} onClick={() => setCategory(c.key)}>
            {c.label}
          </button>
        ))}
      </div>

      {error && <div className="page-sub" role="alert">{error}</div>}
      <div className="page-sub" aria-live="polite">{`Записей: ${filtered.length}`}</div>

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Пользователь</th>
                <th>Объект</th>
                <th>Поле</th>
                <th>Было</th>
                <th>Стало</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.rowId}>
                  <td className="muted">{new Date(e.changedAt).toLocaleString('ru-RU')}</td>
                  <td>{e.changedBy?.name || '—'}</td>
                  <td>{contextLabel(e)}</td>
                  <td>{fieldLabel(e)}</td>
                  <td className="muted audit-value" title={e.oldValue ?? undefined}>{valueLabel(e, e.oldValue)}</td>
                  <td className="audit-value" title={e.newValue ?? undefined}>{valueLabel(e, e.newValue)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={6} className="empty">{error || 'Нет записей'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
