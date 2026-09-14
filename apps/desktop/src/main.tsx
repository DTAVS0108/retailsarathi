import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ToastProvider } from './toast';
import { applyThemeVars, DESKTOP_PREFS_LS_KEY, DEFAULT_PREFS, mergePrefs } from './theme/prefs';
import './index.css';

/** Apply persisted desktop theme before React paint (Electron localStorage). */
try {
  const raw = localStorage.getItem(DESKTOP_PREFS_LS_KEY);
  const prefs = mergePrefs(raw ? (JSON.parse(raw) as Partial<typeof DEFAULT_PREFS>) : null);
  applyThemeVars(prefs.themeId);
  document.documentElement.classList.toggle('rs-dense', prefs.denseUi);
  document.documentElement.classList.toggle('rs-touch-lg', prefs.largeTouchTargets);
  document.documentElement.classList.toggle('rs-reduce-motion', prefs.reduceMotion);
} catch {
  applyThemeVars(DEFAULT_PREFS.themeId);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);
