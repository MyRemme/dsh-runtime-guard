import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ProfileJsonStore } from './profile-file.js';
import { sessionKey } from './metrics.js';
import { satisfiesRange } from './semver.js';
import type { HostContext, PreToolDecision, ToolExecution } from './types.js';

/** Separately verified by scripts/safety-host-probe.mjs; not the loop-monitor matrix. */
export const SAFETY_HOSTS = ['0.2.1-rc.2', '0.2.2-rc.1'] as const;
const SHELL_TOOLS = ['pwsh', 'bash', 'ops_bash', 'exec_command'] as const;
const TERMINAL_TOOLS = ['terminal_open', 'terminal_send'] as const;
const WRITE_TOOLS = ['write', 'edit', 'apply_patch', 'multi_edit', 'str_replace_editor'] as const;
const OPS_WRITE_TOOLS = ['ops_write_file', 'ops_edit_file', 'ops_replace', 'ops_copy', 'ops_move'] as const;
const DELETE_TOOLS = ['delete', 'remove_file', 'delete_file', 'ops_remove'] as const;
const BATCH_TOOLS = ['ops_batch'] as const;
const CODE_TOOLS = ['run_code'] as const;
export const SAFETY_TOOLS: readonly string[] = [
  ...SHELL_TOOLS, ...TERMINAL_TOOLS, ...WRITE_TOOLS, ...OPS_WRITE_TOOLS, ...DELETE_TOOLS, ...BATCH_TOOLS, ...CODE_TOOLS,
];
type Mode = 'read-only' | 'workspace-write' | 'danger-full-access';
interface Policy { mode: Mode; workspaceRoot: string }
type Rule = 'elevation' | 'outside-workspace' | 'read-only-write' | 'read-only-unknown' | 'destructive' | 'opaque-execution'
  | 'invalid-arguments' | 'policy-unavailable' | 'host-unverified' | 'guard-unavailable' | 'settings-invalid'
  | 'check-failed' | 'approval-unavailable' | 'configuration-changed' | 'cancelled';
type Assessment = { kind: 'allow' } | { kind: 'deny' | 'ask'; rule: Rule };
export interface SafetyEvent {
  time: string; session: string; tool: string; mode: Mode | 'unknown';
  action: 'denied' | 'approval-requested' | 'approved' | 'rejected' | 'cancelled'; rule: Rule;
}
export interface SafetyStatus {
  enabled: boolean; guardFullAccessElevation: boolean; state: 'disabled' | 'active' | 'blocked' | 'disposed';
  reason: Rule | null; hostVersion: string; verifiedHosts: readonly string[]; coveredTools: readonly string[];
  persistent: boolean; loggingPersisted: boolean; checked: number; denied: number; approvalRequests: number; approved: number;
  events: SafetyEvent[];
}
interface SafetySettings { enabled: boolean; guardFullAccessElevation: boolean }
export interface OperationSafetyOptions {
  logDir?: string;
  isLoggingEnabled?: () => boolean;
}
interface ApprovalService {
  request(input: { agent: NonNullable<ToolExecution['agent']>; callId: string; toolName: string; reason: string; signal: AbortSignal }): Promise<unknown>;
}
const reasons: Record<Rule, string> = {
  elevation: '禁止通过工具借道系统提权。请由用户在工具之外自行处理管理员操作。',
  'outside-workspace': '目标路径或工作目录超出当前工作区，需要用户在确认弹窗中明确批准本次操作。',
  'read-only-write': '当前为仅查看模式，不能修改文件。需要修改时，请由用户切换为仅工作区修改或完全权限；工具参数不能代替模式切换。',
  'read-only-unknown': '只读模式无法确认此命令仅进行读取，需要用户确认是否执行（建议优先使用宿主读取工具）。',
  destructive: '此调用包含删除、覆盖历史或系统配置修改，需要批准本次具体操作。',
  'opaque-execution': '此调用包含脚本、动态执行或启动其他程序，需要批准本次具体操作。',
  'invalid-arguments': '无法可靠读取本次工具参数。', 'policy-unavailable': '无法读取宿主当前权限模式。',
  'host-unverified': '当前宿主版本尚未通过操作防护验证。', 'guard-unavailable': '宿主未提供可用的执行前硬拦截接口。',
  'settings-invalid': '操作防护设置无法读取，请在面板重新保存设置。', 'check-failed': '操作防护检查异常，已阻止本次调用。',
  'approval-unavailable': '缺少可用的单次审批服务或调用身份。',
  'configuration-changed': '等待审批期间权限或防护设置发生变化，请重新提交调用。', cancelled: '操作已取消。',
};
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const isValidTextArg = (value: unknown, max = 4096): value is string =>
  typeof value === 'string' && !!value.trim() && !value.includes('\0') && value.length <= max;
const stripExtendedPrefix = (value: string): string => value.replace(/^\\\\\?\\([A-Za-z]:\\)/, '$1');
const foldPath = (value: string): string => {
  const normalized = stripExtendedPrefix(resolve(value));
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
};

