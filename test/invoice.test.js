const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const { calculateInvoice, numberToWords, formatCurrency } = require('../invoice-math');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const source = readFileSync(require.resolve('../app.js'), 'utf8');
const mathSource = readFileSync(require.resolve('../invoice-math.js'), 'utf8');
const calendarSource = readFileSync(require.resolve('../vendor/nepali-date-converter-3.4.0.umd.js'), 'utf8');
const datesSource = readFileSync(require.resolve('../invoice-dates.js'), 'utf8');
const exportSource = readFileSync(require.resolve('../invoice-export.js'), 'utf8');
const cents = value => Math.round(value * 100);

async function boot(t) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  // Wait for jsdom's own load event, then load only our local scripts, without network requests.
  await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  window.eval(calendarSource);
  window.eval(datesSource);
  window.eval(mathSource);
  window.eval(exportSource);
  window.eval(source);
  window.dispatchEvent(new window.Event('DOMContentLoaded'));
  const doc = window.document;
  const input = (id, value, type = 'input') => {
    const el = doc.getElementById(id);
    el.value = String(value);
    el.dispatchEvent(new window.Event(type, { bubbles: true }));
  };
  const radio = (name, value) => {
    const el = doc.querySelector(`input[name="${name}"][value="${value}"]`);
    el.checked = true;
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const text = key => doc.querySelector(`[data-sync="${key}"]`).textContent;
  const edit = (key, value) => {
    const el = doc.querySelector(`[contenteditable][data-sync="${key}"]`);
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
    el.blur();
    return el;
  };
  return { window, doc, input, radio, text, edit };
}

test('default bill reconciles to paisa', () => {
  const result = calculateInvoice({ retailRate: 200, qty: 10 });
  assert.equal(result.basicAmount, 1769.91);
  assert.equal(result.vatAmount, 230.09);
  assert.equal(result.netAmount, 2000);
});

test('discount and VAT reconcile for fractional quantities and rates', () => {
  for (let i = 1; i < 500; i++) {
    const result = calculateInvoice({ retailRate: 153.87, qty: i / 37, discount: 0.01 });
    assert.equal(cents(result.basicAmount) - cents(result.discount), cents(result.taxableAmount));
    assert.equal(cents(result.taxableAmount) + cents(result.vatAmount), cents(result.netAmount));
  }
});

test('amount mode keeps target and accounts for a pre-VAT discount', () => {
  const result = calculateInvoice({ retailRate: 200, mode: 'amount', targetAmount: 2000.01, discount: 50 });
  assert.equal(result.netAmount, 2000.01);
  assert.equal(cents(result.basicAmount) - cents(result.discount), cents(result.taxableAmount));
  assert.equal(cents(result.taxableAmount) + cents(result.vatAmount), cents(result.netAmount));
  assert.ok(Math.abs(result.qty * 200 - 50 * 1.13 - 2000.01) < 1e-8);
});

test('invalid numeric values and excessive discounts are rejected', () => {
  for (const qty of [-1, NaN, Infinity, 1000001]) {
    assert.throws(() => calculateInvoice({ retailRate: 200, qty }), RangeError);
  }
  for (const retailRate of [0, -1, Infinity, 1000001]) {
    assert.throws(() => calculateInvoice({ retailRate, qty: 10 }), RangeError);
  }
  assert.throws(() => calculateInvoice({ retailRate: 200, qty: 10, discount: 2000 }), /Discount/);
  assert.throws(() => calculateInvoice({ retailRate: 1000000, qty: 1000000 }), /amounts below/);
});

test('zero, paisa, lakh, crore, and carry rounding produce correct words', () => {
  assert.equal(numberToWords(0, true), 'ZERO ONLY');
  assert.equal(numberToWords(0), 'NRS Zero And Zero Only');
  assert.equal(numberToWords(0.01, true), 'ZERO AND ONE PAISA ONLY');
  assert.equal(numberToWords(999.999, true), 'ONE THOUSAND ONLY');
  assert.equal(numberToWords(12345678.9, true), 'ONE CRORE TWENTY THREE LAKH FORTY FIVE THOUSAND SIX HUNDRED SEVENTY EIGHT AND NINETY PAISA ONLY');
  assert.equal(numberToWords(Infinity, true), 'ZERO ONLY');
  assert.equal(formatCurrency(Infinity), '0.00');
});

