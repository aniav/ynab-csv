// Loads index.html into a fresh jsdom window and runs the *real* browser
// libraries (from node_modules, pinned to the same versions index.html pulls
// from the CDN) followed by the app's own scripts, in the order index.html
// declares them. Used by the browser-level tests so that library upgrades are
// exercised against the actual markup and code.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Third-party scripts that are not part of the app's behaviour.
const IGNORED_HOSTS = ['js.sentry-cdn.com', 'www.googletagmanager.com'];

// Map a CDN URL to { pkg, version, file } inside node_modules.
const CDN_PATTERNS = [
  // https://cdn.jsdelivr.net/npm/<pkg>@<version>/<file>
  [/cdn\.jsdelivr\.net\/npm\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/, (m) => ({ pkg: m[1], version: m[2], file: m[3] })],];

function resolveCdnUrl(url) {
  for (const [re, fn] of CDN_PATTERNS) {
    const m = url.match(re);
    if (m) return fn(m);
  }
  return null;
}

function sri(file, algo) {
  return `${algo}-${crypto.createHash(algo).update(fs.readFileSync(file)).digest('base64')}`;
}

// Every external stylesheet/script in index.html, resolved to node_modules.
function cdnAssets() {
  const { document } = new JSDOM(INDEX_HTML).window;
  const nodes = document.querySelectorAll('script[src], link[rel="stylesheet"][href]');
  return Array.from(nodes)
    .map((el) => {
      const url = el.getAttribute('src') || el.getAttribute('href');
      if (!/^(https?:)?\/\//.test(url)) return null;
      if (IGNORED_HOSTS.some((h) => url.includes(h))) return null;
      const resolved = resolveCdnUrl(url);
      return {
        url,
        tag: el.tagName.toLowerCase(),
        integrity: el.getAttribute('integrity'),
        crossorigin: el.getAttribute('crossorigin'),
        ...resolved,
        localPath: resolved && path.join(ROOT, 'node_modules', resolved.pkg, resolved.file),
      };
    })
    .filter(Boolean);
}

// Script files to execute, in index.html order.
function scriptFiles() {
  const { document } = new JSDOM(INDEX_HTML).window;
  return Array.from(document.querySelectorAll('script[src]'))
    .map((el) => el.getAttribute('src'))
    .filter((src) => !IGNORED_HOSTS.some((h) => src.includes(h)))
    .map((src) => {
      if (!/^(https?:)?\/\//.test(src)) return path.join(ROOT, src);
      const resolved = resolveCdnUrl(src);
      if (!resolved) throw new Error(`Don't know how to load ${src} locally`);
      return path.join(ROOT, 'node_modules', resolved.pkg, resolved.file);
    });
}

function waitFor(predicate, { timeout = 2000, interval = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      let value;
      try {
        value = predicate();
      } catch (e) {
        value = null;
      }
      if (value) return resolve(value);
      if (Date.now() - start > timeout) return reject(new Error('waitFor timed out'));
      setTimeout(check, interval);
    })();
  });
}

