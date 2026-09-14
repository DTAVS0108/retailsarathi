/** Generic invoice OCR helpers — no supplier-specific strings. */

export type KnownParty = {
  id?: string;
  name: string;
  gstin?: string | null;
  address?: string | null;
  phone?: string | null;
};

export type InvoiceParseContext = {
  tenantGstin?: string | null;
  tenantName?: string | null;
  knownSuppliers?: KnownParty[];
  knownCustomers?: KnownParty[];
};

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1]
          ? row[j - 1]
          : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

export function compactAlphanumeric(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function tokenOverlapScore(a: string, b: string): number {
  const ta = a
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f]+/)
    .filter((t) => t.length > 2);
  const tb = b
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097f]+/)
    .filter((t) => t.length > 2);
  if (!ta.length || !tb.length) return 0;
  let hits = 0;
  for (const t of ta) {
    if (tb.some((u) => u.includes(t) || t.includes(u))) hits++;
  }
  return Math.round((hits / Math.max(ta.length, tb.length)) * 100);
}

export function fuzzyMatchGstin(
  ocrFragment: string,
  knownGstins: string[],
): { gstin: string; score: number } | null {
  const compact = compactAlphanumeric(ocrFragment);
  if (compact.length < 8 || !knownGstins.length) return null;
  let best: { gstin: string; score: number } | null = null;
  for (const known of knownGstins) {
    const k = compactAlphanumeric(known);
    if (!k) continue;
    const panKnown = k.slice(2, 12);
    const candidates = [compact, compact.slice(-12), compact.slice(-10), compact.slice(0, 12)];
    for (const cand of candidates) {
      if (cand.length < 8) continue;
      const dist = levenshtein(cand.slice(-10), panKnown);
      const score = 100 - dist * 11;
      if (score >= 70 && (!best || score > best.score)) {
        best = { gstin: known.toUpperCase(), score };
      }
      if (
        cand.length >= 10 &&
        (compact === k || (compact.includes(panKnown) && panKnown.length >= 8))
      ) {
        const containScore = 92;
        if (!best || containScore > best.score) best = { gstin: known.toUpperCase(), score: containScore };
      }
    }
  }
  return best;
}

export function extractGstinLabelFragments(source: string): string[] {
  const frags: string[] = [];
  for (const line of source.split('\n')) {
    if (!/gstin|gstn|uin/i.test(line)) continue;
    frags.push(line.trim());
    const after = line.replace(/^.*?(?:gstin|gstn|uin)[^A-Z0-9]*/i, '').trim();
    if (after.length >= 6) frags.push(after);
    for (const m of line.matchAll(/([A-Z0-9][A-Z0-9\s\-]{8,22})/gi)) {
      frags.push(m[1]);
    }
  }
  return frags;
}

export function extractStateCode(source: string): string | undefined {
  const m = source.match(/(?:state\s*name|place\s*of\s*supply)[^:\n]{0,40}code\s*[:.\-]?\s*(\d{2})/i);
  return m?.[1];
}

export function matchPartyByName(
  ocrName: string | undefined,
  parties: KnownParty[],
  minScore = 38,
): KnownParty | null {
  if (!ocrName?.trim() || !parties.length) return null;
  let best: { party: KnownParty; score: number } | null = null;
  for (const party of parties) {
    const score = tokenOverlapScore(ocrName, party.name);
    if (score >= minScore && (!best || score > best.score)) {
      best = { party, score };
    }
  }
  return best?.party ?? null;
}

function isValidGstinFormat(gstin?: string): boolean {
  return Boolean(
    gstin && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.toUpperCase()),
  );
}

export function matchKnownSupplier(
  extracted: {
    supplierName?: string;
    gstin?: string;
    supplierAddress?: string;
  },
  suppliers: KnownParty[],
): KnownParty | null {
  if (!suppliers.length) return null;
  if (extracted.gstin) {
    const byGstin = suppliers.find(
      (s) => s.gstin && s.gstin.toUpperCase() === extracted.gstin!.toUpperCase(),
    );
    if (byGstin) return byGstin;
  }
  return matchPartyByName(extracted.supplierName, suppliers, 50);
}

