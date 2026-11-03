import { useRatingColors } from '../../services/rating-colors';
import { computeReportScore, metricZone, type ScoredReport } from '../../services/report-score';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  ptTarget: number;
  ptMid: number;
}

interface Report extends ScoredReport {
  id: number;
  coffeeShopId: number;
  coffeeShop?: { name: string };
  year: number;
  month: number;
  status: string;
  metricValues: Array<{ metricId: number; absoluteValue: string | null; computedPercent: number | null }>;
  analyses: Array<{ questionKey: string; content: string }>;
}





export default function CooReportViewPage() {
  const ratingColor = useRatingColors();
  const { shopName, month } = useParams();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [metricsRes, reportsRes] = await Promise.all([
          api.get('/metrics'),
          api.get('/reports/my').catch(() => ({ data: { data: [] } })),
        ]);
        setMetrics(metricsRes.data.data || metricsRes.data);
        const allReports = reportsRes.data.data || reportsRes.data || [];
        const decodedName = decodeURIComponent(shopName || '');
        const target = allReports.find((r: Report) => {
          const coffeeShopName = r.coffeeShop?.name || '';
          return coffeeShopName === decodedName && r.month.toString() === month;
        });
        setReport(target || null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [shopName, month]);

  if (loading) return <LoadingState />;
  if (!report) return <div className="page">Отчёт не найден</div>;

  const score = computeReportScore(report, metrics);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Отчёт · {report.month}/{report.year}</h1>
          <div className="page-sub">{decodeURIComponent(shopName || '')}</div>
        </div>
      <div className="page-actions">
        <span className={`badge ${report.status === 'SUBMITTED' ? 'chip-success' : 'chip-ghost'}`}>
          {report.status === 'SUBMITTED' ? 'сдан' : 'черновик'}
        </span>
      </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi">
          <div className="kpi-label">Балл</div>
          <div className="kpi-value" style={{ color: ratingColor(score) }}>{score}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Метрик</div>
          <div className="kpi-value">{report.metricValues.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Метрики</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Метрика</th>
                <th>Факт</th>
                <th>Зона</th>
                <th>Баллы</th>
              </tr>
            </thead>
            <tbody>
              {report.metricValues.map((mv) => {
                const metric = metrics.find((m) => m.id === mv.metricId);
                if (!metric) return null;
                const value = mv.absoluteValue ? parseFloat(mv.absoluteValue) : null;
                const zone = metricZone(report, metric.id);
                const pts = report.score?.results?.find(r => r.metricId === metric.id)?.pointsAwarded ?? '—';
                return (
                  <tr key={mv.metricId}>
                    <td>{metric.name}</td>
                    <td className="muted">{value ?? '—'}</td>
                    <td>
                      <span className="chip" style={{
                        background: zone === 'green' ? 'var(--success-tint)' : zone === 'yellow' ? 'var(--warning-tint)' : zone === 'red' ? 'var(--danger-tint)' : undefined,
                        color: zone === 'green' ? 'var(--success)' : zone === 'yellow' ? 'var(--warning)' : zone === 'red' ? 'var(--danger)' : undefined,
                      }}>{zone === 'green' ? 'Целевой' : zone === 'yellow' ? 'Ниже цели' : zone === 'red' ? 'Критично' : '—'}</span>
                    </td>
                    <td className="muted">{pts}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
