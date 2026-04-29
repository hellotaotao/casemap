import { describe, expect, it } from 'vitest'
import {
  createArgumentDiscoveryGenerationRequest,
  createLocalMockArgumentDiscoveryGenerator,
  generateArgumentDiscoveryWithFallback,
  type ArgumentDiscoveryGenerator,
} from './generation'
import type { HumanPrepConfig } from './types'

const baseConfig: HumanPrepConfig = {
  topic: '大学应不应该强制学生使用 AI 工具完成课程学习',
  side: 'affirmative',
  formatId: 'chinese-four-v-four',
  iterationCount: 3,
  strategyMode: 'ai-auto',
}

describe('argument discovery generation provider interface', () => {
  it('keeps a deterministic local mock generator as the fallback provider', async () => {
    const request = createArgumentDiscoveryGenerationRequest(baseConfig, {})
    const generator = createLocalMockArgumentDiscoveryGenerator()

    const first = await generator.generate(request)
    const second = await generator.generate(request)

    expect(first).toEqual(second)
    expect(first.providerId).toBe('local-mock')
    expect(first.fallbackUsed).toBe(false)
    expect(first.discovery.candidateCards).toHaveLength(10)
    expect(first.discovery.opponentLikelyArguments.length).toBeGreaterThanOrEqual(5)
  })

  it('falls back to local mock generation when a real provider fails', async () => {
    const request = createArgumentDiscoveryGenerationRequest(baseConfig, {})
    const failingProvider: ArgumentDiscoveryGenerator = {
      id: 'openai-dev',
      label: 'CaseMap OpenAI 生成接口',
      async generate() {
        throw new Error('Missing OPENAI_API_KEY')
      },
    }

    const result = await generateArgumentDiscoveryWithFallback(
      failingProvider,
      createLocalMockArgumentDiscoveryGenerator(),
      request,
    )

    expect(result.fallbackUsed).toBe(true)
    expect(result.providerId).toBe('local-mock')
    expect(result.message).toContain('Missing OPENAI_API_KEY')
    expect(result.discovery.candidateCards).toHaveLength(10)
  })
})
