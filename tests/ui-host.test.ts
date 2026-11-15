import { Context, Service } from '@deepseek-ai/cordis';
import { expect, it } from 'vitest';
import { registerUI } from '../src/ui-bridge.js';
import type { RuntimeGuardAPI } from '../src/index.js';
import type { HostContext } from '../src/types.js';
import type { UpdateAPI } from '../src/updater.js';

it('registers the authenticated route in an injected Cordis owner and removes it on unload', async () => {
  const ctx = new Context();
  const routes = new Map<string, { handler: (action: string, payload: unknown, signal: AbortSignal, meta: unknown) => Promise<unknown> }>();
  // Host Connection resolves the route carrier through the caller's context,
  // including Cordis's actual dependency access checks and effect lifecycle.
  class Connection extends Service {
    constructor(c: Context) { super(c, 'connection'); }
    get rpc() {
      const owner = this.ctx;
      return {
        handle: (channel: string, handler: (action: string, payload: unknown, signal: AbortSignal, meta: unknown) => Promise<unknown>) =>
          this.register(owner, channel, handler),
      };
    }
    register(owner: Context, channel: string, handler: (action: string, payload: unknown, signal: AbortSignal, meta: unknown) => Promise<unknown>) {
      return owner.effect(() => (owner as unknown as { webServer: { register: (route: { path: string; handler: typeof handler }) => () => void } }).webServer.register({ path: channel, handler }));
    }
  }
  try {
    await ctx.plugin(c => c.provide('webServer', {
      register: (route: { path: string; handler: (action: string, payload: unknown, signal: AbortSignal, meta: unknown) => Promise<unknown> }) => {
        routes.set(route.path, route);
        return () => routes.delete(route.path);
      },
    }));
    await ctx.plugin(Connection);
    const api = { status: () => ({ monitoring: true }) } as unknown as RuntimeGuardAPI;
    const updater = { status: () => ({ phase: 'unavailable' }) } as unknown as UpdateAPI;
    const plugin = (await registerUI(ctx as unknown as HostContext, api, updater)) as { dispose(): Promise<void> };
    expect(routes.has('/runtime-guard')).toBe(true);
    const result = await routes.get('/runtime-guard')!.handler('snapshot', {}, new AbortController().signal, { principal: { kind: 'owner' } });
    expect(result).toEqual({ ok: true, value: { monitoring: true } });
    await plugin.dispose();
    expect(routes.has('/runtime-guard')).toBe(false);
  } finally { await ctx.fiber.dispose(); }
});
