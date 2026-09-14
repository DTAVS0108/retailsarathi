/** Map shop/product unit strings to GST UQC codes used on e-invoice / HSN tables. */
export function mapUnitToUqc(unit?: string | null): string {
  const raw = (unit ?? 'pcs').trim().toLowerCase();
  const map: Record<string, string> = {
    pcs: 'NOS',
    pc: 'NOS',
    piece: 'NOS',
    pieces: 'NOS',
    nos: 'NOS',
    no: 'NOS',
    unit: 'NOS',
    units: 'NOS',
    kg: 'KGS',
    kgs: 'KGS',
    g: 'GMS',
    gm: 'GMS',
    gms: 'GMS',
    gram: 'GMS',
    grams: 'GMS',
    ltr: 'LTR',
    litre: 'LTR',
    liter: 'LTR',
    l: 'LTR',
    mtr: 'MTR',
    meter: 'MTR',
    metre: 'MTR',
    box: 'BOX',
    set: 'SET',
    pair: 'PRS',
    prs: 'PRS',
    bag: 'BAG',
    bun: 'BUN',
    can: 'CAN',
    ctn: 'CTN',
    doz: 'DOZ',
    dozen: 'DOZ',
  };
  if (map[raw]) return map[raw];
  if (/^[a-z]{3}$/i.test(raw)) return raw.toUpperCase();
  return 'NOS';
}

/** Short print label next to quantity (Tally/Goel style). */
export function formatUnitLabel(unit?: string | null): string {
  const uqc = mapUnitToUqc(unit);
  const labels: Record<string, string> = {
    NOS: 'Pcs.',
    KGS: 'Kg',
    GMS: 'Gm',
    LTR: 'Ltr',
    MTR: 'Mtr',
    BOX: 'Box',
    SET: 'Set',
    PRS: 'Prs',
    BAG: 'Bag',
    BUN: 'Bun',
    CAN: 'Can',
    CTN: 'Ctn',
    DOZ: 'Doz',
  };
  return labels[uqc] ?? uqc;
}
