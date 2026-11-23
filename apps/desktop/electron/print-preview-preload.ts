import { contextBridge, ipcRenderer } from 'electron';

/** API for the A4 print-preview BrowserWindow toolbar. */
contextBridge.exposeInMainWorld('rsPrintPreview', {
  print: () => ipcRenderer.invoke('print:preview-do-print') as Promise<{ ok: boolean; error?: string }>,
  printDirect: () =>
    ipcRenderer.invoke('print:preview-print-direct') as Promise<{ ok: boolean; error?: string }>,
  savePdf: () => ipcRenderer.invoke('print:preview-save-pdf') as Promise<{ ok: boolean; error?: string }>,
  close: () => ipcRenderer.invoke('print:preview-close') as Promise<boolean>,
});
