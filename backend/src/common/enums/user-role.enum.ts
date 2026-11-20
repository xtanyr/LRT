export enum UserRole {
  LEADER = 'LEADER',
  CITY_LEADER = 'CITY_LEADER',
  COO = 'COO',
  VIEWER = 'VIEWER',
  SENPAI = 'SENPAI',
  ADMIN = 'ADMIN',
}

/**
 * Роли, которым разрешён только просмотр: любые изменяющие запросы для них запрещены.
 * Лидер-семпай сюда не входит: у него есть своя кофейня и свой отчёт, запись в чужие кофейни
 * запрещается отдельно (см. ReportsService).
 */
export const READ_ONLY_ROLES: readonly string[] = [UserRole.VIEWER];

export function isReadOnlyRole(role?: string): boolean {
  return !!role && READ_ONLY_ROLES.includes(role);
}
