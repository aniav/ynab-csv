/**
 * @jest-environment node
 *
 * Every CSS class used in index.html (Bootstrap layout/components and
 * Font Awesome icons) must be defined by one of the stylesheets the page loads,
 * so a CSS library upgrade can't silently drop a class we rely on.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { cdnAssets, INDEX_HTML, ROOT } = require('./helpers/page');

function definedClasses() {
  const files = cdnAssets().filter((a) => a.tag === 'link').map((a) => a.localPath);
  const { document } = new JSDOM(INDEX_HTML).window;
  document.querySelectorAll('link[rel="stylesheet"]').forEach((l) => {
    const href = l.getAttribute('href');
    if (!/^(https?:)?\/\//.test(href)) files.push(path.join(ROOT, href));
  });
  const set = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) set.add(m[1]);
  }
  return set;
}

function usedClasses() {
  const set = new Set();
  for (const m of INDEX_HTML.matchAll(/\sclass="([^"]*)"/g)) {
    m[1].split(/\s+/).filter((c) => c && !c.includes('{{')).forEach((c) => set.add(c));
  }
  // classes applied dynamically
  ['app_loaded', 'dragging', 'dropzone', 'show'].forEach((c) => set.add(c));
  return set;
}

test('all classes used in index.html are defined by a loaded stylesheet', () => {
  const defined = definedClasses();
  const missing = [...usedClasses()].filter((c) => !defined.has(c));
  expect(missing).toEqual([]);
});

test('Font Awesome icons used in index.html exist', () => {
  const defined = definedClasses();
  const icons = [...usedClasses()].filter((c) => c.startsWith('fa-'));
  expect(icons.length).toBeGreaterThan(5);
  expect(icons.filter((c) => !defined.has(c))).toEqual([]);
});