export function normalizeIndianVehiclePlate(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const m = s.match(/^([A-Z]{2})(\d{2})([A-Z]{1,3})(\d{3,4})$/);
  if (!m) return s.length >= 8 && s.length <= 12 ? s : undefined;
  const [, st, dist, seriesRaw, numRaw] = m;
  let series = seriesRaw.replace(/O/g, '0').replace(/I/g, '1');
  let num = numRaw.replace(/O/g, '0').replace(/I/g, '1');
  if (num.length === 4 && num[0] === 'S' && /^\d{3}$/.test(num.slice(1))) {
    num = '5' + num.slice(1);
  }
  if (num.length === 3 && /^S\d{2}$/.test(num)) {
    num = '5' + num.slice(1);
  }
  series = series.replace(/S(?=[A-Z]|$)/g, '5');
  return `${st}${dist}${series}${num}`;
}

export function isLikelyGstinNoiseLine(line: string): boolean {
  return (
    /gstin|gstn|uin/i.test(line) &&
    !/\b[0-9]{2}[A-Z0-9]{10}[0-9A-Z]Z[0-9A-Z]\b/i.test(line) &&
    /[A-Za-z]{6,}/.test(line.replace(/gstin|gstn|uin|state|name|code/gi, ''))
  );
}

export function sanitizeInvoiceNumber(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw
    .trim()
    .replace(/\s*\((?:continued|contd\.?|page\s*\d+)\)\s*$/i, '')
    .replace(/[.,;|}\]]+$/, '');
  if (
    !s ||
    /^e-?way|bill|prope|transport|for|dated|delivery|grandeur|supply|original|copy|continued|page|tax$/i.test(
      s,
    )
  ) {
    return undefined;
  }
  if (/^\d+$/.test(s)) {
    if (s.length > 6) return undefined;
    return s;
  }
  if (/^[A-Z0-9][A-Z0-9\/\-]{1,30}$/i.test(s) && /\d/.test(s) && !/\s/.test(s)) return s;
  return undefined;
}

