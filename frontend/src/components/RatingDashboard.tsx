import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useRatingColors } from '../services/rating-colors';
import type { ScoreSnapshot } from '../services/report-score';
import './RatingDashboard.css';
import { MonthPicker, SelectControl } from './SelectControl';
import LoadingState from './LoadingState';
type Shop = {id:number;name:string;cityId:number;city:{name:string}};
type Report = {id:number;coffeeShopId:number;year:number;month:number;status:string;submittedAt?:string|null;score:ScoreSnapshot|null};
type IPV = {id:number;coffeeShopId:number;status:string;triggerCode:string;triggeredAt:string};
const reportStatusLabels = {SUBMITTED:'Заполнено',DRAFT:'Черновик',NOT_FILLED:'Не заполнено',OVERDUE:'Просрочено'};
export default function RatingDashboard({mode}:{mode:'leader'|'city'|'shops'|'cities'|'reports'}) {
 const ratingColor=useRatingColors();
 const isCooOverview=mode==='shops'||mode==='cities';
 const canFilterStatus=isCooOverview||mode==='reports';
 const [searchParams]=useSearchParams();
 const now=new Date(Date.now()+10800000), last=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1));
 const [period,setPeriod]=useState(last.getUTCFullYear()+'-'+String(last.getUTCMonth()+1).padStart(2,'0'));
 const [shops,setShops]=useState<Shop[]>([]),[reports,setReports]=useState<Report[]>([]),[ipv,setIpv]=useState<IPV[]>([]);
 const [cityId,setCityId]=useState(0),[shopId,setShopId]=useState(0),[search,setSearch]=useState(''),[ascending,setAscending]=useState(false);
 const [statusFilter,setStatusFilter]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;api.get('/dashboard/'+(mode==='leader'?'leader':mode==='city'?'city-leader':'coo')).then(r=>{if(!active)return;const data=r.data.data||r.data;setShops(data.coffeeShops||[]);setReports(data.reports||[]);setIpv(data.ipvStatuses||[]);setShopId(data.coffeeShops?.[0]?.id||0);}).catch(()=>{if(active)setError('Не удалось загрузить рейтинг. Обновите страницу.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[mode]);
 const [year,month]=period.split('-').map(Number);
 const periodIndex=year*12+month-1;
 const current=reports.filter(r=>r.year===year&&r.month===month);
 const reportState=(r?:Report):keyof typeof reportStatusLabels=>r?.status==='SUBMITTED'?'SUBMITTED':r?.status==='OVERDUE'?'OVERDUE':r?'DRAFT':Date.now()>=Date.UTC(year,month,10,9)?'OVERDUE':'NOT_FILLED';
 const cities=[...new Map(shops.map(s=>[s.cityId,{id:s.cityId,name:s.city.name}])).values()];
 const visible=shops.filter(s=>(!cityId||s.cityId===cityId)&&s.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const rows=visible.map(shop=>{const report=current.find(r=>r.coffeeShopId===shop.id);return {shop,report,score:report?.status==='SUBMITTED'?report.score?.rating??null:null};}).filter(r=>!canFilterStatus||!statusFilter||reportState(r.report)===statusFilter).sort((a,b)=>ascending?(a.score??-1)-(b.score??-1):(b.score??-1)-(a.score??-1));
 const values=rows.flatMap(r=>r.score===null?[]:[r.score]);
 const avg=values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
 const selected=reports.find(r=>r.coffeeShopId===shopId&&r.year===year&&r.month===month);
 const history=Array.from({length:12},(_,i)=>{const p=periodIndex-11+i;const r=reports.find(r=>r.coffeeShopId===shopId&&r.year*12+r.month-1===p&&r.status==='SUBMITTED');return {year:Math.floor(p/12),month:p%12+1,report:r,score:r?.score?.rating??null};});
 const historyScores=history.flatMap(p=>p.score===null?[]:[p.score]);
 const overviewMode=isCooOverview&&searchParams.get('view')==='cities'?'cities':mode;
 const title=mode==='leader'?'Мои результаты':mode==='city'?'Дашборд города · '+shops.length+' кофеен':isCooOverview?'Рейтинг сети':mode==='reports'?'Отчёты по месяцам':'По кофейням';
 const status=(r?:Report)=>reportStatusLabels[reportState(r)];
 const submissionTime=(r?:Report)=>{
  if(r?.status!=='SUBMITTED'||!r.submittedAt)return '—';
  const date=new Date(r.submittedAt);
  return Number.isFinite(date.getTime())?date.toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК':'—';
 };
 const zone=(z:string|null)=>z==='TARGET'?'✓ В норме':z==='BELOW_TARGET'?'⚙ Ниже цели':z==='CRITICAL'?'⚠ Критично':'Нет данных';
 const link=(id:number,y=year,m=month)=>'/report?shop='+id+'&period='+y+'-'+String(m).padStart(2,'0');
 return <div className="page loading-surface" aria-busy={loading}><div className="page-header"><h1 className="page-title">{title}</h1>{isCooOverview&&<nav className="dashboard-view-switch" aria-label="Представление рейтинга"><Link className={overviewMode==='shops'?'active':''} to="/">По кофейням</Link><Link className={overviewMode==='cities'?'active':''} to="/?view=cities">По городам</Link></nav>}</div>
  <div className={'dashboard-filters'+(canFilterStatus?' dashboard-filters-with-status':'')} aria-label="Фильтры дашборда"><label><span>Период</span><MonthPicker label="Период" value={period} onChange={setPeriod}/></label>{mode!=='leader'&&<><label><span>Город</span><SelectControl label="Город" value={cityId} onChange={value=>setCityId(Number(value))} options={[{value:0,label:"Все города"},...cities.map(c=>({value:c.id,label:c.name}))]}/></label>{canFilterStatus&&<label><span>Статус отчёта</span><SelectControl label="Статус отчёта" value={statusFilter} onChange={setStatusFilter} options={[{value:'',label:'Все статусы'},...Object.entries(reportStatusLabels).map(([value,label])=>({value,label}))]}/></label>}<label className="dashboard-search"><span>Поиск</span><input className="input" aria-label="Поиск" placeholder="Название кофейни" value={search} onChange={e=>setSearch(e.target.value)}/></label></>}{mode==='leader'&&<label><span>Кофейня</span><SelectControl label="Кофейня" value={shopId} onChange={value=>setShopId(Number(value))} options={shops.map(s=>({value:s.id,label:s.name}))}/></label>}</div>
  {error&&<p role="alert">{error}</p>}{loading&&<LoadingState variant="bar" label="Загружаем рейтинг" />}
  {mode==='leader'?<>
   <div className="kpi-grid"><div className="kpi"><div className="kpi-label">Рейтинг периода</div><div className="kpi-value" style={{color:ratingColor(selected?.score?.rating)}}>{selected?.status==='SUBMITTED'?selected.score?.rating??'—':'—'}</div></div><div className="kpi"><div className="kpi-label">Среднее за 12 месяцев</div><div className="kpi-value">{historyScores.length?(historyScores.reduce((a,b)=>a+b,0)/historyScores.length).toFixed(1):'—'}</div></div><div className="kpi"><div className="kpi-label">Статус отчёта</div>{status(selected)}<p><Link to={link(shopId)}>Открыть отчёт</Link></p></div></div>
   <div className="card"><div className="card-title">Динамика за 12 месяцев</div><svg viewBox="0 0 600 170" role="img" aria-label="Рейтинг за последние 12 месяцев" style={{maxWidth:'100%',width:600}}>{history.map((p,i)=><g key={i}><rect x={i*49+5} y={140-(p.score??0)} width={30} height={p.score??0} fill={ratingColor(p.score)}/><text x={i*49+20} y={155} textAnchor="middle" fontSize={10}>{p.month}/{String(p.year).slice(-2)}</text><text x={i*49+20} y={130-(p.score??0)} textAnchor="middle" fontSize={10}>{p.score??'—'}</text></g>)}</svg></div>
   <div className="card"><div className="card-title">Основные проблемы</div>{selected?.score?.results?.length?selected.score.results.map(r=><p key={r.metricId}>{zone(r.zone)} · {r.metricName}</p>):<p>Нет сохранённых результатов</p>}</div>
   <div className="card table-wrap"><table className="table"><thead><tr><th>Метрика</th>{history.map(p=><th key={p.year+'-'+p.month}>{p.month}/{p.year}</th>)}</tr></thead><tbody>{[...new Map(history.flatMap(p=>p.report?.score?.results||[]).map(r=>[r.metricId,r.metricName])).entries()].map(([id,name])=><tr key={id}><td>{name}</td>{history.map(p=>{const value=p.report?.score?.results?.find(r=>r.metricId===id);return <td key={p.year+'-'+p.month} title={zone(value?.zone??null)}>{value?.computedPercent??value?.absoluteValue??'—'}<div className="helper-text">{value?.pointsAwarded??'—'} баллов</div></td>;})}</tr>)}</tbody></table></div>
   <div className="card"><div className="card-title">История периодов</div>{history.slice().reverse().map(p=><p key={p.year+'-'+p.month}><Link to={link(shopId,p.year,p.month)}>{p.month}/{p.year}</Link> · {p.score??'—'}</p>)}</div>
  </>:<>
   <div className="kpi-grid"><div className="kpi"><div className="kpi-label">Средний балл</div><div className="kpi-value" style={{color:ratingColor(avg)}}>{avg?.toFixed(1)??'—'}</div><p>По заполненным отчётам с сохранённым рейтингом</p></div><div className="kpi"><div className="kpi-label">Сданность</div><div className="kpi-value">{rows.filter(r=>r.report?.status==='SUBMITTED').length} / {rows.length}</div></div><div className="kpi"><div className="kpi-label">Открытые ИПВ</div><div className="kpi-value">{new Set(ipv.filter(i=>i.status!=='COMPLETED'&&rows.some(r=>r.shop.id===i.coffeeShopId)).map(i=>i.coffeeShopId)).size}</div><Link to="/triggers">Подробнее</Link></div></div>
   <div className="card table-wrap"><table className="table"><thead><tr><th>{overviewMode==='cities'?'Город':'Кофейня'}</th><th><button className="btn btn-ghost" onClick={()=>setAscending(!ascending)}>Рейтинг {ascending?'↑':'↓'}</button></th><th>{overviewMode==='cities'?'Отчёты':'Статус'}</th>{overviewMode!=='cities'&&<><th>Время подачи</th><th>ИПВ / худшая метрика</th></>}</tr></thead><tbody>
    {overviewMode==='cities'?cities.filter(c=>(!cityId||c.id===cityId)&&rows.some(r=>r.shop.cityId===c.id)).map(c=>{const group=rows.filter(r=>r.shop.cityId===c.id);const scores=group.flatMap(r=>r.score===null?[]:[r.score]);const average=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:null;return <tr key={c.id}><td>{c.name}</td><td style={{color:ratingColor(average)}}>{average?.toFixed(1)??'—'}</td><td>{group.filter(r=>r.report?.status==='SUBMITTED').length}/{group.length}</td></tr>;}):rows.map(r=>{const event=ipv.find(i=>i.coffeeShopId===r.shop.id&&i.status==='IN_PROGRESS')||ipv.find(i=>i.coffeeShopId===r.shop.id&&i.status==='NOT_STARTED');const worst=r.report?.score?.results?.find(m=>m.zone==='CRITICAL')||r.report?.score?.results?.find(m=>m.zone==='BELOW_TARGET');return <tr key={r.shop.id}><td><Link to={link(r.shop.id)}>{r.shop.name}</Link><div className="helper-text">{r.shop.city.name}</div></td><td style={{color:ratingColor(r.score)}}>{r.score?.toFixed(1)??'—'}</td><td>{status(r.report)}</td><td>{submissionTime(r.report)}</td><td>{event&&(event.status==='IN_PROGRESS'?'⏳':Date.now()-Date.parse(event.triggeredAt)>14*86400000?'🔴🔔':'🔔')} {worst?.metricName??'—'}</td></tr>;})}
   </tbody></table>{!rows.length&&<p>Нет кофеен по выбранным фильтрам</p>}</div>
  </>}
 </div>;
}
