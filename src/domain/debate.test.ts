import { describe, expect, it } from 'vitest'
import {
  applyProviderConnectionResult,
  createDefaultProviderSettings,
  setProviderApiKey,
} from './aiProviders'
import {
  assignProviderToRole,
  createDefaultRoleAssignments,
} from './roleAssignments'
import {
  autoSelectArguments,
  createFinalRouteMap,
  createHumanPrepSession,
  generateArgumentDiscovery,
  getDebateFormatPresets,
} from './debate'
import type { HumanPrepConfig } from './types'

const baseConfig: HumanPrepConfig = {
  topic: '大学应不应该强制学生使用 AI 工具完成课程学习',
  side: 'affirmative',
  formatId: 'chinese-four-v-four',
  iterationCount: 3,
  strategyMode: 'ai-auto',
}

describe('human debate prep domain', () => {
  it('provides Chinese debate format presets with usable stage timelines', () => {
    const presets = getDebateFormatPresets()

    expect(presets).toHaveLength(3)
    expect(presets.map((preset) => preset.id)).toEqual([
      'chinese-four-v-four',
      'xin-guo-bian',
      'campus-quick',
    ])
    expect(presets[0].stages.map((stage) => stage.name)).toContain('自由辩论')
    expect(presets[1].stages.map((stage) => stage.name)).toContain('质询小结')
  })

  it('generates deterministic candidate argument cards and opponent likely arguments', () => {
    const first = generateArgumentDiscovery(baseConfig)
    const second = generateArgumentDiscovery(baseConfig)

    expect(first).toEqual(second)
    expect(first.candidateCards).toHaveLength(10)
    expect(first.candidateCards.every((card) => card.side === 'affirmative')).toBe(true)
    expect(first.candidateCards[0]).toMatchObject({
      claim: expect.stringContaining(baseConfig.topic),
      recommendedRole: 'primary',
    })
    expect(first.opponentLikelyArguments.length).toBeGreaterThanOrEqual(5)
    expect(first.opponentLikelyArguments[0].againstSide).toBe('affirmative')
  })

  it('auto-selects a three-argument main strategy and backup bank', () => {
    const discovery = generateArgumentDiscovery(baseConfig)
    const selection = autoSelectArguments(discovery.candidateCards)
    const affirmative = selection.sides[0]

    expect(affirmative.side).toBe('affirmative')
    expect(affirmative.primary).toHaveLength(3)
    expect(affirmative.backup.length).toBeGreaterThanOrEqual(3)
    expect(Object.values(selection.statusById).filter((status) => status === 'primary')).toHaveLength(3)
  })

  it('simulates configured iterations using the selected format stages', () => {
    const session = createHumanPrepSession(baseConfig)

    expect(session.iterations).toHaveLength(3)
    expect(session.iterations[0].timeline.map((stage) => stage.stageName)).toContain('正一立论')
    expect(session.iterations[0].worked.length).toBeGreaterThan(0)
    expect(session.iterations[1].replaced[0]).toMatch(/保留|降为/)
  })

  it('builds a final route map and exportable prep pack', () => {
    const session = createHumanPrepSession(baseConfig)
    const routeMap = createFinalRouteMap(session.selection, session.discovery.opponentLikelyArguments)
    const firstRoute = routeMap.routes[0]

    expect(firstRoute.coreArguments).toHaveLength(3)
    expect(firstRoute.openingStructure.join('\n')).toContain('先定判准')
    expect(routeMap.attackDefenseMap.length).toBeGreaterThanOrEqual(4)
    expect(routeMap.abandonedPreparedRoutes.length).toBeGreaterThan(0)
    expect(routeMap.evidenceChecklist.length).toBeGreaterThanOrEqual(6)
    expect(session.prepPack).toContain('# CaseMap 人类备赛包')
    expect(session.prepPack).toContain('## 攻防地图')
  })

  it('supports preparing both sides without changing deterministic behavior', () => {
    const bothConfig: HumanPrepConfig = {
      ...baseConfig,
      side: 'both',
      formatId: 'xin-guo-bian',
      iterationCount: 2,
      strategyMode: 'human-quick',
    }
    const session = createHumanPrepSession(bothConfig)

    expect(session.discovery.candidateCards).toHaveLength(20)
    expect(session.selection.sides.map((side) => side.side)).toEqual(['affirmative', 'negative'])
    expect(session.selection.sides.every((side) => side.primary.length === 3)).toBe(true)
    expect(session.iterations).toHaveLength(4)
    expect(session.finalRouteMap.routes).toHaveLength(2)
  })

  it('attaches provider role metadata to generated workflow results and labels fallback output', () => {
    const openAiKey = 'sk-proj-1234567890abcdefabcd'
    const googleKey = 'AIzaSyD1234567890abcdefabcd'
    let providerSettings = setProviderApiKey(createDefaultProviderSettings(), 'openai', openAiKey)
    providerSettings = setProviderApiKey(providerSettings, 'google', googleKey)
    providerSettings = applyProviderConnectionResult(providerSettings, 'openai', {
      checkedAt: '2026-04-25T00:00:00.000Z',
      message: 'OpenAI 连接成功',
      status: 'connected',
    })
    const roleAssignments = assignProviderToRole(
      assignProviderToRole(createDefaultRoleAssignments(), 'affirmative', 'openai'),
      'negative',
      'google',
    )

    const session = createHumanPrepSession(
      { ...baseConfig, side: 'both' },
      {},
      { providerSettings, roleAssignments },
    )
    const affirmativeCard = session.discovery.candidateCards.find((card) => card.side === 'affirmative')
    const negativeCard = session.discovery.candidateCards.find((card) => card.side === 'negative')

    expect(affirmativeCard?.generatedBy).toMatchObject({
      mode: 'provider',
      providerId: 'openai',
      providerName: 'OpenAI',
      role: 'affirmative',
    })
    expect(negativeCard?.generatedBy).toMatchObject({
      mode: 'local-fallback',
      providerId: 'google',
      providerName: 'Google Gemini',
      role: 'negative',
    })
    expect(session.iterations[0].generatedBy).toMatchObject({
      mode: 'provider',
      providerId: 'openai',
      role: 'attackSimulator',
    })
    expect(session.aiRun.roles.affirmative.label).toContain('OpenAI')
    expect(session.aiRun.roles.negative.reason).toContain('尚未测试')
    expect(session.prepPack).toContain('## AI 提供方记录')
    expect(session.prepPack).toContain('正方：OpenAI')
    expect(session.prepPack).not.toContain(openAiKey)
    expect(session.prepPack).not.toContain(googleKey)
  })
})
