import {
  ArenaConfig,
  ArenaMatch,
  ArenaResult,
  AttackDefenseRoadmap,
  DebateConfig,
  DebateSession,
  DebateSide,
  DebateTurn,
  JudgeResult,
  JudgeStyle,
  LeaderboardEntry,
  RoadmapItem,
  SideScore,
} from './types'
import { cleanMotion, createSeededRandom, pickOne, scoreBetween, slugify, stableHash } from './deterministic'

const openingFrames = [
  'defines the core clash around incentives, enforcement, and public trust',
  'centers the round on comparative harms and the burden of proof',
  'turns the motion into a practical test of feasibility and accountability',
  'frames the debate as a choice between managed transition and unmanaged risk',
]

const warrants = [
  'because institutions respond most reliably when incentives and accountability are aligned',
  'because the highest-risk stakeholders are also the least able to absorb policy failure',
  'because predictable rules lower uncertainty and make trade-offs visible before adoption',
  'because voluntary coordination tends to fail when benefits are private but harms are public',
  'because legitimacy depends on whether ordinary people can understand and contest outcomes',
]

const evidenceTypes = [
  'a comparative case study',
  'a stakeholder map',
  'a risk register',
  'implementation benchmarks',
  'historical adoption curves',
  'public opinion and compliance data',
]

const impacts = [
  'shifts the judge toward the side with the more resilient world after implementation',
  'matters because the losing side cannot repair the harm after the policy window closes',
  'creates a weighing mechanism for probability, magnitude, and reversibility',
  'gives the team a concrete way to compare near-term costs against long-term legitimacy',
]

const attackAngles = [
  'press the missing enforcement mechanism',
  'challenge the assumed stakeholder incentives',
  'force a comparison against the best available alternative',
  'ask who bears transition costs',
  'test whether the claimed benefit survives a realistic rollout',
  'separate symbolic gains from measurable outcomes',
]

const defenseAngles = [
  'concede a narrow implementation cost, then outweigh on systemic risk',
  'anchor the claim in actors that already have capacity to comply',
  'use phased adoption to reduce the strongest feasibility objection',
  'turn the objection into proof that governance is needed',
  'show why the counterplan depends on the same mechanism it criticizes',
]

const judgeWeights: Record<JudgeStyle, Partial<Omit<SideScore, 'total'>>> = {
  policy: { evidence: 2, impact: 2 },
  parliamentary: { clarity: 2, strategy: 2 },
  socratic: { rebuttal: 2, clarity: 2 },
  executive: { strategy: 2, impact: 2 },
}

const judgeNames: Record<JudgeStyle, string> = {
  policy: 'Policy Judge',
  parliamentary: 'Parliamentary Judge',
  socratic: 'Socratic Judge',
  executive: 'Executive Judge',
}

export function createDebateSession(config: DebateConfig): DebateSession {
  const normalizedConfig = normalizeDebateConfig(config)
  const seedText = JSON.stringify(normalizedConfig)
  const random = createSeededRandom(seedText)
  const turns = generateDebateTurns(normalizedConfig, random)
  const judge = judgeDebate(normalizedConfig, turns)
  const roadmap = createRoadmap(normalizedConfig, turns, judge)
  const id = `debate-${slugify(normalizedConfig.motion)}-${stableHash(seedText).toString(16)}`
  const session: DebateSession = {
    id,
    config: normalizedConfig,
    turns,
    judge,
    roadmap,
    report: '',
  }

  return {
    ...session,
    report: exportPrepReport(session),
  }
}

export function createArenaResult(config: ArenaConfig): ArenaResult {
  const normalized: ArenaConfig = {
    motion: cleanMotion(config.motion),
    modelA: config.modelA.trim() || 'Model A',
    modelB: config.modelB.trim() || 'Model B',
    roundCount: clampRoundCount(config.roundCount),
    judgeStyle: config.judgeStyle,
  }

  const first = createArenaMatch(normalized, normalized.modelA, normalized.modelB, 1)
  const second = createArenaMatch(normalized, normalized.modelB, normalized.modelA, 2)
  const matches = [first, second]

  return {
    config: normalized,
    matches,
    leaderboard: createLeaderboard(matches, [normalized.modelA, normalized.modelB]),
  }
}

