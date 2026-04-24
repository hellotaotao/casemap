import { describe, expect, it } from 'vitest'
import { createArenaResult, createDebateSession } from './debate'
import type { ArenaConfig, DebateConfig } from './types'

const debateConfig: DebateConfig = {
  motion: 'AI debate tools should be used to prepare human debaters',
  proRole: 'Affirmative coach',
  conRole: 'Negative sparring partner',
  roundCount: 3,
  judgeStyle: 'policy',
}

const arenaConfig: ArenaConfig = {
  motion: 'AI model debates are a useful reasoning benchmark',
  modelA: 'GPT-5.5',
  modelB: 'Claude Strategy',
  roundCount: 2,
  judgeStyle: 'executive',
}

describe('debate workbench domain', () => {
  it('generates a usable prep session from a human debate configuration', () => {
    const session = createDebateSession(debateConfig)

    expect(session.config.motion).toBe(debateConfig.motion)
    expect(session.turns).toHaveLength(6)
    expect(session.judge.ballot.length).toBeGreaterThanOrEqual(3)
    expect(session.roadmap.attacks).toHaveLength(3)
    expect(session.roadmap.defenses).toHaveLength(3)
    expect(session.report).toContain('# AI Debate Lab Prep Report')
    expect(session.report).toContain('Cross-Ex Questions')
  })

  it('clamps debate rounds into a safe local prototype range', () => {
    const session = createDebateSession({ ...debateConfig, roundCount: 99 })

    expect(session.config.roundCount).toBe(5)
    expect(session.turns).toHaveLength(10)
  })

  it('runs a side-swapped model arena benchmark with a leaderboard', () => {
    const arena = createArenaResult(arenaConfig)

    expect(arena.matches).toHaveLength(2)
    expect(arena.matches[0].proModel).toBe('GPT-5.5')
    expect(arena.matches[0].conModel).toBe('Claude Strategy')
    expect(arena.matches[1].proModel).toBe('Claude Strategy')
    expect(arena.matches[1].conModel).toBe('GPT-5.5')
    expect(arena.leaderboard.map((entry) => entry.model).sort()).toEqual(['Claude Strategy', 'GPT-5.5'])
  })
})
