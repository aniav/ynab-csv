/**
 * @jest-environment node
 *
 * index.html loads its runtime libraries from CDNs. The browser tests run
 * against the copies in node_modules, so make sure those are the exact same
 * versions (and, where SRI is used, the exact same bytes) that users get.
 */
const fs = require('fs');
const path = require('path');
const { cdnAssets, sri, ROOT } = require('./helpers/page');

const assets = cdnAssets();
const pkgJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const devDeps = pkgJson.devDependencies;

describe('CDN assets in index.html', () => {
  test('every CDN asset maps to a package in node_modules', () => {
    const unresolved = assets.filter((a) => !a.pkg).map((a) => a.url);
    expect(unresolved).toEqual([]);
  });

  describe.each(assets.filter((a) => a.pkg).map((a) => [a.url, a]))('%s', (url, asset) => {
    test('version matches the installed package and package.json pin', () => {
      const installed = require(path.join(ROOT, 'node_modules', asset.pkg, 'package.json')).version;
      expect(installed).toBe(asset.version);
      expect(devDeps[asset.pkg]).toBe(asset.version);
    });

    test('file exists in the package', () => {
      expect(fs.existsSync(asset.localPath)).toBe(true);
    });

    if (asset.integrity) {
      test('SRI hash matches the installed file', () => {
        const algo = asset.integrity.split('-')[0];
        expect(asset.integrity).toBe(sri(asset.localPath, algo));
        expect(asset.crossorigin).toBe('anonymous');
      });
    }
  });
});
