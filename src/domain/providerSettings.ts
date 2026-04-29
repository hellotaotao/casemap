import {
  createDefaultProviderSettings,
  providerIds,
  type ProviderConfig,
  type ProviderConnectionStatus,
  type ProviderId,
  type ProviderSettings,
} from './aiProviders'

export type ProviderSettingsStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

export const providerSettingsStorageKey = 'casemap.provider-settings.v1'
const legacyProviderSettingsStorageKey = 'ai-debate-lab.provider-settings.v1'

const validStatuses = new Set<ProviderConnectionStatus>([
  'browser-blocked',
  'connected',
  'failed',
  'not-configured',
])

export function createProviderSettingsRepository(storage: ProviderSettingsStorage) {
  return {
    clear() {
      storage.removeItem(providerSettingsStorageKey)
      storage.removeItem(legacyProviderSettingsStorageKey)
    },
    load(): ProviderSettings {
      const raw = storage.getItem(providerSettingsStorageKey) ?? storage.getItem(legacyProviderSettingsStorageKey)

      if (!raw) return createDefaultProviderSettings()

      try {
        return normalizeProviderSettings(JSON.parse(raw))
      } catch {
        return createDefaultProviderSettings()
      }
    },
    save(settings: ProviderSettings) {
      storage.setItem(providerSettingsStorageKey, JSON.stringify(normalizeProviderSettings(settings)))
    },
  }
}

export function normalizeProviderSettings(value: unknown): ProviderSettings {
  const defaults = createDefaultProviderSettings()

  if (!isRecord(value) || !isRecord(value.providers)) return defaults

  const providerValues = value.providers
  const providers = providerIds.reduce((normalized, providerId) => {
    const candidate = providerValues[providerId]
    normalized[providerId] = normalizeProviderConfig(providerId, candidate, defaults.providers[providerId])
    return normalized
  }, {} as Record<ProviderId, ProviderConfig>)

  return { providers }
}

function normalizeProviderConfig(
  providerId: ProviderId,
  value: unknown,
  fallback: ProviderConfig,
): ProviderConfig {
  if (!isRecord(value)) return fallback

  const status = typeof value.status === 'string' && validStatuses.has(value.status as ProviderConnectionStatus)
    ? value.status as ProviderConnectionStatus
    : fallback.status
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey : fallback.apiKey
  const lastCheckedAt = typeof value.lastCheckedAt === 'string' ? value.lastCheckedAt : undefined
  const message = typeof value.message === 'string' ? value.message : undefined

  return {
    apiKey,
    providerId,
    status,
    ...(lastCheckedAt ? { lastCheckedAt } : {}),
    ...(message ? { message } : {}),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
