const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM } = require('jsdom');
const { calculateServiceInvoice } = require('../service-math');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const scripts = ['vendor/nepali-date-converter-3.4.0.umd.js', 'invoice-dates.js', 'invoice-math.js', 'invoice-export.js', 'service-math.js', 'service-brands.js', 'service.js']
  .map(file => readFileSync(require.resolve(`../${file}`), 'utf8'));

async function boot(t) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const { window } = dom;
  await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  for (const source of scripts) window.eval(source);
  window.dispatchEvent(new window.Event('DOMContentLoaded'));
  const doc = window.document;
  const input = (id, value, event = 'input') => {
    const element = doc.getElementById(id);
    element.value = String(value);
    element.dispatchEvent(new window.Event(event, { bubbles: true }));
  };
  const itemInput = (index, field, value) => {
    const element = doc.querySelectorAll('.service-item-card')[index].querySelector(`[data-item-field="${field}"]`);
    element.value = String(value);
    element.dispatchEvent(new window.Event('input', { bubbles: true }));
  };
  const text = key => doc.querySelector(`.service-page [data-service-sync="${key}"]`).textContent;
  return { window, doc, input, itemInput, text };
}

test('service item discounts are rounded per line and totals reconcile to paisa', () => {
  const result = calculateServiceInvoice([
    { description: 'Oil', qty: 2, unitPrice: 710.2581, discountPercent: 10 },
    { description: 'Labour', qty: 1, unitPrice: 443, discountPercent: 50 }
  ]);
  assert.equal(result.grossAmount, 1863.52);
  assert.equal(result.discountAmount, 363.55);
  assert.equal(result.taxableAmount, 1499.97);
  assert.equal(result.vatAmount, 195);
  assert.equal(result.netAmount, 1694.97);
  assert.equal(result.lines[0].amount, 1278.47);
});

test('service calculation rejects empty bills, invalid quantities, prices and percentages', () => {
  const item = { description: 'Labour', qty: 1, unitPrice: 1000, discountPercent: 0 };
  assert.throws(() => calculateServiceInvoice([]), /at least one/);
  for (const overrides of [{ description: '' }, { qty: 0 }, { qty: -1 }, { qty: Infinity }, { unitPrice: -1 }, { unitPrice: NaN }, { discountPercent: -1 }, { discountPercent: 101 }]) {
    assert.throws(() => calculateServiceInvoice([{ ...item, ...overrides }]), RangeError);
  }
  assert.throws(() => calculateServiceInvoice([{ ...item, qty: 1000000, unitPrice: 1000000 }]), /below/);
  assert.equal(calculateServiceInvoice([{ ...item, discountPercent: 100 }]).netAmount, 0);
});

test('Mobil sample reproduces the 1,130 NPR bill and invoice fields', async t => {
  const { doc, text } = await boot(t);
  assert.equal(text('netAmount'), '1,130.00');
  assert.equal(text('vatAmount'), '130.00');
  assert.equal(text('inWords'), 'ONE THOUSAND ONE HUNDRED THIRTY RUPEES ONLY');
  assert.equal(text('customerName'), 'Shreeja Manandhar');
  assert.equal(text('model'), 'MT-15');
  assert.equal(text('displayDate'), '2026-02-05');
  assert.equal(doc.querySelectorAll('.service-lines tbody tr').length, 1);
  assert.equal(doc.querySelector('.service-page-number').textContent, 'Page 1 of 1');
  assert.equal(doc.getElementById('servicePdf').disabled, false);
  assert.ok(doc.querySelector('nav a[href="index.html"]'));
});

test('six-item service sample matches the photographed 4,489.68 NPR total', async t => {
  const { input, doc, text } = await boot(t);
  input('serviceSample', 'maintenance', 'change');
  assert.equal(doc.querySelectorAll('.service-lines tbody tr').length, 6);
  assert.equal(text('grossAmount'), '4,483.64');
  assert.equal(text('discountAmount'), '-510.47');
  assert.equal(text('taxableAmount'), '3,973.17');
  assert.equal(text('vatAmount'), '516.51');
  assert.equal(text('netAmount'), '4,489.68');
  assert.equal(text('displayDate'), '2026-10-13 (2083/06/27)');
  assert.equal(text('inWords'), 'FOUR THOUSAND FOUR HUNDRED EIGHTY NINE RUPEES AND SIXTY EIGHT PAISA ONLY');
  assert.equal(doc.querySelectorAll('.service-lines tbody tr')[3].querySelector('[data-item-field="unitPrice"]').textContent, '59.39054');
});

