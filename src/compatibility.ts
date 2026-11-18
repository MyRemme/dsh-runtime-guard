import { readFileSync } from 'node:fs';
export { detectHostVersion } from './host-version.js';

export interface ReleaseContract {
  version: string; tag: string; adapter: 'live-frames' | 'stream-waterfall';
  features: { lifecycle: string; stream: boolean; toolResult: boolean; assistantStream: boolean; [key: string]: boolean | string };
  hostTest: string; interventionVerified?: boolean;
}
const matrix = JSON.parse(readFileSync(new URL('../compatibility/releases.json', import.meta.url), 'utf8')) as { releases: ReleaseContract[] };
export const releases = matrix.releases;
export interface Compatibility {
  version: string; known: boolean; adapter: 'live-frames' | 'stream-waterfall'; lifecycle: string;
  intervention: boolean; guard: boolean; reason: string;
}
export function compatibilityFor(version: string): Compatibility {
  const release = releases.find(r => r.version === version);
  const verified = release?.hostTest === 'passed' && release.interventionVerified === true;
  return {
    version: version || 'unknown', known: !!release, adapter: release?.adapter ?? 'stream-waterfall',
    lifecycle: release?.features.lifecycle ?? 'agent/created',
    intervention: !!verified,
    guard: release?.hostTest === 'passed',
    reason: !release ? 'unrecognized-host' : verified ? 'host-tests-passed' : 'automatic-intervention-not-verified',
  };
}
