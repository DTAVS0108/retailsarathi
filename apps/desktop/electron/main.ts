import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import {
  initDatabase,
  getLocalProducts,
  saveLocalInvoice,
  getOutbox,
  getOutboxCount,
  getSetting,
  setSetting,
  getJsonSetting,
  setJsonSetting,
  hasCashierPins,
  setCashierPin,
  verifyCashierPin,
  clearCashierPins,
} from './database';
import { syncWithServer } from './sync';

let mainWindow: BrowserWindow | null = null;

function resolveAppIcon(): string | undefined {
  const candidates = [
    path.join(process.resourcesPath, 'app-icon.png'),
    path.join(__dirname, '../build/icon.png'),
    path.join(app.getAppPath(), 'build/icon.png'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

// Dev QA: expose Chromium CDP for agent-browser / DevTools Protocol automation
if (process.env.VITE_DEV_SERVER_URL || process.env.RS_CDP_PORT) {
  app.commandLine.appendSwitch('remote-debugging-port', process.env.RS_CDP_PORT || '9222');
}

function createWindow() {
  const icon = resolveAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'RetailSarathi POS',
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Allow A4 print preview popups from the renderer
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Blob/data print previews open in a child window; external http(s) go to browser
    if (url.startsWith('blob:') || url.startsWith('data:')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1024,
          height: 900,
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
          },
        },
      };
    }
    if (url.startsWith('http:') || url.startsWith('https:')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('db:products', () => getLocalProducts());
ipcMain.handle('db:save-invoice', (_e, invoice) => saveLocalInvoice(invoice));
ipcMain.handle('db:outbox', () => getOutbox());
ipcMain.handle('db:outbox-count', () => getOutboxCount());
ipcMain.handle('sync:run', (_e, token: string, apiUrl: string) => syncWithServer(token, apiUrl));
ipcMain.handle('settings:get', (_e, key: string) => getSetting(key));
ipcMain.handle('settings:set', (_e, key: string, value: string) => {
  setSetting(key, value);
  return true;
});
ipcMain.handle('settings:get-json', (_e, key: string) => getJsonSetting(key));
ipcMain.handle('settings:set-json', (_e, key: string, value: unknown) => {
  setJsonSetting(key, value);
  return true;
});

ipcMain.handle('app:set-title', (_e, title: string) => {
  const next = String(title || '').trim();
  if (mainWindow && next) mainWindow.setTitle(next);
  return true;
});

ipcMain.handle('auth:has-pins', () => hasCashierPins());
ipcMain.handle(
  'auth:set-pin',
  (_e, payload: { label?: string; pin: string; token: string }) =>
    setCashierPin(payload.label || 'Cashier', payload.pin, payload.token),
);
ipcMain.handle('auth:verify-pin', (_e, pin: string) => verifyCashierPin(pin));
ipcMain.handle('auth:clear-pins', () => clearCashierPins());

ipcMain.handle('update:check', async () => {
  // Stub for packaged releases; wire electron-updater when publishing.
  return { available: false, version: null as string | null };
});
ipcMain.handle('update:install', () => false);

type ThermalPayload =
  | string
  | {
      text?: string;
      escposBase64?: string;
      comPort?: string;
      bluetoothAddress?: string;
      kickDrawer?: boolean;
    };

const DRAWER_KICK = Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa]);

/**
 * Native thermal print:
 * 1) Write raw ESC/POS .bin
 * 2) If THERMAL_COM_PORT / payload.comPort set (Windows Bluetooth SPP COM), write bytes to \\\\.\\COMx
 * 3) Fallback: open .bin / .txt for the OS
 */
