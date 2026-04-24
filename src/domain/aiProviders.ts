export type ProviderId = 'openai' | 'anthropic' | 'google' | 'xai'

export type ProviderConnectionStatus = 'not-configured' | 'connected' | 'failed' | 'browser-blocked'

export type ProviderDefinition = {
  id: ProviderId
  displayName: string
  modelFamily: string
  keyHint: string
}

export type ProviderConfig = {
  providerId: ProviderId
  apiKey: string
  status: ProviderConnectionStatus
  lastCheckedAt?: string
  message?: string
}

export type ProviderSettings = {
  providers: Record<ProviderId, ProviderConfig>
}

export type ProviderConnectionResult = {
  status: ProviderConnectionStatus
  message: string
  checkedAt?: string
}

export type ProviderSummary = {
  providerId: ProviderId
  displayName: string
  modelFamily: string
  configured: boolean
  maskedKey: string
  status: ProviderConnectionStatus
  statusLabel: string
  lastCheckedAt?: string
  message?: string
}

type ConnectivityResponse = Pick<Response, 'json' | 'ok' | 'status' | 'statusText'>

export type ProviderFetch = (url: string, init: RequestInit) => Promise<ConnectivityResponse>

export const AI_PROVIDERS: ProviderDefinition[] = [
  {
    id: 'openai',
    displayName: 'OpenAI',
    modelFamily: 'GPT',
    keyHint: '以 sk- 或 sk-proj- 开头',
  },
  {
    id: 'anthropic',
    displayName: 'Claude',
    modelFamily: 'Anthropic',
    keyHint: '以 sk-ant- 开头',
  },
  {
    id: 'google',
    displayName: 'Google Gemini',
    modelFamily: 'Gemini',
    keyHint: '通常以 AIza 开头',
  },
  {
    id: 'xai',
    displayName: 'xAI Grok',
    modelFamily: 'Grok',
    keyHint: '以 xai- 开头',
  },
]

export const providerIds: ProviderId[] = AI_PROVIDERS.map((provider) => provider.id)

const statusLabels: Record<ProviderConnectionStatus, string> = {
  'browser-blocked': '浏览器阻止',
  connected: '已连接',
  failed: '失败',
  'not-configured': '未配置',
}

export function createDefaultProviderSettings(): ProviderSettings {
  return {
    providers: AI_PROVIDERS.reduce(
      (providers, provider) => ({
        ...providers,
        [provider.id]: {
          apiKey: '',
          providerId: provider.id,
          status: 'not-configured' as const,
        },
      }),
      {} as Record<ProviderId, ProviderConfig>,
    ),
  }
}

export function getProviderDefinition(providerId: ProviderId): ProviderDefinition {
  return AI_PROVIDERS.find((provider) => provider.id === providerId) ?? AI_PROVIDERS[0]
}

export function setProviderApiKey(
  settings: ProviderSettings,
  providerId: ProviderId,
  apiKey: string,
): ProviderSettings {
  const trimmedKey = apiKey.trim()
  const previous = settings.providers[providerId] ?? createDefaultProviderSettings().providers[providerId]
  const keyChanged = previous.apiKey !== trimmedKey
  const nextStatus: ProviderConnectionStatus = trimmedKey && !keyChanged ? previous.status : 'not-configured'

  return {
    providers: {
      ...settings.providers,
      [providerId]: {
        apiKey: trimmedKey,
        providerId,
        status: nextStatus,
        ...(trimmedKey && !keyChanged && previous.lastCheckedAt ? { lastCheckedAt: previous.lastCheckedAt } : {}),
        ...(trimmedKey && !keyChanged && previous.message ? { message: previous.message } : {}),
      },
    },
  }
}

export function applyProviderConnectionResult(
  settings: ProviderSettings,
  providerId: ProviderId,
  result: ProviderConnectionResult,
): ProviderSettings {
  const previous = settings.providers[providerId] ?? createDefaultProviderSettings().providers[providerId]

  return {
    providers: {
      ...settings.providers,
      [providerId]: {
        ...previous,
        providerId,
        status: result.status,
        ...(result.checkedAt ? { lastCheckedAt: result.checkedAt } : {}),
        message: result.message,
      },
    },
  }
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim()

  if (!trimmed) return ''
  if (trimmed.length <= 8) return '已保存'

  const prefix = trimmed.startsWith('xai-') ? trimmed.slice(0, 4) : trimmed.slice(0, 3)
  return `${prefix}...${trimmed.slice(-4)}`
}

