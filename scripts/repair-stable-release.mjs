/** Explicit maintainer operation: preserve the original 0.2.7 assets and publish its tested repair. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { list } from 'tar';
import { githubCredential } from './github-credential.mjs';

const publish = process.argv.includes('--publish');
const reportPath = process.argv.find(value => value.endsWith('results.json'));
assert.ok(reportPath, 'Pass the exact tested upgrade matrix results.json');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
assert.equal(pkg.version, '0.2.7');
assert.equal(pkg.runtimeGuardUpdater, 1);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const archiveName = 'dsh-runtime-guard-0.2.7.tgz';
const archive = await readFile(resolve('artifacts', archiveName));
const helper = await readFile('dist/upgrade-helper.mjs');
const reportBytes = await readFile(resolve(reportPath));
const report = JSON.parse(reportBytes);
assert.equal(report.targetVersion, pkg.version);
assert.equal(report.targetSha256, hash(archive));
assert.equal(report.helperSha256, hash(helper));
const files = new Map();
await list({ file: resolve('artifacts', archiveName), strict: true, onReadEntry(entry) {
  if (entry.type !== 'File') return;
  assert.ok(entry.path.startsWith('package/'));
  const chunks = []; entry.on('data', part => chunks.push(part));
  entry.on('end', () => files.set(entry.path.slice(8), Buffer.concat(chunks)));
} });
for (const [file, bytes] of files) assert.deepEqual(await readFile(resolve(file)), bytes, `Repack ${file}`);
assert.equal(JSON.parse(files.get('package.json')).runtimeGuardUpdater, 1);
assert.deepEqual(files.get('dist/upgrade-helper.mjs'), helper);
const sources = JSON.parse(await readFile('compatibility/upgrade-sources.json', 'utf8'));
for (const from of sources.versions) for (const mode of sources.modes) {
  assert.ok(report.results.some(row => row.from === from && row.to === pkg.version && row.mode === mode
    && row.status === 'passed' && row.storeConflictReproduced && row.nativeManager && row.unifiedUpdater
    && row.settingsPreserved && row.helperRegistration && (mode !== 'hmr' || row.pluginActivated)), `${from} ${mode}`);
}
const token = await githubCredential(); assert.ok(token, 'GitHub credential unavailable');
const base = 'https://api.github.com/repos/MyRemme/dsh-runtime-guard';
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
  'User-Agent': pkg.name, 'X-GitHub-Api-Version': '2022-11-28' };
async function request(url, method = 'GET', body, type = 'application/json') {
  const response = await fetch(url, { method, headers: { ...headers, ...(body ? { 'Content-Type': type } : {}) },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
    signal: AbortSignal.timeout(60000), redirect: 'error' });
  assert.ok(response.ok, `GitHub ${method}: HTTP ${response.status}`);
  return response.json();
}
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim();
const release = await request(`${base}/releases/tags/v0.2.7`);
const feed = await request(`${base}/contents/updates/stable.json?ref=main`);
const originalFeed = JSON.parse(Buffer.from(feed.content, 'base64'));
assert.equal(originalFeed.version, pkg.version);
assert.ok(['2a771e0d9f09145e565628717fa1023652180eaac4f5a141d36dfa3a1cfc966e',
  '7799119153e900914e1f8893f3311e02f920d48165ec4b6d15caa32df4f864ad', hash(archive)].includes(originalFeed.sha256), 'Unknown public archive; refuse replacing it');
const releases = await request(`${base}/releases?per_page=100`);
for (const item of releases.filter(item => !item.draft)) {
  assert.ok(sources.versions.includes(item.tag_name.replace(/^v/, '')), `Untested released source: ${item.tag_name}`);
}
if (!publish) {
  console.log(JSON.stringify({ ready: true, version: pkg.version, paths: report.results.length,
    archiveSha256: hash(archive), helperSha256: hash(helper), originalAssetsPreserved: true }));
} else {
  assert.equal(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8', windowsHide: true }).trim(), '', 'Commit first');
  assert.equal((await request(`${base}/commits/main`)).sha, head, 'Push reviewed commit first');
  const marker = '<!-- runtime-guard-unified-upgrade-repair-1 -->';
  const suffix = `unified-${hash(archive).slice(0, 12)}`;
  const sums = Buffer.from(`${hash(archive)}  ${archiveName}\n${hash(helper)}  upgrade-helper.mjs\n`);
  const staged = [];
  const bytesByName = [[archiveName, archive, 'application/gzip'], ['checksums.sha256', sums, 'text/plain'],
    ['upgrade-helper.mjs', helper, 'text/javascript'], ['upgrade-results.json', reportBytes, 'application/octet-stream']];
  const upload = release.upload_url.replace(/\{.*$/, '');
  for (const [name, bytes, type] of bytesByName) {
    const stageName = `${name}.${suffix}`;
    const assets = await request(`${base}/releases/${release.id}/assets?per_page=100`);
    let asset = assets.find(item => item.name === stageName || (item.name === name && item.digest === `sha256:${hash(bytes)}`));
    if (!asset) asset = await request(`${upload}?name=${encodeURIComponent(stageName)}`, 'POST', bytes, type);
    assert.equal(asset.size, bytes.length);
    assert.equal(asset.digest, `sha256:${hash(bytes)}`);
    staged.push({ name, asset });
  }
  // All replacement bytes exist and are verified before any public name changes.
  for (const { name, asset } of staged) {
    if (asset.name === name) continue;
    const assets = await request(`${base}/releases/${release.id}/assets?per_page=100`);
    const old = assets.find(item => item.name === name);
    if (old) await request(`${base}/releases/assets/${old.id}`, 'PATCH', { name: `${name}.original-${old.id}` });
    try { await request(`${base}/releases/assets/${asset.id}`, 'PATCH', { name }); }
    catch (error) {
      if (old) await request(`${base}/releases/assets/${old.id}`, 'PATCH', { name });
      throw error;
    }
  }
  const asset = staged.find(item => item.name === archiveName).asset;
  const metadata = { schemaVersion: 1, version: pkg.version, name: archiveName, size: archive.length,
    sha256: hash(archive), assetId: asset.id };
  const stable = await request(`${base}/contents/updates/stable.json`, 'PUT', {
    message: 'fix: publish verified 0.2.7 unified upgrade repair', branch: 'main', sha: feed.sha,
    content: Buffer.from(JSON.stringify(metadata, null, 2) + '\n').toString('base64'),
  });
  const instructions = `${marker}\n## 0.2.7 升级修复包（统一升级器）\n\n版本号保持 0.2.7，正式下载已替换为通过验证的修复包。原始标签不变，旧资产保留为 .original-*；本次修复源码：[${head.slice(0, 7)}](https://github.com/MyRemme/dsh-runtime-guard/commit/${head})。\n\n修复 pnpm 仓库冲突、Windows 清单临时锁与热更新状态交接。0.2.0～0.2.7 及 0.2.7-beta.1 的 18 条升级路径通过 DSH 0.2.1-rc.2 原生安装验证，设置与历史保留；HTTP 下载在矩阵中使用确定性响应，网络或系统权限故障仍会给出错误。\n\n旧版或原始 0.2.7 用户：下载本页 upgrade-helper.mjs，完全退出 DSH 后运行一次，再打开 DSH 等待对话空闲：\n\n\`\`\`powershell\nnode ./upgrade-helper.mjs --profile "$env:USERPROFILE/.dsh/profiles/desktop" --enable\n\`\`\`\n\n迁移助手会备份配置，使用与新包相同的校验和原生安装流程；修复包激活后迁移助手停止执行升级。无需卸载旧版。\n\n安装包 SHA-256：\`${hash(archive)}\`\n\n助手 SHA-256：\`${hash(helper)}\`\n`;
  await request(`${base}/releases/${release.id}`, 'PATCH', { body: (release.body ?? '').split(marker)[0].trimEnd() + '\n\n' + instructions });
  for (const legacy of releases.filter(item => !item.draft && item.id !== release.id)) {
    const assets = await request(`${base}/releases/${legacy.id}/assets?per_page=100`);
    const existing = assets.find(item => item.name === 'upgrade-helper.mjs');
    if (existing && existing.digest !== `sha256:${hash(helper)}`) {
      const stagedHelper = await request(`${legacy.upload_url.replace(/\{.*$/, '')}?name=upgrade-helper.mjs.${suffix}`, 'POST', helper, 'text/javascript');
      assert.equal(stagedHelper.digest, `sha256:${hash(helper)}`);
      await request(`${base}/releases/assets/${existing.id}`, 'PATCH', { name: `upgrade-helper.mjs.original-${existing.id}` });
      try { await request(`${base}/releases/assets/${stagedHelper.id}`, 'PATCH', { name: 'upgrade-helper.mjs' }); }
      catch (error) { await request(`${base}/releases/assets/${existing.id}`, 'PATCH', { name: 'upgrade-helper.mjs' }); throw error; }
    } else if (!existing) await request(`${legacy.upload_url.replace(/\{.*$/, '')}?name=upgrade-helper.mjs`, 'POST', helper, 'text/javascript');
    const note = `${marker}\n## 旧版升级迁移\n\n旧安装请使用 [0.2.7 修复包及迁移说明](https://github.com/MyRemme/dsh-runtime-guard/releases/tag/v0.2.7)。本页附带同一份 upgrade-helper.mjs；无需先卸载旧版，设置与历史保留。\n`;
    await request(`${base}/releases/${legacy.id}`, 'PATCH', { body: (legacy.body ?? '').split(marker)[0].trimEnd() + '\n\n' + note });
  }
  const receipt = { published: true, version: pkg.version, revision: 'unified-updater-1', sourceCommit: head,
    archiveSha256: hash(archive), helperSha256: hash(helper), stableFeedCommit: stable.commit.sha, url: release.html_url };
  await writeFile('artifacts/unified-release-receipt.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
