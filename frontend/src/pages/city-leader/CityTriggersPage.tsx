import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { triggerDescription, type TriggerRule } from '../../services/trigger-description';
import LoadingState from '../../components/LoadingState';
import '../../styles/pages.css';
import './CityTriggersPage.css';

interface Shop { id: number; name: string; city: { name: string } }
interface IPVStatus {
  id: number; coffeeShopId: number; coffeeShop: Shop; status: string;
  rule: string; triggerCode: string; metricName: string | null;
  triggeredAt: string; daysOverdue: number; closeReason: string | null;
}
interface TriggerConfig extends TriggerRule {
  id: number; minMonthsOnPosition: number; minMonthsSinceApproval: number; isActive: boolean;
}
interface Exemption { id: number; userId: number; reason: string; canClear: boolean; user?: { id: number; name: string } }
interface Diagnostic {
  coffeeShopId: number; coffeeShop: Shop;
  leaders: { id: number; name: string; approvedAt: string | null; assignedFrom: string; exemptions: Exemption[] }[];
  checks: {
    code: string; isActive: boolean; eligible: boolean; matched: boolean; reasons: string[];
    windowStart: { year: number; month: number }; windowEnd: { year: number; month: number };
  }[];
}
const statuses = [
  { key: 'ALL', label: 'Все' }, { key: 'NOT_STARTED', label: 'Новые' },
  { key: 'IN_PROGRESS', label: 'В работе' }, { key: 'COMPLETED', label: 'Завершённые' },
];
const statusLabel: Record<string, string> = { NOT_STARTED: 'Новый', IN_PROGRESS: 'В работе', COMPLETED: 'Завершён' };
const moscowDate = (value: string | null, time = false) => {
  const date = value ? new Date(value) : null;
  if (!date || !Number.isFinite(date.getTime())) return 'Не указана';
  return (time ? date.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }) + ' МСК' : date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }));
};
const monthLabel = (period: { year: number; month: number }) => `${String(period.month).padStart(2, '0')}.${period.year}`;
const startDeadline = (triggeredAt: string) => {
  const timestamp = Date.parse(triggeredAt) + 14 * 86400000;
  return moscowDate(Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null, true);
};
const meaningfulReason = (value: string) => value.trim().length >= 3 && /[\p{L}\p{N}]/u.test(value);
const actionMessage = (error: unknown, fallback: string) => {
  const message = (error as { response?: { data?: { message?: unknown } } } | null)?.response?.data?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const text = message.filter((item): item is string => typeof item === 'string' && !!item.trim()).join(', ');
    if (text) return text;
  }
  return fallback;
};