test('initial date, sidebar fields, copies and calculated words agree', async t => {
  const { doc, text } = await boot(t);
  assert.equal(doc.getElementById('invoiceDate').value, '2026-08-08');
  assert.equal(text('date'), '08/08/2026');
  assert.equal(text('netAmount'), '2,000.00');
  assert.equal(doc.querySelectorAll('[contenteditable][data-sync="inWords"]').length, 0);
  assert.equal(doc.querySelector('.format2-only').hidden, true);
});

test('target survives rate, fuel, discount, and template changes', async t => {
  const { doc, radio, input, text } = await boot(t);
  radio('calcMode', 'amount');
  input('inputTotalAmount', 1234.56);
  input('retailRate', 217.35);
  assert.equal(text('netAmount'), '1,234.56');
  input('fuelType', 'Diesel', 'change');
  input('inputDiscount', 10);
  input('templateSelect', 'banglamukhi', 'change');
  assert.equal(text('netAmount'), '1,234.56');
  assert.equal(doc.getElementById('inputTotalAmount').value, '1234.56');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-08-31');
  assert.equal(doc.querySelector('.format2-only').hidden, false);
});

test('metadata editing syncs every copy and preserves the active editor', async t => {
  const { window, doc, text } = await boot(t);
  const editor = doc.querySelector('[contenteditable][data-sync="buyer"]');
  editor.focus();
  editor.textContent = 'A & <B>';
  const node = editor.firstChild;
  editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(editor.firstChild, node);
  for (const copy of doc.querySelectorAll('[data-sync="buyer"]')) assert.equal(copy.textContent, 'A & <B>');
  assert.equal(doc.getElementById('buyerName').value, 'A & <B>');
  assert.equal(doc.querySelector('[data-sync="buyer"] B'), null);
  assert.equal(text('buyer'), 'A & <B>');
});

test('custom particulars, HS code, unit, remarks and discount survive redraws', async t => {
  const { edit, input, text } = await boot(t);
  edit('particulars', 'Premium Fuel');
  edit('hscode', '1234');
  edit('unit', 'L');
  edit('remarks', 'Delivery');
  edit('disc', '25.50');
  input('inputQty', 12);
  assert.equal(text('particulars'), 'Premium Fuel');
  assert.equal(text('hscode'), '1234');
  assert.equal(text('unit'), 'L');
  assert.equal(text('remarks'), 'Delivery');
  assert.equal(text('discountAmount'), '25.50');
});

test('rounded quantity does not drift when recalculating in amount mode', async t => {
  const { input, radio, text } = await boot(t);
  radio('calcMode', 'amount');
  input('inputTotalAmount', 1234.56);
  for (let i = 0; i < 15; i++) {
    input('retailRate', 200 + i);
    assert.equal(text('netAmount'), '1,234.56');
  }
});

test('focusing and blurring a rounded rate does not change the amount', async t => {
  const { doc, input, text } = await boot(t);
  input('templateSelect', 'banglamukhi', 'change');
  const editor = doc.querySelector('.template-banglamukhi-view [data-sync="rate"]');
  editor.focus(); editor.blur();
  assert.equal(text('netAmount'), '2,000.00');
  assert.equal(doc.getElementById('retailRate').value, '200.00');
});

test('direct quantity edits select quantity mode; direct rate edits keep amount mode', async t => {
  const { edit, radio, text, doc } = await boot(t);
  radio('calcMode', 'amount');
  edit('rate', '200');
  assert.equal(text('netAmount'), '2,000.00');
  edit('qty', '12');
  assert.equal(doc.querySelector('input[name="calcMode"]:checked').value, 'qty');
  assert.equal(text('netAmount'), '2,712.00');
});

test('invalid values disable export and recover on correction', async t => {
  const { input, doc, text } = await boot(t);
  input('inputQty', -5);
  assert.equal(doc.getElementById('btnDownloadPdf').disabled, true);
  assert.match(doc.getElementById('appStatus').textContent, /non-negative/);
  input('inputQty', 0);
  assert.equal(doc.getElementById('btnDownloadPdf').disabled, false);
  assert.equal(text('inWordsCaps'), 'ZERO ONLY');
  input('retailRate', 0);
  assert.equal(doc.getElementById('btnPrint').disabled, true);
  input('retailRate', 200);
  assert.equal(doc.getElementById('btnPrint').disabled, false);
});

