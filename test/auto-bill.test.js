const test = require('node:test');
const assert = require('node:assert/strict');
const auto = require('../auto-bill');

test('sample fuel bills preserve entered facts and use explicit sample references', () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    const result = auto.fuel({ mode: 'sample', name: 'Correct Company', bs: '२०८३/०७/०९', rate: '172.34', basis: 'random' });
    assert.equal(result.name, 'Correct Company');
    assert.equal(result.date.adInput, '2026-10-26');
    assert.equal(result.fields.retailRate, 172.34);
    assert.equal(result.documentKind, 'sample');
    assert.match(result.invoiceNo, /^SAMPLE-P-20261026-/);
    assert.ok([5, 7.5, 10, 12.5, 15, 20].includes(result.fields.qty));
    seen.add(result.invoiceNo);
  }
  assert.equal(seen.size, 30);
});

test('actual fuel bills use the original reference, amount and discount without randomization', () => {
  const result = auto.fuel({ mode: 'transaction', name: 'Real Company', bs: '2083/04/23', rate: 200, basis: 'amount', value: 2000, discount: 25, reference: 'ORIGINAL-481' });
  assert.equal(result.documentKind, 'transaction');
  assert.equal(result.invoiceNo, 'ORIGINAL-481');
  assert.equal(result.calculated.netAmount, 2000);
  assert.equal(result.calculated.discount, 25);
  assert.equal(result.fields.qty, 10.14125);
});

test('actual transactions cannot use random quantities, missing facts or generated sample references', () => {
  const input = { mode: 'transaction', name: 'Customer', bs: '2083/07/09', rate: 200, basis: 'qty', value: 5, reference: 'REAL-1' };
  for (const change of [{ basis: 'random' }, { reference: '' }, { reference: 'SAMPLE-P-20261026-123' }, { rate: '' }, { value: 0 }, { value: -1 }, { name: '' }, { bs: '2083/12/32' }]) {
    assert.throws(() => auto.fuel({ ...input, ...change }), RangeError);
  }
});

test('sample service generation keeps supplied products and prices and only fills unspecified quantities', () => {
  const result = auto.service({ mode: 'sample', name: 'Customer', bs: '2083/07/09', items: [
    { description: 'Mobil', unitPrice: '1000', qty: '' },
    { description: 'O-RING', unitPrice: '59.39054', qty: '2', discountPercent: 10 }
  ] });
  assert.match(result.invoiceNo, /^SAMPLE-S-20261026-/);
  assert.equal(result.items[0].description, 'Mobil');
  assert.equal(result.items[0].unitPrice, 1000);
  assert.ok(result.items[0].qty >= 1 && result.items[0].qty <= 3);
  assert.equal(result.items[1].qty, 2);
  assert.equal(result.items[1].unitPrice, 59.39054);
  assert.equal(result.items[1].discountPercent, 10);
});

test('actual service quantities and prices must be supplied, including valid free work', () => {
  const input = { mode: 'transaction', name: 'Customer', bs: '2083/07/09', reference: 'SERVICE-93', items: [{ description: 'Warranty service', unitPrice: '0', qty: '1' }] };
  assert.equal(auto.service(input).calculated.netAmount, 0);
  assert.equal(auto.service(input).invoiceNo, 'SERVICE-93');
  assert.throws(() => auto.service({ ...input, items: [{ description: 'Labour', unitPrice: 1000, qty: '' }] }), /actual quantity/);
  assert.throws(() => auto.service({ ...input, items: [{ description: 'Labour', unitPrice: '', qty: 1 }] }), /price/);
  assert.throws(() => auto.service({ ...input, items: [] }), /products/);
});
