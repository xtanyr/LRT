import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import '../../styles/pages.css';
import './AdminImportPage.css';
import { SelectControl } from '../../components/SelectControl';
interface Row {metricId?:number;code:string;metricName:string;rawValue:string;absoluteValue:number|null;computedPercent:number|null;sourcePoints:number|null;sourceValueCell:string;sourcePointsCell:string;issue?:string}
interface Period {selected:boolean;year?:number;month:number;revenue:number|null;drinksCount:number|null;sourceRating:number|null;sourceSheet:string;rows:Row[];issues:{severity:string;message:string;cell?:string;field?:string}[]}
interface Preview {coffeeShopId:number;sourceFile:string;periods:Period[];warnings:string[]}
export default function AdminImportPage() {
 const [shops,setShops]=useState<{id:number;name:string;city:{name:string}}[]>([]),[shopId,setShopId]=useState(0),[file,setFile]=useState<File|null>(null);
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{api.get('/coffee-shops').then(r=>setShops(r.data.data||r.data||[])).catch(()=>setMessage('Не удалось загрузить кофейни'));},[]);
 const failed=(e:any)=>{const m=e.response?.data?.message;setMessage(Array.isArray(m)?m.join(', '):m||'Ошибка импорта');};
 const upload=async()=>{
  if(!file||!shopId)return;setBusy(true);setMessage('');setPreview(null);
  try {const data=new FormData();data.append('file',file);const response=await api.post('/admin/imports/preview',data);const p=response.data.data||response.data;setPreview({...p,coffeeShopId:shopId,periods:p.periods.map((x:Period)=>({...x,selected:false}))});}catch(e){failed(e);}finally{setBusy(false);}
 };
 const confirm=async()=>{
  if(!preview)return;setBusy(true);setMessage('');
  try {const response=await api.post('/admin/imports/confirm',{coffeeShopId:preview.coffeeShopId,sourceFile:preview.sourceFile,periods:preview.periods.filter(p=>p.selected)});const result=response.data.data||response.data;setMessage('Импортировано периодов: '+result.imported.length);setPreview(null);}catch(e){failed(e);}finally{setBusy(false);}
 };
 const invalid=(p:Period)=>!p.year||p.sourceRating===null||p.rows.some(r=>!r.metricId||r.issue)||p.issues.some(i=>i.severity==='error'&&!(i.field==='revenue'&&p.revenue!==null));
 return <div className="page import-page"><div className="page-header"><div><h1 className="page-title">Импорт исторических данных</h1><p className="page-sub">Загрузите архивный XLSX и сначала проверьте найденные периоды.</p></div></div>
  <div className="import-note"><strong>Данные в безопасности.</strong> Сохраняются исходные значения, баллы и правила расчёта. Уже существующие отчёты не перезаписываются.</div>
  <section className="card import-start-card" aria-label="Выбор файла для импорта"><label className="field"><span className="field-label">Кофейня</span><SelectControl label="Кофейня" value={shopId} disabled={busy} onChange={value=>{setShopId(Number(value));setPreview(null);}} options={[{value:0,label:"Выберите кофейню"},...shops.map(s=>({value:s.id,label:s.name+" · "+s.city.name}))]}/></label><label className="field"><span className="field-label">Excel-файл</span><input className="input import-file-input" type="file" accept=".xlsx" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);}}/></label><button className="btn btn-primary import-preview-button" disabled={!file||!shopId||busy} onClick={upload}>{busy?'Проверяем файл…':'Проверить файл'}</button></section>
  {message&&<p className="import-status" role="status">{message}</p>}
  {preview&&<><div className="import-preview-heading"><div><h2 className="card-title">Периоды в файле</h2><p>Файл: <strong>{preview.sourceFile}</strong></p></div><span className="badge">Выберите готовые периоды</span></div>{preview.warnings.map((w,i)=><p className="import-warning" key={i}>{w}</p>)}
   {preview.periods.map((p,index)=><details className="card import-period" key={index}><summary><label><input type="checkbox" checked={p.selected} disabled={busy||invalid(p)} onChange={e=>{const selected=e.target.checked;setPreview({...preview,periods:preview.periods.map((x,i)=>i===index?{...x,selected}:x)});}}/><span><strong>{p.month}/{p.year??'год не определён'}</strong><small>Рейтинг: {p.sourceRating??'нет данных'} · {invalid(p)?'нужна проверка исходника':p.revenue===null?'готов к импорту без выручки':'готов к импорту'}</small></span></label></summary>
    <div className="import-period-facts"><label className="field"><span className="field-label">Выручка, ₽</span><input className="input" inputMode="decimal" placeholder="нет в файле — необязательно" aria-label={'Выручка '+p.month+'/'+p.year} value={p.revenue??''} onChange={e=>{const value=e.target.value.trim();const revenue=value===''?null:Number(value.replace(',','.'));setPreview({...preview,periods:preview.periods.map((x,j)=>j===index?{...x,revenue:Number.isFinite(revenue)?revenue:null}:x)});}}/></label><div><span>Напитки</span><strong>{p.drinksCount??'не найдены'}</strong></div></div>
    {p.issues.map((issue,i)=><p className="import-warning" key={i}>{issue.cell} {issue.message}</p>)}
    <div className="table-wrap"><table className="table"><thead><tr><th>Метрика</th><th>Источник</th><th>Значение</th><th>Доля, %</th><th>Исходные баллы</th></tr></thead><tbody>{p.rows.map((r,i)=><tr key={i}><td>{r.metricName}{r.issue&&<p className="import-warning">{r.issue}</p>}</td><td>{r.sourceValueCell}</td><td>{r.absoluteValue??r.rawValue??'—'}</td><td>{r.computedPercent??'—'}</td><td>{r.sourcePoints??'—'} ({r.sourcePointsCell})</td></tr>)}</tbody></table></div>
   </details>)}
   <div className="import-confirm"><button className="btn btn-primary" disabled={busy||!preview.periods.some(p=>p.selected)} onClick={confirm}>{busy?'Импортируем…':'Импортировать выбранные периоды'}</button></div>
  </>}
 </div>;
}
