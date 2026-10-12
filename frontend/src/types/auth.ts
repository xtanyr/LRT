import { createContext, useContext } from 'react';

export type UserRole = 'LEADER' | 'CITY_LEADER' | 'COO' | 'ADMIN';

export interface User {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  reportExampleHelpDismissed?: boolean;
  coffeeShops?: { id: number; name: string }[];
  cities?: { id: number; name: string }[];
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  loading: boolean;
  viewAsRole: UserRole | null;
}

export interface AuthContextValue extends AuthState {
  login: (accessToken: string, user: User) => void;
  logout: () => Promise<void>;
  setViewAsRole: (role: UserRole | null) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
