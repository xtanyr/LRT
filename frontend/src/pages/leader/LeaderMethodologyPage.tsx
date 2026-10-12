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

      <div className="card"><div className="card-title">Производительность</div><p>Значение вводится вручную. Пороги выбираются по количеству напитков за отчётный месяц.</p><table className="table"><thead><tr><th>Напитков</th><th>Целевой ≥</th><th>Ниже цели ≥</th></tr></thead><tbody><tr><td>13 000 и более</td><td>11</td><td>8,5</td></tr><tr><td>10 000–12 999</td><td>8,5</td><td>7,5</td></tr><tr><td>7 000–9 999</td><td>7,5</td><td>6,2</td></tr><tr><td>Менее 7 000</td><td>6,2</td><td>4</td></tr></tbody></table></div>

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
                      <td className="muted">{m.targetValue ?? '—'}</td>
                      <td className="muted">{m.midValue ?? '—'}</td>
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
