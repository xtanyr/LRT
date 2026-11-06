import { useAuth } from '../contexts/AuthProvider';
import { UserRole } from '../types/auth';
import { SelectControl } from './SelectControl';

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'LEADER', label: 'Лидер кофейни' },
  { value: 'CITY_LEADER', label: 'Лидер города' },
  { value: 'COO', label: 'Операционный директор' },
  { value: 'ADMIN', label: 'Администратор' },
  { value: 'VIEWER', label: 'Просмотр' },
];

export default function RolePreview() {
  const { user, viewAsRole, setViewAsRole } = useAuth();

  if (user?.role !== 'ADMIN') return null;

  const current = viewAsRole || user.role;

  return (
    <div className="role-preview">
      <label className="role-preview-label" htmlFor="role-preview-select">
        Просмотр как:
      </label>
      <SelectControl label="Просмотр как" className="role-preview-select" value={current} onChange={(value) => setViewAsRole(value as UserRole)} options={ROLES.map(r=>({value:r.value,label:r.label}))}/>
      {viewAsRole && (
        <button className="btn btn-subtle btn-sm role-preview-reset" onClick={() => setViewAsRole(null)}>
          Сбросить
        </button>
      )}
    </div>
  );
}
