import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import NotificationBanner from '../components/NotificationBanner';
import { api } from '../services/api';

describe('IPV notification updates',()=>{
 beforeEach(()=>vi.clearAllMocks());
 afterEach(cleanup);
 it('refreshes after an IPV action so an opened or exempted trigger loses its banner immediately',async()=>{
  vi.mocked(api.get).mockResolvedValueOnce({data:[{id:1,ipvStatusId:9,isRead:false,message:'Сработал T1'}]} as any).mockResolvedValueOnce({data:[]} as any);
  render(<MemoryRouter><NotificationBanner /></MemoryRouter>);
  expect(await screen.findByText(/Сработал T1/)).toBeInTheDocument();
  act(()=>window.dispatchEvent(new Event('ipv-updated')));
  await waitFor(()=>expect(screen.queryByRole('status')).not.toBeInTheDocument());
  expect(api.get).toHaveBeenCalledTimes(2);
 });
 it('does not restore an outdated notification when the earlier request finishes last',async()=>{
  let oldResponse:(value:any)=>void=()=>{};
  vi.mocked(api.get).mockImplementationOnce(()=>new Promise(resolve=>{oldResponse=resolve;})).mockResolvedValueOnce({data:[]} as any);
  render(<MemoryRouter><NotificationBanner /></MemoryRouter>);
  act(()=>window.dispatchEvent(new Event('ipv-updated')));
  await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(2));
  await act(async()=>{oldResponse({data:[{id:1,ipvStatusId:9,isRead:false,message:'Старый T1'}]});});
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
 });
});