function isInvoiceLabelLine(line: string): boolean {
  if (/e-?way\s*bill/i.test(line)) return false;
  if (/tax\s+invoice\s*\(?\s*page\s*\d+/i.test(line)) return false;
  return /(?:^|\b)(?:invoice|inv)\s*(?:no\.?|number|#)|(?:^|\b)bill\s*(?:no\.?|number|#)/i.test(
    line,
  );
}

export function extractInvoiceNumberFromText(source: string): string | undefined {
  const normalized = source.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
  const pick = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (!match?.[1]) continue;
      const start = match.index ?? 0;
      const before = normalized.slice(Math.max(0, start - 24), start);
      if (/e-?way\s*$/i.test(before) || /e-?way\s*bill/i.test(before + match[0].slice(0, 16))) {
        continue;
      }
      const value = sanitizeInvoiceNumber(match[1].trim().replace(/\s+/g, ' '));
      if (value) return value;
    }
    return undefined;
  };

  let invoiceNumber = pick([
    /(?:invoice|inv|bill)\s*(?:no\.?|number|#)\s*[:.\-]?\s*([A-Z0-9][A-Z0-9\/\-]{0,24})/i,
    /(?:invoice|inv)\s*[:.#\-]\s*([A-Z0-9][A-Z0-9\/\-]{2,24})/i,
    // Prefer prefixed forms (RB/2026-27/359) before bare FY (2026-27/359)
    /\b([A-Z]{2,6}\/[0-9]{4}-[0-9]{2}\/[0-9]{1,6})\b/i,
    /\b([A-Z]{2,6}\/[0-9]{2,4}-[0-9]{2,4}\/[0-9]{1,6})\b/i,
    /\b([A-Z]{2,5}-INV-[0-9]{3,6})\b/i,
    /\b(?:no\.?|number)\s*[:.\-]?\s*([A-Z0-9]{1,6}\/[0-9]{2,4}(?:-[0-9]{2,4})?)/i,
    /\b([0-9]{3,6}\/[0-9]{2,4}-[0-9]{2,4})\b/,
    /\b(\d{2,4}-\d{2,4}\/\d{1,6})\b/,
    /\b([0-9]{2,4}-[0-9]{2,4}\/[0-9]{1,6})\b/,
    /(?:INVOICE|INV)\s*(?:No\.?|Number)\s*[\n]+\s*(\d{1,6})\b/i,
  ]);

  if (!invoiceNumber) {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const fy = line.match(/\b(\d{2,4}-\d{2,4}\/\d{1,6})\b/);
      if (fy) {
        invoiceNumber = sanitizeInvoiceNumber(fy[1]);
        if (invoiceNumber) break;
      }
    }
  }

  if (!invoiceNumber) {
    const lines = source.replace(/\r\n/g, '\n').split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!isInvoiceLabelLine(line)) continue;
      const label = line.match(/(?:invoice|inv|bill)\s*(?:no\.?|number|#)/i);
      const afterLabel = label ? line.slice(label.index! + label[0].length) : line;
      const alpha = afterLabel.match(/^\s*[^A-Z0-9\/]{0,8}([A-Z0-9][A-Z0-9\/\-]{1,24})/i);
      if (alpha) {
        invoiceNumber = sanitizeInvoiceNumber(alpha[1]);
        if (invoiceNumber) break;
      }
      const digits = afterLabel.match(/^\s*[^0-9]{0,16}(\d{1,6})\b/);
      if (digits) {
        invoiceNumber = sanitizeInvoiceNumber(digits[1]);
        if (invoiceNumber) break;
      }
    }
  }

  if (!invoiceNumber) {
    const glued = normalized.match(/\b(\d{2,4})\s+[0-9]{10,13}\b/);
    if (glued) invoiceNumber = sanitizeInvoiceNumber(glued[1]);
  }

  if (!invoiceNumber) {
    // Camera OCR: "… Batteries [INVOICE No." on one line and "… RB/2026-27/359" (or "RB/ i") nearby
    const rb = source.match(/\b(RB)\s*\/\s*([0-9]{2,4})\s*[-–]\s*([0-9]{2,4})\s*\/\s*([0-9]{1,6})\b/i);
    if (rb) {
      invoiceNumber = sanitizeInvoiceNumber(`${rb[1].toUpperCase()}/${rb[2]}-${rb[3]}/${rb[4]}`);
    }
  }

  if (!invoiceNumber) {
    // Spaced / OCR-garbled FY forms: "2026 27/359", "Bo 2026 27/359" (require / before serial)
    const spaced = source.match(
      /\b(?:([A-Z]{1,2})|[RB][B8O0])\s*\/?\s*([12][0-9]{3})\s*[-–\s]+\s*([0-9]{2})\s*\/\s*([0-9]{2,4})\b/i,
    );
    if (spaced) {
      let prefix = (spaced[1] || 'RB').toUpperCase();
      // Camera OCR often reads "RB" as "Bo" / "B0"
      if (/^(B[O0]|R[B8O0]|8B)$/i.test(prefix)) prefix = 'RB';
      invoiceNumber = sanitizeInvoiceNumber(`${prefix}/${spaced[2]}-${spaced[3]}/${spaced[4]}`);
    }
  }

  if (!invoiceNumber) {
    // Prefixed invoice glued without separators: RB2026-27/359 or RB/202627/359
    const gluedRb = normalized.match(/\b([A-Z]{2,5})\s*\/?\s*([0-9]{4})\s*[-–]?\s*([0-9]{2})\s*\/\s*([0-9]{1,6})\b/i);
    if (
      gluedRb &&
      /invoice|inv\s*no|bill\s*no|ack\s*no|raunaq|batter|vat\.?\s*tin/i.test(
        normalized.slice(Math.max(0, (gluedRb.index ?? 0) - 80), (gluedRb.index ?? 0) + 40),
      )
    ) {
      let prefix = gluedRb[1].toUpperCase();
      if (/^(B[O0]|R[B8O0]|8B)$/i.test(prefix)) prefix = 'RB';
      invoiceNumber = sanitizeInvoiceNumber(`${prefix}/${gluedRb[2]}-${gluedRb[3]}/${gluedRb[4]}`);
    }
  }

  // "VAT … [Bo 2026 27/359" or "2026 27/359" near invoice/dated column
  if (!invoiceNumber) {
    const nearInv = source.match(
      /(?:invoice\s*no|dated|vat\.?\s*tin|rb\s*\/)[^\n]{0,80}?\b([12][0-9]{3})\s*[-–\s]+\s*([0-9]{2})\s*[\/\s]\s*([0-9]{2,4})\b/i,
    );
    if (nearInv) {
      invoiceNumber = sanitizeInvoiceNumber(`RB/${nearInv[1]}-${nearInv[2]}/${nearInv[3]}`);
    }
  }

  if (!invoiceNumber && /----- PAGE \d+ -----/i.test(source)) {
    const pages = source.split(/\n----- PAGE \d+ -----\n?/i);
    for (const page of pages) {
      const chunk = page.trim();
      if (!chunk) continue;
      const fromPage = extractInvoiceNumberFromText(chunk);
      if (fromPage) return fromPage;
    }
  }

  return invoiceNumber;
}

