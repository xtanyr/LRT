import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import BrandMark from '../components/BrandMark';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Укажите имя и фамилию');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен содержать не менее 6 символов');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Пароли не совпадают');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      if (response.status === 409) {
        throw new Error('Аккаунт с этой почтой уже зарегистрирован. Войдите или восстановите пароль.');
      }
      if (response.status === 403) {
        throw new Error('Регистрация отключена. Обратитесь к администратору для создания аккаунта.');
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error('Не удалось создать аккаунт. Попробуйте ещё раз.');
      }
      const session = body.data || body;
      if (!session.accessToken || !session.user) {
        throw new Error('Не удалось открыть сессию. Попробуйте войти в аккаунт.');
      }
      login(session.accessToken, session.user);
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать аккаунт. Попробуйте ещё раз.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark"><BrandMark size={40} /></span>
          <div>
            <div className="login-title">Скуратов · Рейтинг лидеров</div>
            <div className="login-sub">внутренний сервис сети кофеен</div>
          </div>
        </div>
        <div className="login-intro">
          <h1>Регистрация</h1>
          <p>Доступ к отчётам появится после назначения кофейни администратором.</p>
        </div>
        <form onSubmit={handleRegister} className="login-form" aria-busy={loading}>
          <label className="field">
            <span className="field-label">Имя и фамилия</span>
            <input className="input" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} disabled={loading} required />
          </label>
          <label className="field">
            <span className="field-label">Электронная почта</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@skuratov.ru" disabled={loading} required />
          </label>
          <div className="field">
            <label className="field-label" htmlFor="register-password">Пароль</label>
            <input id="register-password" className="input" type="password" autoComplete="new-password" aria-describedby="register-password-hint" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} disabled={loading} required />
            <span className="login-hint" id="register-password-hint">Не менее 6 символов</span>
          </div>
          <label className="field">
            <span className="field-label">Повторите пароль</span>
            <input className="input" type="password" autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} minLength={6} disabled={loading} required />
          </label>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn btn-primary btn-wide" type="submit" disabled={loading}>
            {loading ? 'Создаём аккаунт…' : 'Создать аккаунт'}
          </button>
          <p className="login-switch">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
        </form>
      </div>
    </main>
  );
}
