const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const dates = require('../invoice-dates');

test('known invoice dates and Nepali new year convert in both directions', () => {
  for (const [ad, bs] of [
    ['2026-08-08', '2083/04/23'],
    ['2026-08-31', '2083/05/15'],
    ['2026-10-26', '2083/07/09'],
    ['2026-04-14', '2083/01/01'],
    ['2024-02-29', '2080/11/17']
  ]) {
    assert.equal(dates.fromAD(ad).bsInput, bs);
    assert.equal(dates.fromBS(bs).adInput, ad);
  }
});

test('accepts Nepali digits and preserves optional time and template formatting', () => {
  const converted = dates.fromBS('२०८३/०५/१५ ९:४१');
  assert.equal(converted.adInput, '2026-08-31');
  assert.equal(converted.bsInput, '2083/05/15');
  assert.equal(converted.time, '09:41');
  assert.equal(dates.fromBS('15/05/2083 09:41:30').time, '09:41:30');
  assert.equal(dates.formatBS(converted.bsInput, 'banglamukhi', converted.time), '15/05/2083 09:41');
  assert.equal(dates.formatBS(converted.bsInput, 'himal'), '2083/05/15');
});

test('rejects impossible dates instead of allowing calendar rollover', () => {
  for (const value of ['2026-02-29', '2026-04-31', '2026-00-10', '2026-13-01', 'not a date']) {
    assert.throws(() => dates.fromAD(value), RangeError, value);
  }
  for (const value of ['2083/00/01', '2083/13/01', '2083/01/00', '2083/01/33', '2083/12/32', '2083/07', '2083/07/09 24:00', '2083/07/09 12:60']) {
    assert.throws(() => dates.fromBS(value), RangeError, value);
  }
  assert.throws(() => dates.fromDisplayAD('31/02/2026'), RangeError);
});

test('supported boundaries convert exactly and adjacent dates are rejected', () => {
  assert.equal(dates.fromAD(dates.MIN_AD).bsInput, '2000/01/01');
  assert.equal(dates.fromAD(dates.MAX_AD).bsInput, '2090/12/30');
  assert.equal(dates.fromBS('2000/01/01').adInput, dates.MIN_AD);
  assert.equal(dates.fromBS('2090/12/30').adInput, dates.MAX_AD);
  for (const value of ['1943-04-13', '2034-04-14']) assert.throws(() => dates.fromAD(value), /Supported dates/);
  for (const value of ['1999/12/30', '2091/01/01']) assert.throws(() => dates.fromBS(value), /Supported dates/);
});

test('every supported AD day round-trips through BS without an offset', () => {
  const end = Date.parse(`${dates.MAX_AD}T00:00:00Z`);
  for (let day = Date.parse(`${dates.MIN_AD}T00:00:00Z`); day <= end; day += 86400000) {
    const iso = new Date(day).toISOString().slice(0, 10);
    assert.equal(dates.fromBS(dates.fromAD(iso).bsInput).adInput, iso);
  }
});

test('date-only conversion is independent of the computer timezone', () => {
  const modulePath = require.resolve('../invoice-dates');
  const code = `const dates = require(${JSON.stringify(modulePath)}); process.stdout.write(dates.fromAD('2026-10-26').bsInput + '|' + dates.fromBS('2080/11/17').adInput);`;
  for (const timezone of ['UTC', 'Asia/Kathmandu', 'Pacific/Honolulu', 'Pacific/Kiritimati', 'America/New_York']) {
    const result = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(result, '2083/07/09|2024-02-29', timezone);
  }
});

test('Nepali calendar months expose weekday offsets and actual month lengths', () => {
  const info = dates.monthInfo(2083, 1);
  assert.equal(info.startWeekday, 2);
  assert.equal(info.days, 31);
  for (let month = 1; month <= 12; month++) {
    const value = dates.monthInfo(2083, month);
    assert.ok(value.days >= 28 && value.days <= 32);
    assert.ok(value.startWeekday >= 0 && value.startWeekday <= 6);
  }
  assert.throws(() => dates.monthInfo(2091, 1), RangeError);
});
