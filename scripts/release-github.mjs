/**
 * Maintainer-only / 仅限维护者使用：发布 GitHub Release 并推进 updates/stable.json。
 * Requires repository push rights via github-credential.mjs; end users never run this.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { list } from 'tar';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const notesPath = process.argv[2] ?? `artifacts/local-review-notes/release-draft-${pkg.version}.zh-CN.md`;
const notes = (await readFile(resolve(notesPath), 'utf8')).trim();
const [heading, ...rest] = notes.split(/\r?\n/);
const validPrefixes = [`# DSH Runtime Guard ${pkg.version}`, `# ${pkg.name} ${pkg.version}`, `# ${pkg.name} v${pkg.version}`];
assert.ok(validPrefixes.some(prefix => heading === prefix || heading.startsWith(`${prefix} - `)), 'Write version-specific Chinese release notes before publishing');
const title = heading.slice(2).replace(/\s+-\s+.*$/, '');
const releaseBody = rest.join('\n').trim();
const tag = `v${pkg.version}`, archive = resolve(`artifacts/${pkg.name}-${pkg.version}.tgz`);
const data = await readFile(archive);
const entries = new Map();
await list({ file: archive, strict: true, onReadEntry: entry => {
  if (!entry.path.startsWith('package/node_modules/') && entry.type === 'File') {
    const chunks = []; entry.on('data', part => chunks.push(part)); entry.on('end', () => entries.set(entry.path.slice(8), Buffer.concat(chunks)));
  }
} });
assert.equal(JSON.parse(entries.get('package.json').toString()).version, pkg.version);
for (const [file, bytes] of entries) assert.deepEqual(await readFile(resolve(file)), bytes, `Repack the reviewed ${file} before publishing`);
assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version), 'Only formal versions can be released');
const sha256 = createHash('sha256').update(data).digest('hex');
assert.equal(pkg.runtimeGuardUpdater, 1, 'Every release must ship the unified updater');
const upgradeSources = JSON.parse(await readFile(resolve('compatibility/upgrade-sources.json'), 'utf8'));
const upgradeReportPath = process.argv[3];
assert.ok(upgradeReportPath, 'Pass the exact package upgrade-matrix results.json as the second argument');
const upgrades = JSON.parse(await readFile(resolve(upgradeReportPath), 'utf8'));
assert.equal(upgrades.targetVersion, pkg.version, 'Upgrade matrix tested a different version');
assert.equal(upgrades.targetSha256, sha256, 'Upgrade matrix must test this exact archive');
const helperBytes = entries.get('dist/upgrade-helper.mjs');
assert.ok(helperBytes, 'Publish the standalone legacy upgrade helper');
assert.equal(upgrades.helperSha256, createHash('sha256').update(helperBytes).digest('hex'), 'Upgrade helper differs from tested helper');
for (const from of new Set([...upgradeSources.versions, pkg.version])) {
  for (const mode of upgradeSources.modes) {
    assert.ok(upgrades.results.some(result => result.from === from && result.to === pkg.version && result.mode === mode
      && result.status === 'passed' && result.storeConflictReproduced && result.nativeManager && result.unifiedUpdater
      && result.settingsPreserved && result.helperRegistration && (mode !== 'hmr' || result.pluginActivated)), `Upgrade gate failed: ${from} (${mode})`);
  }
}
const sums = Buffer.from(`${sha256}  ${pkg.name}-${pkg.version}.tgz\n`);
await writeFile(resolve('artifacts/checksums.sha256'), sums);
const { githubCredential } = await import('./github-credential.mjs');
const token = await githubCredential(); assert.ok(token, 'GitHub credential unavailable');
const base = 'https://api.github.com/repos/MyRemme/dsh-runtime-guard';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': pkg.name, 'X-GitHub-Api-Version': '2022-11-28' };
async function request(url, options = {}) {
  const result = await fetch(url, { ...options, headers: { ...headers, ...options.headers }, signal: AbortSignal.timeout(60000), redirect: 'error' });
  assert.ok(result.ok, `GitHub request failed: HTTP ${result.status}`);
  return result.json();
}
const repository = await request(base); // Preserve the repository's current visibility.
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim(), '', 'Commit all reviewed changes before release');
const branch = await request(`${base}/commits/main`); assert.equal(branch.sha, head, 'Push the reviewed commit first');
const exists = await fetch(`${base}/releases/tags/${tag}`, { headers, signal: AbortSignal.timeout(15000) });
assert.equal(exists.status, 404, 'Refuse overwriting an existing release');
const released = await request(`${base}/releases?per_page=100`);
for (const release of released.filter(value => !value.draft)) {
  assert.ok(upgradeSources.versions.includes(release.tag_name.replace(/^v/, '')), `Add released version ${release.tag_name} to the upgrade matrix`);
}
const release = await request(`${base}/releases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
  tag_name: tag, target_commitish: head, name: title, draft: true, prerelease: false,
  body: `${releaseBody}\n\n## 安装包校验\n\nSHA-256（${pkg.name}-${pkg.version}.tgz）：\n\n\`\`\`text\n${sha256}\n\`\`\`\n`,
}) });
const upload = release.upload_url.replace(/\{.*$/, '');
let assetId;
for (const [name, bytes, type] of [[`${pkg.name}-${pkg.version}.tgz`, data, 'application/gzip'], ['checksums.sha256', sums, 'text/plain'],
  ['upgrade-helper.mjs', helperBytes, 'text/javascript'], ['upgrade-results.json', Buffer.from(JSON.stringify(upgrades, null, 2) + '\n'), 'application/json']]) {
  const asset = await request(`${upload}?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': type }, body: bytes });
  if (name.endsWith('.tgz')) assetId = asset.id;
}
assert.ok(Number.isSafeInteger(assetId) && assetId > 0);
const metadata = Buffer.from(JSON.stringify({ schemaVersion: 1, version: pkg.version,
  name: `${pkg.name}-${pkg.version}.tgz`, size: data.length, sha256, assetId }, null, 2) + '\n');
await writeFile(resolve('artifacts/update.json'), metadata);
const published = await request(`${base}/releases/${release.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false }) });
// Only advance the stable feed after all assets are uploaded and publicly released.
const feed = await request(`${base}/contents/updates/stable.json?ref=main`);
const stable = await request(`${base}/contents/updates/stable.json`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: `chore: publish stable update feed for ${tag}`, branch: 'main', sha: feed.sha, content: metadata.toString('base64') }) });
console.log(JSON.stringify({ published: true, private: repository.private, version: pkg.version, url: published.html_url, sha256, stableFeedCommit: stable.commit.sha }));
