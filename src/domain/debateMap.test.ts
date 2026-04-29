import { describe, expect, it } from 'vitest'
import { createDebateMap } from './debateMap'
import {
  createFinalRouteMap,
  createHumanPrepSession,
  generateArgumentDiscovery,
  autoSelectArguments,
} from './debate'
import type { HumanPrepConfig } from './types'

const baseConfig: HumanPrepConfig = {
  topic: '大学应不应该强制学生使用 AI 工具完成课程学习',
  side: 'affirmative',
  formatId: 'chinese-four-v-four',
  iterationCount: 3,
  strategyMode: 'ai-auto',
}

describe('structured debate map domain', () => {
  it('derives a central motion, side node, argument nodes, attacks, defenses, evidence gaps and free debate prompts', () => {
    const session = createHumanPrepSession(baseConfig)
    const map = session.debateMap

    expect(map.motion).toBe(baseConfig.topic)
    expect(map.centralConflict).toContain('正方')
    expect(map.sideNodes).toHaveLength(1)
    expect(map.sideNodes[0]).toMatchObject({
      label: '正方',
      side: 'affirmative',
    })
    expect(map.sideNodes[0].coreArgumentIds).toHaveLength(3)
    expect(map.argumentNodes.filter((node) => node.status === 'primary')).toHaveLength(3)
    expect(map.attackNodes.length).toBeGreaterThanOrEqual(4)
    expect(map.defenseLinks).toHaveLength(map.attackNodes.length)
    expect(map.evidenceGaps.length).toBeGreaterThanOrEqual(map.argumentNodes.length)
    expect(map.freeDebatePrompts).toHaveLength(map.defenseLinks.length)
    expect(map.freeDebatePrompts[0].prompt).toContain('自由辩追问')
  })

  it('keeps defense links referentially valid for both sides', () => {
    const session = createHumanPrepSession({ ...baseConfig, side: 'both' })
    const argumentIds = new Set(session.debateMap.argumentNodes.map((node) => node.id))
    const attackIds = new Set(session.debateMap.attackNodes.map((node) => node.id))
    const promptIds = new Set(session.debateMap.freeDebatePrompts.map((prompt) => prompt.id))

    expect(session.debateMap.sideNodes.map((node) => node.side)).toEqual(['affirmative', 'negative'])
    for (const link of session.debateMap.defenseLinks) {
      expect(argumentIds.has(link.toArgumentId)).toBe(true)
      expect(attackIds.has(link.fromAttackId)).toBe(true)
      expect(promptIds.has(link.freeDebatePromptId)).toBe(true)
    }
  })

  it('can be derived independently from existing discovery and route-map data', () => {
    const discovery = generateArgumentDiscovery(baseConfig)
    const selection = autoSelectArguments(discovery.candidateCards)
    const finalRouteMap = createFinalRouteMap(selection, discovery.opponentLikelyArguments)
    const map = createDebateMap({
      config: baseConfig,
      finalRouteMap,
      opponentLikelyArguments: discovery.opponentLikelyArguments,
      selection,
    })

    expect(map.motion).toBe(baseConfig.topic)
    expect(map.argumentNodes[0].evidenceGapId).toBeTruthy()
    expect(map.defenseLinks[0].response).toContain('防守')
  })
})
