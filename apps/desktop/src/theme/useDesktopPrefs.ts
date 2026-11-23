import { useCallback, useEffect, useState } from 'react';
import {
  applyThemeVars,
  DEFAULT_PREFS,
  DESKTOP_PREFS_LS_KEY,
  mergePrefs,
  type DesktopPrefs,
} from './prefs';

const PREFS_KEY = 'desktop.prefs';

export function useDesktopPrefs() {
  const [prefs, setPrefsState] = useState<DesktopPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      let loaded: Partial<DesktopPrefs> | null = null;
      try {
        if (window.retailSarathi?.getJsonSetting) {
          loaded = await window.retailSarathi.getJsonSetting<Partial<DesktopPrefs>>(PREFS_KEY);
        }
      } catch {
        /* ignore */
      }
      if (!loaded) {
        try {
          const raw = localStorage.getItem(DESKTOP_PREFS_LS_KEY);
          if (raw) loaded = JSON.parse(raw) as Partial<DesktopPrefs>;
        } catch {
          /* ignore */
        }
      }
      const next = mergePrefs(loaded);
      setPrefsState(next);
      applyThemeVars(next.themeId);
      document.documentElement.classList.toggle('rs-dense', next.denseUi);
      document.documentElement.classList.toggle('rs-touch-lg', next.largeTouchTargets);
      document.documentElement.classList.toggle('rs-reduce-motion', next.reduceMotion);
      setReady(true);
    })();
  }, []);

  const setPrefs = useCallback(async (patch: Partial<DesktopPrefs>) => {
    setPrefsState((prev) => {
      const next = mergePrefs({ ...prev, ...patch });
      applyThemeVars(next.themeId);
      document.documentElement.classList.toggle('rs-dense', next.denseUi);
      document.documentElement.classList.toggle('rs-touch-lg', next.largeTouchTargets);
      document.documentElement.classList.toggle('rs-reduce-motion', next.reduceMotion);
      localStorage.setItem(DESKTOP_PREFS_LS_KEY, JSON.stringify(next));
      void window.retailSarathi?.setJsonSetting?.(PREFS_KEY, next);
      return next;
    });
  }, []);

  return { prefs, setPrefs, ready };
}
