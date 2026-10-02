import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import BrandMark from '../components/BrandMark';

type LoginMode = 'login' | 'forgot';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const resetToken = searchParams.get('resetToken');
  const [mode, setMode] = useState<LoginMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const readError = async (response: Response, fallback: string) => {
    const data = await response.json().catch(() => ({}));
    return data.message || fallback;
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Неверный email или пароль'));
      }
      const data = await response.json();
      const session = data.data || data;
      login(session.accessToken, session.user);
      navigate('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось войти');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Не удалось отправить ссылку'));
      }
      setSuccess('Если такая почта зарегистрирована, ссылка для сброса отправлена.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось отправить ссылку');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (password !== passwordConfirmation) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, 'Ссылка недействительна или устарела'));
      }
      setPassword('');
      setPasswordConfirmation('');
      setSuccess('Пароль изменён. Теперь можно войти.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось изменить пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark">
            <BrandMark size={40} />
          </span>
          <div>
            <div className="login-title">Скуратов · Рейтинг лидеров</div>
            <div className="login-sub">внутренний сервис сети кофеен</div>
          </div>
        </div>

        {resetToken ? (
          <form noValidate onSubmit={handleResetPassword} className="login-form">
            <label className="field">
              <span className="field-label">Новый пароль</span>
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required />
            </label>
            <label className="field">
              <span className="field-label">Повторите пароль</span>
              <input className="input" type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={6} required />
            </label>
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            <button className="btn btn-primary btn-wide" type="submit" disabled={loading}>
              {loading ? 'Сохранение...' : 'Сохранить новый пароль'}
            </button>
            <button type="button" className="btn btn-ghost btn-wide" onClick={() => navigate('/login', { replace: true })}>
              Вернуться ко входу
            </button>
          </form>
        ) : mode === 'forgot' ? (
          <form noValidate onSubmit={handleForgotPassword} className="login-form">
            <label className="field">
              <span className="field-label">Электронная почта</span>
              <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@skuratov.ru" required />
            </label>
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            <button className="btn btn-primary btn-wide" type="submit" disabled={loading}>
              {loading ? 'Отправка...' : 'Отправить ссылку'}
            </button>
            <button type="button" className="btn btn-ghost btn-wide" onClick={() => setMode('login')}>
              Вернуться ко входу
            </button>
          </form>
        ) : (
          <form noValidate onSubmit={handleLogin} className="login-form">
            <label className="field">
              <span className="field-label">Электронная почта</span>
              <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@skuratov.ru" required />
            </label>
            <label className="field">
              <span className="field-label">Пароль</span>
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
            {error && <div className="error">{error}</div>}
            <button className="btn btn-primary btn-wide" type="submit" disabled={loading}>
              {loading ? 'Вход...' : 'Войти'}
            </button>
            <button type="button" className="btn btn-ghost btn-wide" onClick={() => setMode('forgot')}>
              Забыли пароль?
            </button>
            <div className="login-divider">или</div>
            <button type="button" className="btn btn-wide" onClick={() => { window.location.href = '/api/auth/google'; }}>
              Войти через Google
            </button>
            <p className="login-switch">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}

