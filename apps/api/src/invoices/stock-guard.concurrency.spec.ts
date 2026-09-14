/**
 * Phase 0 concurrency helper: conditional stock decrement must not go negative.
 * Run: npx ts-node src/invoices/stock-guard.concurrency.spec.ts
 */
function simulateConcurrentSales(initialStock: number, qtyEach: number, attempts: number) {
  let stock = initialStock;
  let success = 0;
  let rejected = 0;
  for (let i = 0; i < attempts; i++) {
    if (stock >= qtyEach) {
      stock -= qtyEach;
      success += 1;
    } else {
      rejected += 1;
    }
  }
  return { stock, success, rejected };
}

const r = simulateConcurrentSales(5, 1, 10);
if (r.stock < 0) throw new Error('Negative stock');
if (r.success !== 5 || r.rejected !== 5) {
  throw new Error(`Expected 5 success / 5 reject, got ${r.success}/${r.rejected}`);
}
console.log('stock-guard concurrency simulation OK', r);
