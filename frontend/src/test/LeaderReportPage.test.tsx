import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import ToastProvider from '../components/ToastProvider';
import LeaderReportPage from '../pages/leader/LeaderReportPage';
import { api } from '../services/api';
import { MemoryRouter } from 'react-router-dom';

describe('LeaderReportPage', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url) => ({data: url==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] : url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] : url==='/admin/analysis-questions' ? [{questionKey:'enps_problem',label:'Проблемы eNPS',section:'ENPS',displayOrder:1}] : null}) as any);
  vi.mocked(api.post).mockImplementation(async (_url,body) => ({data:{...(body as object),id:12,score:{rating:0,results:[]}}}) as any);
 });
 afterEach(cleanup);
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
