export enum UserRole {
  LEADER = 'LEADER',
  CITY_LEADER = 'CITY_LEADER',
  COO = 'COO',
  VIEWER = 'VIEWER',
  SENPAI = 'SENPAI',
  ADMIN = 'ADMIN',
}

/** Роли, которым разрешён только просмотр: любые изменяющие запросы для них запрещены. */
export const READ_ONLY_ROLES: readonly string[] = [UserRole.VIEWER, UserRole.SENPAI];

export function isReadOnlyRole(role?: string): boolean {
  return !!role && READ_ONLY_ROLES.includes(role);
}
