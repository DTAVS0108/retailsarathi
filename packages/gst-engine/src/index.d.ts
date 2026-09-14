import type { SupplyType } from "@retail-sarathi/types";
export interface LineItemInput {
    quantity: number;
    unitPrice: number;
    discount?: number;
    gstRate: number;
    hsnCode: string;
    productName: string;
    productId?: string;
}
export interface CalculatedLine {
    productId?: string;
    productName: string;
    hsnCode: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    taxableAmount: number;
    gstRate: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
}
export interface InvoiceTotals {
    subtotal: number;
    totalDiscount: number;
    totalCgst: number;
    totalSgst: number;
    totalIgst: number;
    grandTotal: number;
    supplyType: SupplyType;
    lines: CalculatedLine[];
}
export declare function determineSupplyType(sellerStateCode: string, buyerStateCode?: string): SupplyType;
export declare function calculateLineTax(item: LineItemInput, supplyType: SupplyType): CalculatedLine;
export declare function calculateInvoice(items: LineItemInput[], sellerStateCode: string, buyerStateCode?: string): InvoiceTotals;
export declare function validateGstin(gstin: string): boolean;
export interface HsnSummaryRow {
    hsnCode: string;
    description: string;
    uqc: string;
    totalQuantity: number;
    totalValue: number;
    taxableValue: number;
    igst: number;
    cgst: number;
    sgst: number;
}
export declare function buildHsnSummary(lines: CalculatedLine[]): HsnSummaryRow[];
export interface Gstr3bSummary {
    outwardTaxable: number;
    outwardIgst: number;
    outwardCgst: number;
    outwardSgst: number;
    totalTaxPayable: number;
}
export declare function buildGstr3bSummary(lines: CalculatedLine[]): Gstr3bSummary;
export declare function buildGstr1Payload(gstin: string, fp: string, invoices: Array<{
    invoiceNumber: string;
    date: string;
    customerGstin?: string;
    customerName: string;
    placeOfSupply: string;
    lines: CalculatedLine[];
    grandTotal: number;
}>): {
    gstin: string;
    fp: string;
    version: string;
    hash: string;
    b2b: unknown[];
    b2cl: never[];
    b2cs: unknown[];
    hsn: {
        data: HsnSummaryRow[];
    };
};