test('adding, editing and removing items recalculates discounts, VAT and amount in words', async t => {
  const { doc, itemInput, text } = await boot(t);
  doc.getElementById('addServiceItem').click();
  assert.equal(doc.getElementById('servicePdf').disabled, true);
  itemInput(1, 'description', 'Labour');
  itemInput(1, 'qty', 2);
  itemInput(1, 'unitPrice', 250);
  itemInput(1, 'discountPercent', 10);
  assert.equal(text('grossAmount'), '1,500.00');
  assert.equal(text('discountAmount'), '-50.00');
  assert.equal(text('netAmount'), '1,638.50');
  assert.equal(doc.getElementById('servicePdf').disabled, false);
  doc.querySelectorAll('.service-remove')[1].click();
  assert.equal(text('netAmount'), '1,130.00');
  assert.equal(doc.querySelectorAll('.service-lines tbody tr').length, 1);
});

test('invalid item values disable print and recover on correction', async t => {
  const { doc, itemInput, text } = await boot(t);
  itemInput(0, 'discountPercent', 101);
  assert.equal(doc.getElementById('servicePrint').disabled, true);
  assert.match(doc.getElementById('serviceStatus').textContent, /between 0 and 100/);
  itemInput(0, 'discountPercent', 100);
  assert.equal(doc.getElementById('servicePrint').disabled, false);
  assert.equal(text('netAmount'), '0.00');
  assert.equal(text('inWords'), 'ZERO RUPEES ONLY');
});

test('removing every item produces an empty state with a working Add item action', async t => {
  const { doc, itemInput } = await boot(t);
  doc.querySelector('.service-remove').click();
  assert.equal(doc.querySelectorAll('.service-item-card').length, 0);
  assert.equal(doc.getElementById('servicePrint').disabled, true);
  assert.match(doc.getElementById('serviceStatus').textContent, /at least one/);
  doc.getElementById('addServiceItem').click();
  itemInput(0, 'description', 'Service labour');
  assert.equal(doc.getElementById('servicePrint').disabled, false);
});

test('metadata editing syncs controls and preserves the active text node without interpreting HTML', async t => {
  const { window, doc, input, text } = await boot(t);
  input('serviceChassis', 'ABC123');
  assert.equal(text('chassisNo'), 'ABC123');
  const editor = doc.querySelector('[data-service-sync="customerName"]');
  editor.focus();
  editor.textContent = '<img src=x> A & B';
  const node = editor.firstChild;
  editor.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(editor.firstChild, node);
  assert.equal(doc.getElementById('serviceCustomer').value, '<img src=x> A & B');
  assert.equal(editor.querySelector('img'), null);
});

test('direct table edits update the editor and totals without changing untouched precision', async t => {
  const { window, doc, text } = await boot(t);
  const qty = doc.querySelector('.service-lines [data-item-field="qty"]');
  qty.focus();
  qty.textContent = '2';
  qty.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(text('netAmount'), '2,260.00');
  assert.equal(doc.querySelector('.service-item-card [data-item-field="qty"]').value, '2');
  qty.blur();
  const price = doc.querySelector('.service-lines [data-item-field="unitPrice"]');
  price.focus(); price.blur();
  assert.equal(text('netAmount'), '2,260.00');
});

test('service date conversion works both ways, supports Nepali digits and validates input', async t => {
  const { doc, input, itemInput, text } = await boot(t);
  input('serviceDateAD', '2026-10-26');
  assert.equal(doc.getElementById('serviceDateBS').value, '2083/07/09');
  input('serviceDateBS', '२०८३/०१/०१');
  assert.equal(doc.getElementById('serviceDateAD').value, '2026-04-14');
  doc.getElementById('serviceShowBS').click();
  assert.equal(text('displayDate'), '2026-04-14 (2083/01/01)');
  input('serviceDateBS', '2083/12/32');
  itemInput(0, 'unitPrice', 1200);
  assert.equal(doc.getElementById('servicePrint').disabled, true);
  assert.equal(doc.getElementById('serviceDateError').hidden, false);
  input('serviceDateAD', '2026-10-26', 'change');
  assert.equal(doc.getElementById('servicePrint').disabled, false);
  assert.equal(doc.getElementById('serviceDateError').hidden, true);
});

test('more than ten items paginate with repeated metadata and final-page totals', async t => {
  const { doc, itemInput, input } = await boot(t);
  input('serviceBrand', 'suzuki', 'change');
  for (let i = 1; i < 12; i++) {
    doc.getElementById('addServiceItem').click();
    itemInput(i, 'description', `Labour ${i}`);
    itemInput(i, 'unitPrice', 10);
  }
  const pages = doc.querySelectorAll('.service-page');
  assert.equal(pages.length, 2);
  assert.equal(pages[0].querySelectorAll('tbody tr').length, 10);
  assert.equal(pages[1].querySelectorAll('tbody tr').length, 2);
  assert.equal(pages[0].querySelector('.service-totals').hidden, true);
  assert.equal(pages[1].querySelector('.service-totals').hidden, false);
  assert.equal(pages[1].querySelector('.service-page-number').textContent, 'Page 2 of 2');
  assert.equal(pages[1].querySelector('tbody tr td').textContent, '11');
  for (const page of pages) assert.equal(page.querySelector('.service-brand-logo').dataset.brand, 'suzuki');
  input('serviceCustomer', 'New buyer');
  for (const page of pages) assert.equal(page.querySelector('[data-service-sync="customerName"]').textContent, 'New buyer');
});

