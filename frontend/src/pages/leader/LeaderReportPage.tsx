import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { useToast } from '../../components/ToastProvider';
import { MonthPicker, SelectControl } from '../../components/SelectControl';
import LoadingState from '../../components/LoadingState';
import HelpTooltip from '../../components/HelpTooltip';
import '../../styles/pages.css';
import './LeaderReportPage.css';

type Report = { id?: number; coffeeShopId: number; year: number; month: number; revenue: string | number; drinksCount: string | number; status?: string; isLocked?: boolean; isEditable?: boolean; submittedAt?: string; metricValues: {metricId: number; absoluteValue: string | number | null}[]; analyses: {questionKey: string; content: string}[]; formData?: Record<string, any>; score?: {rating: number; results: {metricId: number; zone: string | null; pointsAwarded: number | null}[]} };
type Metric = {id: number; name: string; code: string; unit: string; section: string; displayOrder: number};
type Question = {questionKey: string; label: string; section: string; displayOrder: number};
const blocks = ['Команда и гости', 'Labor Cost', 'Себестоимость', 'Расходы', 'Итоги месяца'];
const blockFor = (section: string) => ['LABOR_COST','PERFORMANCE','PERSONNEL_COSTS'].includes(section) ? 1 : ['COSTING','DESSERT_WRITEOFF','PRODUCT_WRITEOFF','FREE_ACCESS'].includes(section) ? 2 : ['EXPENSES','ADMIN_COSTS','RENT','EQUIPMENT'].includes(section) ? 3 : section === 'SUMMARY' ? 4 : 0;
const analysisSections: {section: string; title: string; hint: string}[] = [
 {section:'ENPS',title:'eNPS',hint:'Проблемы, причины и конкретный план устранения'},
 {section:'REVIEWS',title:'Отзывы',hint:'Корневые причины, устранение, профилактика и скорость разбора'},
 {section:'GUEST_EXPERIENCE',title:'Индекс гостевого опыта',hint:'Топ-3 проблемы, повторяющиеся ошибки и план'},
 {section:'STANDARDS',title:'Рейтинг стандартов',hint:'Топ-3 проблемы, повторяющиеся ошибки и план'},
 {section:'GIFTS',title:'Подарки',hint:'Причины, действия и план на следующий месяц'},
 {section:'LABOR_COST',title:'Labor Cost и команда',hint:'LFL, выручка, производительность и команда'},
 {section:'COSTING',title:'Себестоимость',hint:'Причины отклонений и план действий'},
 {section:'DESSERT_WRITEOFF',title:'Списание десертов',hint:'Причины списаний и план сокращения'},
 {section:'PRODUCT_WRITEOFF',title:'Списание продуктов',hint:'Причины списаний и план сокращения'},
 {section:'FREE_ACCESS',title:'Свободный доступ',hint:'Крупные расходы, ошибки и профилактика'},
 {section:'ADMIN_COSTS',title:'Административные затраты',hint:'Отклонения, причины и план'},
 {section:'RENT',title:'Аренда',hint:'Отклонения, причины и план'},
 {section:'EQUIPMENT',title:'Оборудование и ремонт',hint:'Отклонения, причины и план'},
 {section:'SUMMARY',title:'Итоги месяца',hint:'Главные выводы и действия на следующий месяц'},
];
const extras = [
  {key:'inps',label:'ИНПС',block:0,hint:'Источник: лидер города'},
  {key:'gifts',label:'Подарки, ₽',block:0,hint:'Сумма подарков за месяц',share:true},
  {key:'personnelCosts',label:'Расходы на персонал, ₽',block:1,hint:'НДФЛ, ФСС, доставка, питание, корпоративные мероприятия, обучение, медосмотр, командировочные, страховые взносы, форма, прочие расходы',share:true},
  {key:'freeAccess',label:'Свободный доступ, ₽',block:2,hint:'Источник: финансовый дашборд',share:true},
  {key:'adminCosts',label:'Административные затраты, ₽',block:3,hint:'Связь, клининг, озеленение, хозматериалы, канцелярия, подбор персонала, консалтинг, IT, банки, прочие расходы',share:true},
  {key:'rent',label:'Аренда, ₽',block:3,hint:'Аренда, коммунальные услуги, вывоз ТКО, охрана',share:true},
  {key:'equipment',label:'Оборудование, материалы, ремонт, ₽',block:3,hint:'Ремонт помещений, эксплуатационные расходы, инвентарь, ремонт и замена оборудования',share:true},
];
const reportHelpTitles:Record<string,string>={
 gifts:'Подарки',DESSERT_WRITEOFF:'Списание десертов',PRODUCT_WRITEOFF:'Списание продуктов',
 rent:'Аренда',equipment:'Оборудование, материалы, ремонт',personnelCosts:'Расходы на персонал',adminCosts:'Административные затраты',
};
const articleHelp=(key:string)=>reportHelpTitles[key]&&<HelpTooltip label={reportHelpTitles[key]}>Текст подсказки и ссылка на статью будут добавлены позже.</HelpTooltip>;
const unwrap = (r: {data:any}) => r.data?.data !== undefined ? r.data.data : r.data;
const message = (e:any) => { const m=e.response?.data?.message; return Array.isArray(m)?m.join(', '):m||'Не удалось сохранить данные. Попробуйте ещё раз.'; };
const prevPeriod = (year:number,month:number) => month===1?{year:year-1,month:12}:{year,month:month-1};
const emptyReport = (coffeeShopId:number,year:number,month:number):Report => ({coffeeShopId,year,month,revenue:'',drinksCount:'',metricValues:[],analyses:[],formData:{}});
const normalizeReport = (raw:unknown, fallback:Report):Report => {
 const report = raw && typeof raw === 'object' ? raw as Partial<Report> : {};
 return {...fallback,...report,metricValues:Array.isArray(report.metricValues)?report.metricValues:[],analyses:Array.isArray(report.analyses)?report.analyses:[],formData:report.formData&&typeof report.formData==='object'?report.formData:{}};
};
const httpUrl=(value:unknown):string|undefined=>{
 try { const url=new URL(String(value??''));return ['http:','https:'].includes(url.protocol)?url.href:undefined; }
 catch { return undefined; }
};
const negativeValueMessage = (report:Report,metrics:Metric[]):string => {
 const labels:Record<string,string>={revenuePlan:'План выручки',drinksPlan:'План напитков'};
 metrics.forEach(metric=>{labels['metricPlan_'+metric.id]='План: '+metric.name;});
 extras.forEach(extra=>{labels[extra.key]=extra.label;labels[extra.key+'Plan']='План: '+extra.label;});
 const fields:[string,unknown][]=[['Выручка',report.revenue],['Количество напитков',report.drinksCount],
  ...report.metricValues.map((value):[string,unknown]=>[metrics.find(metric=>metric.id===value.metricId)?.name||'Показатель',value.absoluteValue]),
  ...Object.entries(report.formData||{}).filter(([key])=>!['giftsLink','equipmentLink'].includes(key)).map(([key,value]):[string,unknown]=>[labels[key]||key,value])];
 const negative=fields.find(([,value])=>typeof value==='number'?value<0:typeof value==='string'&&Number(value.replace(/\s/g,'').replace(/[₽$€£]$/,'').replace(',','.'))<0);
 return negative?negative[0]+': значение не может быть отрицательным.':'';
};

