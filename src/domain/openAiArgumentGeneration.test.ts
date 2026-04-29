import { describe, expect, it } from 'vitest'
import { createArgumentDiscoveryGenerationRequest } from './generation'
import {
  buildOpenAiArgumentDiscoveryPrompt,
  defaultOpenAiArgumentModel,
  parseOpenAiArgumentDiscoveryResponse,
  parseJsonContent,
  resolveOpenAiArgumentModel,
} from './openAiArgumentGeneration'
import type { HumanPrepConfig } from './types'

const baseConfig: HumanPrepConfig = {
  topic: '大学应不应该强制学生使用 AI 工具完成课程学习',
  side: 'affirmative',
  formatId: 'chinese-four-v-four',
  iterationCount: 3,
  strategyMode: 'ai-auto',
}

const openAiFixture = {
  candidateCards: [
    {
      side: 'affirmative',
      title: '学习公平底线',
      claim: '强制使用 AI 可以把工具能力变成公共基础设施，而不是少数学生的隐性优势。',
      whyItMatters: '它直接回应教育机会是否被技术差距拉开。',
      evidenceType: '学校工具覆盖率、学生访谈、课程通过率变化',
      strongestAttack: '对方会说强制会惩罚不熟悉 AI 的学生。',
      bestDefense: '强制必须配套培训和可替代流程，重点是统一起跑线。',
      strengthScore: 86,
      riskScore: 42,
      recommendedRole: 'primary',
    },
    {
      side: 'affirmative',
      title: '真实工作迁移',
      claim: '大学课程应训练学生未来真实工作中的 AI 协作能力。',
      whyItMatters: '课程目标不是隔离工具，而是培养可迁移能力。',
      evidenceType: '招聘要求、岗位技能画像、课程评价',
      strongestAttack: '对方会质疑大学是否应该追逐短期工具潮流。',
      bestDefense: '把 AI 作为方法论训练，而不是绑定某个产品。',
      strengthScore: 78,
      riskScore: 35,
      recommendedRole: 'backup',
    },
  ],
  opponentLikelyArguments: [
    {
      againstSide: 'affirmative',
      side: 'negative',
      title: '学术诚信稀释',
      claim: '强制使用 AI 会让学生更难证明作业体现自己的能力。',
      likelyStage: '反一立论',
      threatScore: 82,
      responseHint: '把诚信问题转成评估设计问题，而不是工具禁用问题。',
    },
  ],
}

describe('OpenAI argument discovery prompt and parser', () => {
  it('uses gpt-5.4 as the default cost/performance OpenAI argument model', () => {
    expect(defaultOpenAiArgumentModel).toBe('gpt-5.4')
  })

  it('resolves the server-side OpenAI argument model with a constrained quality override', () => {
    expect(resolveOpenAiArgumentModel({})).toEqual({
      model: 'gpt-5.4',
      source: 'default',
    })
    expect(resolveOpenAiArgumentModel({ OPENAI_MODEL: 'gpt-5.5' })).toEqual({
      model: 'gpt-5.5',
      source: 'OPENAI_MODEL',
    })
    expect(resolveOpenAiArgumentModel({ CASEMAP_OPENAI_MODEL: 'gpt-5.5', OPENAI_MODEL: 'gpt-5.4' })).toEqual({
      model: 'gpt-5.5',
      source: 'CASEMAP_OPENAI_MODEL',
    })
    expect(resolveOpenAiArgumentModel({ AI_DEBATE_OPENAI_MODEL: 'gpt-5.5', OPENAI_MODEL: 'gpt-5.4' })).toEqual({
      model: 'gpt-5.5',
      source: 'AI_DEBATE_OPENAI_MODEL',
    })

    const invalidOverride = resolveOpenAiArgumentModel({ CASEMAP_OPENAI_MODEL: 'gpt-unknown' })

    expect(invalidOverride.model).toBe('gpt-5.4')
    expect(invalidOverride.warning).toContain('不支持')
  })

  it('builds a structured JSON prompt for the current motion, format, sides and roles', () => {
    const request = createArgumentDiscoveryGenerationRequest(baseConfig, {})
    const prompt = buildOpenAiArgumentDiscoveryPrompt(request)

    expect(prompt.messages).toHaveLength(2)
    expect(prompt.messages[1].content).toContain(baseConfig.topic)
    expect(prompt.messages[1].content).toContain('candidateCards')
    expect(prompt.schema.required).toEqual(['candidateCards', 'opponentLikelyArguments'])
  })

  it('parses fenced OpenAI JSON into validated app argument discovery objects', () => {
    const request = createArgumentDiscoveryGenerationRequest(baseConfig, {})
    const discovery = parseOpenAiArgumentDiscoveryResponse(
      `\n\`\`\`json\n${JSON.stringify(openAiFixture)}\n\`\`\``,
      request,
      // Explicit model overrides still support a quality-first gpt-5.5 path.
      { model: 'gpt-5.5' },
    )

    expect(discovery.candidateCards).toHaveLength(2)
    expect(discovery.candidateCards[0]).toMatchObject({
      generatedBy: {
        mode: 'provider',
        providerId: 'openai',
        providerName: 'OpenAI',
        role: 'affirmative',
      },
      recommendedRole: 'primary',
      side: 'affirmative',
      strengthScore: 86,
      title: '学习公平底线',
    })
    expect(discovery.candidateCards[0].id).toMatch(/^ai-arg-affirmative-/)
    expect(discovery.opponentLikelyArguments[0]).toMatchObject({
      againstSide: 'affirmative',
      generatedBy: {
        mode: 'provider',
        providerId: 'openai',
        role: 'attackSimulator',
      },
      side: 'negative',
      threatScore: 82,
    })
  })

  it('rejects malformed OpenAI payloads with clear validation errors', () => {
    const request = createArgumentDiscoveryGenerationRequest(baseConfig, {})

    expect(() => parseOpenAiArgumentDiscoveryResponse('{"candidateCards": []}', request)).toThrow(
      /opponentLikelyArguments/,
    )
    expect(() => parseJsonContent('not json')).toThrow(/JSON/)
  })
})
