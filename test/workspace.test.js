const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { JSDOM, VirtualConsole } = require('jsdom');
const dates = require('../invoice-dates');
const html = readFileSync(require.resolve('../index.html'), 'utf8');
const sourceDoc = new JSDOM(html);
const scripts = Array.from(sourceDoc.window.document.querySelectorAll('script[src]'), node => readFileSync(require.resolve(`../${node.getAttribute('src')}`), 'utf8'));
sourceDoc.window.close();

async function boot(t, options = {}) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: options.url || 'https://billbook.test/index.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  const { window } = dom;
  t.after(() => window.close());
  await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
  for (const [key, value] of Object.entries(options.storage || {})) window.localStorage.setItem(key, value);
  for (const [key, value] of Object.entries(options.session || {})) window.sessionStorage.setItem(key, value);
  if (!options.auto) window.localStorage.setItem('billbook.auto.v1', JSON.stringify({ version: 1, enabled: false }));
  if (options.denied) Object.defineProperty(window, 'localStorage', { get() { throw new Error('Storage denied'); } });
  for (const script of scripts) window.eval(script);
  window.dispatchEvent(new window.Event('DOMContentLoaded'));
  assert.deepEqual(errors, [], 'The actual application scripts should initialize without runtime errors');
  const doc = window.document;
  if (!options.auto && options.denied) {
    doc.querySelector('[data-entry-choice="full"]').click();
    doc.getElementById('workspaceSettings').click();
  }
  const input = (id, value, event = 'input') => {
    const node = doc.getElementById(id);
    node.value = String(value);
    node.dispatchEvent(new window.Event(event, { bubbles: true }));
  };
  const profileInput = (path, value) => { doc.querySelector(`[data-profile-path="${path}"]`).value = value; };
  const click = id => doc.getElementById(id).click();
  const tab = kind => doc.querySelector(`[data-bill="${kind}"]`).click();
  const snapshot = () => {
    window.InvoiceWorkspace.saveNow();
    const storage = Object.fromEntries(Array.from({ length: window.localStorage.length }, (_, i) => { const key = window.localStorage.key(i); return [key, window.localStorage.getItem(key)]; }));
    const session = Object.fromEntries(Array.from({ length: window.sessionStorage.length }, (_, i) => { const key = window.sessionStorage.key(i); return [key, window.sessionStorage.getItem(key)]; }));
    return { storage, session };
  };
  const configure = () => {
    doc.getElementById('setupApplyCurrent').checked = true;
    profileInput('fuelCustomer.buyerName', 'Acme Communications');
    profileInput('fuelCustomer.buyerPan', '123456789');
    profileInput('serviceCustomer.customerName', 'Personal customer');
    profileInput('serviceCustomer.contact', '9800000000');
    click('setupNext');
    profileInput('fuelCustomer.vehicleNo', 'COMPANY-01');
    profileInput('serviceVehicle.vehicleNo', 'BIKE-02');
    profileInput('serviceVehicle.model', 'MT-15');
    click('setupNext');
    profileInput('preparedBy', 'Prepared Name');
    click('setupNext');
  };
  return { window, doc, input, profileInput, click, tab, snapshot, configure, errors };
}

test('first visit opens a three-step setup with Nepali today and distinct customer profiles', async t => {
  const app = await boot(t);
  const { doc, configure, window } = app;
  assert.equal(doc.getElementById('workspaceSetup').open, true);
  assert.equal(window.FuelBill.summary().bs, dates.todayInNepal().bsInput);
  configure();
  assert.equal(doc.getElementById('workspaceSetup').open, false);
  assert.equal(doc.getElementById('buyerName').value, 'Acme Communications');
  assert.equal(doc.getElementById('serviceCustomer').value, 'Personal customer');
  assert.equal(doc.getElementById('vehicleNo').value, 'COMPANY-01');
  assert.equal(doc.getElementById('serviceVehicle').value, 'BIKE-02');
  assert.equal(JSON.parse(window.localStorage.getItem('billbook.profile.v1')).configured, true);
  assert.equal(doc.querySelectorAll('.workspace-header').length, 1);
  assert.ok(doc.querySelector('.editor-fold #buyerName'));
  assert.ok(doc.querySelector('.editor-section #inputQty'));
});

