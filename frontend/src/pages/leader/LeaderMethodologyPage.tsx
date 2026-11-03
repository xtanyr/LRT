import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import LoadingState from '../../components/LoadingState';
import '../../styles/pages.css';

interface Metric {
  id: number;
  name: string;
  code: string;
  unit: string;
  direction: string;
  targetValue: number | null;
  midValue: number | null;
  ptTarget: number | string | null;
  ptMid: number | string | null;
  pointsStrong?: number | string;
  pointsMedium?: number | string;
  isActive?: boolean;
}

const performanceTiers = [
  ['17 000 и более', '9,5', '9,0'],
  ['16 000–16 999', '9,25', '8,75'],
  ['15 000–15 999', '9,0', '8,5'],
  ['14 000–14 999', '8,8', '8,3'],
  ['13 000–13 999', '8,5', '8,0'],
  ['12 000–12 999', '8,2', '7,7'],
  ['11 000–11 999', '7,8', '7,3'],
  ['10 000–10 999', '7,5', '7,0'],
  ['9 000–9 999', '7,1', '6,6'],
  ['8 000–8 999', '6,6', '6,2'],
  ['7 000–7 999', '6,2', '5,8'],
];

export default function LeaderMethodologyPage() {
  const { search } = useLocation();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get('/metrics');
        setMetrics((res.data.data || res.data || []).filter((metric: Metric) => metric.isActive !== false));
      } catch {
        setError('Не удалось загрузить методику рейтинга. Повторите загрузку.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [reload]);

  if (loading) return <LoadingState />;

  const groups = [
    { title: 'Команда и гости', keys: ['ENPS', 'REVIEW_SPEED', 'GUEST_EXP', 'STANDARDS', 'REVIEW_RATING', 'FREE_ACCESS', 'DEPOSIT'] },
    { title: 'Labor Cost', keys: ['LABOR_COST', 'PERFORMANCE'] },
    { title: 'Себестоимость', keys: ['DESSERT_WRITEOFF', 'PRODUCT_WRITEOFF'] },
  ];
  const maxPoints = metrics.reduce((sum, metric) => sum + Number(metric.pointsStrong ?? metric.ptTarget ?? 0), 0);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Как считается рейтинг</h1>
          <div className="page-sub">актуальные пороги и баллы</div>
        </div>
        <Link className="btn btn-secondary" to={'/report-example'+search}>Пример заполнения отчёта</Link>
      </div>

      {error ? <div className="card"><p className="form-error" role="alert">{error}</p><button className="btn btn-ghost" onClick={() => setReload(value => value + 1)}>Повторить загрузку</button></div> : <>
      <div className="card">
        <div className="card-title">Формула</div>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
          Балл кофейни = сумма баллов по всем метрикам. По каждой метрике определяется зона:
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
          <span className="chip chip-success">Целевой — фиксированные баллы</span>
          <span className="chip chip-warning">Ниже цели — фиксированные баллы</span>
          <span className="chip chip-danger">Критично — 0 баллов</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
          Итоговый балл равен сумме баллов активных метрик. Текущий максимум — {maxPoints.toLocaleString('ru-RU')} баллов. Исторические результаты сохраняются по исходным правилам. Доли затрат считаются как сумма / выручка × 100.
        </p>
      </div>

      <div className="card" data-testid="performance-methodology">
        <div className="card-title">Производительность</div>
        <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6, marginBottom: 12 }}>
          Значение вводится вручную. Пороги зависят от количества напитков за отчётный месяц: чем больше напитков, тем выше требуемая производительность. Значение ниже порога жёлтой зоны попадает в красную и даёт 0 баллов. При менее чем 7 000 напитков за месяц любая производительность считается красной.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Напитков в месяц</th><th>Красная (0 баллов)</th><th>Жёлтая</th><th>Зелёная</th></tr></thead>
            <tbody>
              <tr><td>Менее 7 000</td><td>любая производительность</td><td>—</td><td>—</td></tr>
              {performanceTiers.map(([range, green, yellow]) => (
                <tr key={range}><td>{range}</td><td>&lt; {yellow}</td><td>{yellow}–{(Number(green.replace(',', '.')) - 0.01).toFixed(2).replace('.', ',')}</td><td>{green}–11</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {groups.map((g) => {
        const groupMetrics = metrics.filter((m) => g.keys.includes(m.code));
        if (groupMetrics.length === 0) return null;
        return (
          <div className="card" key={g.title}>
            <div className="card-title">{g.title}</div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Метрика</th>
                    <th>Ед.</th>
                    <th>Направление</th>
                    <th>Целевой</th>
                    <th>Ниже цели</th>
                    <th>Баллы (зелёная)</th>
                    <th>Баллы (жёлтая)</th>
                  </tr>
                </thead>
                <tbody>
                  {groupMetrics.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td className="muted">{m.unit}</td>
                      <td className="muted">{m.direction === 'HIGHER_IS_BETTER' ? '↑' : '↓'}</td>
                      <td className="muted">{m.code === 'PERFORMANCE' ? 'по таблице выше' : (m.targetValue ?? '—')}</td>
                      <td className="muted">{m.code === 'PERFORMANCE' ? 'по таблице выше' : (m.midValue ?? '—')}</td>
                      <td className="muted">{m.pointsStrong ?? m.ptTarget ?? '—'}</td>
                      <td className="muted">{m.pointsMedium ?? m.ptMid ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
      {!metrics.length && <div className="card empty">Активные метрики пока не настроены. Обратитесь к администратору.</div>}
      </>}
    </div>
  );
}
