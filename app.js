/**
 * Nepal Petrol Bill - Multi-Template Tax Invoice Generator (Himal & Banglamukhi)
 */

// Fuel Presets Database
const FUEL_PRESETS = {
  Petrol: { hscode: '2710.12.10', name: 'Petrol', nameCaps: 'PETROL', defaultRate: 200.00 },
  Diesel: { hscode: '2710.19.10', name: 'Diesel', nameCaps: 'DIESEL', defaultRate: 165.00 },
  'Auto LPG': { hscode: '2711.12.00', name: 'Auto LPG', nameCaps: 'AUTO LPG', defaultRate: 140.00 },
  Custom: { hscode: '', name: 'Fuel', nameCaps: 'FUEL', defaultRate: 200.00 }
};

// Preset Templates
const TEMPLATES = {
  himal: {
    name: 'Himal Enterprises',
    stationName: 'HIMAL ENTERPRISES',
    stationAddress: 'CHA.NA. PA-06, CHECKPOST, KATHMANDU',
    stationPhone: '',
    stationEmail: 'himalenterprises2021@gmail.com',
    stationPan: '500011548',
    invNumber: '848',
    buyerName: 'CASH( C. G. Communications Ltd.)',
    buyerPan: '301512183',
    buyerAddress: '',
    buyerMobile: '',
    vehicleNo: '',
    invoiceDate: '08/08/2026',
    invoiceMiti: '2083/4/23',
    invoiceTime: '2026-08-08 13:47:44',
    preparedByName: 'Administrator Admin',
    paperTheme: 'pink'
  },
  banglamukhi: {
    name: 'Banglamukhi Oil Store',
    stationName: 'BANGLAMUKHI OIL STORE PRIVATE LIMITED',
    stationAddress: 'Sanobhadyang, Kathmandu',
    stationPhone: '9745694481',
    stationEmail: 'Bangalamukhioilstore@gmail.com',
    stationPan: '610152898',
    invNumber: 'TI681-MMX-83/84',
    buyerName: 'CG Communications',
    buyerPan: '301512183',
    buyerAddress: 'Thapathali, Kathmandu',
    buyerMobile: '9707051000',
    vehicleNo: '',
    paymentMode: 'cash',
    dueDate: '0 Days',
    invoiceDate: '31/08/2026',
    invoiceMiti: '15/05/2083 09:41',
    invoiceTime: '2026-08-31 09:41:00',
    preparedByName: '',
    paperTheme: 'white'
  }
};

'use strict';
const { calculateInvoice, formatCurrency, numberToWords } = InvoiceMath;
const state = {
  ...TEMPLATES.himal,
  template: 'himal', fuelType: 'Petrol', hscode: '2710.12.10', particulars: 'Petrol',
  retailRate: 200, qty: 10, targetAmount: 2000, discount: 0, unit: 'LTRS',
  calcMode: 'qty', layout: 'landscape-2up', copyTagMode: 'none',
  paymentMode: 'cash', dueDate: '0 Days', remarks: ''
};
const textFields = {
  stationName: 'stationName', stationAddress: 'stationAddress', stationPhone: 'stationPhone',
  stationEmail: 'stationEmail', stationPan: 'stationPan', invNo: 'invNumber', buyer: 'buyerName',
  pan: 'buyerPan', address: 'buyerAddress', vehicle: 'vehicleNo', paymentMode: 'paymentMode',
  dueDate: 'dueDate', date: 'invoiceDate', miti: 'invoiceMiti', buyerMobile: 'buyerMobile',
  generatedTime: 'invoiceTime', preparedByName: 'preparedByName', remarks: 'remarks',
  hscode: 'hscode', particulars: 'particulars', unit: 'unit'
};
const byId = id => document.getElementById(id);
const syncNodes = new Map();
let lastPan;
let validInvoice = true;
let validDates = true;
let lastDateRequest;
let exporting = false;
const editedNumbers = new WeakSet();

function showStatus(message = '') {
  byId('appStatus').textContent = message;
  byId('appStatus').hidden = !message;
}