export function normalizeDebateConfig(config: DebateConfig): DebateConfig {
  return {
    motion: cleanMotion(config.motion),
    proRole: config.proRole.trim() || 'Affirmative prep partner',
    conRole: config.conRole.trim() || 'Negative sparring partner',
    roundCount: clampRoundCount(config.roundCount),
    judgeStyle: config.judgeStyle,
  }
}

export function clampRoundCount(roundCount: number): number {
  return Math.max(1, Math.min(5, Math.round(roundCount || 3)))
}

export function generateDebateTurns(config: DebateConfig, random = createSeededRandom(JSON.stringify(config))): DebateTurn[] {
  const turns: DebateTurn[] = []

  for (let round = 1; round <= config.roundCount; round += 1) {
    turns.push(createTurn(config, 'pro', round, random))
    turns.push(createTurn(config, 'con', round, random))
  }

  return turns
}

export function judgeDebate(config: DebateConfig, turns: DebateTurn[]): JudgeResult {
  const proSeed = turns
    .filter((turn) => turn.side === 'pro')
    .map((turn) => `${turn.claim} ${turn.attacks.join(' ')}`)
    .join('|')
  const conSeed = turns
    .filter((turn) => turn.side === 'con')
    .map((turn) => `${turn.claim} ${turn.defenses.join(' ')}`)
    .join('|')
  const pro = createSideScore(`${config.motion}|${config.judgeStyle}|pro|${proSeed}`)
  const con = createSideScore(`${config.motion}|${config.judgeStyle}|con|${conSeed}`)
  const margin = Math.abs(pro.total - con.total)
  const winner = margin <= 2 ? 'tie' : pro.total > con.total ? 'pro' : 'con'
  const proLabel = config.proRole
  const conLabel = config.conRole
  const leadingLabel = winner === 'tie' ? 'neither side' : winner === 'pro' ? proLabel : conLabel

  return {
    style: config.judgeStyle,
    pro,
    con,
    winner,
    margin,
    ballot: [
      `${judgeNames[config.judgeStyle]} values ${describeJudgePreference(config.judgeStyle)} in this round.`,
      `${leadingLabel} controls the better comparison on ${pickBallotIssue(config, winner)}.`,
      `The prep gap is ${winner === 'tie' ? 'sharpening weighing language' : 'answering the strongest conceded risk'} before live delivery.`,
    ],
  }
}

export function createRoadmap(
  config: DebateConfig,
  turns: DebateTurn[],
  judge: JudgeResult,
): AttackDefenseRoadmap {
  const proOpening = turns.find((turn) => turn.side === 'pro')
  const conOpening = turns.find((turn) => turn.side === 'con')
  const topAttack = conOpening?.attacks[0] ?? 'force a clear mechanism comparison'
  const topDefense = proOpening?.defenses[0] ?? 'narrow the claim and outweigh on durable benefits'

  return {
    thesis: `Prep should make "${config.motion}" a contest over mechanism, stakeholder burden, and judge weighing.`,
    attacks: [
      roadmapItem('Mechanism pressure', `${config.conRole} should ${topAttack} and demand operational details.`, 'con', 'high'),
      roadmapItem('Cost allocation', `Ask which group pays first and whether the ${config.proRole} case protects them.`, 'con', 'high'),
      roadmapItem('Alternative world', 'Compare against a narrower counterplan instead of only rejecting the motion.', 'con', 'medium'),
    ],
    defenses: [
      roadmapItem('Feasibility bridge', `${config.proRole} should ${topDefense}.`, 'pro', 'high'),
      roadmapItem('Impact weighing', 'Pre-write probability, magnitude, and reversibility comparisons for the final speech.', 'pro', 'high'),
      roadmapItem('Concession discipline', 'Concede small transition costs only when they unlock a larger governance benefit.', 'pro', 'medium'),
    ],
    crossExamination: [
      roadmapItem('Actor test', 'Which actor has authority, incentive, and budget to implement the preferred world?', 'neutral', 'high'),
      roadmapItem('Failure mode', 'What happens if compliance is partial rather than perfect?', 'neutral', 'medium'),
      roadmapItem('Metric lock', 'What measurable outcome would prove the side wrong after one year?', 'neutral', 'medium'),
    ],
    prepPriorities: [
      roadmapItem('Evidence packet', 'Collect one concrete example, one comparative benchmark, and one affected stakeholder quote.', 'neutral', 'high'),
      roadmapItem('Judge adaptation', `Tune summary language for ${judgeNames[judge.style].toLowerCase()} expectations.`, 'neutral', 'medium'),
      roadmapItem('Final two minutes', `Write a ballot story that explains why ${judge.winner === 'tie' ? 'your side resolves the closest issue' : 'the judge should preserve the current winner'}.`, 'neutral', 'high'),
    ],
  }
}

