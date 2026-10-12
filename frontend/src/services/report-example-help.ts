import { useEffect, useState, useSyncExternalStore } from 'react';
import { api } from './api';
import { authStore } from './auth-store';

export function useReportExampleHelp() {
  const { user } = useSyncExternalStore(authStore.subscribe, authStore.getState);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [user?.id]);

  async function dismiss() {
    if (!user || saving) return false;
    if (user.reportExampleHelpDismissed) return true;
    const userId = user.id;
    setSaving(true);
    setError('');
    try {
      await api.patch('/auth/report-example-help');
      if (authStore.getState().user?.id !== userId) return false;
      authStore.updateUser({ id: userId, reportExampleHelpDismissed: true });
      return true;
    } catch {
      if (authStore.getState().user?.id === userId) setError('Не удалось сохранить настройку помощи. Попробуйте ещё раз.');
      return false;
    } finally { setSaving(false); }
  }

  return { dismissed: user?.reportExampleHelpDismissed === true, saving, error, canSave: !!user && !saving, dismiss };
}
