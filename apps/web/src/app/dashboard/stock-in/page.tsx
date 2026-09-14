'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { nearestGstSlab } from '@retail-sarathi/gst-engine';
import { DocumentViewer } from '@/app/_components/document-viewer';
import { apiWithAuth, normalizeAppDate } from '@/lib/helpers';
import {
  formatInvoiceText,
  looksLikeBinaryGarbage,
  runInvoiceOcr,
  runInvoiceOcrDataUrl,
} from '@/lib/invoice-ocr';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  inputClassName,
  parseError,
  selectClassName,
  textareaClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { UploadDropzone } from '../_components/upload-dropzone';
import { GstSlabSelect } from '../_components/gst-slab-select';
import { CategorySelect } from '../_components/category-select';
import { SupplierSelect } from '../_components/supplier-select';
import {
  ProductFormDialog,
  type ProductFormInitial,
  type SavedProductSummary,
} from '../_components/product-form-dialog';

function parseSerialList(text: string): string[] {
  return (text || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function CollapsibleSection({
  title,
  summary,
  open,
  onToggle,
  children,
  actions,
}: {
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-2 bg-slate-50/80 px-3 py-2.5 sm:px-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onToggle}
          aria-expanded={open}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</span>
          {!open && summary ? (
            <span className="truncate text-xs font-medium text-slate-700">{summary}</span>
          ) : null}
          <span className="ml-auto shrink-0 text-slate-400" aria-hidden>
            {open ? '▾' : '▸'}
          </span>
        </button>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {open ? <div className="border-t border-slate-100 px-3 py-4 sm:px-4">{children}</div> : null}
    </section>
  );
}

interface PurchaseLine {
  name: string;
  quantity: number;
  unitPrice?: number;
  salePrice?: number;
  hsnCode?: string;
  gstRate?: number;
  brand?: string;
  category?: string;
  model?: string;
  barcode?: string;
  productId?: string;
  sku?: string;
  matchedName?: string;
  matchScore?: number;
  matchedVia?: string;
  currentStock?: number;
  createIfMissing?: boolean;
  trackSerial?: boolean;
  catalogTracksSerial?: boolean;
  serialNumbers?: string;
  commitStock?: boolean;
  lineStatus?: string;
  selected?: boolean;
}

interface PurchasePreview {
  supplierName?: string;
  supplierAddress?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  gstin?: string;
  phone?: string;
  customerName?: string;
  customerGstin?: string;
  stateName?: string;
  placeOfSupply?: string;
  irn?: string;
  ackNo?: string;
  ackDate?: string;
  ewayBillNo?: string;
  vehicleNo?: string;
  bankName?: string;
  bankAccount?: string;
  ifsc?: string;
  bankBranch?: string;
  totalAmount?: number;
  taxableValue?: number;
  taxAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  hsnTaxSummary?: Array<{
    hsnCode: string;
    taxableValue: number;
    cgst?: number;
    sgst?: number;
    totalTax?: number;
  }>;
  lines: PurchaseLine[];
  linesMatched: number;
  linesTotal: number;
  extractedText?: string;
  extractedJson?: Record<string, unknown>;
}

function isImageFile(file: File) {
  return (
    file.type.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name)
  );
}

function isPdfFile(file: File) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function isSpreadsheetFile(file: File) {
  return (
    /\.(xlsx|xls)$/i.test(file.name) ||
    /spreadsheet|excel|ms-excel/i.test(file.type)
  );
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

type PdfJsLib = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfJsDoc> };
};

type PdfJsDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
    }) => { promise: Promise<void> };
  }>;
};

function getPdfJs(): PdfJsLib | undefined {
  return (window as Window & { pdfjsLib?: PdfJsLib }).pdfjsLib;
}

/** Extract text from PDF (text layer), or OCR rasterized pages for scanned PDFs. */
async function extractPdfText(file: File): Promise<string> {
  const pdfjs = getPdfJs();
  if (!pdfjs) throw new Error('PDF engine is still loading. Wait 2–3 seconds and try again.');
  pdfjs.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const maxPages = Math.min(doc.numPages, 10);
  const pageTexts: string[] = [];

  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((it) => (typeof it.str === 'string' ? it.str : ''))
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    pageTexts.push(text);
  }

  const joinedLen = pageTexts.join('').replace(/\s/g, '').length;
  // Scanned / image-only PDF → rasterize + OCR
  if (joinedLen < 60) {
    const ocrParts: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      const ocr = await runInvoiceOcrDataUrl(dataUrl);
      if (ocr.trim()) {
        ocrParts.push(maxPages > 1 ? `----- PAGE ${i} -----\n\n${ocr}` : ocr);
      }
    }
    return formatInvoiceText(ocrParts.join('\n\n'));
  }

  if (maxPages === 1) return formatInvoiceText(pageTexts[0] || '');
  return formatInvoiceText(
    pageTexts.map((t, idx) => `----- PAGE ${idx + 1} -----\n\n${t}`).join('\n\n'),
  );
}

function statusBadge(line: PurchaseLine) {
  if (line.trackSerial && !parseSerialList(line.serialNumbers || '').length) {
    return { label: 'Needs serials', className: 'bg-amber-100 text-amber-800' };
  }
  if (line.lineStatus === 'NEEDS_ENRICH' || (!line.productId && !line.barcode)) {
    return { label: 'Needs enrich', className: 'bg-orange-100 text-orange-800' };
  }
  if ((line.matchScore ?? 0) >= 40 || line.matchedVia === 'alias') {
    return { label: 'Ready', className: 'bg-teal-100 text-teal-800' };
  }
  return { label: line.productId ? 'Weak match' : 'New', className: 'bg-slate-100 text-slate-700' };
}

/** Coerce draft/API numeric fields that may arrive as strings. */
function numFieldStr(v: unknown): string {
  if (v == null || v === '') return '';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? String(n) : '';
}

function lineSerialText(v: unknown): string {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean).join('\n');
  if (typeof v === 'string') return v;
  return '';
}