export function exportPrepReport(session: Omit<DebateSession, 'report'>): string {
  const { config, judge, roadmap, turns } = session
  const winnerLabel = judge.winner === 'tie' ? 'Tie' : judge.winner === 'pro' ? config.proRole : config.conRole

  return [
    `# AI Debate Lab Prep Report`,
    ``,
    `Motion: ${config.motion}`,
    `Roles: ${config.proRole} vs ${config.conRole}`,
    `Rounds: ${config.roundCount}`,
    `Judge style: ${judgeNames[config.judgeStyle]}`,
    ``,
    `## Judge Ballot`,
    `Winner: ${winnerLabel}`,
    `Score: ${judge.pro.total}-${judge.con.total}`,
    ...judge.ballot.map((line) => `- ${line}`),
    ``,
    `## Attack-Defense Roadmap`,
    roadmap.thesis,
    ...roadmap.attacks.map((item) => `- Attack: ${item.label} - ${item.detail}`),
    ...roadmap.defenses.map((item) => `- Defense: ${item.label} - ${item.detail}`),
    ``,
    `## Turn Sheet`,
    ...turns.flatMap((turn) => [
      `### Round ${turn.round} ${turn.side === 'pro' ? 'Pro' : 'Con'} - ${turn.role}`,
      `Claim: ${turn.claim}`,
      `Warrant: ${turn.warrant}`,
      `Evidence to prep: ${turn.evidence}`,
      `Impact: ${turn.impact}`,
      `Attack: ${turn.attacks.join('; ')}`,
      `Defense: ${turn.defenses.join('; ')}`,
      ``,
    ]),
    `## Cross-Ex Questions`,
    ...roadmap.crossExamination.map((item) => `- ${item.detail}`),
  ].join('\n')
}

function createArenaMatch(config: ArenaConfig, proModel: string, conModel: string, index: number): ArenaMatch {
  const debate = createDebateSession({
    motion: config.motion,
    proRole: proModel,
    conRole: conModel,
    roundCount: config.roundCount,
    judgeStyle: config.judgeStyle,
  })

  const winner = debate.judge.winner === 'tie' ? 'tie' : debate.judge.winner === 'pro' ? proModel : conModel

  return {
    id: `arena-${index}-${stableHash(`${config.motion}|${proModel}|${conModel}`).toString(16)}`,
    proModel,
    conModel,
    proScore: debate.judge.pro.total,
    conScore: debate.judge.con.total,
    winner,
    judge: debate.judge,
  }
}

