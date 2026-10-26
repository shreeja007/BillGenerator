/* Shared, on-demand PDF transport for fuel and service invoices. */
(function (root) {
  'use strict';
  let libraryPromise;
  function loadPdfLibrary() {
    if (typeof root.html2pdf === 'function') return Promise.resolve();
    if (libraryPromise) return libraryPromise;
    libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.14.0/html2pdf.bundle.min.js';
      script.integrity = 'sha384-EaWTV/aVUkLz3tfwg3+5ycX7Q/d9ET9ruOKUgUuFIRUCfzHO1eo2J62a844iWPmY';
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      const timer = setTimeout(() => finish(new Error('PDF library timed out.')), 15000);
      function finish(error) {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); }
        else resolve();
      }
      script.onload = () => finish(typeof root.html2pdf === 'function' ? null : new Error('PDF library did not initialize.'));
      script.onerror = () => finish(new Error('PDF library could not load.'));
      document.head.appendChild(script);
    }).catch(error => { libraryPromise = undefined; throw error; });
    return libraryPromise;
  }
  async function savePDF(element, { filename, landscape = false }) {
    await loadPdfLibrary();
    if (document.fonts) await document.fonts.ready;
    await Promise.all(Array.from(element.querySelectorAll('img[src]')).filter(img => !img.hidden).map(img => typeof img.decode === 'function' ? img.decode() : Promise.resolve()));
    return root.html2pdf().set({
      margin: landscape ? [4, 6, 4, 6] : [8, 8, 8, 8],
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' },
      pagebreak: { mode: ['css'] }
    }).from(element).save();
  }
  root.InvoiceExport = { loadPdfLibrary, savePDF };
})(globalThis);
