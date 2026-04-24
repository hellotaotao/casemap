export type DebateSide = 'pro' | 'con'

export type JudgeStyle = 'policy' | 'parliamentary' | 'socratic' | 'executive'

export type DebateConfig = {
  motion: string
  proRole: string
  conRole: string
  roundCount: number
  judgeStyle: JudgeStyle
}

export type DebateTurn = {
  id: string
  round: number
  side: DebateSide
  role: string
  title: string
  claim: string
  warrant: string
  evidence: string
  impact: string
  attacks: string[]
  defenses: string[]
}

export type SideScore = {
  clarity: number
  evidence: number
  rebuttal: number
  impact: number
  strategy: number
  total: number
}

export type JudgeResult = {
  style: JudgeStyle
  pro: SideScore
  con: SideScore
  winner: DebateSide | 'tie'
  margin: number
  ballot: string[]
}

export type RoadmapItem = {
  label: string
  detail: string
  side: DebateSide | 'neutral'
  priority: 'high' | 'medium' | 'low'
}

export type AttackDefenseRoadmap = {
  thesis: string
  attacks: RoadmapItem[]
  defenses: RoadmapItem[]
  crossExamination: RoadmapItem[]
  prepPriorities: RoadmapItem[]
}

export type DebateSession = {
  id: string
  config: DebateConfig
  turns: DebateTurn[]
  judge: JudgeResult
  roadmap: AttackDefenseRoadmap
  report: string
}

export type ArenaConfig = {
  motion: string
  modelA: string
  modelB: string
  roundCount: number
  judgeStyle: JudgeStyle
}

export type ArenaMatch = {
  id: string
  proModel: string
  conModel: string
  proScore: number
  conScore: number
  winner: string | 'tie'
  judge: JudgeResult
}

export type LeaderboardEntry = {
  model: string
  score: number
  wins: number
  losses: number
  ties: number
  avgMargin: number
}

export type ArenaResult = {
  config: ArenaConfig
  matches: ArenaMatch[]
  leaderboard: LeaderboardEntry[]
}