test('date changes, direct date edits and clearing date keep controls in sync', async t => {
  const { input, edit, text, doc } = await boot(t);
  input('invoiceDate', '2026-10-26', 'change');
  assert.equal(text('date'), '26/10/2026');
  assert.equal(doc.getElementById('invoiceMiti').value, '2083/07/09');
  assert.equal(text('miti'), '2083/07/09');
  edit('date', '27/10/2026');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-10-27');
  assert.equal(text('miti'), '2083/07/10');
  input('invoiceDate', '', 'change');
  assert.equal(text('date'), '');
  assert.equal(text('miti'), '');
});

test('BS input auto-converts AD and synchronizes all invoice copies', async t => {
  const { input, text, doc } = await boot(t);
  input('invoiceMiti', '2083/07/09');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-10-26');
  for (const node of doc.querySelectorAll('[data-sync="date"]')) assert.equal(node.textContent, '26/10/2026');
  for (const node of doc.querySelectorAll('[data-sync="miti"]')) assert.equal(node.textContent, '2083/07/09');
  input('invoiceMiti', '२०८३/०१/०१');
  assert.equal(text('date'), '14/04/2026');
  input('invoiceMiti', '');
  assert.equal(doc.getElementById('invoiceDate').value, '');
  assert.equal(text('date'), '');
  assert.equal(text('miti'), '');
});

test('direct BS receipt edits convert dates and preserve the template date format', async t => {
  const { input, edit, text, doc } = await boot(t);
  input('templateSelect', 'banglamukhi', 'change');
  assert.equal(doc.getElementById('invoiceMiti').value, '2083/05/15 09:41');
  assert.equal(text('miti'), '15/05/2083 09:41');
  input('invoiceDate', '2026-10-26');
  assert.equal(doc.getElementById('invoiceMiti').value, '2083/07/09 09:41');
  assert.equal(text('miti'), '09/07/2083 09:41');
  edit('miti', '10/07/2083 10:15');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-10-27');
  assert.equal(doc.getElementById('invoiceMiti').value, '2083/07/10 10:15');
  assert.equal(text('date'), '27/10/2026');
});

test('invalid dates show a local error, block export and recover independently of calculations', async t => {
  const { input, doc, text } = await boot(t);
  input('invoiceMiti', '2083/12/32');
  const error = doc.getElementById('dateConversionError');
  assert.equal(error.hidden, false);
  assert.match(error.textContent, /does not exist|valid BS/);
  assert.equal(doc.getElementById('invoiceMiti').getAttribute('aria-invalid'), 'true');
  assert.equal(doc.getElementById('btnDownloadPdf').disabled, true);
  assert.equal(text('date'), '08/08/2026');
  input('inputQty', 12);
  assert.equal(error.hidden, false);
  assert.equal(doc.getElementById('btnPrint').disabled, true);
  input('invoiceMiti', '2083/07/09');
  assert.equal(error.hidden, true);
  assert.equal(doc.getElementById('invoiceMiti').getAttribute('aria-invalid'), 'false');
  assert.equal(doc.getElementById('btnPrint').disabled, false);
  assert.equal(text('date'), '26/10/2026');
  input('invoiceDate', '2040-01-01', 'change');
  assert.match(error.textContent, /Supported dates/);
  assert.equal(doc.getElementById('btnPrint').disabled, true);
  input('templateSelect', 'banglamukhi', 'change');
  assert.equal(error.hidden, true);
  assert.equal(doc.getElementById('btnPrint').disabled, false);
});

test('typing BS does not reset the caret, then normalizes on blur', async t => {
  const { input, doc, text } = await boot(t);
  const bs = doc.getElementById('invoiceMiti');
  bs.focus();
  input('invoiceMiti', '2083/7/9');
  assert.equal(bs.value, '2083/7/9');
  assert.equal(text('date'), '26/10/2026');
  bs.blur();
  assert.equal(bs.value, '2083/07/09');
});

