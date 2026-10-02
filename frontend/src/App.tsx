import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './contexts/AuthProvider';
import AppLayout from './layouts/AppLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import LeaderResultsPage from './pages/leader/LeaderResultsPage';
import LeaderMethodologyPage from './pages/leader/LeaderMethodologyPage';
import CityShopPage from './pages/city-leader/CityShopPage';
import CityTriggersPage from './pages/city-leader/CityTriggersPage';
import LeaderReportPage from './pages/leader/LeaderReportPage';
import CooReportsPage from './pages/coo/CooReportsPage';
import CooReportViewPage from './pages/coo/CooReportViewPage';
import AdminMetricsPage from './pages/admin/AdminMetricsPage';
import AdminStructurePage from './pages/admin/AdminStructurePage';
import AdminConfigPage from './pages/admin/AdminConfigPage';
import AdminHistoryPage from './pages/admin/AdminHistoryPage';
import AdminImportPage from './pages/admin/AdminImportPage';
import YearlyRatingsPage from './pages/YearlyRatingsPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';
import RequireRole from './components/RequireRole';
import LoadingState from './components/LoadingState';
import './styles/layout.css';
import './styles/login.css';

function ProtectedRoute(): React.ReactElement {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Проверяем сессию" />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout><Outlet /></AppLayout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<ProtectedRoute />}>
        <Route index element={<DashboardPage />} />
        <Route path="results" element={<RequireRole roles={['LEADER']}><LeaderResultsPage /></RequireRole>} />
        <Route path="methodology" element={<LeaderMethodologyPage />} />
        <Route path="report" element={<LeaderReportPage />} />
        <Route path="shop/:shopId" element={<RequireRole roles={['CITY_LEADER', 'COO', 'ADMIN']}><CityShopPage /></RequireRole>} />
        <Route path="triggers" element={<RequireRole roles={['CITY_LEADER', 'COO', 'ADMIN']}><CityTriggersPage /></RequireRole>} />
        <Route path="cities" element={<RequireRole roles={['COO']}><Navigate to="/?view=cities" replace /></RequireRole>} />
        <Route path="reports" element={<RequireRole roles={['COO']}><CooReportsPage /></RequireRole>} />
        <Route path="yearly-ratings" element={<RequireRole roles={['CITY_LEADER', 'COO']}><YearlyRatingsPage /></RequireRole>} />
        <Route path="reports/:shopName/:month" element={<RequireRole roles={['COO']}><CooReportViewPage /></RequireRole>} />
        <Route path="metrics" element={<RequireRole roles={['ADMIN']}><AdminMetricsPage /></RequireRole>} />
        <Route path="structure" element={<RequireRole roles={['ADMIN']}><AdminStructurePage /></RequireRole>} />
        <Route path="config" element={<RequireRole roles={['ADMIN']}><AdminConfigPage /></RequireRole>} />
        <Route path="history" element={<RequireRole roles={['ADMIN']}><AdminHistoryPage /></RequireRole>} />
        <Route path="import" element={<RequireRole roles={['ADMIN', 'COO']}><AdminImportPage /></RequireRole>} />
        <Route path="users" element={<RequireRole roles={['ADMIN']}><AdminUsersPage /></RequireRole>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