ipcMain.handle('print:thermal', async (_e, payload: ThermalPayload) => {
  const dir = app.getPath('temp');
  const stamp = Date.now();
  const data =
    typeof payload === 'string'
      ? { text: payload }
      : payload || {};

  let bytes: Buffer;
  if (data.escposBase64) {
    bytes = Buffer.from(data.escposBase64, 'base64');
  } else {
    bytes = Buffer.from(data.text || '', 'utf8');
  }

  if (data.kickDrawer) {
    bytes = Buffer.concat([bytes, DRAWER_KICK]);
  }

  const binFile = path.join(dir, `retailsarathi-thermal-${stamp}.bin`);
  const txtFile = path.join(dir, `retailsarathi-thermal-${stamp}.txt`);
  fs.writeFileSync(binFile, bytes);
  if (data.text) fs.writeFileSync(txtFile, data.text, 'utf8');
  else fs.writeFileSync(txtFile, bytes);

  const comPort = (data.comPort || process.env.THERMAL_COM_PORT || '').trim().toUpperCase();
  let comWritten = false;
  let comError: string | undefined;
  if (comPort && process.platform === 'win32') {
    const portPath = comPort.startsWith('COM') ? `\\\\.\\${comPort}` : comPort;
    try {
      fs.writeFileSync(portPath, bytes);
      comWritten = true;
    } catch (err) {
      comError = err instanceof Error ? err.message : String(err);
      console.warn('COM thermal write failed:', comError);
    }
  }

  console.log('--- THERMAL PRINT ---');
  if (data.text) console.log(data.text);
  console.log('Thermal .bin saved:', binFile, 'bytes=', bytes.length, 'com=', comPort || 'none', comWritten);

  if (!comWritten) {
    try {
      await shell.openPath(binFile);
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    path: binFile,
    textPath: txtFile,
    bytes: bytes.length,
    comPort: comPort || null,
    comWritten,
    comError: comError || null,
    bluetoothAddress: data.bluetoothAddress || null,
    kickDrawer: Boolean(data.kickDrawer),
  };
});

ipcMain.handle('shell:open-external', (_e, url: string) => shell.openExternal(url));

/** Active A4 print-preview window (Electron has no OS print-preview pane on Windows). */
let printPreviewWin: BrowserWindow | null = null;
let printPreviewTempHtml: string | null = null;

function wrapInvoiceHtmlForPreview(html: string): string {
  const body = html.includes('<html')
    ? html
    : `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${html}</body></html>`;

  const toolbar = `
<style id="rs-print-preview-css">
  #rs-print-bar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 10px 14px;
    background: #0f172a; color: #f8fafc;
    font: 600 13px/1.2 system-ui, Segoe UI, sans-serif;
    box-shadow: 0 4px 16px rgba(15, 23, 42, 0.35);
  }
  #rs-print-bar .rs-grow { flex: 1; min-width: 8px; }
  #rs-print-bar .rs-hint { font-weight: 500; color: #94a3b8; font-size: 12px; }
  #rs-print-bar button {
    appearance: none; border: 0; border-radius: 8px;
    padding: 8px 14px; font: 700 13px/1 system-ui, Segoe UI, sans-serif;
    cursor: pointer;
  }
  #rs-print-bar button.rs-primary { background: #0d9488; color: #fff; }
  #rs-print-bar button.rs-primary:hover { background: #0f766e; }
  #rs-print-bar button.rs-secondary { background: #334155; color: #f8fafc; }
  #rs-print-bar button.rs-secondary:hover { background: #475569; }
  #rs-print-bar button.rs-ghost { background: transparent; color: #cbd5e1; }
  #rs-print-bar button.rs-ghost:hover { background: #1e293b; }
  #rs-print-bar button:disabled { opacity: 0.55; cursor: wait; }
  body.rs-has-print-bar { padding-top: 56px !important; }
  @media print {
    #rs-print-bar { display: none !important; }
    body.rs-has-print-bar { padding-top: 0 !important; }
  }
</style>
<div id="rs-print-bar" role="toolbar" aria-label="Print preview">
  <span>Print preview</span>
  <span class="rs-hint">This window is the preview — Windows print dialog cannot show one</span>
  <span class="rs-grow"></span>
  <button type="button" class="rs-primary" data-rs="print">Open PDF</button>
  <button type="button" class="rs-secondary" data-rs="pdf">Save PDF</button>
  <button type="button" class="rs-secondary" data-rs="direct">Print now</button>
  <button type="button" class="rs-ghost" data-rs="close">Close</button>
</div>
<script>
(function () {
  document.body.classList.add('rs-has-print-bar');
  var bar = document.getElementById('rs-print-bar');
  if (!bar || !window.rsPrintPreview) return;
  function busy(on) {
    bar.querySelectorAll('button').forEach(function (b) { b.disabled = !!on; });
  }
  bar.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var action = t.getAttribute('data-rs');
    if (!action) return;
    if (action === 'close') { window.rsPrintPreview.close(); return; }
    busy(true);
    var p =
      action === 'print' ? window.rsPrintPreview.print() :
      action === 'direct' ? window.rsPrintPreview.printDirect() :
      window.rsPrintPreview.savePdf();
    Promise.resolve(p).finally(function () { busy(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.rsPrintPreview.close();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      window.rsPrintPreview.print();
    }
  });
})();
</script>`;

  if (/<\/body>/i.test(body)) {
    return body.replace(/<\/body>/i, `${toolbar}</body>`);
  }
  return `${body}${toolbar}`;
}

async function printPreviewDoPrint(): Promise<{ ok: boolean; error?: string }> {
  const win = printPreviewWin;
  if (!win || win.isDestroyed()) {
    return { ok: false, error: 'Preview window is closed' };
  }

  // Never use webContents.print({ silent:false }) on Windows — OS dialog has no preview.
  // Open a real PDF instead (Edge/Adobe) so Print works with a proper preview.
  try {
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' },
    });
    const out = path.join(app.getPath('temp'), `retailsarathi-print-${Date.now()}.pdf`);
    fs.writeFileSync(out, pdf);
    const openErr = await shell.openPath(out);
    if (openErr) {
      return { ok: false, error: openErr };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Send straight to the default printer (no Windows dialog / no OS preview). */
async function printPreviewPrintDirect(): Promise<{ ok: boolean; error?: string }> {
  const win = printPreviewWin;
  if (!win || win.isDestroyed()) {
    return { ok: false, error: 'Preview window is closed' };
  }
  return new Promise((resolve) => {
    win.webContents.print(
      {
        silent: true,
        printBackground: true,
        deviceName: '',
      },
      (success, failureReason) => {
        resolve(
          success
            ? { ok: true }
            : { ok: false, error: failureReason || 'Print failed — set a default printer in Windows' },
        );
      },
    );
  });
}

async function printPreviewSavePdf(): Promise<{ ok: boolean; error?: string }> {
  const win = printPreviewWin;
  if (!win || win.isDestroyed()) {
    return { ok: false, error: 'Preview window is closed' };
  }

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save invoice PDF',
    defaultPath: path.join(app.getPath('documents'), `invoice-${Date.now()}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (canceled || !filePath) {
    return { ok: false, error: 'Save cancelled' };
  }

  try {
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { marginType: 'default' },
    });
    fs.writeFileSync(filePath, pdf);
    await shell.openPath(filePath);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function closePrintPreview(): boolean {
  if (printPreviewWin && !printPreviewWin.isDestroyed()) {
    printPreviewWin.close();
  }
  return true;
}

/**
 * Open a real in-app A4 print preview.
 * Windows' system print dialog cannot show Chromium preview ("This app doesn't support print preview").
 */
ipcMain.handle('print:html', async (_e, html: string) => {
  if (!html || typeof html !== 'string') {
    return { ok: false, error: 'Empty print document' };
  }

  if (printPreviewWin && !printPreviewWin.isDestroyed()) {
    printPreviewWin.close();
  }

  const stamp = Date.now();
  const file = path.join(app.getPath('temp'), `retailsarathi-a4-${stamp}.html`);
  printPreviewTempHtml = file;
  fs.writeFileSync(file, wrapInvoiceHtmlForPreview(html), 'utf8');

  const win = new BrowserWindow({
    width: 920,
    height: 1100,
    minWidth: 640,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'RetailSarathi — Print preview',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'print-preview-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  printPreviewWin = win;

  win.on('closed', () => {
    if (printPreviewWin === win) printPreviewWin = null;
    if (printPreviewTempHtml) {
      try {
        fs.unlinkSync(printPreviewTempHtml);
      } catch {
        /* ignore */
      }
      printPreviewTempHtml = null;
    }
  });

  try {
    await win.loadFile(file);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.moveTop();
    return { ok: true };
  } catch (err) {
    if (!win.isDestroyed()) win.destroy();
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
});

ipcMain.handle('print:preview-do-print', () => printPreviewDoPrint());
ipcMain.handle('print:preview-print-direct', () => printPreviewPrintDirect());
ipcMain.handle('print:preview-save-pdf', () => printPreviewSavePdf());
ipcMain.handle('print:preview-close', () => closePrintPreview());