test('switching and resetting samples restores their complete fields and line items', async t => {
  const { doc, input, text } = await boot(t);
  input('serviceSample', 'maintenance', 'change');
  input('serviceCustomer', 'Edited');
  doc.getElementById('resetService').click();
  assert.equal(text('customerName'), 'Shreeja Manandhar');
  assert.equal(text('netAmount'), '4,489.68');
  input('serviceSample', 'blank', 'change');
  assert.equal(text('customerName'), '');
  assert.equal(doc.getElementById('servicePdf').disabled, true);
  input('serviceSample', 'mobil', 'change');
  assert.equal(text('netAmount'), '1,130.00');
  assert.equal(doc.querySelectorAll('.service-lines tbody tr').length, 1);
});

test('service PDF uses a sanitized filename and a portrait snapshot, restores controls, and handles failures', async t => {
  const { window, doc, input } = await boot(t);
  input('serviceInvoiceNo', 'SERVICE/2026');
  let options, snapshot;
  window.html2pdf = () => ({
    set(value) { options = value; return this; },
    from(value) { snapshot = value; return this; },
    save() { return Promise.resolve(); }
  });
  await window.ServiceBill.downloadPDF();
  assert.equal(options.filename, 'Service_Tax_Invoice_SERVICE_2026.pdf');
  assert.equal(options.jsPDF.orientation, 'portrait');
  assert.notEqual(snapshot, doc.getElementById('servicePrintSheet'));
  assert.equal(snapshot.querySelector('aside'), null);
  assert.ok(snapshot.classList.contains('pdf-export'));
  assert.equal(doc.getElementById('servicePdf').disabled, false);
  window.console.error = () => {};
  window.html2pdf = () => { throw new Error('Canvas failed'); };
  await window.ServiceBill.downloadPDF();
  assert.match(doc.getElementById('serviceStatus').textContent, /Print A4/);
  assert.equal(doc.getElementById('servicePrint').disabled, false);
});

test('all brand options use their original logos without changing company details or totals', async t => {
  const { window, doc, input, text } = await boot(t);
  for (const brand of window.ServiceBrandAssets.brands) {
    input('serviceBrand', brand.id, 'change');
    const logo = doc.querySelector('.service-page .service-brand-logo');
    assert.equal(logo.getAttribute('src'), brand.src);
    assert.equal(logo.alt, `${brand.name} logo`);
    assert.equal(logo.hidden, false);
    assert.equal(text('companyName'), 'MAW Pvt. Ltd.');
    assert.equal(text('companyPan'), '300213081');
    assert.equal(text('netAmount'), '1,130.00');
  }
  assert.equal(doc.getElementById('servicePartner').value, 'none');
  input('servicePartner', 'maw', 'change');
  assert.equal(doc.querySelector('.service-partner-logo').alt, 'MAW Group logo');
  input('serviceBrand', 'none', 'change');
  assert.equal(doc.querySelector('.service-brands').hidden, true);
  assert.equal(doc.querySelector('.service-brand-logo').hasAttribute('src'), false);
});

test('PDF keeps embedded logo bytes and skips decoding absent optional logos', async t => {
  const { window, doc, input } = await boot(t);
  input('serviceBrand', 'honda', 'change');
  const decoded = [];
  window.HTMLImageElement.prototype.decode = function () {
    assert.ok(this.hasAttribute('src'));
    assert.equal(this.hidden, false);
    decoded.push(this.dataset.brand);
    return Promise.resolve();
  };
  let snapshot;
  window.html2pdf = () => ({ set() { return this; }, from(value) { snapshot = value; return this; }, save() { return Promise.resolve(); } });
  await window.ServiceBill.downloadPDF();
  assert.deepEqual(decoded, ['honda']);
  assert.equal(snapshot.querySelector('.service-brand-logo').src, window.ServiceBrandAssets.getBrand('honda').src);
  assert.equal(snapshot.querySelector('.service-partner-logo').hasAttribute('src'), false);
  input('serviceBrand', 'none', 'change');
  await window.ServiceBill.downloadPDF();
  assert.deepEqual(decoded, ['honda']);
  assert.equal(doc.getElementById('servicePdf').disabled, false);
});
