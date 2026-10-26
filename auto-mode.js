(function (root) {
  'use strict';
  const KEY = 'billbook.auto.v1';
  const records = new Map();
  let mounted = false;
  function preferences() {
    try {
      const raw = root.localStorage.getItem(KEY);
      const value = raw && raw.length < 5000 ? JSON.parse(raw) : {};
      return { enabled: value.version === 1 ? value.enabled !== false : true, rate: typeof value.rate === 'string' ? value.rate.slice(0, 40) : '' };
    } catch { return { enabled: true, rate: '' }; }
  }
  let prefs = preferences();
  const byId = id => document.getElementById(id);
  const adapter = kind => kind === 'fuel' ? root.FuelBill : root.ServiceBill;
  function persist() {
    try { root.localStorage.setItem(KEY, JSON.stringify({ version: 1, ...prefs })); } catch { /* The workspace reports storage availability. */ }
  }
  function setMode(enabled) {
    prefs.enabled = enabled;
    document.body.dataset.entryMode = enabled ? 'auto' : 'full';
    document.querySelectorAll('[data-entry-choice]').forEach(button => button.setAttribute('aria-pressed', String((button.dataset.entryChoice === 'auto') === enabled)));
    persist();
    if (mounted) root.InvoiceWorkspace.refresh();
  }
  function productRow(record, item = {}) {
    const row = document.createElement('fieldset');
    row.className = 'auto-product';
    row.innerHTML = '<div class="auto-product-top"><strong>Product / service</strong><button type="button" class="text-button" data-remove-product>Remove</button></div><label>Description<input data-product-field="description" maxlength="180"></label><div class="auto-product-numbers"><label>Unit price, excl. VAT<input type="number" min="0" max="999999999.99" step="0.000001" data-product-field="unitPrice"></label><label>Quantity<input type="number" min="0.001" max="1000000" step="0.001" placeholder="Random in sample mode" data-product-field="qty"></label></div>';
    row.sourceItem = { code: item.code || '', hsCode: item.hsCode || '', unit: item.unit || 'PCS' };
    const options = document.createElement('details');
    options.className = 'auto-options';
    options.innerHTML = '<summary>Discount (optional)</summary><label>Discount %<input type="number" data-product-field="discountPercent" min="0" max="100" step="0.01"></label>';
    options.querySelector('input').value = Number.isFinite(item.discountPercent) ? item.discountPercent : 0;
    row.appendChild(options);
    row.querySelector('[data-product-field="description"]').value = item.description || '';
    row.querySelector('[data-product-field="unitPrice"]').value = item.description && Number.isFinite(item.unitPrice) ? item.unitPrice : '';
    row.querySelector('[data-product-field="qty"]').value = '';
    row.querySelector('button').addEventListener('click', () => { row.remove(); record.dirty = true; });
    record.products.appendChild(row);
    return row;
  }
  function entryPanel(kind) {
    const fuel = kind === 'fuel';
    const panel = document.createElement('section');
    panel.className = 'auto-entry';
    panel.innerHTML = `<p class="eyebrow">AUTO MODE / ${fuel ? 'PETROL' : 'SERVICE'}</p><h2>A few details. Done.</h2><p class="auto-intro">Saved details fill the rest. Names, dates, prices, and supplied products stay as entered.</p><p id="auto-${kind}-context" class="auto-output-note"></p>
      <form id="auto-${kind}-form" novalidate>
        <div class="auto-entry-mode"><label>Output<select id="auto-${kind}-output"><option value="sample">Randomized sample · marked not issued</option><option value="transaction">Actual transaction · original reference</option></select></label></div>
        <p class="auto-output-note" id="auto-${kind}-note">Sample references and unspecified quantities are randomized. Every page is marked SAMPLE.</p>
        <label>${fuel ? 'Company / customer name' : 'Customer name'}<input id="auto-${kind}-name" autocomplete="name" maxlength="256"></label>
        <label>Nepali date (BS)<input id="auto-${kind}-bs" placeholder="YYYY/MM/DD" maxlength="32"></label><small class="auto-date-ad" id="auto-${kind}-ad"></small>
        <label id="auto-${kind}-reference-group" hidden>Original invoice reference<input id="auto-${kind}-reference" maxlength="120" placeholder="From the original bill"></label>
        ${fuel ? '<label>Pump rate · NPR / litre, incl. VAT<input id="auto-fuel-rate" type="number" min="0.01" max="1000000" step="0.01" placeholder="Enter the correct pump price"></label><label>Quantity / amount<select id="auto-fuel-basis"><option value="random">Random sample quantity</option><option value="qty">Enter litres</option><option value="amount">Enter paid amount (NPR)</option></select></label><label id="auto-fuel-value-group" hidden><span id="auto-fuel-value-label">Litres</span><input id="auto-fuel-value" type="number" min="0.001" step="0.001"></label>'
          : '<div id="auto-service-products"></div><button type="button" class="text-button" id="auto-service-add">+ Add product / service</button>'}
        <p class="auto-entry-error" id="auto-${kind}-error" role="alert" hidden></p>
        <div class="auto-entry-actions"><button type="button" class="quiet-button" data-auto-action="preview">Preview</button><button type="submit" class="solid-button" data-auto-action="pdf">Generate sample PDF</button></div>
        <div class="auto-entry-secondary"><button type="button" class="text-button" data-auto-action="print">Generate & print</button><button type="button" class="text-button" data-edit-all>Edit all fields →</button></div>
        <p class="auto-entry-result" id="auto-${kind}-result" role="status"></p>
      </form>`;
    const form = panel.querySelector('form');
    const record = { kind, panel, form, dirty: false, base: '', busy: false, products: panel.querySelector('#auto-service-products') };
    records.set(kind, record);
    byId(`${kind}Workspace`).querySelector('.control-panel').appendChild(panel);
    form.addEventListener('input', () => {
      record.dirty = true;
      byId(`auto-${kind}-error`).hidden = true;
      byId(`auto-${kind}-result`).textContent = '';
      updateDateHint(kind);
    });
    form.addEventListener('change', () => { record.dirty = true; updateOutput(kind); });
    form.addEventListener('submit', event => { event.preventDefault(); generate(kind, 'pdf'); });
    form.querySelector('[data-auto-action="preview"]').addEventListener('click', () => generate(kind, 'preview'));
    form.querySelector('[data-auto-action="print"]').addEventListener('click', () => generate(kind, 'print'));
    form.querySelector('[data-edit-all]').addEventListener('click', () => setMode(false));
    if (!fuel) byId('auto-service-add').addEventListener('click', () => { record.dirty = true; productRow(record).querySelector('input').focus(); });
    if (fuel) byId('auto-fuel-rate').value = prefs.rate;
    if (fuel) {
      const options = document.createElement('details');
      options.className = 'auto-options';
      options.innerHTML = '<summary>Discount (optional)</summary><label>Discount before VAT (NPR)<input id="auto-fuel-discount" type="number" min="0" step="0.01" value="0"></label>';
      form.querySelector('.auto-entry-actions').before(options);
    }
    hydrate(kind);
    updateOutput(kind);
  }
  function updateOutput(kind) {
    const transaction = byId(`auto-${kind}-output`).value === 'transaction';
    byId(`auto-${kind}-reference-group`).hidden = !transaction;
    byId(`auto-${kind}-note`).textContent = transaction ? 'Enter the actual quantity or amount and original reference. No transaction details are randomized.' : 'Sample references and unspecified quantities are randomized. Every page is marked SAMPLE.';
    records.get(kind).form.querySelector('[data-auto-action="pdf"]').textContent = transaction ? 'Generate bill PDF' : 'Generate sample PDF';
    if (kind === 'fuel') {
      const basis = byId('auto-fuel-basis');
      basis.querySelector('[value="random"]').disabled = transaction;
      if (transaction && basis.value === 'random') basis.value = 'qty';
      byId('auto-fuel-value-group').hidden = basis.value === 'random';
      byId('auto-fuel-value-label').textContent = basis.value === 'amount' ? 'Paid amount (NPR)' : 'Litres';
    }
  }
  function updateDateHint(kind) {
    try { byId(`auto-${kind}-ad`).textContent = `${InvoiceDates.fromBS(byId(`auto-${kind}-bs`).value).adDisplay} AD · automatic`; }
    catch { byId(`auto-${kind}-ad`).textContent = 'Choose a valid BS date, e.g. 2083/07/09.'; }
  }
  function hydrate(kind) {
    const record = records.get(kind);
    if (!record) return;
    const draft = adapter(kind).getDraft();
    const summary = adapter(kind).summary();
    byId(`auto-${kind}-context`).textContent = kind === 'fuel' ? `${draft.fields.fuelType} · ${draft.fields.stationName}` : `${ServiceBrandAssets.getBrand(draft.fields.brandId)?.name || 'Service bill'} · ${draft.fields.companyName}`;
    byId(`auto-${kind}-name`).value = summary.customer || '';
    byId(`auto-${kind}-bs`).value = summary.bs || InvoiceDates.todayInNepal().bsInput;
    byId(`auto-${kind}-reference`).value = draft.fields.documentKind === 'sample' ? '' : (kind === 'fuel' ? draft.fields.invNumber : draft.fields.invoiceNo) || '';
    if (kind === 'service') {
      record.products.replaceChildren();
      for (const item of draft.items || []) productRow(record, item);
      if (!record.products.children.length) productRow(record);
    }
    record.base = JSON.stringify(draft);
    record.dirty = false;
    updateDateHint(kind);
  }
  function timestamp() {
    return { date: InvoiceDates.todayInNepal(), time: new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kathmandu', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date()) };
  }
  async function generate(kind, action) {
    const record = records.get(kind);
    if (!record || record.busy) return;
    const errorNode = byId(`auto-${kind}-error`);
    const resultNode = byId(`auto-${kind}-result`);
    errorNode.hidden = true;
    resultNode.textContent = '';
    let result;
    try {
      const input = {
        mode: byId(`auto-${kind}-output`).value, name: byId(`auto-${kind}-name`).value,
        bs: byId(`auto-${kind}-bs`).value, reference: byId(`auto-${kind}-reference`).value
      };
      if (kind === 'fuel') Object.assign(input, { rate: byId('auto-fuel-rate').value, basis: byId('auto-fuel-basis').value, value: byId('auto-fuel-value').value, discount: byId('auto-fuel-discount').value });
      else input.items = Array.from(record.products.children, row => ({
        ...row.sourceItem, ...Object.fromEntries(Array.from(row.querySelectorAll('[data-product-field]'), field => [field.dataset.productField, field.value]))
      }));
      result = kind === 'fuel' ? AutoBill.fuel(input) : AutoBill.service(input);
      const draft = adapter(kind).getDraft();
      const now = timestamp();
      draft.fields.documentKind = result.documentKind;
      draft.dateRequest = { source: 'bs', value: result.date.bsInput };
      if (kind === 'fuel') {
        if (draft.fields.buyerName !== result.name) for (const key of ['buyerPan', 'buyerAddress', 'buyerMobile']) draft.fields[key] = '';
        Object.assign(draft.fields, result.fields, { buyerName: result.name, invNumber: result.invoiceNo, invoiceDate: result.date.adDisplay, invoiceMiti: result.date.bsInput, invoiceTime: `${now.date.adInput} ${now.time}`, remarks: '' });
        if (result.documentKind === 'transaction') { draft.fields.paymentMode = ''; draft.fields.dueDate = ''; }
      } else {
        if (draft.fields.customerName !== result.name) for (const key of ['customerPan', 'customerAddress', 'contact']) draft.fields[key] = '';
        Object.assign(draft.fields, { customerName: result.name, invoiceNo: result.invoiceNo, dateAD: result.date.adInput, dateBS: result.date.bsInput, kilometrage: '', narration: '', printedOn: `${now.date.adDisplay}, ${now.time}` });
        draft.items = result.items;
        draft.sample = 'blank';
      }
      record.dirty = true;
      root.InvoiceWorkspace.replaceBill(kind, draft, result.date.bsInput);
      record.base = JSON.stringify(adapter(kind).getDraft());
      record.dirty = false;
      if (kind === 'fuel') { prefs.rate = byId('auto-fuel-rate').value; persist(); }
      resultNode.textContent = `${result.documentKind === 'sample' ? 'Sample' : 'Bill'} ready · NPR ${InvoiceMath.formatCurrency(result.calculated.netAmount)}`;
    } catch (error) {
      errorNode.textContent = error.message;
      errorNode.hidden = false;
      return;
    }
    if (action === 'preview') {
      document.body.dataset.mobileView = 'preview';
      document.querySelectorAll('[data-mobile-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mobileView === 'preview')));
      root.InvoiceWorkspace.refresh();
      return;
    }
    if (action === 'print') { root.print(); return; }
    record.busy = true;
    record.form.querySelectorAll('[data-auto-action]').forEach(button => { button.disabled = true; });
    const button = record.form.querySelector('[data-auto-action="pdf"]');
    const label = button.textContent;
    button.textContent = 'Generating…';
    try {
      await (kind === 'fuel' ? root.downloadAsPDF() : root.ServiceBill.downloadPDF());
      const status = byId(kind === 'fuel' ? 'appStatus' : 'serviceStatus').textContent;
      if (status) resultNode.textContent = status;
    } finally {
      record.busy = false;
      record.form.querySelectorAll('[data-auto-action]').forEach(item => { item.disabled = false; });
      button.textContent = label;
    }
  }
  root.BillAuto = {
    enabled: () => prefs.enabled,
    mount() {
      if (mounted) return;
      const toggle = document.createElement('div');
      toggle.className = 'entry-mode-switch';
      toggle.setAttribute('aria-label', 'Entry mode');
      toggle.innerHTML = '<button type="button" data-entry-choice="auto">Auto mode</button><button type="button" data-entry-choice="full">Full editor</button>';
      document.querySelector('.workspace-top-actions').prepend(toggle);
      toggle.querySelectorAll('button').forEach(button => button.addEventListener('click', () => setMode(button.dataset.entryChoice === 'auto')));
      entryPanel('fuel'); entryPanel('service');
      mounted = true;
      setMode(prefs.enabled);
    },
    refresh(kind) {
      const record = records.get(kind);
      if (record && !record.dirty && record.base !== JSON.stringify(adapter(kind).getDraft())) hydrate(kind);
    },
    newBill(kind) {
      hydrate(kind);
      byId(`auto-${kind}-reference`).value = '';
      if (kind === 'fuel') byId('auto-fuel-value').value = '';
      if (kind === 'fuel') byId('auto-fuel-discount').value = '0';
      byId(`auto-${kind}-result`).textContent = '';
      if (prefs.enabled) byId(`auto-${kind}-name`).focus();
    },
    clear() {
      try { root.localStorage.removeItem(KEY); } catch { /* Already unavailable. */ }
      prefs = { enabled: true, rate: '' };
      byId('auto-fuel-rate').value = '';
      for (const kind of records.keys()) { byId(`auto-${kind}-output`).value = 'sample'; hydrate(kind); updateOutput(kind); }
      setMode(true);
    },
    generate
  };
})(window);