function updateActions() {
  byId('btnPrint').disabled = !validInvoice || !validDates || exporting;
  byId('btnDownloadPdf').disabled = !validInvoice || !validDates || exporting;
}

function recalculate() {
  try {
    Object.assign(state, calculateInvoice({
      retailRate: state.retailRate, qty: state.qty, targetAmount: state.targetAmount,
      discount: state.discount, mode: state.calcMode
    }));
    validInvoice = true;
    showStatus();
    if (state.calcMode === 'amount') byId('inputQty').value = state.qty.toFixed(3);
    else {
      state.targetAmount = state.netAmount;
      byId('inputTotalAmount').value = state.netAmount.toFixed(2);
    }
    updateAllUI();
  } catch (error) {
    validInvoice = false;
    showStatus(error.message);
  }
  updateActions();
  window.InvoiceDocument?.apply('fuel', state.documentKind);
}

function renderPanBoxes() {
  if (lastPan === state.stationPan) return;
  lastPan = state.stationPan;
  const digits = String(state.stationPan || '').replace(/\D/g, '').padEnd(9, ' ').slice(0, 9);
  for (const id of ['stationPanBoxes1', 'stationPanBoxes2']) {
    const boxes = Array.from(digits, digit => {
      const box = document.createElement('div');
      box.className = 'b-pan-box';
      box.textContent = digit.trim() || '\u00a0';
      return box;
    });
    byId(id).replaceChildren(...boxes);
  }
}

function updateAllUI() {
  if (!validInvoice) return;
  byId('calculatedBaseRate').textContent = state.baseRate.toFixed(4);
  const banglamukhi = state.template === 'banglamukhi';
  const qty = state.qty.toFixed(banglamukhi ? 3 : 2);
  const values = Object.fromEntries(Object.entries(textFields).map(([key, field]) => [key, state[field]]));
  Object.assign(values, {
    particulars: banglamukhi ? state.particulars.toUpperCase() : state.particulars,
    qty, totalQty: qty, rate: state.baseRate.toFixed(banglamukhi ? 2 : 4),
    disc: state.discount ? state.discount.toFixed(2) : (banglamukhi ? '0.00' : '0'),
    itemAmount: formatCurrency(state.basicAmount), tableTotalAmount: formatCurrency(state.basicAmount),
    inWords: numberToWords(state.netAmount), inWordsCaps: numberToWords(state.netAmount, true),
    discountAmount: state.discount ? formatCurrency(state.discount) : (banglamukhi ? '0.00' : '')
  });
  for (const key of ['basicAmount', 'taxableAmount', 'vatAmount', 'netAmount']) values[key] = formatCurrency(state[key]);
  for (const [key, nodes] of syncNodes) {
    if (!validDates && (key === 'date' || key === 'miti')) continue;
    const value = String(values[key] ?? '');
    for (const node of nodes) {
      // Replacing the active editor's text resets its caret on every keystroke.
      if (node !== document.activeElement && node.textContent !== value) node.textContent = value;
    }
  }
  renderPanBoxes();
  window.InvoiceDocument?.apply('fuel', state.documentKind);
}

function syncInvoiceDates(source, value) {
  lastDateRequest = { source, value };
  const sourceId = source === 'bs' ? 'invoiceMiti' : 'invoiceDate';
  const errorNode = byId('dateConversionError');
  let errorMessage = '';
  try {
    if (!value.trim()) {
      state.invoiceDate = state.invoiceMiti = '';
      byId('invoiceDate').value = byId('invoiceMiti').value = '';
    } else {
      const converted = source === 'bs' ? InvoiceDates.fromBS(value)
        : source === 'ad' ? InvoiceDates.fromAD(value) : InvoiceDates.fromDisplayAD(value);
      const time = source === 'bs' ? converted.time : (/\s(\d{2}:\d{2}(?::\d{2})?)$/.exec(state.invoiceMiti)?.[1] || '');
      state.invoiceDate = converted.adDisplay;
      state.invoiceMiti = InvoiceDates.formatBS(converted.bsInput, state.template, time);
      byId('invoiceDate').value = converted.adInput;
      const bsValue = `${converted.bsInput}${time ? ` ${time}` : ''}`;
      // Leave the active BS input intact while typing, then normalize on blur.
      if (document.activeElement !== byId('invoiceMiti')) byId('invoiceMiti').value = bsValue;
    }
  } catch (error) {
    errorMessage = error.message;
  }
  validDates = !errorMessage;
  errorNode.textContent = errorMessage;
  errorNode.hidden = validDates;
  for (const id of ['invoiceDate', 'invoiceMiti']) {
    const error = id === sourceId ? errorMessage : '';
    byId(id).setCustomValidity(error);
    byId(id).setAttribute('aria-invalid', String(Boolean(error)));
  }
  updateActions();
  return validDates;
}

