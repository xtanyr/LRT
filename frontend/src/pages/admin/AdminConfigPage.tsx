import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useToast } from '../../components/ToastProvider';
import LoadingState from '../../components/LoadingState';
import { triggerDescription } from '../../services/trigger-description';
import '../../styles/pages.css';
import './AdminConfigPage.css';

interface RatingColorConfig {
  id: number;
  greenThreshold: number;
  redThreshold: number;
}

interface TriggerConfig {
  id: number;
  code: string;
  thresholdRating: string;
  monthsCount: string;
  minMonthsOnPosition: string;
  minMonthsSinceApproval: string;
  isActive: boolean;
}

export default function AdminConfigPage() {
  const toast = useToast();
  const [tab, setTab] = useState<'rating' | 'triggers' | 'integrations' | 'auth'>('rating');
  const [ratingConfig, setRatingConfig] = useState<RatingColorConfig | null>(null);
  const [triggerConfigs, setTriggerConfigs] = useState<TriggerConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingId, setSavingId] = useState<number | null>(null);
  const [ruleError, setRuleError] = useState<{id:number;message:string} | null>(null);
  const [savedRule, setSavedRule] = useState('');

  const load = async () => {
    setLoading(true);setLoadError('');
    try {
      const [ratingRes, triggerRes] = await Promise.all([
        api.get('/admin/rating-color-config'), api.get('/admin/trigger-configs'),
      ]);
      if (ratingRes.data) setRatingConfig(ratingRes.data.data || ratingRes.data);
      const rules=triggerRes.data.data || triggerRes.data || [];
      setTriggerConfigs(rules.map((rule: any) => ({...rule,
        thresholdRating:String(rule.thresholdRating ?? ''),monthsCount:String(rule.monthsCount ?? ''),
        minMonthsOnPosition:String(rule.minMonthsOnPosition ?? ''),minMonthsSinceApproval:String(rule.minMonthsSinceApproval ?? ''),
      })));
    } catch {setLoadError('Не удалось загрузить конфигурацию. Повторите попытку.');}
    finally {setLoading(false);}
  };

  useEffect(() => {
    void load();
  }, []);

  const editRule = (id:number, key: keyof TriggerConfig, value: string | boolean) => {
    setTriggerConfigs(previous=>previous.map(rule=>rule.id===id?{...rule,[key]:value}:rule));
    setRuleError(null);setSavedRule('');
  };
  const saveRule = async (rule:TriggerConfig) => {
    setRuleError(null);setSavedRule('');
    const fields:[keyof TriggerConfig,string,number,number,boolean][]=[
      ['monthsCount','Месяцев подряд',1,36,true],
      ['minMonthsOnPosition','Минимальный стаж на кофейне',0,36,true],
      ['minMonthsSinceApproval','Месяцев после утверждения',0,36,true],
    ];
    if(rule.code!=='T3')fields.push(['thresholdRating','Порог рейтинга',0,100,false]);
    const payload:Record<string,number|boolean>={isActive:rule.isActive};
    for(const [key,label,min,max,integer] of fields) {
      const raw=String(rule[key]),value=Number(raw);
      if(!raw.trim()||!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value))) {
        setRuleError({id:rule.id,message:`${label}: укажите ${integer?'целое число':'число'} от ${min} до ${max}.`});return;
      }
      payload[key]=value;
    }
    setSavingId(rule.id);
    try {
      await api.patch('/ipv-triggers/config/'+rule.id,payload);
      setSavedRule(`Правило ${rule.code} сохранено`);
      window.dispatchEvent(new Event('ipv-updated'));
    } catch (error:any) {
      const message=error?.response?.data?.message;
      const details=typeof message==='string'?message:Array.isArray(message)&&message.every(item=>typeof item==='string')?message.join(', '):'';
      setRuleError({id:rule.id,message:details||'Не удалось сохранить правило. Повторите попытку.'});
    } finally {setSavingId(null);}
  };

  const saveRating = async () => {
    if (!ratingConfig) return;
    try {
      await api.patch('/admin/rating-color-config', ratingConfig);
      toast.show('Сохранено', 'success');
    } catch {
      // silent
    }
  };

  if (loading) return <LoadingState />;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Конфигурация</h1>
          <div className="page-sub">доступы, интеграции, аутентификация</div>
        </div>
      </div>

      {loadError&&<div className="card"><p role="alert">{loadError}</p><button className="btn btn-ghost" onClick={()=>void load()}>Повторить загрузку</button></div>}
      <div className="tabs">
        <button className={`tab${tab === 'rating' ? ' active' : ''}`} onClick={() => setTab('rating')}>Рейтинг</button>
        <button className={`tab${tab === 'triggers' ? ' active' : ''}`} onClick={() => setTab('triggers')}>Триггеры</button>
        <button className={`tab${tab === 'integrations' ? ' active' : ''}`} onClick={() => setTab('integrations')}>Интеграции</button>
        <button className={`tab${tab === 'auth' ? ' active' : ''}`} onClick={() => setTab('auth')}>Аутентификация</button>
      </div>

      {tab === 'rating' && ratingConfig && (
        <div className="card">
          <div className="card-title">Цветовые пороги рейтинга</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label className="field">
              <span className="field-label">Зелёная зона ≥</span>
              <input className="input" type="number" value={ratingConfig.greenThreshold} onChange={(e) => setRatingConfig({ ...ratingConfig, greenThreshold: parseInt(e.target.value) || 0 })} style={{ maxWidth: 120 }} />
            </label>
            <label className="field">
              <span className="field-label">Красная зона ≤</span>
              <input className="input" type="number" value={ratingConfig.redThreshold} onChange={(e) => setRatingConfig({ ...ratingConfig, redThreshold: parseInt(e.target.value) || 0 })} style={{ maxWidth: 120 }} />
            </label>
            <button className="btn btn-primary btn-sm" onClick={saveRating}>Сохранить</button>
          </div>
        </div>
      )}

      {tab === 'triggers' && !loadError && (
        <div className="card">
          <div className="card-title">Правила триггеров ИПВ</div>
          <p className="helper-text">Изменения применяются при следующей проверке. Для проверки сразу откройте «Триггеры ИПВ» и нажмите «Проверить сейчас».</p>
          {savedRule&&<p role="status">{savedRule}</p>}
          <div className="trigger-config-list">
            {triggerConfigs.map((c) => (
              <form key={c.code} className="trigger-config-rule" noValidate onSubmit={event=>{event.preventDefault();void saveRule(c);}}>
                <div><h2 className="card-title">{c.code}</h2><p className="helper-text">{triggerDescription({...c,monthsCount:Number(c.monthsCount)})}</p></div>
                <fieldset disabled={savingId!==null}>
                  {c.code!=='T3'&&<label className="field"><span>Порог рейтинга</span><input className="input" type="number" min={0} max={100} step="0.01" aria-label={'Порог рейтинга '+c.code} value={c.thresholdRating} onChange={event=>editRule(c.id,'thresholdRating',event.target.value)}/></label>}
                  <label className="field"><span>Месяцев подряд</span><input className="input" type="number" min={1} max={36} step={1} aria-label={'Месяцев подряд '+c.code} value={c.monthsCount} onChange={event=>editRule(c.id,'monthsCount',event.target.value)}/></label>
                  <label className="field"><span>Минимальный стаж на кофейне, мес.</span><input className="input" type="number" min={0} max={36} step={1} aria-label={'Минимальный стаж на кофейне '+c.code} value={c.minMonthsOnPosition} onChange={event=>editRule(c.id,'minMonthsOnPosition',event.target.value)}/></label>
                  <label className="field"><span>Месяцев после утверждения</span><input className="input" type="number" min={0} max={36} step={1} aria-label={'Месяцев после утверждения '+c.code} value={c.minMonthsSinceApproval} onChange={event=>editRule(c.id,'minMonthsSinceApproval',event.target.value)}/></label>
                  <label className="trigger-config-active"><input type="checkbox" aria-label={'Правило '+c.code+' активно'} checked={c.isActive} onChange={event=>editRule(c.id,'isActive',event.target.checked)}/>Правило активно</label>
                </fieldset>
                {ruleError?.id===c.id&&<p role="alert">{ruleError.message}</p>}
                <button type="submit" className="btn btn-primary btn-sm" disabled={savingId!==null}>{savingId===c.id?'Сохраняем…':'Сохранить '+c.code}</button>
              </form>
            ))}
            {triggerConfigs.length === 0 && <div className="empty">Нет правил</div>}
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="card">
          <div className="card-title">Источники данных</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>RocketData</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Скорость разбора отзыва · v2</div>
              </div>
              <span className="chip chip-ghost">не подключено</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>Финансовый дашборд</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Выручка, ФОТ, списания, аренда, расходы · v2</div>
              </div>
              <span className="chip chip-ghost">не подключено</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>1С</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>Не используется в текущей версии</div>
              </div>
              <span className="chip chip-ghost">не подключено</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'auth' && (
        <div className="card">
          <div className="card-title">Аутентификация</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>Email + пароль</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>вход по корпоративной почте</div>
              </div>
              <span className="chip chip-success">включено</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>Google OAuth</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>активен наравне с email+паролем</div>
              </div>
              <span className="chip chip-success">включено</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>Длительность сессии</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>скользящее окно, обновляется при каждом входе</div>
              </div>
              <span className="chip chip-ghost">60 дней</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>Ссылка сброса пароля</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>действует 24 часа</div>
              </div>
              <span className="chip chip-ghost">24 ч</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