// Options:
//   url:          page URL (e.g. to pass ?profile=...)
//   localStorage: object of key -> value (strings or JSON-able) set before boot
//   only:         array of basenames to load (e.g. ['papaparse.min.js']) instead of everything
async function loadPage({ url = 'http://localhost/', localStorage = {}, only = null } = {}) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    // jsdom does not implement navigation; the download link triggers it.
    if (!/navigation/i.test(e.message)) errors.push(e);
  });
  virtualConsole.on('error', (...args) => errors.push(new Error(args.join(' '))));

  // Strip external scripts so jsdom never tries to fetch them; we inject local copies.
  // Inline local stylesheets so visibility (display: none) behaves as in a browser.
  const html = INDEX_HTML
    .replace(/<script[^>]*\bsrc=[^>]*><\/script>/g, '')
    .replace(/<link[^>]*href="\.?\/?([\w.-]+\.css)"[^>]*>/g, (_, f) => `<style>${fs.readFileSync(path.join(ROOT, f), 'utf8')}</style>`);
  const dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole });
  const { window } = dom;

  for (const [k, v] of Object.entries(localStorage)) {
    window.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  }

  // Capture downloads instead of letting jsdom try to navigate.
  const downloads = [];
  window.HTMLAnchorElement.prototype.click = function () {
    downloads.push({ href: this.href, download: this.download });
  };

  let files = scriptFiles();
  if (only) files = files.filter((f) => only.includes(path.basename(f)));
  for (const file of files) {
    const script = window.document.createElement('script');
    script.textContent = fs.readFileSync(file, 'utf8');
    window.document.head.appendChild(script);
  }

  const page = {
    window,
    document: window.document,
    errors,
    downloads,
    $: (sel) => window.document.querySelector(sel),
    $$: (sel) => Array.from(window.document.querySelectorAll(sel)),
    waitFor,
    isVisible: (el) => isVisible(window, el),
    // Let the framework flush pending DOM updates (microtasks, timers and
    // animation frames, which Alpine's x-show uses).
    settle: () => new Promise((r) => setTimeout(() => window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTimeout(r))))),
    close: () => window.close(),
  };

  if (!only) {
    // Loaded = the "Loading..." overlay is gone and the upload form is showing.
    await waitFor(() => !page.isVisible(page.$('#app_is_loading')) && page.isVisible(page.$('#upload_wrapper')));
  }
  return page;
}

// --- interaction helpers -------------------------------------------------

// Rendered and not hidden by itself or any ancestor.
function isVisible(window, el) {
  if (!el || !el.isConnected) return false;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    if (window.getComputedStyle(n).display === 'none') return false;
  }
  return true;
}

async function click(page, el) {
  el.click();
  await page.settle();
}

async function setValue(page, input, value) {
  input.value = value;
  fire(page, input, 'input');
  fire(page, input, 'change');
  await page.settle();
}

function fire(page, el, type, props = {}) {
  const ev = new page.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, props);
  el.dispatchEvent(ev);
  return ev;
}

function makeFile(page, content, name = 'bank.csv') {
  return new page.window.File([content], name, { type: 'text/csv' });
}

async function uploadFile(page, content, name) {
  const input = page.$('#file');
  Object.defineProperty(input, 'files', { value: [makeFile(page, content, name)], configurable: true });
  fire(page, input, 'change');
  await page.waitFor(() => page.$('#tool_wrapper') && previewTable(page).rows.length);
  await page.settle();
}

async function selectOption(page, select, label) {
  const option = Array.from(select.options).find((o) => o.textContent.trim() === label);
  if (!option) throw new Error(`No option "${label}" in #${select.id}`);
  select.value = option.value;
  fire(page, select, 'change');
  await page.settle();
}

function tableText(table, headSelector) {
  const text = (els) => Array.from(els).map((c) => c.textContent.trim());
  return {
    head: text(table.querySelectorAll(headSelector)),
    rows: Array.from(table.querySelectorAll('tbody tr')).map((r) => text(r.querySelectorAll('td'))),
  };
}

function previewTable(page) {
  return tableText(page.$('#tool_wrapper table'), 'thead th label');
}

// The column-mapping <select>s above the preview, keyed by YNAB column.
function mappingSelects(page) {
  const out = {};
  page.$$('#tool_wrapper thead th').forEach((th) => {
    out[th.querySelector('label').textContent.trim()] = th.querySelector('select');
  });
  return out;
}

function selectedLabel(select) {
  const o = select.options[select.selectedIndex];
  return o ? o.textContent.trim() : null;
}

function importedTable(page) {
  return tableText(page.$$('.card')[1].querySelector('table'), 'thead th');
}

function decodeDownload(href) {
  const b64 = href.replace(/^data:attachment\/csv;base64,/, '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

module.exports = {
  ROOT,
  INDEX_HTML,
  cdnAssets,
  sri,
  loadPage,
  fire,
  click,
  setValue,
  makeFile,
  uploadFile,
  selectOption,
  previewTable,
  importedTable,
  mappingSelects,
  selectedLabel,
  decodeDownload,
};