function updateCopyTags() {
  const tags = { none: ['', ''], copies: ['[ CUSTOMER COPY ]', '[ OFFICE COPY ]'], custom: ['[ ORIGINAL ]', '[ DUPLICATE ]'] };
  const [first, second] = tags[state.copyTagMode] || tags.none;
  byId('copyTag1').textContent = first;
  byId('copyTag2').textContent = second;
}

function setTheme(theme) {
  state.paperTheme = theme;
  document.querySelectorAll('.bill-page').forEach(page => {
    page.classList.toggle('pink-paper', theme === 'pink');
    page.classList.toggle('white-paper', theme === 'white');
  });
  for (const [id, active] of [['btnPinkTheme', theme === 'pink'], ['btnWhiteTheme', theme === 'white']]) {
    byId(id).classList.toggle('active', active);
    byId(id).setAttribute('aria-pressed', String(active));
  }
}

function switchTemplate(key, { reference = false } = {}) {
  if (!Object.hasOwn(TEMPLATES, key)) return;
  const preserve = window.InvoiceWorkspace?.isReady() && !reference
    ? Object.fromEntries(['invNumber', 'buyerName', 'buyerPan', 'buyerAddress', 'buyerMobile', 'vehicleNo', 'invoiceDate', 'invoiceMiti', 'invoiceTime', 'paymentMode', 'dueDate', 'remarks', 'preparedByName'].map(field => [field, state[field]])) : null;
  state.template = key;
  Object.assign(state, TEMPLATES[key]);
  // Reset all template metadata, including fields absent in the first template.
  state.paymentMode = TEMPLATES[key].paymentMode || 'cash';
  state.dueDate = TEMPLATES[key].dueDate || '0 Days';
  state.remarks = '';
  if (preserve) {
    Object.assign(state, preserve, window.InvoiceWorkspace.provider(key));
  }
  byId('templateSelect').value = key;
  byId('printSheet').classList.toggle('format-himal', key === 'himal');
  byId('printSheet').classList.toggle('format-banglamukhi', key === 'banglamukhi');
  document.querySelectorAll('.format2-only').forEach(node => { node.hidden = key !== 'banglamukhi'; });
  for (const field of new Set(Object.values(textFields))) {
    const input = byId(field);
    if (input && field !== 'invoiceDate') input.value = state[field] || '';
  }
  syncInvoiceDates('display', state.invoiceDate);
  setTheme(state.paperTheme);
  recalculate();
}

function updateLayout() {
  const landscape = state.layout === 'landscape-2up';
  const workspace = window.InvoiceWorkspace?.isReady();
  byId('printSheet').classList.toggle('landscape-mode', landscape);
  byId('printSheet').classList.toggle('portrait-mode', !landscape);
  byId('btnPrint').textContent = workspace ? 'Print' : `🖨️ Print (${landscape ? 'Landscape' : 'Portrait'})`;
  if (!exporting) byId('btnDownloadPdf').textContent = workspace ? 'Download PDF' : `📥 Download PDF (A4 ${landscape ? 'Landscape' : 'Portrait'})`;
  byId('dynamicPrintPageStyle').textContent = `@media print { @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: ${landscape ? '4mm 6mm' : '8mm'}; } }`;
}

