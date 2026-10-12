import { AuthState, User, UserRole } from '../types/auth';

const LEGACY_KEY = 'skuratov_auth';
const VIEW_AS_KEY = 'skuratov_view_as';

function initialState(): AuthState {
  localStorage.removeItem(LEGACY_KEY);
  return { user: null, accessToken: null, loading: true, viewAsRole: null };
}

let state: AuthState = initialState();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export const authStore = {
  getState() {
    return state;
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  login(accessToken: string, user: User) {
    state = { user, accessToken, loading: false, viewAsRole: null };
    localStorage.removeItem(VIEW_AS_KEY);
    notify();
  },
  updateUser(user: Partial<User> & { id: number }) {
    if (state.user?.id !== user.id) return;
    state = { ...state, user: { ...state.user, ...user } };
    notify();
  },
  setLoading(loading: boolean) {
    state = { ...state, loading };
    notify();
  },
  logout() {
    state = { user: null, accessToken: null, loading: false, viewAsRole: null };
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(VIEW_AS_KEY);
    notify();
  },
  setViewAsRole(role: UserRole | null) {
    state = { ...state, viewAsRole: role };
    if (role) {
      localStorage.setItem(VIEW_AS_KEY, role);
    } else {
      localStorage.removeItem(VIEW_AS_KEY);
    }
    notify();
  },
  initViewAs() {
    const stored = localStorage.getItem(VIEW_AS_KEY);
    if (stored && state.user?.role === 'ADMIN') {
      state = { ...state, viewAsRole: stored as UserRole };
    }
  },
};