/** Shared pattern for unresolved home/env/UNC/file-URI/drive-relative paths. */
const SPECIAL_PATH_PREFIX_RE = /^(?:~(?:$|[/\\])|%[^%]+%|\\{2}|\/\/|file:|\$(?:env:|home\b|\{|[A-Za-z_][A-Za-z0-9_]*))/i;
const SENSITIVE_PS_DRIVE_RE = /\b(?:env|cert|hkcu|hklm|registry|variable|function|alias):/i;
const INLINE_DESTRUCTIVE_RE = /\b(?:rm|rmSync|rmdir|rmdirSync|unlink|unlinkSync|rmtree)\s*\(/;

const READ_PS_CMDS = 'get-content|get-item|get-childitem|get-location|get-filehash|get-process|test-path|select-string|select-object|measure-object|compare-object|write-output|write-host|echo|pwd';
const NESTED_SHELL_WORDS = 'invoke-expression|iex|start-process|saps|cmd(?:\\.exe)?|powershell(?:\\.exe)?|pwsh(?:\\.exe)?|bash|sh|wscript(?:\\.exe)?|cscript(?:\\.exe)?|mshta(?:\\.exe)?';
const wordPattern = (words: string) => new RegExp(`(?:^|[\\s;&|({"'])(?:${words})(?=$|[\\s;|&)}"'])`, 'i');
const DESTRUCTIVE_CMD_RE = wordPattern('remove-item|ri|rm|del|erase|rmdir|rd|unlink|clear-content|format(?:\\.com)?|diskpart|bcdedit|takeown|icacls');
const MODIFIES_CMD_RE = wordPattern('set-content|add-content|out-file|new-item|ni|copy-item|cp|copy|move-item|mv|move|rename-item|ren|mkdir|md|touch|tee|set-item|set-itemproperty|remove-itemproperty|new-itemproperty|clear-itemproperty|set-acl|set-service|stop-service|restart-service|set-ciminstance|invoke-cimmethod');
const DEV_NESTED_SHELL_RE = wordPattern(NESTED_SHELL_WORDS);
const OPAQUE_CMD_RE = wordPattern(`${NESTED_SHELL_WORDS}|python(?:3|\\.exe)?|node(?:\\.exe)?`);
const READ_PIPE_RE = new RegExp(`^(?:${READ_PS_CMDS}|ls|cat|head|tail|stat|wc|rg|grep)(?:\\s|$)`, 'i');
const STRICT_READ_RE = /^(?:get-content|get-item|get-childitem|get-location|get-filehash|test-path|select-string|pwd)(?:\s|$)/i;
const ORDINARY_PS_RE = new RegExp(`^(?:${READ_PS_CMDS}|set-content|add-content|out-file|new-item|copy-item|move-item|rename-item)(?:\\s|$)`, 'i');

function hasElevationPattern(raw: string): boolean {
  const text = raw.replace(/`\r?\n/g, '').replace(/[`^]/g, '').toLowerCase();
  return /\brunas(?:\.exe)?\b|\bshellexecute\b|elevation:administrator/.test(text)
    || /\b(?:start-process|saps|start)\b[\s\S]*?-(?:v|ve|ver|verb)\s+['"]?runas\b/.test(text)
    || /\bschtasks(?:\.exe)?\b[\s\S]*?\/(?:create|change)\b/.test(text)
    || /\bsc(?:\.exe)?\s+(?:create|config)\b/.test(text)
    || /\bwmic(?:\.exe)?\s+process\s+call\s+create\b/.test(text)
    || /\bnet(?:\.exe)?\s+localgroup\s+administrators\b/.test(text);
}

function isInlineInterpreter(command: string): boolean {
  const m = /^(python(?:3|\.exe)?|py|node(?:\.exe)?|bun)\s+([\s\S]+)$/i.exec(command.trim());
  if (!m) return false;
  const bin = m[1]!.toLowerCase();
  const isPy = bin.startsWith('py');
  const rest = m[2]!.trimStart();
  let i = 0;
  while (i < rest.length) {
    while (i < rest.length && /\s/.test(rest[i]!)) i++;
    if (i >= rest.length || rest[i] !== '-') break;
    const start = i;
    while (i < rest.length && !/\s/.test(rest[i]!)) i++;
    const flag = rest.slice(start, i);
    if (flag === '--') break;
    if (isPy) {
      if (/^-c[\s\S]*/i.test(flag)) return true;
      if ((flag === '-W' || flag === '-X') && i < rest.length) {
        while (i < rest.length && /\s/.test(rest[i]!)) i++;
        while (i < rest.length && !/\s/.test(rest[i]!)) i++;
      }
    } else {
      if (/^-(?:e|-eval(?:=|$)|p|-print(?:=|$)|[ep]{2})/i.test(flag)) return true;
      if ((flag === '-r' || flag === '--require' || flag === '--import') && i < rest.length) {
        while (i < rest.length && /\s/.test(rest[i]!)) i++;
        while (i < rest.length && !/\s/.test(rest[i]!)) i++;
      }
    }
  }
  return false;
}

function assessWorkspaceScriptFile(filePath: string, elevationOnly = false): Assessment {
  let st;
  try { st = statSync(filePath); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'allow' };
    return elevationOnly ? { kind: 'allow' } : { kind: 'ask', rule: 'opaque-execution' };
  }
  if (!st.isFile() || st.size > 65536) return elevationOnly ? { kind: 'allow' } : { kind: 'ask', rule: 'opaque-execution' };
  let content: string;
  try { content = readFileSync(filePath, 'utf8'); }
  catch { return elevationOnly ? { kind: 'allow' } : { kind: 'ask', rule: 'opaque-execution' }; }
  if (hasElevationPattern(content)) return { kind: 'deny', rule: 'elevation' };
  if (elevationOnly) return { kind: 'allow' };
  const lowered = content.toLowerCase();
  if (DESTRUCTIVE_CMD_RE.test(lowered) || /\breg(?:\.exe)?\s+(?:add|delete|import|restore)\b/.test(lowered)
    || INLINE_DESTRUCTIVE_RE.test(content)) {
    return { kind: 'ask', rule: 'destructive' };
  }
  return { kind: 'allow' };
}

/** Resolve symlinks/junctions when present, or the deepest existing ancestor for new paths. */
function canonicalizeSync(target: string): string {
  const resolved = resolve(target);
  const missing: string[] = [];
  let probe = resolved;
  while (true) {
    try {
      return join(stripExtendedPrefix(realpathSync(probe)), ...missing);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') return resolved;
      const parent = dirname(probe);
      if (parent === probe) return resolved;
      const base = probe.slice(parent.length).replace(/^[/\\]+/, '');
      if (base) missing.unshift(base);
      probe = parent;
    }
  }
}

const isRelativeInside = (rel: string): boolean =>
  rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel));

export function isPathUnderSync(targetPath: string, workspaceRoot: string, baseDir: string = workspaceRoot): boolean {
  if (!targetPath || targetPath.includes('\0') || workspaceRoot.includes('\0')) return false;
  if (SPECIAL_PATH_PREFIX_RE.test(targetPath) || /^[A-Za-z]:(?![/\\])/.test(targetPath)) return false;
  const winContext = process.platform === 'win32' || /^[A-Za-z]:[/\\]/.test(workspaceRoot);
  if (winContext && (targetPath.startsWith('/') || targetPath.replace(/^[A-Za-z]:/, '').includes(':'))) return false;
  const resolvedBase = canonicalizeSync(resolve(workspaceRoot, baseDir));
  const canonRoot = foldPath(canonicalizeSync(workspaceRoot));
  const canonTarget = foldPath(canonicalizeSync(resolve(resolvedBase, targetPath)));
  return isRelativeInside(relative(canonRoot, canonTarget));
}

