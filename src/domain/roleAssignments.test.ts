import { describe, expect, it } from 'vitest'
import {
  applyProviderConnectionResult,
  createDefaultProviderSettings,
  setProviderApiKey,
} from './aiProviders'
import {
  assignProviderToRole,
  createDefaultRoleAssignments,
  createRoleAssignmentsRepository,
  getRoleAssignmentChoices,
  resolveRoleGenerationSources,
} from './roleAssignments'

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

describe('debate role provider assignments', () => {
  it('persists role assignments and offers Auto plus configured providers', () => {
    const repository = createRoleAssignmentsRepository(createMemoryStorage())
    const assignments = assignProviderToRole(createDefaultRoleAssignments(), 'affirmative', 'openai')
    const settings = setProviderApiKey(createDefaultProviderSettings(), 'openai', 'sk-proj-1234567890abcdefabcd')

    repository.save(assignments)

    expect(repository.load().affirmative).toBe('openai')
    expect(repository.load().negative).toBe('auto')
    expect(getRoleAssignmentChoices(settings).map((choice) => choice.value)).toEqual(['auto', 'openai'])
  })

  it('resolves connected providers and unavailable providers into generation metadata', () => {
    const openAiKey = 'sk-proj-1234567890abcdefabcd'
    const googleKey = 'AIzaSyD1234567890abcdefabcd'
    let settings = setProviderApiKey(createDefaultProviderSettings(), 'openai', openAiKey)
    settings = setProviderApiKey(settings, 'google', googleKey)
    settings = applyProviderConnectionResult(settings, 'openai', {
      checkedAt: '2026-04-25T00:00:00.000Z',
      message: 'OpenAI 连接成功',
      status: 'connected',
    })
    const assignments = assignProviderToRole(
      assignProviderToRole(createDefaultRoleAssignments(), 'affirmative', 'openai'),
      'negative',
      'google',
    )

    const sources = resolveRoleGenerationSources(assignments, settings)

    expect(sources.affirmative).toMatchObject({
      mode: 'provider',
      providerId: 'openai',
      providerName: 'OpenAI',
      role: 'affirmative',
      status: 'connected',
    })
    expect(sources.negative).toMatchObject({
      mode: 'local-fallback',
      providerId: 'google',
      providerName: 'Google Gemini',
      reason: expect.stringContaining('尚未测试'),
      role: 'negative',
    })
    expect(JSON.stringify(sources)).not.toContain(openAiKey)
    expect(JSON.stringify(sources)).not.toContain(googleKey)
  })
})
