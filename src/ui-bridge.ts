import type { RuntimeGuardAPI } from './index.js';
import type { HostContext, RpcHandler } from './types.js';
import type { UpdateAPI } from './updater.js';
import { validateModelScope } from './model-scope.js';

const fail = (code: string, message: string) => ({ ok: false, error: { code, message, details: {} } });
const ok = (value: unknown) => ({ ok: true, value });
const isSessionId = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 1024;
const wrapAsync = (promise: Promise<unknown>, code: string, message: string) =>
  promise.then(ok, () => fail(code, message));

/** Uses the host's authenticated transport; never opens a separate listener. */
export function registerUI(ctx: HostContext, api: RuntimeGuardAPI, updates: UpdateAPI): unknown {
  // The host binds RPC route ownership to this child context. Its route
  // registration reads webServer through that owner, so declare both services.
  return ctx.inject?.(['connection', 'webServer'], child => {
    const boolRoute = (
      run: (enabled: boolean) => unknown,
      error?: [string, string],
    ) => (payload: Record<string, unknown>, keys: string[]) => {
      if (keys.length !== 1 || typeof payload.enabled !== 'boolean') return fail('BAD_REQUEST', 'Expected enabled boolean');
      const result = run(payload.enabled);
      return result instanceof Promise ? (error ? wrapAsync(result, ...error) : result.then(ok)) : ok(result);
    };

    const emptyRoute = (run: () => unknown, error?: [string, string]) =>
      (_payload: Record<string, unknown>, keys: string[]) => {
        if (keys.length) return fail('BAD_REQUEST', 'Expected empty payload');
        const result = run();
        return result instanceof Promise ? (error ? wrapAsync(result, ...error) : result.then(ok)) : ok(result);
      };

    const routes: Record<string, (payload: Record<string, unknown>, keys: string[]) => unknown> = {
      setDiskLogging: boolRoute(enabled => api.setDiskLogging(enabled), ['SETTINGS_FAILED', 'Could not save disk logging']),
      setOperationSafety: boolRoute(enabled => api.setOperationSafety(enabled), ['SETTINGS_FAILED', 'Could not save operation safety']),
      setGuardFullAccessElevation: boolRoute(enabled => api.setGuardFullAccessElevation(enabled), ['SETTINGS_FAILED', 'Could not save operation safety']),
      setGuardStopText: boolRoute(enabled => api.setGuardStopText(enabled), ['SETTINGS_FAILED', 'Could not save guard text setting']),
      setAutomaticUpdates: boolRoute(enabled => updates.setAutomatic(enabled)),
      setMonitoring: boolRoute(enabled => { api.setMonitoring(enabled); return api.status(); }),
      setModelScope: payload => {
        let value;
        try { value = validateModelScope(payload); } catch { return fail('BAD_REQUEST', 'Invalid model scope'); }
        return wrapAsync(api.setModelScope(value), 'SETTINGS_FAILED', 'Could not save model scope');
      },
      setMode: (payload, keys) => {
        const mode = payload.mode;
        if (keys.length !== 1 || !['observe', 'assist', 'guard'].includes(mode as string)) return fail('BAD_REQUEST', 'Expected valid mode');
        return wrapAsync(api.setMode(mode as 'observe' | 'assist' | 'guard'), 'MODE_FAILED', 'Could not save mode');
      },
      session: (payload, keys) => {
        if (keys.length !== 1 || !isSessionId(payload.sessionId)) return fail('BAD_REQUEST', 'Expected sessionId string');
        return ok(api.sessionStatus(payload.sessionId));
      },
      setSessionEnabled: (payload, keys) => {
        const { sessionId, enabled } = payload;
        if (keys.length !== 2 || !isSessionId(sessionId) || typeof enabled !== 'boolean') {
          return fail('BAD_REQUEST', 'Expected sessionId and enabled');
        }
        api.setSessionEnabled(sessionId, enabled);
        return ok(api.sessionStatus(sessionId));
      },
      diskLogging: emptyRoute(() => api.diskLogging()),
      operationSafety: emptyRoute(() => api.operationSafety()),
      modelScope: emptyRoute(() => api.modelScope()),
      refreshModels: emptyRoute(() => api.refreshModels(), ['CATALOG_FAILED', 'Could not read models']),
      updates: emptyRoute(() => updates.status()),
      checkUpdates: emptyRoute(() => { void updates.check(); return updates.status(); }),
      installUpdate: emptyRoute(() => updates.install()),
      conversations: emptyRoute(() => api.conversations()),
      snapshot: emptyRoute(() => api.status()),
      export: emptyRoute(() => ({ schemaVersion: 1, exportedAt: new Date().toISOString(), ...api.status() })),
      selfTest: emptyRoute(() => api.selfTest()),
    };

    const handler: RpcHandler = (endpoint, payload, signal, peer) => {
      if (peer?.principal?.kind !== 'owner') return fail('FORBIDDEN', 'Owner access required');
      if (signal.aborted) return fail('ABORTED', 'Request cancelled');
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return fail('BAD_REQUEST', 'Invalid payload');
      const route = Object.hasOwn(routes, endpoint) ? routes[endpoint] : undefined;
      if (!route) return fail('NOT_FOUND', 'Unknown operation');
      return route(payload as Record<string, unknown>, Object.keys(payload));
    };

    // Some Cordis generations bind the rpc getter's captured owner to the
    // Connection service itself. The explicit-owner entry reaches the same
    // authenticated router while retaining this plugin's effect lifecycle.
    const connection = child.connection;
    if (connection?.register) connection.register(child, '/runtime-guard', handler);
    else connection?.rpc?.handle('/runtime-guard', handler);
  });
}
