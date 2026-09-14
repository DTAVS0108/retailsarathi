"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.determineSupplyType = determineSupplyType;
exports.calculateLineTax = calculateLineTax;
exports.calculateInvoice = calculateInvoice;
exports.validateGstin = validateGstin;
exports.buildHsnSummary = buildHsnSummary;
exports.buildGstr3bSummary = buildGstr3bSummary;
exports.buildGstr1Payload = buildGstr1Payload;
function determineSupplyType(sellerStateCode, buyerStateCode) {
    if (!buyerStateCode || sellerStateCode === buyerStateCode) {
        return 'INTRA_STATE';
    }
    return 'INTER_STATE';
}
function calculateLineTax(item, supplyType) {
    const discount = item.discount ?? 0;
    const gross = item.quantity * item.unitPrice;
    const taxableAmount = Math.max(0, gross - discount);
    const taxAmount = (taxableAmount * item.gstRate) / 100;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (supplyType === 'INTRA_STATE') {
        cgst = taxAmount / 2;
        sgst = taxAmount / 2;
    }
    else {
        igst = taxAmount;
    }
    return {
        productId: item.productId,
        productName: item.productName,
        hsnCode: item.hsnCode,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount,
        taxableAmount: round2(taxableAmount),
        gstRate: item.gstRate,
        cgst: round2(cgst),
        sgst: round2(sgst),
        igst: round2(igst),
        total: round2(taxableAmount + cgst + sgst + igst),
    };
}
function calculateInvoice(items, sellerStateCode, buyerStateCode) {
    const supplyType = determineSupplyType(sellerStateCode, buyerStateCode);
    const lines = items.map((item) => calculateLineTax(item, supplyType));
    const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
    const totalDiscount = round2(lines.reduce((s, l) => s + l.discount, 0));
    const totalCgst = round2(lines.reduce((s, l) => s + l.cgst, 0));
    const totalSgst = round2(lines.reduce((s, l) => s + l.sgst, 0));
    const totalIgst = round2(lines.reduce((s, l) => s + l.igst, 0));
    const grandTotal = round2(lines.reduce((s, l) => s + l.total, 0));
    return {
        subtotal,
        totalDiscount,
        totalCgst,
        totalSgst,
        totalIgst,
        grandTotal,
        supplyType,
        lines,
    };
}
function validateGstin(gstin) {
    const pattern = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return pattern.test(gstin.toUpperCase());
}
function buildHsnSummary(lines) {
    const map = new Map();
    for (const line of lines) {
        const existing = map.get(line.hsnCode);
        if (existing) {
            existing.totalQuantity += line.quantity;
            existing.totalValue += line.total;
            existing.taxableValue += line.taxableAmount;
            existing.igst += line.igst;
            existing.cgst += line.cgst;
            existing.sgst += line.sgst;
        }
        else {
            map.set(line.hsnCode, {
                hsnCode: line.hsnCode,
                description: line.productName,
                uqc: 'NOS',
                totalQuantity: line.quantity,
                totalValue: line.total,
                taxableValue: line.taxableAmount,
                igst: line.igst,
                cgst: line.cgst,
                sgst: line.sgst,
            });
        }
    }
    return Array.from(map.values()).map((row) => ({
        ...row,
        totalValue: round2(row.totalValue),
        taxableValue: round2(row.taxableValue),
        igst: round2(row.igst),
        cgst: round2(row.cgst),
        sgst: round2(row.sgst),
    }));
}
function buildGstr3bSummary(lines) {
    const outwardTaxable = round2(lines.reduce((s, l) => s + l.taxableAmount, 0));
    const outwardIgst = round2(lines.reduce((s, l) => s + l.igst, 0));
    const outwardCgst = round2(lines.reduce((s, l) => s + l.cgst, 0));
    const outwardSgst = round2(lines.reduce((s, l) => s + l.sgst, 0));
    return {
        outwardTaxable,
        outwardIgst,
        outwardCgst,
        outwardSgst,
        totalTaxPayable: round2(outwardIgst + outwardCgst + outwardSgst),
    };
}
function buildGstr1Payload(gstin, fp, invoices) {
    const b2b = [];
    const b2cs = [];
    for (const inv of invoices) {
        const items = inv.lines.map((l) => ({
            num: 1,
            hsn_sc: l.hsnCode,
            qty: l.quantity,
            rt: l.gstRate,
            txval: l.taxableAmount,
            iamt: l.igst,
            camt: l.cgst,
            samt: l.sgst,
        }));
        if (inv.customerGstin) {
            b2b.push({
                ctin: inv.customerGstin,
                inv: [
                    {
                        inum: inv.invoiceNumber,
                        idt: inv.date,
                        val: inv.grandTotal,
                        pos: inv.placeOfSupply,
                        itms: items,
                    },
                ],
            });
        }
        else {
            b2cs.push({
                sply_ty: 'INTRA',
                rt: inv.lines[0]?.gstRate ?? 18,
                typ: 'OE',
                pos: inv.placeOfSupply,
                txval: inv.lines.reduce((s, l) => s + l.taxableAmount, 0),
                iamt: inv.lines.reduce((s, l) => s + l.igst, 0),
                camt: inv.lines.reduce((s, l) => s + l.cgst, 0),
                samt: inv.lines.reduce((s, l) => s + l.sgst, 0),
            });
        }
    }
    return {
        gstin,
        fp,
        version: 'GST3.1.8',
        hash: 'hash',
        b2b,
        b2cl: [],
        b2cs,
        hsn: { data: buildHsnSummary(invoices.flatMap((i) => i.lines)) },
    };
}
function round2(n) {
    return Math.round(n * 100) / 100;
}
//# sourceMappingURL=index.js.map