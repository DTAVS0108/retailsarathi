'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { calculateInvoice } from '@retail-sarathi/gst-engine';
import { DocumentViewer } from '@/app/_components/document-viewer';
import { apiWithAuth, normalizeAppDate } from '@/lib/helpers';
import { runInvoiceOcr } from '@/lib/invoice-ocr';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  inputClassName,
  parseError,
  textareaClassName,
  toNumber,
} from '../_components/dashboard-ui';

interface ProductCatalogItem {
  id: string;
  sku: string;
  name: string;
  hsnCode: string;
  salePrice: number;
  gstRate: number;
  barcode?: string | null;
}

interface TenantProfile {
  stateCode: string;
}

interface DraftLine {
  rawText: string;
  barcode?: string;
  sku?: string;
  productName?: string;
  quantity: number;
  unitPrice?: number;
  productId?: string | null;
  matchConfidence: number;
}

interface ParsedDraft {
  customer: {
    name?: string;
    phone?: string;
    gstin?: string;
    address?: string;
  };
  lines: DraftLine[];
  paymentHint?: string;
  notes?: string;
  rawText: string;
  scanSessionId: string;
}

interface ParseResponse {
  draft: ParsedDraft;
  customerId?: string;
  linesMatched: number;
  linesTotal: number;
}

interface PurchasePreview {
  supplierId?: string;
  supplierName?: string;
  supplierAddress?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  gstin?: string;
  customerName?: string;
  customerGstin?: string;
  phone?: string;
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
  taxableValue?: number;
  taxAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  totalAmount?: number;
  hsnTaxSummary?: Array<Record<string, unknown>>;
  extractedJson?: Record<string, unknown>;
  lines?: Array<Record<string, unknown>>;
  linesMatched: number;
  linesTotal: number;
}

interface UploadParseResponse extends Partial<ParseResponse> {
  kept: boolean;
  message?: string;
  extractedText?: string;
  extractedData?: {
    invoiceNumber?: string;
    invoiceDate?: string;
    customerName?: string;
    phone?: string;
    gstin?: string;
    totalAmount?: number;
    hsnCodes?: string[];
  };
  purchasePreview?: PurchasePreview;
  upload?: {
    id: string;
    originalName: string;
    mimeType?: string;
    size: number;
    url?: string;
  };
}

interface ScanTemplate {
  id: string;
  name: string;
  supplierName?: string | null;
  sampleText?: string | null;
  updatedAt: string;
}

interface SearchHit {
  id: string;
  sku: string;
  name: string;
  salePrice: number;
  gstRate: number;
  hsnCode: string;
}

function routePurchaseToStockIn(
  purchase: PurchasePreview,
  router: ReturnType<typeof useRouter>,
  setSuccess: (s: string) => void,
) {
  sessionStorage.setItem(
    'stockInDraft',
    JSON.stringify({
      ...purchase,
      supplierId: purchase.supplierId,
      lines: (purchase.lines || []).map((line) => ({ ...line, selected: true })),
    }),
  );
  setSuccess(
    `Purchase invoice detected (${purchase.linesMatched}/${purchase.linesTotal} matched). Opening Stock-in…`,
  );
  router.push('/dashboard/stock-in?draft=1');
}

