const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createHash } = require('node:crypto');
const { JSDOM } = require('jsdom');
const assets = require('../service-brands');
const manifest = require('../assets/brands/manifest.json');

test('all eight brand logos and MAW preserve the downloaded original bytes in an offline bundle', () => {
  assert.equal(assets.brands.length, 8);
  assert.equal(assets.partners.length, 1);
  for (const asset of [...assets.brands, ...assets.partners]) {
    const original = readFileSync(resolve(__dirname, '../assets/brands', asset.file));
    const data = Buffer.from(asset.src.split(',')[1], 'base64');
    assert.deepEqual(data, original, asset.name);
    assert.equal(asset.sha256, createHash('sha256').update(original).digest('hex'));
    assert.match(asset.src, /^data:image\/(png|jpeg|svg\+xml);base64,/);
    assert.equal(new URL(asset.source).protocol, 'https:');
    assert.equal(new URL(asset.website).protocol, 'https:');
    assert.ok([...manifest.brands, ...manifest.partners].some(record => record.id === asset.id && record.source === asset.source));
    if (asset.mime === 'image/png') assert.equal(original.subarray(1, 4).toString(), 'PNG');
    if (asset.mime === 'image/jpeg') assert.equal(original.subarray(0, 2).toString('hex'), 'ffd8');
  }
});

test('bundled SVG logos are self-contained static images', () => {
  for (const asset of [...assets.brands, ...assets.partners].filter(asset => asset.mime === 'image/svg+xml')) {
    const svg = Buffer.from(asset.src.split(',')[1], 'base64').toString('utf8');
    const dom = new JSDOM(svg, { contentType: 'image/svg+xml' });
    const doc = dom.window.document;
    assert.equal(doc.documentElement.localName, 'svg');
    assert.equal(doc.querySelector('script, foreignObject, image'), null, asset.name);
    for (const node of doc.querySelectorAll('*')) {
      for (const attribute of node.attributes) {
        assert.ok(!/^on/i.test(attribute.name), `${asset.name}: executable event attribute`);
        if (/href$/i.test(attribute.name)) assert.match(attribute.value, /^#/);
      }
    }
    assert.doesNotMatch(svg, /url\(\s*['"]?(?:https?:|\/\/)|@import/i);
    dom.window.close();
  }
});

test('logo selection accepts only catalog IDs, including the explicit no-logo option', () => {
  assert.equal(assets.brandId('honda'), 'honda');
  assert.equal(assets.brandId('none'), 'none');
  assert.equal(assets.getBrand('none'), null);
  assert.equal(assets.brandId('https://example.com/logo.svg'), 'yamaha');
  assert.equal(assets.getBrand('__proto__'), null);
  assert.equal(assets.getPartner('javascript:alert(1)'), null);
  assert.equal(assets.partnerId(undefined, 'honda'), 'none');
  assert.equal(assets.partnerId(undefined, 'yamaha'), 'maw');
});
