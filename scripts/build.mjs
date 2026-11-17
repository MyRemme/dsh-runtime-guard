import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const entry = `runtime-${manifest.version}`;
assert.ok((await readFile(new URL('cordis.patch.yml', root), 'utf8')).replace(/\r\n/g, '\n').includes(`name: ./dist/${entry}.js\n`));
assert.equal(manifest.runtimeGuardUpdater, 1, 'Every release must ship the unified updater protocol');

// Remove stale unbundled JS modules and sourcemaps so only clean bundled entries and declarations remain.
for (const file of await readdir(new URL('dist/', root))) {
  if (/\.js(?:\.map)?$/.test(file)) await unlink(new URL(`dist/${file}`, root));
}

const common = {
  absWorkingDir: fileURLToPath(root),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22.18',
  packages: 'external',
  sourcemap: false,
  legalComments: 'none',
};
const bundled = { ...common, packages: undefined, external: ['node:*'],
  banner: { js: "import { createRequire as bundleRequire } from 'node:module'; const require = bundleRequire(import.meta.url);" } };

// A release-specific entry avoids stale loader namespaces after an online update.
await build({ ...bundled, entryPoints: ['src/index.ts'], outfile: `dist/${entry}.js` });
await build({ ...common, entryPoints: ['src/core.ts'], outfile: 'dist/core.js' });
await build({ ...bundled, entryPoints: ['src/upgrade-helper.ts'], outfile: 'dist/upgrade-helper.mjs',
  define: { UPGRADE_MANIFEST: JSON.stringify({ name: manifest.name, version: manifest.version }) } });
await writeFile(new URL('dist/index.js', root), `export * from './${entry}.js';\n`);