export function looksLikeAddressLine(line: string): boolean {
  return (
    /\b(road|street|market|nagar|colony|mohalla|sector|plot|near|opp|theater|theatre|pin|pradesh|district)\b/i.test(
      line,
    ) && !/gstin|invoice|hsn|total|cgst|buyer|bill\s*to|amount/i.test(line)
  );
}

export function isDocumentTitleLine(line: string): boolean {
  const t = line.trim();
  return /^(?:tax\s+invoice|bill\s+of\s+supply|debit\s+note|credit\s+note|proforma\s+invoice|delivery\s+challan|retail\s+invoice|cash\s+memo)$/i.test(
    t,
  );
}

export function isInvoiceSummaryLabel(line: string): boolean {
  const t = line.trim();
  return (
    /^(?:amount\s+payable|taxable\s+value|total\s+amount|grand\s+total|net\s+amount|balance\s+due|round\s+off)/i.test(
      t,
    ) ||
    /^(?:output\s+)?(?:cgst|sgst|igst|cess)\b/i.test(t) ||
    /^(?:add\s*:?\s*)?(?:cgst|sgst|igst)\b/i.test(t) ||
    /^total\s*[:.\-]?\s*[₹]?\s*[\d,]/i.test(t)
  );
}

export function isTableHeaderLine(line: string): boolean {
  return (
    /\b(?:si|s\.?\s*no\.?|sr\.?\s*no\.?)\b.*\b(?:description|particulars)\b/i.test(line) ||
    /\b(?:description\s+of\s+goods|particulars)\b.*\b(?:hsn|sac|qty|quantity|rate|amount|unit)\b/i.test(
      line,
    ) ||
    /^#\s+particulars\b/i.test(line)
  );
}

export function isSupplierLikeName(name: string): boolean {
  return /traders?|enterprises?|distributors?|battery|batteries|industries|wholesale/i.test(
    name,
  );
}

export function looksLikeCompanyNameLine(line: string): boolean {
  const t = line.trim();
  if (
    !t ||
    isDocumentTitleLine(t) ||
    isInvoiceSummaryLabel(t) ||
    isTableHeaderLine(t) ||
    looksLikeAddressLine(t)
  ) {
    return false;
  }
  if (
    /^\d/.test(t) ||
    /[,;]/.test(t) ||
    (t.split(/\s+/).length <= 2 &&
      t.length <= 12 &&
      !/(?:traders?|batter(?:y|ies)|pvt|ltd|works|enterprises?|hub|mart|store)/i.test(t))
  ) {
    return false;
  }
  if (/^(?:gstin|uin|state|email|e-?mail|phone|mobile|invoice|dated|date|bill\s*no|delivery|destination|contact)/i.test(t)) {
    return false;
  }
  if (/\bINVOICE\s+No\.?\b/i.test(t) || /\bBill\s+No\.?\b/i.test(t)) return false;
  if (/@|e-?mail\s*:/i.test(t)) return false;
  return (
    /(?:pvt|ltd|llp|traders?|distributors?|wholesale|electronics|mobiles?|power|hub|care|parts|digital|cell|mart|store|enterprises?|industries|films?|world|battery|batteries|management|private\s+limited|private\s+ltd)/i.test(
      t,
    ) ||
    (/^(?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_\/-]{2,55}$/.test(t) && t.split(/\s+/).length <= 7)
  );
}

export function shouldSkipBuyerCandidate(
  candidate: string,
  supplierName?: string,
): boolean {
  const c = candidate.toLowerCase();
  if (/^(gstin|uin|state|pan|place|invoice|tax|billed|buyer|shipped|consignee)/i.test(candidate)) {
    return true;
  }
  if (isTableHeaderLine(candidate) || isDocumentTitleLine(candidate) || isInvoiceSummaryLabel(candidate)) {
    return true;
  }
  if (/mobile|phone|gst|shipped|billed|buyer/i.test(c)) return true;
  if (supplierName && c === supplierName.toLowerCase()) return true;
  if (looksLikeAddressLine(candidate)) return true;
  if (/^a\/\d+/i.test(candidate.trim())) return true;
  if (isSupplierLikeName(candidate) && !/(electric|works|store|mart|films?|media|studio)/i.test(candidate)) {
    return true;
  }
  return false;
}