export function getProviderSummaries(settings: ProviderSettings): ProviderSummary[] {
  return AI_PROVIDERS.map((provider) => {
    const config = settings.providers[provider.id] ?? createDefaultProviderSettings().providers[provider.id]
    const configured = config.apiKey.trim().length > 0

    return {
      configured,
      displayName: provider.displayName,
      lastCheckedAt: config.lastCheckedAt,
      maskedKey: configured ? maskApiKey(config.apiKey) : '',
      message: config.message,
      modelFamily: provider.modelFamily,
      providerId: provider.id,
      status: config.status,
      statusLabel: config.status === 'not-configured' && configured ? '未测试' : statusLabels[config.status],
    }
  })
}

export function validateProviderApiKey(providerId: ProviderId, apiKey: string): { ok: boolean; message?: string } {
  const key = apiKey.trim()
  const provider = getProviderDefinition(providerId)

  if (!key) {
    return { ok: false, message: `请先填写 ${provider.displayName} API Key。` }
  }

  const isValid = (() => {
    switch (providerId) {
      case 'anthropic':
        return /^sk-ant-[A-Za-z0-9_-]{12,}$/.test(key)
      case 'google':
        return /^AIza[A-Za-z0-9_-]{16,}$/.test(key)
      case 'openai':
        return /^sk-[A-Za-z0-9_-]{16,}$/.test(key)
      case 'xai':
        return /^xai-[A-Za-z0-9_-]{12,}$/.test(key)
    }
  })()

  if (!isValid) {
    return { ok: false, message: `${provider.displayName} API Key 格式看起来不对：${provider.keyHint}。` }
  }

  return { ok: true }
}

export function createProviderConnectivityRequest(providerId: ProviderId, apiKey: string): { init: RequestInit; url: string } {
  const key = apiKey.trim()

  switch (providerId) {
    case 'anthropic':
      return {
        init: {
          headers: {
            'anthropic-dangerous-direct-browser-access': 'true',
            'anthropic-version': '2023-06-01',
            'x-api-key': key,
          },
          method: 'GET',
        },
        url: 'https://api.anthropic.com/v1/models',
      }
    case 'google':
      return {
        init: {
          headers: {},
          method: 'GET',
        },
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
      }
    case 'openai':
      return {
        init: {
          headers: {
            Authorization: `Bearer ${key}`,
          },
          method: 'GET',
        },
        url: 'https://api.openai.com/v1/models',
      }
    case 'xai':
      return {
        init: {
          headers: {
            Authorization: `Bearer ${key}`,
          },
          method: 'GET',
        },
        url: 'https://api.x.ai/v1/models',
      }
  }
}

export async function testProviderConnectivity(
  providerId: ProviderId,
  apiKey: string,
  fetcher: ProviderFetch,
  now: () => Date = () => new Date(),
): Promise<ProviderConnectionResult> {
  const provider = getProviderDefinition(providerId)
  const validation = validateProviderApiKey(providerId, apiKey)

  if (!validation.ok) {
    return {
      message: validation.message ?? `${provider.displayName} API Key 格式看起来不对。`,
      status: apiKey.trim() ? 'failed' : 'not-configured',
    }
  }

  const checkedAt = now().toISOString()
  const request = createProviderConnectivityRequest(providerId, apiKey)

  try {
    const response = await fetcher(request.url, request.init)

    if (response.ok) {
      return {
        checkedAt,
        message: `${provider.displayName} 连接成功`,
        status: 'connected',
      }
    }

    return {
      checkedAt,
      message: createHttpFailureMessage(provider.displayName, response),
      status: 'failed',
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (error instanceof TypeError || /failed to fetch|cors|network/i.test(message)) {
      return {
        checkedAt,
        message: `${provider.displayName} 请求被浏览器或网络策略阻止。已保留配置，并可使用本地 fallback。`,
        status: 'browser-blocked',
      }
    }

    return {
      checkedAt,
      message: `${provider.displayName} 连接失败：${message}`,
      status: 'failed',
    }
  }
}

function createHttpFailureMessage(displayName: string, response: Pick<Response, 'status' | 'statusText'>): string {
  if (response.status === 401 || response.status === 403) {
    return `${displayName} 拒绝了这个 API Key，请检查密钥或权限。`
  }

  const statusText = response.statusText ? ` ${response.statusText}` : ''
  return `${displayName} 连接失败：HTTP ${response.status}${statusText}。`
}
