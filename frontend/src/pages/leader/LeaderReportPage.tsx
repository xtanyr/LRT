import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../services/api';
import { ReportDraftPayload, saveReportDraft, waitForReportDraftSave } from '../../services/report-draft-save';
import { useReportExampleHelp } from '../../services/report-example-help';
import { useRatingThresholds } from '../../services/rating-colors';
import { useToast } from '../../components/ToastProvider';
import { MonthPicker, SelectControl } from '../../components/SelectControl';
import LoadingState from '../../components/LoadingState';
import '../../styles/pages.css';
import './LeaderReportPage.css';

type Report = { id?: number; coffeeShopId: number; year: number; month: number; revenue: string | number; drinksCount: string | number; status?: string; isLocked?: boolean; isEditable?: boolean; submittedAt?: string; metricValues: {metricId: number; absoluteValue: string | number | null}[]; analyses: {questionKey: string; content: string}[]; formData?: Record<string, any>; score?: {rating: number; maxPoints?: number; results: {metricId: number; zone: string | null; pointsAwarded: number | null}[]} };
type Metric = {id: number; name: string; code: string; unit: string; section: string; displayOrder: number; isActive?: boolean};
type Question = {questionKey: string; label: string; section: string; displayOrder: number; metricCodes?: string[]};
type CoffeeShopOption = {id: number; name: string; city?: {name?: string} | null};
const blocks = ['Команда и гости', 'Labor Cost', 'Себестоимость', 'Расходы', 'Итоги месяца'];
const blockFor = (section: string) => ['LABOR_COST','PERFORMANCE','PERSONNEL_COSTS'].includes(section) ? 1 : ['COSTING','DESSERT_WRITEOFF','PRODUCT_WRITEOFF','FREE_ACCESS'].includes(section) ? 2 : ['EXPENSES','ADMIN_COSTS','RENT','EQUIPMENT'].includes(section) ? 3 : section === 'SUMMARY' ? 4 : 0;
const analysisSections: {section: string; title: string; hint: string}[] = [
 {section:'ENPS',title:'eNPS',hint:'Проблемы, причины и конкретный план устранения'},
 {section:'REVIEWS',title:'Отзывы',hint:'Корневые причины, устранение, профилактика и скорость разбора'},
 {section:'GUEST_EXPERIENCE',title:'Индекс гостевого опыта',hint:'Топ-3 проблемы, повторяющиеся ошибки и план'},
 {section:'STANDARDS',title:'Рейтинг стандартов',hint:'Топ-3 проблемы, повторяющиеся ошибки и план'},
 {section:'GIFTS',title:'Подарки',hint:'Причины, действия и план на месяц'},
 {section:'LABOR_COST',title:'Labor Cost и команда',hint:'LFL, выручка, производительность и команда'},
 {section:'COSTING',title:'Себестоимость',hint:'Причины отклонений и план действий'},
 {section:'DESSERT_WRITEOFF',title:'Списание десертов',hint:'Причины списаний и план сокращения'},
 {section:'PRODUCT_WRITEOFF',title:'Списание продуктов',hint:'Причины списаний и план сокращения'},
 {section:'FREE_ACCESS',title:'Свободный доступ',hint:'Крупные расходы, ошибки и профилактика'},
 {section:'ADMIN_COSTS',title:'Административные затраты',hint:'Отклонения, причины и план'},
 {section:'RENT',title:'Аренда',hint:'Отклонения, причины и план'},
 {section:'EQUIPMENT',title:'Оборудование, материалы и ремонт',hint:'Отдельный анализ по каждой статье'},
 {section:'SUMMARY',title:'Итоги месяца',hint:'Главные выводы и действия на следующий месяц'},
];
const extras = [
  {key:'gifts',label:'Подарки, ₽',block:0,hint:'Сумма подарков за месяц',share:true},
  {key:'personnelCosts',label:'Расходы на персонал, ₽',block:1,hint:'НДФЛ, ФСС, доставка, питание, корпоративные мероприятия, обучение, медосмотр, командировочные, страховые взносы, форма, прочие расходы',share:true},
  {key:'freeAccess',label:'Свободный доступ, ₽',block:2,hint:'Источник: финансовый дашборд',share:true},
  {key:'adminCosts',label:'Административные затраты, ₽',block:3,hint:'Связь, клининг, озеленение, хозматериалы, канцелярия, подбор персонала, консалтинг, IT, банки, прочие расходы',share:true},
  {key:'rent',label:'Аренда, ₽',block:3,hint:'Аренда, коммунальные услуги, вывоз ТКО, охрана',share:true},
  {key:'equipment',label:'Оборудование, материалы, ремонт, ₽',block:3,hint:'Ремонт помещений, эксплуатационные расходы, инвентарь, ремонт и замена оборудования',share:true},
];
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
function ReportDocumentLink({label,ariaLabel,value,disabled,onChange}:{label:string;ariaLabel:string;value:unknown;disabled:boolean;onChange:(value:string)=>void}){
 const href=httpUrl(value);
 return <div className="report-document-link"><label><span>{label}</span><input className="input" type="url" inputMode="url" placeholder="Вставьте ссылку" maxLength={2000} aria-label={ariaLabel} value={String(value??'')} disabled={disabled} onChange={event=>onChange(event.target.value)}/></label>{href&&<a href={href} target="_blank" rel="noopener noreferrer">Открыть ↗</a>}</div>;
}
const numericInputValue=(value:unknown):number|null=>{
 if(typeof value==='number')return Number.isFinite(value)?value:null;
 const normalized=String(value??'').replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
 if(!normalized)return null;
 const parsed=Number(normalized);
 return Number.isFinite(parsed)?parsed:null;
};
const revenuePercentage=(amount:unknown,revenue:unknown):string|null=>{
 const amountValue=numericInputValue(amount),revenueValue=numericInputValue(revenue);
 if(amountValue===null||revenueValue===null||revenueValue<=0)return null;
 return new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(amountValue/revenueValue*100);
};
const negativeValueMessage = (report:Report,metrics:Metric[]):string => {
 const labels:Record<string,string>={revenuePlan:'План выручки',drinksPlan:'План напитков',inventorySurplus:'Сумма излишков инвентаризации, ₽',inventoryShortage:'Сумма недостач инвентаризации, ₽'};
 metrics.forEach(metric=>{labels['metricPlan_'+metric.id]='План: '+metric.name;});
 extras.forEach(extra=>{labels[extra.key]=extra.label;labels[extra.key+'Plan']='План: '+extra.label;});
 const fields:[string,unknown][]=[['Выручка',report.revenue],['Количество напитков',report.drinksCount],
  ...report.metricValues.map((value):[string,unknown]=>[metrics.find(metric=>metric.id===value.metricId)?.name||'Показатель',value.absoluteValue]),
  ...Object.entries(report.formData||{}).filter(([key])=>!['giftsLink','equipmentLink'].includes(key)).map(([key,value]):[string,unknown]=>[labels[key]||key,value])];
 const negative=fields.find(([,value])=>typeof value==='number'?value<0:typeof value==='string'&&Number(value.replace(/\s/g,'').replace(/[₽$€£]$/,'').replace(',','.'))<0);
 return negative?negative[0]+': значение не может быть отрицательным.':'';
};

