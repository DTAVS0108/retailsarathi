'use client';

import { useEffect } from 'react';
import {
  WEB_APPEARANCE_EVENT,
  WEB_APPEARANCE_LS_KEY,
  applyWebAppearance,
  loadWebAppearance,
} from '@/lib/appearance-prefs';

/** Re-applies saved theme on every route; keeps home / login / dashboard / admin in sync. */
export function AppearanceBootstrap() {
  useEffect(() => {
    function sync() {
      applyWebAppearance(loadWebAppearance());
    }
    sync();

    function onStorage(e: StorageEvent) {
      if (e.key === WEB_APPEARANCE_LS_KEY) sync();
    }
    function onLocal() {
      sync();
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(WEB_APPEARANCE_EVENT, onLocal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(WEB_APPEARANCE_EVENT, onLocal);
    };
  }, []);
  return null;
}