export default function CityTriggersPage() {
  const [items, setItems] = useState<IPVStatus[]>([]);
  const [configs, setConfigs] = useState<TriggerConfig[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [exemptions, setExemptions] = useState<Exemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState('');
  const [section, setSection] = useState<'events' | 'monitoring'>('events');
  const [filter, setFilter] = useState('ALL');
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [evaluatedAt, setEvaluatedAt] = useState<string | null>(null);
  const currentLeaderIds = new Set(diagnostics.flatMap(shop => shop.leaders.map(leader => leader.id)));
  const otherExemptions = exemptions.filter(exemption => !currentLeaderIds.has(exemption.userId));

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [events, rules, monitoring, excluded] = await Promise.all([
        api.get('/ipv-triggers/statuses'), api.get('/ipv-triggers/config'),
        api.get('/ipv-triggers/diagnostics'), api.get('/ipv-triggers/exemptions'),
      ]);
      setItems(events.data.data ?? events.data);
      setConfigs(rules.data.data ?? rules.data);
      setDiagnostics(monitoring.data.data ?? monitoring.data);
      setExemptions(excluded.data.data ?? excluded.data);
    } catch {
      setLoadError('Не удалось загрузить триггеры. Повторите загрузку.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const perform = async (key: string, action: () => Promise<unknown>, error: string) => {
    setBusy(key);
    setActionError('');
    try {
      await action();
      window.dispatchEvent(new Event('ipv-updated'));
      await load();
    } catch (cause) {
      setActionError(actionMessage(cause, error));
    } finally {
      setBusy('');
    }
  };
  const begin = (id: number) => perform(`begin:${id}`, () => api.patch(`/ipv-triggers/status/${id}`, { status: 'IN_PROGRESS' }), 'Не удалось начать ИПВ. Повторите попытку.');
  const complete = (id: number) => {
    if (!meaningfulReason(closeReason)) return;
    return perform(`complete:${id}`, async () => {
      await api.patch(`/ipv-triggers/status/${id}`, { status: 'COMPLETED', closeReason: closeReason.trim() });
      setClosingId(null);
      setCloseReason('');
    }, 'Не удалось завершить ИПВ. Введённый итог остался в поле, повторите попытку.');
  };
  const evaluate = () => perform('evaluate', async () => {
    const response = await api.post('/ipv-triggers/evaluate', {});
    setEvaluatedAt((response.data.data ?? response.data).evaluatedAt);
  }, 'Не удалось проверить триггеры. Повторите попытку.');
  const exclude = (userId: number) => {
    if (!meaningfulReason(reasons[userId] ?? '')) return;
    return perform(`exclude:${userId}`, async () => {
      await api.post('/ipv-triggers/exemptions', { userId, reason: reasons[userId].trim() });
      setReasons(previous => ({ ...previous, [userId]: '' }));
    }, 'Не удалось добавить исключение. Повторите попытку.');
  };
  const clear = (id: number) => perform(`clear:${id}`, () => api.patch(`/ipv-triggers/exemptions/${id}/clear`, {}), 'Не удалось снять исключение. Повторите попытку.');

  return <div className="page city-triggers">
    <div className="page-header">
      <div><h1 className="page-title">Триггеры ИПВ</h1><div className="page-sub">Сработавшие условия и мониторинг кофеен</div>
        {evaluatedAt && <p className="helper-text">Последняя проверка: {moscowDate(evaluatedAt, true)}</p>}
      </div>
      <button className="btn btn-primary" disabled={loading || !!busy} onClick={() => void evaluate()}>{busy === 'evaluate' ? 'Проверяем…' : 'Проверить сейчас'}</button>
    </div>
    {actionError && <p role="alert" className="trigger-error">{actionError}</p>}
    {loading ? <LoadingState /> : loadError ? <div className="card"><p role="alert" className="trigger-error">{loadError}</p><button className="btn btn-ghost" onClick={() => void load()}>Повторить загрузку</button></div> : <>
      <nav className="tabs" aria-label="Разделы триггеров">
        <button className={'tab' + (section === 'events' ? ' active' : '')} onClick={() => setSection('events')}>Сработавшие</button>
        <button className={'tab' + (section === 'monitoring' ? ' active' : '')} onClick={() => setSection('monitoring')}>Мониторинг кофеен</button>
      </nav>
      <div className="trigger-layout"><div>
        {section === 'events' ? <>
          <p className="helper-text">Несколько сработавших правил одной кофейни относятся к одному ИПВ. Начало и завершение применяются ко всем его причинам.</p>
          <div className="tabs" aria-label="Статусы ИПВ">{statuses.map(status => <button key={status.key} className={'tab' + (filter === status.key ? ' active' : '')} onClick={() => setFilter(status.key)}>{status.label}</button>)}</div>
          <div className="card table-wrap"><table className="table"><thead><tr><th>Кофейня</th><th>Правило / метрика</th><th>Сработал / срок начала</th><th>Статус / итог</th><th>Действия</th></tr></thead><tbody>
            {items.filter(item => filter === 'ALL' || item.status === filter).map(item => <tr key={item.id}>
              <td>{item.coffeeShop.name}<div className="helper-text">{item.coffeeShop.city?.name ?? '—'}</div></td>
              <td><strong>{item.triggerCode ?? item.rule}</strong>{item.metricName && <div>{item.metricName}</div>}</td>
              <td><div>{moscowDate(item.triggeredAt, true)}</div>{item.status === 'NOT_STARTED' && <div className="helper-text">Начать до {startDeadline(item.triggeredAt)}</div>}</td>
              <td><span className={'chip' + (item.status === 'NOT_STARTED' ? ' chip-danger' : ' chip-ghost')}>{statusLabel[item.status] ?? item.status}</span>
                {item.daysOverdue > 0 && <div className="chip chip-danger">🔴 Просрочено на {item.daysOverdue} дн.</div>}
                {item.closeReason && <p className="trigger-outcome">{item.closeReason}</p>}
              </td>
              <td>{item.status === 'NOT_STARTED' && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void begin(item.id)}>Взять в работу</button>}
                {item.status === 'IN_PROGRESS' && (closingId === item.id ? <div className="trigger-inline-form">
                  <label>Итог ИПВ<textarea className="input" rows={2} maxLength={2000} value={closeReason} disabled={!!busy} onChange={event => setCloseReason(event.target.value)} /></label>
                  <span className="helper-text">Не менее 3 символов, включая букву или цифру.</span>
                  <button className="btn btn-primary btn-sm" disabled={!!busy || !meaningfulReason(closeReason)} onClick={() => void complete(item.id)}>Сохранить итог</button>
                  <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => setClosingId(null)}>Отмена</button>
                </div> : <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => { setClosingId(item.id); setCloseReason(''); setActionError(''); }}>Завершить ИПВ</button>)}
              </td>
            </tr>)}
            {!items.some(item => filter === 'ALL' || item.status === filter) && <tr><td className="empty" colSpan={5}>Нет триггеров</td></tr>}
          </tbody></table></div>
        </> : <div className="trigger-monitoring">
          {diagnostics.map(shop => <section className="card" key={shop.coffeeShopId}>
            <div className="card-title">{shop.coffeeShop.name}</div><p className="helper-text">{shop.coffeeShop.city?.name ?? '—'}</p>
            {!shop.leaders.length && <p>Лидер не назначен. Автоматические триггеры не сработают.</p>}
            {shop.leaders.map(leader => {
              const active = exemptions.filter(exemption => exemption.userId === leader.id);
              return <div className="trigger-leader" key={leader.id}>
                <strong>{leader.name}</strong><div className="helper-text">Назначен: {moscowDate(leader.assignedFrom)} · Утверждён: {moscowDate(leader.approvedAt)}</div>
                {active.map(exemption => <div className="trigger-exemption" key={exemption.id}><span>{exemption.reason}</span>{exemption.canClear && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void clear(exemption.id)}>Снять исключение</button>}</div>)}
                {!active.length && <div className="trigger-exemption-form"><label>Причина исключения для {leader.name}<input className="input" aria-label={'Причина исключения для ' + leader.name} maxLength={1000} value={reasons[leader.id] ?? ''} disabled={!!busy} onChange={event => setReasons(previous => ({ ...previous, [leader.id]: event.target.value }))} /><span className="helper-text">Не менее 3 символов, включая букву или цифру.</span></label><button className="btn btn-ghost btn-sm" disabled={!!busy || !meaningfulReason(reasons[leader.id] ?? '')} onClick={() => void exclude(leader.id)}>Добавить исключение</button></div>}
              </div>;
            })}
            <div className="trigger-checks">{shop.checks.map(check => <div key={check.code}>
              <strong>{check.code}</strong> · {monthLabel(check.windowStart)} — {monthLabel(check.windowEnd)}
              <div className="helper-text">{!check.isActive ? 'Правило выключено' : check.matched && check.eligible ? 'Условия выполнены' : 'Условия не выполнены'}</div>
              {check.reasons.length > 0 && <ul>{check.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
            </div>)}</div>
          </section>)}
          {!diagnostics.length && <div className="card empty">Нет доступных кофеен</div>}
          {otherExemptions.length > 0 && <section className="card">
            <div className="card-title">Другие активные исключения</div>
            <p className="helper-text">Исключения сохраняются при переводе лидера или снятии назначения. Автор, COO или администратор может снять их вручную.</p>
            {otherExemptions.map(exemption => <div className="trigger-exemption" key={exemption.id}>
              <span><strong>{exemption.user?.name ?? `Лидер #${exemption.userId}`}</strong><br />{exemption.reason}</span>
              {exemption.canClear && <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => void clear(exemption.id)}>Снять исключение</button>}
            </div>)}
          </section>}
        </div>}
      </div><aside className="card trigger-rules"><div className="card-title">Правила триггеров</div>
        {configs.map(rule => <div className="trigger-rule" key={rule.id}><strong>{rule.code}</strong><span className="chip chip-ghost">{rule.isActive ? 'Включён' : 'Выключен'}</span><p>{triggerDescription(rule)}</p><p className="helper-text">Стаж на кофейне от {rule.minMonthsOnPosition} мес.; после утверждения от {rule.minMonthsSinceApproval} мес.</p></div>)}
        {!configs.length && <p className="empty">Нет правил</p>}
      </aside></div>
    </>}
  </div>;
}