test('bill tabs preserve drafts, customer edits and full-precision amount calculations without a reload', async t => {
  const { configure, doc, input, tab, window } = await boot(t);
  configure();
  doc.querySelector('input[name="calcMode"][value="amount"]').click();
  input('inputTotalAmount', 1234.56);
  input('retailRate', 217.35);
  input('invNumber', 'F-123');
  input('buyerName', 'One-off company');
  tab('service');
  assert.equal(doc.getElementById('fuelWorkspace').hidden, true);
  assert.equal(doc.getElementById('serviceWorkspace').hidden, false);
  input('serviceInvoiceNo', 'S-99');
  tab('fuel');
  assert.equal(doc.getElementById('invNumber').value, 'F-123');
  assert.equal(doc.getElementById('buyerName').value, 'One-off company');
  assert.equal(window.FuelBill.summary().total, 1234.56);
  assert.equal(doc.getElementById('serviceInvoiceNo').value, 'S-99');
  assert.equal(doc.querySelector('[data-bill="fuel"]').getAttribute('aria-selected'), 'true');
});

test('both drafts and saved profiles recover after reload without asking for setup again', async t => {
  const first = await boot(t);
  first.configure();
  first.input('inputQty', 14.125);
  first.input('invNumber', 'PERSIST-F');
  first.tab('service');
  first.input('serviceInvoiceNo', 'PERSIST-S');
  const next = await boot(t, { ...first.snapshot(), url: 'https://billbook.test/index.html?bill=service' });
  assert.equal(next.doc.getElementById('workspaceSetup').open, false);
  assert.equal(next.doc.getElementById('invNumber').value, 'PERSIST-F');
  assert.equal(next.doc.getElementById('inputQty').value, '14.125');
  assert.equal(next.doc.getElementById('serviceInvoiceNo').value, 'PERSIST-S');
  assert.equal(next.doc.getElementById('fuelWorkspace').hidden, true);
  assert.equal(next.doc.getElementById('serviceCustomer').value, 'Personal customer');
});

test('new bill uses saved defaults instead of one-off customer changes, and Undo restores the previous draft', async t => {
  const { configure, input, click, doc } = await boot(t);
  configure();
  input('buyerName', 'One-off buyer');
  input('invNumber', 'KEEP-123');
  input('inputQty', 15);
  click('workspaceNew');
  assert.equal(doc.getElementById('buyerName').value, 'Acme Communications');
  assert.equal(doc.getElementById('invNumber').value, '');
  assert.equal(doc.getElementById('inputQty').value, '0');
  click('undoNewBill');
  assert.equal(doc.getElementById('buyerName').value, 'One-off buyer');
  assert.equal(doc.getElementById('invNumber').value, 'KEEP-123');
  assert.equal(doc.getElementById('inputQty').value, '15');
});

test('Nepali calendar marks today, chooses a BS date, and updates AD and future bills', async t => {
  const { configure, click, input, doc, tab, window } = await boot(t);
  configure();
  click('workspaceDate');
  assert.ok(doc.querySelector(`#calendarDays [data-bs="${dates.todayInNepal().bsInput}"][aria-current="date"]`));
  input('calendarBS', '२०८३/०१/०१');
  assert.equal(doc.getElementById('calendarYear').value, '2083');
  assert.equal(doc.getElementById('calendarMonth').value, '1');
  assert.match(doc.getElementById('calendarAD').textContent, /2026/);
  click('calendarApply');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-04-14');
  assert.equal(window.FuelBill.summary().bs, '2083/01/01');
  tab('service');
  click('workspaceNew');
  assert.equal(doc.getElementById('serviceDateBS').value, '2083/01/01');
  assert.equal(doc.getElementById('serviceDateAD').value, '2026-04-14');
});

test('calendar validates impossible dates and prevents navigating beyond supported years', async t => {
  const { click, input, doc } = await boot(t);
  click('setupCancel');
  click('workspaceNew');
  assert.equal(doc.getElementById('buyerName').value, '');
  click('workspaceDate');
  input('calendarBS', '2000/01/01');
  assert.equal(doc.getElementById('calendarPrevious').disabled, true);
  input('calendarBS', '2090/12/30');
  assert.equal(doc.getElementById('calendarNext').disabled, true);
  input('calendarBS', '2083/12/32');
  assert.equal(doc.getElementById('calendarApply').disabled, true);
  input('calendarBS', '2083/01/01 12:30');
  assert.equal(doc.getElementById('calendarApply').disabled, true);
  click('calendarClose');
  assert.equal(doc.getElementById('workspaceCalendar').open, false);
});

test('saving edited profile defaults leaves current bills unchanged unless requested', async t => {
  const { configure, click, profileInput, input, doc } = await boot(t);
  configure();
  input('buyerName', 'Current one-off buyer');
  click('workspaceSettings');
  profileInput('fuelCustomer.buyerName', 'New default');
  click('setupNext'); click('setupNext');
  assert.equal(doc.getElementById('setupApplyCurrent').checked, false);
  click('setupNext');
  assert.equal(doc.getElementById('buyerName').value, 'Current one-off buyer');
  click('workspaceNew');
  assert.equal(doc.getElementById('buyerName').value, 'New default');
  click('workspaceSettings');
  profileInput('fuelCustomer.buyerName', 'Discard this');
  click('setupCancel');
  click('workspaceNew');
  assert.equal(doc.getElementById('buyerName').value, 'New default');
});