export default function ScanPage() {
  const router = useRouter();
  const [ocrText, setOcrText] = useState('');
  const [catalog, setCatalog] = useState<ProductCatalogItem[]>([]);
  const [sellerStateCode, setSellerStateCode] = useState('27');
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [editableLines, setEditableLines] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ocrRunning, setOcrRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [templates, setTemplates] = useState<ScanTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateSupplier, setTemplateSupplier] = useState('');
  const [serverUpload, setServerUpload] = useState<UploadParseResponse | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [rematchIdx, setRematchIdx] = useState<number | null>(null);
  const [rematchQuery, setRematchQuery] = useState('');
  const [rematchHits, setRematchHits] = useState<SearchHit[]>([]);
  const [rematchLoading, setRematchLoading] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [profile, products] = await Promise.all([
          apiWithAuth<TenantProfile>('/tenants/profile'),
          apiWithAuth<{ items: ProductCatalogItem[] }>('/products?pageSize=500'),
        ]);
        setSellerStateCode(profile.stateCode || '');
        setCatalog(products.items);
        const tpl = await apiWithAuth<ScanTemplate[]>('/scan/templates');
        setTemplates(tpl);
      } catch (err) {
        setError(parseError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (parsed) setEditableLines(parsed.draft.lines.map((l) => ({ ...l })));
    else setEditableLines([]);
  }, [parsed]);

  const productMap = useMemo(
    () => new Map(catalog.map((product) => [product.id, product])),
    [catalog],
  );

  const matchedCount = useMemo(
    () => editableLines.filter((l) => l.productId && productMap.has(l.productId)).length,
    [editableLines, productMap],
  );
  const unmatchedCount = editableLines.length - matchedCount;

  const totals = useMemo(() => {
    if (!editableLines.length) return null;
    const buyerStateCode = parsed?.draft.customer.gstin?.slice(0, 2);
    const lines = editableLines.reduce<
      Array<{
        productId: string;
        productName: string;
        hsnCode: string;
        quantity: number;
        unitPrice: number;
        gstRate: number;
        discount: number;
      }>
    >((acc, line) => {
      const product = line.productId ? productMap.get(line.productId) : undefined;
      if (!product) return acc;
      acc.push({
        productId: product.id,
        productName: line.productName || product.name,
        hsnCode: product.hsnCode,
        quantity: toNumber(line.quantity) || 1,
        unitPrice: toNumber(line.unitPrice) || toNumber(product.salePrice),
        gstRate: toNumber(product.gstRate),
        discount: 0,
      });
      return acc;
    }, []);

    return lines.length ? calculateInvoice(lines, sellerStateCode, buyerStateCode) : null;
  }, [editableLines, parsed, productMap, sellerStateCode]);

  async function handleParse() {
    try {
      if (!ocrText.trim()) throw new Error('Paste OCR text or extract text from an image first.');
      setSubmitting(true);
      setError('');
      setSuccess('');
      const response = await apiWithAuth<ParseResponse>('/scan/parse-order-sheet', {
        method: 'POST',
        body: JSON.stringify({ text: ocrText, createCustomer: true }),
      });

      if (!response.linesTotal) {
        const purchase = await apiWithAuth<PurchasePreview>('/scan/parse-purchase', {
          method: 'POST',
          body: JSON.stringify({ text: ocrText }),
        });

        if (purchase.linesTotal > 0) {
          setParsed(null);
          routePurchaseToStockIn(purchase, router, setSuccess);
          return;
        }

        setParsed(response);
        setSuccess(
          'No order lines found. Use label:value rows (Item / Qty / SKU) for POS, or paste a full tax invoice for Stock-in.',
        );
        return;
      }

      setParsed(response);
      setSuccess(
        `Order sheet parsed — ${response.linesMatched}/${response.linesTotal} lines matched to catalog.`,
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setOcrRunning(true);
      setError('');
      const text = await runInvoiceOcr(file);
      setOcrText(text);
      setSuccess(
        text.trim()
          ? 'OCR text extracted. Review it, then click Parse.'
          : 'OCR returned little text — try a clearer photo or paste text manually.',
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setOcrRunning(false);
      event.target.value = '';
    }
  }

  async function handleServerUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(true);
      setError('');
      setSuccess('');

      // Images go straight to the server's own OCR (`extractText()` in scan.service.ts) —
      // this upload already requires the server to be reachable, so there's no offline
      // benefit to also running the browser's slower Tesseract.js pass first. Running both
      // sequentially used to double the wait (2+ minutes) for no accuracy gain; the separate
      // "Image OCR" button above still offers pure client-side OCR for the offline/paste-only
      // case, which this upload path never needed.
      const form = new FormData();
      form.append('file', file);
      form.append('createCustomer', 'true');

      const response = await apiWithAuth<UploadParseResponse>('/scan/upload', {
        method: 'POST',
        body: form,
      });

      setServerUpload(response);
      if (response.extractedText) setOcrText(response.extractedText);

      // Tax invoice with purchase lines → Stock-in (correct mapping path)
      if (response.purchasePreview && response.purchasePreview.linesTotal > 0) {
        setParsed(null);
        routePurchaseToStockIn(response.purchasePreview, router, setSuccess);
        return;
      }

      if (response.draft && response.linesTotal) {
        setParsed({
          draft: response.draft,
          customerId: response.customerId,
          linesMatched: response.linesMatched ?? 0,
          linesTotal: response.linesTotal,
        });
        setSuccess(
          response.kept
            ? `Uploaded and parsed as order sheet (${response.linesMatched}/${response.linesTotal} matched).`
            : response.message ?? 'Parsed as order sheet.',
        );
        return;
      }

      setSuccess(
        response.kept
          ? 'File uploaded. No clear order or invoice lines — edit text and Parse.'
          : response.message ?? 'Upload parsed, but not retained.',
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setUploadingFile(false);
      event.target.value = '';
    }
  }

  async function searchRematch(q: string) {
    setRematchQuery(q);
    if (q.trim().length < 2) {
      setRematchHits([]);
      return;
    }
    try {
      setRematchLoading(true);
      const hits = await apiWithAuth<SearchHit[]>(
        `/scan/products/search?q=${encodeURIComponent(q.trim())}`,
      );
      setRematchHits(hits.slice(0, 12));
    } catch {
      setRematchHits([]);
    } finally {
      setRematchLoading(false);
    }
  }

  function applyRematch(index: number, hit: SearchHit) {
    setEditableLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? {
              ...line,
              productId: hit.id,
              productName: hit.name,
              sku: hit.sku,
              unitPrice: toNumber(line.unitPrice) || toNumber(hit.salePrice),
              matchConfidence: 1,
            }
          : line,
      ),
    );
    if (!catalog.some((p) => p.id === hit.id)) {
      setCatalog((prev) => [
        ...prev,
        {
          id: hit.id,
          sku: hit.sku,
          name: hit.name,
          hsnCode: hit.hsnCode,
          salePrice: hit.salePrice,
          gstRate: hit.gstRate,
        },
      ]);
    }
    setRematchIdx(null);
    setRematchQuery('');
    setRematchHits([]);
  }

  function openInPos() {
    if (!parsed) return;

    const matchedLines = editableLines.filter((l) => l.productId && productMap.has(l.productId));
    if (!matchedLines.length) {
      setError('Match at least one product before opening POS. Use Rematch on unmatched lines.');
      return;
    }

    const dropped = editableLines.length - matchedLines.length;
    const lines = matchedLines.map((line) => {
      const product = productMap.get(line.productId!)!;
      return {
        productId: product.id,
        productName: line.productName || product.name,
        quantity: toNumber(line.quantity) || 1,
        unitPrice: toNumber(line.unitPrice) || toNumber(product.salePrice),
        gstRate: toNumber(product.gstRate),
        hsnCode: product.hsnCode,
        sku: line.sku || product.sku,
        barcode: line.barcode,
        rawText: line.rawText,
      };
    });

    sessionStorage.setItem(
      'posDraft',
      JSON.stringify({
        source: 'scan',
        customerId: parsed.customerId,
        customer: parsed.draft.customer,
        paymentHint: parsed.draft.paymentHint,
        notes: [
          parsed.draft.notes,
          dropped > 0 ? `Scan note: ${dropped} unmatched line(s) were not added to the cart.` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        scanSessionId: parsed.draft.scanSessionId,
        lines,
        droppedUnmatched: dropped,
        totals,
      }),
    );
    if (dropped > 0) {
      setSuccess(`Opening POS with ${matchedLines.length} matched line(s). ${dropped} unmatched skipped.`);
    }
    router.push('/dashboard/pos');
  }

  return (
    <div className={pageShellClassName}>
      <Script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js" strategy="afterInteractive" />

      <PageHeader
        title="Order Sheet / Invoice Scan"
        description="Scan customer order sheets into POS, or supplier tax invoices into Stock-in — mapping follows your live catalog and CRM."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50/90 via-white to-slate-50">
        <h3 className="text-base font-semibold text-slate-900">How scanning works</h3>
        <p className="mt-1 text-sm text-slate-600">
          Two paths share this screen. The app picks the right one from the text/file you provide.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-teal-100 bg-white/90 px-3 py-3">
            <p className="text-sm font-semibold text-slate-900">Customer order sheet → POS</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
              <li>Label:value rows (Name, Phone, SKU/Item, Qty, Price)</li>
              <li>Lines match catalog by barcode → SKU → name</li>
              <li>Rematch unmatched lines, then Open in POS</li>
              <li>Customer segment on CRM drives wholesale rates in POS</li>
            </ul>
          </div>
          <div className="rounded-xl border border-teal-100 bg-white/90 px-3 py-3">
            <p className="text-sm font-semibold text-slate-900">Supplier tax invoice → Stock-in</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-600">
              <li>GST invoice tables with HSN / taxable / tax</li>
              <li>Parse or upload auto-opens{' '}
                <Link href="/dashboard/stock-in" className="font-medium text-brand hover:underline">
                  Stock-in
                </Link>
              </li>
              <li>Creates/updates products, serials, purchase bill, stock</li>
            </ul>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
        <Card className="border-slate-200">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Input</h2>
              <p className="text-sm text-slate-500">
                Paste text, run OCR on an image, or upload a file. Catalog loaded: {catalog.length} products.
              </p>
            </div>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>OCR / order text</span>
              <textarea
                className={textareaClassName}
                value={ocrText}
                onChange={(event) => setOcrText(event.target.value)}
                placeholder={'Name: Ramesh\nPhone: 9876543210\nItem: ENERGY SAVER\nQty: 2\nPrice: 4016.95'}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void handleParse()} disabled={submitting || loading}>
                {submitting ? 'Parsing…' : 'Parse'}
              </Button>
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                {ocrRunning ? 'Extracting…' : 'Image OCR'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={ocrRunning}
                />
              </label>
              <label className="inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-teal-200 bg-teal-50 px-4 text-sm font-medium text-brand transition hover:bg-teal-100">
                {uploadingFile ? 'Uploading…' : 'Upload invoice / file'}
                <input
                  type="file"
                  accept="image/*,.txt,.csv,.pdf,.xlsx,.xls,.docx"
                  className="hidden"
                  onChange={handleServerUpload}
                  disabled={uploadingFile}
                />
              </label>
            </div>
          </div>
        </Card>

        <Card className="border-slate-200">
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Status</h2>
              <p className="text-sm text-slate-500">Seller GST state: {sellerStateCode || '—'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">Lines</p>
                <p className="mt-1 text-xl font-semibold text-slate-900">{editableLines.length}</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">Matched</p>
                <p className="mt-1 text-xl font-semibold text-emerald-700">{matchedCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">Unmatched</p>
                <p className="mt-1 text-xl font-semibold text-amber-700">{unmatchedCount}</p>
              </div>
              <div className="rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-500">GST preview</p>
                <p className="mt-1 text-xl font-semibold text-brand">
                  {formatINR(totals?.grandTotal ?? 0)}
                </p>
              </div>
            </div>
            {serverUpload?.upload ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                <p className="font-semibold text-slate-900">
                  {serverUpload.upload.originalName}
                  {serverUpload.kept ? ' · retained' : ''}
                </p>
                {serverUpload.upload.url ? (
                  <div className="mt-2">
                    <DocumentViewer
                      url={serverUpload.upload.url}
                      mimeType={serverUpload.upload.mimeType}
                      fileName={serverUpload.upload.originalName}
                      height={160}
                    />
                  </div>
                ) : null}
                {serverUpload.extractedData ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Inv {serverUpload.extractedData.invoiceNumber || '—'} ·{' '}
                    {normalizeAppDate(serverUpload.extractedData.invoiceDate) || '—'} ·{' '}
                    {serverUpload.extractedData.gstin || '—'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </Card>
      </section>

      {parsed ? (
        <section className="grid gap-4 xl:grid-cols-[0.85fr,1.15fr]">
          <Card className="border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Customer</h2>
            <p className="mt-1 text-sm text-slate-500">
              Created in CRM when name/phone are present. Segment on the customer profile controls wholesale in POS.
            </p>
            <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div>
                <p className="text-xs text-slate-500">Name</p>
                <p className="font-semibold text-slate-900">{parsed.draft.customer.name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Phone</p>
                <p className="font-semibold text-slate-900">{parsed.draft.customer.phone || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">GSTIN</p>
                <p className="font-mono text-sm text-slate-900">{parsed.draft.customer.gstin || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">CRM id</p>
                <p className="text-sm text-slate-700">{parsed.customerId || 'Draft only'}</p>
              </div>
              {parsed.draft.paymentHint ? (
                <div>
                  <p className="text-xs text-slate-500">Payment hint</p>
                  <p className="font-semibold text-slate-900">{parsed.draft.paymentHint}</p>
                </div>
              ) : null}
            </div>

            {totals ? (
              <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-4 text-sm text-teal-900">
                <p className="font-medium text-teal-800">GST preview (matched lines only)</p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between"><span>Subtotal</span><strong>{formatINR(totals.subtotal)}</strong></div>
                  <div className="flex justify-between"><span>CGST</span><strong>{formatINR(totals.totalCgst)}</strong></div>
                  <div className="flex justify-between"><span>SGST</span><strong>{formatINR(totals.totalSgst)}</strong></div>
                  <div className="flex justify-between"><span>IGST</span><strong>{formatINR(totals.totalIgst)}</strong></div>
                  <div className="flex justify-between border-t border-teal-200 pt-2">
                    <span>Grand total</span>
                    <strong>{formatINR(totals.grandTotal)}</strong>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={openInPos} disabled={!matchedCount}>
                Open in POS ({matchedCount})
              </Button>
              {unmatchedCount > 0 ? (
                <p className="self-center text-xs text-amber-700">
                  {unmatchedCount} unmatched line(s) will be skipped — rematch first.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900">Lines</h2>
            <p className="mt-1 text-sm text-slate-500">
              Edit qty/price and rematch products so POS mapping stays correct.
            </p>
            <div className="mt-4 space-y-3">
              {editableLines.map((line, index) => {
                const product = line.productId ? productMap.get(line.productId) : undefined;
                const matched = Boolean(product);
                return (
                  <div
                    key={`${line.rawText}-${index}`}
                    className={cn(
                      'rounded-xl border px-3 py-3',
                      matched ? 'border-emerald-200 bg-emerald-50/50' : 'border-amber-200 bg-amber-50/40',
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {line.productName || product?.name || 'Unmatched item'}
                          </p>
                          <StatusBadge status={matched ? 'MATCHED' : 'UNMATCHED'} />
                        </div>
                        <p className="mt-0.5 text-xs text-slate-500">{line.rawText}</p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          SKU {line.sku || product?.sku || '—'} · Confidence{' '}
                          {Math.round((line.matchConfidence || 0) * 100)}%
                        </p>
                      </div>
                      <p className="font-semibold text-slate-900">
                        {formatINR(
                          (toNumber(line.unitPrice) || toNumber(product?.salePrice)) *
                            (toNumber(line.quantity) || 1),
                        )}
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <label className="space-y-1 text-xs font-medium text-slate-600">
                        Qty
                        <input
                          className={inputClassName}
                          type="number"
                          min="0.001"
                          step="1"
                          value={line.quantity}
                          onChange={(e) =>
                            setEditableLines((prev) =>
                              prev.map((l, i) =>
                                i === index ? { ...l, quantity: toNumber(e.target.value) || 1 } : l,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium text-slate-600">
                        Unit price
                        <input
                          className={inputClassName}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitPrice ?? product?.salePrice ?? ''}
                          onChange={(e) =>
                            setEditableLines((prev) =>
                              prev.map((l, i) =>
                                i === index ? { ...l, unitPrice: toNumber(e.target.value) } : l,
                              ),
                            )
                          }
                        />
                      </label>
                      <div className="flex items-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onClick={() => {
                            setRematchIdx(index);
                            setRematchQuery(line.productName || line.sku || '');
                            void searchRematch(line.productName || line.sku || '');
                          }}
                        >
                          Rematch
                        </Button>
                      </div>
                    </div>
                    {rematchIdx === index ? (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-2">
                        <input
                          className={inputClassName}
                          placeholder="Search catalog…"
                          value={rematchQuery}
                          onChange={(e) => void searchRematch(e.target.value)}
                          autoFocus
                        />
                        {rematchLoading ? (
                          <p className="mt-2 text-xs text-slate-500">Searching…</p>
                        ) : (
                          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                            {rematchHits.map((hit) => (
                              <li key={hit.id}>
                                <button
                                  type="button"
                                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-teal-50"
                                  onClick={() => applyRematch(index, hit)}
                                >
                                  <span className="font-medium text-slate-900">{hit.name}</span>
                                  <span className="mt-0.5 block text-xs text-slate-500">
                                    {hit.sku} · {formatINR(toNumber(hit.salePrice))}
                                  </span>
                                </button>
                              </li>
                            ))}
                            {!rematchHits.length && rematchQuery.trim().length >= 2 ? (
                              <li className="px-2 py-2 text-xs text-slate-500">No products found.</li>
                            ) : null}
                          </ul>
                        )}
                        <button
                          type="button"
                          className="mt-1 text-xs text-slate-500 hover:underline"
                          onClick={() => setRematchIdx(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </section>
      ) : null}

      <Card className="border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">Scan templates</h3>
        <p className="mt-1 text-sm text-slate-500">
          Save sample order-sheet text for quick reuse (OCR still parses live text each time).
        </p>
        <form
          className="mt-4 grid gap-3 md:grid-cols-[1fr,1fr,auto]"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              try {
                setSubmitting(true);
                await apiWithAuth('/scan/templates', {
                  method: 'POST',
                  body: JSON.stringify({
                    name: templateName.trim(),
                    supplierName: templateSupplier.trim() || undefined,
                    sampleText: ocrText.trim() || undefined,
                  }),
                });
                setTemplateName('');
                setTemplateSupplier('');
                setSuccess('Scan template saved.');
                setTemplates(await apiWithAuth<ScanTemplate[]>('/scan/templates'));
              } catch (err) {
                setError(parseError(err));
              } finally {
                setSubmitting(false);
              }
            })();
          }}
        >
          <input
            className={inputClassName}
            placeholder="Template name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            required
          />
          <input
            className={inputClassName}
            placeholder="Supplier (optional)"
            value={templateSupplier}
            onChange={(e) => setTemplateSupplier(e.target.value)}
          />
          <Button type="submit" disabled={submitting}>
            Save sample
          </Button>
        </form>
        {templates.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
              >
                <span>
                  <strong>{t.name}</strong>
                  {t.supplierName ? ` · ${t.supplierName}` : ''}
                </span>
                <button
                  type="button"
                  className="text-brand hover:underline"
                  onClick={() => t.sampleText && setOcrText(t.sampleText)}
                >
                  Load sample
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No templates yet.</p>
        )}
      </Card>
    </div>
  );
}
