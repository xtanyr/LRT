import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ToastProvider from '../components/ToastProvider';
import LeaderReportPage from '../pages/leader/LeaderReportPage';
import ReportExamplePage from '../pages/leader/ReportExamplePage';
import { api } from '../services/api';
import { authStore } from '../services/auth-store';

const user = { id: 5, name: 'Анна', email: 'anna@example.test', role: 'ADMIN' as const };
const renderFlow = () => render(<MemoryRouter initialEntries={['/report?period=2026-09&shop=7']}><ToastProvider><Routes>
  <Route path="/report" element={<LeaderReportPage />}/>
  <Route path="/report-example" element={<ReportExamplePage />}/>
</Routes></ToastProvider></MemoryRouter>);

describe('Report example help preference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStore.login('session-token', user);
    vi.mocked(api.get).mockImplementation(async url => ({ data:
      url === '/metrics' ? [{id:1,name:'eNPS',code:'ENPS',unit:'%',section:'TEAM_GUESTS',displayOrder:1}] :
      url === '/coffee-shops' ? [{id:7,name:'Тестовая кофейня'}] :
      url === '/admin/analysis-questions' ? [] :
      url === '/reports/editing-policy' ? {historicalEditingEnabled:false} :
      {id:44,coffeeShopId:7,year:2026,month:9,revenue:1000,drinksCount:50,isEditable:true,metricValues:[],analyses:[],formData:{}}
    }) as any);
    vi.mocked(api.patch).mockResolvedValue({data:{success:true,data:{reportExampleHelpDismissed:true}}} as any);
  });
  afterEach(() => { cleanup(); authStore.logout(); });

  it('remembers opting out for this account without losing the active role preview', async () => {
    authStore.setViewAsRole('LEADER');
    renderFlow();
    await screen.findByLabelText('eNPS');
    fireEvent.click(screen.getByRole('button', {name:'Мне не нужна помощь'}));
    await waitFor(() => expect(screen.queryByRole('button', {name:'Мне не нужна помощь'})).not.toBeInTheDocument());
    expect(screen.getByRole('link', {name:'Пример заполнения отчёта'})).toBeInTheDocument();
    expect(authStore.getState()).toMatchObject({accessToken:'session-token',viewAsRole:'LEADER',user:{id:5,reportExampleHelpDismissed:true}});
    expect(api.patch).toHaveBeenCalledWith('/auth/report-example-help');
    act(() => authStore.login('another-session', {...user,id:6}));
    expect(screen.getByRole('button', {name:'Мне не нужна помощь'})).toBeEnabled();
  });

  it('keeps help prominent when saving the opt-out fails and supports retry', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Network unavailable'));
    renderFlow();
    await screen.findByLabelText('eNPS');
    fireEvent.click(screen.getByRole('button', {name:'Мне не нужна помощь'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить настройку помощи');
    expect(screen.getByRole('button', {name:'Мне не нужна помощь'})).toBeEnabled();
    expect(authStore.getState().user).not.toHaveProperty('reportExampleHelpDismissed',true);
    fireEvent.click(screen.getByRole('button', {name:'Мне не нужна помощь'}));
    await waitFor(() => expect(screen.queryByRole('button', {name:'Мне не нужна помощь'})).not.toBeInTheDocument());
  });

  it('dismisses help only when the learner finishes the example, not when selecting its last step', async () => {
    renderFlow();
    await screen.findByLabelText('eNPS');
    fireEvent.click(screen.getByRole('link', {name:'Пример заполнения отчёта'}));
    fireEvent.click(screen.getByRole('button', {name:'Шаг примера'}));
    fireEvent.click(screen.getByRole('option', {name:'19. Проверка и отправка'}));
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', {name:'Заполнить свой отчёт'}));
    expect(await screen.findByRole('heading', {name:'Отчёт за 2026-09'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Мне не нужна помощь'})).not.toBeInTheDocument();
    expect(screen.getByRole('link', {name:'Пример заполнения отчёта'})).toHaveAttribute('href','/report-example?period=2026-09&shop=7');
    expect(api.patch).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('keeps the example open when completing it fails and lets the learner retry', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('Network unavailable'));
    renderFlow();
    await screen.findByLabelText('eNPS');
    fireEvent.click(screen.getByRole('link', {name:'Пример заполнения отчёта'}));
    fireEvent.click(screen.getByRole('button', {name:'Шаг примера'}));
    fireEvent.click(screen.getByRole('option', {name:'19. Проверка и отправка'}));
    fireEvent.click(screen.getByRole('link', {name:'Заполнить свой отчёт'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить настройку помощи');
    expect(screen.getByRole('heading', {level:2,name:'Проверка и отправка'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', {name:'Заполнить свой отчёт'}));
    expect(await screen.findByRole('heading', {name:'Отчёт за 2026-09'})).toBeInTheDocument();
    expect(screen.queryByRole('button', {name:'Мне не нужна помощь'})).not.toBeInTheDocument();
  });

  it('uses the saved session preference after logging in and still offers the example', async () => {
    authStore.login('fresh-session', {...user,reportExampleHelpDismissed:true});
    renderFlow();
    await screen.findByLabelText('eNPS');
    expect(screen.queryByRole('button', {name:'Мне не нужна помощь'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', {name:'Пример заполнения отчёта'}));
    expect(screen.getByRole('heading', {level:1,name:'Пример заполнения отчёта'})).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();
  });
});
