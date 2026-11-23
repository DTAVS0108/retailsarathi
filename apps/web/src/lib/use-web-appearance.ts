'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  WEB_APPEARANCE_EVENT,
  WEB_APPEARANCE_LS_KEY,
  applyWebAppearance,
  DEFAULT_WEB_APPEARANCE,
  loadWebAppearance,
  saveWebAppearance,
  type WebAppearancePrefs,
} from '@/lib/appearance-prefs';

export function useWebAppearance() {
  const [prefs, setPrefsState] = useState<WebAppearancePrefs>(DEFAULT_WEB_APPEARANCE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    function syncFromStorage() {
      const loaded = loadWebAppearance();
      setPrefsState(loaded);
      applyWebAppearance(loaded);
      setReady(true);
    }
    syncFromStorage();

    function onStorage(e: StorageEvent) {
      if (e.key === WEB_APPEARANCE_LS_KEY) syncFromStorage();
    }
    function onLocal(e: Event) {
      const detail = (e as CustomEvent<WebAppearancePrefs>).detail;
      if (detail) {
        setPrefsState(detail);
        applyWebAppearance(detail);
      } else {
        syncFromStorage();
      }
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(WEB_APPEARANCE_EVENT, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(WEB_APPEARANCE_EVENT, onLocal);
    };
  }, []);

  const setPrefs = useCallback((patch: Partial<WebAppearancePrefs>) => {
    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      saveWebAppearance(next);
      return next;
    });
  }, []);

  return { prefs, setPrefs, ready };
}