function splitUnquotedPipes(command: string): string[] {
  const parts: string[] = [];
  let current = '', quote = '';
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = '';
      current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (char === '|') {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts;
}

function hasExpandableDollar(command: string): boolean {
  let quote = '';
  for (const char of command) {
    if (quote === "'") { if (char === "'") quote = ''; }
    else if (quote === '"') { if (char === '"') quote = ''; else if (char === '$') return true; }
    else if (char === '"' || char === "'") quote = char;
    else if (char === '$') return true;
  }
  return false;
}

function extractShellPathTokens(command: string): string[] {
  const tokens: string[] = [];
  const rawTokens: string[] = [];
  let token = '', quote = '';
  const flush = () => { if (token) rawTokens.push(token); token = ''; };
  for (const char of command) {
    if (quote) { if (char === quote) quote = ''; else token += char; }
    else if (char === '"' || char === "'") quote = char;
    else if (/\s|[><;|&]/.test(char)) flush();
    else token += char;
  }
  flush();
  for (const entry of rawTokens) {
    let cleaned = entry.replace(/[,;]+$/, '');
    if (!cleaned || /^https?:\/\//i.test(cleaned)) continue;
    const boundPath = /^(?:--?[A-Za-z][A-Za-z0-9_-]*[:=]|[A-Za-z_][A-Za-z0-9_]*=)(.+)$/.exec(cleaned);
    if (boundPath) cleaned = boundPath[1]!.replace(/^['"]|['"]$/g, '');
    if (/^-[A-Za-z]/.test(cleaned)) continue;
    const looksLikePath = SPECIAL_PATH_PREFIX_RE.test(cleaned)
      || /^(?:[A-Za-z]:|\.\.(?:[/\\]|$)|\.[/\\])/i.test(cleaned)
      || (cleaned.startsWith('/') && cleaned.length > 1 && !/^\/[A-Za-z0-9]{1,8}$/.test(cleaned))
      || /\.[A-Za-z0-9]{1,12}:[^\s\\/:]/.test(cleaned)
      || (!/\s/.test(cleaned) && /[/\\]/.test(cleaned));
    if (looksLikePath) tokens.push(cleaned);
  }
  return tokens;
}

function resolveWorkdir(args: Record<string, unknown>, workspaceRoot: string): { ok: true; workdir: string } | { ok: false; rule: 'invalid-arguments' | 'outside-workspace' } {
  const supplied = ['workdir', 'cwd'].filter(key => Object.hasOwn(args, key));
  if (supplied.length > 1) return { ok: false, rule: 'invalid-arguments' };
  if (supplied.length === 0 || args[supplied[0]!] === undefined) return { ok: true, workdir: workspaceRoot };
  const raw = args[supplied[0]!];
  if (!isValidTextArg(raw)) return { ok: false, rule: 'invalid-arguments' };
  const target = raw.trim();
  if (!isPathUnderSync(target, workspaceRoot)) return { ok: false, rule: 'outside-workspace' };
  return { ok: true, workdir: resolve(workspaceRoot, target) };
}

function extractPatchInfo(patch: string): { paths: string[]; destructive: boolean } {
  const paths: string[] = [];
  let destructive = false;
  for (const match of patch.matchAll(/^[^\S\r\n]*\*\*\* (?:(Add File|Update File)|(Delete File|Move to)):[ \t]*(.+)$/gm)) {
    if (match[2]) destructive = true;
    const target = match[3]?.trim();
    if (target) paths.push(target);
  }
  for (const match of patch.matchAll(/^(?:\+\+\+|---)[ \t]+(?:[ab]\/)?([^\t\r\n]+)$/gm)) {
    const target = match[1]?.trim();
    if (target === '/dev/null') {
      if (match[0].startsWith('+++')) destructive = true;
    } else if (target) paths.push(target);
  }
  for (const match of patch.matchAll(/^(?:rename|copy) (?:from|to)[ \t]+([^\r\n]+)$/gm)) {
    const target = match[1]?.trim();
    if (target) paths.push(target);
  }
  return { paths, destructive };
}

function extractWritePaths(name: string, args: Record<string, unknown>): { ok: true; paths: string[]; destructive: boolean } | { ok: false } {
  const paths: string[] = [];
  let destructive = false;
  const collectField = (record: Record<string, unknown>, keys: readonly string[]): boolean => {
    for (const key of keys) {
      if (!Object.hasOwn(record, key) || record[key] === undefined) continue;
      const value = record[key];
      if (!isValidTextArg(value)) return false;
      paths.push(value.trim());
    }
    return true;
  };
  if (name === 'apply_patch') {
    for (const key of ['patch', 'input', 'diff'] as const) {
      if (Object.hasOwn(args, key) && args[key] !== undefined && typeof args[key] !== 'string') return { ok: false };
    }
    for (const value of Object.values(args)) {
      if (typeof value === 'string') {
        const info = extractPatchInfo(value);
        paths.push(...info.paths);
        if (info.destructive) destructive = true;
      }
    }
    return { ok: true, paths, destructive };
  }
  const pathKeys = ['path', 'filePath', 'file_path', 'target', 'target_file', 'destination', 'dest', 'to', 'source', 'src'] as const;
  if (!collectField(args, pathKeys)) return { ok: false };
  if (name === 'multi_edit' && Object.hasOwn(args, 'edits') && args.edits !== undefined) {
    if (!Array.isArray(args.edits)) return { ok: false };
    for (const entry of args.edits) {
      if (!isRecord(entry) || !collectField(entry, ['path', 'filePath', 'file_path', 'target', 'target_file'])) return { ok: false };
    }
  }
  return { ok: true, paths, destructive };
}

function assessOpsFile(name: string, args: Record<string, unknown>, policy: Policy): Assessment {
  if (Object.hasOwn(args, 'dryRun') && args.dryRun !== undefined && typeof args.dryRun !== 'boolean') {
    return { kind: 'deny', rule: 'invalid-arguments' };
  }
  const dir = resolveWorkdir(args, policy.workspaceRoot);
  if (!dir.ok && dir.rule === 'invalid-arguments') return { kind: 'deny', rule: 'invalid-arguments' };
  const baseDir = dir.ok ? dir.workdir : policy.workspaceRoot;
  const paths: string[] = [];
  if (name === 'ops_replace') {
    if (Object.hasOwn(args, 'path') && args.path !== undefined) {
      if (!isValidTextArg(args.path)) return { kind: 'deny', rule: 'invalid-arguments' };
      paths.push(args.path.trim());
    } else {
      paths.push('.');
    }
    if (Object.hasOwn(args, 'glob') && args.glob !== undefined) {
      if (!Array.isArray(args.glob) || args.glob.some(entry => typeof entry !== 'string' || entry.includes('\0'))) {
        return { kind: 'deny', rule: 'invalid-arguments' };
      }
      for (const pattern of args.glob as string[]) {
        const clean = pattern.replace(/^!/, '');
        if (!clean || /(?:^|[/\\])\.\.(?:$|[/\\])/.test(clean) || isAbsolute(clean) || /^[A-Za-z]:/.test(clean)) {
          return { kind: 'ask', rule: 'outside-workspace' };
        }
      }
    }
  } else {
    if (!isValidTextArg(args.path)) return { kind: 'deny', rule: 'invalid-arguments' };
    paths.push(args.path.trim());
    if (name === 'ops_copy' || name === 'ops_move') {
      if (!isValidTextArg(args.to)) return { kind: 'deny', rule: 'invalid-arguments' };
      paths.push(args.to.trim());
    }
  }
  if (policy.mode === 'read-only') return { kind: 'deny', rule: 'read-only-write' };
  if (name === 'ops_remove') return { kind: 'ask', rule: 'destructive' };
  if (!dir.ok || paths.some(p => !isPathUnderSync(p, policy.workspaceRoot, baseDir))) return { kind: 'ask', rule: 'outside-workspace' };
  return { kind: 'allow' };
}

function assessOpsBatch(args: Record<string, unknown>, policy: Policy): Assessment {
  if (typeof args.action !== 'string' || !['plan', 'run', 'resume'].includes(args.action)) return { kind: 'deny', rule: 'invalid-arguments' };
  const action = args.action;
  let effectiveRoot = policy.workspaceRoot;
  let rootOutside = false;
  if (Object.hasOwn(args, 'root') && args.root !== undefined) {
    if (!isValidTextArg(args.root)) return { kind: 'deny', rule: 'invalid-arguments' };
    effectiveRoot = args.root.trim();
    if (!isPathUnderSync(effectiveRoot, policy.workspaceRoot)) rootOutside = true;
  }
  if (Object.hasOwn(args, 'operationsRef') && args.operationsRef !== undefined && !isValidTextArg(args.operationsRef)) {
    return { kind: 'deny', rule: 'invalid-arguments' };
  }
  if (Object.hasOwn(args, 'protect') && args.protect !== undefined) {
    if (!Array.isArray(args.protect) || args.protect.some(item => typeof item !== 'string' || item.includes('\0'))) {
      return { kind: 'deny', rule: 'invalid-arguments' };
    }
  }
  let hasRemove = false;
  let pathOutside = false;
  if (Object.hasOwn(args, 'operations') && args.operations !== undefined) {
    if (!Array.isArray(args.operations)) return { kind: 'deny', rule: 'invalid-arguments' };
    for (const item of args.operations) {
      if (!isRecord(item) || typeof item.op !== 'string' || !['copy', 'move', 'remove'].includes(item.op)
        || !isValidTextArg(item.path)
        || (Object.hasOwn(item, 'to') && item.to !== undefined && !isValidTextArg(item.to))) {
        return { kind: 'deny', rule: 'invalid-arguments' };
      }
      if (item.op === 'remove') hasRemove = true;
      if (!rootOutside) {
        if (!isPathUnderSync(item.path.trim(), policy.workspaceRoot, effectiveRoot)) pathOutside = true;
        if (typeof item.to === 'string' && !isPathUnderSync(item.to.trim(), policy.workspaceRoot, effectiveRoot)) pathOutside = true;
      }
    }
  }
  if (policy.mode === 'read-only') {
    if (action !== 'plan') return { kind: 'deny', rule: 'read-only-write' };
    return rootOutside || pathOutside ? { kind: 'ask', rule: 'outside-workspace' } : { kind: 'ask', rule: 'read-only-unknown' };
  }
  if (rootOutside || pathOutside) return { kind: 'ask', rule: 'outside-workspace' };
  if (action !== 'plan') {
    if (hasRemove) return { kind: 'ask', rule: 'destructive' };
    if (action === 'resume' || (Object.hasOwn(args, 'operationsRef') && args.operationsRef !== undefined)) {
      return { kind: 'ask', rule: 'opaque-execution' };
    }
  }
  return { kind: 'allow' };
}

function assessRunCode(args: Record<string, unknown>, policy: Policy): Assessment {
  const rawCode = Object.hasOwn(args, 'code') ? args.code : Object.hasOwn(args, 'script') ? args.script : undefined;
  if (!isValidTextArg(rawCode, 131072)) return { kind: 'deny', rule: 'invalid-arguments' };
  const dir = resolveWorkdir(args, policy.workspaceRoot);
  if (!dir.ok && dir.rule === 'invalid-arguments') return { kind: 'deny', rule: 'invalid-arguments' };
  if (hasElevationPattern(rawCode)) return { kind: 'deny', rule: 'elevation' };
  const destructive = INLINE_DESTRUCTIVE_RE.test(rawCode)
    || /\btools\s*\.\s*(?:ops_remove|delete|remove_file|delete_file)\b/.test(rawCode);
  const directMutate = destructive
    || /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rename|renameSync|copyFile|copyFileSync|chmod|chmodSync|chown|chownSync|truncate|truncateSync)\s*\(/.test(rawCode)
    || /\btools\s*\.\s*(?:pwsh|bash|ops_bash|exec_command|terminal_open|terminal_send|write|edit|apply_patch|multi_edit|str_replace_editor|ops_write_file|ops_edit_file|ops_replace|ops_copy|ops_move|ops_batch)\b/.test(rawCode);
  const directHostAccess = /\b(?:import\s*\(|require\s*\(|eval\s*\(|Function\s*\(|process\s*(?:\.|\[)|constructor\s*\.\s*constructor|Deno\.(?:write|remove|run|Command)|Bun\.write|from\s+(?:os|sys|subprocess|shutil|pathlib)\s+import|import\s+(?:os|sys|subprocess|shutil|pathlib)\b|(?:node:)?(?:fs(?:\/promises)?|child_process|worker_threads|vm|inspector)\b|(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\()/.test(rawCode);
  if (policy.mode === 'read-only') {
    if (directMutate) return { kind: 'deny', rule: 'read-only-write' };
    return !dir.ok ? { kind: 'ask', rule: 'outside-workspace' } : { kind: 'ask', rule: 'read-only-unknown' };
  }
  if (!dir.ok) return { kind: 'ask', rule: 'outside-workspace' };
  if (destructive) return { kind: 'ask', rule: 'destructive' };
  if (directHostAccess) return { kind: 'ask', rule: 'opaque-execution' };
  return { kind: 'allow' };
}

/** Conservative recognition, not a shell parser or an OS sandbox. Inspect nested literal payloads too. */
export function assessCommand(command: string, mode: Mode, workdir?: string, workspaceRoot?: string): Assessment {
  if (!isValidTextArg(command, 65536)) return { kind: 'deny', rule: 'invalid-arguments' };
  if (mode === 'danger-full-access') return { kind: 'allow' };
  if (hasElevationPattern(command)) return { kind: 'deny', rule: 'elevation' };
  const text = command.replace(/`\r?\n/g, '').replace(/[`^]/g, '').toLowerCase();
  const destructive = DESTRUCTIVE_CMD_RE.test(text)
    || /\breg(?:\.exe)?\s+(?:add|delete|import|restore)\b|\bgit\s+(?:reset\b[^\r\n]*--hard|clean\b|push\b[^\r\n]*--force)/.test(text);
  const modifies = destructive || MODIFIES_CMD_RE.test(text)
    || /(?:^|[^<])>{1,2}|\bgit\s+(?:add|commit|checkout|switch|restore|merge|rebase|cherry-pick|revert|stash|pull|fetch|config)\b|\bgit\s+[\s\S]*--output(?:=|\s)/.test(text);
  const literalRead = !modifies && !/[`$;&<>(){}\r\n]/.test(command) && !SENSITIVE_PS_DRIVE_RE.test(command)
    && !/--(?:pre|ext-diff|textconv|output)\b/i.test(command)
    && splitUnquotedPipes(command).every(part => READ_PIPE_RE.test(part.trim()) || /^git\s+(?:status|diff|log|show|ls-files|ls-tree|rev-parse)(?:\s|$)/i.test(part.trim()));
  if (literalRead) return { kind: 'allow' };
  const outside = workspaceRoot
    ? ((workdir && !isPathUnderSync(workdir, workspaceRoot))
      || extractShellPathTokens(command).some(token => !isPathUnderSync(token, workspaceRoot, workdir ?? workspaceRoot)))
    : false;
  if (mode === 'read-only') {
    if (modifies) return { kind: 'deny', rule: 'read-only-write' };
    if (outside) return { kind: 'ask', rule: 'outside-workspace' };
    return STRICT_READ_RE.test(command.trim()) && !/[`$;&|<>{}\r\n]/.test(command) && !SENSITIVE_PS_DRIVE_RE.test(command)
      ? { kind: 'allow' } : { kind: 'ask', rule: 'read-only-unknown' };
  }
  if (destructive) return { kind: 'ask', rule: 'destructive' };
  if (outside) return { kind: 'ask', rule: 'outside-workspace' };
  if (isInlineInterpreter(command)) {
    return INLINE_DESTRUCTIVE_RE.test(command) ? { kind: 'ask', rule: 'destructive' } : { kind: 'ask', rule: 'opaque-execution' };
  }
  // Mask literal strings that cannot invoke subshells while keeping double-quoted $() expansions visible.
  const unquoted = command.replace(/'[^']*'|"([^"]*)"/g, (whole, dbl: string | undefined) => (dbl?.includes('$') ? whole : ' '));
  const development = /^(?:npm(?:\.cmd)?|pnpm(?:\.cmd)?|npx(?:\.cmd)?|yarn(?:\.cmd)?|bun|node(?:\.exe)?|python(?:3|\.exe)?|py|pytest|tsc|vitest|jest|go|cargo|dotnet|cmake|make|git)(?:\s|$)/i.test(command.trim());
  if (development && !/[;&|`\r\n]/.test(command) && !/\$\(|[<>]\(/.test(command) && !hasExpandableDollar(command)
    && !DEV_NESTED_SHELL_RE.test(unquoted)
    && !/-(?:encodedcommand|enc|ec)\b|frombase64string|shell\.application/.test(unquoted)) return { kind: 'allow' };
  if (OPAQUE_CMD_RE.test(text)
    || /-(?:encodedcommand|enc|ec|e)\b|frombase64string|shell\.application|(?:^|[\s;])(?:&|\.)\s|\$\(|\.(?:ps1|bat|cmd|vbs|js|py)(?:\s|['"]|$)/.test(text)) return { kind: 'ask', rule: 'opaque-execution' };
  return ORDINARY_PS_RE.test(command.trim()) && !/[;&|`(){}\r\n]/.test(command) && !hasExpandableDollar(command)
    && !SENSITIVE_PS_DRIVE_RE.test(command) && !/\.(?:ps1|bat|cmd|exe)\b/i.test(command)
    ? { kind: 'allow' } : { kind: 'ask', rule: 'opaque-execution' };
}

const SAFETY_MODES = new Set<SafetyEvent['mode']>(['read-only', 'workspace-write', 'danger-full-access', 'unknown']);
const SAFETY_ACTIONS = new Set<SafetyEvent['action']>(['denied', 'approval-requested', 'approved', 'rejected', 'cancelled']);
const SAFETY_RULES = new Set<Rule>(Object.keys(reasons) as Rule[]);
const isCount = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const isStamp = (v: unknown): v is string => typeof v === 'string' && v.length <= 32 && Number.isFinite(Date.parse(v));
const isSessionHash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{16}$/.test(v);

function parseSafetyEvent(raw: unknown): SafetyEvent | undefined {
  if (!isRecord(raw) || !isStamp(raw.time) || !isSessionHash(raw.session)
    || typeof raw.tool !== 'string' || !/^[a-z0-9_:-]{1,64}$/i.test(raw.tool)
    || !SAFETY_MODES.has(raw.mode as SafetyEvent['mode'])
    || !SAFETY_ACTIONS.has(raw.action as SafetyEvent['action'])
    || !SAFETY_RULES.has(raw.rule as Rule)) return undefined;
  return { time: raw.time, session: raw.session, tool: raw.tool,
    mode: raw.mode as SafetyEvent['mode'], action: raw.action as SafetyEvent['action'], rule: raw.rule as Rule };
}

export class OperationSafety {
  private readonly store: ProfileJsonStore<SafetySettings>;
  private readonly historyStore: ProfileJsonStore<unknown> | undefined;
  private readonly isLoggingEnabled: () => boolean;
  private disposed = false;
  private registered = false;
  private revision = 0;
  private readonly shutdown = new AbortController();
  private readonly grants = new WeakMap<ToolExecution, { key: string; revision: number }>();
  private readonly decisions = new WeakSet<ToolExecution>();
  private readonly events: SafetyEvent[] = [];
  private checked = 0; private denied = 0; private approvalRequests = 0; private approved = 0;
  private historyDirty = false;
  private historyTimer: ReturnType<typeof setTimeout> | undefined;
  private historySaving: Promise<void> | undefined;
  private unregister: (() => void) | undefined;
  constructor(
    private readonly ctx: HostContext,
    enabled: boolean,
    private readonly hostVersion: string,
    profileDir?: string,
    options: OperationSafetyOptions = {},
  ) {
    this.isLoggingEnabled = options.isLoggingEnabled ?? (() => false);
    this.store = new ProfileJsonStore<SafetySettings>({
      directory: profileDir,
      subpath: ['operation-safety.json'],
      defaultValue: { enabled, guardFullAccessElevation: false },
      parse: raw => {
        if (!isRecord(raw) || typeof raw.enabled !== 'boolean') return undefined;
        if (Object.hasOwn(raw, 'guardFullAccessElevation') && raw.guardFullAccessElevation !== undefined && typeof raw.guardFullAccessElevation !== 'boolean') {
          return undefined;
        }
        return { enabled: raw.enabled, guardFullAccessElevation: raw.guardFullAccessElevation === true };
      },
      serialize: value => JSON.stringify(
        value.guardFullAccessElevation
          ? { enabled: value.enabled, guardFullAccessElevation: true }
          : { enabled: value.enabled },
        null, 2,
      ) + '\n',
      onLoadError: () => ({ enabled: true, guardFullAccessElevation: false }),
      disposedMessage: 'operation safety disposed',
    });
    if (options.logDir) {
      const historyFile = join(options.logDir, 'safety-history.json');
      this.historyStore = new ProfileJsonStore<unknown>({
        file: historyFile,
        defaultValue: null,
        parse: raw => raw,
        serialize: value => JSON.stringify(value) + '\n',
      });
      this.restoreHistory(historyFile);
    }
    try {
      const tools = (ctx.get?.('tools', false) ?? ctx.tools) as HostContext['tools'];
      if (typeof tools?.guard === 'function') {
        this.unregister = tools.guard(exec => this.guard(exec));
        this.registered = typeof this.unregister === 'function';
      }
    } catch { /* The pre-execute gate still denies covered calls when enabled. */ }
    ctx.on('tools/pre-execute', (exec: ToolExecution, next: () => Promise<PreToolDecision>) => this.before(exec, next));
    ctx.effect(() => () => this.close(), 'runtime-guard: operation safety');
  }
  private restoreHistory(file: string): void {
    try {
      if (statSync(file).size > 524_288) return;
      const data: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (!isRecord(data) || data.schemaVersion !== 1 || !isCount(data.checked) || !isCount(data.denied)
        || !isCount(data.approvalRequests) || !isCount(data.approved) || !Array.isArray(data.events)) return;
      this.checked = data.checked;
      this.denied = data.denied;
      this.approvalRequests = data.approvalRequests;
      this.approved = data.approved;
      for (const item of data.events.slice(0, 100)) {
        const parsed = parseSafetyEvent(item);
        if (parsed) this.events.push(parsed);
      }
    } catch { /* Missing or corrupt history never blocks safety checks. */ }
  }
  private scheduleHistorySave(): void {
    this.historyDirty = true;
    if (this.disposed || !this.historyStore || !this.isLoggingEnabled() || this.historyTimer) return;
    this.historyTimer = setTimeout(() => { this.historyTimer = undefined; void this.flushHistory(); }, 250);
    this.historyTimer.unref?.();
  }
  async flushHistory(allowDisposed = false): Promise<void> {
    if (this.historySaving) {
      await this.historySaving;
      if (this.historyDirty && (!this.disposed || allowDisposed) && this.isLoggingEnabled()) return this.flushHistory(allowDisposed);
      return;
    }
    if (!this.historyDirty || !this.historyStore || !this.isLoggingEnabled() || (this.disposed && !allowDisposed)) return;
    this.historyDirty = false;
    const payload = {
      schemaVersion: 1,
      checked: this.checked,
      denied: this.denied,
      approvalRequests: this.approvalRequests,
      approved: this.approved,
      events: this.events.slice(0, 100),
    };
    this.historySaving = this.historyStore.update(payload, { afterWrite: () => {} }).catch(() => {});
    await this.historySaving;
    this.historySaving = undefined;
    if (this.historyDirty && (!this.disposed || allowDisposed) && this.isLoggingEnabled()) await this.flushHistory(allowDisposed);
  }
  async syncLogging(enabled: boolean): Promise<void> {
    if (!enabled) {
      if (this.historyTimer) { clearTimeout(this.historyTimer); this.historyTimer = undefined; }
      await this.historySaving;
      return;
    }
    if (this.checked > 0 || this.events.length > 0) this.historyDirty = true;
    await this.flushHistory();
  }
  private service(name: string): unknown { return this.ctx.get?.(name, false); }
  private capabilityReason(): Rule | null {
    if (this.store.loadError) return 'settings-invalid';
    const hostSupported = SAFETY_HOSTS.some(version => version === this.hostVersion)
      || satisfiesRange(this.hostVersion, '>=0.2.1-rc.2 <0.2.3-0 || >=0.2.2-0 <0.2.3-0');
    if (!hostSupported) return 'host-unverified';
    if (!this.registered) return 'guard-unavailable';
    try {
      if (typeof (this.service('sandboxPolicy') as { resolve?: unknown } | undefined)?.resolve !== 'function') return 'policy-unavailable';
    } catch { return 'policy-unavailable'; }
    return null;
  }
  private policy(exec: ToolExecution): Policy {
    const service = this.service('sandboxPolicy') as { resolve(input: { session?: NonNullable<ToolExecution['agent']>['session'] }): unknown } | undefined;
    const policy = service?.resolve(exec.agent?.session ? { session: exec.agent.session } : {});
    if (!isRecord(policy) || !['read-only', 'workspace-write', 'danger-full-access'].includes(policy.mode as string)
      || typeof policy.workspaceRoot !== 'string' || !policy.workspaceRoot.trim()) throw new Error('policy-unavailable');
    return policy as unknown as Policy;
  }
  private assessElevationOnly(exec: ToolExecution, policy: Policy): Assessment {
    if (!isRecord(exec.arguments)) return { kind: 'allow' };
    const args = exec.arguments;
    if ((SHELL_TOOLS as readonly string[]).includes(exec.name)) {
      if (exec.name === 'ops_bash' && isValidTextArg(args.script_path)) {
        const base = isValidTextArg(args.workdir) ? args.workdir.trim() : isValidTextArg(args.cwd) ? args.cwd.trim() : policy.workspaceRoot;
        return assessWorkspaceScriptFile(resolve(policy.workspaceRoot, base, args.script_path.trim()), true);
      }
      for (const key of ['command', 'cmd', 'script', 'code'] as const) {
        if (typeof args[key] === 'string' && hasElevationPattern(args[key] as string)) return { kind: 'deny', rule: 'elevation' };
      }
      return { kind: 'allow' };
    }
    if (exec.name === 'terminal_open') {
      return typeof args.command === 'string' && hasElevationPattern(args.command) ? { kind: 'deny', rule: 'elevation' } : { kind: 'allow' };
    }
    if (exec.name === 'terminal_send') {
      for (const key of ['input', 'text', 'data', 'chars', 'command', 'cmd'] as const) {
        if (typeof args[key] === 'string' && hasElevationPattern(args[key] as string)) return { kind: 'deny', rule: 'elevation' };
      }
      return { kind: 'allow' };
    }
    if ((CODE_TOOLS as readonly string[]).includes(exec.name)) {
      const code = typeof args.code === 'string' ? args.code : typeof args.script === 'string' ? args.script : '';
      return code && hasElevationPattern(code) ? { kind: 'deny', rule: 'elevation' } : { kind: 'allow' };
    }
    return { kind: 'allow' };
  }
  private assessment(exec: ToolExecution, policy: Policy): Assessment {
    if (policy.mode === 'danger-full-access') {
      return this.store.value.guardFullAccessElevation ? this.assessElevationOnly(exec, policy) : { kind: 'allow' };
    }
    if (!isRecord(exec.arguments)) return { kind: 'deny', rule: 'invalid-arguments' };
    const args = exec.arguments;
    if ((SHELL_TOOLS as readonly string[]).includes(exec.name)) {
      const dir = resolveWorkdir(args, policy.workspaceRoot);
      const supplied = ['command', 'cmd', 'script', 'code'].filter(key => Object.hasOwn(args, key));
      if (exec.name === 'ops_bash' && Object.hasOwn(args, 'script_path')) {
        if (supplied.length || !isValidTextArg(args.script_path) || (!dir.ok && dir.rule === 'invalid-arguments')) return { kind: 'deny', rule: 'invalid-arguments' };
        if (policy.mode === 'read-only') {
          if (dir.ok && isPathUnderSync(args.script_path, policy.workspaceRoot, dir.workdir)) {
            const elev = assessWorkspaceScriptFile(resolve(dir.workdir, args.script_path.trim()), true);
            if (elev.kind === 'deny') return elev;
          }
          return { kind: 'ask', rule: 'read-only-unknown' };
        }
        if (!dir.ok || !isPathUnderSync(args.script_path, policy.workspaceRoot, dir.workdir)) return { kind: 'ask', rule: 'outside-workspace' };
        return assessWorkspaceScriptFile(resolve(dir.workdir, args.script_path.trim()));
      }
      if (supplied.length !== 1 || typeof args[supplied[0]!] !== 'string') return { kind: 'deny', rule: 'invalid-arguments' };
      const command = args[supplied[0]!] as string;
      if (!dir.ok && dir.rule === 'invalid-arguments') return { kind: 'deny', rule: 'invalid-arguments' };
      const workdir = dir.ok ? dir.workdir : (args.workdir ?? args.cwd) as string;
      return assessCommand(command, policy.mode, workdir, policy.workspaceRoot);
    }
    if (exec.name === 'terminal_open') {
      const dir = resolveWorkdir(args, policy.workspaceRoot);
      if (!dir.ok && dir.rule === 'invalid-arguments') return { kind: 'deny', rule: 'invalid-arguments' };
      if (Object.hasOwn(args, 'command') && args.command !== undefined) {
        if (typeof args.command !== 'string') return { kind: 'deny', rule: 'invalid-arguments' };
        const cmdResult = assessCommand(args.command, policy.mode, dir.ok ? dir.workdir : (args.workdir ?? args.cwd) as string, policy.workspaceRoot);
        if (cmdResult.kind !== 'allow') return cmdResult;
      }
      for (const key of ['type', 'shell'] as const) {
        if (Object.hasOwn(args, key) && args[key] !== undefined) {
          if (!isValidTextArg(args[key])) return { kind: 'deny', rule: 'invalid-arguments' };
          if (!/^(?:pwsh|powershell|bash|sh|cmd)(?:\.exe)?$/i.test(args[key].trim())) return { kind: 'ask', rule: 'opaque-execution' };
        }
      }
      if (policy.mode === 'read-only') return { kind: 'ask', rule: 'read-only-unknown' };
      if (!dir.ok) return { kind: 'ask', rule: 'outside-workspace' };
      return { kind: 'allow' };
    }
    if (exec.name === 'terminal_send') {
      const dir = resolveWorkdir(args, policy.workspaceRoot);
      if (!dir.ok && dir.rule === 'invalid-arguments') return { kind: 'deny', rule: 'invalid-arguments' };
      const supplied = ['input', 'text', 'data', 'chars', 'command', 'cmd'].filter(key => Object.hasOwn(args, key));
      if (supplied.length !== 1 || typeof args[supplied[0]!] !== 'string') return { kind: 'deny', rule: 'invalid-arguments' };
      const payload = args[supplied[0]!] as string;
      if (payload.length > 65536 || payload.includes('\0')) return { kind: 'deny', rule: 'invalid-arguments' };
      if (args.submit === false && /^[\x03\x04\x1a\x1b]$/.test(payload)) return { kind: 'allow' };
      const workdir = dir.ok ? dir.workdir : (args.workdir ?? args.cwd) as string;
      const result = payload.trim() ? assessCommand(payload.trimEnd(), policy.mode, workdir, policy.workspaceRoot) : { kind: 'allow' } as const;
      if (result.kind === 'deny') return result;
      if (!dir.ok) return { kind: 'ask', rule: 'outside-workspace' };
      return { kind: 'ask', rule: 'opaque-execution' };
    }
    if (exec.name === 'str_replace_editor') {
      if (!isValidTextArg(args.command)) return { kind: 'deny', rule: 'invalid-arguments' };
      const extracted = extractWritePaths(exec.name, args);
      if (!extracted.ok || extracted.paths.length === 0) return { kind: 'deny', rule: 'invalid-arguments' };
      const subcommand = args.command.trim();
      const outside = extracted.paths.some(p => !isPathUnderSync(p, policy.workspaceRoot));
      if (subcommand === 'view') return { kind: 'allow' };
      if (policy.mode === 'read-only') return { kind: 'deny', rule: 'read-only-write' };
      if (outside) return { kind: 'ask', rule: 'outside-workspace' };
      if (!['create', 'str_replace', 'insert'].includes(subcommand)) return { kind: 'ask', rule: 'opaque-execution' };
      return { kind: 'allow' };
    }
    if ((OPS_WRITE_TOOLS as readonly string[]).includes(exec.name) || exec.name === 'ops_remove') return assessOpsFile(exec.name, args, policy);
    if ((BATCH_TOOLS as readonly string[]).includes(exec.name)) return assessOpsBatch(args, policy);
    if ((CODE_TOOLS as readonly string[]).includes(exec.name)) return assessRunCode(args, policy);
    const extracted = extractWritePaths(exec.name, args);
    if (!extracted.ok || extracted.paths.length === 0) return { kind: 'deny', rule: 'invalid-arguments' };
    if (policy.mode === 'read-only') return { kind: 'deny', rule: 'read-only-write' };
    if ((DELETE_TOOLS as readonly string[]).includes(exec.name) || extracted.destructive) return { kind: 'ask', rule: 'destructive' };
    if (extracted.paths.some(p => !isPathUnderSync(p, policy.workspaceRoot))) return { kind: 'ask', rule: 'outside-workspace' };
    return { kind: 'allow' };
  }
  private inspect(exec: ToolExecution): { assessment: Assessment; policy?: Policy } {
    const unavailable = this.capabilityReason();
    if (unavailable) return { assessment: { kind: 'deny', rule: unavailable } };
    let policy: Policy;
    try { policy = this.policy(exec); } catch { return { assessment: { kind: 'deny', rule: 'policy-unavailable' } }; }
    return { assessment: this.assessment(exec, policy), policy };
  }
  private key(exec: ToolExecution, policy: Policy): string {
    return createHash('sha256').update(JSON.stringify([exec.name, exec.callId, exec.arguments, policy])).digest('hex');
  }
  private record(exec: ToolExecution, action: SafetyEvent['action'], rule: Rule, policy?: Policy): void {
    this.events.unshift({ time: new Date().toISOString(), session: sessionKey(exec.agent?.id ?? ''), tool: exec.name,
      mode: policy?.mode ?? 'unknown', action, rule });
    this.events.length = Math.min(this.events.length, 100);
    if (action === 'denied' || action === 'rejected' || action === 'cancelled') this.denied++;
    if (action === 'approval-requested') this.approvalRequests++;
    if (action === 'approved') this.approved++;
    this.scheduleHistorySave();
  }
  private deny(exec: ToolExecution, rule: Rule, policy?: Policy): { kind: 'deny'; reason: string } {
    if (!this.decisions.has(exec)) { this.record(exec, 'denied', rule, policy); this.decisions.add(exec); }
    return { kind: 'deny', reason: `Runtime Guard 操作防护：${reasons[rule]}` };
  }
  private covered(exec: ToolExecution): boolean { return SAFETY_TOOLS.includes(exec.name); }
  private guard(exec: ToolExecution): string | undefined {
    if (!this.store.value.enabled || !this.covered(exec)) return;
    try {
      if (this.disposed || exec.signal?.aborted) return this.deny(exec, 'cancelled').reason;
      const unavailable = this.capabilityReason();
      if (unavailable) return this.deny(exec, unavailable).reason;
      let policy: Policy;
      try { policy = this.policy(exec); } catch { return this.deny(exec, 'policy-unavailable').reason; }
      // Reuse the verified before() grant when invocation, arguments, policy and revision match.
      const grant = this.grants.get(exec);
      if (grant?.revision === this.revision && grant.key === this.key(exec, policy)) {
        this.grants.delete(exec);
        return;
      }
      const assessment = this.assessment(exec, policy);
      if (assessment.kind === 'deny') return this.deny(exec, assessment.rule, policy).reason;
      if (assessment.kind === 'ask') return this.deny(exec, 'approval-unavailable', policy).reason;
    } catch { return this.deny(exec, 'check-failed').reason; }
  }
  private async before(exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision> {
    if (!this.store.value.enabled || !this.covered(exec)) return next();
    this.checked++;
    this.scheduleHistorySave();
    try {
      if (this.disposed || exec.signal?.aborted) return this.deny(exec, 'cancelled');
      const { assessment, policy } = this.inspect(exec);
      if (assessment.kind === 'deny') return this.deny(exec, assessment.rule, policy);
      if (assessment.kind === 'allow') {
        if (policy) this.grants.set(exec, { key: this.key(exec, policy), revision: this.revision });
        return next();
      }
      const approval = this.service('approval') as ApprovalService | undefined;
      if (!approval?.request || !exec.agent || !exec.callId || !exec.signal || !policy) return this.deny(exec, 'approval-unavailable', policy);
      const revision = this.revision, key = this.key(exec, policy);
      const signal = AbortSignal.any([exec.signal, this.shutdown.signal]);
      const argsObj = isRecord(exec.arguments) ? exec.arguments : undefined;
      const workdir = argsObj?.workdir ?? argsObj?.cwd ?? policy.workspaceRoot;
      const commandText = argsObj ? (argsObj.command ?? argsObj.cmd ?? argsObj.script ?? argsObj.code ?? argsObj.input ?? argsObj.text ?? argsObj.data ?? argsObj.chars) : undefined;
      const targetText = argsObj ? (argsObj.path ?? argsObj.filePath ?? argsObj.file_path ?? argsObj.target ?? argsObj.to ?? argsObj.script_path ?? argsObj.root) : undefined;
      const previewRaw = typeof commandText === 'string' && commandText.trim()
        ? `命令：${commandText.replace(/\s+/g, ' ').trim()}`
        : typeof targetText === 'string' && targetText.trim()
          ? `路径：${targetText.trim()}`
          : '';
      const preview = previewRaw.length > 240 ? `${previewRaw.slice(0, 237)}...` : previewRaw;
      const rawDetails = JSON.stringify({ tool: exec.name, mode: policy.mode, workspace: policy.workspaceRoot,
        workdir, arguments: exec.arguments }, null, 2);
      const details = rawDetails.length <= 65536
        ? rawDetails
        : `${rawDetails.slice(0, 65000)}\n... [预览已截断，总长 ${rawDetails.length} 字符；审批仅对完整参数哈希生效]`;
      this.record(exec, 'approval-requested', assessment.rule, policy);
      const summary = [
        `Runtime Guard 操作防护：${reasons[assessment.rule]}`,
        `摘要：工具 ${exec.name} · 模式 ${policy.mode} · 工作目录 ${typeof workdir === 'string' ? workdir : policy.workspaceRoot}${preview ? ` · ${preview}` : ''}`,
        '以下为本次调用的完整参数（仅允许一次）：',
      ].join('\n');
      const outcome = await approval.request({ agent: exec.agent, callId: exec.callId, toolName: exec.name,
        reason: `${summary}\n${details}`, signal });
      if (signal.aborted || this.disposed) return this.deny(exec, 'cancelled', policy);
      if (revision !== this.revision || key !== this.key(exec, this.policy(exec))) return this.deny(exec, 'configuration-changed', policy);
      if (outcome !== 'allowed-once') {
        this.record(exec, outcome === 'cancelled' ? 'cancelled' : 'rejected', assessment.rule, policy); this.decisions.add(exec);
        return { kind: 'deny', reason: 'Runtime Guard 操作防护：本次调用未获得批准，禁止改写后绕过执行。' };
      }
      this.grants.set(exec, { key, revision }); this.record(exec, 'approved', assessment.rule, policy);
    } catch { return this.deny(exec, 'check-failed'); }
    return next(); // downstream policy remains authoritative
  }
  status(): SafetyStatus {
    const reason = this.capabilityReason();
    const settings = this.store.value;
    return { enabled: settings.enabled, guardFullAccessElevation: settings.guardFullAccessElevation,
      state: this.disposed ? 'disposed' : !settings.enabled ? 'disabled' : reason ? 'blocked' : 'active',
      reason, hostVersion: this.hostVersion || 'unknown', verifiedHosts: [...SAFETY_HOSTS], coveredTools: [...SAFETY_TOOLS],
      persistent: this.store.persistent, loggingPersisted: Boolean(this.historyStore && this.isLoggingEnabled()),
      checked: this.checked, denied: this.denied, approvalRequests: this.approvalRequests, approved: this.approved,
      events: this.events.map(event => ({ ...event })) };
  }
  setEnabled(enabled: boolean): Promise<SafetyStatus> {
    if (typeof enabled !== 'boolean') return Promise.reject(new TypeError('expected enabled boolean'));
    return this.store.transform(current => ({ ...current, enabled }), {
      afterWrite: () => { this.revision++; return this.status(); },
    });
  }
  setGuardFullAccessElevation(enabled: boolean): Promise<SafetyStatus> {
    if (typeof enabled !== 'boolean') return Promise.reject(new TypeError('expected enabled boolean'));
    return this.store.transform(current => ({ ...current, guardFullAccessElevation: enabled }), {
      afterWrite: () => { this.revision++; return this.status(); },
    });
  }
  async close(): Promise<void> {
    this.disposed = true;
    this.shutdown.abort();
    this.unregister?.();
    if (this.historyTimer) { clearTimeout(this.historyTimer); this.historyTimer = undefined; }
    await this.flushHistory(true);
    await this.historyStore?.close();
    await this.store.close();
  }
}
