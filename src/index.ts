import { ProfileJsonStore } from './profile-file.js';
import { resolveSettings, Config, type Settings } from './config.js';
import { compatibilityFor, detectHostVersion } from './compatibility.js';
import { StepLoopTracker, type RepeatEvidence } from './detection.js';
import { StreamMonitor } from './monitor.js';
import { ProgressGuard } from './progress.js';
import { MetricsStore, sessionKey, type DiagnosticEvent } from './metrics.js';
import { RecoveryController } from './recovery.js';
import { registerUI } from './ui-bridge.js';
import { registerUpdater } from './updater.js';
import { ModelScopeStore, type ModelCatalog } from './model-scope.js';
import { OperationSafety, type SafetyStatus } from './operation-safety.js';
import type { Agent, Chunk, HostContext, Notice, RequestOptions, StepPayload, ToolExecution, ToolResult } from './types.js';

export { Config };
export const name = 'runtime-guard';
export const inject = ['agents', 'llm', 'tools'];
export interface RuntimeGuardAPI {
  status(): {
    compatibility: ReturnType<typeof compatibilityFor>; mode: Settings['mode']; guardStopText: boolean; sessions: number; counts: Record<string, number>;
    monitoring: boolean; startedAt: string; monitoredRequests: number; finishedRequests: number; activeRequests: number; lastMonitoredAt: string | null;
    modelScope: ReturnType<ModelScopeStore['summary']>;
    confirmed: number; recoverySubmitted: number; events: ReturnType<MetricsStore['snapshot']>['events']; logging: ReturnType<MetricsStore['snapshot']>['logging'];
    operationSafety: SafetyStatus;
  };
  sessionStatus(sessionId: string): {
    monitoring: boolean; sessionEnabled: boolean; mode: Settings['mode']; startedAt: string;
    coverage: 'waiting' | 'monitoring' | 'checked' | 'other-model' | 'auxiliary' | 'unavailable' | 'paused' | 'disabled';
    monitoredRequests: number; activeRequests: number; confirmed: number; toolWarnings: number; recoverySubmitted: number; cancelRequested: number;
    lastMonitoredAt: string | null; latestEvent: DiagnosticEvent | null; events: ReturnType<MetricsStore['forSession']>;
    turn: number; step: number; toolResults: number; lastToolAt: string | null;
    counterScope: 'tracked' | 'history' | 'retained-events';
    live: (ReturnType<StreamMonitor['snapshot']> & { turn: number; step: number; startedAt: string; active: boolean; silentForMs: number }) | null;
  };
  /** Owner UI only; excluded from status(), disk and export. */
  conversations(): ({ sessionId: string; sessionKey: string; tracked: boolean } & ReturnType<RuntimeGuardAPI['sessionStatus']>)[];
  setMonitoring(enabled: boolean): void;
  setMode(mode: 'observe' | 'assist' | 'guard'): Promise<ReturnType<RuntimeGuardAPI['status']>>;
  setGuardStopText(enabled: boolean): Promise<ReturnType<RuntimeGuardAPI['status']>>;
  modelScope(): ReturnType<ModelScopeStore['view']>;
  setModelScope(input: unknown): Promise<ReturnType<ModelScopeStore['view']>>;
  refreshModels(): Promise<ReturnType<ModelScopeStore['view']>>;
  selfTest(): { passed: boolean; scope: 'offline-detector-only'; modelRequests: 0 };
  setSessionEnabled(sessionId: string, enabled: boolean): void;
  operationSafety(): SafetyStatus;
  setOperationSafety(enabled: boolean): Promise<SafetyStatus>;
  setGuardFullAccessElevation(enabled: boolean): Promise<SafetyStatus>;
  diskLogging(): ReturnType<MetricsStore['loggingSettings']>;
  setDiskLogging(enabled: boolean): Promise<ReturnType<MetricsStore['loggingSettings']>>;
}
interface RequestState { monitor: StreamMonitor; signal: AbortSignal; route: RequestOptions; frameId?: string; turn: number; step: number; startedAt: string }
interface SessionState {
  agent: Agent; turn: number; step: number; signal?: AbortSignal;
  route?: RequestOptions;
  request?: RequestState; activity?: RequestState;
  frameId?: string; progress: ProgressGuard; stepTracker: StepLoopTracker; ending?: Record<string, unknown>;
  enabled: boolean;
  coverage: 'waiting' | 'other-model' | 'auxiliary' | 'unavailable' | 'checked';
  monitoredRequests: number; confirmed: number; toolWarnings: number; recoverySubmitted: number; cancelRequested: number; lastMonitoredAt: string | null;
  latestEvent: DiagnosticEvent | null;
  toolResults: number; lastToolAt: string | null;
}

