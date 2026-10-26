(function (root) {
  'use strict';
  const { formatCurrency, numberToWords } = InvoiceMath;
  const { calculateServiceInvoice } = ServiceMath;
  const byId = id => document.getElementById(id);
  const numericFields = new Set(['qty', 'unitPrice', 'discountPercent']);
  const itemFields = ['code', 'hsCode', 'description', 'qty', 'unit', 'unitPrice', 'discountPercent'];
  const common = {
    companyName: 'MAW Pvt. Ltd.', companyLocation: 'Nepal', companyPan: '300213081',
    customerName: 'Shreeja Manandhar', customerAddress: 'Kalimati, Nepal', customerPan: '000000000',
    contact: '9860687984', branch: 'TRP-SC', orderType: 'AMC', preparedBy: '', brandId: 'yamaha', partnerId: 'maw', documentKind: 'transaction'
  };
  const samples = {
    mobil: {
      ...common, invoiceNo: 'TRPSPI82/83-08182', dateAD: '2026-02-05', showBS: false,
      vehicleNo: '037PA0408', chassisNo: 'ME1RG6694N0036496', model: 'MT-15', modelVersion: 'BAC500-070F',
      kilometrage: '25110', narration: '02/05/2026(FONEPAY)', printedOn: '20/02/2026, 09:43:46',
      items: [{ code: '', hsCode: '', description: 'Mobil', qty: 1, unit: 'PCS', unitPrice: 1000, discountPercent: 0 }]
    },
    maintenance: {
      ...common, invoiceNo: 'TRPSPI83/84-07461', dateAD: '2026-10-13', showBS: true,
      vehicleNo: '035PA0782', chassisNo: 'ME1RG6811N0084253', model: 'MT-15 BS6', modelVersion: 'BCF100-070C',
      kilometrage: '54254', narration: 'Shreeja Manandhar(10/13/2026)fp', printedOn: '',
      items: [
        { code: '90793AD4170', hsCode: '27101972', description: 'YLUBE SPORTY PREM FL', qty: 1, unit: 'PCS', unitPrice: 1398.23, discountPercent: 10 },
        { code: '3BBE3440010', hsCode: '84219900', description: 'ELEMENT ASSY,OIL', qty: 1, unit: 'PCS', unitPrice: 710.2581, discountPercent: 10 },
        { code: 'BK7E4450000', hsCode: '84219900', description: 'ELEMENT ASSY, AIR', qty: 1, unit: 'PCS', unitPrice: 721.7599, discountPercent: 10 },
        { code: '93210548060', hsCode: '40169320', description: 'O-RING', qty: 1, unit: 'PCS', unitPrice: 59.39054, discountPercent: 10 },
        { code: 'RES0007', hsCode: '', description: 'FI clean', qty: 1, unit: 'UNIT', unitPrice: 443, discountPercent: 50 },
        { code: 'RES0007', hsCode: '', description: 'AMC Charge', qty: 1, unit: 'UNIT', unitPrice: 1151, discountPercent: 0 }
      ]
    }
  };
  let state, totals;
  let nextItemId = 0;
  let validItems = false, validDates = true, exporting = false;
  let lastDateRequest;
  const metadataControls = new Map();

  function blankItem() {
    return { id: ++nextItemId, code: '', hsCode: '', description: '', qty: 1, unit: 'PCS', unitPrice: 0, discountPercent: 0 };
  }
  function todayInNepal() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }
  function status(message = '') {
    byId('serviceStatus').textContent = message;
    byId('serviceStatus').hidden = !message;
  }
  function updateActions() {
    for (const id of ['servicePrint', 'servicePdf']) byId(id).disabled = !validItems || !validDates || exporting;
  }
  function amountWords(amount) {
    const words = numberToWords(amount, true);
    return words.includes(' PAISA ') ? words.replace(' AND ', ' RUPEES AND ') : words.replace(' ONLY', ' RUPEES ONLY');
  }
  function compactNumber(value, decimals) {
    return Number(value.toFixed(decimals)).toString();
  }
  function displayItem(item, field) {
    if (field === 'unitPrice') return item.unitPrice.toFixed(6).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1').replace(/^(\d+)$/, '$1.00');
    if (field === 'qty') return compactNumber(item.qty, 3);
    if (field === 'discountPercent') return compactNumber(item.discountPercent, 2);
    return String(item[field] ?? '');
  }

  function fillMetadata() {
    if (!state) return;
    root.InvoiceDocument?.apply('service', state.documentKind);
    renderBranding();
    const values = { ...state, displayDate: state.dateAD ? `${state.dateAD}${state.showBS ? ` (${state.dateBS})` : ''}` : '' };
    if (totals && validItems) {
      for (const key of ['grossAmount', 'discountAmount', 'taxableAmount', 'vatAmount', 'netAmount']) values[key] = formatCurrency(totals[key]);
      if (totals.discountAmount > 0) values.discountAmount = `-${values.discountAmount}`;
      values.inWords = amountWords(totals.netAmount);
    } else {
      for (const key of ['grossAmount', 'discountAmount', 'taxableAmount', 'vatAmount', 'netAmount']) values[key] = '—';
      values.inWords = '';
    }
    document.querySelectorAll('[data-service-sync]').forEach(node => {
      const value = String(values[node.dataset.serviceSync] ?? '');
      if (node !== document.activeElement && node.textContent !== value) node.textContent = value;
      if (node.hasAttribute('contenteditable')) node.setAttribute('aria-label', `Edit ${node.dataset.serviceSync.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
    });
  }

  function setLogo(image, asset) {
    image.hidden = !asset;
    if (!asset) {
      image.removeAttribute('src');
      image.alt = '';
      delete image.dataset.brand;
      return;
    }
    if (image.dataset.brand !== asset.id) {
      image.src = asset.src;
      image.alt = `${asset.name} logo`;
      image.dataset.brand = asset.id;
    }
  }
  function renderBranding() {
    const brand = ServiceBrandAssets.getBrand(state.brandId);
    const partner = ServiceBrandAssets.getPartner(state.partnerId);
    for (const page of byId('servicePrintSheet').querySelectorAll('.service-page')) {
      setLogo(page.querySelector('.service-brand-logo'), brand);
      setLogo(page.querySelector('.service-partner-logo'), partner);
      page.querySelector('.service-brands').hidden = !brand && !partner;
    }
    setLogo(byId('serviceBrandPreview'), brand);
    byId('serviceBrandName').textContent = brand?.name || 'No brand logo';
    const source = byId('serviceBrandSource');
    source.hidden = !brand;
    if (brand) source.href = brand.source;
    else source.removeAttribute('href');
  }
  function syncBrandControls() {
    byId('serviceBrand').value = state.brandId;
    byId('servicePartner').value = state.partnerId;
    byId('serviceBrandStatus').textContent = '';
  }

  function updateLineDisplays() {
    if (!totals || !validItems) return;
    const lines = new Map(totals.lines.map(item => [String(item.id), item]));
    document.querySelectorAll('.service-lines [data-line-id]').forEach(node => {
      const item = lines.get(node.dataset.lineId);
      if (item && node !== document.activeElement) node.textContent = displayItem(item, node.dataset.itemField);
    });
    document.querySelectorAll('[data-line-total]').forEach(node => {
      const item = lines.get(node.dataset.lineTotal);
      if (item) node.textContent = formatCurrency(item.amount);
    });
    for (const card of byId('serviceItemEditor').children) {
      const item = lines.get(card.dataset.itemId);
      card.querySelector('.service-line-amount').textContent = item ? `NPR ${formatCurrency(item.amount)}` : '';
    }
  }

  function recalculate(rebuild = false) {
    try {
      totals = calculateServiceInvoice(state.items);
      validItems = true;
      status();
    } catch (error) {
      validItems = false;
      status(error.message);
    }
    if (rebuild) renderPreview();
    updateLineDisplays();
    fillMetadata();
    updateActions();
  }

  function renderPreview() {
    const fragment = document.createDocumentFragment();
    const lines = validItems ? totals.lines : state.items;
    const perPage = 10;
    const pageCount = Math.max(1, Math.ceil(lines.length / perPage));
    for (let page = 0; page < pageCount; page++) {
      const article = byId('servicePageTemplate').content.firstElementChild.cloneNode(true);
      const tbody = article.querySelector('tbody');
      lines.slice(page * perPage, (page + 1) * perPage).forEach((item, index) => {
        const tr = document.createElement('tr');
        const serial = document.createElement('td');
        serial.textContent = page * perPage + index + 1;
        tr.appendChild(serial);
        for (const field of itemFields) {
          const td = document.createElement('td');
          td.dataset.lineId = item.id;
          td.dataset.itemField = field;
          td.setAttribute('contenteditable', 'plaintext-only');
          td.setAttribute('aria-label', `Item ${page * perPage + index + 1} ${field}`);
          if (numericFields.has(field)) td.className = 'numeric';
          td.textContent = typeof item[field] === 'number' && Number.isFinite(item[field]) ? displayItem(item, field) : String(item[field] ?? '');
          tr.appendChild(td);
        }
        const amount = document.createElement('td');
        amount.className = 'numeric';
        amount.dataset.lineTotal = item.id;
        amount.textContent = validItems ? formatCurrency(item.amount) : '';
        tr.appendChild(amount);
        tbody.appendChild(tr);
      });
      const last = page === pageCount - 1;
      article.querySelector('.service-totals').hidden = !last;
      article.querySelector('.service-closing').hidden = !last;
      article.querySelector('.service-continued').hidden = last;
      article.querySelector('.service-page-number').textContent = `Page ${page + 1} of ${pageCount}`;
      fragment.appendChild(article);
    }
    byId('servicePrintSheet').replaceChildren(fragment);
  }

  function renderItemEditor() {
    const fragment = document.createDocumentFragment();
    state.items.forEach((item, index) => {
      const card = byId('serviceItemTemplate').content.firstElementChild.cloneNode(true);
      card.dataset.itemId = item.id;
      card.querySelector('legend').textContent = `Item ${index + 1}`;
      card.querySelector('.service-remove').setAttribute('aria-label', `Remove item ${index + 1}`);
      card.querySelectorAll('[data-item-field]').forEach(input => {
        input.value = item[input.dataset.itemField];
        input.setAttribute('aria-label', `Item ${index + 1} ${input.closest('label').firstChild.textContent.trim()}`);
      });
      fragment.appendChild(card);
    });
    byId('serviceItemEditor').replaceChildren(fragment);
    byId('serviceItemCount').textContent = `${state.items.length} ${state.items.length === 1 ? 'item' : 'items'}`;
  }

  function updateDates(source, value) {
    lastDateRequest = { source, value };
    let error = '';
    try {
      if (!value.trim()) throw new RangeError('Choose an invoice date.');
      const converted = source === 'bs' ? InvoiceDates.fromBS(value) : InvoiceDates.fromAD(value);
      if (converted.time) throw new RangeError('Enter only the BS date here; use Printed On for a timestamp.');
      state.dateAD = converted.adInput;
      state.dateBS = converted.bsInput;
      byId('serviceDateAD').value = state.dateAD;
      if (document.activeElement !== byId('serviceDateBS')) byId('serviceDateBS').value = state.dateBS;
    } catch (problem) { error = problem.message; }
    validDates = !error;
    byId('serviceDateError').textContent = error;
    byId('serviceDateError').hidden = !error;
    for (const [id, fieldSource] of [['serviceDateAD', 'ad'], ['serviceDateBS', 'bs']]) {
      byId(id).setCustomValidity(source === fieldSource ? error : '');
      byId(id).setAttribute('aria-invalid', String(Boolean(error && source === fieldSource)));
    }
    fillMetadata();
    updateActions();
  }

  function loadSample(key) {
    const sample = samples[key] || {
      ...common, invoiceNo: '', customerName: '', customerAddress: '', customerPan: '', contact: '',
      dateAD: todayInNepal(), showBS: true, vehicleNo: '', chassisNo: '', model: '', modelVersion: '',
      kilometrage: '', narration: '', printedOn: '', items: [blankItem()]
    };
    state = { ...sample, items: sample.items.map(item => ({ ...item, id: ++nextItemId })) };
    syncBrandControls();
    totals = undefined;
    for (const [field, input] of metadataControls) input.value = state[field] || '';
    byId('serviceShowBS').checked = state.showBS;
    updateDates('ad', state.dateAD);
    renderItemEditor();
    recalculate(true);
  }

  function changeItem(id, field, value, badInput = false) {
    const item = state.items.find(line => String(line.id) === String(id));
    if (!item || !itemFields.includes(field)) return;
    item[field] = numericFields.has(field) ? (badInput || !value.trim() ? NaN : Number(value.replace(/,/g, ''))) : value;
    recalculate();
  }

  async function downloadPDF() {
    if (!validItems || !validDates || exporting) return;
    exporting = true;
    updateActions();
    byId('servicePdf').textContent = 'Generating PDF…';
    const snapshot = byId('servicePrintSheet').cloneNode(true);
    snapshot.classList.add('pdf-export');
    const invoice = (state.invoiceNo || 'bill').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
    try {
      await InvoiceExport.savePDF(snapshot, { filename: `Service_Tax_Invoice_${invoice}.pdf` });
      if (validItems && validDates) status('PDF downloaded.');
    } catch (error) {
      console.error('Service PDF export failed:', error);
      if (validItems && validDates) status('PDF export is unavailable. Use Print A4 and choose Save as PDF.');
    } finally {
      exporting = false;
      byId('servicePdf').textContent = 'Download PDF';
      updateActions();
    }
  }

  function setup() {
    const brandSelect = byId('serviceBrand');
    brandSelect.add(new Option('No brand logo', 'none'));
    for (const brand of ServiceBrandAssets.brands) brandSelect.add(new Option(brand.name, brand.id));
    byId('servicePartner').add(new Option('No dealer logo', 'none'));
    for (const partner of ServiceBrandAssets.partners) byId('servicePartner').add(new Option(partner.name, partner.id));
    brandSelect.addEventListener('change', () => {
      state.brandId = ServiceBrandAssets.brandId(brandSelect.value);
      if (state.brandId !== 'yamaha' && state.partnerId === 'maw') state.partnerId = 'none';
      syncBrandControls();
      renderBranding();
    });
    byId('servicePartner').addEventListener('change', event => {
      state.partnerId = ServiceBrandAssets.partnerId(event.target.value, state.brandId);
      syncBrandControls();
      renderBranding();
    });
    byId('saveServiceBrand').addEventListener('click', () => {
      const saved = root.InvoiceWorkspace?.saveServiceBranding(state.brandId, state.partnerId);
      byId('serviceBrandStatus').textContent = saved ? 'Logo preference saved for new service bills.' : 'Selected logos are kept in this bill. Browser saving is unavailable.';
    });
    document.querySelectorAll('[data-service-field]').forEach(input => {
      const field = input.dataset.serviceField;
      metadataControls.set(field, input);
      input.addEventListener('input', () => { state[field] = input.value; fillMetadata(); });
    });
    byId('serviceSample').addEventListener('change', event => loadSample(event.target.value));
    byId('resetService').addEventListener('click', () => loadSample(byId('serviceSample').value));
    for (const [id, source] of [['serviceDateAD', 'ad'], ['serviceDateBS', 'bs']]) {
      for (const type of ['input', 'change']) byId(id).addEventListener(type, event => updateDates(source, event.target.validity.badInput ? 'incomplete' : event.target.value));
    }
    byId('serviceDateBS').addEventListener('blur', () => { if (validDates) byId('serviceDateBS').value = state.dateBS; });
    byId('serviceShowBS').addEventListener('change', event => { state.showBS = event.target.checked; fillMetadata(); });
    byId('addServiceItem').addEventListener('click', () => {
      state.items.push(blankItem());
      renderItemEditor();
      recalculate(true);
      byId('serviceItemEditor').lastElementChild.querySelector('[data-item-field="description"]').focus();
    });
    byId('serviceItemEditor').addEventListener('click', event => {
      const remove = event.target.closest('.service-remove');
      if (!remove) return;
      const id = remove.closest('[data-item-id]').dataset.itemId;
      const index = state.items.findIndex(item => String(item.id) === id);
      state.items.splice(index, 1);
      renderItemEditor();
      recalculate(true);
      const next = byId('serviceItemEditor').children[Math.min(index, state.items.length - 1)];
      (next?.querySelector('[data-item-field="description"]') || byId('addServiceItem')).focus();
    });
    byId('serviceItemEditor').addEventListener('input', event => {
      const field = event.target.dataset.itemField;
      if (field) changeItem(event.target.closest('[data-item-id]').dataset.itemId, field, event.target.value, event.target.validity.badInput);
    });
    byId('servicePrintSheet').addEventListener('input', event => {
      const editor = event.target.closest('[contenteditable]');
      if (!editor) return;
      const field = editor.dataset.serviceSync;
      if (metadataControls.has(field)) {
        state[field] = editor.textContent;
        metadataControls.get(field).value = editor.textContent;
        fillMetadata();
      } else if (editor.dataset.lineId) {
        changeItem(editor.dataset.lineId, editor.dataset.itemField, editor.textContent);
        const control = byId('serviceItemEditor').querySelector(`[data-item-id="${editor.dataset.lineId}"] [data-item-field="${editor.dataset.itemField}"]`);
        if (control) control.value = numericFields.has(editor.dataset.itemField) ? editor.textContent.replace(/,/g, '') : editor.textContent;
      }
    });
    byId('servicePrintSheet').addEventListener('focusout', () => { updateLineDisplays(); fillMetadata(); });
    byId('servicePrint').addEventListener('click', () => { if (validItems && validDates && !exporting) root.print(); });
    byId('servicePdf').addEventListener('click', downloadPDF);
    root.addEventListener('beforeprint', () => { if (document.activeElement?.hasAttribute('contenteditable')) document.activeElement.blur(); });
    loadSample('mobil');
    root.InvoiceWorkspace?.register('service', root.ServiceBill);
  }
  function syncControls() {
    for (const [field, input] of metadataControls) input.value = state[field] || '';
    byId('serviceShowBS').checked = state.showBS;
    syncBrandControls();
    renderItemEditor();
  }
  function applyProfile(profile, bs) {
    Object.assign(state, profile.serviceCustomer, profile.serviceVehicle, profile.serviceProvider);
    state.brandId = ServiceBrandAssets.brandId(profile.serviceBrand);
    state.partnerId = ServiceBrandAssets.partnerId(profile.servicePartner, state.brandId);
    state.preparedBy = profile.preparedBy;
    syncControls();
    updateDates('bs', bs);
    recalculate(true);
  }
  root.ServiceBill = {
    downloadPDF,
    getProfile() {
      return {
        serviceCustomer: Object.fromEntries(['customerName', 'customerAddress', 'customerPan', 'contact'].map(field => [field, state[field]])),
        serviceVehicle: Object.fromEntries(['vehicleNo', 'chassisNo', 'model', 'modelVersion', 'orderType'].map(field => [field, state[field]])),
        serviceProvider: Object.fromEntries(['companyName', 'companyLocation', 'companyPan', 'branch'].map(field => [field, state[field]])),
        serviceBrand: state.brandId, servicePartner: state.partnerId
      };
    },
    getDraft() {
      return { fields: Object.fromEntries([...metadataControls.keys(), 'dateAD', 'dateBS', 'showBS', 'brandId', 'partnerId', 'documentKind'].map(field => [field, state[field]])), items: state.items.map(item => ({ ...item })), sample: byId('serviceSample').value, dateRequest: lastDateRequest };
    },
    restoreDraft(draft) {
      if (!draft?.fields || !Array.isArray(draft.items) || draft.items.length > 200) return false;
      const fields = draft.fields;
      for (const field of [...metadataControls.keys(), 'dateAD', 'dateBS']) if (typeof fields[field] === 'string') state[field] = fields[field].slice(0, 10000);
      state.showBS = fields.showBS === true;
      state.documentKind = fields.documentKind === 'sample' ? 'sample' : 'transaction';
      state.brandId = ServiceBrandAssets.brandId(fields.brandId);
      state.partnerId = ServiceBrandAssets.partnerId(fields.partnerId, state.brandId);
      state.items = draft.items.map(source => {
        const item = blankItem();
        for (const field of itemFields) {
          item[field] = numericFields.has(field) ? (typeof source?.[field] === 'number' ? source[field] : NaN) : (typeof source?.[field] === 'string' ? source[field].slice(0, 10000) : '');
        }
        return item;
      });
      totals = undefined;
      syncControls();
      byId('serviceSample').value = ['mobil', 'maintenance', 'blank'].includes(draft.sample) ? draft.sample : 'blank';
      const request = draft.dateRequest;
      if (request && ['ad', 'bs'].includes(request.source) && typeof request.value === 'string') {
        if (request.source === 'bs') byId('serviceDateBS').value = request.value;
        updateDates(request.source, request.value.slice(0, 128));
      } else updateDates('ad', state.dateAD);
      recalculate(true);
      return true;
    },
    newBill(profile, bs) {
      loadSample('blank');
      byId('serviceSample').value = 'blank';
      state.printedOn = `${InvoiceDates.todayInNepal().adDisplay}, ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date())}`;
      applyProfile(profile, bs);
    },
    applyProfile,
    setDate(bs) { updateDates('bs', bs); },
    summary() { return { customer: state.customerName, vehicle: state.vehicleNo, bs: state.dateBS, total: totals?.netAmount || 0, valid: validItems && validDates }; }
  };
  root.addEventListener('DOMContentLoaded', setup, { once: true });
})(window);