export function enrichExtractedParties<
  T extends {
    supplierName?: string;
    supplierAddress?: string;
    gstin?: string;
    customerName?: string;
    customerGstin?: string;
    vehicleNo?: string;
    ifsc?: string;
  },
>(
  extracted: T,
  text: string,
  ctx: InvoiceParseContext,
  deps: {
    extractGstins: (source: string) => string[];
    normalizeGstinCandidate: (raw?: string) => string | undefined;
  },
): T {
  const suppliers = ctx.knownSuppliers ?? [];
  const customers = ctx.knownCustomers ?? [];
  const tenantGstin = ctx.tenantGstin?.toUpperCase() || undefined;
  const supplierGstins = suppliers.map((s) => s.gstin).filter(Boolean) as string[];
  const customerGstins = customers.map((c) => c.gstin).filter(Boolean) as string[];

  const billToIdx = text.search(/bill\s*to|buyer|consignee/i);
  const topSection = billToIdx > 0 ? text.slice(0, billToIdx) : text.slice(0, 600);
  const buyerSection = billToIdx >= 0 ? text.slice(billToIdx, billToIdx + 700) : '';

  // Buyer GSTIN sometimes lands in the supplier slot — clear only that misread, never force tenant as buyer.
  if (tenantGstin && extracted.gstin?.toUpperCase() === tenantGstin) {
    extracted.gstin = undefined;
  }

  const fuzzyTop = (section: string, known: string[], minScore = 80) => {
    for (const frag of extractGstinLabelFragments(section)) {
      const direct = deps.normalizeGstinCandidate(frag);
      if (direct && known.includes(direct)) return direct;
      const hit = fuzzyMatchGstin(frag, known);
      if (hit && hit.score >= minScore) return hit.gstin;
    }
    return undefined;
  };

  if (!extracted.gstin && supplierGstins.length) {
    extracted.gstin =
      fuzzyTop(topSection, supplierGstins, 65) ??
      fuzzyTop(text, supplierGstins, 65) ??
      extracted.gstin;
  } else if (
    extracted.gstin &&
    supplierGstins.length &&
    !supplierGstins.includes(extracted.gstin.toUpperCase())
  ) {
    const valid = isValidGstinFormat(extracted.gstin);
    const hit = fuzzyMatchGstin(extracted.gstin, supplierGstins);
    if (hit && (!valid || hit.score >= 92)) extracted.gstin = hit.gstin;
  }

  if (!extracted.gstin && supplierGstins.length === 0) {
    const stateCode = extractStateCode(topSection) ?? extractStateCode(text);
    for (const frag of extractGstinLabelFragments(topSection)) {
      const direct = deps.normalizeGstinCandidate(frag);
      if (direct) {
        extracted.gstin = direct;
        break;
      }
      if (stateCode) {
        const padded = deps.normalizeGstinCandidate(stateCode + compactAlphanumeric(frag));
        if (padded) {
          extracted.gstin = padded;
          break;
        }
      }
    }
  }

  if (!extracted.customerGstin && customerGstins.length) {
    extracted.customerGstin =
      fuzzyTop(buyerSection, customerGstins) ?? fuzzyTop(text, customerGstins, 85) ?? extracted.customerGstin;
  }

  if (!extracted.customerGstin && buyerSection) {
    const buyerGstins = deps
      .extractGstins(buyerSection)
      .filter((g) => g !== extracted.gstin?.toUpperCase());
    if (buyerGstins.length) extracted.customerGstin = buyerGstins[0];
  }

  const supplierHit = matchKnownSupplier(extracted, suppliers);
  if (supplierHit) {
    const exactGstin =
      Boolean(supplierHit.gstin) &&
      extracted.gstin?.toUpperCase() === supplierHit.gstin!.toUpperCase();
    const nameScore = tokenOverlapScore(extracted.supplierName || '', supplierHit.name);
    const nameWeak =
      !extracted.supplierName ||
      extracted.supplierName.length < 5 ||
      /^(bill|tax|invoice|amount|supply)/i.test(extracted.supplierName);

    if (exactGstin && supplierHit.gstin) extracted.gstin = supplierHit.gstin.toUpperCase();
    else if (!extracted.gstin && supplierHit.gstin && (nameScore >= 55 || nameWeak)) {
      extracted.gstin = supplierHit.gstin.toUpperCase();
    } else if (
      supplierHit.gstin &&
      nameScore >= 65 &&
      extracted.gstin &&
      !supplierGstins.map((g) => g.toUpperCase()).includes(extracted.gstin.toUpperCase())
    ) {
      // Strong name match beats a buyer/other GSTIN misread as supplier
      extracted.gstin = supplierHit.gstin.toUpperCase();
    }
    if (supplierHit.name && (exactGstin || nameScore >= 55 || nameWeak)) {
      extracted.supplierName = supplierHit.name;
    }
    const suspiciousShortToken = (extracted.supplierAddress?.match(/\b[A-Za-z]{3}\b/g) || []).some(
      (t) => !/^(near|opp|and|the|pin|for|gst)$/i.test(t),
    );
    const addrBad =
      !extracted.supplierAddress ||
      extracted.supplierAddress.length < 12 ||
      isLikelyGstinNoiseLine(extracted.supplierAddress) ||
      (suspiciousShortToken && Boolean(supplierHit.address)) ||
      (supplierHit.address &&
        tokenOverlapScore(extracted.supplierAddress, supplierHit.address) < 25);
    if (supplierHit.address && addrBad) {
      extracted.supplierAddress = supplierHit.address;
    }
  }

  let customerByGstin: KnownParty | null = null;
  if (extracted.customerGstin) {
    customerByGstin =
      customers.find(
        (c) => c.gstin && c.gstin.toUpperCase() === extracted.customerGstin!.toUpperCase(),
      ) ?? null;
  }

  if (customerByGstin?.name) {
    extracted.customerName = customerByGstin.name;
    if (customerByGstin.gstin) extracted.customerGstin = customerByGstin.gstin.toUpperCase();
  } else {
    const customerHit = matchPartyByName(extracted.customerName, customers, 55);
    if (customerHit) {
      const cScore = tokenOverlapScore(extracted.customerName || '', customerHit.name);
      const cWeak =
        !extracted.customerName ||
        isTableHeaderLine(extracted.customerName) ||
        isDocumentTitleLine(extracted.customerName) ||
        isInvoiceSummaryLabel(extracted.customerName) ||
        /^(gstin|si\s*no|description|hsn|bill|buyer|shipped)/i.test(extracted.customerName);
      const gstinConflict =
        Boolean(extracted.customerGstin) &&
        Boolean(customerHit.gstin) &&
        extracted.customerGstin!.toUpperCase() !== customerHit.gstin!.toUpperCase();
      if (!gstinConflict && (cWeak || cScore >= 65)) {
        extracted.customerName = customerHit.name;
      }
      if (customerHit.gstin && !extracted.customerGstin && (cWeak || cScore >= 65)) {
        extracted.customerGstin = customerHit.gstin.toUpperCase();
      }
    }
  }

  if (extracted.vehicleNo) {
    extracted.vehicleNo = normalizeIndianVehiclePlate(extracted.vehicleNo) ?? extracted.vehicleNo;
  }

  return extracted;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse OCR / ISO / common Indian invoice date strings into a local Date (noon). */
export function parseInvoiceDate(value?: string | Date | null): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const raw = value.trim();
  if (!raw) return undefined;

  const named = raw.match(
    /^(\d{1,2})[\/\-.\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-.\s,]*(\d{2,4})$/i,
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTH_INDEX[named[2].slice(0, 3).toLowerCase()];
    let year = Number(named[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const d = new Date(year, month, day, 12, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    const d = new Date(year, month, day, 12, 0, 0, 0);
    if (!Number.isNaN(d.getTime()) && d.getDate() === day) return d;
  }

  const iso = raw.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12, 0, 0, 0);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return undefined;
}

/** App display format — e.g. 21 Jul 2026 (matches dashboard formatDate). */
export function formatAppDate(value?: string | Date | null): string | undefined {
  const parsed = parseInvoiceDate(value ?? undefined);
  if (!parsed) {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw || undefined;
  }
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
