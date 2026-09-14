import type { LocalProduct } from '../types';

export const PAY_METHODS = ['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'EMI'] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export const PAY_METHOD_OPTIONS = PAY_METHODS.map((m) => ({ value: m, label: m }));

export interface ProductSerial {
  id?: string;
  serialNumber: string;
}

export interface ApiProduct extends LocalProduct {
  trackSerial?: boolean;
  serials?: ProductSerial[];
  hsnCode?: string;
  salePrice?: number;
  gstRate?: number;
  stockQty?: number;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  lowStockThreshold?: number;
  purchasePrice?: number;
  purchase_price?: number;
  mrp?: number | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  gstin?: string | null;
  stateCode?: string | null;
  segment?: 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'CORPORATE';
  creditLimit?: number;
  outstandingBalance?: number;
  loyaltyPoints?: number;
  whatsappOptIn?: boolean;
}

export interface CartLine {
  product: ApiProduct;
  quantity: number;
  unitPrice: number;
  discount: number;
  serialNumbers: string[];
  /** Negative trade-in lines reduce payable */
  isTradeIn?: boolean;
  tradeInLabel?: string;
}

export interface PayRow {
  method: PayMethod;
  amount: string;
  reference: string;
  emiProvider?: string;
  emiTenureMonths?: string;
  emiDownPayment?: string;
}

export interface HeldBill {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  customer?: { id?: string; name?: string; phone?: string | null } | null;
  lines?: Array<{
    productId?: string;
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

export interface BillSlot {
  id: string;
  label: string;
  cart: CartLine[];
  customerId: string;
  customerQuery: string;
  payments: PayRow[];
  loyaltyRedeem: string;
  notes: string;
  heldInvoiceId: string | null;
}

export function emptyBillSlot(label: string, defaultPay: PayMethod = 'CASH'): BillSlot {
  return {
    id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    label,
    cart: [],
    customerId: '',
    customerQuery: '',
    payments: [{ method: defaultPay, amount: '', reference: '' }],
    loyaltyRedeem: '',
    notes: '',
    heldInvoiceId: null,
  };
}