export default function LeaderReportPage() {
 const toast=useToast();
 const [params]=useSearchParams();
 const today=new Date(Date.now()+10800000), initial=prevPeriod(today.getUTCFullYear(),today.getUTCMonth()+1);
 const requestedPeriod=params.get('period');
 const [period,setPeriod]=useState(requestedPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod)?requestedPeriod:initial.year+'-'+String(initial.month).padStart(2,'0'));
 const [shopId,setShopId]=useState(0), [shops,setShops]=useState<{id:number;name:string}[]>([]);
 const [metrics,setMetrics]=useState<Metric[]>([]), [questions,setQuestions]=useState<Question[]>([]);
 const [report,setReport]=useState<Report|null>(null), [previous,setPrevious]=useState<Report|null>(null);
 const [historicalEditingEnabled,setHistoricalEditingEnabled]=useState(false);
 const [activeBlock,setActiveBlock]=useState(0), [loading,setLoading]=useState(true), [saving,setSaving]=useState(false), [dirty,setDirty]=useState(false), [error,setError]=useState('');
 const [autosaveState,setAutosaveState]=useState<'idle'|'waiting'|'saving'|'error'>('idle');
 const [expandedAnalysisSection,setExpandedAnalysisSection]=useState<string|null>(null);
 const [year,month]=period.split('-').map(Number);
 const historical=Boolean(report?.isLocked||Date.now()>=Date.UTC(year,month+1,1,-3));
 const locked=typeof report?.isEditable==='boolean'?!report.isEditable:!historicalEditingEnabled&&historical;
 const testEditing=historical&&!locked;
 const overdue=Date.now()>=Date.UTC(year,month,10,9)&&report?.status!=='SUBMITTED';
 useEffect(()=>{
  let alive=true;
  Promise.all([api.get('/metrics'),api.get('/coffee-shops'),api.get('/admin/analysis-questions'),api.get('/reports/editing-policy').catch(()=>({data:{historicalEditingEnabled:false}}))]).then(([m,s,q,policy])=>{
   if(!alive)return; setMetrics(unwrap(m));setQuestions(unwrap(q));setHistoricalEditingEnabled(unwrap(policy)?.historicalEditingEnabled===true);const list=unwrap(s);setShops(list);const requested=Number(params.get('shop'));setShopId(list.some((s:{id:number})=>s.id===requested)?requested:list[0]?.id||0);if(!list.length)setLoading(false);
  }).catch(e=>{if(alive){setError(message(e));setLoading(false);}});
  return()=>{alive=false;};
 },[]);
 useEffect(()=>{
  if(!shopId)return;let alive=true;setLoading(true);setReport(null);setDirty(false);setError('');setAutosaveState('idle');
  const previousPeriod=prevPeriod(year,month);
  Promise.all([api.get('/reports/coffee-shop/'+shopId+'/'+year+'/'+month),api.get('/reports/coffee-shop/'+shopId+'/'+previousPeriod.year+'/'+previousPeriod.month)]).then(([currentResponse,previousResponse])=>{
   if(!alive)return;setReport(normalizeReport(unwrap(currentResponse),emptyReport(shopId,year,month)));setPrevious(unwrap(previousResponse)?normalizeReport(unwrap(previousResponse),emptyReport(shopId,previousPeriod.year,previousPeriod.month)):null);
  }).catch(e=>{if(alive)setError(message(e));}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[shopId,year,month]);
 useEffect(()=>{if(!dirty)return;const prevent=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty]);
 const change=(fn:(r:Report)=>Report)=>{if(!locked&&!saving){setReport(r=>r?fn(r):r);setDirty(true);setAutosaveState('waiting');}};
 const field=(key:string,value:string)=>change(r=>({...r,formData:{...r.formData,[key]:value}}));
 const value=(r:Report|null,id:number)=>r?.metricValues.find(v=>v.metricId===id)?.absoluteValue??'';
 const negativeError=report?negativeValueMessage(report,metrics):'';
 const visibleError=negativeError||error;
 const giftsLinkHref=httpUrl(report?.formData?.giftsLink);
 const save=async(submit:boolean,automatic=false)=>{
  if(!report||locked||saving)return;
  if(negativeValueMessage(report,metrics)){setAutosaveState('error');return;}
  setSaving(true);setError('');if(automatic)setAutosaveState('saving');
  try {
   const saved=unwrap(await api.post('/reports/draft',{coffeeShopId:shopId,year,month,revenue:report.revenue||0,drinksCount:report.drinksCount||0,metricValues:report.metricValues,analyses:report.analyses,formData:report.formData||{}}));
   setReport(normalizeReport(saved,emptyReport(shopId,year,month)));setDirty(false);setAutosaveState('idle');
   if(submit)setReport(normalizeReport(unwrap(await api.post('/reports/'+saved.id+'/submit')),emptyReport(shopId,year,month)));
   if(!automatic)toast.show(submit?'Отчёт отправлен':'Черновик сохранён','success');
  }catch(e){setError(message(e));if(automatic)setAutosaveState('error');}finally{setSaving(false);}
 };
 useEffect(()=>{if(!dirty||!report||locked||saving)return;const timer=window.setTimeout(()=>{void save(false,true);},2000);return()=>window.clearTimeout(timer);},[dirty,report,locked,saving]);
 const metricClass=(metricId:number)=>{
  const zone=report?.score?.results?.find(result=>result.metricId===metricId)?.zone;
  return zone==='TARGET'?' metric-zone-green':zone==='BELOW_TARGET'?' metric-zone-yellow':zone==='CRITICAL'?' metric-zone-red':'';
 };
 const input=(label:string,v:unknown,update:(s:string)=>void,className='')=><input className={'input'+className} aria-label={label} inputMode="decimal" value={String(v??'')} disabled={locked||saving} onChange={e=>update(e.target.value)}/>;
 const reportState=locked?'Исторический · только чтение':testEditing?'Исторический · тестовое редактирование':report?.status==='SUBMITTED'?'Заполнено':overdue?'Просрочено':'Не заполнено';
 const saveStatus=visibleError?visibleError:autosaveState==='saving'?'Сохраняем изменения…':autosaveState==='waiting'?'Сохранение через 2 секунды':locked?'Редактирование закрыто':'Автосохранение включено';
 const activeAnalysisGroups=analysisSections.map(group=>({...group,questions:questions.filter(question=>question.section===group.section).sort((a,b)=>a.displayOrder-b.displayOrder)})).filter(group=>group.questions.length>0&&blockFor(group.section)===activeBlock);
 const activeQuestions=activeAnalysisGroups.flatMap(group=>group.questions);
 const answeredQuestions=activeQuestions.filter(question=>report?.analyses.some(answer=>answer.questionKey===question.questionKey&&answer.content.trim().length>=3)).length;
 return <div className="page leader-report">
      <div className="page-header leader-report-header"><div><h1 className="page-title">Отчёт за {period}</h1><div className="leader-report-example"><HelpTooltip label="Пример заполнения отчёта" triggerText="Пример заполнения отчёта">Пример скоро появится. Ссылка на заполненный отчёт будет добавлена позже.</HelpTooltip></div><div className="leader-report-meta"><span className="badge">{reportState}</span><span className={'leader-save-status '+(visibleError?'is-error':autosaveState)} role={visibleError?'alert':'status'} aria-live="polite">{saveStatus}</span></div></div><div className="page-actions"><button className="btn btn-primary" disabled={!report||locked||saving} onClick={()=>save(true)}>Отправить отчёт</button></div></div>
  <div className="card leader-report-controls"><label><span>Кофейня</span><SelectControl label="Кофейня" value={shopId} disabled={dirty||saving} onChange={value=>setShopId(Number(value))} options={shops.map(s=>({value:s.id,label:s.name}))}/></label><label className="period-control"><span>Отчётный период</span><MonthPicker label="Период" value={period} disabled={dirty||saving} onChange={setPeriod}/></label><aside className="leader-deadline"><strong>{testEditing?'Тестовый режим':'Сроки отчёта'}</strong><span>{testEditing?'Редактирование прошлых месяцев открыто для проверки триггеров.':'Сдать до 10-го числа следующего месяца, 12:00 МСК. Редактирование открыто до конца следующего месяца.'}</span>{report?.submittedAt&&<span className="leader-submitted"><b>Отправлен</b>{new Date(report.submittedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК</span>}</aside></div>
  {loading?<LoadingState variant="panel" label="Загружаем отчёт" />:!shops.length?<p>Нет доступных кофеен. Обратитесь к администратору для назначения.</p>:report&&<>
   <div className="report-section-toolbar"><div className="tabs">{blocks.map((label,index)=><button key={label} className={'tab'+(activeBlock===index?' active':'')} onClick={()=>setActiveBlock(index)}>{label}</button>)}</div><div className={'report-rating'+(report.score?.rating==null?'':report.score.rating>=80?' metric-zone-green':report.score.rating>=50?' metric-zone-yellow':' metric-zone-red')}><span>Рейтинг</span><strong>{dirty&&!negativeError?'…':report.score?.rating??'—'}</strong><small>{negativeError?'Последний сохранённый рейтинг':dirty?'Пересчитываем после сохранения':'из 100 баллов'}</small></div></div>
   {activeBlock===1&&<section className="card labor-overview" aria-label="Выручка и напитки"><div className="labor-overview-header"><div><h2 className="card-title">Выручка и напитки</h2><p>Факт за выбранный период и план на следующий месяц.</p></div><div className="labor-previous"><span>Предыдущий факт</span><strong>{previous?.revenue??'—'} ₽</strong><strong>{previous?.drinksCount??'—'} напитков</strong></div></div><div className="labor-overview-grid"><label><span>Выручка, ₽</span>{input('Выручка',report.revenue,v=>change(r=>({...r,revenue:v})))}</label><label><span>План выручки</span>{input('План выручки',report.formData?.revenuePlan,v=>field('revenuePlan',v))}</label><label><span>Количество напитков</span>{input('Количество напитков',report.drinksCount,v=>change(r=>({...r,drinksCount:v})))}</label><label><span>План напитков</span>{input('План напитков',report.formData?.drinksPlan,v=>field('drinksPlan',v))}</label></div></section>}
   {activeBlock!==4&&<div className="card table-wrap"><table className="table"><thead><tr><th>Показатель</th><th>Предыдущий факт</th><th>Текущий факт</th><th>План следующего месяца</th></tr></thead><tbody>
    {metrics.filter(m=>(['FREE_ACCESS','DEPOSIT'].includes(m.code)?0:blockFor(m.section||m.code))===activeBlock).sort((a,b)=>a.displayOrder-b.displayOrder).map(m=>{
     const share=['LABOR_COST','FREE_ACCESS','DEPOSIT','DESSERT_WRITEOFF','PRODUCT_WRITEOFF'].includes(m.code);
     return <tr key={m.id}><td><span className="report-metric-label">{m.name}{articleHelp(m.code)}</span><div className="helper-text">{share?'Сумма, ₽; доля от выручки автоматически':m.unit}</div></td><td>{value(previous,m.id)===''?'—':value(previous,m.id)}</td><td>{input(m.name,value(report,m.id),v=>change(r=>({...r,metricValues:[...r.metricValues.filter(x=>x.metricId!==m.id),{metricId:m.id,absoluteValue:v}]})),metricClass(m.id))}</td><td>{input('План: '+m.name,report.formData?.['metricPlan_'+m.id],v=>field('metricPlan_'+m.id,v))}</td></tr>;
    })}
   {extras.filter(f=>f.block===activeBlock).map(f=><tr key={f.key}><td><span className="report-metric-label">{f.label}{articleHelp(f.key)}</span><div className="helper-text">{f.hint}</div>{f.key==='gifts'&&<div className="report-gifts-link"><label><span>Ссылка на подарки</span><input className="input" type="url" inputMode="url" placeholder="https://…" maxLength={2000} value={report.formData?.giftsLink??''} disabled={locked||saving} onChange={e=>field('giftsLink',e.target.value)}/></label>{giftsLinkHref&&<a href={giftsLinkHref} target="_blank" rel="noopener noreferrer">Открыть ссылку</a>}</div>}</td><td>{previous?.formData?.[f.key]??'—'}</td><td>{input(f.label,report.formData?.[f.key],v=>field(f.key,v))}</td><td>{input('План: '+f.label,report.formData?.[f.key+'Plan'],v=>field(f.key+'Plan',v))}</td></tr>)}
   </tbody></table></div>}
   {activeBlock===3&&<div className="card"><label>План затрат на оборудование<input className="input" type="url" value={report.formData?.equipmentLink??''} disabled={locked||saving} onChange={e=>field('equipmentLink',e.target.value)}/>{/^https?:\/\//i.test(report.formData?.equipmentLink||'')&&<a href={report.formData?.equipmentLink} target="_blank" rel="noreferrer">Открыть таблицу</a>}</label></div>}
   <section className="card analysis-card" aria-labelledby="analysis-title"><div className="analysis-card-header"><div><h2 id="analysis-title" className="card-title">Анализ показателей</h2><p>Структура соответствует шаблону отчёта: у каждого показателя свой анализ. Откройте нужный раздел и заполните только относящиеся к нему пункты.</p></div><span className="badge">{answeredQuestions} из {activeQuestions.length} ответов</span></div>{activeAnalysisGroups.length===0?<p className="empty">Для этого раздела пока нет вопросов для анализа.</p>:<div className="analysis-groups">{activeAnalysisGroups.map(group=>{const expanded=expandedAnalysisSection===group.section;const answered=group.questions.filter(question=>report.analyses.some(answer=>answer.questionKey===question.questionKey&&answer.content.trim().length>=3)).length;return <article className="analysis-group" key={group.section}><button type="button" className="analysis-group-toggle" aria-expanded={expanded} onClick={()=>setExpandedAnalysisSection(expanded?null:group.section)}><span><strong>{group.title}</strong><small>{group.hint}</small></span><span className="analysis-group-count">{answered}/{group.questions.length} {expanded?'⌃':'⌄'}</span></button>{expanded&&<div className="analysis-list">{group.questions.map(question=>{const text=report.analyses.find(answer=>answer.questionKey===question.questionKey)?.content||'';const filled=text.trim().length>=3;return <label className="field analysis-question" key={question.questionKey}><span>{question.label}<span className={filled?'analysis-answer-state filled':'analysis-answer-state'}>{filled?'Заполнено':'Необязательно'}</span></span><textarea className="textarea resize-none" maxLength={20000} placeholder="Например: что произошло, почему и что сделаете в следующем месяце" value={text} disabled={locked||saving} onChange={e=>{const content=e.target.value;change(r=>({...r,analyses:[...r.analyses.filter(answer=>answer.questionKey!==question.questionKey),{questionKey:question.questionKey,content}]}));}}/></label>;})}</div>}</article>;})}</div>}</section>
  </>}
 </div>;
}
