import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppData } from '../core/types';
import { localScope, readLocal, subscribeToLocal, updateLocal } from './local';
import { emptyData } from './validation';

export function useAppStore(userId?: string | null) {
  const scope = localScope(userId);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const [state, setState] = useState<{ scope: string; data: AppData; loading: boolean; error: string | null }>({ scope, data: emptyData(), loading: true, error: null });
  useEffect(() => {
    let active = true;
    let request = 0;
    const refresh = async () => {
      const token = ++request;
      try {
        const data = await readLocal(scope);
        if (active && token === request) setState({ scope, data, loading: false, error: null });
      } catch (error) {
        if (active && token === request) setState(previous => ({ scope, data: previous.scope === scope ? previous.data : emptyData(), loading: false, error: error instanceof Error ? error.message : 'Local storage could not be opened.' }));
      }
    };
    void refresh();
    const unsubscribe = subscribeToLocal(changed => { if (changed === scope) void refresh(); });
    return () => { active = false; unsubscribe(); };
  }, [scope]);
  const update = useCallback(async (updater: (data: AppData) => AppData) => {
    try {
      await updateLocal(scope, updater);
      // The subscription reloads the newest transaction, including concurrent writes.
    } catch (error) {
      if (currentScope.current === scope) setState(previous => ({ ...previous, error: error instanceof Error ? error.message : 'The change could not be saved.' }));
      throw error;
    }
  }, [scope]);
  return { data: state.scope === scope ? state.data : emptyData(), loading: state.scope !== scope || state.loading, error: state.scope === scope ? state.error : null, update };
}