export default function StockInPage() {
  const [text, setText] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadId, setUploadId] = useState<string | undefined>();
  const [uploadedDoc, setUploadedDoc] = useState<{
    url?: string;
    mimeType?: string;
    fileName?: string;
  } | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>();
  const [supplierName, setSupplierName] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<
    Array<{ id: string; name: string; gstin?: string | null; phone?: string | null }>
  >([]);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDup, setInvoiceDup] = useState<{
    exists: boolean;
    invoiceNumber?: string;
    message?: string;
    bill?: { id: string; invoiceNumber: string; status: string; totalAmount: number; supplierName?: string | null };
  } | null>(null);
  const [appendToExistingBill, setAppendToExistingBill] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState('');
  const [gstin, setGstin] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [taxableValue, setTaxableValue] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [cgstAmount, setCgstAmount] = useState('');
  const [sgstAmount, setSgstAmount] = useState('');
  const [igstAmount, setIgstAmount] = useState('');
  const [irn, setIrn] = useState('');
  const [ackNo, setAckNo] = useState('');
  const [ackDate, setAckDate] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [bankBranch, setBankBranch] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [stateName, setStateName] = useState('');
  const [hsnTaxSummary, setHsnTaxSummary] = useState<PurchasePreview['hsnTaxSummary']>([]);
  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [expandedLine, setExpandedLine] = useState<number | null>(0);
  const [extractedJson, setExtractedJson] = useState<Record<string, unknown> | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [dataView, setDataView] = useState<'text' | 'json'>('text');
  const [jsonError, setJsonError] = useState('');
  const [productQuery, setProductQuery] = useState<Record<number, string>>({});
  const [productHits, setProductHits] = useState<
    Record<number, Array<{ id: string; sku: string; name: string; barcode: string | null; trackSerial: boolean; salePrice: number }>>
  >({});
  const [serialDraft, setSerialDraft] = useState<Record<number, string>>({});
  const [barcodeBusy, setBarcodeBusy] = useState<Record<number, boolean>>({});
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [productDialogLine, setProductDialogLine] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [showMoreInvoice, setShowMoreInvoice] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [sectionOpen, setSectionOpen] = useState({
    supplier: true,
    invoice: true,
    items: true,
  });
  const appendFileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCount = useMemo(() => lines.filter((l) => l.selected !== false).length, [lines]);

  const existingSupplierAvailable = useMemo(() => {
    if (supplierId) return true;
    const g = gstin.trim().toUpperCase();
    if (g.length >= 15 && suppliers.some((s) => (s.gstin || '').trim().toUpperCase() === g)) {
      return true;
    }
    const n = supplierName.trim().toLowerCase();
    if (
      n &&
      suppliers.some((s) => {
        if (s.name.trim().toLowerCase() !== n) return false;
        const sg = (s.gstin || '').trim().toUpperCase();
        return !g || !sg || sg === g;
      })
    ) {
      return true;
    }
    return false;
  }, [supplierId, gstin, supplierName, suppliers]);

  useEffect(() => {
    void apiWithAuth<
      Array<{ id: string; name: string; gstin?: string | null; phone?: string | null }>
    >('/suppliers')
      .then(setSuppliers)
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    const key = invoiceNumber.trim();
    if (!key) {
      setInvoiceDup(null);
      setAppendToExistingBill(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiWithAuth<{
        exists: boolean;
        invoiceNumber: string;
        message?: string;
        bill?: {
          id: string;
          invoiceNumber: string;
          status: string;
          totalAmount: number;
          supplierName?: string | null;
        };
      }>(`/purchase-bills/check-invoice?invoiceNumber=${encodeURIComponent(key)}`)
        .then((res) => {
          if (cancelled) return;
          setInvoiceDup(res);
          if (!res.exists) setAppendToExistingBill(false);
        })
        .catch(() => {
          if (!cancelled) setInvoiceDup(null);
        });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [invoiceNumber]);

  useEffect(() => {
    if (!showUploadDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !uploading && !ocrRunning) setShowUploadDialog(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showUploadDialog, uploading, ocrRunning]);

  useEffect(() => {
    if (!uploadId) return;
    void apiWithAuth<{
      url?: string | null;
      mimeType?: string | null;
      originalName?: string;
    }>(`/scan/uploads/${uploadId}`)
      .then((doc) => {
        if (doc.url) {
          setUploadedDoc({
            url: doc.url,
            mimeType: doc.mimeType ?? undefined,
            fileName: doc.originalName,
          });
        }
      })
      .catch(() => undefined);
  }, [uploadId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('draft') !== '1') return;
    try {
      const raw = sessionStorage.getItem('stockInDraft');
      if (!raw) return;
      const data = JSON.parse(raw) as PurchasePreview & {
        draftId?: string;
        supplierId?: string;
        uploadId?: string;
        notes?: string;
        supplierPhone?: string;
        lines?: PurchaseLine[];
        extractedJson?: Record<string, unknown>;
      };
      sessionStorage.removeItem('stockInDraft');
      if (data.draftId) setDraftId(data.draftId);
      if (data.supplierId) setSupplierId(String(data.supplierId));
      if (data.notes) setNotes(String(data.notes));
      const lines = Array.isArray(data.lines) ? data.lines : [];
      applyPreview(
        {
          ...data,
          phone: data.phone || data.supplierPhone,
          lines,
          linesMatched: data.linesMatched ?? lines.filter((l) => l.productId).length,
          linesTotal: data.linesTotal ?? lines.length,
        },
        data.uploadId,
        { resume: true },
      );
      setSuccess(
        lines.length
          ? `Draft resumed — ${data.linesMatched ?? lines.filter((l) => l.productId).length}/${lines.length} catalog matches. Finish enrich and confirm stock-in.`
          : 'Draft resumed — add items, enrich, then confirm.',
      );
    } catch {
      /* ignore */
    }
  }, []);

  function applyPreview(
    preview: PurchasePreview,
    id?: string,
    opts?: { resume?: boolean },
  ) {
    setUploadId(id);
    const resume = Boolean(opts?.resume);
    const nextSupplierName = preview.supplierName || '';
    const nextSupplierAddress = preview.supplierAddress || '';
    const nextSupplierPhone = preview.phone || '';
    const nextInvoiceNumber = preview.invoiceNumber || '';
    const nextInvoiceDate = normalizeAppDate(preview.invoiceDate || '');
    const nextGstin = preview.gstin || '';
    const nextCustomerName = preview.customerName || '';
    const nextCustomerGstin = preview.customerGstin || '';
    const nextStateName = preview.stateName || '';
    const nextPlaceOfSupply = preview.placeOfSupply || '';
    const nextIrn = preview.irn || '';
    const nextAckNo = preview.ackNo || '';
    const nextAckDate = normalizeAppDate(preview.ackDate || '');
    const nextEwayBillNo = preview.ewayBillNo || '';
    const nextVehicleNo = preview.vehicleNo || '';
    const nextBankName = preview.bankName || '';
    const nextBankAccount = preview.bankAccount || '';
    const nextIfsc = preview.ifsc || '';
    const nextBankBranch = preview.bankBranch || '';
    const nextTaxableValue = numFieldStr(preview.taxableValue);
    const nextTaxAmount = numFieldStr(preview.taxAmount);
    const nextCgstAmount = numFieldStr(preview.cgstAmount);
    const nextSgstAmount = numFieldStr(preview.sgstAmount);
    const nextIgstAmount = numFieldStr(preview.igstAmount);
    const nextTotalAmount = numFieldStr(preview.totalAmount);
    const nextHsnTaxSummary = preview.hsnTaxSummary || [];
    const nextLines: PurchaseLine[] = (preview.lines || []).map((line) => {
      if (resume) {
        return {
          ...line,
          selected: line.selected !== false,
          commitStock: line.commitStock !== false,
          createIfMissing: line.createIfMissing ?? !line.productId,
          salePrice:
            line.salePrice ??
            (line.unitPrice ? Math.round(toNumber(line.unitPrice) * 1.2 * 100) / 100 : undefined),
          serialNumbers: lineSerialText(line.serialNumbers),
          trackSerial: Boolean(line.trackSerial),
          catalogTracksSerial: Boolean(line.catalogTracksSerial ?? line.trackSerial),
        };
      }
      return {
        ...line,
        selected: true,
        commitStock: true,
        createIfMissing: line.createIfMissing ?? !line.productId,
        salePrice:
          line.salePrice ??
          (line.unitPrice ? Math.round(toNumber(line.unitPrice) * 1.2 * 100) / 100 : undefined),
        serialNumbers: '',
        // Don't auto-enable — confirm requires serials when true
        trackSerial: false,
        catalogTracksSerial: Boolean(line.trackSerial),
      };
    });

    setSupplierName(nextSupplierName);
    setSupplierAddress(nextSupplierAddress);
    setSupplierPhone(nextSupplierPhone);
    setInvoiceNumber(nextInvoiceNumber);
    setInvoiceDate(nextInvoiceDate);
    setGstin(nextGstin);
    setCustomerName(nextCustomerName);
    setCustomerGstin(nextCustomerGstin);
    setStateName(nextStateName);
    setPlaceOfSupply(nextPlaceOfSupply);
    setIrn(nextIrn);
    setAckNo(nextAckNo);
    setAckDate(nextAckDate);
    setEwayBillNo(nextEwayBillNo);
    setVehicleNo(nextVehicleNo);
    setBankName(nextBankName);
    setBankAccount(nextBankAccount);
    setIfsc(nextIfsc);
    setBankBranch(nextBankBranch);
    setTaxableValue(nextTaxableValue);
    setTaxAmount(nextTaxAmount);
    setCgstAmount(nextCgstAmount);
    setSgstAmount(nextSgstAmount);
    setIgstAmount(nextIgstAmount);
    setTotalAmount(nextTotalAmount);
    setHsnTaxSummary(nextHsnTaxSummary);
    setLines(nextLines);
    setExpandedLine(nextLines.length ? 0 : null);
    setShowMoreInvoice(
      Boolean(
        nextEwayBillNo ||
          nextVehicleNo ||
          nextCustomerName ||
          nextCustomerGstin ||
          nextBankName ||
          nextBankAccount ||
          nextIfsc ||
          nextBankBranch,
      ),
    );

    // JSON always mirrors form fields — never the raw OCR text, never a stale API blob.
    const json = buildJsonPayload({
      supplierName: nextSupplierName,
      supplierAddress: nextSupplierAddress,
      supplierPhone: nextSupplierPhone,
      gstin: nextGstin,
      stateName: nextStateName,
      bankName: nextBankName,
      bankAccount: nextBankAccount,
      ifsc: nextIfsc,
      bankBranch: nextBankBranch,
      invoiceNumber: nextInvoiceNumber,
      invoiceDate: nextInvoiceDate,
      irn: nextIrn,
      ackNo: nextAckNo,
      ackDate: nextAckDate,
      ewayBillNo: nextEwayBillNo,
      vehicleNo: nextVehicleNo,
      placeOfSupply: nextPlaceOfSupply,
      totalAmount: nextTotalAmount,
      taxableValue: nextTaxableValue,
      cgstAmount: nextCgstAmount,
      sgstAmount: nextSgstAmount,
      igstAmount: nextIgstAmount,
      taxAmount: nextTaxAmount,
      hsnTaxSummary: nextHsnTaxSummary,
      customerName: nextCustomerName,
      customerGstin: nextCustomerGstin,
      lines: nextLines,
    });
    setExtractedJson(json);
    setJsonText(prettyJson(json));
    setJsonError('');

    if (preview.extractedText) {
      setText(formatInvoiceText(preview.extractedText));
    }
    const headerFieldCount = [
      nextSupplierName,
      nextGstin,
      nextInvoiceNumber,
      nextTotalAmount,
      nextCustomerName,
    ].filter(Boolean).length;

    if (!nextLines.length) {
      if (headerFieldCount >= 3) {
        setError('');
        setSuccess(
          'Invoice header extracted (supplier, totals, tax). No products on this page — upload the first page or add items manually, then confirm.',
        );
      } else {
        setError('No purchase items found. Check OCR text or upload a clearer invoice.');
        setSuccess('');
      }
    } else {
      setError('');
      const quality = (preview as { extractionQuality?: string }).extractionQuality;
      setSuccess(
        quality === 'poor' || quality === 'fair'
          ? `Parsed ${preview.linesTotal} item(s) — OCR was noisy. Fix supplier/items in the form or JSON, then confirm.`
          : `Parsed ${preview.linesTotal} item(s), ${preview.linesMatched} matched. Review supplier & items, then confirm.`,
      );
      setShowUploadDialog(false);
    }
  }

  async function parseText(raw: string) {
    const preview = await apiWithAuth<PurchasePreview>('/scan/parse-purchase', {
      method: 'POST',
      body: JSON.stringify({ text: raw }),
    });
    applyPreview(preview, uploadId);
  }

  function buildJsonPayload(input: {
    supplierName: string;
    supplierAddress: string;
    supplierPhone: string;
    gstin: string;
    stateName: string;
    bankName: string;
    bankAccount: string;
    ifsc: string;
    bankBranch: string;
    invoiceNumber: string;
    invoiceDate: string;
    irn: string;
    ackNo: string;
    ackDate: string;
    ewayBillNo: string;
    vehicleNo: string;
    placeOfSupply: string;
    totalAmount: string;
    taxableValue: string;
    cgstAmount: string;
    sgstAmount: string;
    igstAmount: string;
    taxAmount: string;
    hsnTaxSummary: NonNullable<PurchasePreview['hsnTaxSummary']>;
    customerName: string;
    customerGstin: string;
    lines: PurchaseLine[];
  }): Record<string, unknown> {
    return {
      supplier: {
        name: input.supplierName || null,
        gstin: input.gstin || null,
        phone: input.supplierPhone || null,
        address: input.supplierAddress || null,
        stateName: input.stateName || null,
        bankName: input.bankName || null,
        bankAccount: input.bankAccount || null,
        ifsc: input.ifsc || null,
        bankBranch: input.bankBranch || null,
      },
      invoice: {
        number: input.invoiceNumber || null,
        date: normalizeAppDate(input.invoiceDate) || input.invoiceDate || null,
        irn: input.irn || null,
        ackNo: input.ackNo || null,
        ackDate: normalizeAppDate(input.ackDate) || input.ackDate || null,
        ewayBillNo: input.ewayBillNo || null,
        vehicleNo: input.vehicleNo || null,
        placeOfSupply: input.placeOfSupply || null,
        totalAmount: input.totalAmount ? toNumber(input.totalAmount) : null,
        taxableValue: input.taxableValue ? toNumber(input.taxableValue) : null,
        cgstAmount: input.cgstAmount ? toNumber(input.cgstAmount) : null,
        sgstAmount: input.sgstAmount ? toNumber(input.sgstAmount) : null,
        igstAmount: input.igstAmount ? toNumber(input.igstAmount) : null,
        taxAmount: input.taxAmount ? toNumber(input.taxAmount) : null,
        hsnTaxSummary: input.hsnTaxSummary || [],
      },
      customer: {
        name: input.customerName || null,
        gstin: input.customerGstin || null,
      },
      items: input.lines.map((l) => ({
        name: l.name,
        hsnCode: l.hsnCode ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice ?? null,
        gstRate: l.gstRate ?? null,
        category: l.category ?? null,
        brand: l.brand ?? null,
      })),
    };
  }

  /** Always from current form — never stale API extractedJson / never OCR text. */
  function buildEditableJson(): Record<string, unknown> {
    return buildJsonPayload({
      supplierName,
      supplierAddress,
      supplierPhone,
      gstin,
      stateName,
      bankName,
      bankAccount,
      ifsc,
      bankBranch,
      invoiceNumber,
      invoiceDate,
      irn,
      ackNo,
      ackDate,
      ewayBillNo,
      vehicleNo,
      placeOfSupply,
      totalAmount,
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      taxAmount,
      hsnTaxSummary: hsnTaxSummary || [],
      customerName,
      customerGstin,
      lines,
    });
  }

  function switchDataView(next: 'text' | 'json') {
    if (next === dataView) return;
    if (next === 'json') {
      const payload = buildEditableJson();
      setExtractedJson(payload);
      setJsonText(prettyJson(payload));
      setJsonError('');
    } else {
      setText((t) => formatInvoiceText(t));
    }
    setDataView(next);
  }

  function applyEditedJson(raw: string): boolean {
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      setJsonError('');
      setExtractedJson(data);
      setJsonText(prettyJson(data));

      const supplier = (data.supplier as Record<string, unknown> | undefined) ?? data;
      const invoice = (data.invoice as Record<string, unknown> | undefined) ?? data;
      const customer = (data.customer as Record<string, unknown> | undefined) ?? {};
      const items = (data.items as unknown[]) || (data.lines as unknown[]) || [];

      if (supplier?.name != null) setSupplierName(String(supplier.name || ''));
      if (supplier?.gstin != null) setGstin(String(supplier.gstin || '').toUpperCase());
      if (supplier?.phone != null) setSupplierPhone(String(supplier.phone || ''));
      if (supplier?.address != null) setSupplierAddress(String(supplier.address || ''));
      if (supplier?.stateName != null) setStateName(String(supplier.stateName || ''));
      if (supplier?.bankName != null) setBankName(String(supplier.bankName || ''));
      if (supplier?.bankAccount != null) setBankAccount(String(supplier.bankAccount || ''));
      if (supplier?.ifsc != null) setIfsc(String(supplier.ifsc || ''));
      if (supplier?.bankBranch != null) setBankBranch(String(supplier.bankBranch || ''));

      if (invoice?.number != null) setInvoiceNumber(String(invoice.number || ''));
      if (invoice?.date != null) setInvoiceDate(normalizeAppDate(String(invoice.date || '')));
      if (invoice?.irn != null) setIrn(String(invoice.irn || ''));
      if (invoice?.ackNo != null) setAckNo(String(invoice.ackNo || ''));
      if (invoice?.ackDate != null) setAckDate(normalizeAppDate(String(invoice.ackDate || '')));
      if (invoice?.ewayBillNo != null) setEwayBillNo(String(invoice.ewayBillNo || ''));
      if (invoice?.vehicleNo != null) setVehicleNo(String(invoice.vehicleNo || ''));
      if (invoice?.placeOfSupply != null) setPlaceOfSupply(String(invoice.placeOfSupply || ''));
      if (invoice?.totalAmount != null) setTotalAmount(String(invoice.totalAmount));
      if (invoice?.taxableValue != null) setTaxableValue(String(invoice.taxableValue));
      if (invoice?.taxAmount != null) setTaxAmount(String(invoice.taxAmount));
      if (invoice?.cgstAmount != null) setCgstAmount(String(invoice.cgstAmount));
      if (invoice?.sgstAmount != null) setSgstAmount(String(invoice.sgstAmount));
      if (invoice?.igstAmount != null) setIgstAmount(String(invoice.igstAmount));

      if (customer?.name != null) setCustomerName(String(customer.name || ''));
      if (customer?.gstin != null) setCustomerGstin(String(customer.gstin || '').toUpperCase());

      if (Array.isArray(items) && items.length) {
        setLines(
          items.map((rawItem) => {
            const item = (rawItem || {}) as Record<string, unknown>;
            const unitPrice = item.unitPrice != null ? toNumber(item.unitPrice) : undefined;
            return {
              name: String(item.name || item.matchedName || ''),
              quantity: item.quantity != null ? toNumber(item.quantity) || 1 : 1,
              unitPrice,
              salePrice:
                item.salePrice != null
                  ? toNumber(item.salePrice)
                  : unitPrice
                    ? Math.round(unitPrice * 1.2 * 100) / 100
                    : undefined,
              hsnCode: item.hsnCode != null ? String(item.hsnCode) : undefined,
              gstRate: item.gstRate != null ? toNumber(item.gstRate) || 18 : 18,
              brand: item.brand != null ? String(item.brand) : undefined,
              category: item.category != null ? String(item.category) : undefined,
              model: item.model != null ? String(item.model) : undefined,
              barcode: item.barcode != null ? String(item.barcode) : undefined,
              productId: item.productId != null ? String(item.productId) : item.matchedProductId != null ? String(item.matchedProductId) : undefined,
              sku: item.sku != null ? String(item.sku) : item.matchedSku != null ? String(item.matchedSku) : undefined,
              createIfMissing: item.createIfMissing !== false,
              selected: true,
              commitStock: true,
              trackSerial: false,
              serialNumbers: '',
              lineStatus: String(item.lineStatus || 'NEEDS_ENRICH'),
            } satisfies PurchaseLine;
          }),
        );
        setExpandedLine(0);
        setShowUploadDialog(false);
      }

      setSuccess('JSON applied — review items and confirm, or switch to Text and Parse.');
      setError('');
      return true;
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
      setError('JSON is invalid — fix it before applying.');
      return false;
    }
  }

  async function handleParseText() {
    try {
      setUploading(true);
      setError('');
      if (dataView === 'json') {
        applyEditedJson(jsonText);
      } else {
        const formatted = formatInvoiceText(text);
        if (formatted !== text) setText(formatted);
        await parseText(formatted);
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setUploading(false);
    }
  }

  function mergePageText(existing: string, pageText: string, pageNo: number) {
    const chunk = pageText.trim();
    if (!chunk) return existing;
    const marker = `\n\n----- PAGE ${pageNo} -----\n\n`;
    let base = existing.trim();
    if (!base) return `----- PAGE ${pageNo} -----\n\n${chunk}`;
    // First time we add page 2+, label the original block as PAGE 1.
    if (pageNo === 2 && !base.includes('----- PAGE ')) {
      base = `----- PAGE 1 -----\n\n${base}`;
    }
    return `${base}${marker}${chunk}`;
  }

  async function handleUpload(file: File, opts?: { append?: boolean }) {
    const append = Boolean(opts?.append);
    try {
      setUploading(true);
      setOcrRunning(false);
      setError('');
      if (!append) setSuccess('');
      let extractedText = '';
      if (isImageFile(file)) {
        setOcrRunning(true);
        extractedText = await runInvoiceOcr(file);
        setOcrRunning(false);
      } else if (isPdfFile(file)) {
        setOcrRunning(true);
        extractedText = await extractPdfText(file);
        setOcrRunning(false);
      } else if (file.type.startsWith('text/') || /\.txt$/i.test(file.name) || /\.csv$/i.test(file.name)) {
        extractedText = await file.text();
      } else if (isSpreadsheetFile(file)) {
        // Server extracts Excel via xlsx — upload without client text
        extractedText = '';
      }
      if (extractedText && looksLikeBinaryGarbage(extractedText)) {
        throw new Error('Could not read text from this file. Try a clearer PNG/JPG photo or a text PDF.');
      }

      const nextPage = append ? Math.max(pageCount, 1) + 1 : 1;
      let merged = extractedText;
      if (append) {
        merged = formatInvoiceText(mergePageText(text, extractedText || '', nextPage));
        setText(merged);
        setPageCount(nextPage);
      } else if (extractedText) {
        const formatted = formatInvoiceText(extractedText);
        setText(formatted);
        merged = formatted;
        const pageMarks = (formatted.match(/----- PAGE\s+\d+/gi) || []).length;
        setPageCount(pageMarks > 0 ? pageMarks : 1);
      }

      const form = new FormData();
      form.append('file', file);
      const textForApi = append ? merged : extractedText ? formatInvoiceText(extractedText) : extractedText;
      if (textForApi) form.append('extractedText', textForApi);

      const result = await apiWithAuth<{
        upload?: {
          id: string;
          originalName?: string;
          mimeType?: string;
          url?: string;
        };
        purchasePreview?: PurchasePreview;
        extractedText?: string;
        message?: string;
        needsOcr?: boolean;
      }>('/scan/upload', { method: 'POST', body: form });

      const id = result.upload?.id;
      if (result.upload?.url) {
        setUploadedDoc({
          url: result.upload.url,
          mimeType: result.upload.mimeType,
          fileName: result.upload.originalName ?? file.name,
        });
      }
      // When appending, keep our merged text (server only saw the latest file).
      if (!append && result.extractedText) {
        setText(formatInvoiceText(result.extractedText));
      }

      const parseSource = append
        ? merged
        : result.extractedText || extractedText || text;

      if (append && parseSource.trim()) {
        await parseText(parseSource);
        setUploadId(id ?? uploadId);
        setSuccess(
          `Another page added. Re-parsed full bill — review items from all pages, then confirm.`,
        );
      } else if (result.purchasePreview?.lines?.length) {
        applyPreview(result.purchasePreview, id);
        if (!append && !extractedText.includes('----- PAGE ')) setPageCount(1);
        setShowUploadDialog(false);
      } else if (parseSource.trim()) {
        await parseText(parseSource);
        setUploadId(id);
        if (!append && !String(parseSource).includes('----- PAGE ')) setPageCount(1);
      } else {
        setError(
          result.message ||
            (extractedText.trim()
              ? 'Text was read but no products matched. Edit the OCR text and click Parse again.'
              : append
                ? 'Could not read this page. Try a straighter photo or rotate the image upright, then add the page again.'
                : 'Could not read text from this photo. Hold the phone straight over the invoice, use good light, or paste invoice text manually then Parse.'),
        );
        if (extractedText.trim()) {
          setSuccess('Partial OCR text loaded — review and edit in the text box, then Parse.');
        }
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setOcrRunning(false);
      setUploading(false);
    }
  }

  function updateLine(index: number, patch: Partial<PurchaseLine>) {
    setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addBlankItem() {
    setLines((current) => {
      const next = [
        ...current,
        {
          name: '',
          quantity: 1,
          unitPrice: 0,
          salePrice: 0,
          category: 'General',
          gstRate: 18,
          hsnCode: '8504',
          sku: '',
          createIfMissing: true,
          selected: true,
          commitStock: true,
          trackSerial: false,
          serialNumbers: '',
          lineStatus: 'NEEDS_ENRICH',
        },
      ];
      setExpandedLine(next.length - 1);
      return next;
    });
  }

  function removeItem(index: number) {
    setLines((current) => current.filter((_, i) => i !== index));
    setExpandedLine((cur) => {
      if (cur == null) return null;
      if (cur === index) return null;
      if (cur > index) return cur - 1;
      return cur;
    });
    setProductDialogLine((cur) => {
      if (cur == null) return null;
      if (cur === index) return null;
      if (cur > index) return cur - 1;
      return cur;
    });
    setSerialDraft((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const i = Number(k);
        if (i < index) next[i] = v;
        else if (i > index) next[i - 1] = v;
      });
      return next;
    });
  }

  function startManualReceive() {
    setError('');
    setSuccess('Manual receive started — fill supplier, scan barcode or enter SN, then confirm.');
    if (lines.length === 0) addBlankItem();
    else setExpandedLine(0);
  }

  async function loadSupplierDetail(id: string) {
    if (!id) return;
    try {
      const res = await apiWithAuth<{
        supplier: {
          id: string;
          name: string;
          gstin?: string | null;
          phone?: string | null;
          address?: string | null;
          bankName?: string | null;
          bankAccount?: string | null;
          ifsc?: string | null;
          bankBranch?: string | null;
        };
      }>(`/suppliers/${id}`);
      const s = res.supplier;
      setSupplierId(s.id);
      setSupplierName(s.name || '');
      setGstin((s.gstin || '').toUpperCase());
      setSupplierPhone(s.phone || '');
      setSupplierAddress(s.address || '');
      setBankName(s.bankName || '');
      setBankAccount(s.bankAccount || '');
      setIfsc((s.ifsc || '').toUpperCase());
      setBankBranch(s.bankBranch || '');
    } catch {
      /* keep typed fields */
    }
  }

  async function saveSupplierNow() {
    if (!supplierName.trim() && !supplierId) {
      setError('Enter a supplier name or select one from the list.');
      return;
    }
    setSavingSupplier(true);
    setError('');
    try {
      const normalizedGstin = gstin.trim().toUpperCase();
      // Prefer linking an existing GSTIN match instead of posting a duplicate create.
      let targetId = supplierId;
      if (!targetId && normalizedGstin) {
        const hit = suppliers.find((s) => (s.gstin || '').trim().toUpperCase() === normalizedGstin);
        if (hit) targetId = hit.id;
      }
      if (!targetId && supplierName.trim()) {
        const hit = suppliers.find(
          (s) =>
            s.name.trim().toLowerCase() === supplierName.trim().toLowerCase() &&
            (!(s.gstin || '').trim() ||
              !normalizedGstin ||
              (s.gstin || '').trim().toUpperCase() === normalizedGstin),
        );
        if (hit) targetId = hit.id;
      }

      const body = {
        name: supplierName.trim() || 'Supplier',
        phone: supplierPhone.trim() || undefined,
        gstin: normalizedGstin || undefined,
        address: supplierAddress.trim() || undefined,
        bankName: bankName.trim() || undefined,
        bankAccount: bankAccount.trim() || undefined,
        ifsc: ifsc.trim() || undefined,
        bankBranch: bankBranch.trim() || undefined,
      };
      const existedBefore = Boolean(targetId);
      const saved = targetId
        ? await apiWithAuth<{ id: string; name: string; gstin?: string | null; phone?: string | null }>(
            `/suppliers/${targetId}`,
            {
              method: 'PATCH',
              body: JSON.stringify(body),
            },
          )
        : await apiWithAuth<{ id: string; name: string; gstin?: string | null; phone?: string | null }>(
            '/suppliers',
            {
              method: 'POST',
              body: JSON.stringify(body),
            },
          );
      setSupplierId(saved.id);
      setSupplierName(saved.name);
      if (saved.gstin) setGstin(String(saved.gstin).toUpperCase());
      setSuppliers((prev) => {
        const next = {
          id: saved.id,
          name: saved.name,
          gstin: (saved.gstin ?? normalizedGstin) || null,
          phone: (saved.phone ?? supplierPhone) || null,
        };
        const withoutDupGstin = normalizedGstin
          ? prev.filter(
              (s) => s.id === saved.id || (s.gstin || '').trim().toUpperCase() !== normalizedGstin,
            )
          : prev;
        return withoutDupGstin.some((s) => s.id === saved.id)
          ? withoutDupGstin.map((s) => (s.id === saved.id ? { ...s, ...next } : s))
          : [...withoutDupGstin, next];
      });
      setSuccess(
        existedBefore
          ? `Linked to existing supplier “${saved.name}”${normalizedGstin ? ` (${normalizedGstin})` : ''}.`
          : `Supplier “${saved.name}” saved.`,
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSavingSupplier(false);
    }
  }

  async function lookupBarcode(index: number, raw: string) {
    const barcode = raw.trim();
    if (!barcode) return;
    setBarcodeBusy((prev) => ({ ...prev, [index]: true }));
    setError('');
    try {
      const hits = await apiWithAuth<
        Array<{ id: string; sku: string; name: string; barcode: string | null; trackSerial: boolean; salePrice: number }>
      >(`/scan/products/search?q=${encodeURIComponent(barcode)}`);
      const exact =
        hits.find((p) => (p.barcode || '').toLowerCase() === barcode.toLowerCase()) ||
        hits.find((p) => p.sku.toLowerCase() === barcode.toLowerCase());
      if (exact) {
        linkProduct(index, exact);
        setSuccess(`Linked “${exact.name}” from barcode/SKU scan.`);
        return;
      }
      try {
        const p = await apiWithAuth<{
          id: string;
          sku: string;
          name: string;
          barcode: string | null;
          trackSerial: boolean;
          salePrice: number | string;
        }>(`/products/barcode/${encodeURIComponent(barcode)}`);
        linkProduct(index, {
          id: p.id,
          sku: p.sku,
          name: p.name,
          barcode: p.barcode,
          trackSerial: p.trackSerial,
          salePrice: toNumber(p.salePrice),
        });
        setSuccess(`Linked “${p.name}” from barcode.`);
      } catch {
        updateLine(index, { barcode, createIfMissing: true });
        setSuccess(`No catalog match for ${barcode} — keep typing details or open full product form.`);
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBarcodeBusy((prev) => ({ ...prev, [index]: false }));
    }
  }

  function appendSerial(index: number, raw: string) {
    const sn = raw.trim();
    if (!sn) return;
    const line = lines[index];
    if (!line) return;
    const existing = parseSerialList(line.serialNumbers || '');
    if (existing.some((s) => s.toLowerCase() === sn.toLowerCase())) {
      setSerialDraft((prev) => ({ ...prev, [index]: '' }));
      return;
    }
    const next = [...existing, sn];
    updateLine(index, {
      serialNumbers: next.join('\n'),
      trackSerial: true,
      lineStatus:
        next.length >= Math.round(toNumber(line.quantity)) ? 'READY' : 'NEEDS_SERIALS',
    });
    setSerialDraft((prev) => ({ ...prev, [index]: '' }));
  }

  function productDialogInitial(index: number): ProductFormInitial | null {
    const line = lines[index];
    if (!line) return null;
    if (line.productId) {
      return {
        id: line.productId,
        sku: line.sku || '',
        name: line.matchedName || line.name,
        barcode: line.barcode,
        hsnCode: line.hsnCode || '8504',
        category: line.category,
        brand: line.brand,
        model: line.model,
        salePrice: line.salePrice ?? 0,
        purchasePrice: line.unitPrice ?? 0,
        gstRate: line.gstRate ?? 18,
        stockQty: line.currentStock ?? 0,
        trackSerial: Boolean(line.trackSerial || line.catalogTracksSerial),
      };
    }
    return {
      sku: line.sku || '',
      name: line.name,
      barcode: line.barcode,
      hsnCode: line.hsnCode || '8504',
      category: line.category,
      brand: line.brand,
      model: line.model,
      salePrice: line.salePrice ?? 0,
      purchasePrice: line.unitPrice ?? 0,
      gstRate: line.gstRate ?? 18,
      stockQty: 0,
      trackSerial: Boolean(line.trackSerial),
    };
  }

  function onProductDialogSaved(index: number, product?: SavedProductSummary) {
    if (!product) return;
    linkProduct(index, product);
    updateLine(index, {
      name: product.name,
      createIfMissing: false,
    });
    setSuccess(`Catalog product “${product.name}” ready — enter qty/serials and confirm stock-in.`);
  }

  function buildPayloadLines() {
    return lines
      .filter((l) => l.selected !== false && l.name.trim() && toNumber(l.quantity) > 0)
      .map((l) => {
        const serials = parseSerialList(l.serialNumbers || '');
        return {
          name: l.name.trim(),
          quantity: toNumber(l.quantity),
          unitPrice: l.unitPrice != null ? toNumber(l.unitPrice) : undefined,
          salePrice: l.salePrice != null ? toNumber(l.salePrice) : undefined,
          hsnCode: l.hsnCode,
          gstRate: l.gstRate != null ? nearestGstSlab(toNumber(l.gstRate)) : undefined,
          brand: l.brand,
          category: l.category,
          model: l.model,
          sku: l.sku,
          barcode: l.barcode?.trim() || undefined,
          productId: l.productId,
          createIfMissing: l.createIfMissing !== false,
          trackSerial: Boolean(l.trackSerial),
          serialNumbers: serials.length ? serials : undefined,
          commitStock: l.commitStock !== false,
        };
      });
  }

  async function confirmStockIn() {
    const payloadLines = buildPayloadLines();
    if (!payloadLines.length) {
      setError('Select at least one valid item with name and quantity.');
      return;
    }
    if (invoiceNumber.trim() && invoiceDup?.exists && !appendToExistingBill) {
      setError(
        invoiceDup.message ||
          `Invoice ${invoiceNumber.trim()} already exists. Change the number, void the old bill, or check “Add lines to existing bill”.`,
      );
      return;
    }
    for (const line of payloadLines) {
      if (line.trackSerial && line.commitStock !== false) {
        const need = Math.round(line.quantity);
        if ((line.serialNumbers?.length ?? 0) !== need) {
          setError(`"${line.name}" needs exactly ${need} serial number(s).`);
          return;
        }
      }
    }
    try {
      setConfirming(true);
      setError('');
      setSuccess('');
      const result = await apiWithAuth<{
        message: string;
        supplier?: { id: string; name: string; gstin?: string | null; address?: string | null };
        purchaseBill?: { id: string; invoiceNumber: string; totalAmount?: number };
        items: Array<{
          name: string;
          quantityAdded: number;
          newStock: number;
          created: boolean;
          sku: string;
          needsEnrichment: boolean;
          serialsAdded: number;
        }>;
      }>('/scan/confirm-stock-in', {
        method: 'POST',
        body: JSON.stringify({
          uploadId,
          draftId,
          supplierId: supplierId || undefined,
          supplierName: supplierName || undefined,
          supplierAddress: supplierAddress || undefined,
          supplierPhone: supplierPhone || undefined,
          invoiceNumber: invoiceNumber || undefined,
          invoiceDate: invoiceDate || undefined,
          gstin: gstin || undefined,
          taxableValue: taxableValue ? toNumber(taxableValue) : undefined,
          taxAmount: taxAmount ? toNumber(taxAmount) : undefined,
          totalAmount: totalAmount ? toNumber(totalAmount) : undefined,
          cgstAmount: cgstAmount ? toNumber(cgstAmount) : undefined,
          sgstAmount: sgstAmount ? toNumber(sgstAmount) : undefined,
          igstAmount: igstAmount ? toNumber(igstAmount) : undefined,
          irn: irn || undefined,
          ackNo: ackNo || undefined,
          ackDate: ackDate || undefined,
          ewayBillNo: ewayBillNo || undefined,
          vehicleNo: vehicleNo || undefined,
          bankName: bankName || undefined,
          bankAccount: bankAccount || undefined,
          ifsc: ifsc || undefined,
          bankBranch: bankBranch || undefined,
          placeOfSupply: placeOfSupply || undefined,
          stateName: stateName || undefined,
          customerName: customerName || undefined,
          customerGstin: customerGstin || undefined,
          notes: notes.trim() || undefined,
          appendToExistingBill: appendToExistingBill || undefined,
          lines: payloadLines,
        }),
      });
      if (result.supplier?.id) {
        setSupplierId(result.supplier.id);
        setSuppliers((prev) =>
          prev.some((s) => s.id === result.supplier!.id)
            ? prev
            : [...prev, { id: result.supplier!.id, name: result.supplier!.name }],
        );
      }
      const enrichCount = result.items.filter((i) => i.needsEnrichment).length;
      setSuccess(
        `${result.message}. ${result.items
          .map(
            (i) =>
              `${i.name}: +${i.quantityAdded} → ${i.newStock}${i.created ? ' (new)' : ''}${
                i.serialsAdded ? ` · ${i.serialsAdded} serials` : ''
              }${i.needsEnrichment ? ' · queued' : ''}`,
          )
          .join(' · ')}${
          enrichCount
            ? ` — ${enrichCount} item(s) in Complete product queue.`
            : ''
        }${result.supplier ? ` · Saved in Suppliers.` : ''}`,
      );
      setLines([]);
      setExpandedLine(null);
      setDraftId(undefined);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setConfirming(false);
    }
  }

  async function saveDraft() {
    try {
      setSavingDraft(true);
      setError('');
      const draft = await apiWithAuth<{ id: string }>('/scan/drafts', {
        method: 'POST',
        body: JSON.stringify({
          draftId,
          uploadId,
          supplierName: supplierName || undefined,
          invoiceNumber: invoiceNumber || undefined,
          invoiceDate: invoiceDate || undefined,
          gstin: gstin || undefined,
          notes: notes.trim() || undefined,
          previewJson: {
            supplierId: supplierId || undefined,
            supplierName,
            supplierAddress,
            supplierPhone,
            invoiceNumber,
            invoiceDate,
            gstin,
            notes,
            customerName,
            customerGstin,
            stateName,
            placeOfSupply,
            irn,
            ackNo,
            ackDate,
            ewayBillNo,
            vehicleNo,
            bankName,
            bankAccount,
            ifsc,
            bankBranch,
            taxableValue: taxableValue || undefined,
            taxAmount: taxAmount || undefined,
            cgstAmount: cgstAmount || undefined,
            sgstAmount: sgstAmount || undefined,
            igstAmount: igstAmount || undefined,
            totalAmount: totalAmount || undefined,
            hsnTaxSummary,
            lines,
            linesMatched: lines.filter((l) => l.productId).length,
            linesTotal: lines.length,
            extractedJson,
            uploadId,
          },
        }),
      });
      setDraftId(draft.id);
      setSuccess(`Draft saved (${draft.id.slice(0, 8)}…). Resume anytime from Stock drafts.`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSavingDraft(false);
    }
  }

  async function searchProducts(index: number, q: string) {
    setProductQuery((prev) => ({ ...prev, [index]: q }));
    if (q.trim().length < 2) {
      setProductHits((prev) => ({ ...prev, [index]: [] }));
      return;
    }
    try {
      const hits = await apiWithAuth<
        Array<{ id: string; sku: string; name: string; barcode: string | null; trackSerial: boolean; salePrice: number }>
      >(`/scan/products/search?q=${encodeURIComponent(q.trim())}`);
      setProductHits((prev) => ({ ...prev, [index]: hits }));
    } catch {
      setProductHits((prev) => ({ ...prev, [index]: [] }));
    }
  }

  function linkProduct(
    index: number,
    p: { id: string; sku: string; name: string; barcode: string | null; trackSerial: boolean; salePrice: number },
  ) {
    updateLine(index, {
      productId: p.id,
      sku: p.sku,
      matchedName: p.name,
      barcode: p.barcode || undefined,
      trackSerial: p.trackSerial,
      salePrice: Number(p.salePrice),
      createIfMissing: false,
      matchScore: 100,
      matchedVia: 'manual',
      lineStatus: p.trackSerial ? 'NEEDS_SERIALS' : 'READY',
    });
    setProductHits((prev) => ({ ...prev, [index]: [] }));
    setProductQuery((prev) => ({ ...prev, [index]: '' }));
  }

  return (
    <div className={pageShellClassName}>
      <Script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js" strategy="afterInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js" strategy="afterInteractive" />

      <PageHeader
        title="Stock-in / Receive goods"
        description="Start with the supplier invoice — it fills supplier, bill totals, and items. Then review and confirm."
        actions={
          <Button type="button" onClick={() => setShowUploadDialog(true)}>
            Upload / paste invoice
          </Button>
        }
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/dashboard/products-needing-details" className="font-medium text-teal-700 underline">
          Complete product queue
        </Link>
        <Link href="/dashboard/stock-drafts" className="font-medium text-teal-700 underline">
          Stock drafts
        </Link>
        <Link href="/dashboard/products" className="font-medium text-teal-700 underline">
          Catalog (Add product)
        </Link>
        <Link href="/dashboard/suppliers" className="font-medium text-teal-700 underline">
          Suppliers
        </Link>
        {(pageCount > 0 || text.trim() || uploadedDoc) && (
          <button
            type="button"
            className="font-medium text-teal-700 underline"
            onClick={() => setShowUploadDialog(true)}
          >
            Edit invoice text ({pageCount || 1} page{pageCount === 1 ? '' : 's'})
          </button>
        )}
      </div>

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-slate-200">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Review & confirm receive</h2>
              <p className="text-sm text-slate-500">
                Scan barcode (Enter to lookup). Serial-tracked items need one SN per unit. Add or remove items, then confirm.
              </p>
            </div>

            <div className="space-y-3">
              <CollapsibleSection
                title="Supplier"
                open={sectionOpen.supplier}
                onToggle={() => setSectionOpen((s) => ({ ...s, supplier: !s.supplier }))}
                summary={
                  supplierName.trim()
                    ? `${supplierName.trim()}${gstin.trim() ? ` · ${gstin.trim()}` : ''}`
                    : 'No supplier selected'
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                    <span>Select supplier</span>
                    <SupplierSelect
                      value={supplierId}
                      suppliers={suppliers}
                      onChange={(id) => {
                        setSupplierId(id);
                        if (id) void loadSupplierDetail(id);
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Supplier name</span>
                    <input className={inputClassName} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>GSTIN</span>
                    <input
                      className={inputClassName}
                      value={gstin}
                      onChange={(e) => setGstin(e.target.value.toUpperCase())}
                      onBlur={() => {
                        const g = gstin.trim().toUpperCase();
                        if (!g || g.length < 15) return;
                        const hit = suppliers.find((s) => (s.gstin || '').trim().toUpperCase() === g);
                        if (hit && hit.id !== supplierId) {
                          setSupplierId(hit.id);
                          void loadSupplierDetail(hit.id);
                          setSuccess(`Matched existing supplier “${hit.name}” by GSTIN.`);
                        }
                      }}
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                    <span>Supplier address</span>
                    <input
                      className={inputClassName}
                      value={supplierAddress}
                      onChange={(e) => setSupplierAddress(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Supplier phone</span>
                    <input className={inputClassName} value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>State</span>
                    <input className={inputClassName} value={stateName} onChange={(e) => setStateName(e.target.value)} />
                  </label>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={
                        savingSupplier ||
                        existingSupplierAvailable ||
                        (!supplierName.trim() && !supplierId)
                      }
                      title={
                        existingSupplierAvailable
                          ? 'Supplier already in master — select it from the list. Edit details on Suppliers if needed.'
                          : undefined
                      }
                      onClick={() => void saveSupplierNow()}
                    >
                      {savingSupplier
                        ? 'Saving…'
                        : existingSupplierAvailable
                          ? 'Already saved'
                          : 'Save supplier'}
                    </Button>
                    {existingSupplierAvailable ? (
                      <span className="text-xs text-slate-500">
                        Already in master
                        {supplierId ? ' · selected' : ' · match found'}
                        . Use Suppliers page to edit.
                      </span>
                    ) : null}
                  </div>
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title="Invoice / bill"
                open={sectionOpen.invoice}
                onToggle={() => setSectionOpen((s) => ({ ...s, invoice: !s.invoice }))}
                summary={
                  invoiceNumber.trim() || totalAmount.trim()
                    ? [invoiceNumber.trim() || null, invoiceDate.trim() || null, totalAmount.trim() ? `₹${totalAmount.trim()}` : null]
                        .filter(Boolean)
                        .join(' · ')
                    : 'No invoice details'
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Invoice no.</span>
                    <input
                      className={inputClassName}
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="Must be unique — blocks duplicate purchase bills"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Invoice date</span>
                    <input className={inputClassName} value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} placeholder="YYYY-MM-DD" />
                  </label>
                  {invoiceDup?.exists && invoiceDup.bill ? (
                    <div className="sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
                      <p className="font-medium">
                        Invoice {invoiceDup.bill.invoiceNumber} already posted ({invoiceDup.bill.status}
                        {invoiceDup.bill.supplierName ? ` · ${invoiceDup.bill.supplierName}` : ''}
                        {` · ₹${Number(invoiceDup.bill.totalAmount).toLocaleString('en-IN')}`}).
                      </p>
                      <p className="mt-1 text-amber-800/90">
                        Change the invoice number, or{' '}
                        <Link
                          href={`/dashboard/purchase-bills/${invoiceDup.bill.id}`}
                          className="font-semibold text-teal-800 underline"
                        >
                          open the existing bill
                        </Link>
                        . To add more stock lines to that bill, check below.
                      </p>
                      <label className="mt-2 flex items-center gap-2 font-medium text-amber-950">
                        <input
                          type="checkbox"
                          checked={appendToExistingBill}
                          onChange={(e) => setAppendToExistingBill(e.target.checked)}
                        />
                        Add lines to existing bill (append)
                      </label>
                    </div>
                  ) : null}
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Taxable value</span>
                    <input className={inputClassName} value={taxableValue} onChange={(e) => setTaxableValue(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Tax amount</span>
                    <input className={inputClassName} value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Grand total</span>
                    <input className={inputClassName} value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                    <span>Notes</span>
                    <input
                      className={inputClassName}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional receive notes (damage, partial, etc.)"
                    />
                  </label>
                  <div className="sm:col-span-2 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                      onClick={() => setShowMoreInvoice((v) => !v)}
                      aria-expanded={showMoreInvoice}
                    >
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Buyer, e-way &amp; bank
                      </span>
                      {!showMoreInvoice ? (
                        <span className="truncate text-xs font-medium text-slate-600">Optional details</span>
                      ) : null}
                      <span className="ml-auto shrink-0 text-slate-400" aria-hidden>
                        {showMoreInvoice ? '▾' : '▸'}
                      </span>
                    </button>
                    {showMoreInvoice ? (
                      <div className="grid gap-3 border-t border-slate-200 bg-white px-3 py-3 sm:grid-cols-2">
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>e-Way Bill</span>
                          <input className={inputClassName} value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} />
                        </label>
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>Vehicle no.</span>
                          <input className={inputClassName} value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} />
                        </label>
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>Buyer (ship to)</span>
                          <input className={inputClassName} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                        </label>
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>Buyer GSTIN</span>
                          <input
                            className={inputClassName}
                            value={customerGstin}
                            onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                          />
                        </label>
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>Bank name</span>
                          <input className={inputClassName} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HDFC Bank" />
                        </label>
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>A/c number</span>
                          <input
                            className={inputClassName}
                            value={bankAccount}
                            onChange={(e) => setBankAccount(e.target.value.replace(/[^\d]/g, ''))}
                            placeholder="Account number"
                            inputMode="numeric"
                          />
                        </label>
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>IFSC</span>
                          <input
                            className={inputClassName}
                            value={ifsc}
                            onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                            placeholder="HDFC0001234"
                          />
                        </label>
                        <label className="space-y-1 text-sm font-medium text-slate-700">
                          <span>Bank branch</span>
                          <input className={inputClassName} value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} />
                        </label>
                      </div>
                    ) : null}
                  </div>
                  {(irn || ackNo || placeOfSupply || (hsnTaxSummary && hsnTaxSummary.length > 0)) && (
                    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 space-y-1">
                      {irn ? <p>IRN: {irn.slice(0, 24)}…</p> : null}
                      {ackNo ? (
                        <p>
                          Ack {ackNo}
                          {ackDate ? ` · ${ackDate}` : ''}
                        </p>
                      ) : null}
                      {placeOfSupply ? <p>Place of supply: {placeOfSupply}</p> : null}
                      {cgstAmount || sgstAmount ? (
                        <p>
                          CGST {cgstAmount || '—'} · SGST {sgstAmount || '—'}
                          {igstAmount ? ` · IGST ${igstAmount}` : ''}
                        </p>
                      ) : null}
                      {hsnTaxSummary && hsnTaxSummary.length > 0 ? (
                        <p>
                          HSN tax:{' '}
                          {hsnTaxSummary
                            .map((h) => `${h.hsnCode}=${h.taxableValue}`)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              <CollapsibleSection
                title={`Items (${lines.length})`}
                open={sectionOpen.items}
                onToggle={() => setSectionOpen((s) => ({ ...s, items: !s.items }))}
                summary={
                  lines.length
                    ? `${selectedCount} selected · uncheck to skip · Remove deletes`
                    : 'No items yet'
                }
                actions={
                  <Button type="button" variant="secondary" size="sm" onClick={addBlankItem}>
                    + Add item
                  </Button>
                }
              >
            {lines.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                <p>No items yet. Upload/parse an invoice, or add items manually.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  <Button type="button" onClick={() => setShowUploadDialog(true)}>
                    Upload / paste invoice
                  </Button>
                  <Button type="button" variant="secondary" onClick={startManualReceive}>
                    Start manual receive
                  </Button>
                  <Button type="button" variant="secondary" onClick={addBlankItem}>
                    + Add item
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Expand an item to edit. Uncheck to skip on confirm; Remove deletes it from this receive.
                </p>
                {lines.map((line, index) => {
                  const badge = statusBadge(line);
                  const open = expandedLine === index;
                  const lineTotal = toNumber(line.quantity) * toNumber(line.unitPrice);
                  const snCount = parseSerialList(line.serialNumbers || '').length;
                  const snNeed = Math.round(toNumber(line.quantity));
                  return (
                    <div
                      key={`item-${index}`}
                      className={`overflow-hidden rounded-xl border bg-white ${
                        line.selected === false ? 'border-slate-200 opacity-60' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-start gap-2 px-3 py-3 sm:px-4">
                        <input
                          type="checkbox"
                          className="mt-1.5"
                          title="Include in confirm"
                          checked={line.selected !== false}
                          onChange={(e) => updateLine(index, { selected: e.target.checked })}
                        />
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => setExpandedLine(open ? null : index)}
                        >
                          <span className="block font-semibold text-slate-900">
                            {line.name?.trim() || `Item ${index + 1}`}
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            Qty {line.quantity}
                            {line.unitPrice ? ` · @ ${formatINR(toNumber(line.unitPrice))}` : ''}
                            {lineTotal ? ` · ${formatINR(lineTotal)}` : ''}
                            {line.barcode ? ` · ${line.barcode}` : ''}
                            {line.matchedName ? ` · → ${line.matchedName}` : ''}
                            {line.trackSerial ? ` · SN ${snCount}/${snNeed}` : ''}
                          </span>
                          <span className="mt-2 flex flex-wrap gap-1.5">
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>
                              {badge.label}
                            </span>
                            {line.matchedVia === 'alias' ? (
                              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
                                Alias
                              </span>
                            ) : null}
                            {!line.barcode ? (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                No barcode
                              </span>
                            ) : null}
                            {!line.hsnCode ? (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                                No HSN
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="mt-1 shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                          onClick={() => removeItem(index)}
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          className="mt-1 shrink-0 px-1 text-slate-400"
                          onClick={() => setExpandedLine(open ? null : index)}
                          aria-label={open ? 'Collapse' : 'Expand'}
                        >
                          {open ? '▾' : '▸'}
                        </button>
                      </div>

                      {open ? (
                      <div className="border-t border-slate-100 bg-slate-50/50 px-3 py-4 sm:px-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2 lg:col-span-3">
                          Item name *
                          <input
                            className={inputClassName}
                            value={line.name}
                            onChange={(e) => updateLine(index, { name: e.target.value })}
                            placeholder="Product description as on invoice"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Qty to receive *
                          <input
                            className={inputClassName}
                            type="number"
                            min="0"
                            step="0.001"
                            value={line.quantity}
                            onChange={(e) => updateLine(index, { quantity: toNumber(e.target.value) })}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Purchase rate
                          <input
                            className={inputClassName}
                            type="number"
                            value={line.unitPrice ?? ''}
                            onChange={(e) => updateLine(index, { unitPrice: toNumber(e.target.value) })}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Sale price
                          <input
                            className={inputClassName}
                            type="number"
                            value={line.salePrice ?? ''}
                            onChange={(e) => updateLine(index, { salePrice: toNumber(e.target.value) })}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Amount
                          <input className={inputClassName} readOnly value={lineTotal ? formatINR(lineTotal) : '—'} />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Barcode / scan
                          <input
                            className={inputClassName}
                            value={line.barcode || ''}
                            onChange={(e) => updateLine(index, { barcode: e.target.value })}
                            onBlur={(e) => void lookupBarcode(index, e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void lookupBarcode(index, (e.target as HTMLInputElement).value);
                              }
                            }}
                            placeholder="Scan — Enter to lookup"
                            autoComplete="off"
                          />
                          {barcodeBusy[index] ? (
                            <span className="mt-1 block font-normal normal-case text-slate-500">Looking up…</span>
                          ) : null}
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          SKU
                          <input
                            className={inputClassName}
                            value={line.sku || ''}
                            onChange={(e) => updateLine(index, { sku: e.target.value })}
                            placeholder="Shop SKU"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          HSN *
                          <input
                            className={inputClassName}
                            value={line.hsnCode || ''}
                            onChange={(e) => updateLine(index, { hsnCode: e.target.value })}
                            placeholder="85071000"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Model
                          <input
                            className={inputClassName}
                            value={line.model || ''}
                            onChange={(e) => updateLine(index, { model: e.target.value })}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Brand
                          <input
                            className={inputClassName}
                            value={line.brand || ''}
                            onChange={(e) => updateLine(index, { brand: e.target.value })}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Category
                          <CategorySelect
                            value={line.category || ''}
                            onChange={(v) => updateLine(index, { category: v || 'General' })}
                            autoLoad
                            emptyLabel="Select category"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          GST %
                          <GstSlabSelect
                            value={line.gstRate ?? 18}
                            onChange={(value) => updateLine(index, { gstRate: toNumber(value) })}
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2 lg:col-span-3">
                          Link catalog product
                          <input
                            className={inputClassName}
                            value={productQuery[index] || ''}
                            onChange={(e) => void searchProducts(index, e.target.value)}
                            placeholder="Search name / SKU / barcode"
                          />
                          {(productHits[index] || []).length > 0 ? (
                            <ul className="mt-1 max-h-32 overflow-auto rounded-lg border border-slate-200 bg-white text-sm">
                              {productHits[index].map((p) => (
                                <li key={p.id}>
                                  <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left hover:bg-teal-50"
                                    onClick={() => linkProduct(index, p)}
                                  >
                                    {p.name} · {p.sku}
                                    {p.barcode ? ` · ${p.barcode}` : ''}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                          {line.matchedName ? (
                            <span className="mt-1 block font-normal normal-case text-teal-700">
                              Linked: {line.matchedName} ({line.sku}) · stock {line.currentStock ?? 0}
                            </span>
                          ) : (
                            <label className="mt-1 flex items-center gap-2 font-normal normal-case text-slate-600">
                              <input
                                type="checkbox"
                                checked={line.createIfMissing !== false}
                                onChange={(e) => updateLine(index, { createIfMissing: e.target.checked })}
                              />
                              Create new catalog product if missing
                            </label>
                          )}
                        </label>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
                          <input
                            type="checkbox"
                            checked={Boolean(line.trackSerial)}
                            onChange={(e) => updateLine(index, { trackSerial: e.target.checked })}
                          />
                          Track serial / IMEI (need {snNeed} serials)
                          {line.catalogTracksSerial ? (
                            <span className="font-normal text-amber-700">
                              — catalog uses serials
                            </span>
                          ) : null}
                        </label>
                        {line.trackSerial ? (
                          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Serial numbers
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  snCount >= snNeed
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {snCount} / {snNeed} entered
                              </span>
                            </div>
                            <input
                              className={inputClassName}
                              value={serialDraft[index] || ''}
                              onChange={(e) =>
                                setSerialDraft((prev) => ({ ...prev, [index]: e.target.value }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  appendSerial(index, serialDraft[index] || '');
                                }
                              }}
                              placeholder="Scan / type one SN — Enter to add"
                              autoComplete="off"
                            />
                            <textarea
                              className={`${textareaClassName} min-h-[72px] font-mono text-xs`}
                              value={line.serialNumbers || ''}
                              onChange={(e) =>
                                updateLine(index, {
                                  serialNumbers: e.target.value,
                                  trackSerial: true,
                                })
                              }
                              placeholder={'Or paste list:\nSN-001\nSN-002'}
                            />
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-3">
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => setProductDialogLine(index)}
                          >
                            {line.productId ? 'Edit full product form' : 'Create / fill full product form'}
                          </Button>
                          <Button type="button" variant="secondary" onClick={() => removeItem(index)}>
                            Remove item
                          </Button>
                        </div>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
                          <input
                            type="checkbox"
                            checked={line.commitStock !== false}
                            onChange={(e) => updateLine(index, { commitStock: e.target.checked })}
                          />
                          Commit stock now (uncheck = soft save product only)
                        </label>
                      </div>
                      </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
              </CollapsibleSection>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => void confirmStockIn()}
                disabled={
                  confirming ||
                  selectedCount === 0 ||
                  Boolean(invoiceNumber.trim() && invoiceDup?.exists && !appendToExistingBill)
                }
              >
                {confirming ? 'Updating…' : `Confirm receive (${selectedCount} item${selectedCount === 1 ? '' : 's'})`}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void saveDraft()} disabled={savingDraft || lines.length === 0}>
                {savingDraft ? 'Saving…' : draftId ? 'Update draft' : 'Save draft'}
              </Button>
              <Button type="button" variant="secondary" onClick={addBlankItem}>
                + Add item
              </Button>
            </div>

            {lines.some((l) => l.unitPrice) ? (
              <p className="text-sm text-slate-500">
                Selected value ≈{' '}
                {formatINR(
                  lines
                    .filter((l) => l.selected !== false)
                    .reduce((sum, l) => sum + toNumber(l.quantity) * toNumber(l.unitPrice), 0),
                )}
              </p>
            ) : null}
          </div>
        </Card>

      {showUploadDialog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => {
              if (!uploading && !ocrRunning) setShowUploadDialog(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-in-upload-title"
            className="relative z-10 flex max-h-[min(92vh,900px)] w-[90%] max-w-[90%] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <h2 id="stock-in-upload-title" className="text-lg font-semibold text-slate-900">
                  Upload / paste invoice
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  PDF, images, TXT, CSV, Excel — OCR in browser, then Parse into review.
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={uploading || ocrRunning}
                onClick={() => setShowUploadDialog(false)}
              >
                Close
              </Button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
              {pageCount > 0 ? (
                <div className="rounded-xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm text-teal-900">
                  <p className="font-semibold">
                    {pageCount} page{pageCount === 1 ? '' : 's'} loaded
                  </p>
                  <p className="mt-1 text-teal-800/90">
                    Check the text for <code className="rounded bg-white/80 px-1">----- PAGE N -----</code> markers.
                    Edit any wrong OCR, then Parse again before confirm.
                  </p>
                </div>
              ) : null}

              {uploadedDoc?.url ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <p className="mb-2 text-sm font-medium text-slate-700">Uploaded document</p>
                  <DocumentViewer
                    url={uploadedDoc.url}
                    mimeType={uploadedDoc.mimeType}
                    fileName={uploadedDoc.fileName}
                    height={220}
                  />
                </div>
              ) : null}

              <UploadDropzone
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.txt,.csv,.xlsx,.xls,image/*,application/pdf,text/plain,text/csv"
                disabled={uploading || ocrRunning}
                title={
                  ocrRunning
                    ? 'Reading file…'
                    : uploading
                      ? 'Uploading…'
                      : pageCount > 0
                        ? 'Replace first page'
                        : 'Upload invoice (PDF / image / TXT / Excel)'
                }
                hint="PDF · PNG · JPG · WebP · GIF · TXT · CSV · XLSX"
                onFile={(file) => void handleUpload(file, { append: false })}
              />

              <input
                ref={appendFileInputRef}
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.txt,.csv,.xlsx,.xls,image/*,application/pdf,text/plain,text/csv"
                disabled={uploading || ocrRunning}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleUpload(file, { append: true });
                  event.target.value = '';
                }}
              />

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-700">Extracted data</p>
                  <p className="text-xs text-slate-500">
                    {dataView === 'text'
                      ? 'Raw OCR / invoice text — edit mistakes, then Parse'
                      : 'Structured fields — edit here, then Apply'}
                  </p>
                </div>
                <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-0.5 text-sm">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      dataView === 'text' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => switchDataView('text')}
                  >
                    Text
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 font-medium transition ${
                      dataView === 'json' ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                    onClick={() => switchDataView('json')}
                  >
                    JSON
                  </button>
                </div>
              </div>

              {dataView === 'text' ? (
                <textarea
                  className={`${textareaClassName} min-h-[220px] whitespace-pre-wrap font-mono text-xs leading-relaxed`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Invoice text from all pages appears here…"
                  spellCheck={false}
                />
              ) : (
                <div className="space-y-2">
                  <textarea
                    className={`${textareaClassName} min-h-[220px] font-mono text-xs leading-relaxed text-emerald-900`}
                    value={jsonText}
                    onChange={(e) => {
                      setJsonText(e.target.value);
                      setJsonError('');
                    }}
                    placeholder={'{\n  "supplier": { "name": "…" },\n  "invoice": { "number": "…" },\n  "items": []\n}'}
                    spellCheck={false}
                  />
                  {jsonError ? <p className="text-xs text-rose-600">{jsonError}</p> : null}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 sm:px-6">
              <Button
                type="button"
                onClick={() => void handleParseText()}
                disabled={uploading || (dataView === 'text' ? !text.trim() : !jsonText.trim())}
              >
                {uploading ? 'Working…' : dataView === 'json' ? 'Apply JSON' : 'Parse full bill text'}
              </Button>
              {dataView === 'text' ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!text.trim()}
                  onClick={() => setText(formatInvoiceText(text))}
                >
                  Format text
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!jsonText.trim()}
                  onClick={() => {
                    try {
                      setJsonText(prettyJson(JSON.parse(jsonText)));
                      setJsonError('');
                    } catch (err) {
                      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
                    }
                  }}
                >
                  Format JSON
                </Button>
              )}
              <Button
                type="button"
                variant="secondary"
                disabled={uploading || ocrRunning || !text.trim()}
                onClick={() => appendFileInputRef.current?.click()}
              >
                Add another page
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!text.trim() && pageCount === 0 && !jsonText.trim()}
                onClick={() => {
                  setText('');
                  setJsonText('');
                  setExtractedJson(null);
                  setPageCount(0);
                  setUploadId(undefined);
                  setUploadedDoc(null);
                  setJsonError('');
                }}
              >
                Clear pages
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="sm:ml-auto"
                disabled={uploading || ocrRunning}
                onClick={() => setShowUploadDialog(false)}
              >
                Done — review items
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {productDialogLine != null ? (
        <ProductFormDialog
          open
          mode={lines[productDialogLine]?.productId ? 'edit' : 'create'}
          initial={productDialogInitial(productDialogLine)}
          receiveMode
          onClose={() => setProductDialogLine(null)}
          onSaved={async (product) => {
            onProductDialogSaved(productDialogLine, product);
            setProductDialogLine(null);
          }}
        />
      ) : null}
    </div>
  );
}
