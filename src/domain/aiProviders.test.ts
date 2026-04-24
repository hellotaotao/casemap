import { describe, expect, it, vi } from 'vitest'
import {
  applyProviderConnectionResult,
  createDefaultProviderSettings,
  getProviderSummaries,
  maskApiKey,
  setProviderApiKey,
  testProviderConnectivity,
} from './aiProviders'
import { createProviderSettingsRepository } from './providerSettings'

function createMemoryStorage(): Pick<Storage, 'getItem' | 'removeItem' | 'setItem'> {
  const values = new Map<string, string>()

  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => {
      values.delete(key)
    },
    setItem: (key, value) => {
      values.set(key, value)
    },
  }
}

describe('AI provider settings', () => {
  it('persists user supplied API keys locally while only exposing masked summaries', () => {
    const repository = createProviderSettingsRepository(createMemoryStorage())
    const key = 'sk-proj-1234567890abcdefabcd'

    const withKey = setProviderApiKey(repository.load(), 'openai', key)
    repository.save(withKey)

    const loaded = repository.load()
    const summaries = getProviderSummaries(loaded)
    const openAiSummary = summaries.find((summary) => summary.providerId === 'openai')

    expect(loaded.providers.openai.apiKey).toBe(key)
    expect(maskApiKey(key)).toBe('sk-...abcd')
    expect(openAiSummary).toMatchObject({
      configured: true,
      displayName: 'OpenAI',
      maskedKey: 'sk-...abcd',
      status: 'not-configured',
      statusLabel: '未测试',
    })
    expect(JSON.stringify(summaries)).not.toContain(key)
  })

  it('stores provider connectivity state separately from the secret value', () => {
    const settings = setProviderApiKey(createDefaultProviderSettings(), 'xai', 'xai-1234567890abcdefabcd')
    const connected = applyProviderConnectionResult(settings, 'xai', {
      checkedAt: '2026-04-25T00:00:00.000Z',
      message: 'xAI Grok 连接成功',
      status: 'connected',
    })
    const xaiSummary = getProviderSummaries(connected).find((summary) => summary.providerId === 'xai')

    expect(connected.providers.xai.apiKey).toBe('xai-1234567890abcdefabcd')
    expect(xaiSummary).toMatchObject({
      configured: true,
      lastCheckedAt: '2026-04-25T00:00:00.000Z',
      status: 'connected',
      statusLabel: '已连接',
    })
    expect(JSON.stringify(xaiSummary)).not.toContain('xai-1234567890abcdefabcd')
  })
})

describe('AI provider connectivity adapters', () => {
  it('validates key format before attempting network connectivity', async () => {
    const fetcher = vi.fn()

    const result = await testProviderConnectivity('openai', 'not-a-real-key', fetcher)

    expect(fetcher).not.toHaveBeenCalled()
    expect(result.status).toBe('failed')
    expect(result.message).toContain('格式')
  })

  it('uses provider specific request shapes for model-list connectivity checks', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ data: [] }),
    })
    const key = 'sk-ant-api03-1234567890abcdefabcd'

    const result = await testProviderConnectivity(
      'anthropic',
      key,
      fetcher,
      () => new Date('2026-04-25T00:00:00.000Z'),
    )

    expect(result).toEqual({
      checkedAt: '2026-04-25T00:00:00.000Z',
      message: 'Claude 连接成功',
      status: 'connected',
    })
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'anthropic-dangerous-direct-browser-access': 'true',
          'anthropic-version': '2023-06-01',
          'x-api-key': key,
        }),
      }),
    )
  })

  it('classifies browser CORS/network blocking as browser-blocked', async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await testProviderConnectivity('google', 'AIzaSyD1234567890abcdefabcd', fetcher)

    expect(result.status).toBe('browser-blocked')
    expect(result.message).toContain('浏览器')
  })
})
