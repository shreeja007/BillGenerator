(function (root) {
  'use strict';
  function apply(kind, documentKind) {
    const sheet = document.getElementById(kind === 'fuel' ? 'printSheet' : 'servicePrintSheet');
    if (!sheet) return;
    const sample = documentKind === 'sample';
    sheet.dataset.documentKind = sample ? 'sample' : 'transaction';
    for (const page of sheet.querySelectorAll(kind === 'fuel' ? '.bill-page' : '.service-page')) {
      let notice = page.querySelector('.sample-notice');
      if (sample && !notice) {
        notice = document.createElement('div');
        notice.className = 'sample-notice';
        notice.textContent = 'SAMPLE · NOT ISSUED';
        page.appendChild(notice);
      } else if (!sample) notice?.remove();
      for (const title of page.querySelectorAll('.h-tax-badge, .b-tax-title-box, .service-company h2')) {
        title.textContent = sample ? 'SAMPLE INVOICE' : (kind === 'service' ? 'TAX INVOICE' : 'Tax Invoice');
      }
    }
  }
  root.InvoiceDocument = { apply };
})(globalThis);
