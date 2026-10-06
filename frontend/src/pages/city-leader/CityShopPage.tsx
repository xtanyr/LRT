import { useRatingColors } from '../../services/rating-colors';
import { computeReportScore, metricZone, type ScoredReport } from '../../services/report-score';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
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
  status: string;
  year: number;
  month: number;
  submittedAt: string | null;
  metricValues: Array<{ metricId: number; absoluteValue: string | null; computedPercent: number | null }>;
}

interface IPVStatus {
  id: number;
  coffeeShopId: number;
  status: string;
  rule: string;
  severity: string;
  triggeredAt: string;
  metricId: number | null;
  metricName: string | null;
  daysOverdue: number;
  closeReason?: string | null;
}

interface Comment {
  id: number;
  text: string;
  createdAt: string;
  author: { name: string };
}





export default function CityShopPage() {
  const ratingColor = useRatingColors();
  const { shopId } = useParams();
  const [shop, setShop] = useState<{ id: number; name: string; city: { name: string }; leader: { name: string } | null } | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [ipvStatuses, setIpvStatuses] = useState<IPVStatus[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [ipvError, setIpvError] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let active=true;
    const load = async () => {
      if (!shopId) return;
      setLoading(true);setShop(null);setIpvError('');setLoadError('');
      try {
        const [shopRes, metricsRes, reportsRes, ipvRes, commentsRes] = await Promise.all([
          api.get(`/coffee-shops/${shopId}`),
          api.get('/metrics'),
          api.get(`/reports/coffee-shop/${shopId}/${new Date().getFullYear()}/${new Date().getMonth() + 1}`).catch(() => ({ data: null })),
          api.get(`/ipv-triggers/statuses?coffeeShopId=${shopId}`).catch(() => {if(active)setIpvError('Не удалось загрузить триггеры. Обновите страницу.');return { data: [] };}),
          api.get(`/comments/coffee-shop/${shopId}`).catch(() => ({ data: { data: [] } })),
        ]);
        if(!active)return;
        const shopData = shopRes.data.data || shopRes.data;
        setShop({
          id: shopData.id,
          name: shopData.name,
          city: shopData.city,
          leader: shopData.leader || null,
        });
        setMetrics(metricsRes.data.data || metricsRes.data);
        const reportData = reportsRes.data;
        if (reportData && reportData.data) {
          setReports([reportData.data]);
        } else if (reportData) {
          setReports([reportData]);
        } else {
          setReports([]);
        }
        setIpvStatuses((ipvRes.data.data || ipvRes.data || []).filter((item:IPVStatus)=>item.coffeeShopId===Number(shopId)));
        setComments(commentsRes.data.data || commentsRes.data || []);
      } catch {if(active)setLoadError('Не удалось загрузить кофейню. Обновите страницу.');}
      finally {
        if(active)setLoading(false);
      }
    };
    load();
    return()=>{active=false;};
  }, [shopId]);

  const currentReport = reports[0];
  const score = currentReport ? computeReportScore(currentReport, metrics) : null;

  if (loading) return <LoadingState />;
  if (!shop) return <div className="page">{loadError?<p role="alert">{loadError}</p>:'Кофейня не найдена'}</div>;

  const cityName = shop.city?.name || '—';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-sub">Кофейня</div>
          <h1 className="page-title">«{shop.name}»</h1>
          <div className="page-sub">{cityName}</div>
        </div>
        {score != null && (
          <div className="kpi" style={{ minWidth: 120 }}>
            <div className="kpi-label">Балл</div>
            <div
              className="kpi-value"
              style={{ color: ratingColor(score) }}
            >
              {score}
            </div>
          </div>
        )}
      </div>

      {currentReport && (
        <div className="card">
          <div className="card-title">Метрики</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Метрика</th>
                  <th>Факт</th>
                  <th>Целевой</th>
                  <th>Ниже цели</th>
                  <th>Критично</th>
                  <th>Зона</th>
                  <th>Баллы</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const mv = currentReport.metricValues.find((x) => x.metricId === m.id);
                  const value = mv?.absoluteValue ? parseFloat(mv.absoluteValue) : null;
                  const zone = metricZone(currentReport, m.id);
                  const pts = currentReport?.score?.results?.find(r => r.metricId === m.id)?.pointsAwarded ?? '—';
                  return (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td className="muted">{value ?? '—'}</td>
                      <td className="muted">{m.targetValue ?? '—'}</td>
                      <td className="muted">{m.midValue ?? '—'}</td>
                      <td className="muted">{m.direction === 'HIGHER_IS_BETTER' ? `< ${m.midValue}` : `> ${m.midValue}`}</td>
                      <td>
                        <span
                          className="chip"
                          style={{
                            background: zone === 'green' ? 'var(--success-tint)' : zone === 'yellow' ? 'var(--warning-tint)' : zone === 'red' ? 'var(--danger-tint)' : undefined,
                            color: zone === 'green' ? 'var(--success)' : zone === 'yellow' ? 'var(--warning)' : zone === 'red' ? 'var(--danger)' : undefined,
                            borderColor: zone === 'green' ? '#c8e2d2' : zone === 'yellow' ? '#f0e3b8' : zone === 'red' ? '#f0d3cd' : undefined,
                          }}
                        >
                          {zone === 'green' ? 'Целевой' : zone === 'yellow' ? 'Ниже цели' : zone === 'red' ? 'Критично' : '—'}
                        </span>
                      </td>
                      <td className="muted">{pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-title">Отчёты по периодам</div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Период</th>
                <th>Балл</th>
                <th>Статус</th>
                <th>Подано</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const rScore = computeReportScore(r, metrics);
                return (
                  <tr key={`${r.year}-${r.month}`}>
                    <td>{r.month}/{r.year}</td>
                    <td
                      style={{
                        color: ratingColor(rScore),
                        fontWeight: 600,
                      }}
                    >
                      {rScore}
                    </td>
                    <td>
                      <span className={`chip ${r.status === 'SUBMITTED' ? 'chip-success' : 'chip-ghost'}`}>
                        {r.status === 'SUBMITTED' ? 'сдан' : 'черновик'}
                      </span>
                    </td>
                    <td className="muted">{r.submittedAt ? new Date(r.submittedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК' : '—'}</td>
                  </tr>
                );
              })}
              {reports.length === 0 && <tr><td colSpan={4} className="empty">Нет отчётов</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Триггеры ИПВ</div>
        <Link to="/triggers">Открыть мониторинг ИПВ</Link>
        {ipvError?<p role="alert">{ipvError}</p>:ipvStatuses.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Правило</th>
                  <th>Выявлен</th>
                  <th>Критичность</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {ipvStatuses.map((ipv) => (
                  <tr key={ipv.id}>
                    <td>{ipv.rule}{ipv.rule==='T3'&&<div className="helper-text">{ipv.metricName||`Метрика #${ipv.metricId??'—'}`}</div>}{ipv.closeReason&&<div className="helper-text">Итог: {ipv.closeReason}</div>}</td>
                    <td>{ipv.triggeredAt?new Date(ipv.triggeredAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'—'}</td>
                    <td>
                      <span className={`chip ${ipv.severity?.toLowerCase() === 'critical' ? 'chip-danger' : 'chip-warning'}`}>Требует внимания</span>
                    </td>
                    <td><span className="chip chip-ghost">{ipv.status==='NOT_STARTED'?'🔔 Не начат':ipv.status==='IN_PROGRESS'?'⏳ В работе':'Завершён'}</span>{ipv.daysOverdue>0&&<div className="helper-text">🔴 Просрочен на {ipv.daysOverdue} дн.</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">Нет активных триггеров</div>
        )}
      </div>

      <div className="card">
        <div className="card-title">Комментарии</div>
        {comments.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {comments.map((c) => (
              <div key={c.id} style={{ borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginBottom: 2 }}>
                  {c.author.name} · {new Date(c.createdAt).toLocaleString('ru-RU')}
                </div>
                <div style={{ fontSize: 13 }}>{c.text}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">Нет комментариев</div>
        )}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            className="input"
            placeholder="Добавить комментарий..."
            id="comment-input"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" onClick={async () => {
            const input = document.getElementById('comment-input') as HTMLInputElement | null;
            const text = input?.value.trim();
            if (!text) return;
            try {
              await api.post('/comments', { coffeeShopId: shop.id, text });
              if (input) input.value = '';
              const res = await api.get(`/comments/coffee-shop/${shop.id}`);
              setComments(res.data.data || res.data || []);
            } catch {
              // silent
            }
          }}>
            Отправить
          </button>
        </div>
      </div>
    </div>
  );
}
