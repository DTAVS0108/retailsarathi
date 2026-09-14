export interface LocalProduct {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  hsn_code: string;
  sale_price: number;
  gst_rate: number;
  stock_qty: number;
  trackSerial?: boolean;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  lowStockThreshold?: number;
  purchase_price?: number;
  purchasePrice?: number;
  mrp?: number | null;
  serials?: Array<{ id?: string; serialNumber: string }>;
}

declare global {
  interface Window {
    retailSarathi: {
      getProducts: () => Promise<LocalProduct[]>;
      saveInvoice: (invoice: unknown) => Promise<unknown>;
      getOutbox: () => Promise<unknown[]>;
      /** Returns count of outbox items waiting to sync */
      getOutboxCount: () => Promise<number>;
      sync: (token: string, apiUrl: string) => Promise<{ pushed: number; pulled?: number }>;
      getSetting: (key: string) => Promise<string | null>;
      setSetting: (key: string, value: string) => Promise<boolean>;
      getJsonSetting: <T = unknown>(key: string) => Promise<T | null>;
      setJsonSetting: (key: string, value: unknown) => Promise<boolean>;
      printThermal: (
        payload:
          | string
          | {
              text?: string;
              escposBase64?: string;
              comPort?: string;
              bluetoothAddress?: string;
              /** Trigger cash-drawer kick pulse after print */
              kickDrawer?: boolean;
            },
      ) => Promise<
        | boolean
        | {
            ok: boolean;
            path: string;
            bytes?: number;
            comWritten?: boolean;
            comPort?: string | null;
            comError?: string | null;
          }
      >;
      /** Open in-app A4 print preview (Print… / Save PDF). Windows OS dialog has no preview. */
      printHtml?: (html: string) => Promise<{ ok: boolean; error?: string }>;
      /** Verify a cashier PIN; returns ok + optional JWT token on success */
      verifyPin: (pin: string) => Promise<{ ok: boolean; token?: string }>;
      /** Returns true if any cashier PINs have been registered on this device */
      hasCashierPins: () => Promise<boolean>;
      /** Register or update a cashier PIN; requires a valid manager token */
      setCashierPin: (params: { label?: string; pin: string; token: string }) => Promise<boolean>;
      clearCashierPins?: () => Promise<boolean>;
      openExternal?: (url: string) => Promise<void>;
      checkForUpdates?: () => Promise<{ available: boolean; version?: string | null } | null>;
      installUpdate?: () => Promise<boolean>;
      setTitle?: (title: string) => Promise<boolean>;
    };
  }
}

export {};
