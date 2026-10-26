/* Shared by the static page and the dependency-free calculation tests. */
(function (root) {
  'use strict';
  const VAT_RATE = 0.13;
  const MAX_AMOUNT = 999999999.99;
  const roundMoney = value => Math.round((value + Number.EPSILON) * 100) / 100;

  function calculateInvoice({ retailRate, qty = 0, targetAmount = 0, discount = 0, mode = 'qty' }) {
    for (const value of [retailRate, mode === 'amount' ? targetAmount : qty, discount]) {
      if (!Number.isFinite(value) || value < 0) throw new RangeError('Enter finite, non-negative numbers.');
    }
    if (retailRate <= 0 || retailRate > 1000000) throw new RangeError('Pump rate must be greater than zero and at most 1,000,000.');
    if (mode !== 'qty' && mode !== 'amount') throw new RangeError('Choose a valid calculation mode.');
    const baseRate = retailRate / (1 + VAT_RATE);
    discount = roundMoney(discount);
    let basicAmount, taxableAmount, vatAmount, netAmount;
    if (mode === 'amount') {
      netAmount = roundMoney(targetAmount);
      taxableAmount = roundMoney(netAmount / (1 + VAT_RATE));
      basicAmount = roundMoney(taxableAmount + discount);
      vatAmount = roundMoney(netAmount - taxableAmount);
      // Keep full precision internally; a formatted quantity is only for display.
      qty = (netAmount / (1 + VAT_RATE) + discount) / baseRate;
    } else {
      basicAmount = roundMoney(qty * baseRate);
      if (discount > basicAmount) throw new RangeError('Discount cannot exceed the basic amount.');
      taxableAmount = roundMoney(basicAmount - discount);
      vatAmount = roundMoney(taxableAmount * VAT_RATE);
      netAmount = roundMoney(taxableAmount + vatAmount);
    }
    if (qty > 1000000 || Math.max(basicAmount, netAmount, discount) > MAX_AMOUNT) {
      throw new RangeError('Use a quantity up to 1,000,000 and amounts below 1,000,000,000.');
    }
    return { baseRate, qty, discount, basicAmount, taxableAmount, vatAmount, netAmount };
  }

  function formatCurrency(value, decimals = 2) {
    if (!Number.isFinite(Number(value))) value = 0;
    const parts = Number(value).toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  function numberToWords(amount, allCaps = false) {
    amount = Number(amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) amount = 0;
    const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    function group(n) {
      const words = [];
      if (n >= 100) { words.push(units[Math.floor(n / 100)], 'Hundred'); n %= 100; }
      if (n >= 20) { words.push(tens[Math.floor(n / 10)]); n %= 10; }
      if (n > 0) words.push(units[n]);
      return words.join(' ');
    }
    const cents = Math.round((amount + Number.EPSILON) * 100);
    let rupees = Math.floor(cents / 100);
    const paisa = cents % 100;
    const words = [];
    for (const [size, label] of [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']]) {
      if (rupees >= size) { words.push(group(Math.floor(rupees / size)), label); rupees %= size; }
    }
    if (rupees) words.push(group(rupees));
    const whole = words.join(' ') || 'Zero';
    if (allCaps) return `${whole}${paisa ? ` And ${group(paisa)} Paisa` : ''} Only`.toUpperCase();
    return `NRS ${whole} And ${paisa ? `${group(paisa)} Paisa` : 'Zero'} Only`;
  }

  const api = { calculateInvoice, formatCurrency, numberToWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.InvoiceMath = api;
})(globalThis);
