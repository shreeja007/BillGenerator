/* Date-only AD/BS conversion. Calendar data is vendored locally; no network calls. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./vendor/nepali-date-converter-3.4.0.umd.js').default);
  } else {
    root.InvoiceDates = factory(root.NepaliDate.default);
  }
})(globalThis, function (NepaliDate) {
  'use strict';
  const MIN_AD = '1943-04-14';
  const MAX_AD = '2034-04-13';
  const RANGE_MESSAGE = 'Supported dates: BS 2000/01/01–2090/12/30 (AD 1943-04-14–2034-04-13).';
  const pad = number => String(number).padStart(2, '0');
  const normalize = value => String(value).trim().replace(/[०-९]/g, digit => String('०१२३४५६७८९'.indexOf(digit)));

  function pair(date, time = '') {
    const ad = date.getAD();
    const bs = date.getBS();
    return {
      adInput: `${ad.year}-${pad(ad.month + 1)}-${pad(ad.date)}`,
      adDisplay: `${pad(ad.date)}/${pad(ad.month + 1)}/${ad.year}`,
      bsInput: `${bs.year}/${pad(bs.month + 1)}/${pad(bs.date)}`,
      time, weekday: ad.day
    };
  }

  function fromAD(value) {
    const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(normalize(value));
    if (!match) throw new RangeError('Enter a valid AD date.');
    const [year, month, day] = match.slice(1).map(Number);
    // Construct at local noon, rather than parsing an ISO string as a UTC instant.
    const date = new Date(year, month - 1, day, 12);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new RangeError('Enter a valid AD date.');
    }
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    if (iso < MIN_AD || iso > MAX_AD) throw new RangeError(RANGE_MESSAGE);
    return pair(new NepaliDate(date));
  }

  function fromDisplayAD(value) {
    const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(normalize(value));
    if (!match) throw new RangeError('Enter the AD date as DD/MM/YYYY.');
    return fromAD(`${match[3]}-${match[2]}-${match[1]}`);
  }

  function fromBS(value) {
    const text = normalize(value);
    const match = /^(?:(\d{4})[/-](\d{1,2})[/-](\d{1,2})|(\d{1,2})[/-](\d{1,2})[/-](\d{4}))(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
    if (!match) throw new RangeError('Enter the BS date as YYYY/MM/DD (optional HH:mm).');
    const year = Number(match[1] || match[6]);
    const month = Number(match[2] || match[5]);
    const day = Number(match[3] || match[4]);
    if (year < 2000 || year > 2090) throw new RangeError(RANGE_MESSAGE);
    if (month < 1 || month > 12 || day < 1 || day > 32) throw new RangeError('Enter a valid BS day and month.');
    let date;
    try { date = new NepaliDate(year, month - 1, day); }
    catch { throw new RangeError('Enter a valid BS date within 2000/01/01–2090/12/30.'); }
    const converted = date.getBS();
    // The library normalizes overflowing dates; reject them instead of changing the user's day.
    if (converted.year !== year || converted.month !== month - 1 || converted.date !== day) {
      throw new RangeError('That day does not exist in the selected BS month.');
    }
    let time = '';
    if (match[7] !== undefined) {
      if (Number(match[7]) > 23 || Number(match[8]) > 59 || Number(match[9] || 0) > 59) {
        throw new RangeError('Use a valid time from 00:00 to 23:59.');
      }
      time = `${pad(Number(match[7]))}:${match[8]}${match[9] !== undefined ? `:${match[9]}` : ''}`;
    }
    return pair(date, time);
  }

  function formatBS(bsInput, template, time = '') {
    const [year, month, day] = bsInput.split('/');
    const date = template === 'banglamukhi' ? `${day}/${month}/${year}` : bsInput;
    return `${date}${time ? ` ${time}` : ''}`;
  }

  function monthInfo(year, month) {
    const first = fromBS(`${year}/${month}/1`);
    let days = 32;
    while (days > 27) {
      try { fromBS(`${year}/${month}/${days}`); break; } catch { days--; }
    }
    return { year, month, days, startWeekday: first.weekday };
  }

  function todayInNepal() {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en', {
      timeZone: 'Asia/Kathmandu', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).map(part => [part.type, part.value]));
    return fromAD(`${parts.year}-${parts.month}-${parts.day}`);
  }

  return { MIN_AD, MAX_AD, fromAD, fromDisplayAD, fromBS, formatBS, monthInfo, todayInNepal };
});
