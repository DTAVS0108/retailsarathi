import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { calculateInvoice } from '@retail-sarathi/gst-engine';
import { generateThermalReceipt } from '@retail-sarathi/ui';
import { createApiFetch } from './api';
import type { ApiFetch } from './api';
import { StatsPanel } from './StatsPanel';
import { ProductsPanel } from './ProductsPanel';
import { InvoicesPanel } from './InvoicesPanel';
import { PartiesPanel } from './PartiesPanel';
import { LedgersPanel } from './LedgersPanel';
import { RepairsPanel } from './RepairsPanel';
import { SettingsPanel } from './SettingsPanel';
import { CustomerFormModal } from './CustomerFormModal';
import { FloatingCalculator, requestOpenCalculator } from './FloatingCalculator';
import { useDesktopPrefs } from './theme/useDesktopPrefs';
import { LAYOUTS } from './theme/prefs';
import { IconCalc, IconSync, IconExpand, IconCompress, NAV_TAB_ICONS, type NavTabId } from './NavIcons';
import { ThemedSelect } from './ThemedSelect';
import { BrandMark } from './BrandMark';
import {
  PAY_METHOD_OPTIONS,
  type ApiProduct,
  type Customer,
  type CartLine,
  type PayRow,
  type HeldBill,
  type BillSlot,
  type PayMethod,
  emptyBillSlot,
} from './pos/types';
import type { MigrationStatus } from './types';
import { normalizeProduct, stateCodeFromGstin, toNum, marginPct, playScanBeep } from './pos/helpers';
import { HeldTab } from './pos/HeldTab';
import { ReturnsTab } from './pos/ReturnsTab';
import { SyncBadge } from './pos/SyncBadge';
import { ShortcutOverlay } from './pos/ShortcutOverlay';
import { PinLogin } from './pos/PinLogin';
import { SerialSearchModal } from './pos/SerialSearchModal';
import { ShiftCloseModal } from './pos/ShiftCloseModal';
import { UpdateBanner } from './pos/UpdateBanner';
import { useToastMessage } from './toast';
import {
  BillPreviewModal,
  EditGraceBanner,
  EDIT_GRACE_MS,
  type EditGraceState,
} from './pos/BillPreviewModal';

// ─── Nav tabs ────────────────────────────────────────────────────────────────
const NAV_TABS = [
  ['bill', 'POS'],
  ['held', 'Held'],
  ['returns', 'Returns'],
  ['invoices', 'Bills'],
  ['repairs', 'Repairs'],
  ['products', 'Products'],
  ['parties', 'Khata'],
  ['ledgers', 'Ledgers'],
  ['stats', 'Stats'],
  ['settings', 'Settings'],
] as const satisfies ReadonlyArray<readonly [NavTabId, string]>;

function RoleGatedMessage() {
  return (
    <div className="flex h-full flex-1 items-center justify-center p-8 text-center">
      <p className="max-w-sm text-sm" style={{ color: 'var(--rs-muted)' }}>
        Ask an owner or manager to view this — sales/stock analytics are restricted to owner and
        manager accounts.
      </p>
    </div>
  );
}

