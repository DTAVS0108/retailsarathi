'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { calculateInvoice } from '@retail-sarathi/gst-engine';
import { apiWithAuth } from '@/lib/helpers';
import {
  assertGstinOptional,
  assertIndianPhone,
  normalizeGstin,
  stateCodeFromGstin,
  INDIAN_STATE_OPTIONS,
  parseAddressPayload,
} from '@/lib/validators';
import {
  MessageBanner,
  PageHeader,
  formatDateTime,
  inputClassName,
  parseError,
  selectClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { ProductPickerDialog } from '../_components/product-picker-dialog';

interface ProductSerial {
  id: string;
  serialNumber: string;
  status?: string;
}

interface Product {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  hsnCode: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  salePrice: number;
  gstRate: number;
  stockQty: number;
  lowStockThreshold?: number;
  trackSerial?: boolean;
  serials?: ProductSerial[];
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  gstin?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  country?: string | null;
  stateCode?: string | null;
  segment?: 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'CORPORATE';
  creditLimit?: number;
  outstandingBalance?: number;
  loyaltyPoints?: number;
}

const SEGMENT_PRICE_TYPE: Record<string, string> = {
  RETAIL: 'RETAIL',
  DEALER: 'DEALER',
  DISTRIBUTOR: 'DISTRIBUTOR',
  CORPORATE: 'WHOLESALE',
};

interface CartLine {
  key: string;
  productId: string;
  productName: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  discount: number;
  trackSerial?: boolean;
  serialNumbers: string[];
}

interface PaymentRow {
  id: string;
  method: (typeof PAYMENT_METHODS)[number];
  amount: string;
  reference: string;
}

interface HeldBill {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  createdAt: string;
  customer?: { id?: string; name?: string | null; phone?: string | null } | null;
  lines?: Array<{
    productId?: string | null;
    productName?: string;
    hsnCode?: string;
    quantity: number;
    unitPrice?: number;
    discount?: number;
    gstRate?: number;
    serialNumbers?: string[];
  }>;
  notes?: string | null;
}

interface PosDraft {
  customer?: { name?: string; phone?: string; gstin?: string };
  customerId?: string;
  lines?: Array<{
    productId?: string | null;
    productName?: string;
    quantity: number;
    unitPrice?: number;
  }>;
  paymentHint?: string;
  notes?: string;
}

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER'] as const;

function newPaymentRow(amount = ''): PaymentRow {
  return {
    id: Math.random().toString(36).slice(2),
    method: 'CASH',
    amount,
    reference: '',
  };
}

export default function PosPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [sellerState, setSellerState] = useState('27');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custGstin, setCustGstin] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custAddressLine2, setCustAddressLine2] = useState('');
  const [custCity, setCustCity] = useState('');
  const [custPincode, setCustPincode] = useState('');
  const [custStateCode, setCustStateCode] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [payments, setPayments] = useState<PaymentRow[]>([newPaymentRow()]);
  const [loyaltyRedeem, setLoyaltyRedeem] = useState('');
  const [notes, setNotes] = useState('');
  const [heldBills, setHeldBills] = useState<HeldBill[]>([]);
  const [heldInvoiceId, setHeldInvoiceId] = useState<string | null>(null);
  const [whatsappLink, setWhatsappLink] = useState<string | null>(null);
  const [whatsappNote, setWhatsappNote] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serialPicker, setSerialPicker] = useState<{
    product: Product;
    need: number;
    selected: string[];
    onDone: (serials: string[] | null) => void;
  } | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  function clearCustomerForm() {
    setCustomerId('');
    setCustomerQuery('');
    setCustomerMenuOpen(false);
    setCustName('');
    setCustPhone('');
    setCustGstin('');
    setCustAddress('');
    setCustAddressLine2('');
    setCustCity('');
    setCustPincode('');
    setCustStateCode('');
    setLoyaltyRedeem('');
    setFieldErrors({});
  }

  function selectSavedCustomer(c: Customer) {
    setCustomerId(c.id);
    setCustomerQuery('');
    setCustomerMenuOpen(false);
    setFieldErrors({});
    setLoyaltyRedeem('');
    setCustName(c.name);
    setCustPhone(c.phone);
    setCustGstin(c.gstin ?? '');
    setCustAddress(c.address ?? '');
    setCustAddressLine2(c.addressLine2 ?? '');
    setCustCity(c.city ?? '');
    setCustPincode(c.pincode ?? '');
    setCustStateCode(c.stateCode ?? stateCodeFromGstin(c.gstin) ?? '');
  }

  async function sendWhatsApp(invoiceId: string) {
    try {
      const res = await apiWithAuth<{
        sent?: boolean;
        mode?: string;
        shareUrl?: string;
        note?: string;
        reason?: string;
        error?: string;
      }>(`/invoices/${invoiceId}/whatsapp`, { method: 'POST' });
      if (res.shareUrl) setWhatsappLink(res.shareUrl);
      if (res.sent) {
        setWhatsappNote('WhatsApp bill sent via API.');
      } else {
        setWhatsappNote(res.error || res.reason || res.note || 'WhatsApp share link ready.');
      }
    } catch (e) {
      setWhatsappNote(parseError(e));
    }
  }

  async function loadHeldBills() {
    const res = await apiWithAuth<{ items: HeldBill[] }>('/invoices?status=DRAFT&pageSize=50');
    setHeldBills(res.items);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [profile, prodRes, custRes] = await Promise.all([
          apiWithAuth<{ stateCode: string }>('/tenants/profile'),
          apiWithAuth<{ items: Product[] }>('/products?pageSize=500'),
          apiWithAuth<Customer[]>('/customers'),
        ]);
        setSellerState(profile.stateCode);
        setProducts(prodRes.items);
        setCustomers(custRes);
        await loadHeldBills();

        const raw = sessionStorage.getItem('posDraft');
        if (raw) {
          sessionStorage.removeItem('posDraft');
          const draft: PosDraft = JSON.parse(raw);
          if (draft.customer) {
            setCustName(draft.customer.name ?? '');
            setCustPhone(draft.customer.phone ?? '');
            setCustGstin(draft.customer.gstin ?? '');
            setCustAddress((draft.customer as { address?: string }).address ?? '');
          }
          if (draft.customerId) setCustomerId(draft.customerId);
          if (draft.notes) setNotes(draft.notes);
          if (draft.lines?.length) {
            const lines: CartLine[] = [];
            let dropped = 0;
            for (const l of draft.lines) {
              const p = prodRes.items.find((x) => x.id === l.productId);
              if (p) {
                lines.push({
                  key: p.id,
                  productId: p.id,
                  productName: p.name,
                  hsnCode: p.hsnCode,
                  quantity: l.quantity || 1,
                  unitPrice: l.unitPrice ?? Number(p.salePrice),
                  gstRate: Number(p.gstRate),
                  discount: 0,
                  trackSerial: Boolean(p.trackSerial),
                  serialNumbers: [],
                });
              } else if (l.productId) {
                dropped += 1;
              }
            }
            setCart(lines);
            const draftDropped = Number((draft as { droppedUnmatched?: number }).droppedUnmatched) || 0;
            if (dropped || draftDropped) {
              setError(
                `Scan draft loaded with ${lines.length} line(s). ${dropped || draftDropped} unmatched item(s) were skipped — rematch on Scan and reopen.`,
              );
            }
          }
        }
      } catch (e) {
        setError(parseError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId),
    [customerId, customers],
  );

  const buyerState = useMemo(() => {
    if (custStateCode) return custStateCode;
    if (selectedCustomer?.stateCode) return selectedCustomer.stateCode;
    const fromGstin = stateCodeFromGstin(selectedCustomer?.gstin || custGstin);
    if (fromGstin) return fromGstin;
    return sellerState;
  }, [custStateCode, selectedCustomer, custGstin, sellerState]);

  const priceListType = useMemo(() => {
    if (!customerId) return 'RETAIL';
    return SEGMENT_PRICE_TYPE[selectedCustomer?.segment ?? 'RETAIL'] ?? 'RETAIL';
  }, [customerId, selectedCustomer]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 40);
    return customers
      .filter((c) => {
        const addressBits = [c.address, c.addressLine2, c.city, c.pincode]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.includes(q) ||
          (c.gstin && c.gstin.toLowerCase().includes(q)) ||
          addressBits.includes(q)
        );
      })
      .slice(0, 30);
  }, [customers, customerQuery]);

  function customerAddressLine(c: Customer) {
    return [c.address, c.addressLine2, c.city, c.pincode].filter(Boolean).join(', ');
  }

  useEffect(() => {
    if (!customerMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!customerSearchRef.current?.contains(e.target as Node)) {
        setCustomerMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCustomerMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [customerMenuOpen]);

  function lineAmount(l: CartLine) {
    return calculateInvoice(
      [
        {
          productId: l.productId,
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.discount,
          gstRate: l.gstRate,
        },
      ],
      sellerState,
      buyerState,
    ).grandTotal;
  }

  async function resolveUnitPrice(productId: string, qty: number, fallback: number) {
    if (priceListType === 'RETAIL') return fallback;
    try {
      const price = await apiWithAuth<number>(
        `/wholesale/price?productId=${productId}&type=${priceListType}&qty=${qty}`,
      );
      return toNumber(price) || fallback;
    } catch {
      return fallback;
    }
  }

  useEffect(() => {
    if (!customerId || !cart.length) return;
    void (async () => {
      const repriced = await Promise.all(
        cart.map(async (line) => ({
          ...line,
          unitPrice: await resolveUnitPrice(line.productId, line.quantity, line.unitPrice),
        })),
      );
      setCart(repriced);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, priceListType]);

  const totals = useMemo(() => {
    if (!cart.length) return null;
    return calculateInvoice(
      cart.map((l) => ({
        productId: l.productId,
        productName: l.productName,
        hsnCode: l.hsnCode,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        gstRate: l.gstRate,
      })),
      sellerState,
      buyerState,
    );
  }, [cart, sellerState, buyerState]);

  const payableTotal = useMemo(() => {
    if (!totals) return 0;
    const redeem = Math.max(0, Math.floor(toNumber(loyaltyRedeem)));
    return Math.max(0, Math.round((totals.grandTotal - redeem) * 100) / 100);
  }, [totals, loyaltyRedeem]);

  const paymentSum = useMemo(
    () => payments.reduce((s, p) => s + toNumber(p.amount), 0),
    [payments],
  );

  const paymentBalance = useMemo(
    () => Math.round((payableTotal - paymentSum) * 100) / 100,
    [payableTotal, paymentSum],
  );

  /** Products that can still be sold (warehouse/IMEI free, after cart reservation). */
  const availableCatalogCount = useMemo(() => {
    const reserved: Record<string, number> = {};
    for (const line of cart) {
      reserved[line.productId] = (reserved[line.productId] ?? 0) + line.quantity;
    }
    return products.filter((p) => {
      const reservedQty = reserved[p.id] ?? 0;
      const warehouse = toNumber(p.stockQty);
      if (p.trackSerial) {
        const serialCount = (p.serials ?? []).filter(
          (s) => !s.status || s.status === 'IN_STOCK',
        ).length;
        return Math.max(0, Math.min(warehouse, serialCount) - reservedQty) > 0;
      }
      return Math.max(0, warehouse - reservedQty) > 0;
    }).length;
  }, [products, cart]);

  useEffect(() => {
    if (!totals) return;
    setPayments((prev) => {
      if (prev.length === 1 && (!prev[0].amount || prev[0].amount === '0')) {
        return [{ ...prev[0], amount: payableTotal ? String(payableTotal) : '' }];
      }
      return prev;
    });
  }, [payableTotal, totals]);

  function stockFor(productId: string) {
    return toNumber(products.find((p) => p.id === productId)?.stockQty);
  }

  /** Sellable qty for POS (warehouse, and IN_STOCK serials when IMEI-tracked). */
  function sellableQty(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return 0;
    if (p.trackSerial) {
      const serialCount = (p.serials ?? []).filter(
        (s) => !s.status || s.status === 'IN_STOCK',
      ).length;
      return Math.min(toNumber(p.stockQty), serialCount);
    }
    return toNumber(p.stockQty);
  }

  /** Build cart from a held draft, dropping / clamping lines that exceed current stock. */
  function cartFromHeldBill(bill: HeldBill): {
    lines: CartLine[];
    dropped: string[];
    reduced: string[];
  } {
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
      const want = Math.max(1, toNumber(l.quantity) || 1);
      const avail = Math.max(0, sellableQty(p.id) - (reserved[p.id] ?? 0));
      if (avail <= 0) {
        dropped.push(name);
        continue;
      }
      const qty = Math.min(want, avail);
      if (qty < want) reduced.push(`${name} (${want}→${qty})`);
      reserved[p.id] = (reserved[p.id] ?? 0) + qty;

      let serialNumbers = Array.isArray(l.serialNumbers) ? l.serialNumbers.slice(0, qty) : [];
      if (p.trackSerial && serialNumbers.length < qty) {
        const free = (p.serials ?? [])
          .filter((s) => !s.status || s.status === 'IN_STOCK')
          .map((s) => s.serialNumber)
          .filter((sn) => !serialNumbers.includes(sn));
        serialNumbers = [...serialNumbers, ...free].slice(0, qty);
      }

      lines.push({
        key: `${bill.id}-${p.id}-${lines.length}`,
        productId: p.id,
        productName: l.productName ?? p.name,
        hsnCode: l.hsnCode ?? p.hsnCode,
        quantity: qty,
        unitPrice: toNumber(l.unitPrice) || Number(p.salePrice),
        gstRate: toNumber(l.gstRate) || Number(p.gstRate),
        discount: toNumber(l.discount),
        trackSerial: Boolean(p.trackSerial),
        serialNumbers: p.trackSerial ? serialNumbers : [],
      });
    }
    return { lines, dropped, reduced };
  }

  function heldBillHasStockGap(bill: HeldBill) {
    if (!bill.lines?.length) return false;
    const { dropped, reduced, lines } = cartFromHeldBill(bill);
    return dropped.length > 0 || reduced.length > 0 || lines.length === 0;
  }

  function usedSerials(excludeKey?: string) {
    const used = new Set<string>();
    for (const line of cart) {
      if (excludeKey && line.key === excludeKey) continue;
      for (const sn of line.serialNumbers) used.add(sn);
    }
    return used;
  }

  async function refreshProduct(productId: string): Promise<Product | null> {
    try {
      const fresh = await apiWithAuth<Product>(`/products/${productId}`);
      const inStockSerials = (fresh.serials ?? []).filter(
        (s) => !s.status || s.status === 'IN_STOCK',
      );
      const normalized = { ...fresh, serials: inStockSerials };
      setProducts((prev) => prev.map((x) => (x.id === productId ? { ...x, ...normalized } : x)));
      return normalized;
    } catch {
      return products.find((x) => x.id === productId) ?? null;
    }
  }

  function freeSerials(product: Product, excludeKey?: string) {
    const used = usedSerials(excludeKey);
    return (product.serials ?? []).filter(
      (s) => (!s.status || s.status === 'IN_STOCK') && !used.has(s.serialNumber),
    );
  }

  function pickSerials(product: Product, need: number, preselected: string[] = []): Promise<string[] | null> {
    return new Promise((resolve) => {
      setSerialPicker({
        product,
        need,
        selected: preselected.slice(0, need),
        onDone: (serials) => {
          setSerialPicker(null);
          resolve(serials);
        },
      });
    });
  }

  async function addProduct(p: Product, qty = 1) {
    let product = p;
    if (p.trackSerial) {
      const fresh = await refreshProduct(p.id);
      if (fresh) product = fresh;
    }

    const available = product.trackSerial
      ? Math.min(toNumber(product.stockQty), freeSerials(product).length)
      : toNumber(product.stockQty);
    const already = cart.find((x) => x.productId === product.id)?.quantity ?? 0;
    if (available <= 0) {
      setError(
        product.trackSerial
          ? `${product.name} has no available IMEI/serial. Receive serials on Stock-in / GRN first.`
          : `${product.name} is out of stock.`,
      );
      return;
    }
    if (already + qty > available) {
      setError(
        product.trackSerial
          ? `Only ${available} IMEI/serial unit(s) left for ${product.name} (cart has ${already}).`
          : `Only ${available} unit(s) of ${product.name} in stock (cart has ${already}).`,
      );
      return;
    }
    setError('');
    const unitPrice = await resolveUnitPrice(product.id, already + qty, Number(product.salePrice));

    if (product.trackSerial) {
      const existing = cart.find((x) => x.productId === product.id);
      const need = (existing?.quantity ?? 0) + qty;
      if (freeSerials(product).length === 0) {
        setError(`${product.name} has no available IMEI/serial. Receive them on Stock-in / GRN first.`);
        return;
      }
      const picked = await pickSerials(product, need, existing?.serialNumbers ?? []);
      if (!picked) return;
      setCart((prev) => {
        const ex = prev.find((x) => x.productId === product.id);
        if (ex) {
          return prev.map((x) =>
            x.productId === product.id
              ? { ...x, quantity: need, unitPrice, serialNumbers: picked, trackSerial: true }
              : x,
          );
        }
        return [
          ...prev,
          {
            key: product.id,
            productId: product.id,
            productName: product.name,
            hsnCode: product.hsnCode,
            quantity: need,
            unitPrice,
            gstRate: Number(product.gstRate),
            discount: 0,
            trackSerial: true,
            serialNumbers: picked,
          },
        ];
      });
      return;
    }

    setCart((prev) => {
      const existing = prev.find((x) => x.productId === product.id);
      if (existing) {
        return prev.map((x) =>
          x.productId === product.id ? { ...x, quantity: x.quantity + qty, unitPrice } : x,
        );
      }
      return [
        ...prev,
        {
          key: product.id,
          productId: product.id,
          productName: product.name,
          hsnCode: product.hsnCode,
          quantity: qty,
          unitPrice,
          gstRate: Number(product.gstRate),
          discount: 0,
          trackSerial: false,
          serialNumbers: [],
        },
      ];
    });
  }

  function handleBarcodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    const p =
      products.find((x) => x.barcode === code) ||
      products.find((x) => x.sku.toLowerCase() === code.toLowerCase());
    if (!p) {
      setError(`No product found for "${code}"`);
      return;
    }
    void addProduct(p);
    setBarcodeInput('');
  }

  function updateQty(key: string, delta: number) {
    void (async () => {
      const line = cart.find((x) => x.key === key);
      if (!line) return;
      const nextQty = line.quantity + delta;
      if (nextQty <= 0) {
        setCart((prev) => prev.filter((x) => x.key !== key));
        return;
      }
      const available = stockFor(line.productId);
      if (nextQty > available) {
        setError(`Only ${available} unit(s) of ${line.productName} in stock.`);
        return;
      }
      if (line.trackSerial) {
        const product = products.find((p) => p.id === line.productId);
        if (!product) return;
        const picked = await pickSerials(product, nextQty, line.serialNumbers);
        if (!picked) return;
        const unitPrice = await resolveUnitPrice(line.productId, nextQty, line.unitPrice);
        setError('');
        setCart((prev) =>
          prev.map((x) =>
            x.key === key ? { ...x, quantity: nextQty, serialNumbers: picked, unitPrice } : x,
          ),
        );
        return;
      }
      const unitPrice = await resolveUnitPrice(line.productId, nextQty, line.unitPrice);
      setError('');
      setCart((prev) =>
        prev.map((x) => (x.key === key ? { ...x, quantity: nextQty, unitPrice } : x)),
      );
    })();
  }

  function updateDiscount(key: string, discount: number) {
    setCart((prev) =>
      prev.map((x) => (x.key === key ? { ...x, discount: Math.max(0, discount) } : x)),
    );
  }

  function updateRate(key: string, unitPrice: number) {
    setCart((prev) =>
      prev.map((x) => (x.key === key ? { ...x, unitPrice: Math.max(0, unitPrice) } : x)),
    );
  }

  function validateCustomerFields(): { phone?: string; gstin?: string; stateCode?: string } {
    const next: Record<string, string> = {};
    let phone: string | undefined;
    let gstin: string | undefined;
    try {
      phone = assertIndianPhone(custPhone, false);
    } catch (e) {
      next.phone = parseError(e);
    }
    try {
      gstin = assertGstinOptional(custGstin);
    } catch (e) {
      next.gstin = parseError(e);
    }
    setFieldErrors(next);
    if (Object.keys(next).length) {
      throw new Error(Object.values(next).join(' '));
    }
    return { phone, gstin, stateCode: stateCodeFromGstin(gstin) };
  }

  async function ensureCustomer(): Promise<Customer | undefined> {
    const addr = parseAddressPayload({
      address: custAddress,
      addressLine2: custAddressLine2,
      city: custCity,
      stateCode: custStateCode || stateCodeFromGstin(custGstin),
      pincode: custPincode,
      country: 'IN',
    });

    if (customerId) {
      const { phone, gstin, stateCode } = validateCustomerFields();
      const updated = await apiWithAuth<Customer>(`/customers/${customerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: custName.trim() || undefined,
          phone: phone || custPhone.trim() || undefined,
          gstin: gstin ?? null,
          stateCode: addr.stateCode || stateCode || null,
          address: addr.address,
          addressLine2: addr.addressLine2,
          city: addr.city,
          pincode: addr.pincode,
          country: addr.country ?? 'IN',
        }),
      });
      setCustomers((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
      return updated;
    }

    const hasIdentity = Boolean(
      custName.trim() || custPhone.trim() || custGstin.trim() || custAddress.trim() || custCity.trim(),
    );
    if (!hasIdentity) return undefined;

    if (!custName.trim() && !custPhone.trim()) {
      throw new Error('Enter customer name or phone, or leave blank for walk-in.');
    }

    const { phone, gstin, stateCode } = validateCustomerFields();
    if (custPhone.trim() && !phone) {
      throw new Error('Enter a valid phone number for a new customer.');
    }
    if (!phone && !custName.trim()) {
      throw new Error('Name is required when phone is blank.');
    }
    if (!phone) {
      throw new Error('Phone is required to save a new customer (or leave all customer fields blank for walk-in).');
    }

    const created = await apiWithAuth<Customer>('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: custName.trim() || `Customer ${phone}`,
        phone,
        gstin,
        stateCode: addr.stateCode || stateCode,
        address: addr.address,
        addressLine2: addr.addressLine2,
        city: addr.city,
        pincode: addr.pincode,
        country: addr.country ?? 'IN',
      }),
    });
    setCustomerId(created.id);
    setCustomers((prev) => [created, ...prev]);
    return created;
  }

  function creditPaymentTotal(rows: PaymentRow[] = payments) {
    return rows
      .filter((p) => p.method === 'CREDIT')
      .reduce((s, p) => s + toNumber(p.amount), 0);
  }

  function assertStockForCart() {
    for (const line of cart) {
      const available = stockFor(line.productId);
      if (line.quantity > available) {
        throw new Error(
          `Insufficient stock for ${line.productName}: need ${line.quantity}, have ${available}.`,
        );
      }
    }
  }

  function buildLinesPayload() {
    return cart.map((l) => ({
      productId: l.productId,
      productName: l.productName,
      hsnCode: l.hsnCode,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      gstRate: l.gstRate,
      serialNumbers: l.trackSerial ? l.serialNumbers : undefined,
    }));
  }

  function assertSerialsForCart() {
    for (const line of cart) {
      if (!line.trackSerial) continue;
      if (line.serialNumbers.length !== Math.floor(line.quantity)) {
        throw new Error(
          `${line.productName}: select ${Math.floor(line.quantity)} serial/IMEI number(s)`,
        );
      }
    }
  }

  function buildPaymentsPayload(rows: PaymentRow[] = payments) {
    return rows
      .filter((p) => toNumber(p.amount) > 0)
      .map((p) => ({
        method: p.method,
        amount: toNumber(p.amount),
        reference: p.reference.trim() || undefined,
      }));
  }

  function assertCreditOk(customer?: Customer | null, rows: PaymentRow[] = payments) {
    const creditAmt = creditPaymentTotal(rows);
    if (creditAmt <= 0) return;
    if (!customer) {
      throw new Error('Enter customer name and phone for CREDIT (udhaar) payment.');
    }
    const limit = toNumber(customer.creditLimit);
    const outstanding = toNumber(customer.outstandingBalance);
    if (limit > 0 && outstanding + creditAmt > limit) {
      throw new Error(
        `Credit limit ₹${limit.toLocaleString('en-IN')} exceeded (outstanding ₹${outstanding.toLocaleString('en-IN')} + bill).`,
      );
    }
  }

  function assertPaymentsMatch(rows: PaymentRow[] = payments) {
    const sum = rows.reduce((s, p) => s + toNumber(p.amount), 0);
    if (Math.abs(sum - payableTotal) > 0.05) {
      throw new Error(
        `Split payments (₹${sum.toFixed(2)}) must equal bill total (₹${payableTotal.toFixed(2)}).`,
      );
    }
    if (!rows.some((p) => toNumber(p.amount) > 0)) {
      throw new Error('Add at least one payment row with an amount.');
    }
  }

  function resetCart() {
    setCart([]);
    setCustName('');
    setCustPhone('');
    setCustGstin('');
    setCustAddress('');
    setCustAddressLine2('');
    setCustCity('');
    setCustPincode('');
    setCustStateCode('');
    setCustomerId('');
    setNotes('');
    setLoyaltyRedeem('');
    setPayments([newPaymentRow()]);
    setFieldErrors({});
    setHeldInvoiceId(null);
  }

  async function holdBill() {
    if (!cart.length || !totals) {
      setError('Add at least one item to hold.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    setWhatsappLink(null);
    try {
      if (customerId && custGstin.trim()) {
        assertGstinOptional(custGstin);
      } else if (!customerId && (custName.trim() || custPhone.trim() || custGstin.trim())) {
        validateCustomerFields();
      }
      const customer = await ensureCustomer();
      assertSerialsForCart();
      const invoice = await apiWithAuth<{ id: string; invoiceNumber: string }>('/invoices/hold', {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer?.id,
          notes: notes || undefined,
          lines: buildLinesPayload(),
        }),
      });
      setSuccess(`Bill held: ${invoice.invoiceNumber}. Resume from held bills below.`);
      resetCart();
      await loadHeldBills();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  function resumeHeldBill(bill: HeldBill) {
    setHeldInvoiceId(bill.id);
    setNotes(bill.notes ?? '');
    const custId = bill.customer?.id;
    if (custId) {
      setCustomerId(custId);
      const c = customers.find((x) => x.id === custId);
      setCustName(c?.name ?? bill.customer?.name ?? '');
      setCustPhone(c?.phone ?? bill.customer?.phone ?? '');
      setCustGstin(c?.gstin ?? '');
      setCustAddress(c?.address ?? '');
      setCustAddressLine2(c?.addressLine2 ?? '');
      setCustCity(c?.city ?? '');
      setCustPincode(c?.pincode ?? '');
      setCustStateCode(c?.stateCode ?? stateCodeFromGstin(c?.gstin) ?? '');
    } else {
      setCustomerId('');
      setCustName(bill.customer?.name ?? '');
      setCustPhone(bill.customer?.phone ?? '');
      setCustGstin('');
      setCustAddress('');
      setCustAddressLine2('');
      setCustCity('');
      setCustPincode('');
      setCustStateCode('');
    }
    const { lines, dropped, reduced } = cartFromHeldBill(bill);
    setCart(lines);
    setWhatsappLink(null);
    if (!lines.length) {
      setSuccess('');
      setError(
        dropped.length
          ? `Held bill ${bill.invoiceNumber} has no sellable stock. Removed: ${dropped.join(', ')}. Restock or cancel the draft.`
          : `Held bill ${bill.invoiceNumber} has no sellable lines left.`,
      );
      return;
    }
    const notesParts: string[] = [];
    if (dropped.length) notesParts.push(`removed out of stock: ${dropped.join(', ')}`);
    if (reduced.length) notesParts.push(`qty reduced: ${reduced.join(', ')}`);
    setSuccess(
      notesParts.length
        ? `Resumed ${bill.invoiceNumber} — ${notesParts.join('; ')}. Review cart before checkout.`
        : `Resumed held bill ${bill.invoiceNumber}.`,
    );
    setError(notesParts.length ? `Out-of-stock items were removed from this held bill.` : '');
  }

  async function finalizeHeld(id: string) {
    const bill = heldBills.find((b) => b.id === id);
    if (bill && heldBillHasStockGap(bill)) {
      resumeHeldBill(bill);
      setError(
        'Cannot finalize — some lines are out of stock. They were removed from the cart; review and checkout, or restock first.',
      );
      setSuccess('');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const invoice = await apiWithAuth<{ id: string; invoiceNumber: string; customer?: { phone?: string | null } | null; grandTotal: number }>(
        `/invoices/${id}/finalize`,
        { method: 'PATCH' },
      );
      setSuccess(`Finalized: ${invoice.invoiceNumber}`);
      setWhatsappNote('');
      await sendWhatsApp(invoice.id);
      if (heldInvoiceId === id) resetCart();
      await loadHeldBills();
      setTimeout(() => router.push(`/dashboard/invoices/${invoice.id}?print=1`), 1500);
    } catch (e) {
      const msg = parseError(e);
      if (/insufficient stock/i.test(msg) && bill) {
        resumeHeldBill(bill);
        setError(`${msg}. Out-of-stock lines were removed — review the cart and checkout.`);
        setSuccess('');
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  async function cancelHeld(id: string) {
    const bill = heldBills.find((b) => b.id === id);
    const label = bill?.invoiceNumber ?? 'draft';
    if (!window.confirm(`Cancel held draft ${label}? This cannot be undone.`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiWithAuth(`/invoices/${id}/cancel`, { method: 'PATCH' });
      if (heldInvoiceId === id) resetCart();
      setSuccess(`Cancelled ${label}`);
      await loadHeldBills();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveBill(paymentOverride?: PaymentRow[]) {
    if (!cart.length || !totals) {
      setError('Add at least one item to the bill.');
      return;
    }
    const payRows = paymentOverride ?? payments;
    if (paymentOverride) setPayments(paymentOverride);
    setSaving(true);
    setError('');
    setSuccess('');
    setWhatsappLink(null);
    try {
      if (customerId && custGstin.trim()) {
        assertGstinOptional(custGstin);
      } else if (!customerId && (custName.trim() || custPhone.trim() || custGstin.trim())) {
        validateCustomerFields();
      }

      assertStockForCart();
      assertSerialsForCart();
      assertPaymentsMatch(payRows);

      const creditAmt = creditPaymentTotal(payRows);
      if (creditAmt > 0 && !customerId && !custName.trim() && !custPhone.trim()) {
        throw new Error('Enter customer name and phone for CREDIT (udhaar) payment.');
      }

      let customer = selectedCustomer;
      const shouldEnsureCustomer =
        creditAmt > 0 ||
        Boolean(customerId) ||
        Boolean(
          custName.trim() ||
            custPhone.trim() ||
            custGstin.trim() ||
            custAddress.trim() ||
            custCity.trim(),
        );
      if (shouldEnsureCustomer) {
        customer = (await ensureCustomer()) ?? customer;
      }
      if (creditAmt > 0) {
        assertCreditOk(customer, payRows);
      }

      const redeem = Math.floor(toNumber(loyaltyRedeem));
      if (redeem > 0 && !customer && !custPhone.trim()) {
        throw new Error('Select a customer to redeem loyalty points.');
      }
      if (customer && redeem > toNumber(customer.loyaltyPoints)) {
        throw new Error(`Only ${toNumber(customer.loyaltyPoints)} loyalty points available.`);
      }

      const cid = customer?.id;

      if (heldInvoiceId) {
        await apiWithAuth(`/invoices/${heldInvoiceId}/cancel`, { method: 'PATCH' });
      }

      const invoice = await apiWithAuth<{
        id: string;
        invoiceNumber: string;
        grandTotal: number;
        customer?: { phone?: string | null } | null;
      }>('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          customerId: cid,
          notes: notes || undefined,
          lines: buildLinesPayload(),
          payments: buildPaymentsPayload(payRows),
          loyaltyPointsToRedeem: redeem > 0 ? redeem : undefined,
          status: 'FINALIZED',
        }),
      });

      setWhatsappNote('');
      await sendWhatsApp(invoice.id);

      setSuccess(`Bill saved: ${invoice.invoiceNumber}`);
      resetCart();
      await loadHeldBills();
      setTimeout(() => router.push(`/dashboard/invoices/${invoice.id}?print=1`), whatsappLink ? 2500 : 1200);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AppLoader label="Loading POS…" />;
  }

  return (
    <div className="space-y-5 p-4 pb-28 sm:p-6 lg:space-y-6 lg:p-8 lg:pb-8">
      <PageHeader
        title="POS / New Bill"
        description={
          cart.length
            ? `${cart.length} item${cart.length === 1 ? '' : 's'} in cart · scan or browse to add more`
            : 'Scan or browse products, fill customer details, then checkout.'
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}
      {whatsappLink || whatsappNote ? (
        <MessageBanner tone="info">
          {whatsappNote ? <span className="mr-2">{whatsappNote}</span> : null}
          {whatsappLink ? (
            <>
              Share:{' '}
              <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="font-medium underline">
                Open WhatsApp
              </a>
            </>
          ) : null}
        </MessageBanner>
      ) : null}

      {heldBills.length ? (
        <Card title={`Held bills (${heldBills.length})`}>
          <div className="space-y-2">
            {heldBills.map((b) => {
              const stockGap = heldBillHasStockGap(b);
              return (
              <div
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-100 bg-amber-50/50 px-3 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <strong>{b.invoiceNumber}</strong>
                  {b.customer?.name ? ` · ${b.customer.name}` : ''}
                  {` · ${formatINR(toNumber(b.grandTotal))}`}
                  <span className="ml-2 block text-xs text-slate-400 sm:inline">{formatDateTime(b.createdAt)}</span>
                  {stockGap ? (
                    <span className="mt-1 block text-xs font-medium text-amber-800">
                      Some lines are out of stock — resume to clean up, then checkout
                    </span>
                  ) : null}
                </span>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="secondary" onClick={() => resumeHeldBill(b)}>
                    Resume
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={saving || stockGap}
                    title={stockGap ? 'Fix stock or resume and remove out-of-stock lines first' : undefined}
                    onClick={() => void finalizeHeld(b.id)}
                  >
                    Finalize
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    className="text-red-700 ring-red-200 hover:bg-red-50"
                    onClick={() => void cancelHeld(b.id)}
                  >
                    Cancel draft
                  </Button>
                </div>
              </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* Scan toolbar */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-semibold text-slate-900">Scan barcode or type SKU</label>
              <span
                className={
                  cart.length
                    ? 'rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-900'
                    : 'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500'
                }
              >
                {cart.length ? `${cart.length} in cart` : 'Cart empty'}
              </span>
            </div>
            <form onSubmit={handleBarcodeSubmit} className="flex gap-2">
              <input
                className={`${inputClassName} min-h-12 text-base font-medium`}
                placeholder="Scanner ready — scan here…"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="min-h-12 shrink-0 px-6 text-base">
                Add
              </Button>
            </form>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="min-h-12 shrink-0 lg:mb-0"
            onClick={() => setProductPickerOpen(true)}
          >
            Browse catalog ({availableCatalogCount})
          </Button>
        </div>
      </Card>

      {/* Customer — full width so fields have room */}
      <Card className="overflow-hidden">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Customer</p>
            <h2 className="text-lg font-semibold text-slate-900">Who is buying?</h2>
            <p className="text-sm text-slate-500">Search a saved party, or enter walk-in details below.</p>
          </div>
          {customerId || custName || custPhone ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={clearCustomerForm}
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="relative" ref={customerSearchRef}>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Search saved customers
            </label>
            <div className="relative">
              <input
                className={`${inputClassName} pr-10`}
                placeholder={
                  selectedCustomer
                    ? `${selectedCustomer.name} · ${selectedCustomer.phone}`
                    : 'Search name, phone, or GSTIN…'
                }
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setCustomerMenuOpen(true);
                }}
                onFocus={() => setCustomerMenuOpen(true)}
                onClick={() => setCustomerMenuOpen(true)}
                autoComplete="off"
                aria-expanded={customerMenuOpen}
                aria-controls="pos-customer-dropdown"
                role="combobox"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
                aria-label={customerMenuOpen ? 'Close customer list' : 'Open customer list'}
                onClick={() => setCustomerMenuOpen((o) => !o)}
              >
                <svg
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`h-4 w-4 transition ${customerMenuOpen ? 'rotate-180' : ''}`}
                  aria-hidden
                >
                  <path
                    fillRule="evenodd"
                    d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
            {customerMenuOpen ? (
              <div
                id="pos-customer-dropdown"
                role="listbox"
                className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg"
              >
                <div className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {customerQuery.trim()
                    ? `${filteredCustomers.length} match${filteredCustomers.length === 1 ? '' : 'es'}`
                    : `${Math.min(customers.length, 40)} of ${customers.length} customers`}
                </div>
                <button
                  type="button"
                  role="option"
                  className="block w-full border-b border-slate-100 px-4 py-3 text-left text-sm text-slate-500 hover:bg-slate-50"
                  onClick={clearCustomerForm}
                >
                  Walk-in / new customer
                </button>
                {filteredCustomers.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-slate-500">No match — enter details below.</p>
                ) : (
                  filteredCustomers.map((c) => {
                    const active = c.id === customerId;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        className={`block w-full border-b border-slate-50 px-4 py-3 text-left hover:bg-teal-50 ${
                          active ? 'bg-teal-50/80' : ''
                        }`}
                        onClick={() => selectSavedCustomer(c)}
                      >
                        <span className="block font-semibold text-slate-900">{c.name}</span>
                        <span className="mt-0.5 block text-sm text-slate-500">
                          {c.phone}
                          {c.gstin ? ` · ${c.gstin}` : ''}
                          {toNumber(c.outstandingBalance) > 0
                            ? ` · Udhaar ${formatINR(toNumber(c.outstandingBalance))}`
                            : ''}
                        </span>
                        {customerAddressLine(c) ? (
                          <span className="mt-0.5 block truncate text-xs text-slate-400">
                            {customerAddressLine(c)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
            ) : null}
          </div>

          {customerId && selectedCustomer ? (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
                {selectedCustomer.segment ?? 'RETAIL'}
              </span>
              {priceListType !== 'RETAIL' ? (
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-900">
                  {priceListType} price list
                </span>
              ) : null}
              {toNumber(selectedCustomer.creditLimit) > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  Credit left ₹
                  {(
                    toNumber(selectedCustomer.creditLimit) - toNumber(selectedCustomer.outstandingBalance)
                  ).toLocaleString('en-IN')}
                </span>
              ) : null}
              {toNumber(selectedCustomer.loyaltyPoints) > 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  {toNumber(selectedCustomer.loyaltyPoints)} loyalty pts
                </span>
              ) : null}
              {toNumber(selectedCustomer.outstandingBalance) > 0 ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                  Udhaar {formatINR(toNumber(selectedCustomer.outstandingBalance))}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              <span>Name</span>
              <input
                className={inputClassName}
                placeholder="Customer name"
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              <span>Phone</span>
              <input
                className={inputClassName}
                placeholder="10-digit mobile"
                value={custPhone}
                onChange={(e) => {
                  setCustPhone(e.target.value);
                  setFieldErrors((f) => ({ ...f, phone: '' }));
                }}
                inputMode="numeric"
              />
              {fieldErrors.phone ? <p className="text-xs font-normal text-red-600">{fieldErrors.phone}</p> : null}
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              <span>GSTIN</span>
              <input
                className={inputClassName}
                placeholder="Optional"
                value={custGstin}
                onChange={(e) => {
                  const gstin = normalizeGstin(e.target.value);
                  const stateCode = stateCodeFromGstin(gstin);
                  setCustGstin(gstin);
                  if (stateCode) setCustStateCode(stateCode);
                  setFieldErrors((f) => ({ ...f, gstin: '' }));
                }}
                maxLength={15}
              />
              {fieldErrors.gstin ? <p className="text-xs font-normal text-red-600">{fieldErrors.gstin}</p> : null}
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-2">
              <span>Address line 1</span>
              <input
                className={inputClassName}
                placeholder="Shop / house, street"
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              <span>Address line 2</span>
              <input
                className={inputClassName}
                placeholder="Area / landmark"
                value={custAddressLine2}
                onChange={(e) => setCustAddressLine2(e.target.value)}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              <span>City</span>
              <input className={inputClassName} value={custCity} onChange={(e) => setCustCity(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              <span>PIN</span>
              <input
                className={inputClassName}
                value={custPincode}
                onChange={(e) => setCustPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                maxLength={6}
              />
            </label>
            <label className="space-y-1.5 text-sm font-medium text-slate-700">
              <span>State (place of supply)</span>
              <select
                className={selectClassName}
                value={custStateCode}
                onChange={(e) => setCustStateCode(e.target.value)}
              >
                <option value="">Same as shop ({sellerState})</option>
                {INDIAN_STATE_OPTIONS.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-700">
              {buyerState !== sellerState ? 'IGST' : 'CGST + SGST'}
            </span>
            <span className="text-sm text-slate-500">
              Place of supply <strong className="text-slate-800">{buyerState || '—'}</strong>
            </span>
            {customerId && selectedCustomer && toNumber(selectedCustomer.loyaltyPoints) > 0 ? (
              <label className="ml-auto flex items-center gap-2 text-sm font-medium text-slate-700">
                <span>Redeem pts</span>
                <input
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                  type="number"
                  min="0"
                  max={toNumber(selectedCustomer.loyaltyPoints)}
                  placeholder={`Max ${toNumber(selectedCustomer.loyaltyPoints)}`}
                  value={loyaltyRedeem}
                  onChange={(e) => setLoyaltyRedeem(e.target.value)}
                />
              </label>
            ) : null}
            {heldInvoiceId ? (
              <span className="w-full text-sm font-medium text-amber-700">
                Editing held bill — save will finalize and cancel the draft.
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      <Card className="min-h-[22rem] overflow-hidden">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Bill</p>
              <h2 className="text-lg font-semibold text-slate-900">
                {cart.length
                  ? `${cart.length} item${cart.length === 1 ? '' : 's'}`
                  : 'Line items'}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => setProductPickerOpen(true)}>
                + Add product
              </Button>
              {cart.length ? (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  onClick={() => setCart([])}
                >
                  Clear cart
                </button>
              ) : null}
            </div>
          </div>

          {cart.length === 0 ? (
            <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center">
              <p className="text-base font-medium text-slate-800">Cart is empty</p>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Scan a barcode in the bar above, or browse the catalog to add products.
              </p>
              <Button type="button" className="mt-5" onClick={() => setProductPickerOpen(true)}>
                Browse products
              </Button>
            </div>
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {cart.map((l) => {
                  const lineTotal = lineAmount(l);
                  return (
                    <li key={l.key} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{l.productName}</p>
                          <p className="mt-0.5 text-xs text-slate-500">GST {l.gstRate}%</p>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}
                        >
                          Remove
                        </button>
                      </div>
                      {l.trackSerial ? (
                        <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2">
                          <p className="text-xs text-amber-800">
                            IMEI: {l.serialNumbers.length ? l.serialNumbers.join(', ') : 'not selected'}
                          </p>
                          <button
                            type="button"
                            className="mt-1 text-xs font-semibold text-brand"
                            onClick={() => {
                              const product = products.find((p) => p.id === l.productId);
                              if (!product) return;
                              void pickSerials(product, l.quantity, l.serialNumbers).then((picked) => {
                                if (!picked) return;
                                setCart((prev) =>
                                  prev.map((x) => (x.key === l.key ? { ...x, serialNumbers: picked } : x)),
                                );
                              });
                            }}
                          >
                            Pick IMEI
                          </button>
                        </div>
                      ) : null}
                      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50">
                          <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center text-lg font-medium"
                            onClick={() => updateQty(l.key, -1)}
                          >
                            −
                          </button>
                          <span className="min-w-[2rem] text-center text-sm font-semibold">{l.quantity}</span>
                          <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center text-lg font-medium"
                            onClick={() => updateQty(l.key, 1)}
                          >
                            +
                          </button>
                        </div>
                        <label className="text-right">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Rate ₹
                          </span>
                          <input
                            className="mt-0.5 w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-medium"
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.unitPrice}
                            onChange={(e) => updateRate(l.key, toNumber(e.target.value))}
                          />
                        </label>
                        <label className="text-right">
                          <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            Disc ₹
                          </span>
                          <input
                            className="mt-0.5 w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm"
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.discount}
                            onChange={(e) => updateDiscount(l.key, toNumber(e.target.value))}
                          />
                        </label>
                        <p className="min-w-[4.5rem] text-right text-base font-bold text-slate-900">
                          {formatINR(lineTotal)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="pb-3 pr-3">Item</th>
                      <th className="pb-3 text-center">Qty</th>
                      <th className="pb-3 text-right">Rate</th>
                      <th className="pb-3 text-right">Disc ₹</th>
                      <th className="pb-3 text-right">GST</th>
                      <th className="pb-3 text-right">Amount</th>
                      <th className="pb-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((l) => {
                      const lineTotal = lineAmount(l);
                      return (
                        <tr key={l.key} className="border-b border-slate-100 align-top">
                          <td className="py-3 pr-3">
                            <p className="font-medium text-slate-900">{l.productName}</p>
                            {l.trackSerial ? (
                              <div className="mt-1.5 space-y-1">
                                <p className="text-xs text-amber-700">
                                  IMEI:{' '}
                                  {l.serialNumbers.length ? l.serialNumbers.join(', ') : 'not selected'}
                                </p>
                                <button
                                  type="button"
                                  className="text-xs font-semibold text-brand"
                                  onClick={() => {
                                    const product = products.find((p) => p.id === l.productId);
                                    if (!product) return;
                                    void pickSerials(product, l.quantity, l.serialNumbers).then((picked) => {
                                      if (!picked) return;
                                      setCart((prev) =>
                                        prev.map((x) =>
                                          x.key === l.key ? { ...x, serialNumbers: picked } : x,
                                        ),
                                      );
                                    });
                                  }}
                                >
                                  Pick IMEI
                                </button>
                              </div>
                            ) : null}
                          </td>
                          <td className="py-3">
                            <div className="mx-auto flex w-fit items-center rounded-lg border border-slate-200 bg-slate-50">
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center font-medium"
                                onClick={() => updateQty(l.key, -1)}
                              >
                                −
                              </button>
                              <span className="min-w-[1.75rem] text-center text-sm font-semibold">
                                {l.quantity}
                              </span>
                              <button
                                type="button"
                                className="flex h-8 w-8 items-center justify-center font-medium"
                                onClick={() => updateQty(l.key, 1)}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="py-3 text-right">
                            <input
                              className="ml-auto w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm font-medium"
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.unitPrice}
                              onChange={(e) => updateRate(l.key, toNumber(e.target.value))}
                            />
                          </td>
                          <td className="py-3 text-right">
                            <input
                              className="ml-auto w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm"
                              type="number"
                              min="0"
                              step="0.01"
                              value={l.discount}
                              onChange={(e) => updateDiscount(l.key, toNumber(e.target.value))}
                            />
                          </td>
                          <td className="py-3 text-right tabular-nums text-slate-500">{l.gstRate}%</td>
                          <td className="py-3 text-right text-base font-semibold tabular-nums text-slate-900">
                            {formatINR(lineTotal)}
                          </td>
                          <td className="py-3 pl-2 text-right">
                            <button
                              type="button"
                              className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                              onClick={() => setCart((c) => c.filter((x) => x.key !== l.key))}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {totals ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-sm text-slate-600">
                    {cart.reduce((n, l) => n + l.quantity, 0)} unit
                    {cart.reduce((n, l) => n + l.quantity, 0) === 1 ? '' : 's'} · taxable{' '}
                    {formatINR(totals.subtotal)}
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    Bill total <span className="text-brand">{formatINR(payableTotal)}</span>
                  </p>
                </div>
              ) : null}
            </>
          )}
      </Card>

      <Card className="overflow-hidden">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand">Checkout</p>
            <h2 className="text-lg font-semibold text-slate-900">Pay & save</h2>
            <p className="text-sm text-slate-500">Choose payment, confirm total, then save the bill.</p>
          </div>
          {cart.length && totals ? (
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total due</p>
              <p className="text-2xl font-bold tabular-nums text-brand">{formatINR(payableTotal)}</p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="space-y-4">
            {cart.length && totals ? (
              <div
                className={`rounded-xl px-3 py-2.5 text-sm ${
                  Math.abs(paymentBalance) <= 0.05
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-900'
                    : paymentBalance > 0
                      ? 'border border-amber-200 bg-amber-50 text-amber-950'
                      : 'border border-red-200 bg-red-50 text-red-900'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {Math.abs(paymentBalance) <= 0.05
                      ? 'Payments match'
                      : paymentBalance > 0
                        ? 'Still due'
                        : 'Overpaid'}
                  </span>
                  <span className="font-bold tabular-nums">
                    {Math.abs(paymentBalance) <= 0.05
                      ? formatINR(payableTotal)
                      : formatINR(Math.abs(paymentBalance))}
                  </span>
                </div>
                <p className="mt-1 text-xs opacity-80">
                  Collected {formatINR(paymentSum)} of {formatINR(payableTotal)}
                </p>
              </div>
            ) : (
              <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
                Add items to the bill before collecting payment.
              </p>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Payment method</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    disabled={!cart.length}
                    className={`rounded-xl border px-2 py-2.5 text-xs font-semibold transition disabled:opacity-40 ${
                      payments.length === 1 && payments[0].method === m
                        ? 'border-teal-400 bg-teal-50 text-teal-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-teal-200'
                    }`}
                    onClick={() => {
                      const row = newPaymentRow(String(payableTotal || ''));
                      row.method = m;
                      setPayments([row]);
                    }}
                  >
                    {m === 'BANK_TRANSFER'
                      ? 'Bank'
                      : m.charAt(0) + m.slice(1).toLowerCase().replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {payments.map((p, idx) => (
                <div key={p.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Payment {idx + 1}
                    </span>
                    {payments.length > 1 ? (
                      <button
                        type="button"
                        className="text-xs font-medium text-red-600"
                        onClick={() => setPayments((prev) => prev.filter((x) => x.id !== p.id))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      className={selectClassName}
                      value={p.method}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x) =>
                            x.id === p.id ? { ...x, method: e.target.value as PaymentRow['method'] } : x,
                          ),
                        )
                      }
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputClassName}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Amount"
                      value={p.amount}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, amount: e.target.value } : x)),
                        )
                      }
                    />
                  </div>
                  {p.method !== 'CASH' && p.method !== 'CREDIT' ? (
                    <input
                      className={`${inputClassName} mt-2`}
                      placeholder="Reference (optional)"
                      value={p.reference}
                      onChange={(e) =>
                        setPayments((prev) =>
                          prev.map((x) => (x.id === p.id ? { ...x, reference: e.target.value } : x)),
                        )
                      }
                    />
                  ) : null}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPayments((prev) => [
                    ...prev,
                    newPaymentRow(paymentBalance > 0.05 ? String(paymentBalance) : ''),
                  ])
                }
              >
                + Split payment
              </Button>
              {cart.length && Math.abs(paymentBalance) > 0.05 ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setPayments((prev) => {
                      if (!prev.length) return [newPaymentRow(String(payableTotal))];
                      const rest = prev.slice(0, -1);
                      const last = prev[prev.length - 1];
                      const restSum = rest.reduce((s, x) => s + toNumber(x.amount), 0);
                      const fill = Math.max(0, Math.round((payableTotal - restSum) * 100) / 100);
                      return [...rest, { ...last, amount: String(fill) }];
                    });
                  }}
                >
                  Fill remaining
                </Button>
              ) : null}
            </div>

            <label className="block space-y-1 text-sm font-medium text-slate-700">
              <span>Bill notes</span>
              <textarea
                className="min-h-14 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-teal-100"
                placeholder="Optional note…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
            {totals ? (
              <div className="mb-5 space-y-2 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Taxable</span>
                  <span className="tabular-nums">{formatINR(totals.subtotal)}</span>
                </div>
                {totals.supplyType === 'INTRA_STATE' ? (
                  <>
                    <div className="flex justify-between text-slate-600">
                      <span>CGST</span>
                      <span className="tabular-nums">{formatINR(totals.totalCgst)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>SGST</span>
                      <span className="tabular-nums">{formatINR(totals.totalSgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex justify-between text-slate-600">
                    <span>IGST</span>
                    <span className="tabular-nums">{formatINR(totals.totalIgst)}</span>
                  </div>
                )}
                {toNumber(loyaltyRedeem) > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <span>Loyalty</span>
                    <span className="tabular-nums">−{formatINR(Math.floor(toNumber(loyaltyRedeem)))}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold text-slate-900">
                  <span>Total</span>
                  <span className="tabular-nums text-brand">{formatINR(payableTotal)}</span>
                </div>
              </div>
            ) : (
              <p className="mb-5 text-sm text-slate-500">Add items to see totals.</p>
            )}

            <div className="space-y-2">
              <Button
                className="w-full"
                size="lg"
                disabled={saving || !cart.length}
                onClick={() => {
                  const row = newPaymentRow(String(payableTotal));
                  row.method = 'CASH';
                  void saveBill([row]);
                }}
              >
                {saving ? 'Saving…' : `Cash · ${formatINR(payableTotal || 0)}`}
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                disabled={saving || !cart.length}
                onClick={() => void saveBill()}
              >
                {saving ? 'Saving…' : 'Save with payments above'}
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                disabled={saving || !cart.length}
                onClick={() => void holdBill()}
              >
                Hold draft
              </Button>
            </div>
          </div>
        </div>
      </Card>


      {totals && cart.length ? (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-30 border-t border-slate-200 bg-white/95 px-3 py-2.5 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-lg items-center gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-slate-500">
                {cart.length} item{cart.length === 1 ? '' : 's'}
              </p>
              <p className="text-lg font-bold text-brand">{formatINR(payableTotal)}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={saving}
              onClick={() => void holdBill()}
              className="shrink-0"
            >
              Hold
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={saving}
              onClick={() => {
                const row = newPaymentRow(String(payableTotal));
                row.method = 'CASH';
                void saveBill([row]);
              }}
              className="shrink-0"
            >
              {saving ? '…' : 'Cash save'}
            </Button>
          </div>
        </div>
      ) : null}

      <ProductPickerDialog
        open={productPickerOpen}
        products={products}
        reservedQtyByProductId={cart.reduce<Record<string, number>>((acc, l) => {
          acc[l.productId] = (acc[l.productId] ?? 0) + l.quantity;
          return acc;
        }, {})}
        onClose={() => setProductPickerOpen(false)}
        onSelect={(p) => {
          void addProduct(p as Product);
        }}
      />

      {serialPicker ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[80vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Select IMEI / serial</h3>
            <p className="mt-1 text-sm text-slate-500">
              {serialPicker.product.name} — pick {serialPicker.need} unit(s)
            </p>
            <div className="mt-3 max-h-64 space-y-2 overflow-auto">
              {(serialPicker.product.serials ?? [])
                .filter((s) => {
                  const used = usedSerials();
                  return !used.has(s.serialNumber) || serialPicker.selected.includes(s.serialNumber);
                })
                .map((s) => {
                  const checked = serialPicker.selected.includes(s.serialNumber);
                  return (
                    <label
                      key={s.id || s.serialNumber}
                      className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSerialPicker((prev) => {
                            if (!prev) return prev;
                            const set = new Set(prev.selected);
                            if (checked) set.delete(s.serialNumber);
                            else if (set.size < prev.need) set.add(s.serialNumber);
                            return { ...prev, selected: Array.from(set) };
                          });
                        }}
                      />
                      <span className="font-mono">{s.serialNumber}</span>
                    </label>
                  );
                })}
              {!(serialPicker.product.serials ?? []).length ? (
                <p className="text-sm text-amber-700">
                  No available IMEI/serial on this product. Open <strong>Stock-in</strong>, receive the
                  units with serial numbers (GRN), then try again.
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => serialPicker.onDone(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="flex-1"
                disabled={serialPicker.selected.length !== serialPicker.need}
                onClick={() => serialPicker.onDone(serialPicker.selected)}
              >
                Confirm ({serialPicker.selected.length}/{serialPicker.need})
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
