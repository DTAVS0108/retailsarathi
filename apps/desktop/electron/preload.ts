import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('retailSarathi', {
  getProducts: () => ipcRenderer.invoke('db:products'),
  saveInvoice: (invoice: unknown) => ipcRenderer.invoke('db:save-invoice', invoice),
  getOutbox: () => ipcRenderer.invoke('db:outbox'),
  getOutboxCount: () => ipcRenderer.invoke('db:outbox-count') as Promise<number>,
  sync: (token: string, apiUrl: string) => ipcRenderer.invoke('sync:run', token, apiUrl),
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  getJsonSetting: <T = unknown>(key: string) =>
    ipcRenderer.invoke('settings:get-json', key) as Promise<T | null>,
  setJsonSetting: (key: string, value: unknown) => ipcRenderer.invoke('settings:set-json', key, value),
  printThermal: (
    payload:
      | string
      | {
          text?: string;
          escposBase64?: string;
          comPort?: string;
          bluetoothAddress?: string;
          kickDrawer?: boolean;
        },
  ) => ipcRenderer.invoke('print:thermal', payload),
  printHtml: (html: string) =>
    ipcRenderer.invoke('print:html', html) as Promise<{ ok: boolean; error?: string }>,
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  hasCashierPins: () => ipcRenderer.invoke('auth:has-pins') as Promise<boolean>,
  setCashierPin: (payload: { label?: string; pin: string; token: string }) =>
    ipcRenderer.invoke('auth:set-pin', payload) as Promise<boolean>,
  verifyPin: (pin: string) =>
    ipcRenderer.invoke('auth:verify-pin', pin) as Promise<{
      ok: boolean;
      token?: string;
      label?: string;
    }>,
  clearCashierPins: () => ipcRenderer.invoke('auth:clear-pins') as Promise<boolean>,
  checkForUpdates: () =>
    ipcRenderer.invoke('update:check') as Promise<{ available: boolean; version?: string | null }>,
  installUpdate: () => ipcRenderer.invoke('update:install') as Promise<boolean>,
  setTitle: (title: string) => ipcRenderer.invoke('app:set-title', title) as Promise<boolean>,
});
