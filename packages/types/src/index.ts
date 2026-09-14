export * from './domain';

export type UserRole = 'OWNER' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN';

export type InvoiceType = 'TAX_INVOICE' | 'BILL_OF_SUPPLY' | 'DELIVERY_CHALLAN';
export type InvoiceStatus = 'DRAFT' | 'FINALIZED' | 'CANCELLED';
export type PaymentMethod = 'CASH' | 'UPI' | 'CARD' | 'CREDIT' | 'BANK_TRANSFER';
export type SupplyType = 'INTRA_STATE' | 'INTER_STATE';

export type CustomerSegment = 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'CORPORATE';
export type PriceListType = 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'WHOLESALE';

export type RepairStatus =
  | 'RECEIVED'
  | 'DIAGNOSED'
  | 'AWAITING_PARTS'
  | 'IN_REPAIR'
  | 'READY'
  | 'DELIVERED'
  | 'CANCELLED';

export type NotificationChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED';

export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';
export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED';

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';

export interface Tenant {
  id: string;
  name: string;
  gstin?: string;
  stateCode: string;
  compositionScheme: boolean;
  logoUrl?: string | null;
  createdAt: string;
}

export interface Branch {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  stateCode: string;
  isDefault: boolean;
}

export interface User {
  id: string;
  tenantId: string;
  branchId?: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface Product {
  id: string;
  tenantId: string;
  sku: string;
  barcode?: string;
  name: string;
  hsnCode: string;
  category?: string;
  brand?: string;
  model?: string;
  unit: string;
  salePrice: number;
  purchasePrice: number;
  gstRate: number;
  stockQty: number;
  lowStockThreshold: number;
  trackSerial: boolean;
}

/** Query params for GET /products (catalog filters). */
export interface ProductListQuery {
  search?: string;
  category?: string;
  brand?: string;
  supplierId?: string;
  /** Exact GST slab, e.g. 18. Omit or use undefined for all slabs. */
  gstRate?: number;
  lowStock?: boolean;
  outOfStock?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ProductStockBucket {
  skuCount: number;
  stockQty: number;
  stockValue: number;
  lowStockCount: number;
}

/** Response from GET /products/stock-summary. */
export interface ProductStockSummary {
  totalSkus: number;
  totalStockQty: number;
  byCategory: Array<ProductStockBucket & { category: string }>;
  byGstSlab: Array<ProductStockBucket & { gstRate: number }>;
}

export interface ProductSerial {
  id: string;
  productId: string;
  serialNumber: string;
  imei?: string;
  condition: 'NEW' | 'REFURB' | 'OPEN_BOX';
  warrantyEnd?: string;
  status: 'IN_STOCK' | 'SOLD' | 'IN_REPAIR';
}

export interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  stateCode?: string;
  segment: CustomerSegment;
  creditLimit: number;
  outstandingBalance: number;
  loyaltyPoints: number;
  tags: string[];
}

export interface InvoiceLine {
  id: string;
  productId: string;
  productName: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxableAmount: number;
  total: number;
  serialNumbers?: string[];
}

export interface Invoice {
  id: string;
  tenantId: string;
  branchId: string;
  customerId?: string;
  invoiceNumber: string;
  type: InvoiceType;
  status: InvoiceStatus;
  supplyType: SupplyType;
  lines: InvoiceLine[];
  subtotal: number;
  totalDiscount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  createdAt: string;
}

export interface Payment {
  id: string;
  invoiceId: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface RepairJob {
  id: string;
  tenantId: string;
  branchId: string;
  customerId: string;
  jobNumber: string;
  deviceModel: string;
  imei?: string;
  issue: string;
  accessories?: string;
  status: RepairStatus;
  estimateAmount?: number;
  finalAmount?: number;
  technicianId?: string;
  warrantyDays: number;
  receivedAt: string;
  deliveredAt?: string;
}

export interface RepairPartUsed {
  id: string;
  repairJobId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface NotificationTemplate {
  id: string;
  tenantId: string;
  name: string;
  channel: NotificationChannel;
  body: string;
  variables: string[];
}

export interface SyncOutboxEntry {
  id: string;
  tenantId: string;
  deviceId: string;
  entityType: string;
  entityId: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  status: SyncStatus;
  createdAt: string;
  syncedAt?: string;
}

export interface JournalEntry {
  id: string;
  tenantId: string;
  date: string;
  description: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  referenceType?: string;
  referenceId?: string;
}

export interface Account {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
}

export interface Gstr1Export {
  gstin: string;
  fp: string;
  b2b: unknown[];
  b2cl: unknown[];
  b2cs: unknown[];
  hsn: unknown[];
}

export interface ItrPrepSummary {
  financialYear: string;
  grossTurnover: number;
  totalExpenses: number;
  netProfit: number;
  depreciation: number;
  presumptiveEligible: boolean;
  presumptiveRate?: number;
}

export interface PriceListItem {
  productId: string;
  priceListType: PriceListType;
  price: number;
  minQty: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