async function downloadAsPDF() {
  if (exporting || !validInvoice || !validDates) return;
  exporting = true;
  const button = byId('btnDownloadPdf');
  const originalText = button.textContent;
  button.textContent = '⏳ Generating PDF...';
  updateActions();
  // Snapshot the invoice immediately so edits during library loading cannot mix copies.
  const element = byId('printSheet').cloneNode(true);
  element.classList.add('pdf-export');
  const landscape = state.layout === 'landscape-2up';
  const invoice = String(state.invNumber || 'bill').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
  try {
    await InvoiceExport.savePDF(element, { filename: `Petrol_Tax_Invoice_${invoice}.pdf`, landscape });
    if (validInvoice && validDates) showStatus('PDF downloaded.');
  } catch (error) {
    console.error('PDF export failed:', error);
    if (validInvoice && validDates) showStatus('PDF export is unavailable. Use Print and choose Save as PDF.');
  } finally {
    exporting = false;
    button.textContent = originalText;
    // Layout may have changed while the export was being generated.
    updateLayout();
    updateActions();
  }
}

function readNumber(input) {
  return input.validity.badInput ? NaN : Number(input.value);
}

function setCalculationMode(mode) {
  state.calcMode = mode;
  document.querySelectorAll('input[name="calcMode"]').forEach(radio => { radio.checked = radio.value === mode; });
  byId('qtyFieldGroup').classList.toggle('hidden', mode !== 'qty');
  byId('amountFieldGroup').classList.toggle('hidden', mode !== 'amount');
}

