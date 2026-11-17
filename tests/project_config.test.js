/**
 * @jest-environment node
 *
 * The Node.js version is declared in several places; keep them in sync with
 * .node-version (the single source of truth, also used by CI).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const nodeVersion = read('.node-version').trim();

test('.node-version is a major version', () => {
  expect(nodeVersion).toMatch(/^\d+$/);
});

test('package.json engines matches .node-version', () => {
  expect(JSON.parse(read('package.json')).engines.node).toBe(`>=${nodeVersion}`);
});

test('dockerfile uses the same Node version', () => {
  expect(read('dockerfile')).toMatch(new RegExp(`^FROM node:${nodeVersion}-alpine$`, 'm'));
});

test('CI takes the Node version from .node-version', () => {
  expect(read('.github/workflows/test.yml')).toMatch(/node-version-file: \.node-version/);
});
