import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import Modal from '../../components/Modal';
import LoadingState from '../../components/LoadingState';
import { SelectControl } from '../../components/SelectControl';
import '../../styles/pages.css';
import './AdminUsersPage.css';

interface City {
  id: number;
  name: string;
}

interface CoffeeShop {
  id: number;
  name: string;
  cityId: number;
  city: { name: string };
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: string;
  approvedAt?: string;
  cityAssignments: Array<{ city: City }>;
  coffeeShopAssignments: Array<{ coffeeShop: CoffeeShop; assignedFrom: string; assignedUntil?: string | null }>;
  supervisions?: Array<{ leaderId: number }>;
}

const ROLES = [
  { value: 'LEADER', label: 'Лидер кофейни' },
  { value: 'CITY_LEADER', label: 'Лидер города' },
  { value: 'COO', label: 'Операционный директор' },
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'VIEWER', label: 'Просмотр' },
  { value: 'SENPAI', label: 'Лидер-семпай' },
];

/** Роли, у которых есть собственная кофейня (лидер и лидер-семпай). */
const hasOwnShop = (role: string) => role === 'LEADER' || role === 'SENPAI';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [shops, setShops] = useState<CoffeeShop[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [role, setRole] = useState('LEADER');
  const [cityIds, setCityIds] = useState<number[]>([]);
  const [shopIds, setShopIds] = useState<number[]>([]);
  const [mentor, setMentor] = useState<UserRow | null>(null);
  const [mentorLeaderIds, setMentorLeaderIds] = useState<number[]>([]);
  const [mentorError, setMentorError] = useState('');
  const [mentorSaving, setMentorSaving] = useState(false);
  const [leaderCityId, setLeaderCityId] = useState<number | ''>('');
  const [approvedAt, setApprovedAt] = useState('');
  const [assignmentFrom, setAssignmentFrom] = useState(new Date().toISOString().slice(0,10));
  const [assignmentUntil, setAssignmentUntil] = useState('');
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [usersRes, citiesRes, shopsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/cities'),
        api.get('/coffee-shops'),
      ]);
      setUsers(usersRes.data.data || usersRes.data || []);
      setCities(citiesRes.data.data || citiesRes.data || []);
      setShops(shopsRes.data.data || shopsRes.data || []);
    } catch {
      setLoadError('Не удалось загрузить пользователей и назначения. Повторите загрузку.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openEdit = (u: UserRow) => {
    const currentShop = u.coffeeShopAssignments?.find(a => !a.assignedUntil)?.coffeeShop;
    setEditing(u);
    setRole(u.role);
    setCityIds(u.cityAssignments?.map(a=>a.city.id) || []);
    setLeaderCityId(currentShop?.cityId || '');
    setShopIds(currentShop ? [currentShop.id] : []);
    setApprovedAt(u.approvedAt?.slice(0,10)||'');
    setAssignmentFrom(u.coffeeShopAssignments?.find(a=>!a.assignedUntil)?.assignedFrom?.slice(0,10)||new Date().toISOString().slice(0,10));
    setAssignmentUntil('');
    setError('');
    setOpen(true);
  };

  const handleRoleChange = (next: string) => {
    setRole(next);
    setCityIds([]);
    // Лидер и лидер-семпай оба закреплены за своей кофейней: при переключении между ними выбор сохраняем.
    if (!hasOwnShop(next)) {
      setShopIds([]);
      setLeaderCityId('');
    }
    setError('');
  };

  const openMentees = (u: UserRow) => {
    setMentor(u);
    setMentorLeaderIds(u.supervisions?.map(s => s.leaderId) || []);
    setMentorError('');
  };

  const saveMentees = async () => {
    if (!mentor || mentorSaving) return;
    setMentorSaving(true);
    setMentorError('');
    try {
      await api.patch('/users/' + mentor.id, { leaderIds: mentorLeaderIds });
      setMentor(null);
      await load();
    } catch {
      setMentorError('Не удалось сохранить подопечных. Попробуйте ещё раз.');
    } finally {
      setMentorSaving(false);
    }
  };

  const handleLeaderCityChange = (value: string) => {
    setLeaderCityId(value ? Number(value) : '');
    setShopIds([]);
    setError('');
  };

  const cityShops = leaderCityId === '' ? [] : shops.filter(shop => shop.cityId === leaderCityId);

  const save = async () => {
    if (!editing || saving) return;
    if (hasOwnShop(role) && (leaderCityId === '' || shopIds.length !== 1)) {
      setError('Сначала выберите город, затем кофейню.');
      return;
    }
    if (hasOwnShop(role) && (!assignmentFrom || (assignmentUntil && assignmentUntil < assignmentFrom))) {
      setError('Укажите дату назначения. Дата снятия не может быть раньше даты назначения.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch('/users/'+editing.id, {role, cityIds: role==='CITY_LEADER'?cityIds:[], coffeeShopIds: hasOwnShop(role)?shopIds:[], approvedAt:approvedAt||null, assignmentFrom, assignmentUntil});
      setOpen(false);
      await load();
    } catch {
      setError('Не удалось сохранить назначения. Проверьте данные.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Пользователи</h1>
          <div className="page-sub">роли, города, назначения</div>
        </div>
      </div>

      {loadError && <div className="card"><p className="form-error" role="alert">{loadError}</p><button className="btn btn-ghost" onClick={() => void load()}>Повторить загрузку</button></div>}
      {!loadError && <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Имя</th>
                <th>Email</th>
                <th>Роль</th>
                <th>Города</th>
                <th>Кофейни</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td className="muted">{u.email}</td>
                  <td>{ROLES.find((r) => r.value === u.role)?.label || u.role}</td>
                  <td className="muted">{u.cityAssignments?.[0]?.city.name || '—'}</td>
                  <td className="muted">{u.role==='SENPAI'&&<div>{'Подопечных: '+(u.supervisions?.length ?? 0)}</div>}{u.coffeeShopAssignments?.filter(a=>!a.assignedUntil).map(a=>a.coffeeShop.name).join(', ') || '—'}<div className="helper-text">{u.coffeeShopAssignments?.filter(a=>!a.assignedUntil).map(a=>'с '+new Date(a.assignedFrom).toLocaleDateString('ru-RU')).join(', ')}</div></td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>Настроить</button>
                    {u.role === 'SENPAI' && <button className="btn btn-ghost btn-sm" onClick={() => openMentees(u)}>{'Подопечные (' + (u.supervisions?.length ?? 0) + ')'}</button>}
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={6} className="empty">Нет пользователей</td></tr>}
            </tbody>
          </table>
        </div>
      </div>}

      <Modal open={open} title={`Пользователь: ${editing?.name}`} onClose={() => { if (!saving) setOpen(false); }}>
        <fieldset className="user-edit-fields" disabled={saving}>
          <label className="field">
            <span className="field-label">Роль</span>
            <SelectControl label="Роль" value={role} options={ROLES} disabled={saving} onChange={handleRoleChange} />
          </label>

          <label className="field">Дата утверждения в должности<input className="input" type="date" value={approvedAt} onChange={e=>setApprovedAt(e.target.value)}/></label>
          {role==='CITY_LEADER'&&<fieldset><legend>Города</legend>{cities.map(c=><label className="field" key={c.id}><input type="checkbox" checked={cityIds.includes(c.id)} onChange={e=>setCityIds(ids=>e.target.checked?[...ids,c.id]:ids.filter(id=>id!==c.id))}/>{c.name}</label>)}</fieldset>}
          {hasOwnShop(role)&&<div className="user-assignment-selects">
            <label className="field">
              <span className="field-label">Город кофейни</span>
              <SelectControl
                label="Город кофейни"
                disabled={saving}
                value={leaderCityId}
                options={[{value:'',label:'Выберите город',disabled:true},...cities.map(city=>({value:city.id,label:city.name}))]}
                onChange={handleLeaderCityChange}
              />
            </label>
            <label className="field">
              <span className="field-label">Кофейня</span>
              <SelectControl
                label="Кофейня"
                value={shopIds[0] || ''}
                disabled={saving || leaderCityId === ''}
                options={[{value:'',label:leaderCityId === '' ? 'Сначала выберите город' : 'Выберите кофейню',disabled:true},...cityShops.map(shop=>({value:shop.id,label:shop.name}))]}
                onChange={(value)=>{setShopIds(value?[Number(value)]:[]);setError('');}}
              />
              {leaderCityId !== '' && cityShops.length === 0 && <span className="helper-text">В этом городе нет активных кофеен.</span>}
            </label>
          </div>}
          {hasOwnShop(role)&&<><label className="field">Дата назначения на кофейню<input className="input" type="date" value={assignmentFrom} onChange={e=>setAssignmentFrom(e.target.value)}/></label><label className="field">Дата снятия с кофейни<input className="input" type="date" value={assignmentUntil} onChange={e=>setAssignmentUntil(e.target.value)}/></label></>}
          {error&&<div className="form-error" role="alert">{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Отмена</button>
            <button className="btn btn-primary btn-sm" onClick={save}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </fieldset>
      </Modal>

      <Modal open={!!mentor} title={`Подопечные: ${mentor?.name ?? ''}`} onClose={() => { if (!mentorSaving) setMentor(null); }}>
        <fieldset className="user-edit-fields" disabled={mentorSaving}>
          <p className="helper-text">Лидеры, чьи кофейни и отчёты этот лидер-семпай сможет просматривать. Изменять чужие отчёты он не сможет.</p>
          {users.filter(x => x.role === 'LEADER').map(l => (
            <label className="field" key={l.id}>
              <input type="checkbox" checked={mentorLeaderIds.includes(l.id)} onChange={e => setMentorLeaderIds(ids => e.target.checked ? [...ids, l.id] : ids.filter(id => id !== l.id))} />
              {l.name}
              <span className="helper-text">{l.coffeeShopAssignments?.filter(a => !a.assignedUntil).map(a => a.coffeeShop.name).join(', ')}</span>
            </label>
          ))}
          {!users.some(x => x.role === 'LEADER') && <span className="helper-text">Нет пользователей с ролью «Лидер кофейни»</span>}
          {mentorError && <div className="form-error" role="alert">{mentorError}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setMentor(null)}>Отмена</button>
            <button className="btn btn-primary btn-sm" onClick={saveMentees}>{mentorSaving ? 'Сохраняем…' : 'Сохранить'}</button>
          </div>
        </fieldset>
      </Modal>
    </div>
  );
}
