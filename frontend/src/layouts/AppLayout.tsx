import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import { UserRole } from '../types/auth';
import type { ReactNode } from 'react';
import RolePreview from '../components/RolePreview';
import NotificationBanner from '../components/NotificationBanner';
import BrandMark from '../components/BrandMark';
import '../styles/role-preview.css';

interface AppLayoutProps {
  children?: ReactNode;
}

const ROLE_MENUS: Record<UserRole, { label: string; to: string }[]> = {
  LEADER: [
    { label: 'Мой отчёт', to: '/' },
    { label: 'Мои результаты', to: '/results' },
    { label: 'Как считается рейтинг', to: '/methodology' },
  ],
  CITY_LEADER: [
    { label: 'Дашборд города', to: '/' },
    { label: 'Рейтинги за год', to: '/yearly-ratings' },
    { label: 'Заполнить отчёт', to: '/report' },
    { label: 'Триггеры ИПВ', to: '/triggers' },
  ],
  COO: [
    { label: 'Дашборд', to: '/' },
    { label: 'Рейтинги за год', to: '/yearly-ratings' },
    { label: 'Отчёты по месяцам', to: '/reports' },
  ],
  ADMIN: [
    { label: 'Метрики', to: '/metrics' },
    { label: 'Структура', to: '/structure' },
    { label: 'Пользователи', to: '/users' },
    { label: 'Конфигурация', to: '/config' },
    { label: 'История', to: '/history' },
    { label: 'Импорт', to: '/import' },
  ],
};

const COO_MENU_GROUPS = [
  {
    label: 'Работа с отчётами',
    items: [
      { label: 'Заполнить отчёт', to: '/report' },
      { label: 'Триггеры ИПВ', to: '/triggers' },
      { label: 'Методика', to: '/methodology' },
    ],
  },
  {
    label: 'Управление системой',
    items: [
      { label: 'Метрики', to: '/metrics' },
      { label: 'Структура', to: '/structure' },
      { label: 'Пользователи', to: '/users' },
      { label: 'Конфигурация', to: '/config' },
      { label: 'Импорт', to: '/import' },
    ],
  },
];

const ROLE_LABELS: Record<UserRole, string> = {
  LEADER: 'Лидер кофейни',
  CITY_LEADER: 'Лидер города',
  COO: 'Операционный директор',
  ADMIN: 'Администратор',
};

export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout, viewAsRole } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const role = viewAsRole || user?.role || 'LEADER';
  const menu = ROLE_MENUS[role];
  const assignmentLabel = role === 'LEADER'
    ? user?.coffeeShops?.map((shop) => shop.name).join(' · ')
    : role === 'CITY_LEADER'
      ? user?.cities?.map((city) => city.name).join(' · ')
      : ROLE_LABELS[role];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-mark">
              <BrandMark size={32} />
            </span>
            <div>
              <div className="brand-name">Скуратов · Рейтинг лидеров</div>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          {menu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-link${isActive || (role === 'COO' && item.to === '/' && location.pathname === '/cities') ? ' active' : ''}`}
            >
              <span className="sidebar-link-text">{item.label}</span>
            </NavLink>
          ))}
          {role === 'COO' && COO_MENU_GROUPS.map((group) => {
            const containsActiveRoute = group.items.some((item) => item.to === location.pathname);
            return (
              <details className="sidebar-group" key={group.label} open={containsActiveRoute || undefined}>
                <summary className={containsActiveRoute ? 'active' : ''}>
                  <span>{group.label}</span>
                  <span className="sidebar-group-caret" aria-hidden="true">⌄</span>
                </summary>
                <div className="sidebar-group-items">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) => `sidebar-link sidebar-sublink${isActive ? ' active' : ''}`}
                    >
                      <span className="sidebar-link-text">{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </details>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          {user && <div className="sidebar-account" aria-label="Текущий пользователь">
            <span className="sidebar-account-avatar" aria-hidden="true">{user.name.trim().charAt(0).toUpperCase()}</span>
            <span className="sidebar-account-copy">
              <strong>{user.name}</strong>
              <small>{assignmentLabel || user.email}</small>
            </span>
          </div>}
          <RolePreview />
          <div className="sidebar-footer-actions">
            <button className="btn btn-danger-ghost btn-sm sidebar-logout" onClick={() => { logout(); navigate('/login'); }}>
              Выйти
            </button>
            <span className="identity-mark" title="xtany">
              <img src="/identity/petal.svg" alt="xtany" />
            </span>
          </div>
        </div>
      </aside>
      <main className="main">
        <NotificationBanner />
        {children}
      </main>
    </div>
  );
}