test('layout, tags, template defaults, PAN and themes update coherently', async t => {
  const { input, radio, doc, edit } = await boot(t);
  radio('printLayout', 'single-portrait');
  assert.ok(doc.getElementById('printSheet').classList.contains('portrait-mode'));
  assert.match(doc.getElementById('dynamicPrintPageStyle').textContent, /A4 portrait; margin: 8mm/);
  input('copyLabelMode', 'copies', 'change');
  assert.equal(doc.getElementById('copyTag2').textContent, '[ OFFICE COPY ]');
  input('templateSelect', 'banglamukhi', 'change');
  assert.equal(doc.getElementById('stationPanBoxes1').textContent, '610152898');
  assert.ok(doc.getElementById('billDocument1').classList.contains('white-paper'));
  input('paymentMode', 'credit');
  edit('remarks', 'test');
  input('templateSelect', 'himal', 'change');
  assert.equal(doc.getElementById('paymentMode').value, 'cash');
  assert.ok(doc.getElementById('billDocument1').classList.contains('pink-paper'));
});

test('PDF export snapshots copies, sanitizes filename and restores buttons', async t => {
  const { window, doc, input } = await boot(t);
  input('invNumber', 'ABC/123');
  let options, invoice;
  window.html2pdf = () => ({
    set(value) { options = value; return this; },
    from(value) { invoice = value; return this; },
    save() { return Promise.resolve(); }
  });
  await window.downloadAsPDF();
  assert.equal(options.filename, 'Petrol_Tax_Invoice_ABC_123.pdf');
  assert.equal(options.jsPDF.orientation, 'landscape');
  assert.notEqual(invoice, doc.getElementById('printSheet'));
  assert.ok(invoice.classList.contains('pdf-export'));
  assert.equal(doc.getElementById('btnDownloadPdf').disabled, false);
  assert.equal(doc.getElementById('appStatus').textContent, 'PDF downloaded.');
});

test('PDF library is deferred, integrity checked, and retryable after failure', async t => {
  const { window, doc } = await boot(t);
  assert.equal(doc.querySelector('script[src*="html2pdf"]'), null);
  window.console.error = () => {};
  const failed = window.downloadAsPDF();
  const script = doc.querySelector('script[src*="html2pdf"]');
  assert.match(script.integrity, /^sha384-/);
  script.dispatchEvent(new window.Event('error'));
  await failed;
  assert.equal(doc.getElementById('btnDownloadPdf').disabled, false);
  assert.match(doc.getElementById('appStatus').textContent, /Use Print/);
  const retry = window.downloadAsPDF();
  const replacement = doc.querySelector('script[src*="html2pdf"]');
  assert.notEqual(replacement, script);
  replacement.dispatchEvent(new window.Event('error'));
  await retry;
});

test('an export failure never leaves actions disabled', async t => {
  const { window, doc } = await boot(t);
  window.console.error = () => {};
  window.html2pdf = () => { throw new Error('Canvas failed'); };
  await window.downloadAsPDF();
  assert.equal(doc.getElementById('btnPrint').disabled, false);
  assert.equal(doc.getElementById('btnDownloadPdf').disabled, false);
  assert.match(doc.getElementById('appStatus').textContent, /Use Print/);
});

test('portrait export retains its starting invoice while edits continue, and rejects duplicate export', async t => {
  const { window, doc, radio, input } = await boot(t);
  radio('printLayout', 'single-portrait');
  input('buyerName', 'Starting buyer');
  let calls = 0, options, snapshot, complete;
  window.html2pdf = () => {
    calls++;
    return {
      set(value) { options = value; return this; },
      from(value) { snapshot = value; return this; },
      save() { return new Promise(resolve => { complete = resolve; }); }
    };
  };
  const pending = window.downloadAsPDF();
  await window.downloadAsPDF();
  input('buyerName', 'Later buyer');
  input('inputQty', -1);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  assert.equal(options.jsPDF.orientation, 'portrait');
  assert.deepEqual(Array.from(options.margin), [8, 8, 8, 8]);
  assert.equal(snapshot.querySelector('[data-sync="buyer"]').textContent, 'Starting buyer');
  complete();
  await pending;
  assert.equal(doc.getElementById('btnPrint').disabled, true);
  assert.match(doc.getElementById('appStatus').textContent, /non-negative/);
});

test('changing mode recovers from an invalid value in the inactive mode', async t => {
  const { radio, input, doc } = await boot(t);
  input('inputQty', -1);
  radio('calcMode', 'amount');
  input('inputTotalAmount', 500);
  assert.equal(doc.getElementById('btnDownloadPdf').disabled, false);
});
