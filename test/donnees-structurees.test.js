const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(name => name.endsWith('.html'));

function inspecter(value, file) {
  if (Array.isArray(value)) return value.forEach(item => inspecter(item, file));
  if (!value || typeof value !== 'object') return;
  const types = [].concat(value['@type'] || []);
  if (value.aggregateRating || value.review) {
    assert.ok(!types.includes('Person'), file + ' attribue des avis à une personne');
    assert.ok(!types.some(type => ['Organization', 'EducationalOrganization', 'LocalBusiness'].includes(type)),
      file + ' attribue des avis au propre organisme du site');
  }
  Object.values(value).forEach(item => inspecter(item, file));
}

test('les données structurées des pages publiques sont lisibles et leurs avis ont un parent admissible', () => {
  let blocks = 0;
  for (const file of pages) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)) {
      inspecter(JSON.parse(match[1]), file);
      blocks++;
    }
  }
  assert.ok(blocks > 100, 'Le contrôle doit couvrir les vraies pages du site');
});
