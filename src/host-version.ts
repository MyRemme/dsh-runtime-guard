import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

/** Uses only package metadata, never loads another copy of a host service. */
export function detectHostVersion(installAnchor?: string): string | undefined {
  const require = createRequire(installAnchor || import.meta.url);
  const versions = new Set<string>();
  for (const name of ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-llm', '@deepseek-ai/dsh-tools']) {
    try { versions.add(JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version); } catch { /* Optional host metadata. */ }
  }
  return versions.size === 1 ? [...versions][0] : undefined;
}