test('invalid numeric drafts recover as invalid and a new bill can repair an invalid pump rate', async t => {
  const first = await boot(t);
  first.configure();
  first.input('inputQty', -5);
  const next = await boot(t, first.snapshot());
  assert.equal(next.doc.getElementById('inputQty').value, '-5');
  assert.equal(next.doc.getElementById('btnPrint').disabled, true);
  next.input('retailRate', 0);
  next.click('workspaceNew');
  assert.equal(next.doc.getElementById('retailRate').value, '200');
  assert.equal(next.doc.getElementById('btnPrint').disabled, false);
});

test('denied or corrupt storage cannot prevent setup, calculation, and bill switching', async t => {
  const denied = await boot(t, { denied: true });
  denied.configure();
  denied.input('inputQty', 5);
  denied.window.InvoiceWorkspace.saveNow();
  assert.equal(denied.window.FuelBill.summary().total, 1000);
  assert.match(denied.doc.getElementById('draftSaveStatus').textContent, /unavailable/);
  denied.tab('service');
  assert.equal(denied.doc.getElementById('serviceWorkspace').hidden, false);
  const corrupt = await boot(t, { storage: { 'billbook.profile.v1': '{broken', 'billbook.draft.fuel.v1': '{broken', 'billbook.draft.service.v1': '{"version":99,"data":{}}' } });
  assert.equal(corrupt.doc.getElementById('workspaceSetup').open, true);
  assert.equal(corrupt.window.FuelBill.summary().total, 0);
});

test('forget removes customer data without touching unrelated browser storage', async t => {
  const { configure, click, doc, window } = await boot(t, { storage: { unrelated: 'keep' } });
  configure();
  click('workspaceSettings'); click('setupNext'); click('setupNext');
  window.confirm = () => false;
  click('forgetWorkspace');
  assert.ok(window.localStorage.getItem('billbook.profile.v1'));
  window.confirm = () => true;
  click('forgetWorkspace');
  assert.equal(window.localStorage.getItem('billbook.profile.v1'), null);
  assert.equal(window.localStorage.getItem('unrelated'), 'keep');
  assert.equal(doc.getElementById('buyerName').value, '');
  assert.equal(doc.getElementById('serviceVehicle').value, '');
  assert.equal(doc.getElementById('workspaceSetup').open, true);
});

test('fuel template switching preserves the current bill date and buyer in the workspace', async t => {
  const { configure, input, click, doc } = await boot(t);
  configure();
  click('workspaceDate'); input('calendarBS', '2083/01/01'); click('calendarApply');
  input('buyerName', 'Current customer');
  input('invNumber', 'CURRENT-42');
  input('templateSelect', 'banglamukhi', 'change');
  assert.equal(doc.getElementById('buyerName').value, 'Current customer');
  assert.equal(doc.getElementById('invNumber').value, 'CURRENT-42');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-04-14');
});

test('preview scaling stays outside export snapshots and print orientation follows the active bill', async t => {
  const { configure, tab, doc, window } = await boot(t);
  configure();
  tab('service');
  assert.match(doc.getElementById('dynamicPrintPageStyle').textContent, /A4 portrait/);
  tab('fuel');
  assert.match(doc.getElementById('dynamicPrintPageStyle').textContent, /A4 landscape/);
  let snapshot;
  window.html2pdf = () => ({ set() { return this; }, from(value) { snapshot = value; return this; }, save() { return Promise.resolve(); } });
  await window.downloadAsPDF();
  assert.equal(snapshot.style.transform, '');
  assert.equal(snapshot.closest('.preview-scale-layer'), null);
  assert.equal(snapshot.querySelector('.workspace-header'), null);
});

test('setup saves both fuel stations and the service centre and preserves the chosen date when copying current details', async t => {
  const { click, input, profileInput, doc, tab } = await boot(t);
  click('setupNext'); click('setupNext');
  click('setupChooseDate');
  input('calendarBS', '2083/04/23');
  click('calendarApply');
  click('setupCopyCurrent');
  assert.match(doc.getElementById('setupDateLabel').textContent, /२०८३/);
  profileInput('fuelProviders.himal.stationName', 'Saved first station');
  profileInput('fuelProviders.banglamukhi.stationName', 'Saved second station');
  profileInput('serviceProvider.companyName', 'Saved service centre');
  click('setupNext');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-08-08');
  assert.equal(doc.getElementById('stationName').value, 'Saved first station');
  input('templateSelect', 'banglamukhi', 'change');
  assert.equal(doc.getElementById('stationName').value, 'Saved second station');
  tab('service');
  assert.equal(doc.getElementById('serviceCompany').value, 'Saved service centre');
  assert.equal(doc.getElementById('serviceDateAD').value, '2026-08-08');
});