function setupBindings() {
  document.querySelectorAll('[data-sync]').forEach(node => {
    const key = node.dataset.sync;
    if (!syncNodes.has(key)) syncNodes.set(key, []);
    syncNodes.get(key).push(node);
    if (node.hasAttribute('contenteditable')) {
      node.setAttribute('contenteditable', 'plaintext-only');
      node.setAttribute('aria-label', `Edit ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    }
  });
  byId('templateSelect').addEventListener('change', event => switchTemplate(event.target.value));
  for (const field of new Set(Object.values(textFields))) {
    const input = byId(field);
    if (!input || field === 'invoiceDate' || field === 'invoiceMiti') continue;
    input.addEventListener('input', () => { state[field] = input.value; updateAllUI(); });
  }
  document.addEventListener('input', event => {
    const editor = event.target.closest('[contenteditable][data-sync]');
    if (!editor) return;
    const field = textFields[editor.dataset.sync];
    if (['qty', 'rate', 'disc'].includes(editor.dataset.sync)) editedNumbers.add(editor);
    if (!field) return;
    if (field === 'invoiceDate' || field === 'invoiceMiti') {
      if (syncInvoiceDates(field === 'invoiceDate' ? 'display' : 'bs', editor.textContent)) updateAllUI();
      return;
    }
    state[field] = editor.textContent;
    if (byId(field)) byId(field).value = state[field];
    updateAllUI();
  });
  document.addEventListener('focusout', event => {
    const editor = event.target.closest('[contenteditable][data-sync]');
    if (!editor) return;
    const key = editor.dataset.sync;
    if (['qty', 'rate', 'disc'].includes(key) && editedNumbers.has(editor)) {
      editedNumbers.delete(editor);
      const text = editor.textContent.trim().replace(/,/g, '');
      const value = text === '' ? 0 : Number(text);
      if (key === 'qty') { state.qty = value; byId('inputQty').value = Number.isFinite(value) ? value : ''; setCalculationMode('qty'); }
      if (key === 'rate') { state.retailRate = value * 1.13; byId('retailRate').value = Number.isFinite(value) ? state.retailRate.toFixed(2) : ''; }
      if (key === 'disc') { state.discount = value; byId('inputDiscount').value = Number.isFinite(value) ? value : ''; }
      recalculate();
    }
    // Normalize the completed editor as well as its copies, without moving a live caret.
    const active = document.activeElement;
    if (active !== editor && validInvoice) updateAllUI();
  });
  const updateDate = event => {
    if (event.target.validity.badInput) {
      syncInvoiceDates('ad', 'incomplete');
    } else if (syncInvoiceDates(event.target.id === 'invoiceMiti' ? 'bs' : 'ad', event.target.value)) {
      updateAllUI();
    }
  };
  for (const id of ['invoiceDate', 'invoiceMiti']) {
    byId(id).addEventListener('input', updateDate);
    byId(id).addEventListener('change', updateDate);
  }
  byId('invoiceMiti').addEventListener('blur', () => {
    if (validDates && byId('invoiceMiti').value.trim()) {
      const converted = InvoiceDates.fromBS(state.invoiceMiti);
      byId('invoiceMiti').value = `${converted.bsInput}${converted.time ? ` ${converted.time}` : ''}`;
    }
  });
  byId('fuelType').addEventListener('change', event => {
    const preset = FUEL_PRESETS[event.target.value];
    if (!preset) return;
    state.fuelType = event.target.value;
    state.hscode = preset.hscode;
    state.particulars = preset.name;
    if (state.fuelType !== 'Custom') {
      state.retailRate = preset.defaultRate;
      byId('retailRate').value = state.retailRate.toFixed(2);
    }
    recalculate();
  });
  for (const [id, field] of [['retailRate', 'retailRate'], ['inputQty', 'qty'], ['inputTotalAmount', 'targetAmount'], ['inputDiscount', 'discount']]) {
    byId(id).addEventListener('input', event => { state[field] = readNumber(event.target); recalculate(); });
  }
  document.querySelectorAll('input[name="calcMode"]').forEach(radio => {
    radio.addEventListener('change', () => { setCalculationMode(radio.value); recalculate(); });
  });
  document.querySelectorAll('input[name="printLayout"]').forEach(radio => {
    radio.addEventListener('change', () => { state.layout = radio.value; updateLayout(); });
  });
  byId('copyLabelMode').addEventListener('change', event => { state.copyTagMode = event.target.value; updateCopyTags(); });
  byId('btnPinkTheme').addEventListener('click', () => setTheme('pink'));
  byId('btnWhiteTheme').addEventListener('click', () => setTheme('white'));
  byId('btnDownloadPdf').addEventListener('click', downloadAsPDF);
  byId('btnPrint').addEventListener('click', () => { if (validInvoice && validDates && !exporting) window.print(); });
  byId('btnReset').addEventListener('click', () => switchTemplate(state.template, { reference: true }));
  window.addEventListener('beforeprint', () => {
    if (document.activeElement?.hasAttribute('contenteditable')) document.activeElement.blur();
  });
}

const fuelSavedStrings = ['hscode', 'particulars', 'unit', 'invNumber', 'buyerName', 'buyerPan', 'buyerAddress', 'buyerMobile', 'vehicleNo', 'paymentMode', 'dueDate', 'invoiceDate', 'invoiceMiti', 'invoiceTime', 'preparedByName', 'stationName', 'stationAddress', 'stationPhone', 'stationEmail', 'stationPan', 'remarks', 'documentKind'];
const fuelSavedNumbers = ['retailRate', 'qty', 'targetAmount', 'discount'];

function syncFuelControls() {
  for (const field of new Set(Object.values(textFields))) {
    const input = byId(field);
    if (input && field !== 'invoiceDate') input.value = state[field] || '';
  }
  byId('templateSelect').value = state.template;
  byId('fuelType').value = state.fuelType;
  byId('printSheet').classList.toggle('format-himal', state.template === 'himal');
  byId('printSheet').classList.toggle('format-banglamukhi', state.template === 'banglamukhi');
  document.querySelectorAll('.format2-only').forEach(node => { node.hidden = state.template !== 'banglamukhi'; });
  for (const [id, field] of [['retailRate', 'retailRate'], ['inputQty', 'qty'], ['inputTotalAmount', 'targetAmount'], ['inputDiscount', 'discount']]) {
    byId(id).value = Number.isFinite(state[field]) ? state[field] : '';
  }
  setCalculationMode(state.calcMode);
  document.querySelectorAll('input[name="printLayout"]').forEach(radio => { radio.checked = radio.value === state.layout; });
  byId('copyLabelMode').value = state.copyTagMode;
  setTheme(state.paperTheme);
  updateCopyTags();
  updateLayout();
}

function fuelProfile(profile) {
  Object.assign(state, profile.fuelCustomer, profile.fuelProviders[profile.template]);
  state.template = profile.template;
  state.layout = profile.layout;
  state.paperTheme = profile.paperTheme;
  state.preparedByName = profile.preparedBy;
}

window.FuelBill = {
  getProfile() {
    const providers = Object.fromEntries(Object.entries(TEMPLATES).map(([key, template]) => [key, Object.fromEntries(['stationName', 'stationAddress', 'stationPhone', 'stationEmail', 'stationPan'].map(field => [field, template[field]]))]));
    providers[state.template] = Object.fromEntries(['stationName', 'stationAddress', 'stationPhone', 'stationEmail', 'stationPan'].map(field => [field, state[field]]));
    return { fuelCustomer: Object.fromEntries(['buyerName', 'buyerPan', 'buyerAddress', 'buyerMobile', 'vehicleNo'].map(field => [field, state[field]])), fuelProviders: providers, template: state.template, layout: state.layout, paperTheme: state.paperTheme, preparedBy: state.preparedByName };
  },
  getDraft() {
    return { fields: Object.fromEntries([...fuelSavedStrings, ...fuelSavedNumbers, 'template', 'layout', 'fuelType', 'calcMode', 'copyTagMode', 'paperTheme'].map(field => [field, state[field]])), dateRequest: lastDateRequest };
  },
  restoreDraft(draft) {
    const source = draft?.fields;
    if (!source || !['himal', 'banglamukhi'].includes(source.template)) return false;
    for (const field of fuelSavedStrings) if (typeof source[field] === 'string') state[field] = source[field].slice(0, 10000);
    state.documentKind = source.documentKind === 'sample' ? 'sample' : 'transaction';
    for (const field of fuelSavedNumbers) state[field] = typeof source[field] === 'number' ? source[field] : source[field] === null ? NaN : (field === 'retailRate' ? 200 : 0);
    for (const [field, choices] of Object.entries({ template: ['himal', 'banglamukhi'], layout: ['landscape-2up', 'single-portrait'], fuelType: Object.keys(FUEL_PRESETS), calcMode: ['qty', 'amount'], copyTagMode: ['none', 'copies', 'custom'], paperTheme: ['pink', 'white'] })) {
      state[field] = choices.includes(source[field]) ? source[field] : choices[0];
    }
    syncFuelControls();
    const request = draft.dateRequest;
    if (request && ['ad', 'bs', 'display'].includes(request.source) && typeof request.value === 'string') {
      if (request.source === 'bs') byId('invoiceMiti').value = request.value;
      syncInvoiceDates(request.source, request.value.slice(0, 128));
    } else syncInvoiceDates('display', state.invoiceDate);
    recalculate();
    return true;
  },
  newBill(profile, bs) {
    state.documentKind = 'transaction';
    fuelProfile(profile);
    if (!Number.isFinite(state.retailRate) || state.retailRate <= 0 || state.retailRate > 1000000) state.retailRate = FUEL_PRESETS[state.fuelType]?.defaultRate || 200;
    state.invNumber = '';
    state.qty = state.targetAmount = state.discount = 0;
    state.calcMode = 'qty';
    state.remarks = '';
    state.invoiceMiti = '';
    state.invoiceTime = `${InvoiceDates.todayInNepal().adInput} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date())}`;
    syncFuelControls();
    syncInvoiceDates('bs', bs);
    recalculate();
  },
  applyProfile(profile, bs) {
    fuelProfile(profile);
    syncFuelControls();
    syncInvoiceDates('bs', bs);
    recalculate();
  },
  setDate(bs) { syncInvoiceDates('bs', bs); updateAllUI(); },
  syncPrint: updateLayout,
  summary() {
    let bs = '';
    try { bs = InvoiceDates.fromDisplayAD(state.invoiceDate).bsInput; } catch { /* Incomplete date. */ }
    return { customer: state.buyerName, vehicle: state.vehicleNo, bs, total: state.netAmount, valid: validInvoice && validDates };
  }
};

window.addEventListener('DOMContentLoaded', () => {
  setupBindings();
  updateLayout();
  updateCopyTags();
  switchTemplate(state.template);
  window.InvoiceWorkspace?.register('fuel', window.FuelBill);
}, { once: true });
