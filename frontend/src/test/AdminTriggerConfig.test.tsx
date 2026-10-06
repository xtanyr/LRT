import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToastProvider from '../components/ToastProvider';
import AdminConfigPage from '../pages/admin/AdminConfigPage';
import { api } from '../services/api';

const rules = [
 {id:1,code:'T1',thresholdRating:'60',monthsCount:3,minMonthsOnPosition:6,minMonthsSinceApproval:6,isActive:true},
 {id:2,code:'T2',thresholdRating:'80',monthsCount:12,minMonthsOnPosition:6,minMonthsSinceApproval:6,isActive:true},
 {id:3,code:'T3',thresholdRating:'0',monthsCount:3,minMonthsOnPosition:6,minMonthsSinceApproval:6,isActive:true},
];
const renderConfig = () => render(<ToastProvider><AdminConfigPage /></ToastProvider>);
const openTriggers = async () => fireEvent.click(await screen.findByRole('button',{name:'Триггеры'}));

describe('Admin trigger configuration', () => {
 beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async path => ({data:path==='/admin/trigger-configs'?rules:{id:1,greenThreshold:80,redThreshold:60}}) as any);
  vi.mocked(api.patch).mockImplementation(async (_path,body) => ({data:body}) as any);
 });
 afterEach(cleanup);

 it('edits thresholds, windows, seniority and activation through the trigger API', async () => {
  renderConfig();await openTriggers();
  fireEvent.change(screen.getByLabelText('Порог рейтинга T2'),{target:{value:'75.5'}});
  fireEvent.change(screen.getByLabelText('Месяцев подряд T2'),{target:{value:'4'}});
  fireEvent.change(screen.getByLabelText('Минимальный стаж на кофейне T2'),{target:{value:'2'}});
  fireEvent.change(screen.getByLabelText('Месяцев после утверждения T2'),{target:{value:'1'}});
  fireEvent.click(screen.getByLabelText('Правило T2 активно'));
  fireEvent.click(screen.getByRole('button',{name:'Сохранить T2'}));
  await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/ipv-triggers/config/2',{
   thresholdRating:75.5,monthsCount:4,minMonthsOnPosition:2,minMonthsSinceApproval:1,isActive:false,
  }));
  expect(await screen.findByText('Правило T2 сохранено')).toBeInTheDocument();
 });

 it('describes T3 as a critical metric without a rating threshold control', async () => {
  renderConfig();await openTriggers();
  expect(screen.getByText('Одна и та же метрика в красной зоне 3 мес. подряд.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Порог рейтинга T3')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Месяцев подряд T3'),{target:{value:'2'}});
  fireEvent.click(screen.getByRole('button',{name:'Сохранить T3'}));
  await waitFor(()=>expect(api.patch).toHaveBeenCalledWith('/ipv-triggers/config/3',{
   monthsCount:2,minMonthsOnPosition:6,minMonthsSinceApproval:6,isActive:true,
  }));
 });

 it.each(['0','1.5','37',''])('rejects an invalid consecutive window %s without changing settings', async value => {
  renderConfig();await openTriggers();
  fireEvent.change(screen.getByLabelText('Месяцев подряд T1'),{target:{value}});
  fireEvent.submit(screen.getByRole('button',{name:'Сохранить T1'}).closest('form')!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Месяцев подряд');
  expect(api.patch).not.toHaveBeenCalled();
 });

 it('keeps edits and displays server errors when saving a rule fails', async () => {
  vi.mocked(api.patch).mockRejectedValueOnce({response:{data:{message:'Не удалось сохранить правило'}}});
  renderConfig();await openTriggers();
  fireEvent.change(screen.getByLabelText('Порог рейтинга T1'),{target:{value:'55'}});
  fireEvent.click(screen.getByRole('button',{name:'Сохранить T1'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить правило');
  expect(screen.getByLabelText('Порог рейтинга T1')).toHaveValue(55);
  expect(screen.getByRole('button',{name:'Сохранить T1'})).toBeEnabled();
 });

 it('shows a configuration load error and retries instead of claiming there are no rules', async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error('Offline'));
  renderConfig();
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить конфигурацию');
  fireEvent.click(screen.getByRole('button',{name:'Повторить загрузку'}));
  await openTriggers();
  expect(screen.getByLabelText('Месяцев подряд T1')).toHaveValue(3);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
 });
});