export default function LeaderReportPage() {
 const exampleHelp=useReportExampleHelp();
 const ratingThresholds=useRatingThresholds();
 const toast=useToast();
 const [params]=useSearchParams();
 const today=new Date(Date.now()+10800000), initial=prevPeriod(today.getUTCFullYear(),today.getUTCMonth()+1);
 const requestedPeriod=params.get('period');
 const [period,setPeriod]=useState(requestedPeriod && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedPeriod)?requestedPeriod:initial.year+'-'+String(initial.month).padStart(2,'0'));
 const [shopId,setShopId]=useState(0), [shops,setShops]=useState<CoffeeShopOption[]>([]);
 const [metrics,setMetrics]=useState<Metric[]>([]), [questions,setQuestions]=useState<Question[]>([]);
 const [report,setReport]=useState<Report|null>(null), [previous,setPrevious]=useState<Report|null>(null);
 const [historicalEditingEnabled,setHistoricalEditingEnabled]=useState(false);
 const [activeBlock,setActiveBlock]=useState(0), [loading,setLoading]=useState(true), [saving,setSaving]=useState(false), [dirty,setDirty]=useState(false), [error,setError]=useState('');
 const [requiredAnalysisErrors,setRequiredAnalysisErrors]=useState<string[]>([]), [requiredAnalysisMessage,setRequiredAnalysisMessage]=useState('');
 const [autosaveState,setAutosaveState]=useState<'idle'|'waiting'|'saving'|'saved'|'error'>('idle');
 const saveInFlight=useRef(false), automaticSaveInFlight=useRef(false), editVersion=useRef(0), savingVersion=useRef<number|null>(null), pendingDraft=useRef<ReportDraftPayload|null>(null);
 const [expandedAnalysisSection,setExpandedAnalysisSection]=useState<string|null>(null);
 const [year,month]=period.split('-').map(Number);
 const selectedShop=shops.find(shop=>shop.id===shopId);
 const inventoryAvailable=['омск','новосибирск'].includes((selectedShop?.city?.name||'').trim().toLocaleLowerCase('ru-RU'));
 const exampleParams=new URLSearchParams(params);
 exampleParams.set('period',period);
 if(shopId)exampleParams.set('shop',String(shopId));
 const historical=Boolean(report?.isLocked||Date.now()>=Date.UTC(year,month,11,9));
 const locked=typeof report?.isEditable==='boolean'?!report.isEditable:!historicalEditingEnabled&&historical;
 const fieldDisabled=locked||(saving&&!automaticSaveInFlight.current);
 const activeMetrics=metrics.filter(metric=>metric.isActive!==false);
 const activeValues=report?.metricValues.filter(value=>activeMetrics.some(metric=>metric.id===value.metricId))||[];
 const visibleMetrics=locked?metrics.filter(metric=>metric.isActive!==false||report?.metricValues.some(value=>value.metricId===metric.id)||report?.score?.results?.some(result=>result.metricId===metric.id)):activeMetrics;
 const testEditing=historical&&!locked;
 useEffect(()=>{
  let alive=true;
  Promise.all([api.get('/metrics'),api.get('/coffee-shops'),api.get('/admin/analysis-questions'),api.get('/reports/editing-policy').catch(()=>({data:{historicalEditingEnabled:false}}))]).then(([m,s,q,policy])=>{
   if(!alive)return; setMetrics(unwrap(m));setQuestions(unwrap(q));setHistoricalEditingEnabled(unwrap(policy)?.historicalEditingEnabled===true);const list=unwrap(s) as CoffeeShopOption[];setShops(list);const requested=Number(params.get('shop'));setShopId(list.some(shop=>shop.id===requested)?requested:list[0]?.id||0);if(!list.length)setLoading(false);
  }).catch(e=>{if(alive){setError(message(e));setLoading(false);}});
  return()=>{alive=false;};
 },[]);
 useEffect(()=>{
  if(!shopId)return;let alive=true;setLoading(true);setReport(null);setDirty(false);setError('');setAutosaveState('idle');
  const previousPeriod=prevPeriod(year,month);
  const load=async()=>{
   try{await waitForReportDraftSave(shopId,year,month);}catch(e){if(alive)setError(message(e));}
   if(!alive)return;
   const [currentResponse,previousResponse]=await Promise.all([api.get('/reports/coffee-shop/'+shopId+'/'+year+'/'+month),api.get('/reports/coffee-shop/'+shopId+'/'+previousPeriod.year+'/'+previousPeriod.month)]);
   if(!alive)return;setReport(normalizeReport(unwrap(currentResponse),emptyReport(shopId,year,month)));setPrevious(unwrap(previousResponse)?normalizeReport(unwrap(previousResponse),emptyReport(shopId,previousPeriod.year,previousPeriod.month)):null);
  };
  void load().catch(e=>{if(alive)setError(message(e));}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[shopId,year,month]);
 useEffect(()=>{if(!dirty)return;const prevent=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener('beforeunload',prevent);return()=>window.removeEventListener('beforeunload',prevent);},[dirty]);
 const change=(fn:(r:Report)=>Report)=>{if(!locked&&(!saving||automaticSaveInFlight.current)){editVersion.current+=1;setReport(r=>r?fn(r):r);setDirty(true);setAutosaveState('waiting');setRequiredAnalysisErrors([]);setRequiredAnalysisMessage('');}};
 const field=(key:string,value:string)=>change(r=>({...r,formData:{...r.formData,[key]:value}}));
 const value=(r:Report|null,id:number)=>r?.metricValues.find(v=>v.metricId===id)?.absoluteValue??'';
 const requiredMetricNames=(question:Question,sourceReport:Report|null=report)=>metrics.filter(metric=>question.metricCodes?.includes(metric.code)&&sourceReport?.score?.results?.some(result=>result.metricId===metric.id&&(result.zone==='BELOW_TARGET'||result.zone==='CRITICAL'))).map(metric=>metric.name);
 const isAnalysisRequired=(question:Question,sourceReport:Report|null=report)=>requiredMetricNames(question,sourceReport).length>0;
 const missingRequiredAnalyses=(sourceReport:Report)=>questions.filter(question=>(question.questionKey!=='inventory_analysis'||inventoryAvailable)&&isAnalysisRequired(question,sourceReport)&&(sourceReport.analyses.find(answer=>answer.questionKey===question.questionKey)?.content?.trim().length??0)<3);
 const negativeError=report?negativeValueMessage({...report,metricValues:activeValues},activeMetrics):'';
 const visibleError=negativeError||error||requiredAnalysisMessage;
 const currentDraft:ReportDraftPayload|null=report&&!locked&&!negativeError?{coffeeShopId:shopId,year,month,revenue:report.revenue||0,drinksCount:report.drinksCount||0,metricValues:activeValues,analyses:report.analyses,formData:report.formData||{}}:null;
 pendingDraft.current=dirty&&(!saving||automaticSaveInFlight.current)?currentDraft:null;
 useEffect(()=>()=>{const draft=pendingDraft.current;if(draft&&(savingVersion.current===null||editVersion.current>savingVersion.current))void saveReportDraft(draft).catch(()=>undefined);},[]);
 const save=async(submit:boolean,automatic=false)=>{
  if(!report||locked||saving||saveInFlight.current)return;
  if(negativeError){setAutosaveState('error');return;}
  const version=editVersion.current;
  saveInFlight.current=true;automaticSaveInFlight.current=automatic;savingVersion.current=version;setSaving(true);setError('');if(automatic)setAutosaveState('saving');
  try {
   const saved=unwrap(await saveReportDraft({coffeeShopId:shopId,year,month,revenue:report.revenue||0,drinksCount:report.drinksCount||0,metricValues:activeValues,analyses:report.analyses,formData:report.formData||{}}));
   const savedReport=normalizeReport(saved,emptyReport(shopId,year,month));
   if(version===editVersion.current){setReport(savedReport);setDirty(false);setAutosaveState('saved');}
   else setAutosaveState('waiting');
   if(submit){
    const missing=missingRequiredAnalyses(savedReport);
    if(missing.length){
     setRequiredAnalysisErrors(missing.map(question=>question.questionKey));
     setRequiredAnalysisMessage('Заполните обязательный анализ (не менее 3 символов): '+missing.map(question=>question.label).join(', '));
     setActiveBlock(blockFor(missing[0].section));
     setExpandedAnalysisSection(missing[0].section);
     return;
    }
    setReport(normalizeReport(unwrap(await api.post('/reports/'+saved.id+'/submit')),emptyReport(shopId,year,month)));
   }
   if(!automatic)toast.show(submit?'Отчёт отправлен':'Черновик сохранён','success');
  }catch(e){setError(message(e));if(automatic)setAutosaveState('error');}finally{saveInFlight.current=false;automaticSaveInFlight.current=false;savingVersion.current=null;setSaving(false);}
 };
 useEffect(()=>{if(!dirty||!report||locked||saving)return;const timer=window.setTimeout(()=>{void save(false,true);},2000);return()=>window.clearTimeout(timer);},[dirty,report,locked,saving]);
 const metricClass=(metricId:number)=>{
  const zone=report?.score?.results?.find(result=>result.metricId===metricId)?.zone;
  return zone==='TARGET'?' metric-zone-green':zone==='BELOW_TARGET'?' metric-zone-yellow':zone==='CRITICAL'?' metric-zone-red':'';
 };
 const input=(label:string,v:unknown,update:(s:string)=>void,className='')=><input className={'input'+className} aria-label={label} inputMode="decimal" value={String(v??'')} disabled={fieldDisabled} onChange={e=>update(e.target.value)}/>;
 const reportState=locked?'Исторический · только чтение':testEditing?'Исторический · тестовое редактирование':report?.status==='SUBMITTED'?'Заполнено':'Не заполнено';
 const saveStatus=visibleError?visibleError:autosaveState==='saving'?'Сохраняем изменения…':autosaveState==='waiting'?'Сохранение через 2 секунды':autosaveState==='saved'?'Все изменения сохранены':locked?'Редактирование закрыто':'Автосохранение включено';
 const activeAnalysisGroups=analysisSections.map(group=>({...group,questions:questions.filter(question=>question.section===group.section&&(question.questionKey!=='inventory_analysis'||inventoryAvailable)).sort((a,b)=>a.displayOrder-b.displayOrder)})).filter(group=>group.questions.length>0&&blockFor(group.section)===activeBlock);
 const activeQuestions=activeAnalysisGroups.flatMap(group=>group.questions);
 const answeredQuestions=activeQuestions.filter(question=>report?.analyses.some(answer=>answer.questionKey===question.questionKey&&answer.content.trim().length>=3)).length;
 return <div className="page leader-report">
      <div className="page-header leader-report-header"><div><h1 className="page-title">Отчёт за {period}</h1><div className="leader-report-meta"><span className="badge">{reportState}</span><span className={'leader-save-status '+(visibleError?'is-error':autosaveState)} role={visibleError?'alert':'status'} aria-live="polite">{saveStatus}</span></div></div><div className="page-actions"><button className="btn btn-primary" disabled={!report||locked||saving} onClick={()=>save(true)}>Отправить отчёт</button></div></div>
  <div className={'leader-report-example'+(exampleHelp.dismissed?' is-subtle':' is-prominent')}>
   {!exampleHelp.dismissed&&<div className="leader-report-help-copy"><strong>Заполняете отчёт впервые?</strong><p>Пройдите пример с подсказками для каждого показателя.</p></div>}
   <div className="leader-report-help-actions">
    <Link className={'leader-report-example-link'+(exampleHelp.dismissed?'':' btn btn-primary')} to={'/report-example?'+exampleParams.toString()} aria-disabled={dirty||saving||exampleHelp.saving} title={dirty||saving?'Дождитесь сохранения изменений':undefined} onClick={event=>{if(dirty||saving||exampleHelp.saving)event.preventDefault();}}>Пример заполнения отчёта</Link>
    {!exampleHelp.dismissed&&<button type="button" className="btn btn-ghost" disabled={!exampleHelp.canSave} onClick={()=>void exampleHelp.dismiss()}>Мне не нужна помощь</button>}
   </div>
   {exampleHelp.error&&<p className="leader-report-help-error" role="alert">{exampleHelp.error}</p>}
  </div>
  <div className="card leader-report-controls"><label><span>Кофейня</span><SelectControl label="Кофейня" value={shopId} disabled={dirty||saving} onChange={value=>setShopId(Number(value))} options={shops.map(s=>({value:s.id,label:s.name}))}/></label><label className="period-control"><span>Отчётный период</span><MonthPicker label="Период" value={period} disabled={dirty||saving} onChange={setPeriod}/></label><aside className="leader-deadline"><strong>{testEditing?'Тестовый режим':'Сроки отчёта'}</strong><span>{testEditing?'Редактирование прошлых месяцев открыто для проверки триггеров.':'Сдать до 10-го числа следующего месяца, 12:00 МСК. Редактирование открыто до конца следующего месяца.'}</span>{report?.submittedAt&&<span className="leader-submitted"><b>Отправлен</b>{new Date(report.submittedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})} МСК</span>}</aside></div>
  {loading?<LoadingState variant="panel" label="Загружаем отчёт" />:!shops.length?<p>Нет доступных кофеен. Обратитесь к администратору для назначения.</p>:report&&<>
   <div className="report-section-toolbar"><div className="tabs">{blocks.map((label,index)=><button key={label} className={'tab'+(activeBlock===index?' active':'')} onClick={()=>setActiveBlock(index)}>{label}</button>)}</div><div className={'report-rating'+(report.score?.rating==null?'':report.score.rating>=ratingThresholds.green?' metric-zone-green':report.score.rating<=ratingThresholds.red?' metric-zone-red':' metric-zone-yellow')}><span>Рейтинг</span><strong>{dirty&&!negativeError?'…':report.score?.rating??'—'}</strong><small>{negativeError?'Последний сохранённый рейтинг':dirty?'Пересчитываем после сохранения':'из '+(report.score?.maxPoints??100)+' баллов'}</small></div></div>
   {activeBlock===1&&<section className="card labor-overview" aria-label="Выручка и напитки"><div className="labor-overview-header"><div><h2 className="card-title">Выручка и напитки</h2><p>Факт за выбранный период и план на следующий месяц.</p></div><div className="labor-previous"><span>Предыдущий факт</span><strong>{previous?.revenue??'—'} ₽</strong><strong>{previous?.drinksCount??'—'} напитков</strong></div></div><div className="labor-overview-grid"><label><span>Выручка, ₽</span>{input('Выручка',report.revenue,v=>change(r=>({...r,revenue:v})))}</label><label><span>План выручки</span>{input('План выручки',report.formData?.revenuePlan,v=>field('revenuePlan',v))}</label><label><span>Количество напитков</span>{input('Количество напитков',report.drinksCount,v=>change(r=>({...r,drinksCount:v})))}</label><label><span>План напитков</span>{input('План напитков',report.formData?.drinksPlan,v=>field('drinksPlan',v))}</label></div></section>}
   {activeBlock!==4&&<div className="card table-wrap"><table className="table"><thead><tr><th>Показатель</th><th>Предыдущий факт</th><th>Текущий факт</th><th>План следующего месяца</th></tr></thead><tbody>
    {visibleMetrics.filter(m=>(['FREE_ACCESS','DEPOSIT'].includes(m.code)?0:blockFor(m.section||m.code))===activeBlock).sort((a,b)=>a.displayOrder-b.displayOrder).map(m=>{
     const share=['LABOR_COST','FREE_ACCESS','DEPOSIT','DESSERT_WRITEOFF','PRODUCT_WRITEOFF'].includes(m.code);
     return <tr key={m.id}><td><span className="report-metric-label">{m.name}</span><div className="helper-text">{share?'Сумма, ₽; доля от выручки автоматически':m.unit}</div></td><td>{value(previous,m.id)===''?'—':value(previous,m.id)}</td><td>{input(m.name,value(report,m.id),v=>change(r=>({...r,metricValues:[...r.metricValues.filter(x=>x.metricId!==m.id),{metricId:m.id,absoluteValue:v}]})),metricClass(m.id))}</td><td>{input('План: '+m.name,report.formData?.['metricPlan_'+m.id],v=>field('metricPlan_'+m.id,v))}</td></tr>;
    })}
   {extras.filter(f=>f.block===activeBlock).map(f=><tr key={f.key}><td><span className="report-metric-label">{f.label}</span><div className="helper-text">{f.hint}</div>{f.key==='gifts'&&<ReportDocumentLink label="Документ" ariaLabel="Ссылка на подарки" value={report.formData?.giftsLink} disabled={fieldDisabled} onChange={value=>field('giftsLink',value)}/>}{f.key==='equipment'&&<ReportDocumentLink label="План затрат" ariaLabel="Ссылка на план затрат на оборудование" value={report.formData?.equipmentLink} disabled={fieldDisabled} onChange={value=>field('equipmentLink',value)}/>}</td><td>{previous?.formData?.[f.key]??'—'}</td><td>{input(f.label,report.formData?.[f.key],v=>field(f.key,v))}</td><td>{input('План: '+f.label,report.formData?.[f.key+'Plan'],v=>field(f.key+'Plan',v))}</td></tr>)}
   </tbody></table></div>}
   {activeBlock===2&&<aside className="inventory-availability-note" role="note">Инвентаризация пока доступна только для кофеен Омска и Новосибирска.</aside>}
   {activeBlock===2&&inventoryAvailable&&<section className="card inventory-card" aria-labelledby="inventory-title"><div className="inventory-card-heading"><div><h2 id="inventory-title" className="card-title">Инвентаризация</h2><p>Введите суммы в рублях. Доли от выручки рассчитаются автоматически.</p></div></div><div className="inventory-grid"><div className="inventory-field"><label><span>Сумма излишков, ₽</span>{input('Сумма излишков, ₽',report.formData?.inventorySurplus,v=>field('inventorySurplus',v))}</label><div className="inventory-share"><span>Доля излишков от выручки</span><strong className="inventory-share-value">{revenuePercentage(report.formData?.inventorySurplus,report.revenue)===null?'—':revenuePercentage(report.formData?.inventorySurplus,report.revenue)+'%'}</strong></div></div><div className="inventory-field"><label><span>Сумма недостач, ₽</span>{input('Сумма недостач, ₽',report.formData?.inventoryShortage,v=>field('inventoryShortage',v))}</label><div className="inventory-share"><span>Доля недостач от выручки</span><strong className="inventory-share-value">{revenuePercentage(report.formData?.inventoryShortage,report.revenue)===null?'—':revenuePercentage(report.formData?.inventoryShortage,report.revenue)+'%'}</strong></div></div></div></section>}
   <section className="card analysis-card" aria-labelledby="analysis-title"><div className="analysis-card-header"><div><h2 id="analysis-title" className="card-title">Анализ показателей</h2><p>Структура соответствует шаблону отчёта: у каждого показателя свой анализ. Откройте нужный раздел и заполните только относящиеся к нему пункты.</p></div><span className="badge">{answeredQuestions} из {activeQuestions.length} ответов</span></div>{activeAnalysisGroups.length===0?<p className="empty">Для этого раздела пока нет вопросов для анализа.</p>:<div className="analysis-groups">{activeAnalysisGroups.map(group=>{const expanded=expandedAnalysisSection===group.section;const answered=group.questions.filter(question=>report.analyses.some(answer=>answer.questionKey===question.questionKey&&answer.content.trim().length>=3)).length;return <article className="analysis-group" key={group.section}><button type="button" className="analysis-group-toggle" aria-expanded={expanded} onClick={()=>setExpandedAnalysisSection(expanded?null:group.section)}><span><strong>{group.title}</strong><small>{group.hint}</small></span><span className="analysis-group-count">{answered}/{group.questions.length} {expanded?'⌃':'⌄'}</span></button>{expanded&&<div className="analysis-list">{group.questions.map(question=>{const text=report.analyses.find(answer=>answer.questionKey===question.questionKey)?.content||'';const filled=text.trim().length>=3;const linkedMetrics=requiredMetricNames(question);const required=linkedMetrics.length>0;const invalid=requiredAnalysisErrors.includes(question.questionKey);return <label className={'field analysis-question'+(required?' is-required':'')+(invalid?' is-invalid':'')} key={question.questionKey}><span>{question.label}<span className={filled?'analysis-answer-state filled':required?'analysis-answer-state required':'analysis-answer-state'}>{filled?'Заполнено':required?'Обязательно':'Необязательно'}</span></span><textarea className="textarea" maxLength={20000} required={required} aria-required={required} aria-invalid={invalid} aria-describedby={invalid?'analysis-error-'+question.questionKey:undefined} placeholder="Например: что произошло, почему и что сделаете в следующем месяце" value={text} disabled={fieldDisabled} onChange={e=>{const content=e.target.value;change(r=>({...r,analyses:[...r.analyses.filter(answer=>answer.questionKey!==question.questionKey),{questionKey:question.questionKey,content}]}));}}/>{required&&<small className="analysis-required-hint">Показатель: {linkedMetrics.join(', ')}. Опишите причины и действия.</small>}{invalid&&<small id={'analysis-error-'+question.questionKey} className="analysis-validation-error">Введите не менее 3 символов.</small>}</label>;})}</div>}</article>;})}</div>}</section>
  </>}
 </div>;
}
