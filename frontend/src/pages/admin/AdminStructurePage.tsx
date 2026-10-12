import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import LoadingState from '../../components/LoadingState';
import { useToast } from '../../components/ToastProvider';
import '../../styles/pages.css';
import './AdminStructurePage.css';

interface City {
  id: number;
  name: string;
  isActive: boolean;
  coffeeShops: Array<{ id: number; name: string; isActive: boolean }>;
}

export default function AdminStructurePage() {
  const toast = useToast();
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [showAddCity, setShowAddCity] = useState(false);
  const [showAddShop, setShowAddShop] = useState<{ cityId: number } | null>(null);
  const [newCityName, setNewCityName] = useState('');
  const [newShopName, setNewShopName] = useState('');
  const [editingShop, setEditingShop] = useState<{ cityId: number; shopId: number; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await api.get('/cities?includeInactiveShops=true');
      setCities((response.data.data || response.data || []).map((city: City) => ({ ...city, coffeeShops: city.coffeeShops || [] })));
    } catch {
      setLoadError('Не удалось загрузить структуру сети. Повторите загрузку.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggleCity = (id: number) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const addCity = async () => {
    if (!newCityName.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.post('/cities', { name: newCityName.trim() });
      const city = res.data.data || res.data;
      setCities((prev) => [...prev, { ...city, coffeeShops: city.coffeeShops || [] }]);
      setNewCityName('');
      setShowAddCity(false);
    } catch {
      toast.show('Не удалось добавить город', 'error');
    } finally {
      setBusy(false);
    }
  };

  const addShop = async (cityId: number) => {
    if (!newShopName.trim() || busy) return;
    setBusy(true);
    try {
      const res = await api.post('/coffee-shops', { name: newShopName.trim(), cityId });
      setCities((prev) =>
        prev.map((c) => (c.id === cityId ? { ...c, coffeeShops: [...c.coffeeShops, res.data.data || res.data] } : c)),
      );
      setNewShopName('');
      setShowAddShop(null);
    } catch {
      toast.show('Не удалось добавить кофейню', 'error');
    } finally {
      setBusy(false);
    }
  };

  const deactivateShop = async (cityId: number, shopId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`/coffee-shops/${shopId}`, { isActive: false });
      setCities((prev) =>
        prev.map((c) =>
          c.id === cityId
            ? {
                ...c,
                coffeeShops: c.coffeeShops.map((s) => (s.id === shopId ? { ...s, isActive: false } : s)),
              }
            : c,
        ),
      );
      toast.show('Кофейня деактивирована', 'success');
    } catch {
      toast.show('Не удалось деактивировать кофейню', 'error');
    } finally {
      setBusy(false);
    }
  };

  const activateShop = async (cityId: number, shopId: number) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.patch(`/coffee-shops/${shopId}`, { isActive: true });
      setCities((prev) =>
        prev.map((c) =>
          c.id === cityId
            ? {
                ...c,
                coffeeShops: c.coffeeShops.map((s) => (s.id === shopId ? { ...s, isActive: true } : s)),
              }
            : c,
        ),
      );
      toast.show('Кофейня активирована', 'success');
    } catch {
      toast.show('Не удалось активировать кофейню', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveShop = async () => {
    if (!editingShop?.name.trim() || busy) return;
    setBusy(true);
    try { await api.patch(`/coffee-shops/${editingShop.shopId}`, { name: editingShop.name.trim() }); setCities(prev => prev.map(city => city.id !== editingShop.cityId ? city : {...city, coffeeShops: city.coffeeShops.map(shop => shop.id === editingShop.shopId ? {...shop, name: editingShop.name.trim()} : shop)})); setEditingShop(null); toast.show('Название кофейни сохранено', 'success'); } catch { toast.show('Не удалось сохранить название', 'error'); } finally { setBusy(false); }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Структура сети</h1>
          <div className="page-sub">сеть → города → кофейни</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary btn-sm" disabled={busy || !!loadError} onClick={() => setShowAddCity(true)}>Добавить город</button>
        </div>
      </div>

      {loadError && <div className="card"><p className="form-error" role="alert">{loadError}</p><button className="btn btn-ghost" onClick={() => void load()}>Повторить загрузку</button></div>}
      {showAddCity && !loadError && (
        <div className="card">
          <form className="structure-add-form" onSubmit={event => { event.preventDefault(); void addCity(); }}>
            <input
              className="input"
              aria-label="Название города"
              placeholder="Название города"
              value={newCityName}
              onChange={(e) => setNewCityName(e.target.value)}
              disabled={busy}
              autoFocus
            />
            <button className="btn btn-primary btn-sm" disabled={busy || !newCityName.trim()} type="submit">{busy ? 'Добавляем…' : 'Добавить'}</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} type="button" onClick={() => setShowAddCity(false)}>Отмена</button>
          </form>
        </div>
      )}

      {!loadError && <div className="structure-cities">
        {cities.map((city) => (
          <div key={city.id} className="card">
            <div className="structure-city-header">
              <button className="structure-city-toggle" aria-expanded={!!expanded[city.id]} aria-controls={`city-shops-${city.id}`} onClick={() => toggleCity(city.id)}>
                <span aria-hidden="true">{expanded[city.id] ? '▼' : '▶'}</span>
                <strong>{city.name}</strong>
                <span className="chip chip-ghost">{city.coffeeShops.length} кофеен</span>
              </button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { setExpanded(prev => ({ ...prev, [city.id]: true })); setNewShopName(''); setShowAddShop({ cityId: city.id }); }}>
                + Кофейня
              </button>
            </div>

            {expanded[city.id] && (
              <div id={`city-shops-${city.id}`} style={{ marginTop: 10 }}>
                {showAddShop?.cityId === city.id && (
                  <form className="structure-add-form" onSubmit={event => { event.preventDefault(); void addShop(city.id); }}>
                    <input
                      className="input"
                      aria-label="Название кофейни"
                      placeholder="Название кофейни"
                      value={newShopName}
                      onChange={(e) => setNewShopName(e.target.value)}
                      disabled={busy}
                      autoFocus
                    />
                    <button className="btn btn-primary btn-sm" disabled={busy || !newShopName.trim()} type="submit">{busy ? 'Добавляем…' : 'Добавить'}</button>
                    <button className="btn btn-ghost btn-sm" disabled={busy} type="button" onClick={() => setShowAddShop(null)}>Отмена</button>
                  </form>
                )}
                <div className="table-wrap"><table className="table">
                  <thead>
                    <tr>
                      <th>Кофейня</th>
                      <th>Статус</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {city.coffeeShops.map((shop) => (
                      <tr key={shop.id}>
                        <td>{editingShop?.shopId===shop.id?<div className="structure-edit"><input className="input" disabled={busy} aria-label="Название кофейни" value={editingShop.name} onChange={e=>setEditingShop({...editingShop,name:e.target.value})}/><button className="btn btn-primary btn-sm" disabled={busy || !editingShop.name.trim()} onClick={saveShop}>{busy ? 'Сохраняем…' : 'Сохранить'}</button><button className="btn btn-subtle btn-sm" disabled={busy} onClick={()=>setEditingShop(null)}>Отмена</button></div>:shop.name}</td>
                        <td>
                          <span className={`chip ${shop.isActive ? 'chip-success' : 'chip-ghost'}`}>
                            {shop.isActive ? 'активна' : 'деактивирована'}
                          </span>
                        </td>
                        <td><div className="structure-shop-actions">
                          {editingShop?.shopId!==shop.id&&<button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditingShop({cityId:city.id,shopId:shop.id,name:shop.name})}>Редактировать</button>}
                          {shop.isActive && (
                            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => deactivateShop(city.id, shop.id)}>
                              Деактивировать
                            </button>
                          )}
                          {!shop.isActive && (
                            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => activateShop(city.id, shop.id)}>
                              Активировать
                            </button>
                          )}
                        </div></td>
                      </tr>
                    ))}
                    {city.coffeeShops.length === 0 && <tr><td colSpan={3} className="empty">Нет кофеен</td></tr>}
                  </tbody>
                </table></div>
              </div>
            )}
          </div>
        ))}
        {cities.length === 0 && <div className="card empty">Пока нет городов. Добавьте город, затем кофейни в нём.</div>}
      </div>}
    </div>
  );
}