test('a structurally valid draft with damaged date values cannot crash the workspace', async t => {
  const first = await boot(t);
  first.configure();
  const saved = first.snapshot();
  const broken = JSON.parse(saved.storage['billbook.draft.service.v1']);
  broken.data.fields.dateAD = 'invalid';
  broken.data.fields.dateBS = 'invalid';
  broken.data.dateRequest = { source: 'bs', value: 'invalid' };
  saved.storage['billbook.draft.service.v1'] = JSON.stringify(broken);
  const next = await boot(t, { ...saved, url: 'https://billbook.test/index.html?bill=service' });
  assert.equal(next.doc.getElementById('serviceDateError').hidden, false);
  next.click('workspaceDate');
  assert.equal(next.doc.getElementById('calendarBS').value, dates.todayInNepal().bsInput);
  next.click('calendarApply');
  assert.equal(next.doc.getElementById('serviceDateError').hidden, true);
});

test('service logos persist in drafts and explicit defaults across reloads and new bills', async t => {
  const first = await boot(t);
  first.configure();
  first.tab('service');
  first.input('serviceBrand', 'honda', 'change');
  first.click('saveServiceBrand');
  assert.match(first.doc.getElementById('serviceBrandStatus').textContent, /saved/);
  const next = await boot(t, { ...first.snapshot(), url: 'https://billbook.test/index.html?bill=service' });
  assert.equal(next.doc.getElementById('serviceBrand').value, 'honda');
  assert.equal(next.doc.getElementById('servicePartner').value, 'none');
  next.input('serviceBrand', 'tvs', 'change');
  next.click('workspaceNew');
  assert.equal(next.doc.getElementById('serviceBrand').value, 'honda');
  assert.equal(next.doc.querySelector('.service-brand-logo').alt, 'Honda logo');
});

test('first-time setup accepts a brand default and old profiles migrate to Yamaha', async t => {
  const app = await boot(t);
  app.click('setupNext'); app.click('setupNext');
  app.input('setupServiceBrand', 'royal-enfield', 'change');
  assert.equal(app.doc.getElementById('setupServicePartner').value, 'none');
  app.click('setupNext');
  assert.equal(app.doc.getElementById('serviceBrand').value, 'royal-enfield');
  const saved = app.snapshot();
  const profile = JSON.parse(saved.storage['billbook.profile.v1']);
  delete profile.serviceBrand;
  delete profile.servicePartner;
  saved.storage['billbook.profile.v1'] = JSON.stringify(profile);
  delete saved.storage['billbook.draft.service.v1'];
  const migrated = await boot(t, saved);
  assert.equal(migrated.doc.getElementById('workspaceSetup').open, false);
  assert.equal(migrated.doc.getElementById('serviceBrand').value, 'yamaha');
  assert.equal(migrated.doc.getElementById('servicePartner').value, 'maw');
});

test('saved brand preferences work when setup is skipped without saving unconfirmed customer data', async t => {
  const app = await boot(t);
  app.click('setupCancel'); app.tab('service');
  app.input('serviceBrand', 'ktm', 'change');
  app.click('saveServiceBrand');
  const record = JSON.parse(app.window.localStorage.getItem('billbook.profile.v1'));
  assert.equal(record.serviceBrand, 'ktm');
  assert.equal(record.configured, false);
  assert.equal(record.fuelCustomer, undefined);
  app.click('workspaceNew');
  assert.equal(app.doc.getElementById('serviceBrand').value, 'ktm');
  assert.equal(app.doc.getElementById('serviceCustomer').value, '');
});

