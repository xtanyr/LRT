import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from '../contexts/AuthProvider';
import { SelectControl } from '../components/SelectControl';
import LoadingState from '../components/LoadingState';
import { useRatingColors } from '../services/rating-colors';
import '../styles/pages.css';
import './YearlyRatingsPage.css';

type Shop = { id: number; name: string; city: { name: string } };
type Report = { coffeeShopId: number; year: number; month: number; status: string; score?: { rating?: number } | null; submittedBy?: { id: number; name: string } | null };
type Row = { shop: Shop; scores: (number | null)[]; average: number | null; leaders: string[] };
const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
const avg = (values: (number | null)[]) => { const present = values.filter((value): value is number => value !== null); return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null; };

export default function YearlyRatingsPage() {
  const { user, viewAsRole } = useAuth();
  const role = viewAsRole || user?.role;
  const color = useRatingColors();
  const [shops, setShops] = useState<Shop[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.get(role === 'COO' ? '/dashboard/coo' : '/dashboard/city-leader').then((response) => {
      if (!active) return;
      const data = response.data.data || response.data;
      setShops(data.coffeeShops || []);
      setReports(data.reports || []);
    }).catch(() => { if (active) setError('Не удалось загрузить рейтинги. Повторите загрузку.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, reload]);
  const years = useMemo(() => [...new Set(reports.map((report) => report.year))].sort((a, b) => b - a), [reports]);
  useEffect(() => { if (years.length && !years.includes(year)) setYear(years[0]); }, [years, year]);
  const rows: Row[] = shops.map((shop) => {
    const annualReports = reports.filter((report) => report.coffeeShopId === shop.id && report.year === year && report.status === 'SUBMITTED');
    const scores = months.map((_, index) => annualReports.find((report) => report.month === index + 1)?.score?.rating ?? null);
    const leaders = [...new Set(annualReports.map((report) => report.submittedBy?.name).filter((name): name is string => Boolean(name)))];
    return { shop, scores, average: avg(scores), leaders };
  }).sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const cities = role === 'COO' ? [...new Map(rows.map((row) => [row.shop.city.name, rows.filter((candidate) => candidate.shop.city.name === row.shop.city.name)])).entries()] : [];
  const cityScores = months.map((_, index) => avg(rows.map((row) => row.scores[index])));
  const scoreCell = (score: number | null) => <span className="yearly-score" style={{ color: color(score) }}>{score === null ? '—' : score.toFixed(0)}</span>;
  const renderRow = (row: Row) => <tr key={row.shop.id}><td className={role === 'COO' ? 'city-shop-name' : ''}><strong className="yearly-shop-name">{row.shop.name}</strong><div className="yearly-leaders">{row.leaders.length ? row.leaders.join(' · ') : 'Лидер в отчётах не указан'}</div></td>{row.scores.map((score, index) => <td key={index}>{scoreCell(score)}</td>)}<td><strong style={{ color: color(row.average) }}>{row.average?.toFixed(1) ?? '—'}</strong></td></tr>;
  return <div className="page yearly-ratings">
    <div className="page-header"><div><h1 className="page-title">Рейтинги за год</h1><p className="page-sub">{role === 'CITY_LEADER' ? 'Кофейни вашего города, лидеры и сохранённые результаты по месяцам.' : 'Города, кофейни, лидеры и результаты по месяцам.'}</p></div><div className="yearly-filter"><span>Год</span><SelectControl label="Год" value={year} disabled={loading} onChange={(value) => setYear(Number(value))} options={(years.length ? years : [year]).map((value) => ({ value, label: String(value) }))} /></div></div>
    {loading ? <LoadingState variant="panel" label="Собираем годовой рейтинг" /> : error ? <div className="card"><p className="form-error" role="alert">{error}</p><button className="btn btn-ghost" onClick={() => setReload(value => value + 1)}>Повторить загрузку</button></div> : !rows.length ? <div className="card empty">Нет кофеен, доступных для просмотра. Обратитесь к администратору для назначения.</div> : <>
      <div className="yearly-legend"><span>Цвет соответствует настроенным порогам рейтинга. Средний балл учитывает только отправленные отчёты; «—» означает, что результата нет.</span><span>{rows.length} кофеен</span></div>
      <div className="card table-wrap"><table className="table yearly-table"><thead><tr><th>{role === 'COO' ? 'Город / кофейня / лидер' : 'Кофейня / лидер'}</th>{months.map((month) => <th key={month}>{month}</th>)}<th>Средний</th></tr></thead><tbody>{role === 'COO' ? cities.map(([city, cityRows]) => { const scores = months.map((_, index) => avg(cityRows.map((row) => row.scores[index]))); return <Fragment key={city}><tr className="city-average-row"><td><strong>{city}</strong><div className="helper-text">Средний рейтинг города</div></td>{scores.map((score, index) => <td key={index}>{scoreCell(score)}</td>)}<td><strong style={{ color: color(avg(scores)) }}>{avg(scores)?.toFixed(1) ?? '—'}</strong></td></tr>{cityRows.map(renderRow)}</Fragment>; }) : <><tr className="city-average-row"><td><strong>{rows[0].shop.city.name}</strong><div className="helper-text">Средний рейтинг города</div></td>{cityScores.map((score, index) => <td key={index}>{scoreCell(score)}</td>)}<td><strong style={{ color: color(avg(cityScores)) }}>{avg(cityScores)?.toFixed(1) ?? '—'}</strong></td></tr>{rows.map(renderRow)}</>}</tbody></table></div>
    </>}
  </div>;
}
