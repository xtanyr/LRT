import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import CityShopPage from '../pages/city-leader/CityShopPage';
import { api } from '../services/api';

describe('CityShopPage submission timestamp API boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/coffee-shops/7') return { data: { id: 7, name: 'Тестовая кофейня', city: { name: 'Омск' }, leader: null } } as any;
      if (url === '/metrics') return { data: [] } as any;
      if (url === '/admin/rating-color-config') return { data: { greenThreshold: 80, redThreshold: 60 } } as any;
      if (url.startsWith('/reports/coffee-shop/7/')) return { data: {
        id: 44, coffeeShopId: 7, year: 2026, month: 9, status: 'SUBMITTED',
        submittedAt: '2026-10-01T05:20:00.000Z', metricValues: [], analyses: [],
        score: { rating: 80, results: [] },
      } } as any;
      return { data: [] } as any;
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
  });

  it.each(['Asia/Omsk', 'America/New_York'])('shows the stored submission in Moscow time when the browser timezone is %s', async (timeZone) => {
    vi.stubEnv('TZ', timeZone);
    render(<MemoryRouter initialEntries={['/shop/7']}><Routes><Route path="/shop/:shopId" element={<CityShopPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('01.10.2026, 08:20:00 МСК')).toBeInTheDocument();
  });

  it('shows the shop trigger date and critical metric without leaking another shop trigger', async () => {
    const original=vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async path=>path==='/ipv-triggers/statuses?coffeeShopId=7'?{data:[
      {id:1,coffeeShopId:7,rule:'T3',status:'NOT_STARTED',severity:'critical',metricId:2,metricName:'Списание десертов',triggeredAt:'2026-10-01T05:20:00.000Z',daysOverdue:0},
      {id:2,coffeeShopId:8,rule:'T1',status:'NOT_STARTED',severity:'critical',triggeredAt:'2026-10-01T05:20:00.000Z'},
    ]} as any:original(path));
    render(<MemoryRouter initialEntries={['/shop/7']}><Routes><Route path="/shop/:shopId" element={<CityShopPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('Списание десертов')).toBeInTheDocument();
    expect(screen.getAllByText('01.10.2026, 08:20:00 МСК')).toHaveLength(2);
    expect(screen.queryByText('T1')).not.toBeInTheDocument();
    expect(screen.getByText('🔔 Не начат')).toBeInTheDocument();
  });

  it('shows a trigger request error instead of the empty trigger state', async () => {
    const original=vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation(async path=>{if(path.startsWith('/ipv-triggers/statuses'))throw new Error('Offline');return original(path);});
    render(<MemoryRouter initialEntries={['/shop/7']}><Routes><Route path="/shop/:shopId" element={<CityShopPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить триггеры');
    expect(screen.queryByText('Нет активных триггеров')).not.toBeInTheDocument();
  });

  it('does not replace another coffee shop with a slow response from the previous route', async () => {
    let finishOld:(value:any)=>void=()=>{};
    vi.mocked(api.get).mockImplementation(async path=>{
      if(path==='/coffee-shops/7')return new Promise(resolve=>{finishOld=resolve;});
      if(path==='/coffee-shops/8')return {data:{id:8,name:'Новая кофейня',city:{name:'Омск'},leader:null}} as any;
      if(path.startsWith('/reports/'))return {data:null} as any;
      return {data:[]} as any;
    });
    function SwitchShop(){const navigate=useNavigate();return <button onClick={()=>navigate('/shop/8')}>Открыть другую кофейню</button>;}
    render(<MemoryRouter initialEntries={['/shop/7']}><SwitchShop/><Routes><Route path="/shop/:shopId" element={<CityShopPage />} /></Routes></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'Открыть другую кофейню'}));
    expect(await screen.findByRole('heading',{name:'«Новая кофейня»'})).toBeInTheDocument();
    await act(async()=>finishOld({data:{id:7,name:'Старая кофейня',city:{name:'Москва'},leader:null}}));
    expect(screen.getByRole('heading',{name:'«Новая кофейня»'})).toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'«Старая кофейня»'})).not.toBeInTheDocument();
  });
});
