import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

 it.each([true,false])('shows report example help in the header when isEditable is %s', async isEditable => {
  vi.mocked(api.get).mockImplementation(async path => ({data:
   path==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   path==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   path==='/admin/analysis-questions' ? [] :
   path==='/reports/editing-policy' ? {historicalEditingEnabled:false} :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable,metricValues:[],analyses:[],formData:{}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  const help=screen.getByRole('button',{name:'Подсказка: Пример заполнения отчёта'});
  expect(help).toHaveTextContent('Пример заполнения отчёта');
  expect(help.closest('.leader-report-header')).not.toBeNull();
  expect(help).toBeEnabled();
  fireEvent.mouseEnter(help);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Пример скоро появится');
  expect(within(screen.getByRole('tooltip')).queryByRole('link')).not.toBeInTheDocument();
  fireEvent.keyDown(help,{key:'Escape'});
  fireEvent.click(screen.getByRole('button',{name:'Расходы'}));
  fireEvent.focus(help);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Пример скоро появится');
  fireEvent.keyDown(help,{key:'Escape'});
  fireEvent.click(help);
  expect(screen.getByRole('tooltip')).toHaveTextContent('Пример скоро появится');
  expect(api.post).not.toHaveBeenCalled();
 });

 it('offers placeholder help for all seven expense articles without saving report data', async () => {
  vi.mocked(api.get).mockImplementation(async url => ({data:
   url==='/metrics' ? [
    {id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1},
    {id:2,name:'Десерты: переименованная метрика',code:'DESSERT_WRITEOFF',unit:'%',section:'COSTING',displayOrder:2},
    {id:3,name:'Продукты: переименованная метрика',code:'PRODUCT_WRITEOFF',unit:'%',section:'COSTING',displayOrder:3},
   ] : url==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   url==='/reports/editing-policy' ? {historicalEditingEnabled:false} :
   url==='/admin/analysis-questions' ? [] :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:false,metricValues:[],analyses:[],formData:{}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  expect(screen.getByLabelText('eNPS')).toBeDisabled();
  for(const [block,articles] of [
   ['Команда и гости',['Подарки']],
   ['Labor Cost',['Расходы на персонал']],
   ['Себестоимость',['Списание десертов','Списание продуктов']],
   ['Расходы',['Административные затраты','Аренда','Оборудование, материалы, ремонт']],
  ] as const) {
   fireEvent.click(screen.getByRole('button',{name:block}));
   for(const article of articles) {
    const help=screen.getByRole('button',{name:'Подсказка: '+article});
    expect(help.closest('td')).not.toBeNull();
    fireEvent.mouseEnter(help);
    const popup=screen.getByRole('tooltip');
    expect(popup).toHaveTextContent(article);
    expect(popup).toHaveTextContent('Текст подсказки и ссылка на статью будут добавлены позже.');
    expect(help).toHaveAttribute('aria-describedby',popup.id);
    expect(within(popup).queryByRole('link')).not.toBeInTheDocument();
    fireEvent.keyDown(help,{key:'Escape'});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
   }
  }
  expect(api.post).not.toHaveBeenCalled();
 });

 it('opens report help on focus and tap and closes it on blur and outside interaction', async () => {
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('eNPS');
  const help=screen.getByRole('button',{name:'Подсказка: Подарки'});
  fireEvent.focus(help);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.blur(help,{relatedTarget:screen.getByLabelText('eNPS')});
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.click(help);
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
  fireEvent.pointerDown(screen.getByLabelText('eNPS'));
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
 });

 it('loads giftsLink beside the gifts metric and keeps the link available in a read-only report', async () => {
  const url='https://example.org/gifts?month=2026-09';
  vi.mocked(api.get).mockImplementation(async path => ({data:
   path==='/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
   path==='/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
   path==='/admin/analysis-questions' ? [] :
   path==='/reports/editing-policy' ? {historicalEditingEnabled:false} :
   {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:false,metricValues:[],analyses:[],formData:{giftsLink:url}}
  }) as any);
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  await screen.findByLabelText('Подарки, ₽');
  const gifts=within(screen.getByLabelText('Подарки, ₽').closest('tr')!);
  expect(gifts.getByRole('textbox',{name:'Ссылка на подарки'})).toHaveValue(url);
  expect(gifts.getByRole('textbox',{name:'Ссылка на подарки'})).toBeDisabled();
  expect(gifts.getByRole('link',{name:'Открыть ссылку'})).toHaveAttribute('href',url);
  expect(gifts.getByRole('link',{name:'Открыть ссылку'})).toHaveAttribute('rel','noopener noreferrer');
 });

 it('autosaves giftsLink with other gift values and supports clearing it', async () => {
  render(<MemoryRouter><ToastProvider><LeaderReportPage/></ToastProvider></MemoryRouter>);
  const amount=await screen.findByLabelText('Подарки, ₽');
  const gifts=within(amount.closest('tr')!);
  const link=gifts.getByRole('textbox',{name:'Ссылка на подарки'});
  expect(link).toHaveValue('');
  const url='https://example.org/gifts?month=2026-09';
  fireEvent.change(amount,{target:{value:'100'}});
  fireEvent.change(link,{target:{value:url}});
  await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/reports/draft',expect.objectContaining({formData:{gifts:'100',giftsLink:url}})),{timeout:2500});
  await waitFor(()=>expect(link).toBeEnabled());
  expect(link).toHaveValue(url);
  expect(gifts.getByRole('link',{name:'Открыть ссылку'})).toHaveAttribute('href',url);
  fireEvent.change(link,{target:{value:''}});
  expect(gifts.queryByRole('link',{name:'Открыть ссылку'})).not.toBeInTheDocument();
  await waitFor(()=>expect(api.post).toHaveBeenLastCalledWith('/reports/draft',expect.objectContaining({formData:{gifts:'100',giftsLink:''}})),{timeout:2500});
  await waitFor(()=>expect(link).toBeEnabled());
  expect(link).toHaveValue('');
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
  ['ИНПС','Команда и гости'],
  ['План: Подарки, ₽','Команда и гости'],
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
