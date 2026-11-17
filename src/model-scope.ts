import { ProfileJsonStore } from './profile-file.js';

export interface ModelSelection { provider?: string; model: string }
export interface ModelScopeSettings { scope: 'all' | 'selected'; selections: ModelSelection[] }
interface ModelOption extends ModelSelection { label: string; providerLabel: string }
export interface ModelCatalog {
  listProviders?(): { id: string; name?: string }[];
  listModels?(provider: string): Promise<readonly { id: string; name?: string }[]>;
}
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 1024 && value.trim() === value;
const key = (value: ModelSelection) => JSON.stringify([value.provider ?? null, value.model]);
export function validateSelections(value: unknown): ModelSelection[] {
  if (!Array.isArray(value) || value.length > 512) throw new TypeError('invalid model selections');
  const unique = new Map<string, ModelSelection>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || Object.keys(item).some(k => k !== 'model' && k !== 'provider') || !validId(item.model)
      || Object.hasOwn(item, 'provider') && !validId(item.provider)) throw new TypeError('invalid model selection');
    const safe = { model: item.model, ...(item.provider === undefined ? {} : { provider: item.provider }) };
    unique.set(key(safe), safe);
  }
  return [...unique.values()];
}
export function validateModelScope(value: unknown, strict = true): ModelScopeSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('invalid model scope');
  const input = value as Record<string, unknown>;
  if ((strict && Object.keys(input).length !== 2) || !['all', 'selected'].includes(input.scope as string)) {
    throw new TypeError('invalid model scope');
  }
  return { scope: input.scope as ModelScopeSettings['scope'], selections: validateSelections(input.selections) };
}

/** Route names stay in the authenticated settings endpoint and local profile. */
export class ModelScopeStore {
  private readonly store: ProfileJsonStore<ModelScopeSettings>;
  private catalogError = false;
  private options = new Map<string, ModelOption>();
  private refreshing: Promise<ReturnType<ModelScopeStore['view']>> | undefined;
  constructor(initial: ModelScopeSettings, directory: string | undefined, private readonly changed: () => void) {
    this.store = new ProfileJsonStore<ModelScopeSettings>({
      directory,
      subpath: ['model-scope.json'],
      maxBytes: 4_194_304,
      defaultValue: validateModelScope(initial),
      parse: raw => validateModelScope(raw, false),
    });
  }
  matches(route: { model?: unknown; provider?: unknown }): boolean {
    if (this.store.value.scope === 'all') return true;
    return typeof route.model === 'string' && this.store.value.selections.some(item =>
      item.model === route.model && (item.provider === undefined || item.provider === route.provider));
  }
  remember(route: { model?: unknown; provider?: unknown }, label?: string, providerLabel?: string): void {
    if (!validId(route.model) || !validId(route.provider)) return;
    const value = { model: route.model, provider: route.provider }, id = key(value);
    if (this.options.has(id) && !label && !providerLabel) return;
    if (this.options.size >= 1024 && !this.options.has(id)) this.options.delete(this.options.keys().next().value!);
    this.options.set(id, { ...value, label: validId(label) ? label : value.model,
      providerLabel: validId(providerLabel) ? providerLabel : value.provider });
  }
  summary() { return { scope: this.store.value.scope, selectedCount: this.store.value.selections.length }; }
  view() {
    const available = new Map(this.options);
    for (const item of this.store.value.selections) if (!available.has(key(item))) available.set(key(item), {
      ...item, label: item.model, providerLabel: item.provider ?? '任意渠道（配置项）',
    });
    return { ...this.summary(), selections: this.store.value.selections.map(item => ({ ...item })),
      availableModels: [...available.values()].map(item => ({ ...item })),
      persistent: this.store.persistent, loadError: this.store.loadError, catalogError: this.catalogError };
  }
  set(input: unknown): Promise<ReturnType<ModelScopeStore['view']>> {
    const next = validateModelScope(input);
    return this.store.update(next, {
      afterWrite: () => {
        if (!this.store.disposed) this.changed();
        return this.view();
      },
    });
  }
  refresh(catalog?: ModelCatalog): Promise<ReturnType<ModelScopeStore['view']>> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      this.catalogError = false;
      try {
        if (!catalog?.listProviders || !catalog.listModels) return this.view();
        const providers = catalog.listProviders().filter(item => validId(item.id)).slice(0, 64);
        const results = await Promise.allSettled(providers.map(async provider => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const models = await Promise.race([catalog.listModels!(provider.id), new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('catalog unavailable')), 5000);
            })]);
            if (!this.store.disposed) for (const model of models.slice(0, 1024)) this.remember({ provider: provider.id, model: model.id }, model.name, provider.name);
          } finally { clearTimeout(timer); }
        }));
        this.catalogError = results.some(result => result.status === 'rejected');
      } catch { this.catalogError = true; }
      return this.view();
    })().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  close(): Promise<void> { return this.store.close(); }
}