function createLeaderboard(matches: ArenaMatch[], models: string[]): LeaderboardEntry[] {
  return models
    .map((model) => {
      let score = 0
      let wins = 0
      let losses = 0
      let ties = 0
      let marginTotal = 0

      for (const match of matches) {
        const isPro = match.proModel === model
        const sideScore = isPro ? match.proScore : match.conScore
        const opponentScore = isPro ? match.conScore : match.proScore
        score += sideScore
        marginTotal += sideScore - opponentScore

        if (match.winner === 'tie') ties += 1
        else if (match.winner === model) wins += 1
        else losses += 1
      }

      return {
        model,
        score,
        wins,
        losses,
        ties,
        avgMargin: Math.round((marginTotal / matches.length) * 10) / 10,
      }
    })
    .sort((left, right) => right.score - left.score || right.wins - left.wins)
}

function createTurn(config: DebateConfig, side: DebateSide, round: number, random: () => number): DebateTurn {
  const sideName = side === 'pro' ? 'Pro' : 'Con'
  const role = side === 'pro' ? config.proRole : config.conRole
  const motionReference = side === 'pro' ? `supporting "${config.motion}"` : `opposing "${config.motion}"`
  const framing = pickOne(openingFrames, random)
  const warrant = pickOne(warrants, random)
  const evidence = pickOne(evidenceTypes, random)
  const impact = pickOne(impacts, random)

  return {
    id: `${side}-${round}-${stableHash(`${config.motion}|${side}|${round}|${role}`).toString(16)}`,
    round,
    side,
    role,
    title: round === 1 ? `${sideName} constructive` : `${sideName} rebuttal ${round}`,
    claim: `${role} ${framing} while ${motionReference}.`,
    warrant: `The argument holds ${warrant}.`,
    evidence: `Prepare ${evidence} that links the motion to a concrete decision-maker.`,
    impact: `This ${impact}.`,
    attacks: [pickOne(attackAngles, random), pickOne(attackAngles, random)],
    defenses: [pickOne(defenseAngles, random), pickOne(defenseAngles, random)],
  }
}

function createSideScore(seedText: string): SideScore {
  const random = createSeededRandom(seedText)
  const base = {
    clarity: scoreBetween(random, 12, 20),
    evidence: scoreBetween(random, 12, 20),
    rebuttal: scoreBetween(random, 12, 20),
    impact: scoreBetween(random, 12, 20),
    strategy: scoreBetween(random, 12, 20),
  }
  const weight = judgeWeights[pickJudgeFromSeed(seedText)]
  const weighted = {
    clarity: base.clarity + (weight.clarity ?? 0),
    evidence: base.evidence + (weight.evidence ?? 0),
    rebuttal: base.rebuttal + (weight.rebuttal ?? 0),
    impact: base.impact + (weight.impact ?? 0),
    strategy: base.strategy + (weight.strategy ?? 0),
  }

  return {
    ...weighted,
    total: weighted.clarity + weighted.evidence + weighted.rebuttal + weighted.impact + weighted.strategy,
  }
}

function pickJudgeFromSeed(seedText: string): JudgeStyle {
  if (seedText.includes('|policy|')) return 'policy'
  if (seedText.includes('|parliamentary|')) return 'parliamentary'
  if (seedText.includes('|socratic|')) return 'socratic'
  return 'executive'
}

function describeJudgePreference(style: JudgeStyle): string {
  const preferences: Record<JudgeStyle, string> = {
    policy: 'evidence quality and impact calculus',
    parliamentary: 'clean framing and strategic collapse',
    socratic: 'direct clash and answer quality',
    executive: 'decision usefulness and implementation risk',
  }

  return preferences[style]
}

function pickBallotIssue(config: DebateConfig, winner: JudgeResult['winner']): string {
  if (winner === 'tie') {
    return 'weighing'
  }

  return winner === 'pro'
    ? `why the motion creates a better governed world for ${config.proRole}`
    : `why the motion fails under ${config.conRole}'s implementation test`
}

function roadmapItem(
  label: string,
  detail: string,
  side: RoadmapItem['side'],
  priority: RoadmapItem['priority'],
): RoadmapItem {
  return { label, detail, side, priority }
}
