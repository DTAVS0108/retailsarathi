import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateInvoice,
  determineSupplyType,
  validateGstin,
  pincodeMatchesState,
  parseAddressPayload,
} from './index.js';

describe('gst-engine', () => {
  it('determines intra-state supply', () => {
    assert.equal(determineSupplyType('27', '27'), 'INTRA_STATE');
  });

  it('determines inter-state supply', () => {
    assert.equal(determineSupplyType('27', '09'), 'INTER_STATE');
  });

  it('calculates CGST/SGST for intra-state', () => {
    const result = calculateInvoice(
      [
        {
          quantity: 1,
          unitPrice: 1000,
          gstRate: 18,
          hsnCode: '8517',
          productName: 'Mobile Phone',
        },
      ],
      '27',
      '27',
    );
    assert.equal(result.totalCgst, 90);
    assert.equal(result.totalSgst, 90);
    assert.equal(result.totalIgst, 0);
    assert.equal(result.grandTotal, 1180);
  });

  it('calculates IGST for inter-state', () => {
    const result = calculateInvoice(
      [
        {
          quantity: 1,
          unitPrice: 1000,
          gstRate: 18,
          hsnCode: '8517',
          productName: 'Mobile Phone',
        },
      ],
      '27',
      '09',
    );
    assert.equal(result.totalIgst, 180);
    assert.equal(result.grandTotal, 1180);
  });

  it('validates GSTIN format', () => {
    assert.equal(validateGstin('27AABCU9603R1ZM'), true);
    assert.equal(validateGstin('INVALID'), false);
  });

  it('matches PIN to GST state', () => {
    assert.equal(pincodeMatchesState('246701', '09'), true); // Bijnor, UP
    assert.equal(pincodeMatchesState('246701', '27'), false); // not Maharashtra
    assert.equal(pincodeMatchesState('110001', '07'), true); // Delhi
    assert.equal(pincodeMatchesState('400001', '27'), true); // Mumbai
    assert.equal(pincodeMatchesState('403001', '30'), true); // Goa override
  });

  it('rejects address when PIN and state disagree', () => {
    assert.throws(
      () =>
        parseAddressPayload({
          address: 'Shop 1',
          city: 'Bijnor',
          stateCode: '27',
          pincode: '246701',
          country: 'IN',
        }),
      /does not belong/,
    );
  });
});
