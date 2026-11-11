import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import ToastProvider from '../components/ToastProvider';
import LeaderReportPage from '../pages/leader/LeaderReportPage';
import { api } from '../services/api';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

describe('LeaderReportPage', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url) => ({data: url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] : url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] : url==='/admin/analysis-questions' ? [{questionKey:'enps_problem',label:'Проблемы eNPS',section:'ENPS',displayOrder:1}] : null}) as any);
  vi.mocked(api.post).mockImplementation(async (_url,body) => ({data:{...(body as object),id:12,score:{rating:0,results:[]}}}) as any);
 });
 afterEach(cleanup);
 it.each([[85,'green'],[55,'red'],[56,'yellow'],[84,'yellow']])('colors total rating %s using configured thresholds and shared boundaries', async (rating, color) => {
  vi.mocked(api.get).mockImplementation(async (url) => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/admin/analysis-questions' ? [] :
   url==='/admin/rating-color-config' ? {greenThreshold:'85',redThreshold:'55'} :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[],analyses:[],score:{rating,results:[]}}
  }) as any);
  const {container}=render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  await waitFor(()=>expect(container.querySelector('.report-rating')).toHaveClass('metric-zone-'+color));
 });
 it.each([
  ['TARGET',false],
  ['BELOW_TARGET',true],
  ['CRITICAL',true],
 ])('marks linked analysis as required only in non-green zone %s', async (zone, required) => {
  vi.mocked(api.get).mockImplementation(async url => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/admin/analysis-questions' ? [{questionKey:'enps_problems',label:'Проблемы eNPS',section:'ENPS',displayOrder:1,metricCodes:['ENPS']}] :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[{metricId:1,absoluteValue:90}],analyses:[],formData:{},score:{rating:10,results:[{metricId:1,zone,pointsAwarded:0}]}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  fireEvent.click(screen.getByRole('button',{name:/eNPS/}));

  const analysis=await screen.findByRole('textbox',{name:/Проблемы eNPS/});
  expect(analysis).toHaveAttribute('aria-required',String(required));
  expect(screen.getByText(required?'Обязательно':'Необязательно')).toBeInTheDocument();
  if(required) expect(screen.getByText('Показатель: eNPS. Опишите причины и действия.')).toBeInTheDocument();
 });

 it('saves current values and blocks submission with a missing required analysis', async () => {
  const report={id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,
   metricValues:[{metricId:1,absoluteValue:70}],analyses:[],formData:{},
   score:{rating:0,results:[{metricId:1,zone:'CRITICAL',pointsAwarded:0}]}};
  vi.mocked(api.get).mockImplementation(async url => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/admin/analysis-questions' ? [{questionKey:'enps_problems',label:'Проблемы eNPS',section:'ENPS',displayOrder:1,metricCodes:['ENPS']}] : report
  }) as any);
  vi.mocked(api.post).mockImplementation(async (url,body) => ({data:
   url==='/reports/draft' ? {...report,...(body as object)} : {...report,status:'SUBMITTED'}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');

  fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));

  expect(await screen.findByRole('alert')).toHaveTextContent(/обязательн.*анализ/i);
  expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({metricValues:[{metricId:1,absoluteValue:70}]}));
  expect(api.post).not.toHaveBeenCalledWith('/reports/44/submit');
  expect(await screen.findByRole('textbox',{name:/Проблемы eNPS/})).toHaveAttribute('aria-invalid','true');
 });

 it('allows submission with empty linked analysis when the metric is green', async () => {
  const report={id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,
   metricValues:[{metricId:1,absoluteValue:95}],analyses:[],formData:{},
   score:{rating:11.5,results:[{metricId:1,zone:'TARGET',pointsAwarded:11.5}]}};
  vi.mocked(api.get).mockImplementation(async url => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/admin/analysis-questions' ? [{questionKey:'enps_problems',label:'Проблемы eNPS',section:'ENPS',displayOrder:1,metricCodes:['ENPS']}] : report
  }) as any);
  vi.mocked(api.post).mockImplementation(async url => ({data:url==='/reports/draft'?report:{...report,status:'SUBMITTED'}}) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');

  fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));

  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/44/submit'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });

 it('saves shop, selected period, comma decimals, plans and optional analysis together', async () => {
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('eNPS'),{target:{value:'95,5'}});
  fireEvent.change(screen.getByLabelText('План: eNPS'),{target:{value:'97'}});
  fireEvent.click(screen.getByRole('button',{name:/eNPS/}));
  fireEvent.change(screen.getByLabelText(/Проблемы eNPS/),{target:{value:'Причины описаны'}});
  await waitFor(()=>expect(api.post).toHaveBeenCalled(),{timeout:2500});
  const payload=vi.mocked(api.post).mock.calls[0][1] as any;
  expect(payload.coffeeShopId).toBe(7);
  expect(payload.month).toBeGreaterThan(0);
  expect(payload.metricValues).toEqual([{metricId:1,absoluteValue:'95,5'}]);
  expect(payload.formData.metricPlan_1).toBe('97');
  expect(payload.analyses).toEqual([{questionKey:'enps_problem',content:'Причины описаны'}]);
 });
 it('keeps edits and exposes server errors when saving fails', async () => {
  vi.mocked(api.post).mockRejectedValueOnce({response:{data:{message:'Ошибка проверки'}}});
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('eNPS'),{target:{value:'bad'}});
  expect(await screen.findByRole('alert',{}, {timeout:2500})).toHaveProperty('textContent','Ошибка проверки');
  expect((screen.getByLabelText('eNPS') as HTMLInputElement).value).toBe('bad');
 });
 it('renders a legacy report that has no optional array fields', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({data: url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] : url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] : url==='/admin/analysis-questions' ? [{questionKey:'enps_problem',label:'Проблемы eNPS',section:'ENPS',displayOrder:1}] : {id:44,coffeeShopId:7,year:2026,month:8,revenue:1000,drinksCount:50,status:'SUBMITTED'}}) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  expect(await screen.findByLabelText('eNPS')).not.toBeNull();
  fireEvent.click(screen.getByRole('button',{name:/eNPS/}));
  expect((screen.getByLabelText(/Проблемы eNPS/) as HTMLTextAreaElement).value).toBe('');
 });
 it('automatically saves changes after two seconds', async () => {
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('eNPS'),{target:{value:'95'}});
  await new Promise(resolve=>setTimeout(resolve,2100));
  expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({metricValues:[{metricId:1,absoluteValue:'95'}]}));
 });
 it('keeps analysis text focused and editable while an autosave is in flight', async () => {
  const defaultGet=vi.mocked(api.get).getMockImplementation()!;
  let reportRequest=0;
  vi.mocked(api.get).mockImplementation(async url=>{
   if(url.startsWith('/reports/coffee-shop/'))return {data:reportRequest++===0?{id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[],analyses:[{questionKey:'enps_problem',content:'Сохранённый текст для проверки'}],formData:{}}:null} as any;
   return defaultGet(url) as any;
  });
  const finishSaves:(()=>void)[]=[];
  vi.mocked(api.post).mockImplementation((_url,body)=>new Promise(resolve=>{
   finishSaves.push(()=>resolve({data:{...(body as object),id:44,isEditable:true,score:{rating:0,results:[]}}} as any));
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:/eNPS/}));
  const analysis=await screen.findByRole('textbox',{name:/Проблемы eNPS/}) as HTMLTextAreaElement;
  fireEvent.change(analysis,{target:{value:'Обновлённый текст для проверки'} });
  analysis.focus();
  analysis.setSelectionRange(7,7);

  try {
   await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({analyses:[{questionKey:'enps_problem',content:'Обновлённый текст для проверки'}]})),{timeout:2500});
   expect(analysis).toBeEnabled();
   expect(analysis).toHaveFocus();
   expect(analysis.selectionStart).toBe(7);
   fireEvent.change(analysis,{target:{value:'Новое изменение во время сохранения'} });
   expect(analysis).toHaveValue('Новое изменение во время сохранения');
   await act(async()=>{finishSaves[0]();});
   await waitFor(()=>expect(api.post).toHaveBeenCalledTimes(2),{timeout:3000});
   expect(api.post).toHaveBeenLastCalledWith('/reports/draft',expect.objectContaining({analyses:[{questionKey:'enps_problem',content:'Новое изменение во время сохранения'}]}));
   await act(async()=>{finishSaves[1]();});
   await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Все изменения сохранены'));
  } finally {
   await act(async()=>{finishSaves.forEach(finish=>finish());});
  }
 });
 it('flushes pending edits when leaving the report before the autosave delay expires', async () => {
  const {unmount}=render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('eNPS'),{target:{value:'95'}});
  fireEvent.click(screen.getByRole('button',{name:/eNPS/}));
  fireEvent.change(screen.getByLabelText(/Проблемы eNPS/),{target:{value:'Причины и действия'}});
  unmount();
  expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({
   metricValues:[{metricId:1,absoluteValue:'95'}],
   analyses:[{questionKey:'enps_problem',content:'Причины и действия'}],
  }));
 });
 it('waits for an exit save before reloading that report', async () => {
  let storedReport:any=null;
  let finishSave:(()=>void)|undefined;
  const defaultGet=vi.mocked(api.get).getMockImplementation()!;
  vi.mocked(api.get).mockImplementation(async url=>{
   if(url==='/reports/coffee-shop/7/2026/9')return {data:storedReport} as any;
   if(url==='/reports/coffee-shop/7/2026/8')return {data:null} as any;
   return defaultGet(url) as any;
  });
  vi.mocked(api.post).mockImplementation((_url,body)=>new Promise(resolve=>{
   finishSave=()=>{
    storedReport={...(body as object),id:44,isEditable:true,score:{rating:0,results:[]}};
    resolve({data:storedReport} as any);
   };
  }) as any);
  const renderReport=()=>render(<MemoryRouter initialEntries={['/report?period=2026-09']}><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  const first=renderReport();
  fireEvent.change(await screen.findByLabelText('eNPS'),{target:{value:'95'}});
  first.unmount();
  expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({metricValues:[{metricId:1,absoluteValue:'95'}]}));

  renderReport();
  await waitFor(()=>expect(vi.mocked(api.get).mock.calls.filter(([url])=>url==='/coffee-shops')).toHaveLength(2));
  expect(vi.mocked(api.get).mock.calls.filter(([url])=>url==='/reports/coffee-shop/7/2026/9')).toHaveLength(1);
  finishSave?.();
  await waitFor(()=>expect(screen.getByLabelText('eNPS')).toHaveValue('95'));
 });
 it('does not show the removed gifts section and shows separate analysis fields for each expense article', async () => {
  const questions = [
   {questionKey:'gifts_top_reasons',label:'Топ-5 причин за месяц',section:'GIFTS',displayOrder:1},
   {questionKey:'gifts_actions_plan',label:'Действия по устранению и план на месяц',section:'GIFTS',displayOrder:2},
   {questionKey:'dessert_writeoff_analysis',label:'Списания десертов: причины и план',section:'DESSERT_WRITEOFF',displayOrder:1},
   {questionKey:'product_writeoff_analysis',label:'Списания продуктов: причины и план',section:'PRODUCT_WRITEOFF',displayOrder:1},
   {questionKey:'free_access_analysis',label:'Свободный доступ: расходы и план',section:'FREE_ACCESS',displayOrder:1},
   {questionKey:'admin_costs_analysis',label:'Административные затраты: причины и план',section:'ADMIN_COSTS',displayOrder:1},
   {questionKey:'rent_analysis',label:'Аренда: причины и план',section:'RENT',displayOrder:1},
   {questionKey:'equipment_analysis',label:'Оборудование: анализ и план',section:'EQUIPMENT',displayOrder:1},
   {questionKey:'materials_analysis',label:'Материалы: анализ и план',section:'EQUIPMENT',displayOrder:2},
   {questionKey:'repair_analysis',label:'Ремонт: анализ и план',section:'EQUIPMENT',displayOrder:3},
  ];
  vi.mocked(api.get).mockImplementation(async url => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/admin/analysis-questions' ? questions :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[],analyses:[],formData:{}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);

  await screen.findByLabelText('eNPS');
  expect(screen.queryByRole('button',{name:/Подарки/})).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Подарки, ₽')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox',{name:/Топ-5 причин за месяц/})).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button',{name:'Себестоимость'}));
  for (const [section,label] of [
   ['Списание десертов','Списания десертов: причины и план'],
   ['Списание продуктов','Списания продуктов: причины и план'],
   ['Свободный доступ','Свободный доступ: расходы и план'],
  ]) {
   fireEvent.click(screen.getByRole('button',{name:new RegExp(section)}));
   expect(screen.getByRole('textbox',{name:new RegExp(label)})).toBeInTheDocument();
  }

  fireEvent.click(screen.getByRole('button',{name:'Расходы'}));
  for (const [section,label] of [
   ['Административные затраты','Административные затраты: причины и план'],
   ['Аренда','Аренда: причины и план'],
   ['Оборудование, материалы и ремонт','Оборудование: анализ и план'],
  ]) {
   fireEvent.click(screen.getByRole('button',{name:new RegExp(section)}));
   expect(screen.getByRole('textbox',{name:new RegExp(label)})).toBeInTheDocument();
  }
  expect(screen.getByRole('textbox',{name:/Материалы: анализ и план/})).toBeInTheDocument();
  expect(screen.getByRole('textbox',{name:/Ремонт: анализ и план/})).toBeInTheDocument();
 });
 it.each(['Омск','Новосибирск'])('shows ruble inventory amounts with revenue shares and analysis for %s shops', async cityName => {
  const questions=[{questionKey:'inventory_analysis',label:'Анализ инвентаризации',section:'COSTING',displayOrder:1}];
  vi.mocked(api.get).mockImplementation(async url => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня',city:{id:1,name:cityName}}] :
   url==='/admin/analysis-questions' ? questions :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:5000000,drinksCount:50,isEditable:true,metricValues:[],analyses:[],formData:{}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  fireEvent.click(screen.getByRole('button',{name:'Себестоимость'}));

  expect(screen.getByRole('note')).toHaveTextContent('Инвентаризация пока доступна только для кофеен Омска и Новосибирска.');
  const surplus=screen.getByLabelText('Сумма излишков, ₽');
  const shortage=screen.getByLabelText('Сумма недостач, ₽');
  expect(surplus).toBeInTheDocument();
  expect(shortage).toBeInTheDocument();
  expect(screen.getAllByText('—', {selector:'.inventory-share-value'})).toHaveLength(2);

  fireEvent.change(surplus,{target:{value:'15000'}});
  fireEvent.change(shortage,{target:{value:'7500'}});
  expect(screen.getByText('0,3%',{selector:'.inventory-share-value'})).toBeInTheDocument();
  expect(screen.getByText('0,15%',{selector:'.inventory-share-value'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:/Себестоимость.*Причины отклонений/}));
  const analysis=screen.getByRole('textbox',{name:/Анализ инвентаризации/});
  fireEvent.change(analysis,{target:{value:'Проверить расхождения по молоку и десертам'}});

  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({
   formData:expect.objectContaining({inventorySurplus:'15000',inventoryShortage:'7500'}),
   analyses:[{questionKey:'inventory_analysis',content:'Проверить расхождения по молоку и десертам'}],
  })),{timeout:2500});
 });
 it('shows the inventory scope warning and hides inventory fields outside Omsk and Novosibirsk', async () => {
  vi.mocked(api.get).mockImplementation(async url => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня',city:{id:2,name:'Казань'}}] :
   url==='/admin/analysis-questions' ? [{questionKey:'inventory_analysis',label:'Анализ инвентаризации',section:'COSTING',displayOrder:1}] :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:5000000,drinksCount:50,isEditable:true,metricValues:[],analyses:[],formData:{}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  fireEvent.click(screen.getByRole('button',{name:'Себестоимость'}));
  expect(screen.getByRole('note')).toHaveTextContent('Инвентаризация пока доступна только для кофеен Омска и Новосибирска.');
  expect(screen.queryByLabelText('Сумма излишков, ₽')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Сумма недостач, ₽')).not.toBeInTheDocument();
  expect(screen.queryByRole('button',{name:/Анализ инвентаризации/})).not.toBeInTheDocument();
 });
 it('colors a saved metric using its server-calculated zone', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
   if(url==='/metrics') return {data:[{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}]} as any;
   if(url==='/coffee-shops') return {data:[{id:7,name:'Тестовая кофейня'}]} as any;
   if(url==='/admin/analysis-questions') return {data:[]} as any;
   return {data:{id:44,coffeeShopId:7,year:2026,month:8,revenue:1000,drinksCount:50,metricValues:[{metricId:1,absoluteValue:70}],analyses:[],score:{rating:10,results:[{metricId:1,zone:'CRITICAL',pointsAwarded:0}]}}} as any;
  });
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  expect((await screen.findByLabelText('eNPS')).className).toContain('metric-zone-red');
 });
 it('keeps the last saved color visible while an edit waits for autosave', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => {
   if(url==='/metrics') return {data:[{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}]} as any;
   if(url==='/coffee-shops') return {data:[{id:7,name:'Тестовая кофейня'}]} as any;
   if(url==='/admin/analysis-questions') return {data:[]} as any;
   return {data:{id:44,coffeeShopId:7,year:2026,month:8,revenue:1000,drinksCount:50,metricValues:[{metricId:1,absoluteValue:70}],analyses:[],score:{rating:10,results:[{metricId:1,zone:'CRITICAL',pointsAwarded:0}]}}} as any;
  });
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  const input=await screen.findByLabelText('eNPS');
  fireEvent.change(input,{target:{value:'75'}});
  expect(input.className).toContain('metric-zone-red');
 });

 describe('archived metrics', () => {
  const loadReportWithArchivedMetric = (isEditable:boolean, archivedValue:number = 250) => {
   const report={
    id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable,isLocked:!isEditable,
    metricValues:[{metricId:1,absoluteValue:70},{metricId:2,absoluteValue:archivedValue}],analyses:[],
    formData:{metricPlan_2:'275'},
    score:{rating:isEditable?8:16,maxPoints:isEditable?8:16,results:[{metricId:1,zone:'TARGET',pointsAwarded:8},...(!isEditable?[{metricId:2,zone:'TARGET',pointsAwarded:8}]:[])]},
   };
   vi.mocked(api.get).mockImplementation(async url => ({data:
    url==='/metrics' ? [
     {id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1,isActive:true},
     {id:2,name:'Доля депозита в выручке',code:'DEPOSIT',unit:'%',section:'TEAM_GUESTS',displayOrder:2,isActive:false},
    ] : url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
    url==='/admin/analysis-questions' ? [] :
    url==='/reports/editing-policy' ? {historicalEditingEnabled:false} : report
   }) as any);
   vi.mocked(api.post).mockImplementation(async (_url,body) => ({data:{...report,...(body as object)}}) as any);
  };

  it('hides an archived metric in an editable report and leaves its stored plan intact when saving', async () => {
   loadReportWithArchivedMetric(true);
   render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   const metric=await screen.findByLabelText('eNPS');
   expect(screen.queryByLabelText('Доля депозита в выручке')).not.toBeInTheDocument();
   expect(screen.queryByLabelText('План: Доля депозита в выручке')).not.toBeInTheDocument();
   expect(screen.getByText('Рейтинг').parentElement?.querySelector('strong')).toHaveTextContent('8');
   fireEvent.change(metric,{target:{value:'80'}});
   await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({
    metricValues:[{metricId:1,absoluteValue:'80'}],formData:{metricPlan_2:'275'},
   })),{timeout:2500});
   await waitFor(()=>expect(metric).toBeEnabled());
   expect(screen.queryByLabelText('Доля депозита в выручке')).not.toBeInTheDocument();
   expect(screen.getByText('Рейтинг').parentElement?.querySelector('strong')).toHaveTextContent('8');
  });

  it('does not let a hidden archived value block editing active metrics', async () => {
   loadReportWithArchivedMetric(true,-250);
   render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   fireEvent.change(await screen.findByLabelText('eNPS'),{target:{value:'80'}});
   await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({
    metricValues:[{metricId:1,absoluteValue:'80'}],
   })),{timeout:2500});
   expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server score maximum after metrics are archived', async () => {
   loadReportWithArchivedMetric(true);
   render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   await screen.findByLabelText('eNPS');
   expect(screen.getByText('Рейтинг').parentElement).toHaveTextContent('из 8 баллов');
  });

  it('retains archived facts, colors and the stored rating in a read-only historical report', async () => {
   loadReportWithArchivedMetric(false);
   render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   const archived=await screen.findByLabelText('Доля депозита в выручке');
   expect(archived).toHaveValue('250');
   expect(archived).toBeDisabled();
   expect(archived.className).toContain('metric-zone-green');
   expect(screen.getByLabelText('План: Доля депозита в выручке')).toHaveValue('275');
   expect(screen.getByText('Рейтинг').parentElement?.querySelector('strong')).toHaveTextContent('16');
   expect(api.post).not.toHaveBeenCalled();
  });
 });

 it.each([true,false])('links to the report example with the selected shop and period when isEditable is %s', async isEditable => {
  vi.mocked(api.get).mockImplementation(async path => ({data:
   path==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   path==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   path==='/admin/analysis-questions' ? [] :
   path==='/reports/editing-policy' ? {historicalEditingEnabled:false} :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable,metricValues:[],analyses:[],formData:{}}
  }) as any);
  render(<MemoryRouter initialEntries={['/report?period=2026-09&shop=7']}><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  const example=screen.getByRole('link',{name:'Пример заполнения отчёта'});
  expect(example.closest('.leader-report-example')).not.toBeNull();
  expect(example).toHaveAttribute('href','/report-example?period=2026-09&shop=7');
  fireEvent.click(screen.getByRole('button',{name:'Расходы'}));
  expect(example).toHaveAttribute('href','/report-example?period=2026-09&shop=7');
  fireEvent.click(screen.getByRole('button',{name:'Период'}));
  fireEvent.click(screen.getByRole('button',{name:'авг'}));
  expect(example).toHaveAttribute('href','/report-example?period=2026-08&shop=7');
  expect(api.post).not.toHaveBeenCalled();
 });

 it('waits for autosave before leaving the report for its example', async () => {
  render(<MemoryRouter initialEntries={['/report?period=2026-09&shop=7']}><ToastProvider><Routes>
   <Route path="/report" element={<LeaderReportPage/>}/>
   <Route path="/report-example" element={<h1>Учебный отчёт</h1>}/>
  </Routes></ToastProvider></MemoryRouter>);
  fireEvent.change(await screen.findByLabelText('eNPS'),{target:{value:'95'}});
  const example=screen.getByRole('link',{name:'Пример заполнения отчёта'});
  fireEvent.click(example);
  expect(screen.queryByRole('heading',{name:'Учебный отчёт'})).not.toBeInTheDocument();
  expect(screen.getByLabelText('eNPS')).toHaveValue('95');
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({metricValues:[{metricId:1,absoluteValue:'95'}]})),{timeout:2500});
  await waitFor(()=>expect(example).not.toHaveAttribute('aria-disabled','true'));
  fireEvent.click(example);
  expect(screen.getByRole('heading',{name:'Учебный отчёт'})).toBeInTheDocument();
 });

 const depositMetrics=[{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1},{id:2,name:'Доля депозита в выручке',code:'DEPOSIT',unit:'%',section:'TEAM_GUESTS',displayOrder:2,isActive:true}];
 it('loads depositLink beside the deposit metric and keeps the link available in a read-only report', async () => {
  const url='https://example.org/deposit?month=2026-09';
  const equipmentUrl='https://example.org/equipment-plan?month=2026-09';
  vi.mocked(api.get).mockImplementation(async path => ({data:
   path==='/metrics' ? depositMetrics :
   path==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   path==='/admin/analysis-questions' ? [] :
   path==='/reports/editing-policy' ? {historicalEditingEnabled:false} :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:false,metricValues:[],analyses:[],formData:{depositLink:url,equipmentLink:equipmentUrl}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('Доля депозита в выручке');
  expect(screen.queryByLabelText('Подарки, ₽')).not.toBeInTheDocument();
  const deposit=within(screen.getByLabelText('Доля депозита в выручке').closest('tr')!);
  expect(deposit.getByRole('textbox',{name:'Ссылка на депозит'})).toHaveValue(url);
  expect(deposit.getByRole('textbox',{name:'Ссылка на депозит'})).toBeDisabled();
  expect(deposit.getByRole('link',{name:'Открыть ↗'})).toHaveAttribute('href',url);
  expect(deposit.getByRole('link',{name:'Открыть ↗'})).toHaveAttribute('rel','noopener noreferrer');
  fireEvent.click(screen.getByRole('button',{name:'Расходы'}));
  const equipment=within(screen.getByLabelText('Оборудование, материалы, ремонт, ₽').closest('tr')!);
  expect(equipment.getByRole('textbox',{name:'Ссылка на план затрат на оборудование'})).toHaveValue(equipmentUrl);
  expect(equipment.getByRole('textbox',{name:'Ссылка на план затрат на оборудование'})).toBeDisabled();
  expect(equipment.getByRole('link',{name:'Открыть ↗'})).toHaveAttribute('href',equipmentUrl);
 });

 it('autosaves depositLink with the report and supports clearing it', async () => {
  vi.mocked(api.get).mockImplementation(async path => ({data:
   path==='/metrics' ? depositMetrics :
   path==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   path==='/admin/analysis-questions' ? [] :
   path==='/reports/editing-policy' ? {historicalEditingEnabled:false} :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[],analyses:[],formData:{}}
  }) as any);
  vi.mocked(api.post).mockImplementation(async (_url,body) => ({data:{id:44,coffeeShopId:7,year:2026,month:9,isEditable:true,...(body as object)}}) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  const amount=await screen.findByLabelText('Доля депозита в выручке');
  const deposit=within(amount.closest('tr')!);
  const link=deposit.getByRole('textbox',{name:'Ссылка на депозит'});
  expect(link).toHaveValue('');
  const url='https://example.org/deposit?month=2026-09';
  fireEvent.change(link,{target:{value:url}});
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({formData:{depositLink:url}})),{timeout:2500});
  await waitFor(()=>expect(link).toBeEnabled());
  expect(link).toHaveValue(url);
  expect(deposit.getByRole('link',{name:'Открыть ↗'})).toHaveAttribute('href',url);
  fireEvent.change(link,{target:{value:''}});
  expect(deposit.queryByRole('link',{name:'Открыть ↗'})).not.toBeInTheDocument();
  await waitFor(()=>expect(api.post).toHaveBeenLastCalledWith('/reports/draft',expect.objectContaining({formData:{depositLink:''}})),{timeout:2500});
 });

 it('autosaves the equipment and repair plan document URL with the report', async () => {
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button',{name:'Расходы'}));
  const link=await screen.findByRole('textbox',{name:'Ссылка на план затрат на оборудование'});
  const url='https://example.org/equipment-plan?month=2026-09';
  fireEvent.change(link,{target:{value:url}});
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({formData:{equipmentLink:url}})),{timeout:2500});
  await waitFor(()=>expect(link).toBeEnabled());
  expect(link).toHaveValue(url);
  expect(screen.getByRole('link',{name:'Открыть ↗'})).toHaveAttribute('href',url);
 });

 it('blocks negative facts before autosave and submission while retaining the saved rating and color', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/admin/analysis-questions' ? [] :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[{metricId:1,absoluteValue:70}],analyses:[],formData:{},score:{rating:10,results:[{metricId:1,zone:'CRITICAL',pointsAwarded:0}]}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  const metric=await screen.findByLabelText('eNPS');
  fireEvent.change(metric,{target:{value:'-1\u00a0234,5 ₽'}});
  fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/eNPS.*не может быть отрицательным/i);
  expect(metric).toHaveValue('-1\u00a0234,5 ₽');
  expect(metric.className).toContain('metric-zone-red');
  expect(screen.getByText('Рейтинг').parentElement).toHaveTextContent('10');
  await new Promise(resolve=>setTimeout(resolve,2100));
  expect(api.post).not.toHaveBeenCalled();
 });

 it('blocks negative plans and resumes autosave when corrected to zero', async () => {
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  const plan=await screen.findByLabelText('План: eNPS');
  fireEvent.change(plan,{target:{value:'-0,5'}});
  expect(await screen.findByRole('alert',{}, {timeout:2500})).toHaveTextContent(/План: eNPS.*не может быть отрицательным/i);
  expect(plan).toHaveValue('-0,5');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.change(plan,{target:{value:'0'}});
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({formData:{metricPlan_1:'0'}})),{timeout:2500});
  expect(plan).toHaveValue('0');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });

 it.each([
  ['Выручка','Labor Cost'],
  ['Количество напитков','Labor Cost'],
  ['План выручки','Labor Cost'],
  ['План напитков','Labor Cost'],
  ['План: Свободный доступ, ₽','Себестоимость'],
  ['Административные затраты, ₽','Расходы'],
  ['План: Оборудование, материалы, ремонт, ₽','Расходы'],
 ])('blocks negative numeric report field %s before submission', async (label,block) => {
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  fireEvent.click(screen.getByRole('button',{name:block}));
  const input=screen.getByLabelText(label);
  fireEvent.change(input,{target:{value:'- 1 234,5'}});
  fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));
  expect(await screen.findByRole('alert')).toHaveTextContent(/не может быть отрицательным/i);
  expect(input).toHaveValue('- 1 234,5');
  expect(api.post).not.toHaveBeenCalled();
 });

 it('leaves incomplete minus input validation to the server', async () => {
  vi.mocked(api.post).mockRejectedValueOnce({response:{data:{message:'Введите число'}}});
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  const metric=await screen.findByLabelText('eNPS');
  fireEvent.change(metric,{target:{value:'-'}});
  fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Введите число');
  expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({metricValues:[{metricId:1,absoluteValue:'-'}]}));
  expect(metric).toHaveValue('-');
 });

 it('does not apply numeric validation to report links or analysis text', async () => {
  vi.mocked(api.get).mockImplementation(async (url) => ({data:
   url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/admin/analysis-questions' ? [{questionKey:'enps_problem',label:'Проблемы eNPS',section:'ENPS',displayOrder:1}] :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[],analyses:[],formData:{giftsLink:'-12',equipmentLink:'-34'}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  fireEvent.click(screen.getByRole('button',{name:/eNPS/}));
  fireEvent.change(screen.getByLabelText(/Проблемы eNPS/),{target:{value:'-10'}});
  fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({formData:{giftsLink:'-12',equipmentLink:'-34'},analyses:[{questionKey:'enps_problem',content:'-10'}]})));
 });

 describe('submission timestamp API boundary', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026,9,5,6)));
  afterEach(() => {
   vi.restoreAllMocks();
   vi.unstubAllEnvs();
  });
  const loadSubmittedReport = (submittedAt:string) => {
   const report = {
    id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,
    status:'SUBMITTED',isLocked:false,isEditable:true,submittedAt,
    metricValues:[{metricId:1,absoluteValue:70}],analyses:[],formData:{},
    score:{rating:80,results:[]},
   };
   vi.mocked(api.get).mockImplementation(async (url) => ({data:
    url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
    url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
    url==='/admin/analysis-questions' ? [] :
    url==='/reports/editing-policy' ? {historicalEditingEnabled:false} :
    url==='/reports/coffee-shop/7/2026/9' ? report : null
   }) as any);
   return report;
  };
  const renderReport = () => render(<MemoryRouter initialEntries={['/report?period=2026-09']}><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);

  it.each(['Asia/Omsk','America/New_York'])('renders the API submission timestamp in Moscow time when the browser timezone is %s', async timeZone => {
   vi.stubEnv('TZ',timeZone);
   loadSubmittedReport('2026-10-01T05:20:00.000Z');
   renderReport();
   expect(await screen.findByText(/01\.10\.2026,\s*08:20:00 МСК/)).toBeInTheDocument();
  });

  it('replaces the seeded submission timestamp with the explicit submit response', async () => {
   const report=loadSubmittedReport('2026-10-05T09:00:00.000Z');
   vi.mocked(api.post).mockImplementation(async (url,body) => {
    if(url==='/reports/draft') return {data:{...report,...(body as object)}} as any;
    if(url==='/reports/44/submit') return {data:{...report,submittedAt:'2026-10-01T05:20:00.000Z'}} as any;
    throw new Error('Unexpected report request: '+url);
   });
   renderReport();
   expect(await screen.findByText(/05\.10\.2026,\s*12:00:00 МСК/)).toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:'Отправить отчёт'}));
   expect(await screen.findByText(/01\.10\.2026,\s*08:20:00 МСК/)).toBeInTheDocument();
   expect(screen.queryByText(/05\.10\.2026,\s*12:00:00 МСК/)).not.toBeInTheDocument();
  });

  it('keeps the stored submission timestamp when autosaving report edits', async () => {
   const report=loadSubmittedReport('2026-10-01T05:20:00.000Z');
   vi.mocked(api.post).mockImplementation(async (url,body) => {
    if(url==='/reports/draft') return {data:{...report,...(body as object)}} as any;
    throw new Error('Autosave must not resubmit the report');
   });
   renderReport();
   const metric=await screen.findByLabelText('eNPS');
   fireEvent.change(metric,{target:{value:'80'}});
   await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({metricValues:[{metricId:1,absoluteValue:'80'}]})),{timeout:2500});
   await waitFor(()=>expect(metric).toBeEnabled());
   expect(metric).toHaveValue('80');
   expect(screen.getByText(/01\.10\.2026,\s*08:20:00 МСК/)).toBeInTheDocument();
   expect(api.post).not.toHaveBeenCalledWith('/reports/44/submit');
  });
 });

 describe('historical editing policy', () => {
  beforeEach(() => vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026,9,2,9)));
  afterEach(() => vi.restoreAllMocks());
  const loadHistoricalReport = (report: unknown, historicalEditingEnabled: boolean) => {
   vi.mocked(api.get).mockImplementation(async (url) => ({data:
    url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
    url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
    url==='/admin/analysis-questions' ? [{questionKey:'enps_problem',label:'Проблемы eNPS',section:'ENPS',displayOrder:1}] :
    url==='/reports/editing-policy' ? {historicalEditingEnabled} : report
   }) as any);
  };
  const historicalReport = {
   id:44,coffeeShopId:7,year:2026,month:6,revenue:1000,drinksCount:50,
   status:'SUBMITTED',isLocked:true,isEditable:true,
   metricValues:[{metricId:1,absoluteValue:70}],analyses:[],formData:{},
   score:{rating:10,results:[{metricId:1,zone:'CRITICAL',pointsAwarded:0}]},
  };

  it('autosaves historical metric and analysis edits when the server permits editing', async () => {
   loadHistoricalReport(historicalReport,true);
   vi.mocked(api.post).mockImplementation(async (_url,body) => ({data:{...historicalReport,...(body as object)}}) as any);
   render(<MemoryRouter initialEntries={['/report?period=2026-06']}><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   const metric=await screen.findByLabelText('eNPS');
   expect(metric).toBeEnabled();
   fireEvent.change(metric,{target:{value:'35'}});
   fireEvent.click(screen.getByRole('button',{name:/eNPS/}));
   const analysis=screen.getByLabelText(/Проблемы eNPS/);
   expect(analysis).toBeEnabled();
   fireEvent.change(analysis,{target:{value:'Тест причин срабатывания триггера'}});
   await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({
    coffeeShopId:7,year:2026,month:6,metricValues:[{metricId:1,absoluteValue:'35'}],
    analyses:[{questionKey:'enps_problem',content:'Тест причин срабатывания триггера'}],
   })),{timeout:2500});
   await waitFor(()=>expect(metric).toBeEnabled());
   expect(metric).toHaveValue('35');
   expect(analysis).toHaveValue('Тест причин срабатывания триггера');
   expect(screen.getByText('Исторический · тестовое редактирование')).toBeInTheDocument();
  });

  it('keeps a report disabled when the server denies editing despite the global test policy', async () => {
   loadHistoricalReport({...historicalReport,month:9,isLocked:false,isEditable:false},true);
   render(<MemoryRouter initialEntries={['/report?period=2026-09']}><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   expect(await screen.findByLabelText('eNPS')).toBeDisabled();
   expect(screen.getByRole('button',{name:'Отправить отчёт'})).toBeDisabled();
   fireEvent.click(screen.getByRole('button',{name:/eNPS/}));
   expect(screen.getByLabelText(/Проблемы eNPS/)).toBeDisabled();
   expect(api.post).not.toHaveBeenCalled();
  });

  it('creates a report for a missing historical month when test editing is enabled', async () => {
   loadHistoricalReport(null,true);
   vi.mocked(api.post).mockImplementation(async (_url,body) => ({data:{...(body as object),id:45,isLocked:true,isEditable:true,score:{rating:0,results:[]}}}) as any);
   render(<MemoryRouter initialEntries={['/report?period=2026-06']}><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   const metric=await screen.findByLabelText('eNPS');
   expect(metric).toBeEnabled();
   fireEvent.change(metric,{target:{value:'45'}});
   await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({
    coffeeShopId:7,year:2026,month:6,metricValues:[{metricId:1,absoluteValue:'45'}],
   })),{timeout:2500});
   await waitFor(()=>expect(metric).toBeEnabled());
   expect(metric).toHaveValue('45');
  });

  it('keeps legacy historical reports read-only when test editing is disabled', async () => {
   const {isEditable: _isEditable,...legacyReport}=historicalReport;
   loadHistoricalReport(legacyReport,false);
   render(<MemoryRouter initialEntries={['/report?period=2026-06']}><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
   expect(await screen.findByLabelText('eNPS')).toBeDisabled();
   expect(screen.getByRole('button',{name:'Отправить отчёт'})).toBeDisabled();
   expect(api.post).not.toHaveBeenCalled();
  });
 });
});