export default function App() {
  // ── Prefs / API ─────────────────────────────────────────────────────────────
  const { prefs, setPrefs, ready: prefsReady } = useDesktopPrefs();
  const layoutMeta = LAYOUTS.find((l) => l.id === prefs.layoutId) ?? LAYOUTS[0];
  const apiFetch = useMemo<ApiFetch>(() => createApiFetch(prefs.apiUrl), [prefs.apiUrl]);

  // ── Auth / view ──────────────────────────────────────────────────────────────
  const [view, setView] = useState<'login' | 'pin' | 'pos'>('login');
  const [tab, setTab] = useState<NavTabId>('bill');
  const [token, setToken] = useState(localStorage.getItem('token') ?? '');
  const [role, setRole] = useState(localStorage.getItem('role') ?? '');
  const canViewAnalytics = role === 'OWNER' || role === 'MANAGER' || !role;
  const [loginMsg, setLoginMsg] = useState('');
  const [msg, setMsg] = useState('');
  const [pinChecked, setPinChecked] = useState(false);
  useToastMessage(msg, setMsg);
  useToastMessage(loginMsg, setLoginMsg);

  // ── Local-DB encryption migration gate ───────────────────────────────────────
  const [migration, setMigration] = useState<MigrationStatus | null>(null);
  const [migrationRetrying, setMigrationRetrying] = useState(false);

  const checkMigrationStatus = useCallback(async (autoRetry: boolean) => {
    const status = await window.retailSarathi.getMigrationStatus();
    if (status.state === 'blocked' && autoRetry && navigator.onLine && token) {
      setMigrationRetrying(true);
      try {
        const retried = await window.retailSarathi.retryMigration(token, prefs.apiUrl);
        setMigration(retried);
      } finally {
        setMigrationRetrying(false);
      }
      return;
    }
    setMigration(status);
  }, [token, prefs.apiUrl]);

  useEffect(() => {
    void checkMigrationStatus(true);
  // Re-checks (and auto-retries) whenever a token becomes available — e.g. right after login —
  // so a blocked-but-not-yet-logged-in device doesn't need a separate manual retry click.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ── Catalog ──────────────────────────────────────────────────────────────────
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [held, setHeld] = useState<HeldBill[]>([]);
  const [sellerState, setSellerState] = useState('27');
  const [shopName, setShopName] = useState(() => localStorage.getItem('rs_desktop_shop_name') ?? '');
  const [shopLogoUrl, setShopLogoUrl] = useState(() => localStorage.getItem('rs_desktop_shop_logo') ?? '');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const label = shopName.trim() || 'RetailSarathi';
    const title = `${label} · RetailSarathi POS`;
    document.title = title;
    void window.retailSarathi.setTitle?.(title);
  }, [shopName]);

  // ── Multi-bill tabs ──────────────────────────────────────────────────────────
  const [bills, setBills] = useState<BillSlot[]>(() => {
    const s = emptyBillSlot('Bill 1');
    return [s];
  });
  const [activeBillId, setActiveBillId] = useState<string>(() => bills[0]!.id);

  // Derived active bill — always valid since we never remove all slots
  const activeBill = bills.find((b) => b.id === activeBillId) ?? bills[0]!;

  const patchActive = useCallback(
    (patch: Partial<BillSlot>) => {
      setBills((prev) => prev.map((b) => (b.id === activeBillId ? { ...b, ...patch } : b)));
    },
    [activeBillId],
  );

  /** Keep tab titles Bill 1…N after add/close so labels never collide. */
  const renumberBills = useCallback((slots: BillSlot[]) => {
    return slots.map((b, i) => ({ ...b, label: `Bill ${i + 1}` }));
  }, []);

  // Convenient aliases from active slot
  const cart = activeBill.cart;
  const customerId = activeBill.customerId;
  const payments = activeBill.payments;
  const loyaltyRedeem = activeBill.loyaltyRedeem;
  const notes = activeBill.notes;
  const heldInvoiceId = activeBill.heldInvoiceId;

  // Functional cart setter (safe against stale closure)
  const setCart = useCallback(
    (updater: CartLine[] | ((prev: CartLine[]) => CartLine[])) => {
      setBills((prev) =>
        prev.map((b) =>
          b.id === activeBillId
            ? { ...b, cart: typeof updater === 'function' ? updater(b.cart) : updater }
            : b,
        ),
      );
    },
    [activeBillId],
  );

  // ── Product picker UI ────────────────────────────────────────────────────────
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCategory, setPickerCategory] = useState('');
  const [pickerBrand, setPickerBrand] = useState('');
  const [pickerGstRate, setPickerGstRate] = useState('all');
  const [pickerStock, setPickerStock] = useState<'all' | 'in' | 'low' | 'out'>('in');

  // ── Customer UI ───────────────────────────────────────────────────────────────
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);

  // ── Returns ───────────────────────────────────────────────────────────────────
  const [returnInvoiceId, setReturnInvoiceId] = useState('');
  const [returnSearch, setReturnSearch] = useState('');
  const [returnLines, setReturnLines] = useState<
    Array<{ id: string; name: string; max: number; qty: string; selected: boolean }>
  >([]);

  // ── Sync state ────────────────────────────────────────────────────────────────
  const [syncing, setSyncing] = useState(false);
  const [outboxPending, setOutboxPending] = useState(0);
  const [outboxFailed, setOutboxFailed] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncStatusText, setSyncStatusText] = useState('');

  // ── Serial picker (inline promise-modal) ──────────────────────────────────────
  const [serialPicker, setSerialPicker] = useState<{
    product: ApiProduct;
    need: number;
    selected: string[];
    resolve: (v: string[] | null) => void;
  } | null>(null);

  // ── Overlay / modal visibility ────────────────────────────────────────────────
  const [serialSearchOpen, setSerialSearchOpen] = useState(false);
  const [shiftCloseOpen, setShiftCloseOpen] = useState(false);
  const [shortcutOpen, setShortcutOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [billFullscreen, setBillFullscreen] = useState(false);
  /** Bill cart list height (px) — user-resizable like notes textarea. */
  const [cartListHeight, setCartListHeight] = useState(280);
  const cartListRef = useRef<HTMLDivElement>(null);
  const [editGrace, setEditGrace] = useState<EditGraceState | null>(null);
  const [graceNow, setGraceNow] = useState(() => Date.now());
  const skipPrintRef = useRef(false);

  // ── Refs ──────────────────────────────────────────────────────────────────────
  const barcodeRef = useRef<HTMLInputElement>(null);
  const paymentsRef = useRef<HTMLDivElement>(null);
  const barcodeBufferRef = useRef<{ chars: string; t0: number }>({ chars: '', t0: 0 });

  // Stable refs so the single keydown listener never goes stale
  const productsRef = useRef(products);
  const activeBillIdRef = useRef(activeBillId);
  const finalizeBillRef = useRef<(hold: boolean, opts?: { skipPrint?: boolean }) => Promise<void>>(
    async () => {},
  );
  const openBillPreviewRef = useRef<() => void>(() => {});
  const addToCartRef = useRef<(product: ApiProduct, qty?: number) => Promise<void>>(async () => {});
  const setMsgRef = useRef(setMsg);

  useEffect(() => { productsRef.current = products; }, [products]);
  useEffect(() => { activeBillIdRef.current = activeBillId; }, [activeBillId]);
  useEffect(() => { setMsgRef.current = setMsg; });

  // ── Computed from active bill ─────────────────────────────────────────────────
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customers, customerId],
  );

  const buyerState =
    selectedCustomer?.stateCode ||
    stateCodeFromGstin(selectedCustomer?.gstin) ||
    sellerState;

  const isIgst = sellerState !== buyerState;

  // Trade-in lines are excluded from GST engine, subtracted from payable
  const regularCart = useMemo(() => cart.filter((l) => !l.isTradeIn), [cart]);
  const tradeInLines = useMemo(() => cart.filter((l) => l.isTradeIn), [cart]);

  const lineInputs = useMemo(
    () =>
      regularCart.map((l) => ({
        productId: l.product.id,
        productName: l.product.name,
        hsnCode: l.product.hsn_code,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        gstRate: l.product.gst_rate,
      })),
    [regularCart],
  );

  const totals = regularCart.length ? calculateInvoice(lineInputs, sellerState, buyerState) : null;
  const redeem = Math.max(0, Math.floor(Number(loyaltyRedeem) || 0));
  const tradeInTotal = tradeInLines.reduce(
    (s, l) => s + Math.abs(toNum(l.unitPrice) * l.quantity),
    0,
  );
  const payable = totals
    ? Math.max(0, Math.round((totals.grandTotal - redeem - tradeInTotal) * 100) / 100)
    : 0;
  const paySum = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 40);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.gstin ?? '').toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [customers, customerQuery]);

  const pickerCategories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category?.trim()) set.add(p.category.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const pickerBrands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (pickerCategory && (p.category ?? '').toLowerCase() !== pickerCategory.toLowerCase()) continue;
      if (p.brand?.trim()) set.add(p.brand.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products, pickerCategory]);

  const pickerFiltered = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    return products.filter((p) => {
      if (pickerCategory && (p.category ?? '').toLowerCase() !== pickerCategory.toLowerCase()) return false;
      if (pickerBrand && (p.brand ?? '').toLowerCase() !== pickerBrand.toLowerCase()) return false;
      if (pickerGstRate !== 'all' && Number(p.gst_rate) !== Number(pickerGstRate)) return false;
      const qty = p.stock_qty;
      const low = p.lowStockThreshold ?? 5;
      if (pickerStock === 'in' && qty <= 0) return false;
      if (pickerStock === 'out' && qty > 0) return false;
      if (pickerStock === 'low' && !(qty > 0 && qty <= low)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.model && p.model.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    });
  }, [products, pickerQuery, pickerCategory, pickerBrand, pickerGstRate, pickerStock]);

  const inStockProducts = useMemo(
    () => products.filter((p) => p.stock_qty > 0),
    [products],
  );

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // PIN check on prefs ready
  useEffect(() => {
    if (!prefsReady || pinChecked) return;
    setPinChecked(true);
    void window.retailSarathi.hasCashierPins().then((has) => {
      if (has && !token) setView('pin');
    }).catch(() => {});
  }, [prefsReady, pinChecked, token]);

  const loadLocalProducts = useCallback(async () => {
    const [items, pendingQty] = await Promise.all([
      window.retailSarathi.getProducts(),
      window.retailSarathi.getPendingQtyByProduct().catch(() => ({}) as Record<string, number>),
    ]);
    setProducts(
      items.map((p) => {
        const normalized = normalizeProduct(p as unknown as Record<string, unknown>);
        const pending = pendingQty[normalized.id] ?? 0;
        // Bills already queued but not yet server-confirmed shouldn't look sellable again.
        return pending > 0 ? { ...normalized, stock_qty: Math.max(0, normalized.stock_qty - pending) } : normalized;
      }),
    );
  }, []);

  const loadOnlineCatalog = useCallback(
    async (tok: string) => {
      const [profile, prodRes, custRes, heldRes] = await Promise.all([
        apiFetch<{ name?: string; stateCode?: string; gstin?: string; logoUrl?: string | null }>(tok, '/tenants/profile').catch(
          (): { name?: string; stateCode?: string; gstin?: string; logoUrl?: string | null } => ({}),
        ),
        apiFetch<{ items: Record<string, unknown>[] }>(tok, '/products?pageSize=500'),
        apiFetch<Customer[]>(tok, '/customers'),
        apiFetch<{ items: HeldBill[] }>(tok, '/invoices?status=DRAFT&pageSize=50'),
      ]);
      const nextShop = (profile.name || '').trim();
      if (nextShop) {
        setShopName(nextShop);
        localStorage.setItem('rs_desktop_shop_name', nextShop);
      }
      const nextLogo = profile.logoUrl ?? '';
      setShopLogoUrl(nextLogo);
      if (nextLogo) localStorage.setItem('rs_desktop_shop_logo', nextLogo);
      else localStorage.removeItem('rs_desktop_shop_logo');
      setSellerState(profile.stateCode || stateCodeFromGstin(profile.gstin) || '27');
      setProducts(prodRes.items.map(normalizeProduct));
      setCustomers(custRes);
      setHeld(heldRes.items ?? []);
    },
    [apiFetch],
  );

  // Load catalog when entering POS view
  useEffect(() => {
    if (view !== 'pos') return;
    void (async () => {
      try {
        if (isOnline && token) {
          await loadOnlineCatalog(token);
          await window.retailSarathi.sync(token, prefs.apiUrl);
          const cnt = await window.retailSarathi.getOutboxCount();
          setOutboxPending(cnt);
          setLastSyncAt(new Date().toISOString());
        } else {
          await loadLocalProducts();
        }
      } catch {
        await loadLocalProducts();
      }
      barcodeRef.current?.focus();
    })();
  }, [view, isOnline, token, loadOnlineCatalog, loadLocalProducts, prefs.apiUrl]);

  // Auto-sync on interval
  useEffect(() => {
    if (!prefsReady || !prefs.autoSyncIntervalMinutes || !token || !isOnline) return;
    const ms = prefs.autoSyncIntervalMinutes * 60_000;
    const id = setInterval(() => {
      void (async () => {
        setSyncing(true);
        try {
          const r = await window.retailSarathi.sync(token, prefs.apiUrl);
          const cnt = await window.retailSarathi.getOutboxCount();
          setOutboxPending(cnt);
          setLastSyncAt(new Date().toISOString());
          setSyncStatusText(`Auto-synced ${r.pushed}`);
          if ((r.pushed ?? 0) > 0 || (r.pulled ?? 0) > 0) await loadOnlineCatalog(token);
        } catch {
          /* silent */
        } finally {
          setSyncing(false);
        }
      })();
    }, ms);
    return () => clearInterval(id);
  }, [prefs.autoSyncIntervalMinutes, prefs.apiUrl, token, isOnline, prefsReady, loadOnlineCatalog]);

  // Keep default payment method in sync with prefs
  useEffect(() => {
    if (!prefsReady) return;
    setBills((prev) =>
      prev.map((b) => {
        if (b.payments.length === 1 && !b.payments[0].amount) {
          return {
            ...b,
            payments: [{ method: prefs.defaultPayMethod as PayMethod, amount: '', reference: '' }],
          };
        }
        return b;
      }),
    );
  }, [prefsReady, prefs.defaultPayMethod]);

  // Bill cart list: taller in fullscreen; remember drag-resize height.
  useEffect(() => {
    setCartListHeight((h) => (billFullscreen ? Math.max(h, 380) : Math.max(h, 240)));
  }, [billFullscreen]);

  useEffect(() => {
    const el = cartListRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const next = Math.round(el.getBoundingClientRect().height);
      if (next >= 120) setCartListHeight(next);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync invoice template to tenant profile
  useEffect(() => {
    if (!prefsReady || !token || !isOnline) return;
    void apiFetch(token, '/tenants/profile', {
      method: 'PATCH',
      body: JSON.stringify({
        defaultInvoiceTemplate: prefs.invoiceTemplateId,
        mobileInvoiceTemplate: prefs.invoiceTemplateId,
      }),
    }).catch(() => null);
  }, [prefs.invoiceTemplateId, prefsReady, token, isOnline, apiFetch]);

  // Auto-fill single payment row with payable amount
  useEffect(() => {
    if (!totals) return;
    setBills((prev) =>
      prev.map((b) => {
        if (b.id !== activeBillId) return b;
        if (b.payments.length === 1) {
          return { ...b, payments: [{ ...b.payments[0], amount: String(payable) }] };
        }
        return b;
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payable]);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = form.get('email') as string;
    const password = form.get('password') as string;
    try {
      const res = await fetch(`${prefs.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.accessToken) {
        const userRole: string = data.user?.role ?? '';
        setToken(data.accessToken);
        setRole(userRole);
        localStorage.setItem('token', data.accessToken);
        localStorage.setItem('role', userRole);
        setView('pos');
        // Offer optional cashier PIN setup
        try {
          const pin = window.prompt('Set a 4–6 digit cashier PIN for quick unlock? (blank to skip)');
          if (pin && /^\d{4,6}$/.test(pin)) {
            await window.retailSarathi.setCashierPin({ label: email, pin, token: data.accessToken, role: userRole });
          }
        } catch {
          /* optional */
        }
        return;
      }
    } catch {
      /* offline */
    }
    const cached = localStorage.getItem('token');
    if (cached) {
      setToken(cached);
      setView('pos');
    } else {
      setLoginMsg('Login failed — need network at least once, or cached token.');
    }
  }

  async function handlePinUnlock(pin: string): Promise<boolean> {
    try {
      const result = await window.retailSarathi.verifyPin(pin);
      if (result.ok) {
        const tok = result.token ?? localStorage.getItem('token') ?? '';
        if (tok) {
          setToken(tok);
          localStorage.setItem('token', tok);
        }
        if (result.role != null) {
          setRole(result.role);
          localStorage.setItem('role', result.role);
        }
        setView('pos');
        return true;
      }
      if (result.lockedForMs) {
        setLoginMsg(`Too many wrong PINs — try again in ${Math.ceil(result.lockedForMs / 1000)}s.`);
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  function pickSerials(product: ApiProduct, need: number, preselected: string[] = []) {
    return new Promise<string[] | null>((resolve) => {
      setSerialPicker({
        product,
        need,
        selected: preselected.slice(0, need),
        resolve: (v) => {
          setSerialPicker(null);
          resolve(v);
        },
      });
    });
  }

  const addToCart = useCallback(
    async (product: ApiProduct, qty = 1) => {
      if (product.stock_qty <= 0 && !product.trackSerial) {
        setMsg(`${product.name} out of stock`);
        return;
      }
      const existingQty = activeBill.cart.find((l) => l.product.id === product.id)?.quantity ?? 0;
      const nextQty = existingQty + qty;
      if (nextQty > product.stock_qty) {
        setMsg(`Only ${product.stock_qty} in stock`);
        return;
      }
      if (product.trackSerial) {
        const picked = await pickSerials(
          product,
          nextQty,
          activeBill.cart.find((l) => l.product.id === product.id)?.serialNumbers ?? [],
        );
        if (!picked) return;
        setCart((prev) => {
          const existing = prev.find((l) => l.product.id === product.id);
          if (existing) {
            return prev.map((l) =>
              l.product.id === product.id ? { ...l, quantity: nextQty, serialNumbers: picked } : l,
            );
          }
          return [...prev, { product, quantity: nextQty, unitPrice: product.sale_price, discount: 0, serialNumbers: picked }];
        });
      } else {
        setCart((prev) => {
          const existing = prev.find((l) => l.product.id === product.id);
          if (existing) {
            return prev.map((l) =>
              l.product.id === product.id ? { ...l, quantity: l.quantity + qty } : l,
            );
          }
          return [...prev, { product, quantity: qty, unitPrice: product.sale_price, discount: 0, serialNumbers: [] }];
        });
      }
      setMsg('');
      if (prefs.soundOnScan) playScanBeep();
      if (prefs.autoFocusBarcode) barcodeRef.current?.focus();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeBill, setCart, prefs.soundOnScan, prefs.autoFocusBarcode],
  );

  // Keep ref current
  useEffect(() => { addToCartRef.current = addToCart; });

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const barcode = barcodeRef.current?.value ?? '';
    const product = products.find(
      (p) => p.barcode === barcode || p.sku.toLowerCase() === barcode.toLowerCase(),
    );
    if (product) void addToCart(product);
    else setMsg(`Product not found: ${barcode}`);
    if (barcodeRef.current) barcodeRef.current.value = '';
  }

  async function updateQty(productId: string, delta: number) {
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;
    const next = line.quantity + delta;
    if (next <= 0) {
      setCart((prev) => prev.filter((l) => l.product.id !== productId));
      return;
    }
    if (next > line.product.stock_qty) {
      setMsg(`Only ${line.product.stock_qty} in stock`);
      return;
    }
    if (line.product.trackSerial) {
      const picked = await pickSerials(line.product, next, line.serialNumbers);
      if (!picked) return;
      setCart((prev) =>
        prev.map((l) =>
          l.product.id === productId ? { ...l, quantity: next, serialNumbers: picked } : l,
        ),
      );
      return;
    }
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, quantity: next } : l)),
    );
  }

  function updateDiscount(productId: string, discount: number) {
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, discount: Math.max(0, discount) } : l)),
    );
  }

  function updateRate(productId: string, unitPrice: number) {
    setCart((prev) =>
      prev.map((l) => (l.product.id === productId ? { ...l, unitPrice: Math.max(0, unitPrice) } : l)),
    );
  }

  function updatePayment(i: number, patch: Partial<PayRow>) {
    patchActive({ payments: payments.map((p, idx) => (idx === i ? { ...p, ...patch } : p)) });
  }

  function addTradeIn() {
    const label = window.prompt('Trade-in description (e.g. iPhone 12 64GB):');
    if (!label?.trim()) return;
    const amountStr = window.prompt(`Trade-in value for "${label}" (₹):`);
    const amount = parseFloat(amountStr ?? '');
    if (!(amount > 0)) {
      setMsg('Invalid trade-in amount');
      return;
    }
    const line: CartLine = {
      product: {
        id: `trade-in-${Date.now()}`,
        name: label.trim(),
        sku: 'TRADE-IN',
        barcode: null,
        hsn_code: '',
        sale_price: 0,
        gst_rate: 0,
        stock_qty: 999,
      },
      quantity: 1,
      unitPrice: -amount,
      discount: 0,
      serialNumbers: [],
      isTradeIn: true,
      tradeInLabel: label.trim(),
    };
    setCart((prev) => [...prev, line]);
  }

  function resumeHeldBill(bill: HeldBill) {
    const lines: CartLine[] = [];
    const dropped: string[] = [];
    const reduced: string[] = [];
    const reserved: Record<string, number> = {};

    for (const l of bill.lines ?? []) {
      const name = l.productName ?? 'Item';
      const p = products.find((x) => x.id === l.productId);
      if (!p) {
        dropped.push(name);
        continue;
      }
      const want = Math.max(1, toNum(l.quantity) || 1);
      const avail = Math.max(0, p.stock_qty - (reserved[p.id] ?? 0));
      if (avail <= 0) {
        dropped.push(name);
        continue;
      }
      const qty = Math.min(want, avail);
      if (qty < want) reduced.push(`${name} (${want}→${qty})`);
      reserved[p.id] = (reserved[p.id] ?? 0) + qty;
      lines.push({
        product: p,
        quantity: qty,
        unitPrice: toNum(l.unitPrice) || p.sale_price,
        discount: toNum(l.discount),
        serialNumbers: Array.isArray(l.serialNumbers) ? l.serialNumbers.slice(0, qty) : [],
      });
    }

    patchActive({
      cart: lines,
      customerId: bill.customer?.id ?? '',
      customerQuery: '',
      notes: bill.notes ?? '',
      loyaltyRedeem: '',
      heldInvoiceId: bill.id,
      payments: [{ method: prefs.defaultPayMethod as PayMethod, amount: '', reference: '' }],
    });
    setCustomerQuery('');
    setCustomerMenuOpen(false);
    setTab('bill');
    if (!lines.length) {
      setMsg(
        dropped.length
          ? `${bill.invoiceNumber}: no sellable stock (removed ${dropped.join(', ')}). Restock or cancel.`
          : `${bill.invoiceNumber}: no sellable lines left`,
      );
      return;
    }
    const notes: string[] = [];
    if (dropped.length) notes.push(`removed OOS: ${dropped.join(', ')}`);
    if (reduced.length) notes.push(`qty cut: ${reduced.join(', ')}`);
    setMsg(
      notes.length
        ? `Resumed ${bill.invoiceNumber} — ${notes.join('; ')}. Review then finalize.`
        : `Resumed ${bill.invoiceNumber} — edit then Finalize`,
    );
  }

  function heldBillHasStockGap(bill: HeldBill) {
    if (!bill.lines?.length) return false;
    for (const l of bill.lines) {
      const p = products.find((x) => x.id === l.productId);
      if (!p || p.stock_qty < (toNum(l.quantity) || 1)) return true;
    }
    return false;
  }

  async function onCustomerCreated(created: Customer) {
    setCustomers((prev) => [created, ...prev.filter((c) => c.id !== created.id)]);
    patchActive({ customerId: created.id, customerQuery: '' });
    setCustomerQuery('');
    setCustomerMenuOpen(false);
    setShowCustomerForm(false);
    setMsg(`Customer ${created.name} added`);
  }

  async function loadReturnInvoice(id: string) {
    if (!token || !id) return;
    try {
      const inv = await apiFetch<{
        lines?: Array<{ id: string; productName: string; quantity: number }>;
      }>(token, `/invoices/${id}`);
      setReturnLines(
        (inv.lines ?? []).map((l) => ({
          id: l.id,
          name: l.productName,
          max: Number(l.quantity),
          qty: String(l.quantity),
          selected: false,
        })),
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function findReturnInvoice() {
    if (!token || !returnSearch.trim()) return;
    const q = returnSearch.trim();
    const looksLikeImei = /^\d{12,}$/.test(q);

    if (!looksLikeImei) {
      try {
        if (q.includes('-') || q.length < 24) {
          const res = await apiFetch<{
            items: Array<{ id: string; invoiceNumber: string; status?: string }>;
          }>(token, `/invoices?search=${encodeURIComponent(q)}&pageSize=10`);
          const match =
            res.items.find((i) => i.invoiceNumber.toLowerCase() === q.toLowerCase()) ??
            res.items.find((i) => (i.status ?? '').toUpperCase() === 'FINALIZED') ??
            res.items[0];
          if (match) {
            setReturnInvoiceId(match.id);
            await loadReturnInvoice(match.id);
            setMsg(`Loaded ${match.invoiceNumber}`);
            return;
          }
        } else {
          setReturnInvoiceId(q);
          await loadReturnInvoice(q);
          return;
        }
      } catch {
        /* fall through to serial search */
      }
    }

    // IMEI / serial fallback
    try {
      const hits = await apiFetch<Array<{ invoiceId?: string; invoiceNumber?: string }>>(
        token,
        `/products/serials/search?q=${encodeURIComponent(q)}`,
      );
      const hit = Array.isArray(hits) ? hits.find((h) => h.invoiceId) : null;
      if (hit?.invoiceId) {
        setReturnInvoiceId(hit.invoiceId);
        await loadReturnInvoice(hit.invoiceId);
        setMsg(
          hit.invoiceNumber ? `Loaded ${hit.invoiceNumber} via serial` : 'Invoice loaded via serial',
        );
      } else {
        setMsg(`No invoice found for "${q}"`);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitReturn() {
    if (!token || !returnInvoiceId) return;
    const lines = returnLines
      .filter((l) => l.selected && Number(l.qty) > 0)
      .map((l) => ({ invoiceLineId: l.id, quantity: Number(l.qty) }));
    if (!lines.length) {
      setMsg('Select return lines');
      return;
    }
    try {
      const cn = await apiFetch<{ invoiceNumber: string }>(token, '/invoices/returns', {
        method: 'POST',
        body: JSON.stringify({ originalInvoiceId: returnInvoiceId, lines }),
      });
      setMsg(`Credit note ${cn.invoiceNumber}`);
      setReturnLines([]);
      setReturnInvoiceId('');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSync() {
    if (!token) return;
    setSyncing(true);
    try {
      const r = await window.retailSarathi.sync(token, prefs.apiUrl);
      const cnt = await window.retailSarathi.getOutboxCount();
      setOutboxPending(cnt);
      setOutboxFailed(r.failed ?? 0);
      setLastSyncAt(new Date().toISOString());
      setSyncStatusText(`Synced ${r.pushed}`);
      await loadOnlineCatalog(token);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }

  /** Build thermal print payload with prefs-based overrides */
  function buildThermalPayload(text: string, escposBase64?: string, btAddr?: string | null) {
    let t = text;
    if (prefs.receiptHeader.trim()) t = prefs.receiptHeader.trim() + '\n' + t;
    if (prefs.receiptFooter.trim()) t = t + '\n' + prefs.receiptFooter.trim();
    return {
      text: t,
      escposBase64,
      comPort: prefs.comPort || undefined,
      bluetoothAddress: (btAddr ?? prefs.bluetoothAddress) || undefined,
      kickDrawer: prefs.kickDrawerAfterPrint,
    };
  }

  const finalizeBill = useCallback(
    async (hold = false, opts?: { skipPrint?: boolean }) => {
      if (!totals || !regularCart.length) return;
      if (hold && prefs.confirmHold) {
        if (!window.confirm('Hold this bill as a draft?')) return;
      }
      for (const l of regularCart) {
        if (l.product.trackSerial && l.serialNumbers.length !== l.quantity) {
          setMsg(`${l.product.name}: pick ${l.quantity} IMEI/serial`);
          return;
        }
      }
      if (!hold && Math.abs(paySum - payable) > 0.05) {
        setMsg(`Payments ₹${paySum} must equal ₹${payable}`);
        return;
      }
      const creditAmt = payments.filter((p) => p.method === 'CREDIT').reduce((s, p) => s + (Number(p.amount) || 0), 0);
      if (!hold && creditAmt > 0) {
        if (!selectedCustomer) { setMsg('Select a customer for CREDIT payment'); return; }
        const limit = toNum(selectedCustomer.creditLimit);
        const outstanding = toNum(selectedCustomer.outstandingBalance);
        if (limit > 0 && outstanding + creditAmt > limit) {
          setMsg(`Credit limit ₹${limit.toLocaleString('en-IN')} exceeded (outstanding ₹${outstanding.toLocaleString('en-IN')})`);
          return;
        }
      }
      if (!hold && redeem > 0) {
        if (!selectedCustomer) { setMsg('Select a customer to redeem loyalty'); return; }
        if (redeem > toNum(selectedCustomer.loyaltyPoints)) {
          setMsg(`Only ${toNum(selectedCustomer.loyaltyPoints)} loyalty points available`);
          return;
        }
      }

      const skipPrint = Boolean(opts?.skipPrint ?? skipPrintRef.current);
      skipPrintRef.current = false;

      const snapshot = {
        cart: cart.map((l) => ({ ...l, serialNumbers: [...l.serialNumbers] })),
        customerId,
        notes,
        payments: payments.map((p) => ({ ...p })),
        loyaltyRedeem,
      };

      const body = {
        customerId: customerId || undefined,
        notes: notes || undefined,
        lines: regularCart.map((l) => ({
          productId: l.product.id,
          productName: l.product.name,
          hsnCode: l.product.hsn_code,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          gstRate: l.product.gst_rate,
          serialNumbers: l.product.trackSerial ? l.serialNumbers : undefined,
        })),
        ...(hold
          ? {}
          : {
              payments: payments
                .filter((p) => Number(p.amount) > 0)
                .map((p) => ({
                  method: p.method,
                  amount: Number(p.amount),
                  reference:
                    p.method === 'EMI' && p.emiProvider
                      ? `EMI:${p.emiProvider}|${p.emiTenureMonths ?? 0}m|DP:${p.emiDownPayment ?? 0}`
                      : p.reference || undefined,
                })),
              loyaltyPointsToRedeem: redeem > 0 ? redeem : undefined,
              status: 'FINALIZED',
            }),
      };

      const resetBill = () => {
        patchActive({
          cart: [],
          customerId: '',
          customerQuery: '',
          notes: '',
          loyaltyRedeem: '',
          heldInvoiceId: null,
          payments: [{ method: prefs.defaultPayMethod as PayMethod, amount: '', reference: '' }],
        });
        setCustomerMenuOpen(false);
        setCustomerQuery('');
      };

      try {
        if (isOnline && token) {
          if (!hold && heldInvoiceId) {
            await apiFetch(token, `/invoices/${heldInvoiceId}/cancel`, { method: 'PATCH' }).catch(() => null);
          }

          const invoice = hold
            ? await apiFetch<{ id: string; invoiceNumber: string }>(token, '/invoices/hold', {
                method: 'POST',
                body: JSON.stringify(body),
              })
            : await apiFetch<{ id: string; invoiceNumber: string }>(token, '/invoices', {
                method: 'POST',
                body: JSON.stringify(body),
              });

          if (!hold) {
            if (!skipPrint) {
              try {
                const job = await apiFetch<{
                  text: string;
                  escposBase64?: string;
                  bluetoothAddress?: string | null;
                }>(token, '/hardware/print-thermal', {
                  method: 'POST',
                  body: JSON.stringify({
                    invoiceId: invoice.id,
                    paperWidth: prefs.thermalWidth,
                    showShopGstin: prefs.showShopGstin,
                    showShopAddress: prefs.showShopAddress,
                    showCustomerOnThermal: prefs.showCustomerOnThermal,
                  }),
                });
                await window.retailSarathi.printThermal(
                  buildThermalPayload(job.text, job.escposBase64, job.bluetoothAddress),
                );
              } catch {
                try {
                  const thermal = await apiFetch<{ text: string; escposBase64?: string }>(
                    token,
                    `/invoices/${invoice.id}/thermal`,
                  );
                  await window.retailSarathi.printThermal(
                    buildThermalPayload(thermal.text, thermal.escposBase64),
                  );
                } catch {
                  const receipt = generateThermalReceipt({
                    shopName: shopName.trim() || 'RetailSarathi',
                    shopAddress: '',
                    invoiceNumber: invoice.invoiceNumber,
                    date: new Date().toISOString().slice(0, 10),
                    lines: totals.lines.map((l) => ({
                      name: l.productName,
                      qty: l.quantity,
                      rate: l.unitPrice,
                      amount: l.total,
                      gstRate: l.gstRate,
                    })),
                    subtotal: totals.subtotal,
                    totalCgst: totals.totalCgst,
                    totalSgst: totals.totalSgst,
                    totalIgst: totals.totalIgst,
                    grandTotal: payable,
                  });
                  await window.retailSarathi.printThermal(buildThermalPayload(receipt as string));
                }
              }
            }

            try {
              await apiFetch(token, `/invoices/${invoice.id}/whatsapp`, { method: 'POST' });
              setMsg(
                skipPrint
                  ? `${invoice.invoiceNumber} saved (no print) · WhatsApp sent`
                  : `${invoice.invoiceNumber} saved · WhatsApp sent`,
              );
            } catch (e) {
              setMsg(
                `${invoice.invoiceNumber} saved${skipPrint ? ' (no print)' : ''} · WhatsApp skipped: ${
                  e instanceof Error ? e.message : String(e)
                }`,
              );
            }

            const hasSerials = regularCart.some(
              (l) => l.product.trackSerial && l.serialNumbers.length > 0,
            );
            if (hasSerials) {
              try {
                await apiFetch(token, `/invoices/${invoice.id}/warranty-cards`, { method: 'POST' });
                setMsg((prev) => prev + ' · Warranty registered');
              } catch {
                /* optional */
              }
            }

            setEditGrace({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              expiresAt: Date.now() + EDIT_GRACE_MS,
              snapshot,
            });
          } else {
            setMsg(`Held ${invoice.invoiceNumber}`);
          }

          setPreviewOpen(false);
          resetBill();
          await loadOnlineCatalog(token);
          return;
        }

        // ── Offline local path ─────────────────────────────────────────────────
        const invoiceNumber = `LOCAL-${Date.now()}`;
        await window.retailSarathi.saveInvoice({
          invoiceNumber,
          // Lets the server dedupe if this exact outbox row is ever pushed more than once
          // (e.g. an interrupted sync retried later) instead of creating a second invoice.
          idempotencyKey: crypto.randomUUID(),
          lines: totals.lines,
          subtotal: totals.subtotal,
          totalCgst: totals.totalCgst,
          totalSgst: totals.totalSgst,
          totalIgst: totals.totalIgst,
          grandTotal: payable,
          payments: (body as { payments?: unknown[] }).payments ?? [{ method: 'CASH', amount: payable }],
          customerId: customerId || undefined,
        });
        if (!skipPrint) {
          const receipt = generateThermalReceipt({
            shopName: `${shopName.trim() || 'RetailSarathi'} (offline)`,
            shopAddress: '',
            invoiceNumber,
            date: new Date().toISOString().slice(0, 10),
            lines: totals.lines.map((l) => ({
              name: l.productName,
              qty: l.quantity,
              rate: l.unitPrice,
              amount: l.total,
              gstRate: l.gstRate,
            })),
            subtotal: totals.subtotal,
            totalCgst: totals.totalCgst,
            totalSgst: totals.totalSgst,
            totalIgst: totals.totalIgst,
            grandTotal: payable,
          });
          await window.retailSarathi.printThermal(buildThermalPayload(receipt as string));
        }
        setPreviewOpen(false);
        resetBill();
        setMsg(`Offline bill ${invoiceNumber}${skipPrint ? ' (no print)' : ''}`);
        await loadLocalProducts();
        if (token) void handleSync();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : String(e));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      totals, regularCart, cart, payments, payable, paySum, redeem, customerId, notes, loyaltyRedeem,
      heldInvoiceId, token, isOnline, apiFetch, prefs, patchActive, loadOnlineCatalog,
      loadLocalProducts, selectedCustomer,
    ],
  );

  // Keep ref current
  useEffect(() => { finalizeBillRef.current = finalizeBill; });

  const openBillPreview = useCallback(() => {
    if (!totals || !regularCart.length) {
      setMsg('Add items to the cart first');
      return;
    }
    for (const l of regularCart) {
      if (l.product.trackSerial && l.serialNumbers.length !== l.quantity) {
        setMsg(`${l.product.name}: pick ${l.quantity} IMEI/serial`);
        return;
      }
    }
    if (Math.abs(paySum - payable) > 0.05) {
      setMsg(`Payments ₹${paySum} must equal ₹${payable}`);
      return;
    }
    setPreviewOpen(true);
  }, [totals, regularCart, paySum, payable]);

  useEffect(() => {
    openBillPreviewRef.current = openBillPreview;
  });

  useEffect(() => {
    if (!editGrace) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setGraceNow(t);
      if (t >= editGrace.expiresAt) setEditGrace(null);
    }, 250);
    return () => window.clearInterval(id);
  }, [editGrace]);

  async function undoAndEditGrace() {
    if (!editGrace || !token) return;
    setPreviewBusy(true);
    try {
      await apiFetch(token, `/invoices/${editGrace.invoiceId}/undo?graceMinutes=5`, {
        method: 'PATCH',
      });
      const snap = editGrace.snapshot;
      patchActive({
        cart: snap.cart,
        customerId: snap.customerId,
        notes: snap.notes,
        payments: snap.payments,
        loyaltyRedeem: snap.loyaltyRedeem,
        heldInvoiceId: null,
        customerQuery: '',
      });
      setCustomerQuery('');
      setCustomerMenuOpen(false);
      setEditGrace(null);
      setTab('bill');
      setMsg(`${editGrace.invoiceNumber} cancelled — edit cart and preview again`);
      await loadOnlineCatalog(token);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
      if (String(e).toLowerCase().includes('expired')) setEditGrace(null);
    } finally {
      setPreviewBusy(false);
    }
  }

  async function finalizeHeld(id: string) {
    if (!token) return;
    const bill = held.find((b) => b.id === id);
    if (bill && heldBillHasStockGap(bill)) {
      resumeHeldBill(bill);
      setMsg('Cannot finalize as-is — out-of-stock lines removed. Review cart, then Preview / Finalize.');
      return;
    }
    try {
      const invoice = await apiFetch<{ invoiceNumber: string }>(
        token,
        `/invoices/${id}/finalize`,
        { method: 'PATCH' },
      );
      setMsg(`Finalized ${invoice.invoiceNumber}`);
      await loadOnlineCatalog(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/insufficient stock/i.test(msg) && bill) {
        resumeHeldBill(bill);
        setMsg(`${msg}. Out-of-stock lines removed — review cart.`);
      } else {
        setMsg(msg);
      }
    }
  }

  async function cancelHeld(id: string) {
    if (!token) return;
    const bill = held.find((b) => b.id === id);
    const label = bill?.invoiceNumber ?? 'draft';
    if (!window.confirm(`Cancel held draft ${label}? This cannot be undone.`)) return;
    try {
      await apiFetch(token, `/invoices/${id}/cancel`, { method: 'PATCH' });
      if (heldInvoiceId === id) {
        patchActive({
          cart: [],
          customerId: '',
          customerQuery: '',
          notes: '',
          loyaltyRedeem: '',
          heldInvoiceId: null,
          payments: [{ method: prefs.defaultPayMethod as PayMethod, amount: '', reference: '' }],
        });
        setCustomerQuery('');
      }
      setHeld((prev) => prev.filter((b) => b.id !== id));
      setMsg(`Cancelled ${label}`);
      await loadOnlineCatalog(token);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Single keyboard listener (empty deps — uses refs) ──────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      // F-keys work regardless of focus
      if (e.key === 'F1') { e.preventDefault(); barcodeRef.current?.focus(); return; }
      if (e.key === 'F2') { e.preventDefault(); setPickerStock('in'); setPickerOpen(true); return; }
      if (e.key === 'F3') { e.preventDefault(); void finalizeBillRef.current(true); return; }
      if (e.key === 'F5') { e.preventDefault(); setTab('held'); return; }
      if (e.key === 'F6') { e.preventDefault(); setSerialSearchOpen(true); return; }
      if (e.key === 'F7') { e.preventDefault(); setTab('returns'); return; }
      if (e.key === 'F8') {
        e.preventDefault();
        const id = activeBillIdRef.current;
        setBills((prev) => prev.map((b) => (b.id === id ? { ...b, cart: [], heldInvoiceId: null } : b)));
        return;
      }
      if (e.key === 'F9') { e.preventDefault(); setShiftCloseOpen(true); return; }
      if (e.key === 'F10') {
        e.preventDefault();
        paymentsRef.current?.scrollIntoView({ behavior: 'smooth' });
        return;
      }
      if (e.key === 'F12') { e.preventDefault(); openBillPreviewRef.current(); return; }
      if (e.ctrlKey && e.key === '/') { e.preventDefault(); setShortcutOpen((p) => !p); return; }
      if (e.key === 'Escape') {
        setPickerOpen(false);
        setShortcutOpen(false);
        setSerialSearchOpen(false);
        setShiftCloseOpen(false);
        setPreviewOpen(false);
        setCustomerMenuOpen(false);
        setBillFullscreen(false);
        return;
      }

      if (inInput) return;

      // Global barcode buffer
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const now = Date.now();
        const buf = barcodeBufferRef.current;
        if (now - buf.t0 > 100) {
          barcodeBufferRef.current = { chars: e.key, t0: now };
        } else {
          barcodeBufferRef.current.chars += e.key;
        }
      } else if (e.key === 'Enter') {
        const { chars } = barcodeBufferRef.current;
        if (chars.length >= 6) {
          const q = chars.trim();
          const hit = productsRef.current.find(
            (p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase(),
          );
          if (hit) void addToCartRef.current(hit);
          else setMsgRef.current(`Not found: ${q}`);
        }
        barcodeBufferRef.current = { chars: '', t0: 0 };
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Local-DB encryption migration gate ───────────────────────────────────────
  // Takes priority over login/PIN/POS: an unsynced offline bill must never be silently discarded
  // by a plaintext→encrypted DB swap, so the whole app waits here until the outbox drains.
  if (migration?.state === 'blocked' && token) {
    return (
      <div className="rs-app flex h-screen items-center justify-center p-6">
        <div className="rs-surface rs-animate-in w-full max-w-md p-8 text-center">
          <BrandMark size={56} title={shopName.trim() || 'RetailSarathi'} logoUrl={shopLogoUrl || null} apiUrl={prefs.apiUrl} />
          <h1 className="rs-display mt-4 text-xl font-bold" style={{ color: 'var(--rs-ink)' }}>
            Enabling secure storage
          </h1>
          <p className="mt-3 text-sm" style={{ color: 'var(--rs-muted)' }}>
            {migration.pendingCount > 0
              ? `${migration.pendingCount} bill(s) still need to sync before this device's local storage can be encrypted.`
              : null}
            {migration.pendingCount > 0 && migration.failedCount > 0 ? ' ' : null}
            {migration.failedCount > 0
              ? `${migration.failedCount} item(s) failed to sync and need to be resolved first (check Settings → Sync).`
              : null}
          </p>
          <p className="mt-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
            Connect to the internet and retry — nothing is lost, the app just won't proceed until every
            bill is safely on the server.
          </p>
          <button
            type="button"
            className="rs-btn-primary mt-5 w-full px-4"
            disabled={migrationRetrying}
            onClick={() => void checkMigrationStatus(true)}
          >
            {migrationRetrying ? 'Retrying…' : 'Retry now'}
          </button>
        </div>
      </div>
    );
  }

  // ── Login view ─────────────────────────────────────────────────────────────
  if (view === 'login') {
    return (
      <div className="rs-app flex h-screen items-center justify-center p-6">
        <form onSubmit={handleLogin} className="rs-surface rs-animate-in w-full max-w-md p-8">
          <div className="flex flex-col items-center text-center">
            <BrandMark
              size={72}
              title={shopName.trim() || 'RetailSarathi'}
              logoUrl={shopLogoUrl || null}
              apiUrl={prefs.apiUrl}
            />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--rs-accent)' }}>
              Desktop POS · RetailSarathi
            </p>
            <h1 className="rs-display mt-2 text-3xl font-bold" style={{ color: 'var(--rs-ink)' }}>
              {shopName.trim() || 'RetailSarathi'}
            </h1>
          </div>
          {loginMsg ? (
            <p className="mt-3 text-sm" style={{ color: 'var(--rs-danger)' }}>{loginMsg}</p>
          ) : null}
          <input name="email" defaultValue="owner@demo.retailsarathi.in" className="rs-input mt-6" placeholder="Email" />
          <input name="password" type="password" defaultValue="Demo@123" className="rs-input mt-3" placeholder="Password" />
          <button type="submit" className="rs-btn-primary mt-5 w-full px-4">Open POS</button>
        </form>
      </div>
    );
  }

  // ── PIN view ───────────────────────────────────────────────────────────────
  if (view === 'pin') {
    return (
      <div className="rs-app flex h-screen items-center justify-center p-6">
        <div className="rs-surface rs-animate-in w-full max-w-sm p-6">
          <PinLogin
            onUnlock={handlePinUnlock}
            onFullLogin={() => setView('login')}
          />
        </div>
      </div>
    );
  }

  // ── POS view ───────────────────────────────────────────────────────────────
  return (
    <div
      className={`rs-app flex h-screen flex-col ${prefs.denseUi ? 'rs-dense' : ''} ${prefs.largeTouchTargets ? 'rs-touch-lg' : ''}`}
    >
      <UpdateBanner />

      {editGrace && editGrace.expiresAt > graceNow ? (
        <EditGraceBanner
          grace={editGrace}
          now={graceNow}
          busy={previewBusy}
          onEdit={() => void undoAndEditGrace()}
          onDismiss={() => setEditGrace(null)}
        />
      ) : null}

      <header className="rs-header flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-3">
          <BrandMark
            size={34}
            title={shopName.trim() || 'RetailSarathi'}
            logoUrl={shopLogoUrl || null}
            apiUrl={prefs.apiUrl}
          />
          <div>
            <h1 className="rs-display text-lg font-bold leading-tight" style={{ color: 'var(--rs-header-ink)' }}>
              {shopName.trim() || 'RetailSarathi'}
            </h1>
            <p className="text-[11px] opacity-80" style={{ color: 'var(--rs-header-ink)' }}>
              Desktop counter · RetailSarathi
            </p>
          </div>
          <SyncBadge
            online={isOnline}
            syncing={syncing}
            pending={outboxPending}
            failed={outboxFailed}
            lastSyncAt={lastSyncAt}
            statusText={syncStatusText}
          />
        </div>

        {!layoutMeta.showRail ? (
          <div className="flex flex-wrap items-center gap-2">
            {NAV_TABS.map(([id, label]) => {
              const Icon = NAV_TAB_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setTab(id); if (id !== 'bill') setBillFullscreen(false); }}
                  className="rs-btn-ghost inline-flex items-center gap-1.5 px-3 text-sm"
                  data-active={tab === id}
                >
                  <Icon size={16} />
                  {label}
                </button>
              );
            })}
            <button type="button" onClick={requestOpenCalculator} className="rs-btn-ghost inline-flex items-center gap-1.5 px-3 text-sm" title="Calculator">
              <IconCalc size={16} />
              Calc
            </button>
            <button type="button" onClick={() => void handleSync()} className="rs-btn-ghost inline-flex items-center gap-1.5 px-3 text-sm">
              <IconSync size={16} />
              Sync
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button type="button" onClick={requestOpenCalculator} className="rs-btn-ghost inline-flex items-center gap-1.5 px-3 text-sm"><IconCalc size={16} />Calc</button>
            <button type="button" onClick={() => void handleSync()} className="rs-btn-ghost inline-flex items-center gap-1.5 px-3 text-sm"><IconSync size={16} />Sync</button>
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        {layoutMeta.showRail ? (
          <nav className="rs-rail" aria-label="Main modules">
            {NAV_TABS.map(([id, label]) => {
              const Icon = NAV_TAB_ICONS[id];
              return (
                <button key={id} type="button" data-active={tab === id} onClick={() => { setTab(id); if (id !== 'bill') setBillFullscreen(false); }} title={label}>
                  <Icon size={20} className="rs-rail-icon" />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">

          {tab === 'stats' ? (
            canViewAnalytics ? (
              <StatsPanel
                token={token}
                apiFetch={apiFetch}
                onFilterCategory={(category) => { setPickerCategory(category); setPickerGstRate('all'); setPickerBrand(''); setPickerStock('all'); setPickerQuery(''); setTab('bill'); setPickerOpen(true); }}
                onFilterGst={(gstRate) => { setPickerGstRate(gstRate); setPickerCategory(''); setPickerBrand(''); setPickerStock('all'); setPickerQuery(''); setTab('bill'); setPickerOpen(true); }}
              />
            ) : (
              <RoleGatedMessage />
            )
          ) : null}

          {tab === 'products' ? (
            <ProductsPanel
              token={token}
              apiFetch={apiFetch}
              onCatalogChanged={async () => {
                try {
                  await loadOnlineCatalog(token);
                  await handleSync();
                } catch { /* panel already refreshed */ }
              }}
            />
          ) : null}

          {tab === 'parties' ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              <PartiesPanel token={token} apiFetch={apiFetch} />
            </div>
          ) : null}
          {tab === 'ledgers' ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              {canViewAnalytics ? (
                <LedgersPanel
                  token={token}
                  apiFetch={apiFetch}
                  onOpenKhata={() => setTab('parties')}
                  invoiceTemplateId={prefs.invoiceTemplateId}
                  apiUrl={prefs.apiUrl}
                />
              ) : (
                <RoleGatedMessage />
              )}
            </div>
          ) : null}
          {tab === 'repairs' ? (
            <div className="min-h-0 flex-1 overflow-hidden" style={{ background: 'var(--rs-bg-deep)' }}>
              <RepairsPanel
                token={token}
                apiFetch={apiFetch}
                printOpts={{
                  thermalWidth: prefs.thermalWidth,
                  showShopGstin: prefs.showShopGstin,
                  showShopAddress: prefs.showShopAddress,
                  showCustomerOnThermal: prefs.showCustomerOnThermal,
                  comPort: prefs.comPort || undefined,
                  bluetoothAddress: prefs.bluetoothAddress || undefined,
                  kickDrawer: prefs.kickDrawerAfterPrint,
                }}
              />
            </div>
          ) : null}
          {tab === 'settings' ? (
            <SettingsPanel
              prefs={prefs}
              onChange={setPrefs}
              token={token}
              apiFetch={apiFetch}
              onProfileChange={({ shopName: name, logoUrl }) => {
                if (name) {
                  setShopName(name);
                  localStorage.setItem('rs_desktop_shop_name', name);
                }
                setShopLogoUrl(logoUrl ?? '');
                if (logoUrl) localStorage.setItem('rs_desktop_shop_logo', logoUrl);
                else localStorage.removeItem('rs_desktop_shop_logo');
              }}
            />
          ) : null}
          {tab === 'invoices' ? (
            <div className="min-h-0 flex-1 overflow-hidden" style={{ background: 'var(--rs-bg-deep)' }}>
              <InvoicesPanel
                token={token}
                apiFetch={apiFetch}
                invoiceTemplateId={prefs.invoiceTemplateId}
                printOpts={{
                  thermalWidth: prefs.thermalWidth,
                  showShopGstin: prefs.showShopGstin,
                  showShopAddress: prefs.showShopAddress,
                  showCustomerOnThermal: prefs.showCustomerOnThermal,
                  comPort: prefs.comPort || undefined,
                  bluetoothAddress: prefs.bluetoothAddress || undefined,
                  kickDrawer: prefs.kickDrawerAfterPrint,
                }}
              />
            </div>
          ) : null}

          {tab === 'held' ? (
            <HeldTab
              held={held}
              products={products}
              onResume={resumeHeldBill}
              onFinalize={(id) => void finalizeHeld(id)}
              onCancel={(id) => void cancelHeld(id)}
            />
          ) : null}

          {tab === 'returns' ? (
            <ReturnsTab
              returnSearch={returnSearch}
              setReturnSearch={setReturnSearch}
              returnLines={returnLines}
              setReturnLines={setReturnLines}
              onFind={() => void findReturnInvoice()}
              onSubmit={() => void submitReturn()}
              onSerialSearch={() => setSerialSearchOpen(true)}
            />
          ) : null}

          {tab === 'bill' ? (
            <div
              className="flex min-h-0 flex-1 overflow-hidden"
              style={{ flexDirection: layoutMeta.direction }}
            >
              {/* ── Catalog pane (hidden in bill fullscreen) ─────────────── */}
              {!billFullscreen ? (
              <div
                className="min-h-0 overflow-y-auto border-r p-4"
                style={{ flex: layoutMeta.catalogFlex, background: 'var(--rs-surface)', borderColor: 'var(--rs-border)' }}
              >
                <form onSubmit={handleBarcodeSubmit} className="mb-3">
                  <input
                    ref={barcodeRef}
                    placeholder="Scan barcode or type SKU… (F12 preview)"
                    className="rs-input font-mono text-lg"
                    style={{ minHeight: 'var(--rs-touch)', borderWidth: 2 }}
                    autoFocus
                  />
                </form>
                <div className="mb-3 flex gap-2">
                  <button
                    type="button"
                    className="rs-btn-primary flex-1 px-4"
                    onClick={() => { setPickerQuery(''); setPickerCategory(''); setPickerBrand(''); setPickerStock('in'); setPickerOpen(true); }}
                  >
                    Browse products · F2
                  </button>
                  <button type="button" className="rs-btn-ghost px-3 text-sm" onClick={addTradeIn} title="Add trade-in deduction">
                    Trade-in
                  </button>
                </div>
                <p className="mb-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
                  {inStockProducts.length} in stock
                  {products.length !== inStockProducts.length
                    ? ` · ${products.length - inStockProducts.length} out of stock hidden`
                    : null}
                </p>
                <div className="grid gap-2">
                  {inStockProducts.slice(0, prefs.catalogPreviewCount).map((p) => {
                    const margin = marginPct(p.sale_price, toNum(p.purchasePrice ?? p.purchase_price));
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => void addToCart(p)}
                        className="flex items-center justify-between border p-3 text-left transition hover:opacity-95"
                        style={{ borderRadius: 'calc(var(--rs-radius) - 4px)', borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
                      >
                        <div>
                          <div className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                            {p.name}
                            {p.trackSerial ? (
                              <span className="ml-1.5 text-xs" style={{ color: 'var(--rs-warn)' }}>IMEI</span>
                            ) : null}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                            {p.sku} · Stock: {p.stock_qty}
                            {margin !== null ? (
                              <span
                                className="ml-2"
                                style={{ color: margin < 0 ? 'var(--rs-danger)' : 'var(--rs-muted)' }}
                              >
                                {margin > 0 ? '+' : ''}{margin}%
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="font-semibold" style={{ color: 'var(--rs-accent)' }}>
                          ₹{p.sale_price.toLocaleString('en-IN')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              ) : null}

              {/* ── Cart / bill pane ──────────────────────────────────────── */}
              <div
                className="flex min-h-0 flex-col overflow-y-auto p-4"
                style={{
                  flex: billFullscreen ? 1 : layoutMeta.cartFlex,
                  background: 'var(--rs-bg-deep)',
                  minWidth: 0,
                }}
              >
                {billFullscreen ? (
                  <form onSubmit={handleBarcodeSubmit} className="mb-2 flex gap-2">
                    <input
                      ref={barcodeRef}
                      placeholder="Scan barcode or SKU… (F2 browse · Esc exit full)"
                      className="rs-input min-w-0 flex-1 font-mono text-base"
                      style={{ minHeight: 40, borderWidth: 2 }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rs-btn-secondary shrink-0 text-sm"
                      onClick={() => { setPickerQuery(''); setPickerStock('in'); setPickerOpen(true); }}
                    >
                      F2
                    </button>
                    <button type="button" className="rs-btn-ghost shrink-0 text-sm" onClick={addTradeIn} title="Trade-in">
                      Trade-in
                    </button>
                  </form>
                ) : null}

                {/* Multi-bill tabs */}
                <div className="mb-2 flex items-center gap-1 border-b" style={{ borderColor: 'var(--rs-border)' }}>
                  {bills.map((b) => {
                    const dirty =
                      b.cart.length > 0 ||
                      Boolean(b.customerId) ||
                      Boolean(b.notes) ||
                      Boolean(b.heldInvoiceId) ||
                      Boolean(b.loyaltyRedeem);
                    const isFs = billFullscreen && b.id === activeBillId;
                    return (
                      <div
                        key={b.id}
                        className="flex items-center gap-0.5"
                        style={{
                          borderBottom:
                            b.id === activeBillId ? '2px solid var(--rs-accent)' : '2px solid transparent',
                          marginBottom: -1,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setActiveBillId(b.id);
                            setCustomerMenuOpen(false);
                            setCustomerQuery('');
                          }}
                          className="px-2.5 py-2 text-sm font-medium transition"
                          style={{
                            color: b.id === activeBillId ? 'var(--rs-accent)' : 'var(--rs-muted)',
                          }}
                        >
                          {b.label}
                          {b.cart.length > 0 ? ` (${b.cart.length})` : ''}
                        </button>
                        <button
                          type="button"
                          className="rounded p-1"
                          style={{ color: isFs ? 'var(--rs-accent)' : 'var(--rs-muted)' }}
                          title={isFs ? `Exit full screen (${b.label})` : `Full screen ${b.label}`}
                          aria-label={isFs ? `Exit full screen ${b.label}` : `Full screen ${b.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveBillId(b.id);
                            setCustomerMenuOpen(false);
                            setCustomerQuery('');
                            setBillFullscreen((prev) => (b.id === activeBillId ? !prev : true));
                          }}
                        >
                          {isFs ? <IconCompress size={14} /> : <IconExpand size={14} />}
                        </button>
                        {bills.length > 1 ? (
                          <button
                            type="button"
                            className="mr-1 rounded px-1 py-0.5 text-xs leading-none"
                            style={{ color: 'var(--rs-muted)' }}
                            title={`Close ${b.label}`}
                            aria-label={`Close ${b.label}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (dirty && !window.confirm(`Close ${b.label}? Unsaved items will be cleared.`)) {
                                return;
                              }
                              setBills((prev) => {
                                const idx = prev.findIndex((x) => x.id === b.id);
                                const next = renumberBills(prev.filter((x) => x.id !== b.id));
                                if (b.id === activeBillId) {
                                  const fallback = next[Math.max(0, idx - 1)] ?? next[0];
                                  setActiveBillId(fallback!.id);
                                  setCustomerQuery('');
                                  setCustomerMenuOpen(false);
                                  setBillFullscreen(false);
                                }
                                return next;
                              });
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  {bills.length < 4 ? (
                    <button
                      type="button"
                      className="px-3 py-2 text-sm font-bold"
                      style={{ color: 'var(--rs-accent)' }}
                      onClick={() => {
                        const s = emptyBillSlot('Bill', prefs.defaultPayMethod as PayMethod);
                        setBills((prev) => {
                          const next = renumberBills([...prev, s]);
                          setActiveBillId(s.id);
                          return next;
                        });
                      }}
                    >
                      +
                    </button>
                  ) : null}
                  {billFullscreen ? (
                    <button
                      type="button"
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold"
                      style={{ color: 'var(--rs-accent)' }}
                      title="Exit full screen (Esc)"
                      onClick={() => setBillFullscreen(false)}
                    >
                      <IconCompress size={14} />
                      Exit full
                    </button>
                  ) : null}
                </div>

                <div className="mb-1 flex items-center justify-between gap-2">
                  <h2 className="rs-display text-base font-semibold" style={{ color: 'var(--rs-ink)' }}>
                    {activeBill.label}
                    {heldInvoiceId ? (
                      <span className="ml-2 text-xs font-semibold" style={{ color: 'var(--rs-warn)' }}>
                        Editing held draft
                      </span>
                    ) : null}
                    {billFullscreen ? (
                      <span className="ml-2 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
                        Full screen
                      </span>
                    ) : null}
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rs-btn-ghost inline-flex items-center gap-1 px-2 text-xs"
                      style={{ minHeight: 32 }}
                      title={billFullscreen ? 'Exit full screen (Esc)' : 'Full screen bill'}
                      onClick={() => setBillFullscreen((v) => !v)}
                    >
                      {billFullscreen ? <IconCompress size={16} /> : <IconExpand size={16} />}
                      {billFullscreen ? 'Exit' : 'Full'}
                    </button>
                    <button
                    type="button"
                    className="rs-btn-secondary text-xs"
                    style={{ minHeight: 32 }}
                    title="Clear this bill"
                    onClick={() => {
                      if (
                        !cart.length &&
                        !customerId &&
                        !notes &&
                        !heldInvoiceId &&
                        !loyaltyRedeem
                      ) {
                        setMsg('Bill is already empty');
                        return;
                      }
                      const confirmMsg = heldInvoiceId
                        ? `Clear ${activeBill.label} and cancel the held draft on the server?`
                        : `Clear all items on ${activeBill.label}?`;
                      if (!window.confirm(confirmMsg)) return;
                      const draftId = heldInvoiceId;
                      patchActive({
                        cart: [],
                        customerId: '',
                        customerQuery: '',
                        notes: '',
                        loyaltyRedeem: '',
                        heldInvoiceId: null,
                        payments: [
                          {
                            method: prefs.defaultPayMethod as PayMethod,
                            amount: '',
                            reference: '',
                          },
                        ],
                      });
                      setCustomerQuery('');
                      setCustomerMenuOpen(false);
                      if (draftId && token) {
                        void apiFetch(token, `/invoices/${draftId}/cancel`, { method: 'PATCH' })
                          .then(() => {
                            setHeld((prev) => prev.filter((b) => b.id !== draftId));
                            setMsg(`${activeBill.label} cleared · draft cancelled`);
                          })
                          .catch((e) => {
                            setMsg(
                              e instanceof Error
                                ? e.message
                                : `${activeBill.label} cleared (draft cancel failed)`,
                            );
                          });
                      } else {
                        setMsg(`${activeBill.label} cleared`);
                      }
                    }}
                  >
                    Reset bill
                  </button>
                  </div>
                </div>

                {/* Customer — select from list or quick-add */}
                <div className="relative mb-2">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
                      Customer
                    </label>
                    <button
                      type="button"
                      className="text-xs font-semibold"
                      style={{ color: 'var(--rs-accent)' }}
                      onClick={() => {
                        setCustomerMenuOpen(false);
                        setShowCustomerForm(true);
                      }}
                    >
                      + Add new
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      className="rs-input min-w-0 flex-1 text-sm"
                      placeholder="Search name, phone, or GSTIN…"
                      value={
                        customerMenuOpen || customerQuery
                          ? customerQuery
                          : selectedCustomer
                            ? `${selectedCustomer.name} · ${selectedCustomer.phone}`
                            : 'Walk-in'
                      }
                      onChange={(e) => { setCustomerQuery(e.target.value); setCustomerMenuOpen(true); }}
                      onFocus={() => { setCustomerMenuOpen(true); setCustomerQuery(''); }}
                    />
                    {customerId ? (
                      <button
                        type="button"
                        className="rs-btn-secondary shrink-0 px-3 text-xs"
                        title="Clear customer"
                        onClick={() => {
                          patchActive({ customerId: '', customerQuery: '', loyaltyRedeem: '' });
                          setCustomerQuery('');
                          setCustomerMenuOpen(false);
                        }}
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  {customerMenuOpen ? (
                    <div
                      className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-xl border shadow-lg"
                      style={{ background: 'var(--rs-surface)', borderColor: 'var(--rs-border)' }}
                    >
                      <button
                        type="button"
                        className="block w-full border-b px-3 py-2.5 text-left text-sm"
                        style={{ borderColor: 'var(--rs-border)', color: 'var(--rs-muted)' }}
                        onClick={() => {
                          patchActive({ customerId: '', customerQuery: '', loyaltyRedeem: '' });
                          setCustomerQuery('');
                          setCustomerMenuOpen(false);
                        }}
                      >
                        Walk-in (no customer on bill)
                      </button>
                      {filteredCustomers.length === 0 ? (
                        <p className="px-3 py-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
                          No matches — use quick add below
                        </p>
                      ) : (
                        filteredCustomers.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="block w-full px-3 py-2.5 text-left text-sm hover:opacity-90"
                            style={{
                              background:
                                c.id === customerId
                                  ? 'color-mix(in srgb, var(--rs-accent) 12%, transparent)'
                                  : undefined,
                            }}
                            onClick={() => {
                              patchActive({ customerId: c.id, customerQuery: '', loyaltyRedeem: '' });
                              setCustomerQuery('');
                              setCustomerMenuOpen(false);
                            }}
                          >
                            <span className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                              {c.name}
                            </span>
                            <span className="ml-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
                              {c.phone}
                              {c.gstin ? ` · ${c.gstin}` : ''}
                            </span>
                          </button>
                        ))
                      )}
                      <div className="sticky bottom-0 border-t p-3" style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}>
                        <p className="mb-1.5 text-[10px] font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
                          New customer
                        </p>
                        <button
                          type="button"
                          className="rs-btn-primary w-full text-xs"
                          onClick={() => {
                            setCustomerMenuOpen(false);
                            setShowCustomerForm(true);
                          }}
                        >
                          + Add customer (full form)
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                {selectedCustomer ? (
                  <div className="mb-2 flex flex-wrap gap-2 rounded-xl border px-3 py-2 text-xs" style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface)' }}>
                    {selectedCustomer.segment ? <span style={{ color: 'var(--rs-accent)' }}>{selectedCustomer.segment}</span> : null}
                    {toNum(selectedCustomer.loyaltyPoints) > 0 ? <span>Loyalty {selectedCustomer.loyaltyPoints}</span> : null}
                    {toNum(selectedCustomer.creditLimit) > 0 ? (
                      <span>Credit left ₹{(toNum(selectedCustomer.creditLimit) - toNum(selectedCustomer.outstandingBalance)).toLocaleString('en-IN')}</span>
                    ) : null}
                    {isIgst ? (
                      <span style={{ color: 'var(--rs-warn)' }}>IGST · buyer {buyerState}</span>
                    ) : (
                      <span style={{ color: 'var(--rs-muted)' }}>CGST+SGST · {sellerState}</span>
                    )}
                  </div>
                ) : null}

                {selectedCustomer && toNum(selectedCustomer.loyaltyPoints) > 0 ? (
                  <input
                    className="rs-input mb-2 text-sm"
                    placeholder={`Loyalty redeem (max ${selectedCustomer.loyaltyPoints})`}
                    value={loyaltyRedeem}
                    onChange={(e) => patchActive({ loyaltyRedeem: e.target.value })}
                  />
                ) : null}

                {/* Cart lines — resizable height (like bill notes) */}
                <div className="mb-1 mt-1 flex shrink-0 items-center justify-between gap-2">
                  <span
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: 'var(--rs-muted)' }}
                  >
                    Items{cart.length ? ` · ${cart.length}` : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs font-semibold"
                      style={{ color: 'var(--rs-accent)' }}
                      title="Make item list taller"
                      onClick={() =>
                        setCartListHeight((h) =>
                          Math.min(Math.round(window.innerHeight * 0.7), h + (billFullscreen ? 120 : 80)),
                        )
                      }
                    >
                      Expand
                    </button>
                    <button
                      type="button"
                      className="text-xs font-semibold"
                      style={{ color: 'var(--rs-muted)' }}
                      title="Compact item list"
                      onClick={() => setCartListHeight(billFullscreen ? 240 : 180)}
                    >
                      Compact
                    </button>
                  </div>
                </div>
                <div
                  ref={cartListRef}
                  className="space-y-2 overflow-y-auto rounded-xl border p-2"
                  style={{
                    borderColor: 'var(--rs-border)',
                    background: 'var(--rs-surface)',
                    height: cartListHeight,
                    minHeight: billFullscreen ? 220 : 160,
                    maxHeight: billFullscreen ? '70vh' : '55vh',
                    resize: 'vertical',
                    flexShrink: 0,
                  }}
                >
                  {cart.map((l) => {
                    const lineTotal = l.isTradeIn
                      ? -Math.abs(l.unitPrice * l.quantity)
                      : Math.max(0, l.unitPrice * l.quantity - l.discount);
                    const margin = !l.isTradeIn
                      ? marginPct(l.unitPrice, toNum(l.product.purchasePrice ?? l.product.purchase_price))
                      : null;
                    const belowCost = !l.isTradeIn && l.unitPrice < toNum(l.product.purchasePrice ?? l.product.purchase_price) && toNum(l.product.purchasePrice ?? l.product.purchase_price) > 0;
                    return (
                      <div key={l.product.id} className="rs-card p-3" style={l.isTradeIn ? { borderColor: 'var(--rs-warn)' } : undefined}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium" style={{ color: l.isTradeIn ? 'var(--rs-warn)' : 'var(--rs-ink)' }}>
                              {l.isTradeIn ? '↩ ' : ''}{l.product.name}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                              {l.isTradeIn ? 'Trade-in deduction' : `${l.product.gst_rate}% GST`}
                              {margin !== null ? (
                                <span className="ml-2" style={{ color: belowCost ? 'var(--rs-danger)' : 'var(--rs-muted)' }}>
                                  {belowCost ? '⚠ below cost · ' : ''}{margin > 0 ? '+' : ''}{margin}%
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="text-xs font-semibold"
                            style={{ color: 'var(--rs-danger)' }}
                            onClick={() => setCart((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                          >
                            Remove
                          </button>
                        </div>
                        {l.product.trackSerial ? (
                          <p className="mt-1 text-xs" style={{ color: 'var(--rs-warn)' }}>
                            IMEI: {l.serialNumbers.join(', ') || 'not selected'}{' '}
                            <button
                              type="button"
                              className="underline"
                              onClick={() =>
                                void pickSerials(l.product, l.quantity, l.serialNumbers).then((picked) => {
                                  if (!picked) return;
                                  setCart((prev) =>
                                    prev.map((x) => x.product.id === l.product.id ? { ...x, serialNumbers: picked } : x),
                                  );
                                })
                              }
                            >
                              Pick
                            </button>
                          </p>
                        ) : null}
                        {!l.isTradeIn ? (
                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <div className="flex items-center rounded-lg border" style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}>
                              <button type="button" className="h-8 w-8 font-semibold" onClick={() => void updateQty(l.product.id, -1)}>−</button>
                              <span className="min-w-[1.75rem] text-center text-sm font-semibold">{l.quantity}</span>
                              <button type="button" className="h-8 w-8 font-semibold" onClick={() => void updateQty(l.product.id, 1)}>+</button>
                            </div>
                            <label className="text-xs">
                              <span style={{ color: 'var(--rs-muted)' }}>Rate ₹</span>
                              <input className="rs-input mt-0.5 w-24 py-1 text-right text-sm" type="number" min={0} step="0.01" value={l.unitPrice} onChange={(e) => updateRate(l.product.id, toNum(e.target.value))} />
                            </label>
                            <label className="text-xs">
                              <span style={{ color: 'var(--rs-muted)' }}>Disc ₹</span>
                              <input className="rs-input mt-0.5 w-20 py-1 text-right text-sm" type="number" min={0} step="0.01" value={l.discount} onChange={(e) => updateDiscount(l.product.id, toNum(e.target.value))} />
                            </label>
                            <span className="ml-auto font-semibold tabular-nums">₹{lineTotal.toLocaleString('en-IN')}</span>
                          </div>
                        ) : (
                          <div className="mt-1 font-semibold tabular-nums" style={{ color: 'var(--rs-warn)' }}>
                            −₹{Math.abs(lineTotal).toLocaleString('en-IN')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {cart.length === 0 ? (
                    <p className="mt-8 text-center" style={{ color: 'var(--rs-muted)' }}>
                      Scan or click products to add
                    </p>
                  ) : null}
                </div>

                <textarea
                  className="rs-input mt-2 min-h-[2.5rem] resize-y text-sm"
                  placeholder="Bill notes (optional)"
                  value={notes}
                  onChange={(e) => patchActive({ notes: e.target.value })}
                  rows={2}
                />

                {/* Payments */}
                <div ref={paymentsRef} className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Split pay</span>
                    <button
                      type="button"
                      style={{ color: 'var(--rs-accent)' }}
                      onClick={() => patchActive({ payments: [...payments, { method: 'UPI' as PayMethod, amount: '', reference: '' }] })}
                    >
                      + Add
                    </button>
                  </div>
                  {payments.map((row, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex flex-wrap gap-2">
                        <ThemedSelect
                          className="w-auto min-w-[8.5rem] text-sm"
                          aria-label="Payment method"
                          menuPlacement="top"
                          value={row.method}
                          options={PAY_METHOD_OPTIONS}
                          onChange={(v) => updatePayment(i, { method: v as PayMethod })}
                        />
                        <input
                          className="rs-input min-w-[5rem] flex-1 py-2 text-sm"
                          placeholder="Amount"
                          value={row.amount}
                          onChange={(e) => updatePayment(i, { amount: e.target.value })}
                        />
                        <input
                          className="rs-input min-w-[6rem] flex-1 py-2 text-sm"
                          placeholder="Ref (UPI/UTR)"
                          value={row.reference}
                          onChange={(e) => updatePayment(i, { reference: e.target.value })}
                        />
                        {payments.length > 1 ? (
                          <button
                            type="button"
                            className="text-xs"
                            style={{ color: 'var(--rs-danger)' }}
                            onClick={() => patchActive({ payments: payments.filter((_, idx) => idx !== i) })}
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                      {row.method === 'EMI' ? (
                        <div className="flex flex-wrap gap-2 pl-1">
                          <input
                            className="rs-input w-32 py-1 text-xs"
                            placeholder="Provider (Bajaj…)"
                            value={row.emiProvider ?? ''}
                            onChange={(e) => updatePayment(i, { emiProvider: e.target.value })}
                          />
                          <input
                            className="rs-input w-20 py-1 text-xs"
                            placeholder="Months"
                            value={row.emiTenureMonths ?? ''}
                            onChange={(e) => updatePayment(i, { emiTenureMonths: e.target.value })}
                          />
                          <input
                            className="rs-input w-28 py-1 text-xs"
                            placeholder="Down payment ₹"
                            value={row.emiDownPayment ?? ''}
                            onChange={(e) => updatePayment(i, { emiDownPayment: e.target.value })}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                {/* Totals & finalize */}
                {totals ? (
                  <div className="rs-card mt-4 p-4">
                    <div className="flex justify-between text-sm">
                      <span style={{ color: 'var(--rs-muted)' }}>Subtotal</span>
                      <span>₹{totals.subtotal.toFixed(2)}</span>
                    </div>
                    {isIgst ? (
                      <div className="flex justify-between text-sm">
                        <span style={{ color: 'var(--rs-muted)' }}>IGST</span>
                        <span>₹{totals.totalIgst.toFixed(2)}</span>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: 'var(--rs-muted)' }}>CGST</span>
                          <span>₹{totals.totalCgst.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: 'var(--rs-muted)' }}>SGST</span>
                          <span>₹{totals.totalSgst.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    {tradeInTotal > 0 ? (
                      <div className="flex justify-between text-sm" style={{ color: 'var(--rs-warn)' }}>
                        <span>Trade-in</span>
                        <span>−₹{tradeInTotal.toFixed(2)}</span>
                      </div>
                    ) : null}
                    {redeem > 0 ? (
                      <div className="flex justify-between text-sm" style={{ color: 'var(--rs-success)' }}>
                        <span>Loyalty</span>
                        <span>−₹{redeem.toFixed(2)}</span>
                      </div>
                    ) : null}
                    <div className="mt-2 flex justify-between border-t pt-2 text-lg font-bold" style={{ borderColor: 'var(--rs-border)' }}>
                      <span>Payable</span>
                      <span style={{ color: 'var(--rs-accent)' }}>₹{payable.toFixed(2)}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => openBillPreview()}
                      className="mt-4 w-full rounded-lg py-3 font-bold text-white"
                      style={{ background: 'var(--rs-warn)' }}
                    >
                      Preview &amp; submit (F12)
                    </button>
                    <button
                      type="button"
                      onClick={() => void finalizeBill(true)}
                      className="mt-2 w-full border py-2 font-semibold"
                      style={{ borderColor: 'var(--rs-accent)', color: 'var(--rs-accent)', borderRadius: 'calc(var(--rs-radius) - 4px)', background: 'transparent' }}
                    >
                      Hold bill (F3)
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Product picker modal */}
          {pickerOpen ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="flex max-h-[90vh] w-full max-w-4xl flex-col shadow-xl" style={{ borderRadius: 'var(--rs-radius)', background: 'var(--rs-surface)', border: '1px solid var(--rs-border)', color: 'var(--rs-ink)' }}>
                <div className="flex items-center justify-between border-b px-5 py-3" style={{ borderColor: 'var(--rs-border)' }}>
                  <div>
                    <h3 className="rs-display text-lg font-semibold">Browse products</h3>
                    <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>Filter by GST, category, brand, or stock</p>
                  </div>
                  <button type="button" className="rounded border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--rs-border)', color: 'var(--rs-ink)' }} onClick={() => setPickerOpen(false)}>Close</button>
                </div>
                <div className="space-y-2 border-b px-5 py-3" style={{ borderColor: 'var(--rs-border)' }}>
                  <input className="rs-input" placeholder="Search name, SKU, barcode, brand…" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} autoFocus />
                  <div className="flex flex-wrap gap-1.5">
                    {['all', '0', '5', '12', '18', '28', '40'].map((rate) => (
                      <button key={rate} type="button" onClick={() => setPickerGstRate(rate)} className="rounded-full px-2.5 py-1 text-xs font-medium"
                        style={pickerGstRate === rate ? { background: 'var(--rs-accent)', color: 'var(--rs-on-accent)' } : { border: '1px solid var(--rs-border)', background: 'var(--rs-surface)', color: 'var(--rs-ink)' }}
                      >
                        {rate === 'all' ? 'All GST' : `${rate}%`}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <ThemedSelect className="text-sm" aria-label="Category" value={pickerCategory} options={[{ value: '', label: 'All categories' }, ...pickerCategories.map((c) => ({ value: c, label: c }))]} onChange={(v) => { setPickerCategory(v); setPickerBrand(''); }} />
                    <ThemedSelect className="text-sm" aria-label="Brand" value={pickerBrand} options={[{ value: '', label: 'All brands' }, ...pickerBrands.map((b) => ({ value: b, label: b }))]} onChange={setPickerBrand} />
                    <ThemedSelect className="text-sm" aria-label="Stock" value={pickerStock} options={[{ value: 'all', label: 'All stock' }, { value: 'in', label: 'In stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }]} onChange={(v) => setPickerStock(v as typeof pickerStock)} />
                  </div>
                  <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>Showing {pickerFiltered.length} of {products.length}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {pickerFiltered.map((p) => {
                      const margin = marginPct(p.sale_price, toNum(p.purchasePrice ?? p.purchase_price));
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={p.stock_qty <= 0}
                          onClick={() => { void addToCart(p); setPickerOpen(false); }}
                          className="flex items-center justify-between border p-3 text-left disabled:opacity-50"
                          style={{ borderRadius: 'calc(var(--rs-radius) - 4px)', borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
                        >
                          <div>
                            <div className="font-medium" style={{ color: 'var(--rs-ink)' }}>{p.name}</div>
                            <div className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                              {p.sku}{p.brand ? ` · ${p.brand}` : ''}{p.category ? ` · ${p.category}` : ''} · Stock {p.stock_qty}
                              {margin !== null ? <span className="ml-1" style={{ color: margin < 0 ? 'var(--rs-danger)' : 'var(--rs-muted)' }}>{margin > 0 ? '+' : ''}{margin}%</span> : null}
                            </div>
                          </div>
                          <div className="font-semibold" style={{ color: 'var(--rs-accent)' }}>₹{p.sale_price.toLocaleString('en-IN')}</div>
                        </button>
                      );
                    })}
                  </div>
                  {!pickerFiltered.length ? <p className="py-10 text-center text-sm" style={{ color: 'var(--rs-muted)' }}>No products match these filters.</p> : null}
                </div>
              </div>
            </div>
          ) : null}

          {/* Serial picker modal (inline promise) */}
          {serialPicker ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="max-h-[80vh] w-full max-w-md overflow-auto p-5 shadow-xl" style={{ borderRadius: 'var(--rs-radius)', background: 'var(--rs-surface)', border: '1px solid var(--rs-border)', color: 'var(--rs-ink)' }}>
                <h3 className="rs-display text-lg font-semibold">Select IMEI / serial</h3>
                <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>{serialPicker.product.name} — pick {serialPicker.need}</p>
                <div className="mt-3 space-y-2">
                  {(serialPicker.product.serials ?? []).map((s) => {
                    const checked = serialPicker.selected.includes(s.serialNumber);
                    return (
                      <label key={s.serialNumber} className="flex gap-2 border px-3 py-2 text-sm" style={{ borderRadius: 'calc(var(--rs-radius) - 6px)', borderColor: 'var(--rs-border)' }}>
                        <input type="checkbox" checked={checked} onChange={() => {
                          setSerialPicker((prev) => {
                            if (!prev) return prev;
                            const set = new Set(prev.selected);
                            if (checked) set.delete(s.serialNumber);
                            else if (set.size < prev.need) set.add(s.serialNumber);
                            return { ...prev, selected: Array.from(set) };
                          });
                        }} />
                        <span className="font-mono">{s.serialNumber}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-4 flex gap-2">
                  <button type="button" className="flex-1 border py-2" style={{ borderRadius: 'calc(var(--rs-radius) - 4px)', borderColor: 'var(--rs-border)' }} onClick={() => serialPicker.resolve(null)}>Cancel</button>
                  <button type="button" className="rs-btn-primary flex-1 disabled:opacity-50" disabled={serialPicker.selected.length !== serialPicker.need} onClick={() => serialPicker.resolve(serialPicker.selected)}>Confirm</button>
                </div>
              </div>
            </div>
          ) : null}

        </div>
      </div>

      {/* Global modals */}
      <BillPreviewModal
        open={previewOpen}
        busy={previewBusy}
        onClose={() => setPreviewOpen(false)}
        onConfirmPrint={() => {
          setPreviewBusy(true);
          skipPrintRef.current = false;
          void finalizeBill(false, { skipPrint: false }).finally(() => setPreviewBusy(false));
        }}
        onConfirmNoPrint={() => {
          setPreviewBusy(true);
          skipPrintRef.current = true;
          void finalizeBill(false, { skipPrint: true }).finally(() => setPreviewBusy(false));
        }}
        customer={selectedCustomer}
        lines={cart}
        subtotal={totals?.subtotal ?? 0}
        totalCgst={totals?.totalCgst ?? 0}
        totalSgst={totals?.totalSgst ?? 0}
        totalIgst={totals?.totalIgst ?? 0}
        tradeInTotal={tradeInTotal}
        redeem={redeem}
        payable={payable}
        isIgst={isIgst}
        payments={payments}
        notes={notes}
      />

      <SerialSearchModal
        open={serialSearchOpen}
        onClose={() => setSerialSearchOpen(false)}
        token={token}
        apiFetch={apiFetch}
        onLoadReturn={(invoiceId, invoiceNumber) => {
          setReturnInvoiceId(invoiceId);
          setReturnSearch(invoiceNumber ?? invoiceId);
          void loadReturnInvoice(invoiceId);
          setTab('returns');
        }}
      />

      <ShiftCloseModal
        open={shiftCloseOpen}
        onClose={() => setShiftCloseOpen(false)}
        token={token}
        apiFetch={apiFetch}
        onPrint={(text) => window.retailSarathi.printThermal(buildThermalPayload(text)).then(() => {})}
      />

      <ShortcutOverlay open={shortcutOpen} onClose={() => setShortcutOpen(false)} />

      {token ? (
        <CustomerFormModal
          open={showCustomerForm}
          token={token}
          apiFetch={apiFetch}
          initialName={/^\d{6,}$/.test(customerQuery.trim()) ? '' : customerQuery}
          initialPhone={/^\d{6,}$/.test(customerQuery.trim()) ? customerQuery.trim() : ''}
          onClose={() => setShowCustomerForm(false)}
          onCreated={(c) => void onCustomerCreated(c)}
        />
      ) : null}

      <FloatingCalculator showFab={prefs.showCalculatorFab} />
    </div>
  );
}
