(function (root) {
  'use strict';
  const adapters = new Map();
  const PROFILE_KEY = 'billbook.profile.v1';
  const DATE_KEY = 'billbook.date.v1';
  const draftKey = kind => `billbook.draft.${kind}.v1`;
  const months = ['बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज', 'कात्तिक', 'मंसिर', 'पुस', 'माघ', 'फागुन', 'चैत'];
  const digits = value => String(value).replace(/\d/g, digit => '०१२३४५६७८९'[digit]);
  const byId = id => document.getElementById(id);
  const profileFields = {
    fuelCustomer: ['buyerName', 'buyerPan', 'buyerAddress', 'buyerMobile', 'vehicleNo'],
    serviceCustomer: ['customerName', 'customerPan', 'customerAddress', 'contact'],
    serviceVehicle: ['vehicleNo', 'chassisNo', 'model', 'modelVersion', 'orderType'],
    serviceProvider: ['companyName', 'companyLocation', 'companyPan', 'branch'],
    fuelProvider: ['stationName', 'stationAddress', 'stationPhone', 'stationEmail', 'stationPan']
  };
  let profile, factorySeed, active = 'fuel', ready = false, workingBS, saveTimer;
  let setupStep = 0, setupFirst = false, pendingProfile, calendarTarget = 'bill';
  let calendarSelection, calendarYear, calendarMonth, previousBill;
  let previewMode = 'edit';
  const focusBeforeDialog = new WeakMap();

  function read(key, session = false) {
    try {
      const raw = (session ? root.sessionStorage : root.localStorage).getItem(key);
      if (!raw || raw.length > 2000000) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function write(key, value, session = false) {
    try {
      (session ? root.sessionStorage : root.localStorage).setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
  function safeFields(source, fields, fallback = {}) {
    const result = {};
    for (const field of fields) result[field] = typeof source?.[field] === 'string' ? source[field].slice(0, 2000) : (fallback[field] || '');
    return result;
  }
  function normalizeProfile(value, seed) {
    const source = value && typeof value === 'object' && value.version === 1 ? value : {};
    const groups = ['fuelCustomer', 'serviceCustomer', 'serviceVehicle', 'fuelProviders', 'serviceProvider'];
    const result = { version: 1, configured: source.version === 1 && source.configured === true && groups.every(key => source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) };
    for (const key of ['fuelCustomer', 'serviceCustomer', 'serviceVehicle', 'serviceProvider']) result[key] = safeFields(source[key], profileFields[key], result.configured && key !== 'serviceProvider' ? {} : seed[key]);
    result.fuelProviders = {};
    for (const key of ['himal', 'banglamukhi']) result.fuelProviders[key] = safeFields(source.fuelProviders?.[key], profileFields.fuelProvider, seed.fuelProviders[key]);
    result.template = ['himal', 'banglamukhi'].includes(source.template) ? source.template : 'himal';
    result.layout = ['landscape-2up', 'single-portrait'].includes(source.layout) ? source.layout : 'landscape-2up';
    result.paperTheme = ['pink', 'white'].includes(source.paperTheme) ? source.paperTheme : 'pink';
    result.preparedBy = typeof source.preparedBy === 'string' ? source.preparedBy.slice(0, 256) : '';
    result.serviceBrand = ServiceBrandAssets.brandId(source.serviceBrand);
    result.servicePartner = ServiceBrandAssets.partnerId(source.servicePartner, result.serviceBrand);
    return result;
  }
  function seedProfile() {
    const fuel = adapters.get('fuel').getProfile();
    const service = adapters.get('service').getProfile();
    return { ...fuel, ...service };
  }
  function dateParts(bs) { return InvoiceDates.fromBS(bs); }
  function validBS(bs) {
    try { return dateParts(bs).bsInput; } catch { return workingBS; }
  }
  function dateLabel(bs) {
    const [year, month, day] = bs.split('/').map(Number);
    return `${digits(year)} ${months[month - 1]} ${digits(day)}`;
  }
  function adLabel(ad) {
    const [year, month, day] = ad.split('-').map(Number);
    return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(year, month - 1, day, 12));
  }
  function showDialog(dialog) {
    focusBeforeDialog.set(dialog, document.activeElement);
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    focusBeforeDialog.get(dialog)?.focus();
  }

  function section(title, children, folded = false) {
    const node = document.createElement(folded ? 'details' : 'section');
    node.className = folded ? 'editor-fold' : 'editor-section';
    const heading = document.createElement(folded ? 'summary' : 'h2');
    heading.textContent = title;
    const content = document.createElement('div');
    content.className = 'editor-section-body';
    content.append(...children.filter(Boolean));
    node.append(heading, content);
    return node;
  }
  function field(id) { return byId(id)?.closest('.input-field'); }
  function collect(ids) { return ids.map(field).filter(Boolean); }
  function prepareEditor(kind) {
    const panel = byId(`${kind}Workspace`).querySelector('.control-panel');
    const identity = document.createElement('div');
    identity.className = 'bill-identity';
    identity.innerHTML = '<span class="identity-mark" aria-hidden="true"></span><div><span class="eyebrow">BILL FOR</span><strong></strong><small></small></div><button type="button" class="text-button">Saved details</button>';
    identity.querySelector('button').addEventListener('click', () => openSetup(false));
    const groups = [identity];
    if (kind === 'fuel') {
      groups.push(section('01 / Bill details', collect(['invNumber', 'templateSelect'])));
      const fuelGroup = byId('fuelType').closest('.control-group');
      fuelGroup.querySelector('h3').remove();
      groups.push(section('02 / Fuel & amount', Array.from(fuelGroup.children)));
      groups.push(section('Customer & vehicle', collect(['buyerName', 'buyerPan', 'buyerAddress', 'buyerMobile', 'vehicleNo', 'paymentMode', 'dueDate']), true));
      groups.push(section('Station details', collect(['stationName', 'stationAddress', 'stationPhone', 'stationEmail', 'stationPan']), true));
      groups.push(section('Date & timestamp details', collect(['invoiceMiti', 'invoiceDate', 'invoiceTime']), true));
      const layout = document.querySelector('input[name="printLayout"]').closest('.control-group');
      layout.querySelector('h3').remove();
      const theme = byId('btnPinkTheme').closest('.control-group');
      theme.querySelector('h3').remove();
      byId('btnReset').textContent = 'Load reference example';
      groups.push(section('Paper, copies & examples', [...Array.from(layout.children), ...Array.from(theme.children), byId('btnReset')], true));
      groups.push(byId('appStatus'));
    } else {
      groups.push(section('01 / Bill details', collect(['serviceInvoiceNo', 'serviceBrand', 'servicePartner', 'saveServiceBrand'])));
      const items = byId('serviceItemEditor').closest('.control-group');
      const count = byId('serviceItemCount');
      items.querySelector('.service-section-heading').remove();
      groups.push(section('02 / Parts & labour', [count, ...Array.from(items.children)]));
      groups.push(section('03 / This visit', collect(['serviceMileage', 'serviceOrder', 'serviceNarration'])));
      groups.push(section('Customer details', collect(['serviceCustomer', 'serviceCustomerPan', 'serviceAddress', 'serviceContact']), true));
      groups.push(section('Saved vehicle', collect(['serviceVehicle', 'serviceChassis', 'serviceModel', 'serviceVersion']), true));
      groups.push(section('Service centre & signature', collect(['serviceCompany', 'serviceLocation', 'serviceVatNo', 'serviceBranch', 'servicePreparedBy']), true));
      groups.push(section('Dates & printing', [...collect(['serviceDateBS', 'serviceDateAD']), byId('serviceDateHelp'), byId('serviceDateError'), byId('serviceShowBS').closest('label'), ...collect(['servicePrintedOn'])], true));
      groups.push(section('Reference examples', [...collect(['serviceSample']), byId('resetService')], true));
      groups.push(byId('serviceStatus'));
    }
    panel.replaceChildren(...groups);
    panel.setAttribute('aria-label', `${kind === 'fuel' ? 'Petrol' : 'Service'} bill editor`);
  }

  function mountShell() {
    document.body.classList.add('billbook');
    const shell = document.createElement('header');
    shell.className = 'workspace-header no-print';
    shell.innerHTML = `
      <div class="workspace-topbar">
        <div class="workspace-brand"><span class="brand-mark" aria-hidden="true">b.</span><div><strong>billbook</strong><small>A little less paperwork.</small></div></div>
        <div class="workspace-top-actions"><span id="draftSaveStatus" class="save-status" role="status">Ready</span><button type="button" class="quiet-button" id="workspaceSettings">Saved details <span aria-hidden="true">↗</span></button></div>
      </div>
      <div class="workspace-heading-row"><div><p class="eyebrow">YOUR BILLING WORKSPACE</p><h1 id="workspaceTitle">One bill. Less busywork.</h1></div>
        <button type="button" id="workspaceDate" class="workspace-date"><span class="eyebrow">NEPALI DATE / BS</span><strong></strong><small></small><span class="date-chevron" aria-hidden="true">⌄</span></button>
      </div>
      <div class="workspace-toolbar"><div class="workspace-tabs" role="tablist" aria-label="Bill type">
        <button type="button" role="tab" data-bill="fuel" aria-controls="fuelWorkspace">Petrol bill <span>01</span></button>
        <button type="button" role="tab" data-bill="service" aria-controls="serviceWorkspace">Service bill <span>02</span></button>
      </div><div class="workspace-export-actions"><button type="button" id="workspaceNew" class="quiet-button">+ New bill</button><div id="workspaceExports"></div></div></div>
      <div id="workspaceNotice" class="workspace-notice" role="status" hidden><span>New bill started with your saved details.</span><button type="button" id="undoNewBill" class="text-button">Undo</button></div>`;
    document.body.prepend(shell);
    byId('servicePrint').textContent = 'Print';
    const exportHost = byId('workspaceExports');
    for (const [kind, ids] of [['fuel', ['btnPrint', 'btnDownloadPdf']], ['service', ['servicePrint', 'servicePdf']]]) {
      const group = document.createElement('div');
      group.dataset.exports = kind;
      group.className = 'export-pair';
      group.append(...ids.map(byId));
      exportHost.appendChild(group);
    }
    for (const kind of ['fuel', 'service']) {
      byId(`${kind}Workspace`).setAttribute('role', 'tabpanel');
      byId(`${kind}Workspace`).setAttribute('aria-labelledby', `workspaceTab-${kind}`);
      shell.querySelector(`[data-bill="${kind}"]`).id = `workspaceTab-${kind}`;
      prepareEditor(kind);
      const area = byId(`${kind}Workspace`).querySelector('.preview-area');
      const sheet = kind === 'fuel' ? byId('printSheet') : byId('servicePrintSheet');
      const toolbar = document.createElement('div');
      toolbar.className = 'preview-toolbar no-print';
      toolbar.innerHTML = '<div><span class="preview-dot"></span><strong>Live preview</strong><small>Type on the bill to edit</small></div><label>Zoom <select class="preview-zoom" aria-label="Preview zoom"><option value="fit">Fit</option><option value="0.5">50%</option><option value="0.65">65%</option><option value="0.8">80%</option><option value="1">100%</option></select></label>';
      const frame = document.createElement('div');
      frame.className = 'preview-frame';
      const layer = document.createElement('div');
      layer.className = 'preview-scale-layer';
      layer.appendChild(sheet);
      frame.appendChild(layer);
      area.replaceChildren(toolbar, frame);
      toolbar.querySelector('select').addEventListener('change', fitPreview);
    }
    const mobile = document.createElement('div');
    mobile.className = 'workspace-mobile-switch no-print';
    mobile.innerHTML = '<button type="button" data-mobile-view="edit" aria-pressed="true">Edit bill</button><button type="button" data-mobile-view="preview" aria-pressed="false">Preview</button>';
    shell.appendChild(mobile);
    byId('workspaceSettings').addEventListener('click', () => openSetup(false));
    byId('workspaceDate').addEventListener('click', () => openCalendar('bill'));
    byId('workspaceNew').addEventListener('click', newBill);
    byId('undoNewBill').addEventListener('click', () => {
      if (!previousBill) return;
      adapters.get(previousBill.kind).restoreDraft(previousBill.draft);
      activate(previousBill.kind);
      previousBill = null;
      byId('workspaceNotice').hidden = true;
      saveNow();
    });
    shell.querySelectorAll('[data-bill]').forEach(button => button.addEventListener('click', () => activate(button.dataset.bill)));
    shell.querySelectorAll('[role="tab"]').forEach(button => button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const kind = event.key === 'Home' ? 'fuel' : event.key === 'End' ? 'service' : active === 'fuel' ? 'service' : 'fuel';
      activate(kind);
      shell.querySelector(`[data-bill="${kind}"]`).focus();
    }));
    mobile.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      previewMode = button.dataset.mobileView;
      document.body.dataset.mobileView = previewMode;
      mobile.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      fitPreview();
    }));
    document.body.dataset.mobileView = previewMode;
  }

  function profileInput(label, path, placeholder = '') {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    const input = document.createElement('input');
    input.type = 'text';
    input.dataset.profilePath = path;
    input.placeholder = placeholder;
    input.maxLength = 2000;
    wrapper.appendChild(input);
    return wrapper;
  }
  function mountDialogs() {
    const setup = document.createElement('dialog');
    setup.id = 'workspaceSetup';
    setup.className = 'setup-dialog no-print';
    setup.setAttribute('aria-labelledby', 'setupTitle');
    setup.innerHTML = `<div class="setup-layout"><aside class="setup-rail"><span class="brand-mark">b.</span><p class="eyebrow">A QUICK INTRODUCTION</p><h2>Set it up.<br>Make it yours.</h2><p>Your regular details, ready for every bill.</p><ol><li data-setup-progress="0">01 <span>Customer details</span></li><li data-setup-progress="1">02 <span>Your vehicles</span></li><li data-setup-progress="2">03 <span>Bill defaults</span></li></ol><small>Saved on this browser.<br>Edit them whenever you need.</small></aside><div class="setup-main">
      <div class="setup-top"><span id="setupCounter" class="eyebrow"></span><button type="button" class="quiet-button" id="setupCancel">Close ×</button></div>
      <h2 id="setupTitle"></h2><p id="setupDescription" class="setup-description"></p>
      <form id="workspaceSetupForm"><section data-setup-step="0"><h3>Petrol bills · company</h3><div class="setup-fields" id="setupFuelCustomer"></div><h3>Service bills · personal</h3><div class="setup-fields" id="setupServiceCustomer"></div></section>
      <section data-setup-step="1" hidden><h3>For petrol bills</h3><div class="setup-fields" id="setupFuelVehicle"></div><h3>For service bills</h3><div class="setup-fields" id="setupServiceVehicle"></div></section>
      <section data-setup-step="2" hidden><div class="setup-date-card"><span class="eyebrow">STARTING DATE · NEPALI FIRST</span><strong id="setupDateLabel"></strong><small id="setupADLabel"></small><button type="button" class="quiet-button" id="setupChooseDate">Choose Nepali date</button></div>
        <div class="setup-fields"><label>Petrol bill template<select id="setupTemplate"><option value="himal">Himal Enterprises</option><option value="banglamukhi">Banglamukhi Oil Store</option></select></label><label>Petrol print layout<select id="setupLayout"><option value="landscape-2up">Two copies · A4 landscape</option><option value="single-portrait">Single copy · A4 portrait</option></select></label><label>Petrol paper<select id="setupPaper"><option value="pink">Pink paper</option><option value="white">White paper</option></select></label></div>
        <div class="setup-fields" id="setupPreparedBy"></div><p class="setup-note">Service bills use A4 portrait. AD dates are calculated automatically from the Nepali date.</p>
        <div class="setup-fields"><label>Service bill brand<select id="setupServiceBrand"></select></label><label>Dealer logo (optional)<select id="setupServicePartner"></select></label></div>
        <details class="setup-provider-fold"><summary>Station & service-centre defaults</summary><h3>Himal Enterprises</h3><div class="setup-fields" id="setupHimalProvider"></div><h3>Banglamukhi Oil Store</h3><div class="setup-fields" id="setupBanglamukhiProvider"></div><h3>Service centre</h3><div class="setup-fields" id="setupServiceProvider"></div></details>
        <label class="setup-checkbox"><input type="checkbox" id="setupApplyCurrent"> Apply these details to the current bills too</label>
        <button type="button" class="text-button" id="setupCopyCurrent">Copy details from current bills</button>
        <button type="button" class="text-button danger-button" id="forgetWorkspace">Forget saved details & drafts</button>
      </section></form>
      <div class="setup-footer"><button type="button" class="quiet-button" id="setupBack">Back</button><button type="button" class="solid-button" id="setupNext">Continue →</button></div>
    </div></div>`;
    document.body.appendChild(setup);
    byId('setupServiceBrand').add(new Option('No brand logo', 'none'));
    for (const brand of ServiceBrandAssets.brands) byId('setupServiceBrand').add(new Option(brand.name, brand.id));
    byId('setupServicePartner').add(new Option('No dealer logo', 'none'));
    for (const partner of ServiceBrandAssets.partners) byId('setupServicePartner').add(new Option(partner.name, partner.id));
    byId('setupServiceBrand').addEventListener('change', () => {
      if (byId('setupServiceBrand').value !== 'yamaha' && byId('setupServicePartner').value === 'maw') byId('setupServicePartner').value = 'none';
    });
    const fields = [
      ['setupFuelCustomer', 'Company / customer name', 'fuelCustomer.buyerName'], ['setupFuelCustomer', 'PAN / VAT number', 'fuelCustomer.buyerPan'],
      ['setupFuelCustomer', 'Company address', 'fuelCustomer.buyerAddress'], ['setupFuelCustomer', 'Contact number', 'fuelCustomer.buyerMobile'],
      ['setupServiceCustomer', 'Customer name', 'serviceCustomer.customerName'], ['setupServiceCustomer', 'PAN / VAT number (optional)', 'serviceCustomer.customerPan'],
      ['setupServiceCustomer', 'Address', 'serviceCustomer.customerAddress'], ['setupServiceCustomer', 'Contact number', 'serviceCustomer.contact'],
      ['setupFuelVehicle', 'Vehicle number', 'fuelCustomer.vehicleNo'],
      ['setupServiceVehicle', 'Vehicle number', 'serviceVehicle.vehicleNo'], ['setupServiceVehicle', 'Chassis number', 'serviceVehicle.chassisNo'],
      ['setupServiceVehicle', 'Model', 'serviceVehicle.model'], ['setupServiceVehicle', 'Model version', 'serviceVehicle.modelVersion'],
      ['setupServiceVehicle', 'Usual service order type', 'serviceVehicle.orderType'], ['setupPreparedBy', 'Prepared by (optional)', 'preparedBy']
    ];
    for (const [container, label, path] of fields) byId(container).appendChild(profileInput(label, path));
    for (const [key, container] of [['himal', 'setupHimalProvider'], ['banglamukhi', 'setupBanglamukhiProvider']]) {
      for (const [field, label] of [['stationName', 'Station name'], ['stationAddress', 'Address'], ['stationPhone', 'Phone'], ['stationEmail', 'Email'], ['stationPan', 'PAN / VAT number']]) {
        byId(container).appendChild(profileInput(label, `fuelProviders.${key}.${field}`));
      }
    }
    for (const [field, label] of [['companyName', 'Company name'], ['companyLocation', 'Location'], ['companyPan', 'VAT registration number'], ['branch', 'Branch']]) {
      byId('setupServiceProvider').appendChild(profileInput(label, `serviceProvider.${field}`));
    }
    byId('workspaceSetupForm').addEventListener('submit', event => { event.preventDefault(); nextSetupStep(); });
    byId('setupNext').addEventListener('click', nextSetupStep);
    byId('setupBack').addEventListener('click', () => showSetupStep(Math.max(0, setupStep - 1)));
    byId('setupCancel').addEventListener('click', () => closeDialog(setup));
    byId('setupChooseDate').addEventListener('click', () => openCalendar('setup'));
    byId('setupCopyCurrent').addEventListener('click', () => {
      const startingBS = pendingProfile.startingBS;
      pendingProfile = normalizeProfile({ ...pendingProfile, ...seedProfile(), configured: pendingProfile.configured, version: 1 }, seedProfile());
      pendingProfile.startingBS = startingBS;
      fillSetup();
    });
    byId('forgetWorkspace').addEventListener('click', () => {
      if (!root.confirm('Forget the saved customer, vehicle and provider details, and both bill drafts on this browser?')) return;
      try { for (const key of [PROFILE_KEY, draftKey('fuel'), draftKey('service')]) root.localStorage.removeItem(key); root.sessionStorage.removeItem(DATE_KEY); } catch { /* Storage may be unavailable. */ }
      clearTimeout(saveTimer);
      profile = normalizeProfile({}, emptySeed());
      workingBS = InvoiceDates.todayInNepal().bsInput;
      for (const adapter of adapters.values()) adapter.newBill(profile, workingBS);
      root.BillAuto?.clear();
      previousBill = null;
      closeDialog(setup);
      openSetup(true);
      refresh();
    });
    const calendar = document.createElement('dialog');
    calendar.id = 'workspaceCalendar';
    calendar.className = 'calendar-dialog no-print';
    calendar.setAttribute('aria-labelledby', 'calendarTitle');
    calendar.innerHTML = `<div class="calendar-heading"><div><p class="eyebrow">NEPALI CALENDAR / BS</p><h2 id="calendarTitle">Choose a date.</h2></div><button type="button" id="calendarClose" class="quiet-button" aria-label="Close calendar">×</button></div>
      <label class="calendar-input-label">Nepali date<input id="calendarBS" placeholder="YYYY/MM/DD" aria-describedby="calendarError"></label><p id="calendarAD" class="calendar-ad"></p><p id="calendarError" class="calendar-error" role="status" hidden></p>
      <div class="calendar-navigation"><button type="button" id="calendarPrevious" class="quiet-button" aria-label="Previous month">←</button><select id="calendarMonth" aria-label="Nepali month"></select><select id="calendarYear" aria-label="Nepali year"></select><button type="button" id="calendarNext" class="quiet-button" aria-label="Next month">→</button></div>
      <div class="calendar-weekdays" aria-hidden="true"><span>आइत</span><span>सोम</span><span>मङ्गल</span><span>बुध</span><span>बिही</span><span>शुक्र</span><span>शनि</span></div><div id="calendarDays" class="calendar-days" aria-label="Days in the Nepali month"></div>
      <div class="calendar-footer"><button type="button" id="calendarToday" class="quiet-button">Today / आज</button><button type="button" id="calendarApply" class="solid-button">Use this date →</button></div><p class="setup-note" id="calendarScope"></p>`;
    document.body.appendChild(calendar);
    for (const [index, month] of months.entries()) byId('calendarMonth').add(new Option(month, index + 1));
    for (let year = 2000; year <= 2090; year++) byId('calendarYear').add(new Option(digits(year), year));
    byId('calendarClose').addEventListener('click', () => closeDialog(calendar));
    byId('calendarToday').addEventListener('click', () => selectCalendarDate(InvoiceDates.todayInNepal().bsInput));
    byId('calendarPrevious').addEventListener('click', () => moveMonth(-1));
    byId('calendarNext').addEventListener('click', () => moveMonth(1));
    for (const id of ['calendarMonth', 'calendarYear']) byId(id).addEventListener('change', () => {
      calendarMonth = Number(byId('calendarMonth').value); calendarYear = Number(byId('calendarYear').value); renderCalendar();
    });
    byId('calendarBS').addEventListener('input', () => {
      try {
        const date = InvoiceDates.fromBS(byId('calendarBS').value);
        if (date.time) throw new RangeError('Choose a date without a time.');
        selectCalendarDate(date.bsInput, false);
      }
      catch (error) { calendarError(error.message); }
    });
    byId('calendarApply').addEventListener('click', () => {
      if (byId('calendarApply').disabled) return;
      if (calendarTarget === 'setup') {
        pendingProfile.startingBS = calendarSelection;
        fillSetupDate();
      } else {
        workingBS = calendarSelection;
        write(DATE_KEY, workingBS, true);
        adapters.get(active).setDate(workingBS);
        saveNow();
      }
      closeDialog(calendar);
      refresh();
    });
  }

  function emptySeed() {
    const seed = JSON.parse(JSON.stringify(factorySeed || seedProfile()));
    for (const key of ['fuelCustomer', 'serviceCustomer', 'serviceVehicle']) seed[key] = {};
    return seed;
  }
  function fillSetup() {
    byId('workspaceSetupForm').querySelectorAll('[data-profile-path]').forEach(input => {
      const path = input.dataset.profilePath.split('.');
      input.value = path.reduce((value, key) => value?.[key], pendingProfile) || '';
    });
    byId('setupTemplate').value = pendingProfile.template;
    byId('setupLayout').value = pendingProfile.layout;
    byId('setupPaper').value = pendingProfile.paperTheme;
    byId('setupServiceBrand').value = pendingProfile.serviceBrand;
    byId('setupServicePartner').value = pendingProfile.servicePartner;
    fillSetupDate();
  }
  function fillSetupDate() {
    const date = dateParts(pendingProfile.startingBS || workingBS);
    byId('setupDateLabel').textContent = dateLabel(date.bsInput);
    byId('setupADLabel').textContent = `${adLabel(date.adInput)} AD`;
  }
  function openSetup(first) {
    setupFirst = first;
    pendingProfile = normalizeProfile(profile, seedProfile());
    pendingProfile.startingBS = workingBS;
    byId('setupApplyCurrent').checked = first;
    byId('setupCancel').textContent = first ? 'Set up later' : 'Close ×';
    byId('forgetWorkspace').hidden = first;
    fillSetup();
    showSetupStep(0);
    showDialog(byId('workspaceSetup'));
    byId('workspaceSetupForm').querySelector('input').focus();
  }
  function captureSetup() {
    byId('workspaceSetupForm').querySelectorAll('[data-profile-path]').forEach(input => {
      const path = input.dataset.profilePath.split('.');
      let target = pendingProfile;
      for (const key of path.slice(0, -1)) target = target[key];
      target[path[path.length - 1]] = input.value;
    });
    pendingProfile.template = byId('setupTemplate').value;
    pendingProfile.layout = byId('setupLayout').value;
    pendingProfile.paperTheme = byId('setupPaper').value;
    pendingProfile.serviceBrand = byId('setupServiceBrand').value;
    pendingProfile.servicePartner = byId('setupServicePartner').value;
  }
  function showSetupStep(step) {
    setupStep = step;
    const titles = ['Who are the bills for?', 'Your vehicles, remembered.', 'Make it your everyday setup.'];
    const descriptions = ['Keep company and personal billing separate. Review the details from your examples once.', 'Add the details that rarely change. Mileage stays with each service visit.', 'Choose a Nepali date and your usual print settings. Everything stays editable.'];
    byId('setupTitle').textContent = titles[step];
    byId('setupDescription').textContent = descriptions[step];
    byId('setupCounter').textContent = `STEP 0${step + 1} / 03`;
    document.querySelectorAll('[data-setup-step]').forEach(node => { node.hidden = Number(node.dataset.setupStep) !== step; });
    document.querySelectorAll('[data-setup-progress]').forEach(node => node.classList.toggle('current', Number(node.dataset.setupProgress) === step));
    byId('setupBack').hidden = step === 0;
    byId('setupNext').textContent = step === 2 ? (setupFirst ? 'Save & start billing →' : 'Save defaults →') : 'Continue →';
  }
  function nextSetupStep() {
    captureSetup();
    if (setupStep < 2) { showSetupStep(setupStep + 1); return; }
    profile = normalizeProfile({ ...pendingProfile, version: 1, configured: true }, seedProfile());
    write(PROFILE_KEY, profile);
    workingBS = pendingProfile.startingBS || workingBS;
    write(DATE_KEY, workingBS, true);
    if (byId('setupApplyCurrent').checked) {
      for (const adapter of adapters.values()) adapter.applyProfile(profile, workingBS);
    }
    closeDialog(byId('workspaceSetup'));
    saveNow();
    refresh();
  }
  function calendarError(message = '') {
    byId('calendarError').textContent = message;
    byId('calendarError').hidden = !message;
    byId('calendarApply').disabled = Boolean(message);
  }
  function selectCalendarDate(bs, fillInput = true) {
    const converted = dateParts(bs);
    if (converted.time) throw new RangeError('Choose a date without a time.');
    calendarSelection = converted.bsInput;
    [calendarYear, calendarMonth] = calendarSelection.split('/').map(Number);
    if (fillInput) byId('calendarBS').value = calendarSelection;
    byId('calendarAD').textContent = `${adLabel(converted.adInput)} AD · converted automatically`;
    calendarError();
    renderCalendar();
  }
  function openCalendar(target) {
    calendarTarget = target;
    const bs = validBS(target === 'setup' ? pendingProfile.startingBS || workingBS : adapters.get(active).summary().bs || workingBS);
    selectCalendarDate(bs);
    byId('calendarScope').textContent = target === 'setup' ? 'The starting date for your bills. Today in Nepal is selected by default.' : 'Used for this bill and the next new bill. Other drafts keep their dates.';
    showDialog(byId('workspaceCalendar'));
  }
  function moveMonth(direction) {
    let next = calendarYear * 12 + calendarMonth - 1 + direction;
    calendarYear = Math.floor(next / 12);
    calendarMonth = next % 12 + 1;
    renderCalendar();
  }
  function renderCalendar() {
    const info = InvoiceDates.monthInfo(calendarYear, calendarMonth);
    byId('calendarMonth').value = calendarMonth;
    byId('calendarYear').value = calendarYear;
    byId('calendarPrevious').disabled = calendarYear === 2000 && calendarMonth === 1;
    byId('calendarNext').disabled = calendarYear === 2090 && calendarMonth === 12;
    const fragment = document.createDocumentFragment();
    const today = InvoiceDates.todayInNepal().bsInput;
    for (let i = 0; i < info.startWeekday; i++) fragment.appendChild(document.createElement('span'));
    for (let day = 1; day <= info.days; day++) {
      const bs = `${calendarYear}/${String(calendarMonth).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = digits(day);
      button.dataset.bs = bs;
      button.setAttribute('aria-label', dateLabel(bs));
      button.setAttribute('aria-pressed', String(bs === calendarSelection));
      if (bs === today) button.setAttribute('aria-current', 'date');
      button.addEventListener('click', () => selectCalendarDate(bs));
      fragment.appendChild(button);
    }
    byId('calendarDays').replaceChildren(fragment);
  }

  function activate(kind) {
    if (!adapters.has(kind)) return;
    if (ready) saveNow();
    active = kind;
    for (const key of adapters.keys()) {
      byId(`${key}Workspace`).hidden = key !== kind;
      document.querySelector(`[data-exports="${key}"]`).hidden = key !== kind;
      const tab = document.querySelector(`[data-bill="${key}"]`);
      tab.setAttribute('aria-selected', String(key === kind));
      tab.tabIndex = key === kind ? 0 : -1;
    }
    document.body.classList.toggle('service-app', kind === 'service');
    byId('workspaceTitle').textContent = kind === 'fuel' ? 'A fill-up. A finished bill.' : 'Good service. Clear paperwork.';
    if (kind === 'fuel') adapters.get(kind).syncPrint();
    else byId('dynamicPrintPageStyle').textContent = '@media print { @page { size: A4 portrait; margin: 8mm; } }';
    try { const url = new URL(root.location.href); url.searchParams.set('bill', kind === 'fuel' ? 'petrol' : 'service'); root.history.replaceState(null, '', url); } catch { /* Direct file URLs may restrict history. */ }
    refresh();
  }
  function refresh() {
    if (!ready) return;
    if (active === 'fuel') adapters.get(active).syncPrint();
    else byId('dynamicPrintPageStyle').textContent = '@media print { @page { size: A4 portrait; margin: 8mm; } }';
    const summary = adapters.get(active).summary();
    const bs = validBS(summary.bs);
    byId('workspaceDate').querySelector('strong').textContent = dateLabel(bs);
    byId('workspaceDate').querySelector('small').textContent = `${adLabel(dateParts(bs).adInput)} AD`;
    const identity = byId(`${active}Workspace`).querySelector('.bill-identity');
    identity.querySelector('strong').textContent = summary.customer || 'Add customer details';
    identity.querySelector('small').textContent = summary.vehicle || (active === 'fuel' ? 'Company billing profile' : 'Personal service profile');
    identity.querySelector('.identity-mark').textContent = (summary.customer || 'B').trim().slice(0, 1).toUpperCase();
    const toolbar = byId(`${active}Workspace`).querySelector('.preview-toolbar small');
    toolbar.textContent = summary.valid ? `NPR ${InvoiceMath.formatCurrency(summary.total)} · ready to export` : 'Complete the highlighted details';
    root.requestAnimationFrame(fitPreview);
    root.BillAuto?.refresh(active);
  }
  function fitPreview() {
    if (!ready) return;
    const area = byId(`${active}Workspace`).querySelector('.preview-area');
    const sheet = active === 'fuel' ? byId('printSheet') : byId('servicePrintSheet');
    const width = sheet.scrollWidth || (active === 'fuel' && byId('printSheet').classList.contains('landscape-mode') ? 1077 : 733);
    const height = sheet.scrollHeight || (active === 'service' ? Math.max(1, sheet.querySelectorAll('.service-page').length) * 1082 : 1060);
    const zoom = area.querySelector('.preview-zoom').value;
    const scale = zoom === 'fit' ? Math.min(1, Math.max(.25, ((area.clientWidth || 850) - 64) / width)) : Number(zoom);
    const frame = area.querySelector('.preview-frame');
    frame.style.width = `${width * scale}px`;
    frame.style.height = `${height * scale}px`;
    area.querySelector('.preview-scale-layer').style.transform = `scale(${scale})`;
  }
  function saveNow() {
    if (!ready) return;
    clearTimeout(saveTimer);
    let saved = true;
    for (const [kind, adapter] of adapters) saved = write(draftKey(kind), { version: 1, data: adapter.getDraft() }) && saved;
    const node = byId('draftSaveStatus');
    node.textContent = saved ? 'Drafts saved' : 'Saving unavailable · keep this tab open';
    node.classList.toggle('save-unavailable', !saved);
  }
  function scheduleSave() {
    if (!ready) return;
    clearTimeout(saveTimer);
    byId('draftSaveStatus').textContent = 'Saving…';
    saveTimer = setTimeout(saveNow, 300);
    refresh();
  }
  function newBill() {
    previousBill = { kind: active, draft: adapters.get(active).getDraft() };
    adapters.get(active).newBill(profile.configured ? profile : normalizeProfile({ version: 1, serviceBrand: profile.serviceBrand, servicePartner: profile.servicePartner }, emptySeed()), workingBS);
    byId('workspaceNotice').hidden = false;
    byId('workspaceNotice').querySelector('span').textContent = `New ${active === 'fuel' ? 'petrol' : 'service'} bill started with your saved details.`;
    saveNow();
    refresh();
    byId(active === 'fuel' ? 'invNumber' : 'serviceInvoiceNo').focus();
    root.BillAuto?.newBill(active);
  }
  function initialize() {
    const seed = seedProfile();
    factorySeed = JSON.parse(JSON.stringify(seed));
    profile = normalizeProfile(read(PROFILE_KEY), seed);
    const storedDate = read(DATE_KEY, true);
    try { workingBS = dateParts(storedDate).bsInput; } catch { workingBS = InvoiceDates.todayInNepal().bsInput; }
    mountShell();
    mountDialogs();
    for (const [kind, adapter] of adapters) {
      const draft = read(draftKey(kind));
      let restored = false;
      if (draft?.version === 1) {
        try { restored = adapter.restoreDraft(draft.data) !== false; } catch { restored = false; }
      }
      if (!restored) adapter.newBill(profile.configured ? profile : normalizeProfile({ version: 1, serviceBrand: profile.serviceBrand, servicePartner: profile.servicePartner }, emptySeed()), workingBS);
    }
    ready = true;
    active = new URLSearchParams(root.location.search).get('bill') === 'service' ? 'service' : 'fuel';
    activate(active);
    root.BillAuto?.mount();
    saveNow();
    for (const type of ['input', 'change', 'click', 'focusout']) document.addEventListener(type, event => {
      if (event.target.closest?.('[data-workspace]')) scheduleSave();
    });
    root.addEventListener('pagehide', saveNow);
    root.addEventListener('beforeunload', saveNow);
    root.addEventListener('resize', fitPreview);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    if (!profile.configured && !root.BillAuto?.enabled()) openSetup(true);
  }
  root.InvoiceWorkspace = {
    register(kind, adapter) { adapters.set(kind, adapter); if (adapters.size === 2 && !ready) initialize(); },
    isReady: () => ready,
    provider: key => profile?.fuelProviders?.[key],
    replaceBill(kind, draft, bs) {
      if (!ready || !adapters.has(kind)) throw new Error('The workspace is not ready.');
      const date = dateParts(bs);
      const previous = { kind, draft: adapters.get(kind).getDraft() };
      if (adapters.get(kind).restoreDraft(draft) === false) throw new Error('Could not prepare this bill.');
      previousBill = previous;
      workingBS = date.bsInput;
      write(DATE_KEY, workingBS, true);
      activate(kind);
      byId('workspaceNotice').hidden = false;
      byId('workspaceNotice').querySelector('span').textContent = draft.fields.documentKind === 'sample' ? 'Sample generated · not an issued invoice.' : 'Bill prepared from your entered transaction details.';
      saveNow();
    },
    saveServiceBranding(brand, partner) {
      if (!ready) return false;
      profile.serviceBrand = ServiceBrandAssets.brandId(brand);
      profile.servicePartner = ServiceBrandAssets.partnerId(partner, profile.serviceBrand);
      return write(PROFILE_KEY, profile.configured ? profile : { version: 1, configured: false, serviceBrand: profile.serviceBrand, servicePartner: profile.servicePartner });
    },
    refresh, saveNow
  };
})(window);