export function apply(ctx: HostContext, input: Partial<Settings> = {}): void {
  const config = resolveSettings(input);
  if (!config.enabled) return;
  const profile = ctx.get?.('profileContext', false) as { installAnchor?: string; dir?: string } | undefined;
  const detected = detectHostVersion(profile?.installAnchor);
  const warn = (message: string) => { try { ctx.logger?.warn(message); } catch { /* Logging is optional. */ } };
  const metrics = new MetricsStore(config.logDir, config.maxLogBytes, () => warn('runtime-guard: diagnostic logging disabled after an I/O error'), {
    ...(profile?.dir ? { profileDirectory: profile.dir } : {}), sessionLimit: config.maxSessions,
  });
  // Only detected metadata unlocks safety; hostVersion is merely a monitor hint.
  const operationSafety = new OperationSafety(ctx, config.operationSafety, detected ?? '', profile?.dir, {
    logDir: metrics.loggingSettings().directory,
    isLoggingEnabled: () => metrics.loggingSettings().enabled,
  });
  const compatibility = profile?.installAnchor
    ? compatibilityFor(detected ?? config.hostVersion ?? '')
    : compatibilityFor(config.hostVersion || detected || '');
  if (profile?.installAnchor && !detected) {
    compatibility.intervention = false; compatibility.guard = false;
    if (compatibility.reason === 'host-tests-passed' || compatibility.reason === 'automatic-intervention-not-verified') {
      compatibility.reason = 'host-version-unverified';
    }
  } else if (!profile?.installAnchor && config.hostVersion && detected !== config.hostVersion) {
    compatibility.intervention = false; compatibility.guard = false;
    if (compatibility.reason === 'host-tests-passed' || compatibility.reason === 'automatic-intervention-not-verified') {
      compatibility.reason = 'host-version-mismatch';
    }
  }
  interface ModeSettings { mode: Settings['mode']; guardStopText: boolean }
  const modeStore = new ProfileJsonStore<ModeSettings>({
    directory: profile?.dir,
    subpath: ['mode.json'],
    maxBytes: 65536,
    defaultValue: { mode: config.mode, guardStopText: config.guardStopText },
    parse: raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
      const rec = raw as { mode?: unknown; guardStopText?: unknown };
      if (!['observe', 'assist', 'guard'].includes(rec.mode as string)) return undefined;
      if (Object.hasOwn(rec, 'guardStopText') && rec.guardStopText !== undefined && typeof rec.guardStopText !== 'boolean') return undefined;
      return {
        mode: rec.mode as Settings['mode'],
        guardStopText: Object.hasOwn(rec, 'guardStopText') && rec.guardStopText !== undefined ? Boolean(rec.guardStopText) : config.guardStopText,
      };
    },
    serialize: value => JSON.stringify(value.guardStopText ? { mode: value.mode, guardStopText: true } : { mode: value.mode }, null, 2) + '\n',
  });
  const modeFor = (requested: Settings['mode']): Settings['mode'] =>
    requested === 'auto' ? (compatibility.intervention ? 'auto' : compatibility.guard ? 'guard' : 'observe')
    : requested === 'guard' && !compatibility.guard ? 'observe' : requested;
  let effectiveMode = modeFor(modeStore.value.mode);
  const states = new Map<string, SessionState>();
  const disabledSessions = new Set<string>(config.disabledSessions);
  let disposed = false;
  let monitoring = true;
  const startedAt = new Date().toISOString();
  const report = (event: Notice) => {
    const safe = metrics.record(event);
    const state = states.get(event.session);
    if (state) {
      if (safe) state.latestEvent = safe;
      if (event.kind === 'stream-repeat' && event.confirmed) state.confirmed++;
      if (event.kind === 'tool-repeat') state.toolWarnings++;
      if (event.kind === 'recovery' && event.action === 'recovery-submitted') state.recoverySubmitted++;
      if (event.kind === 'recovery' && event.action === 'cancel-requested') state.cancelRequested++;
      metrics.remember(event.session, state);
    }
    if (event.kind !== 'recovery' && event.score < 70) return;
    warn(config.language === 'zh'
      ? `DSH Runtime Guard：${event.kind}，风险分数 ${event.score}，动作 ${event.action ?? 'observe'}；详情见「运行时护栏」面板。`
      : `DSH Runtime Guard: ${event.kind}, risk ${event.score}, action ${event.action ?? 'observe'}.`);
  };
  const recovery = new RecoveryController({ ...config, mode: effectiveMode }, (action, agent, origin) => {
    const state = states.get(agent.id);
    report({ kind: 'recovery', session: agent.id, score: 0, confirmed: false, chars: 0, action,
      ...(origin ?? (state ? { turn: state.turn, step: state.step } : {})) });
  });
  const guarded = (operation: () => void, context?: SessionState | (() => SessionState | undefined)) => {
    if (disposed) return;
    try { operation(); }
    catch (error) {
      const state = typeof context === 'function' ? context() : context;
      if (state) { state.coverage = 'unavailable'; state.activity?.monitor.invalidate(); }
      const action = error instanceof TypeError ? 'type-error' : error instanceof RangeError ? 'range-error' : 'unexpected-error';
      report({ kind: 'internal-error', session: state?.agent.id ?? '', score: 0, confirmed: false, chars: 0, action,
        ...(state ? { turn: state.turn, step: state.step } : {}) });
      warn(`runtime-guard: monitor unavailable (${action}); output is still forwarded`);
    }
  };
  const routeOf = (route: RequestOptions) => ({
    ...(typeof route.model === 'string' ? { model: route.model } : {}),
    ...(typeof route.provider === 'string' ? { provider: route.provider } : {}),
  });
  const modelScope = new ModelScopeStore({ scope: config.modelScope,
    selections: config.modelSelections.length ? config.modelSelections : config.models.flatMap(model =>
      config.providers.length ? config.providers.map(provider => ({ model, provider })) : [{ model }]),
  }, profile?.dir, () => {
    for (const state of states.values()) {
      const eligible = modelScope.matches(state.request?.route ?? state.route ?? {});
      if (!eligible) deactivateTracking(state, 'other-model');
      else if (state.coverage === 'other-model') state.coverage = 'waiting';
      recovery.setEnabled(state.agent, monitoring && state.enabled && eligible);
    }
  });
  const selected = (options: RequestOptions) => modelScope.matches(options);
  const deactivateTracking = (state: SessionState, coverage: SessionState['coverage']) => {
    state.progress.clear();
    state.stepTracker.clear();
    if (state.request || coverage === 'other-model') {
      state.coverage = coverage;
      delete state.request;
    }
  };
  const stateFor = (agent: Agent): SessionState => {
    let state = states.get(agent.id);
    if (state?.agent === agent) {
      states.delete(agent.id);
      states.set(agent.id, state);
      return state;
    }
    if (state) { recovery.forget(state.agent); states.delete(agent.id); }
    if (states.size >= config.maxSessions) {
      const idle = [...states.values()].find(s => !s.request && s.agent.status !== 'running');
      if (!idle) throw new RangeError('session capacity reached');
      recovery.forget(idle.agent); states.delete(idle.agent.id);
    }
    const enabled = !disabledSessions.has(agent.id);
    recovery.setEnabled(agent, enabled && monitoring && selected(agent.model?.current() ?? agent.options ?? {}));
    state = { agent, turn: 0, step: 0, progress: new ProgressGuard(config.toolRepeatLimit), stepTracker: new StepLoopTracker(), enabled,
      coverage: 'waiting', monitoredRequests: 0, confirmed: 0, toolWarnings: 0, recoverySubmitted: 0, cancelRequested: 0, lastMonitoredAt: null, latestEvent: null, toolResults: 0, lastToolAt: null,
      ...metrics.sessionSummary(sessionKey(agent.id)) };
    states.set(agent.id, state);
    return state;
  };
  ctx.on('agent/pre-step', (payload: StepPayload, next: () => Promise<unknown>) => {
    guarded(() => {
      const state = stateFor(payload.agent);
      state.turn = payload.turn; state.step = payload.step; state.signal = payload.signal;
      delete state.frameId;
      state.route = routeOf(payload.modelSelection ?? payload.agent.model?.current() ?? payload.agent.options ?? {});
      modelScope.remember(state.route);
      recovery.setEnabled(state.agent, monitoring && state.enabled && selected(state.route));
      if (payload.messages.some(m => m.source?.kind === 'user')) {
        recovery.resetByUser(payload.agent); state.progress.clear(); state.stepTracker.clear();
      }
    }, () => states.get(payload.agent.id));
    return next(); // Preserve downstream decisions, messages and startsRequestSeries verbatim.
  });
  ctx.on('agent/inbox/inserted', ({ agent, message }: { agent: Agent; message: { source?: { kind?: string } } }) => {
    if (message.source?.kind === 'user') guarded(() => { recovery.resetByUser(agent); states.get(agent.id)?.stepTracker.clear(); }, states.get(agent.id));
  });

  ctx.on('llm/stream', (options: RequestOptions, next: () => AsyncIterable<Chunk>) => {
    const upstream = next();
    const state = options.sessionId ? states.get(options.sessionId) : undefined;
    if (state && !disposed && !options.purpose) {
      modelScope.remember(options);
      if (!state.request) state.route = routeOf(options);
    }
    if (state && !disposed && options.purpose && !state.request && !state.monitoredRequests) state.coverage = 'auxiliary';
    if (state && !disposed && !options.purpose && !state.request) {
      state.coverage = !selected(options) ? 'other-model' : !options.signal || options.signal !== state.signal ? 'unavailable' : 'waiting';
    }
    if (disposed || !monitoring || !state?.enabled || !selected(options) || options.purpose || !options.signal || options.signal !== state.signal) return upstream;
    return (async function* () {
      const signal = options.signal!;
      let request: SessionState['request'];
      let reasoningObserved = false;
      guarded(() => {
        if (!monitoring || !state.enabled || !selected(options) || states.get(state.agent.id) !== state || signal !== state.signal) return;
        const origin = { turn: state.turn, step: state.step }, noticeKeys = new Set<string>();
        const emitRepeat = (evidence: RepeatEvidence & { contentType: 'reasoning' | 'text' }) => {
          const willIntervene = evidence.confirmed && !evidence.uncertainty && effectiveMode !== 'observe'
            && (effectiveMode !== 'guard' || evidence.contentType === 'reasoning' || (modeStore.value.guardStopText && evidence.contentType === 'text'))
            && selected(options) && !signal.aborted && signal === state.signal && origin.turn === state.turn && origin.step === state.step
            && state.agent === states.get(state.agent.id)?.agent && monitoring && state.enabled;
          const key = `${evidence.contentType}/${evidence.uncertainty ? 'uncertain' : evidence.confirmed ? 'confirmed' : 'suspected'}`;
          if (!noticeKeys.has(key)) {
            noticeKeys.add(key);
            report({ kind: 'stream-repeat', session: state.agent.id, score: evidence.score, confirmed: evidence.confirmed, chars: evidence.chars,
              period: evidence.period, repeats: evidence.repeats, coverage: evidence.coverage, novelty: evidence.novelty,
              ...(evidence.method ? { method: evidence.method } : {}),
              ...(evidence.uncertainty ? { uncertainty: evidence.uncertainty } : {}),
              action: evidence.uncertainty ? 'notify-only' : willIntervene ? 'awaiting-recovery-decision' : 'observe-only', contentType: evidence.contentType, ...origin });
          }
          if (willIntervene)
            recovery.request(state.agent, signal, effectiveMode === 'guard' ? compatibility.guard : compatibility.intervention, origin);
        };
        const monitor = new StreamMonitor(config, emitRepeat, reasoningText => {
          reasoningObserved = true;
          const active = !disposed && monitoring && state.enabled && selected(options) && signal === state.signal
            && state.agent === states.get(state.agent.id)?.agent && origin.turn === state.turn && origin.step === state.step;
          if (!active) return;
          const cross = state.stepTracker.observe(reasoningText, Math.max(3, config.confirmations));
          if (cross) emitRepeat({ ...cross, contentType: 'reasoning' });
        });
        state.latestEvent = null;
        state.route = routeOf(options);
        recovery.setEnabled(state.agent, monitoring && state.enabled && selected(options));
        request = { monitor, signal, route: state.route, turn: state.turn, step: state.step, startedAt: new Date().toISOString(), ...(state.frameId ? { frameId: state.frameId } : {}) };
        delete state.frameId;
        state.activity = request;
        state.request = request;
        state.monitoredRequests++; state.lastMonitoredAt = new Date().toISOString(); state.coverage = 'checked';
        metrics.requestStarted(state.lastMonitoredAt); metrics.remember(state.agent.id, state);
      }, state);
      const ownRequest = request;
      let completed = false;
      try {
        for await (const chunk of upstream) {
          if (compatibility.adapter === 'stream-waterfall' && ownRequest && state.request === ownRequest) guarded(() => ownRequest.monitor.push(chunk), state);
          yield chunk;
        }
        completed = true;
      } finally {
        if (ownRequest) {
          metrics.requestFinished();
          if (completed && !reasoningObserved && state.agent === states.get(state.agent.id)?.agent) state.stepTracker.clear();
          if (state.request === ownRequest) {
            if (!completed) state.coverage = 'unavailable';
            if (state.frameId === ownRequest.frameId) delete state.frameId;
            delete state.request;
          }
        }
      }
    })();
  });

  if (compatibility.adapter === 'live-frames') {
    ctx.on('agent/assistant-stream', ({ agent, frame }: { agent: Agent; frame: { type: string; attemptId: string; chunk?: Chunk } }) => {
      const state = states.get(agent.id);
      if (!state || state.agent !== agent) return;
      guarded(() => {
        const request = state.request;
        const current = request && request.signal === state.signal && request.turn === state.turn && request.step === state.step;
        if (frame.type === 'start') {
          if (current && request.frameId === frame.attemptId) return;
          if (current && !request.frameId) request.frameId = frame.attemptId;
          else state.frameId = frame.attemptId;
          return;
        }
        if (frame.type === 'chunk' && frame.chunk && monitoring && state.enabled && current && request.frameId === frame.attemptId) request.monitor.push(frame.chunk);
      }, state);
    });
  }
  ctx.on('tools/result', (exec: ToolExecution, result: ToolResult) => guarded(() => {
    if (!exec.agent) return;
    const state = states.get(exec.agent.id);
    if (!monitoring || !state?.enabled || state.agent !== exec.agent) return;
    const route = exec.agent.model?.current() ?? exec.agent.options;
    if (!selected(route ?? {})) return;
    state.toolResults++; state.lastToolAt = new Date().toISOString();
    metrics.remember(exec.agent.id, state);
    const evidence = state.progress.record(exec, result);
    if (evidence.repeated && evidence.count % config.toolRepeatLimit === 0) {
      const extra = Math.min(10, Math.floor((evidence.count - config.toolRepeatLimit) / config.toolRepeatLimit) * 5);
      report({ kind: 'tool-repeat', session: exec.agent.id, score: (evidence.failed ? 85 : 70) + extra, confirmed: false, chars: 0,
        repeats: evidence.count, turn: state.turn, step: state.step });
    }
  }, exec.agent ? states.get(exec.agent.id) : undefined));
  ctx.on('session/event', (session: { id: string }, event: { type: string; data: Record<string, unknown> }) => guarded(() => {
    if (event.type === 'turn/end') {
      const state = states.get(session.id);
      if (state) state.ending = event.data;
    }
  }, states.get(session.id)));
  ctx.on('agent/status', ({ agent, status }: { agent: Agent; status: string }) => guarded(() => {
    const state = states.get(agent.id);
    if (status !== 'idle' || !state || state.agent !== agent) return;
    recovery.settled(agent, state.ending);
    state.stepTracker.clear();
    delete state.ending;
    delete state.request; delete state.signal; delete state.frameId;
  }, states.get(agent.id)));
  ctx.on('agent/disposed', ({ agent }: { agent: Agent }) => guarded(() => {
    if (states.get(agent.id)?.agent === agent) states.delete(agent.id);
    recovery.forget(agent);
  }, states.get(agent.id)));
  const sessionStatus = (sessionId: string, key = sessionKey(sessionId)): ReturnType<RuntimeGuardAPI['sessionStatus']> => {
    const state = states.get(sessionId);
    const saved = metrics.sessionSummary(key), counters = state ?? saved;
    const activity = state?.activity, live = activity?.monitor.snapshot();
    const events = metrics.forKey(key);
    const retained = (kind: string, action?: string) => events.filter(event => event.kind === kind && (action ? event.action === action : event.confirmed)).length;
    return {
      monitoring: monitoring && !disposed, sessionEnabled: !disabledSessions.has(sessionId), mode: effectiveMode, startedAt,
      coverage: !monitoring || disposed ? 'paused' : disabledSessions.has(sessionId) ? 'disabled'
        : state?.request ? 'monitoring' : state?.coverage ?? 'waiting',
      monitoredRequests: counters?.monitoredRequests ?? 0, activeRequests: state?.request ? 1 : 0,
      counterScope: state ? 'tracked' : saved ? 'history' : 'retained-events',
      confirmed: counters?.confirmed ?? retained('stream-repeat'), toolWarnings: counters?.toolWarnings ?? events.filter(e => e.kind === 'tool-repeat').length,
      recoverySubmitted: counters?.recoverySubmitted ?? retained('recovery', 'recovery-submitted'), cancelRequested: counters?.cancelRequested ?? retained('recovery', 'cancel-requested'),
      lastMonitoredAt: counters?.lastMonitoredAt ?? null, latestEvent: state?.latestEvent ? { ...state.latestEvent } : state ? null : events[0] ?? null, events,
      turn: counters?.turn ?? 0, step: counters?.step ?? 0, toolResults: counters?.toolResults ?? 0, lastToolAt: counters?.lastToolAt ?? null,
      live: activity && live ? { ...live, turn: activity.turn, step: activity.step, startedAt: activity.startedAt,
        active: state.request === activity, silentForMs: state.request === activity ? Math.max(0, Date.now() - Date.parse(live.lastOutputAt ?? activity.startedAt)) : 0 } : null,
    };
  };
  const api: RuntimeGuardAPI = {
    sessionStatus,
    conversations: () => {
      const ids = new Set([...states.keys(), ...metrics.sessionReferences().map(item => item.sessionId)]);
      const known = new Map([...ids].map(id => [sessionKey(id), id]));
      return [...new Set([...known.keys(), ...metrics.sessionKeys()])].map(key => {
        const sessionId = known.get(key) ?? '';
        return { sessionId, sessionKey: key, tracked: states.has(sessionId), ...sessionStatus(sessionId, key) };
      })
        .sort((a, b) => b.activeRequests - a.activeRequests || (b.lastMonitoredAt ?? '').localeCompare(a.lastMonitoredAt ?? ''));
    },
    status: () => ({
      compatibility: { ...compatibility }, mode: effectiveMode, guardStopText: modeStore.value.guardStopText, sessions: states.size, counts: { ...metrics.counts },
      modelScope: modelScope.summary(),
      monitoring: monitoring && !disposed, startedAt, ...metrics.requestTotals(),
      activeRequests: [...states.values()].filter(state => state.request).length,
      ...metrics.snapshot(),
      operationSafety: operationSafety.status(),
    }),
    setMonitoring: enabled => guarded(() => {
      monitoring = enabled;
      for (const state of states.values()) {
        if (!enabled) deactivateTracking(state, 'unavailable');
        recovery.setEnabled(state.agent, enabled && state.enabled && selected(state.request?.route ?? state.route ?? {}));
      }
    }),
    setMode: nextMode => {
      if (!['observe', 'assist', 'guard'].includes(nextMode)) return Promise.reject(new TypeError('invalid mode'));
      if (nextMode === 'guard' && !compatibility.guard) return Promise.reject(new Error('guard mode unavailable'));
      return modeStore.transform(current => ({ ...current, mode: nextMode }), {
        afterWrite: () => {
          effectiveMode = modeFor(nextMode);
          recovery.setMode(effectiveMode);
          return api.status();
        },
      });
    },
    setGuardStopText: enabled => {
      if (typeof enabled !== 'boolean') return Promise.reject(new TypeError('expected enabled boolean'));
      return modeStore.transform(current => ({ ...current, guardStopText: enabled }), {
        afterWrite: () => api.status(),
      });
    },
    modelScope: () => modelScope.view(),
    operationSafety: () => operationSafety.status(),
    setOperationSafety: enabled => operationSafety.setEnabled(enabled),
    setGuardFullAccessElevation: enabled => operationSafety.setGuardFullAccessElevation(enabled),
    diskLogging: () => metrics.loggingSettings(),
    setDiskLogging: enabled => disposed
      ? Promise.reject(new Error('settings unavailable'))
      : metrics.setEnabled(enabled).then(async result => {
        await operationSafety.syncLogging(enabled);
        return result;
      }),
    setModelScope: input => modelScope.set(input),
    refreshModels: () => modelScope.refresh((ctx.get?.('llm', false) ?? ctx.llm) as ModelCatalog | undefined),
    selfTest: () => {
      const passed = ['好。执行。好。', '好。'].every(unit => {
        let confirmed = false;
        const monitor = new StreamMonitor(config, evidence => { if (evidence.confirmed) confirmed = true; });
        monitor.push({ type: 'reasoning-delta', index: 0, text: unit.repeat(Math.ceil(config.windowChars * 3 / unit.length)) });
        return confirmed;
      });
      return { passed, scope: 'offline-detector-only', modelRequests: 0 };
    },
    setSessionEnabled: (sessionId, enabled) => guarded(() => {
      if (enabled) disabledSessions.delete(sessionId); else disabledSessions.add(sessionId);
      const agent = states.get(sessionId)?.agent ?? ctx.agents?.get(sessionId);
      if (!agent) return;
      const state = stateFor(agent); state.enabled = enabled;
      if (!enabled) deactivateTracking(state, 'unavailable');
      recovery.setEnabled(agent, enabled && monitoring && selected(state.request?.route ?? state.route ?? agent.model?.current() ?? agent.options ?? {}));
    }),
  };
  ctx.provide?.('runtimeGuard', api);
  const updates = registerUpdater(ctx, detected ?? '', () => {
    const agents = ctx.agents?.list?.();
    return !!agents && agents.every(agent => agent.status === 'idle' && !agent.inbox?.nextStep.length && !agent.inbox?.nextTurn.length)
      && api.status().activeRequests === 0;
  });
  registerUI(ctx, api, updates);
  if (modeStore.value.mode !== effectiveMode) warn(config.language === 'zh' ? 'DSH Runtime Guard：此版本尚未通过所选干预模式验证，已使用观察模式。' : 'DSH Runtime Guard: selected intervention is not verified; using observation mode.');
  metrics.record({ kind: 'compatibility', session: '', score: 0, confirmed: false, chars: 0, action: compatibility.reason });
  try { ctx.logger?.info(`runtime-guard: DSH ${compatibility.version}; ${compatibility.adapter}; ${effectiveMode}; ${compatibility.reason}`); } catch { /* Optional logger. */ }
  ctx.effect(() => async () => { disposed = true; recovery.dispose(); states.clear(); await modeStore.close(); await modelScope.close(); await metrics.close(); }, 'runtime-guard: stop and drain');
}
