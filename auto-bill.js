/* Automation uses explicit transaction facts, or visibly labelled sample data. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./invoice-dates'), require('./invoice-math'), require('./service-math'));
  else root.AutoBill = factory(root.InvoiceDates, root.InvoiceMath, root.ServiceMath);
})(globalThis, function (dates, fuelMath, serviceMath) {
  'use strict';
  function numeric(value, label) {
    if (String(value ?? '').trim() === '') throw new RangeError(`Enter ${label}.`);
    const number = Number(value);
    if (!Number.isFinite(number)) throw new RangeError(`Enter a valid ${label}.`);
    return number;
  }
  function reference(kind, date) {
    const id = globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 10).toUpperCase()
      || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
    return `SAMPLE-${kind === 'fuel' ? 'P' : 'S'}-${date.adInput.replace(/-/g, '')}-${id}`;
  }
  function basics(input, kind) {
    const name = String(input.name || '').trim();
    if (!name) throw new RangeError('Enter the customer or company name.');
    const date = dates.fromBS(input.bs);
    if (date.time) throw new RangeError('Enter a Nepali date without a time.');
    const sample = input.mode !== 'transaction';
    let invoiceNo = String(input.reference || '').trim();
    if (sample) invoiceNo = reference(kind, date);
    else if (!invoiceNo || /^(SAMPLE|DEMO)[-\s]/i.test(invoiceNo)) throw new RangeError('Enter the original invoice reference for an actual transaction.');
    return { name, date, invoiceNo, documentKind: sample ? 'sample' : 'transaction' };
  }
  function fuel(input) {
    const result = basics(input, 'fuel');
    const retailRate = numeric(input.rate, 'the pump rate');
    const random = input.basis === 'random';
    if (random && result.documentKind !== 'sample') throw new RangeError('Actual transactions need their real quantity or paid amount.');
    const qty = random ? [5, 7.5, 10, 12.5, 15, 20][Math.floor(Math.random() * 6)]
      : input.basis === 'amount' ? 0 : numeric(input.value, 'the quantity');
    const targetAmount = input.basis === 'amount' ? numeric(input.value, 'the paid amount') : 0;
    const mode = input.basis === 'amount' ? 'amount' : 'qty';
    const discount = String(input.discount ?? '').trim() === '' ? 0 : numeric(input.discount, 'the discount');
    const calculated = fuelMath.calculateInvoice({ retailRate, qty, targetAmount, mode, discount });
    if (calculated.qty <= 0) throw new RangeError('Enter a quantity or paid amount greater than zero.');
    return { ...result, fields: { retailRate, qty: calculated.qty, targetAmount: calculated.netAmount, discount, calcMode: mode }, calculated };
  }
  function service(input) {
    const result = basics(input, 'service');
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) throw new RangeError('Add the products or services to include.');
    const items = input.items.map((item, index) => {
      const emptyQty = String(item.qty ?? '').trim() === '';
      if (emptyQty && result.documentKind !== 'sample') throw new RangeError(`Enter the actual quantity for product ${index + 1}.`);
      return {
        code: String(item.code || ''), hsCode: String(item.hsCode || ''),
        description: String(item.description || '').trim(), unit: String(item.unit || 'PCS'),
        qty: emptyQty ? 1 + Math.floor(Math.random() * 3) : numeric(item.qty, `the quantity for product ${index + 1}`),
        unitPrice: numeric(item.unitPrice, `the price for product ${index + 1}`),
        discountPercent: String(item.discountPercent ?? '').trim() === '' ? 0 : numeric(item.discountPercent, `the discount for product ${index + 1}`)
      };
    });
    const calculated = serviceMath.calculateServiceInvoice(items);
    return { ...result, items, calculated };
  }
  return { fuel, service };
});
