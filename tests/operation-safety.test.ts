import { afterEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OperationSafety, assessCommand, isPathUnderSync } from '../src/operation-safety.js';
import { apply, type RuntimeGuardAPI } from '../src/index.js';
import type { PreToolDecision, ToolExecution } from '../src/types.js';
import { FakeHost, makeAgent } from './helpers.js';

const hosts: FakeHost[] = [], directories: string[] = [];
afterEach(async () => { for (const host of hosts.splice(0)) await host.close(); for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function directory() { const dir = await mkdtemp(join(tmpdir(), 'runtime-guard-safety-')); directories.push(dir); return dir; }
function fixture(options: { enabled?: boolean; version?: string; profile?: string; guard?: boolean } = {}) {
  const host = new FakeHost(); hosts.push(host);
  const guards: ((exec: ToolExecution) => string | undefined)[] = [];
  if (options.guard !== false) host.values.set('tools', { guard(check: (exec: ToolExecution) => string | undefined) {
    guards.push(check); return () => { const at = guards.indexOf(check); if (at >= 0) guards.splice(at, 1); };
  } });
  let mode = 'workspace-write', outcome: unknown = 'rejected';
  const requests: any[] = [];
  const approval = { request: vi.fn(async (request: unknown) => { requests.push(request); return outcome; }) };
  const policy = { resolve: vi.fn(() => ({ mode, workspaceRoot: 'D:\\project' })) };
  host.values.set('approval', approval); host.values.set('sandboxPolicy', policy);
  const safety = new OperationSafety(host, options.enabled ?? true, options.version ?? '0.2.2-rc.1', options.profile);
  const agent = makeAgent('private-safety-session');
  let bodies = 0, sequence = 0;
  const execution = (command: string, name = 'pwsh', args: unknown = { command, workdir: 'D:\\project' }): ToolExecution =>
    Object.freeze({ name, arguments: args, callId: `call-${++sequence}`, agent, signal: new AbortController().signal });
  const run = async (exec: ToolExecution) => {
    const gate: PreToolDecision = await host.waterfall('tools/pre-execute', [exec], () => Promise.resolve({ kind: 'allow' }));
    if (gate.kind !== 'allow') return gate;
    for (const guard of guards) { const reason = guard(exec); if (reason) return { kind: 'deny', reason }; }
    bodies++; return { kind: 'executed' };
  };
  return { host, safety, agent, guards, approval, requests, policy, execution, run, bodies: () => bodies,
    setMode: (value: string) => { mode = value; }, setOutcome: (value: unknown) => { outcome = value; } };
}

it.each([
  "Start-Process -FilePath cmd.exe -Verb RunAs -ArgumentList '/c echo harmless-fixture'",
  "$inner = 'echo harmless-fixture'; Start-Process cmd.exe -v 'RunAs' -ArgumentList $inner",
  'Sta`rt-Process cmd.exe -Verb RunAs', 'runas.exe /user:Administrator cmd.exe',
  'schtasks /create /tn fixture /tr harmless.exe', 'sc.exe config fixture binpath= harmless.exe',
])('blocks recorded elevation routes before the tool body: %s', async command => {
  const f = fixture(); expect((await f.run(f.execution(command))).kind).toBe('deny');
  expect(f.bodies()).toBe(0); expect(f.requests).toHaveLength(0); expect(f.safety.status().events[0]?.rule).toBe('elevation');
});
it('keeps readonly writes blocked even when the model requests full access or another pre-hook forces allow', async () => {
  const f = fixture(); f.setMode('read-only');
  for (const exec of [f.execution('cmd /c del /f /a D:\\fixture.txt'),
    f.execution('', 'write', { path: 'D:\\fixture.txt', content: 'x', sandbox_permissions: 'danger-full-access', justification: 'model claims authorization' })]) {
    expect((await f.run(exec)).kind).toBe('deny');
  }
  f.host.hooks.set('tools/pre-execute', [async () => ({ kind: 'allow' })]);
  expect((await f.run(f.execution('Remove-Item D:\\fixture.txt'))).kind).toBe('deny');
  expect(f.bodies()).toBe(0);
});
it('admits simple reads, blocks indirection in readonly, and delegates unrelated tools', async () => {
  const f = fixture(); f.setMode('read-only');
  expect((await f.run(f.execution('Get-ChildItem -LiteralPath D:\\project'))).kind).toBe('executed');
  for (const command of ['Get-Content $path', 'Get-Content file; node script.js', 'Get-Content file | Invoke-Expression', 'python inspect.py']) {
    expect((await f.run(f.execution(command))).kind).toBe('deny');
  }
  expect((await f.run(f.execution('', 'read', { path: 'D:\\project\\file' }))).kind).toBe('executed');
  expect(f.bodies()).toBe(2);
});
it('binds an approval to the complete call and asks again for the next call', async () => {
  const f = fixture(); const command = 'Remove-Item -LiteralPath D:\\project\\fixture.txt';
  expect((await f.run(f.execution(command))).kind).toBe('deny'); expect(f.bodies()).toBe(0);
  f.setOutcome('allowed-once');
  expect((await f.run(f.execution(command))).kind).toBe('executed');
  f.setOutcome('rejected');
  expect((await f.run(f.execution(command))).kind).toBe('deny');
  expect(f.requests).toHaveLength(3); expect(f.bodies()).toBe(1);
  expect(f.requests[1]).toMatchObject({ agent: f.agent, callId: 'call-2', toolName: 'pwsh' });
  expect(f.requests[1].reason).toContain(JSON.stringify(command)); expect(f.requests[1].reason).toContain('workdir');
  const exported = JSON.stringify(f.safety.status());
  expect(exported).not.toContain('fixture.txt'); expect(exported).not.toContain('private-safety-session');
});
it('does not let another pre-hook skip required approval, and preserves downstream denial', async () => {
  const f = fixture();
  f.host.on('tools/pre-execute', async () => ({ kind: 'deny', reason: 'other policy' }));
  f.setOutcome('allowed-once');
  expect(await f.run(f.execution('Remove-Item fixture'))).toEqual({ kind: 'deny', reason: 'other policy' });
  f.host.hooks.set('tools/pre-execute', [async () => ({ kind: 'allow' })]);
  expect((await f.run(f.execution('Remove-Item fixture'))).kind).toBe('deny'); expect(f.bodies()).toBe(0);
});
it('keeps simultaneous approvals isolated by call and agent', async () => {
  const f = fixture();
  const first = f.execution('Remove-Item first-fixture'), second = { ...f.execution('Remove-Item second-fixture'), agent: makeAgent('second-private-session') };
  let allow!: (value: unknown) => void, reject!: (value: unknown) => void;
  const accepted = new Promise<unknown>(resolve => { allow = resolve; }), rejected = new Promise<unknown>(resolve => { reject = resolve; });
  f.approval.request.mockImplementation(async (request: any) => request.callId === first.callId ? accepted : rejected);
  const a = f.run(first), b = f.run(second); await Promise.resolve();
  reject('rejected'); expect((await b).kind).toBe('deny'); expect(f.bodies()).toBe(0);
  allow('allowed-once'); expect((await a).kind).toBe('executed'); expect(f.bodies()).toBe(1);
  expect(f.safety.status()).toMatchObject({ approvalRequests: 2, approved: 1, denied: 1 });
});
it('rechecks the approved arguments and policy at final dispatch', async () => {
  const f = fixture(); f.setOutcome('allowed-once');
  const args = { command: 'Remove-Item first-fixture' }, exec = f.execution('', 'pwsh', args);
  f.host.on('tools/pre-execute', async (_exec, next) => { args.command = 'Remove-Item changed-fixture'; return next(); });
  expect((await f.run(exec)).kind).toBe('deny'); expect(f.bodies()).toBe(0);
});
it.each(['unavailable', 'cancelled', 'allowed', undefined])('rejects a non-grant approval outcome: %s', async outcome => {
  const f = fixture(); f.setOutcome(outcome);
  expect((await f.run(f.execution('Invoke-Expression $payload'))).kind).toBe('deny'); expect(f.bodies()).toBe(0);
});
it('fails closed on malformed arguments, missing policy/approval and thrown checks', async () => {
  const f = fixture();
  for (const args of [null, [], { command: 3 }, { command: 'Get-Location', script: 'other' }]) {
    expect((await f.run(f.execution('', 'pwsh', args))).kind).toBe('deny');
  }
  f.host.values.delete('approval'); expect((await f.run(f.execution('Invoke-Expression $payload'))).kind).toBe('deny');
  f.policy.resolve.mockImplementation(() => { throw Error('policy failed'); });
  expect((await f.run(f.execution('Get-Location'))).kind).toBe('deny');
  f.host.values.delete('sandboxPolicy'); expect(f.safety.status().state).toBe('blocked');
  expect((await f.run(f.execution('Get-Location'))).kind).toBe('deny'); expect(f.bodies()).toBe(0);
});
it.each([{ version: '9.9.9' }, { guard: false }])('reports unsupported protection and blocks covered calls when enabled: %j', async options => {
  const f = fixture(options); expect(f.safety.status().state).toBe('blocked');
  expect((await f.run(f.execution('Get-Location'))).kind).toBe('deny');
  await f.safety.setEnabled(false); expect((await f.run(f.execution('Get-Location'))).kind).toBe('executed');
});
it('revokes pending approval after policy changes, configuration changes or cancellation', async () => {
  for (const change of ['policy', 'configuration', 'cancel']) {
    const f = fixture(), exec = f.execution('Remove-Item fixture');
    let resolve!: (value: unknown) => void;
    const pending = new Promise<unknown>(done => { resolve = done; });
    f.approval.request.mockImplementationOnce(async () => pending);
    const running = f.run(exec); await Promise.resolve();
    if (change === 'policy') f.setMode('read-only');
    if (change === 'configuration') { await f.safety.setEnabled(false); await f.safety.setEnabled(true); }
    if (change === 'cancel') await f.safety.close();
    resolve('allowed-once'); expect((await running).kind).toBe('deny'); expect(f.bodies()).toBe(0);
  }
});
it('is independent from monitoring, per-session pauses and model selection', async () => {
  const f = fixture({ enabled: false }); await f.safety.close();
  f.host.hooks.delete('tools/pre-execute');
  apply(f.host, { operationSafety: true, modelScope: 'selected', modelSelections: [] });
  const api = f.host.values.get('runtimeGuard') as RuntimeGuardAPI;
  api.setMonitoring(false); api.setSessionEnabled(f.agent.id, false);
  expect(api.operationSafety().enabled).toBe(true);
  expect((await f.run(f.execution('Start-Process cmd.exe -Verb RunAs'))).kind).toBe('deny'); expect(f.bodies()).toBe(0);
});
it('persists independent settings, retains them after write failure, migrates legacy settings and blocks corrupted settings', async () => {
  const profile = await directory(), f = fixture({ profile, enabled: false });
  await f.safety.setEnabled(true);
  expect(JSON.parse(await readFile(join(profile, '.runtime-guard/operation-safety.json'), 'utf8'))).toEqual({ enabled: true });
  const reloaded = fixture({ profile, enabled: false }); expect(reloaded.safety.status().enabled).toBe(true);
  await writeFile(join(profile, '.runtime-guard/operation-safety.json'), '{broken');
  const corrupted = fixture({ profile, enabled: false }); expect(corrupted.safety.status()).toMatchObject({ enabled: true, state: 'blocked', reason: 'settings-invalid' });
  expect((await corrupted.run(corrupted.execution('Get-Location'))).kind).toBe('deny');
  await corrupted.safety.setEnabled(false); expect(corrupted.safety.status().state).toBe('disabled');
  const legacyProfile = await directory();
  await mkdir(join(legacyProfile, '.flash-stabilizer'), { recursive: true });
  await writeFile(join(legacyProfile, '.flash-stabilizer/operation-safety.json'), JSON.stringify({ enabled: true }));
  const migrated = fixture({ profile: legacyProfile, enabled: false });
  expect(migrated.safety.status()).toMatchObject({ enabled: true, state: 'active' });
  const badProfile = await directory(); await writeFile(join(badProfile, '.runtime-guard'), 'not a directory');
  const failed = fixture({ profile: badProfile, enabled: false });
  const before = failed.safety.status().enabled;
  await expect(failed.safety.setEnabled(!before)).rejects.toThrow(); expect(failed.safety.status().enabled).toBe(before);
});
it('unregisters hard guards on disposal and bounds redacted history', async () => {
  const f = fixture(); for (let n = 0; n < 120; n++) await f.run(f.execution('runas fixture'));
  expect(f.safety.status().events).toHaveLength(100); await f.safety.close(); expect(f.guards).toHaveLength(0);
});
it('keeps ordinary project edits unprompted and flags encoded or nested execution', () => {
  expect(assessCommand('Set-Content -LiteralPath notes.txt -Value updated', 'workspace-write')).toEqual({ kind: 'allow' });
  for (const command of ['pwsh -EncodedCommand Zml4dHVyZQ==', 'cmd /c echo fixture', 'Invoke-Expression $payload', '& $executable', 'echo `custom-command`', 'echo >(custom-command)', 'Get-CustomFunction']) {
    expect(assessCommand(command, 'workspace-write').kind).toBe('ask');
  }
});
it('asks before patch deletion and unknown executable paths while allowing ordinary structured edits', async () => {
  const f = fixture();
  expect((await f.run(f.execution('', 'apply_patch', { patch: '*** Begin Patch\n*** Delete File: fixture.txt\n*** End Patch' }))).kind).toBe('deny');
  expect((await f.run(f.execution('C:\\tools\\custom.exe --task fixture'))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'edit', { path: 'fixture.txt', old_string: 'a', new_string: 'b' }))).kind).toBe('executed');
  expect(f.requests).toHaveLength(2); expect(f.bodies()).toBe(1);
});
it('denies readonly mutations and requests approval for workspace escapes with path redaction', async () => {
  const f = fixture();
  f.setMode('read-only');
  expect((await f.run(f.execution('', 'write', { path: 'D:\\outside\\secret.txt', content: 'x', sandbox_permissions: 'danger-full-access' }))).kind).toBe('deny');
  expect((await f.run(f.execution('Set-Content -LiteralPath D:\\project\\a.txt -Value x'))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'str_replace_editor', { command: 'view', path: 'D:\\project\\a.txt' }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'str_replace_editor', { command: 'create', path: 'D:\\project\\a.txt', file_text: 'x' }))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'terminal_open', { cwd: 'D:\\project' }))).kind).toBe('deny');
  expect(f.requests).toHaveLength(1);
  expect(f.bodies()).toBe(1);

  f.setMode('workspace-write');
  expect((await f.run(f.execution('', 'write', { path: 'D:\\outside\\secret.txt', content: 'x' }))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'str_replace_editor', { command: 'str_replace', path: '..\\escape.txt', old_str: 'a', new_str: 'b' }))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'apply_patch', { patch: '*** Begin Patch\n*** Update File: C:\\outside\\app.ts\n*** End Patch' }))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'multi_edit', { edits: [{ path: 'inside.ts' }, { path: '..\\outside.ts' }] }))).kind).toBe('deny');
  expect((await f.run(f.execution('Set-Content -LiteralPath C:\\outside\\note.txt -Value hi'))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'pwsh', { command: 'Set-Content -LiteralPath note.txt -Value hi', workdir: 'C:\\outside' }))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'terminal_open', { cwd: 'C:\\outside' }))).kind).toBe('deny');
  expect((await f.run(f.execution('', 'terminal_send', { input: 'Set-Content -LiteralPath C:\\outside\\a.txt -Value hi\n' }))).kind).toBe('deny');
  expect(f.requests).toHaveLength(9);
  expect(JSON.stringify(f.safety.status())).not.toMatch(/D:\\\\outside|C:\\\\outside|secret\.txt|escape\.txt|app\.ts|outside\.ts|note\.txt/);

  f.setOutcome('allowed-once');
  expect((await f.run(f.execution('', 'terminal_open', { cwd: 'D:\\project' }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'terminal_send', { input: '\x03', submit: false }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'str_replace_editor', { command: 'str_replace', path: 'D:\\project\\src\\app.ts', old_str: 'a', new_str: 'b' }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'write', { path: 'D:\\outside\\secret.txt', content: 'x' }))).kind).toBe('executed');
  expect(f.bodies()).toBe(5);
});
it.each(['read-only', 'workspace-write', 'danger-full-access'])('honors the session mode for ordinary reads and project work: %s', async mode => {
  const f = fixture(); f.setMode(mode);
  for (const command of ['rg --files', 'git status --short', 'Get-Content C:\\outside\\note.txt | Select-Object -First 5']) {
    expect((await f.run(f.execution(command))).kind).toBe('executed');
  }
  expect((await f.run(f.execution('', 'str_replace_editor', { command: 'view', path: 'C:\\outside\\note.txt' }))).kind).toBe('executed');
  for (const command of ['python export_conversation.py input.json output.md', 'node script.js', 'npm.cmd run build', 'pytest -q', 'git add src/app.ts']) {
    expect((await f.run(f.execution(command))).kind).toBe(mode === 'read-only' ? 'deny' : 'executed');
  }
  for (const [name, args] of [
    ['write', { path: 'src/app.ts', content: 'fixture' }],
    ['edit', { path: 'src/app.ts', old_string: 'a', new_string: 'b' }],
    ['apply_patch', { patch: '*** Begin Patch\n  *** Add File: src/new.ts\n+fixture\n*** End Patch' }],
  ] as const) expect((await f.run(f.execution('', name, args))).kind).toBe(mode === 'read-only' ? 'deny' : 'executed');
  if (mode !== 'read-only') expect(f.requests).toHaveLength(0);
});
it('delegates full access without plugin approvals while preserving other host denials and policy failures', async () => {
  const f = fixture(); f.setMode('danger-full-access');
  for (const command of ['Start-Process cmd.exe -Verb RunAs', 'Remove-Item C:\\outside\\fixture', 'Invoke-Expression $payload']) {
    expect((await f.run(f.execution(command))).kind).toBe('executed');
  }
  expect((await f.run(f.execution('', 'write', { path: 'C:\\outside\\fixture', content: 'x' }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'terminal_send', { sessionId: 'fixture-pty', text: '', submit: true }))).kind).toBe('executed');
  expect(f.requests).toHaveLength(0);
  f.host.on('tools/pre-execute', async () => ({ kind: 'deny', reason: 'native policy' }));
  expect(await f.run(f.execution('Get-Location'))).toEqual({ kind: 'deny', reason: 'native policy' });
  f.policy.resolve.mockImplementation(() => { throw Error('unavailable'); });
  expect((await f.run(f.execution('Get-Location'))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('policy-unavailable');
});
it('does not reuse a policy from a different session or trust a tool permission argument', async () => {
  const f = fixture();
  f.agent.session = { header: { cwd: 'D:\\project' } };
  f.policy.resolve.mockImplementation((...params: any[]) => ({ mode: params[0]?.session === f.agent.session ? 'workspace-write' : 'read-only', workspaceRoot: 'D:\\project' }));
  const args = { path: 'src/app.ts', content: 'x', sandbox_permissions: 'danger-full-access' };
  expect((await f.run(f.execution('', 'write', args))).kind).toBe('executed');
  expect((await f.run({ ...f.execution('', 'write', args), agent: makeAgent('another-session') })).kind).toBe('deny');
});
it('detects colon-bound PowerShell paths and indented native patch headers', async () => {
  const f = fixture();
  for (const command of ['Set-Content -LiteralPath:C:\\outside\\a.txt -Value x', 'Set-Content -LiteralPath:"C:\\outside folder\\a.txt" -Value x']) {
    expect((await f.run(f.execution(command))).kind).toBe('deny');
    expect(f.safety.status().events[0]?.rule).toBe('outside-workspace');
  }
  for (const patch of ['*** Begin Patch\n  *** Add File: C:\\outside\\a.txt\n+x\n*** End Patch', '*** Begin Patch\n  *** Delete File: a.txt\n*** End Patch']) {
    expect((await f.run(f.execution('', 'apply_patch', { patch }))).kind).toBe('deny');
  }
  expect(f.requests).toHaveLength(4);
  expect(f.safety.status().events[0]?.rule).toBe('destructive');
  f.setOutcome('allowed-once');
  expect((await f.run(f.execution('Set-Content -LiteralPath:"D:\\project\\a folder\\a.txt" -Value x'))).kind).toBe('executed');
  expect(f.requests).toHaveLength(4);
});
it('requires a fresh approval for live terminal input including empty Enter in restricted modes', async () => {
  const f = fixture(); f.setOutcome('allowed-once');
  expect((await f.run(f.execution('', 'terminal_open', { type: 'pwsh', cwd: 'C:\\outside' }))).kind).toBe('executed');
  f.setOutcome('rejected');
  for (const text of ['Set-Content relative.txt x', 'Get-Location', '']) {
    expect((await f.run(f.execution('', 'terminal_send', { sessionId: 'outside-pty', text, submit: true }))).kind).toBe('deny');
    expect(f.safety.status().events[0]?.rule).toBe('opaque-execution');
  }
  expect(f.requests).toHaveLength(4);
  f.setOutcome('allowed-once');
  expect((await f.run(f.execution('', 'terminal_send', { sessionId: 'outside-pty', text: '', submit: true }))).kind).toBe('executed');
  f.setMode('read-only');
  expect((await f.run(f.execution('', 'terminal_send', { sessionId: 'outside-pty', text: 'Set-Content a.txt x', submit: true }))).kind).toBe('deny');
  expect(f.requests).toHaveLength(5);
});
it('does not classify git output writes or external processors as readonly commands', () => {
  for (const command of ['git diff --output=C:\\outside\\a.txt', 'git log --output=C:\\outside\\a.txt', 'rg --pre=custom.exe fixture', 'git diff --ext-diff']) {
    expect(assessCommand(command, 'read-only', 'D:\\project', 'D:\\project').kind).not.toBe('allow');
  }
});
it('admits OPS workspace script paths and asks for readonly or outside scripts', async () => {
  const f = fixture();
  expect((await f.run(f.execution('', 'ops_bash', { script_path: 'scripts/build.sh', workdir: 'D:\\project' }))).kind).toBe('executed');
  expect(f.requests).toHaveLength(0);
  expect((await f.run(f.execution('', 'ops_bash', { script_path: 'C:\\outside\\build.sh' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('outside-workspace');
  f.setMode('read-only');
  expect((await f.run(f.execution('', 'ops_bash', { script_path: 'scripts/build.sh' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('read-only-unknown');
  expect(f.requests).toHaveLength(2);
  expect((await f.run(f.execution('', 'ops_bash', { script_path: 'scripts/build.sh', command: 'echo other' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('invalid-arguments');
});
it('does not extend project command admission to chained unknown execution', () => {
  for (const command of ['npm run build; custom-tool', 'git status && custom-tool', 'python script.py | custom-tool', 'node script.js\ncustom-tool']) {
    expect(assessCommand(command, 'workspace-write', 'D:\\project', 'D:\\project').kind).toBe('ask');
  }
});
it('detects symlink/junction workspace escapes cleanly', async () => {
  const root = await directory();
  const workspace = join(root, 'workspace'), outside = join(root, 'outside');
  await mkdir(workspace, { recursive: true }); await mkdir(outside, { recursive: true });
  await symlink(outside, join(workspace, 'escape-link'), 'junction');
  const f = fixture();
  f.policy.resolve.mockImplementation(() => ({ mode: 'workspace-write', workspaceRoot: workspace }));
  expect((await f.run(f.execution('', 'write', { path: join(workspace, 'escape-link', 'new-subdir', 'secret.txt'), content: 'x' }))).kind).toBe('deny');
  expect(f.requests).toHaveLength(1);
  expect(f.safety.status().events[0]?.rule).toBe('outside-workspace');
  expect((await f.run(f.execution('', 'write', { path: join(workspace, 'inside-dir', 'ok.txt'), content: 'x' }))).kind).toBe('executed');
});
it('blocks shell redirections without whitespace, variable writes, command substitutions and ADS/drive-relative paths', async () => {
  expect(isPathUnderSync('..foo.txt', 'D:\\project')).toBe(true);
  expect(isPathUnderSync('C:escape.txt', 'D:\\project')).toBe(false);
  expect(isPathUnderSync('notes.txt:Zone.Identifier', 'D:\\project')).toBe(false);
  expect(assessCommand('echo secret>C:\\outside\\pwned.txt', 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'ask', rule: 'outside-workspace' });
  expect(assessCommand('Set-Content $outsidePath -Value x', 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'ask', rule: 'outside-workspace' });
  expect(assessCommand("Set-Content notes.txt -Value '$100'", 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'allow' });
  expect(assessCommand('node a.js $(powershell -nop -c "evil")', 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'ask', rule: 'opaque-execution' });
  expect(assessCommand('rg "a|b" src/', 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'allow' });
  expect(assessCommand('git commit -m "fix bash completion"', 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'allow' });
  expect(assessCommand('npm run test:host', 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'allow' });
  expect(assessCommand('Set-Content notes.txt:Zone.Identifier -Value hi', 'workspace-write', 'D:\\project', 'D:\\project')).toEqual({ kind: 'ask', rule: 'outside-workspace' });

  const f = fixture();
  expect((await f.run(f.execution('', 'terminal_open', { type: 'python', cwd: 'D:\\project' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('opaque-execution');
  expect((await f.run(f.execution('', 'apply_patch', { patch: '--- a/gone.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-bye' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('destructive');
  expect((await f.run(f.execution('', 'apply_patch', { patch: 'diff --git a/a.txt b/out.txt\nrename from a.txt\nrename to C:\\outside\\out.txt' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('outside-workspace');
});
it('guards dsh-ops file tools, ops_batch, run_code and large outside-workspace approval previews', async () => {
  const f = fixture();
  expect((await f.run(f.execution('', 'ops_write_file', { path: 'src/a.ts', content: 'ok', expectedRevision: '0'.repeat(64) }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'ops_replace', { pattern: 'a', replacement: 'b' }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'ops_copy', { path: 'src/a.ts', to: 'C:\\outside\\a.ts', expectedRevision: '0'.repeat(64) }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('outside-workspace');
  expect((await f.run(f.execution('', 'ops_remove', { path: 'src/a.ts', expectedRevision: '0'.repeat(64) }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('destructive');
  expect((await f.run(f.execution('', 'ops_batch', { action: 'plan', operations: [{ op: 'copy', path: 'a.txt', to: 'b.txt' }] }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'ops_batch', { action: 'run', operations: [{ op: 'remove', path: 'a.txt' }] }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('destructive');
  expect((await f.run(f.execution('', 'ops_batch', { action: 'run', operationsRef: 'ref://plan-1' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('opaque-execution');
  expect((await f.run(f.execution('', 'run_code', { code: 'return await tools.read({ path: "src/a.ts" });', description: 'read file' }))).kind).toBe('executed');
  expect((await f.run(f.execution('', 'run_code', { code: 'const fs = await import("node:fs"); fs.writeFileSync("x", "y");', description: 'bypass' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('opaque-execution');
  expect((await f.run(f.execution('', 'run_code', { code: 'Start-Process cmd -Verb RunAs', description: 'elevate' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('elevation');

  f.setMode('read-only');
  expect((await f.run(f.execution('', 'ops_write_file', { path: 'src/a.ts', content: 'ok', expectedRevision: '0'.repeat(64), dryRun: true }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('read-only-write');
  expect((await f.run(f.execution('', 'run_code', { code: 'await tools.read({ path: "a.ts" });', description: 'read' }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('read-only-unknown');

  f.setMode('workspace-write');
  f.setOutcome('allowed-once');
  const huge = 'x'.repeat(70000);
  expect((await f.run(f.execution('', 'write', { path: 'C:\\outside\\big.txt', content: huge }))).kind).toBe('executed');
  expect(f.requests.at(-1)?.reason).toContain('预览已截断');
});

it('blocks env drive reads, inline interpreter code, abbreviated elevation, and risky workspace scripts', async () => {
  const workspace = await directory();
  await writeFile(join(workspace, 'elevate.ps1'), 'Start-Process cmd.exe -Verb RunAs\n');
  await writeFile(join(workspace, 'wipe.sh'), 'rm -rf ./src\n');
  await writeFile(join(workspace, 'build.sh'), 'npm run build\n');

  const f = fixture();
  let currentMode = 'read-only';
  f.policy.resolve.mockImplementation(() => ({ mode: currentMode, workspaceRoot: workspace }));
  for (const cmd of ['ls env:', 'Get-ChildItem env:', 'Get-Item env:OPENAI_API_KEY']) {
    expect((await f.run(f.execution(cmd))).kind).toBe('deny');
  }
  expect(assessCommand('ls env:', 'read-only', workspace, workspace)).toEqual({ kind: 'ask', rule: 'read-only-unknown' });

  currentMode = 'workspace-write';
  for (const cmd of ['ls env:', 'Get-ChildItem env:']) {
    expect(assessCommand(cmd, 'workspace-write', workspace, workspace)).toEqual({ kind: 'ask', rule: 'opaque-execution' });
  }
  expect(assessCommand('node -e "require(\'fs\').rmSync(\'.\', {recursive:true})"', 'workspace-write', workspace, workspace)).toEqual({ kind: 'ask', rule: 'destructive' });
  expect(assessCommand('python -c "import shutil; shutil.rmtree(\'src\')"', 'workspace-write', workspace, workspace)).toEqual({ kind: 'ask', rule: 'destructive' });
  expect(assessCommand('node -e "console.log(1)"', 'workspace-write', workspace, workspace)).toEqual({ kind: 'ask', rule: 'opaque-execution' });
  expect(assessCommand('node script.js', 'workspace-write', workspace, workspace)).toEqual({ kind: 'allow' });
  expect(assessCommand('python export_conversation.py -c cfg.json', 'workspace-write', workspace, workspace)).toEqual({ kind: 'allow' });

  for (const cmd of [
    'Start-Process cmd.exe -ve RunAs',
    'start cmd.exe -ver runas',
    'wmic process call create cmd.exe',
    'net localgroup administrators user /add',
  ]) {
    expect((await f.run(f.execution(cmd))).kind).toBe('deny');
    expect(f.safety.status().events[0]?.rule).toBe('elevation');
  }

  expect((await f.run(f.execution('', 'ops_bash', { script_path: 'elevate.ps1', workdir: workspace }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('elevation');
  expect((await f.run(f.execution('', 'ops_bash', { script_path: 'wipe.sh', workdir: workspace }))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('destructive');
  expect((await f.run(f.execution('', 'ops_bash', { script_path: 'build.sh', workdir: workspace }))).kind).toBe('executed');
  expect(f.requests.at(-1)?.reason).toContain('摘要：工具 ops_bash');
});

it('supports compatible 0.2.x hosts, optional full-access elevation guard, legacy migration write-back, and redacted history', async () => {
  expect(fixture({ version: '0.2.2-rc.2' }).safety.status().state).toBe('active');
  expect(fixture({ version: '0.1.7-rc.2' }).safety.status()).toMatchObject({ state: 'blocked', reason: 'host-unverified' });
  expect(fixture({ version: '9.9.9' }).safety.status()).toMatchObject({ state: 'blocked', reason: 'host-unverified' });

  const f = fixture();
  f.setMode('danger-full-access');
  expect((await f.run(f.execution('Start-Process cmd.exe -Verb RunAs'))).kind).toBe('executed');
  await f.safety.setGuardFullAccessElevation(true);
  expect((await f.run(f.execution('Start-Process cmd.exe -Verb RunAs'))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('elevation');
  expect((await f.run(f.execution('Remove-Item C:\\outside\\fixture'))).kind).toBe('executed');

  // Legacy migration persists to .runtime-guard/operation-safety.json so deleting .flash-stabilizer keeps it active.
  const migratedDir = await directory();
  await mkdir(join(migratedDir, '.flash-stabilizer'), { recursive: true });
  await writeFile(join(migratedDir, '.flash-stabilizer/operation-safety.json'), JSON.stringify({ enabled: true }));
  const firstBoot = fixture({ profile: migratedDir, enabled: false });
  await firstBoot.safety.close();
  expect(JSON.parse(await readFile(join(migratedDir, '.runtime-guard/operation-safety.json'), 'utf8'))).toEqual({ enabled: true });
  await rm(join(migratedDir, '.flash-stabilizer'), { recursive: true, force: true });
  const afterDelete = fixture({ profile: migratedDir, enabled: false });
  expect(afterDelete.safety.status()).toMatchObject({ enabled: true, state: 'active' });

  // Safety counters & redacted events persist when disk logging is enabled.
  const hostDir = await directory();
  const anchor = join(hostDir, 'package.json');
  await writeFile(anchor, '{}');
  for (const pkg of ['dsh-agent', 'dsh-llm', 'dsh-tools']) {
    const pkgDir = join(hostDir, 'node_modules/@deepseek-ai', pkg);
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ version: '0.2.2-rc.1' }));
  }
  const boot = () => {
    const host = new FakeHost(); hosts.push(host);
    host.values.set('tools', { guard: () => () => {} });
    host.values.set('approval', { request: vi.fn(async () => 'rejected') });
    host.values.set('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: 'D:\\project' }) });
    const origGet = host.get.bind(host);
    host.get = (name: string, strict = true) => name === 'profileContext' ? strict ? undefined : { dir: hostDir, installAnchor: anchor } : origGet(name);
    apply(host, { operationSafety: true });
    return { host, api: host.values.get('runtimeGuard') as RuntimeGuardAPI };
  };
  const h1 = boot();
  await h1.api.setDiskLogging(true);
  await h1.host.waterfall('tools/pre-execute', [{ name: 'pwsh', arguments: { command: 'Start-Process cmd -Verb RunAs D:\\secret.txt' }, callId: 'c1', agent: makeAgent('raw-safety-secret'), signal: new AbortController().signal }], async () => ({ kind: 'allow' }));
  await h1.host.close();
  const savedSafety = await readFile(join(hostDir, '.runtime-guard/logs/safety-history.json'), 'utf8');
  expect(savedSafety).not.toMatch(/secret\.txt|raw-safety-secret|RunAs/);
  const h2 = boot();
  expect(h2.api.operationSafety()).toMatchObject({ loggingPersisted: true, checked: 1, denied: 1 });
  expect(h2.api.operationSafety().events[0]?.rule).toBe('elevation');
});

it('blocks Unix/macOS elevation, git -c config execution, package runners, and sensitive file reads', async () => {
  const f = fixture();
  for (const cmd of [
    'sudo id',
    'doas sh',
    'pkexec env',
    'su - root',
    'chmod +s ./tool',
    'chmod 4755 ./tool',
    'usermod -aG sudo alice',
  ]) {
    expect((await f.run(f.execution(cmd))).kind).toBe('deny');
    expect(f.safety.status().events[0]?.rule).toBe('elevation');
  }
  // Full-access optional elevation guard also blocks Unix elevation routes.
  f.setMode('danger-full-access');
  await f.safety.setGuardFullAccessElevation(true);
  expect((await f.run(f.execution('sudo id'))).kind).toBe('deny');
  expect(f.safety.status().events[0]?.rule).toBe('elevation');

  // git -c / --config-env, package runners (npx/dlx/exec), python -m (non-test), node --import data:
  expect(assessCommand('git -c pager.status="sh -c id" status', 'read-only', '/tmp/ws', '/tmp/ws')).toEqual({ kind: 'ask', rule: 'read-only-unknown' });
  expect(assessCommand('git -c core.sshCommand="sh" fetch', 'workspace-write', '/tmp/ws', '/tmp/ws')).toEqual({ kind: 'ask', rule: 'opaque-execution' });
  expect(assessCommand('git --config-env=core.sshCommand=X status', 'workspace-write', '/tmp/ws', '/tmp/ws')).toEqual({ kind: 'ask', rule: 'opaque-execution' });
  for (const cmd of [
    'npx untrusted-cli',
    'npm exec -- untrusted-cli',
    'pnpm dlx untrusted-cli',
    'yarn dlx untrusted-cli',
    'bunx untrusted-cli',
    'python3 -m http.server 8000',
    'node --import=data:text/javascript,console.log(1) app.js',
  ]) {
    expect(assessCommand(cmd, 'workspace-write', '/tmp/ws', '/tmp/ws')).toEqual({ kind: 'ask', rule: 'opaque-execution' });
  }
  expect(assessCommand('python3 -m pytest -q', 'workspace-write', '/tmp/ws', '/tmp/ws')).toEqual({ kind: 'allow' });
  expect(assessCommand('python3 -m unittest discover', 'workspace-write', '/tmp/ws', '/tmp/ws')).toEqual({ kind: 'allow' });

  // Sensitive credential/key file reads require approval even in read-only or workspace-write.
  for (const cmd of ['cat .env', 'cat .env.production', 'Get-Content .npmrc', 'cat /etc/passwd']) {
    expect(assessCommand(cmd, 'read-only', '/tmp/ws', '/tmp/ws').kind).toBe('ask');
    expect(assessCommand(cmd, 'workspace-write', '/tmp/ws', '/tmp/ws').kind).toBe('ask');
  }
  expect(isPathUnderSync('D:\\outside\\a.txt', 'D:\\project')).toBe(false);
  expect(isPathUnderSync('D:\\project\\src\\a.ts', 'D:\\project')).toBe(true);
});