test('Auto mode is the default and prepares a visibly marked sample from just the requested inputs', async t => {
  const { window, doc, input } = await boot(t, { auto: true });
  assert.equal(doc.getElementById('workspaceSetup').open, false);
  assert.equal(doc.body.dataset.entryMode, 'auto');
  input('auto-fuel-name', 'Correct Company');
  input('auto-fuel-bs', '2083/07/09');
  input('auto-fuel-rate', 177.25);
  await window.BillAuto.generate('fuel', 'preview');
  assert.equal(doc.getElementById('buyerName').value, 'Correct Company');
  assert.equal(doc.getElementById('retailRate').value, '177.25');
  assert.equal(doc.getElementById('invoiceDate').value, '2026-10-26');
  assert.match(doc.getElementById('invNumber').value, /^SAMPLE-/);
  assert.equal(doc.getElementById('printSheet').dataset.documentKind, 'sample');
  for (const page of doc.querySelectorAll('.bill-page')) {
    assert.equal(page.querySelector('.sample-notice').textContent, 'SAMPLE · NOT ISSUED');
    assert.equal(page.querySelector('.h-tax-badge').textContent, 'SAMPLE INVOICE');
  }
});

test('sample markings survive manual editing, bill switching, draft recovery, and exported snapshots', async t => {
  const first = await boot(t, { auto: true });
  first.input('auto-fuel-name', 'Sample customer'); first.input('auto-fuel-rate', 200);
  await first.window.BillAuto.generate('fuel', 'preview');
  first.input('inputQty', 12);
  first.tab('service'); first.tab('fuel');
  const next = await boot(t, { ...first.snapshot(), auto: true });
  assert.equal(next.doc.getElementById('printSheet').dataset.documentKind, 'sample');
  let snapshot;
  next.window.html2pdf = () => ({ set() { return this; }, from(value) { snapshot = value; return this; }, save() { return Promise.resolve(); } });
  await next.window.downloadAsPDF();
  assert.equal(snapshot.dataset.documentKind, 'sample');
  assert.equal(snapshot.querySelectorAll('.sample-notice').length, 2);
});

test('service Auto mode uses entered products and prices and marks every generated page', async t => {
  const { window, doc, input, tab } = await boot(t, { auto: true });
  tab('service');
  input('auto-service-name', 'Correct Person'); input('auto-service-bs', '2083/04/23');
  const row = doc.querySelector('.auto-product');
  row.querySelector('[data-product-field="description"]').value = 'Oil change';
  row.querySelector('[data-product-field="unitPrice"]').value = '1200';
  await window.BillAuto.generate('service', 'preview');
  const draft = window.ServiceBill.getDraft();
  assert.equal(draft.items[0].description, 'Oil change');
  assert.equal(draft.items[0].unitPrice, 1200);
  assert.equal(draft.fields.dateAD, '2026-08-08');
  assert.equal(draft.fields.documentKind, 'sample');
  for (const page of doc.querySelectorAll('.service-page')) assert.equal(page.querySelector('.sample-notice').textContent, 'SAMPLE · NOT ISSUED');
});

test('actual Auto mode refuses missing facts and never silently converts a sample reference into a real bill', async t => {
  const { window, doc, input } = await boot(t, { auto: true });
  input('auto-fuel-name', 'Company'); input('auto-fuel-rate', 200);
  input('auto-fuel-output', 'transaction', 'change');
  assert.equal(doc.getElementById('auto-fuel-basis').value, 'qty');
  input('auto-fuel-value', 10);
  input('auto-fuel-reference', 'SAMPLE-123');
  await window.BillAuto.generate('fuel', 'preview');
  assert.equal(doc.getElementById('auto-fuel-error').hidden, false);
  assert.equal(doc.getElementById('invNumber').value, '');
  input('auto-fuel-reference', 'ORIGINAL-73');
  await window.BillAuto.generate('fuel', 'preview');
  assert.equal(doc.getElementById('invNumber').value, 'ORIGINAL-73');
  assert.equal(doc.getElementById('printSheet').dataset.documentKind, 'transaction');
  assert.equal(doc.querySelectorAll('.sample-notice').length, 0);
  assert.equal(window.FuelBill.summary().total, 2000);
});

test('one-action Auto PDF generation prepares the bill and restores controls after an export failure', async t => {
  const { window, doc, input } = await boot(t, { auto: true });
  input('auto-fuel-name', 'Company'); input('auto-fuel-rate', 200);
  let snapshot;
  window.html2pdf = () => ({ set() { return this; }, from(value) { snapshot = value; return this; }, save() { return Promise.resolve(); } });
  await window.BillAuto.generate('fuel', 'pdf');
  assert.equal(snapshot.dataset.documentKind, 'sample');
  assert.equal(doc.getElementById('auto-fuel-result').textContent, 'PDF downloaded.');
  window.console.error = () => {};
  window.html2pdf = () => { throw new Error('PDF failed'); };
  await window.BillAuto.generate('fuel', 'pdf');
  assert.match(doc.getElementById('auto-fuel-result').textContent, /Use Print/);
  assert.equal(doc.querySelector('#auto-fuel-form [data-auto-action="pdf"]').disabled, false);
});
