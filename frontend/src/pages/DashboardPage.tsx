import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthProvider';
import LeaderReportPage from '../pages/leader/LeaderReportPage';
import CityDashboardPage from '../pages/city-leader/CityDashboardPage';
import CooShopsPage from '../pages/coo/CooShopsPage';
import AdminMetricsPage from '../pages/admin/AdminMetricsPage';

export default function DashboardPage() {
  const { user, viewAsRole } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const effectiveRole = viewAsRole || user.role;

  switch (effectiveRole) {
    case 'LEADER':
      return <LeaderReportPage />;
    case 'CITY_LEADER':
      return <CityDashboardPage />;
    case 'COO':
    case 'VIEWER':
      return <CooShopsPage />;
    case 'ADMIN':
      return <AdminMetricsPage />;
    default:
      return <Navigate to="/login" replace />;
  }
}
