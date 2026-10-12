import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/ToastProvider';
import '../../styles/pages.css';

interface Metric {
  id: number;
  name: string;
  code: string;
  unit: string;
  direction: string;
  targetValue: number | null;
  midValue: number | null;
  ptTarget: number;
  ptMid: number;
  isActive: boolean;
  source?: string;
  section?: string;
}

interface FormData {
  name: string;
  code: string;
  unit: string;
  direction: string;
  source: string;
  section: string;
  targetValue: string;
  midValue: string;
  ptTarget: string;
  ptMid: string;
}

const emptyForm: FormData = {
  name: '',
  code: '',
  unit: '',
  direction: 'HIGHER_IS_BETTER',
  source: '',
  section: '',
  targetValue: '',
  midValue: '',
  ptTarget: '',
  ptMid: '',
};

export default function AdminMetricsPage() {
  const toast = useToast();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Metric | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get('/metrics');
      setMetrics(res.data.data || res.data || []);
    } catch {
      setLoadError('Не удалось загрузить метрики. Повторите загрузку.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormError('');
    setOpen(true);
  };

  const openEdit = (m: Metric) => {
    setEditing(m);
    setForm({
      name: m.name,
      code: m.code,
      unit: m.unit,
      direction: m.direction,
      source: m.source || '',
      section: m.section || '',
      targetValue: m.targetValue?.toString() ?? '',
      midValue: m.midValue?.toString() ?? '',
      ptTarget: m.ptTarget?.toString() ?? '',
      ptMid: m.ptMid?.toString() ?? '',
    });
    setFormError('');
    setOpen(true);
  };

  const save = async () => {
    const decimal = (value: string) => Number(value.trim().replace(',', '.'));
    const targetValue = decimal(form.targetValue);
    const midValue = decimal(form.midValue);
    const ptTarget = decimal(form.ptTarget);
    const ptMid = decimal(form.ptMid);
    if (!form.name.trim() || !form.code.trim() || !form.unit.trim() || !form.section) {
      setFormError('Заполните название, код, единицу измерения и блок.');
      return;
    }
    if (![targetValue, midValue, ptTarget, ptMid].every(Number.isFinite)) {
      setFormError('Пороги и баллы должны быть числами. Можно использовать точку или запятую.');
      return;
    }
    if (ptTarget < ptMid || ptMid < 0) {
      setFormError('Баллы зелёной зоны должны быть не меньше баллов жёлтой зоны.');
      return;
    }
    if (
      (form.direction === 'HIGHER_IS_BETTER' && targetValue < midValue) ||
      (form.direction === 'LOWER_IS_BETTER' && targetValue > midValue)
    ) {
      setFormError(form.direction === 'HIGHER_IS_BETTER'
        ? 'Для направления «больше — лучше» целевой порог должен быть не ниже жёлтого.'
        : 'Для направления «меньше — лучше» целевой порог должен быть не выше жёлтого.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const payload: any = {
        ...form,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        unit: form.unit.trim(),
        source: form.source.trim(),
        targetValue,
        midValue,
        ptTarget,
        ptMid,
      };
      if (editing) {
        await api.patch(`/metrics/${editing.id}`, payload);
      } else {
        await api.post('/metrics', payload);
      }
      setOpen(false);
      await load();
      toast.show(editing ? 'Метрика обновлена' : 'Метрика добавлена', 'success');
    } catch (error: any) {
      const message = Array.isArray(error?.response?.data?.message)
        ? error.response.data.message.join('. ')
        : error?.response?.data?.message;
      setFormError(message || 'Не удалось сохранить метрику. Проверьте заполнение полей.');
    } finally {
      setSaving(false);
    }
  };

  const archiveMetric = async (id: number) => {
    try {
      await api.delete(`/metrics/${id}`);
      await load();
      toast.show('Метрика перемещена в архив', 'success');
    } catch {
      toast.show('Не удалось архивировать метрику', 'error');
    }
  };

  const restoreMetric = async (id: number) => {
    try {
      await api.patch(`/metrics/${id}/restore`, {});
      await load();
      toast.show('Метрика возвращена из архива', 'success');
    } catch {
      toast.show('Не удалось вернуть метрику', 'error');
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Метрики рейтинга</h1>
          <div className="page-sub">пороги, баллы, направление</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" disabled={!!loadError} onClick={openAdd}>Добавить метрику</button>
        </div>
      </div>

      {loadError && <div className="card"><p className="form-error" role="alert">{loadError}</p><button className="btn btn-ghost" onClick={() => void load()}>Повторить загрузку</button></div>}
      {!loadError && <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Код</th>
                <th>Метрика</th>
                <th>Ед.</th>
                <th>Источник</th>
                <th>Целевой</th>
                <th>Ниже цели</th>
                <th>Направление</th>
                <th>Баллы</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td className="muted">{m.code}</td>
                  <td>{m.name}</td>
                  <td className="muted">{m.unit}</td>
                  <td className="muted">{m.source || '—'}</td>
                  <td className="muted">{m.targetValue ?? '—'}</td>
                  <td className="muted">{m.midValue ?? '—'}</td>
                  <td className="muted">{m.direction === 'HIGHER_IS_BETTER' ? '↑ больше — лучше' : '↓ меньше — лучше'}</td>
                  <td className="muted">{m.ptTarget} / {m.ptMid}</td>
                  <td><span className={`chip ${m.isActive ? 'chip-success' : 'chip-ghost'}`}>{m.isActive ? 'активна' : 'архив'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>Изменить</button>
                      {m.isActive ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => archiveMetric(m.id)}>Архив</button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => restoreMetric(m.id)}>Вернуть</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {metrics.length === 0 && <tr><td colSpan={10} className="empty">Нет метрик</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}

      <Modal open={open} title={editing ? 'Изменить метрику' : 'Новая метрика'} onClose={() => setOpen(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="field">
            <span className="field-label">Название</span>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Код</span>
            <input className="input" aria-label="Код" value={form.code} disabled={Boolean(editing)} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            {editing && <span className="helper-text">Код фиксирует связь с импортом и историческими отчётами.</span>}
          </label>
          <label className="field">
            <span className="field-label">Единица измерения</span>
            <input className="input" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </label>
          <label className="field">
            <span className="field-label">Источник</span>
            <input className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="RocketData / Finance / 1C" />
          </label>
          <label className="field">
            <span className="field-label">Блок</span>
            <select className="input" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })}>
              <option value="">—</option>
              <option value="TEAM_GUESTS">Команда и гости</option>
              <option value="LABOR_COST">Labor Cost</option>
              <option value="COSTING">Себестоимость</option>
              <option value="EXPENSES">Расходы</option>
            </select>
          </label>
          <label className="field">
            <span className="field-label">Направление</span>
            <select className="input" value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
              <option value="HIGHER_IS_BETTER">↑ больше — лучше</option>
              <option value="LOWER_IS_BETTER">↓ меньше — лучше</option>
            </select>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="field">
              <span className="field-label">Целевой порог</span>
              <input className="input" inputMode="decimal" value={form.targetValue} onChange={(e) => setForm({ ...form, targetValue: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Ниже цели</span>
              <input className="input" inputMode="decimal" value={form.midValue} onChange={(e) => setForm({ ...form, midValue: e.target.value })} />
            </label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label className="field">
              <span className="field-label">Баллы (зелёная)</span>
              <input className="input" inputMode="decimal" value={form.ptTarget} onChange={(e) => setForm({ ...form, ptTarget: e.target.value })} />
            </label>
            <label className="field">
              <span className="field-label">Баллы (жёлтая)</span>
              <input className="input" inputMode="decimal" value={form.ptMid} onChange={(e) => setForm({ ...form, ptMid: e.target.value })} />
            </label>
          </div>
          {formError && <div className="form-error" role="alert">{formError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Отмена</button>
            <button className="btn btn-primary btn-sm" disabled={saving} onClick={save}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
