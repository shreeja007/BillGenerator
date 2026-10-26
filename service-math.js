(function (root) {
  'use strict';
  const MAX_AMOUNT = 999999999.99;
  function calculateServiceInvoice(items) {
    if (!Array.isArray(items) || !items.length) throw new RangeError('Add at least one service item.');
    let grossCents = 0, discountCents = 0;
    const lines = items.map((item, index) => {
      const label = `Item ${index + 1}`;
      if (!String(item.description || '').trim()) throw new RangeError(`${label}: enter a description.`);
      if (!Number.isFinite(item.qty) || item.qty <= 0 || item.qty > 1000000) throw new RangeError(`${label}: quantity must be greater than zero and at most 1,000,000.`);
      if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0 || item.unitPrice > MAX_AMOUNT) throw new RangeError(`${label}: enter a valid, non-negative unit price.`);
      if (!Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100) throw new RangeError(`${label}: discount must be between 0 and 100%.`);
      const gross = Math.round((item.qty * item.unitPrice + Number.EPSILON) * 100);
      const discount = Math.round(gross * item.discountPercent / 100);
      grossCents += gross;
      discountCents += discount;
      return { ...item, gross: gross / 100, discount: discount / 100, amount: (gross - discount) / 100 };
    });
    const taxableCents = grossCents - discountCents;
    const vatCents = Math.round(taxableCents * 13 / 100);
    const netCents = taxableCents + vatCents;
    if (Math.max(grossCents, netCents) > MAX_AMOUNT * 100) throw new RangeError('Invoice amounts must be below 1,000,000,000 NPR.');
    return { lines, grossAmount: grossCents / 100, discountAmount: discountCents / 100, taxableAmount: taxableCents / 100, vatAmount: vatCents / 100, netAmount: netCents / 100 };
  }
  const api = { calculateServiceInvoice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ServiceMath = api;
})(globalThis);
