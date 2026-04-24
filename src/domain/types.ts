export type PreparedSide = 'affirmative' | 'negative'

export type PrepSideChoice = PreparedSide | 'both'

export type DebateFormatId = 'chinese-four-v-four' | 'xin-guo-bian' | 'campus-quick'

export type StrategyMode = 'ai-auto' | 'human-quick'

export type ArgumentRecommendation = 'primary' | 'backup' | 'emergency' | 'discard'

export type ArgumentStatus = 'unassigned' | 'primary' | 'backup' | 'dropped'

export type StageSide = PreparedSide | 'both'

export type HumanPrepConfig = {
  topic: string
  side: PrepSideChoice
  formatId: DebateFormatId
  iterationCount: number
  strategyMode: StrategyMode
}

export type DebateFormatStage = {
  id: string
  name: string
  side: StageSide
  speaker: string
  duration: string
  purpose: string
}

export type DebateFormatPreset = {
  id: DebateFormatId
  name: string
  shortName: string
  description: string
  stages: DebateFormatStage[]
}

export type ArgumentCard = {
  id: string
  side: PreparedSide
  title: string
  claim: string
  whyItMatters: string
  evidenceType: string
  strongestAttack: string
  bestDefense: string
  strengthScore: number
  riskScore: number
  recommendedRole: ArgumentRecommendation
}

export type OpponentLikelyArgument = {
  id: string
  againstSide: PreparedSide
  side: PreparedSide
  title: string
  claim: string
  likelyStage: string
  threatScore: number
  responseHint: string
}

export type ArgumentDiscovery = {
  candidateCards: ArgumentCard[]
  opponentLikelyArguments: OpponentLikelyArgument[]
}

export type SideArgumentSelection = {
  side: PreparedSide
  primary: ArgumentCard[]
  backup: ArgumentCard[]
  emergency: ArgumentCard[]
  dropped: ArgumentCard[]
}

export type ArgumentSelection = {
  statusById: Record<string, ArgumentStatus>
  sides: SideArgumentSelection[]
}

export type TimelineStageResult = {
  stageId: string
  stageName: string
  speaker: string
  duration: string
  move: string
  pressure: string
}

export type SimulationIteration = {
  id: string
  iteration: number
  side: PreparedSide
  routeHealth: number
  worked: string[]
  gotAttacked: string[]
  replaced: string[]
  why: string
  timeline: TimelineStageResult[]
}

export type CoreArgumentRoute = {
  order: number
  card: ArgumentCard
  roleInOpening: string
}

export type SideRouteMap = {
  side: PreparedSide
  coreArguments: CoreArgumentRoute[]
  openingStructure: string[]
}

export type AttackDefensePair = {
  side: PreparedSide
  opponentAttack: string
  response: string
  backupResponse: string
}

export type EmergencyRoute = {
  side: PreparedSide
  title: string
  trigger: string
  use: string
}

export type EvidenceChecklistItem = {
  side: PreparedSide
  argumentTitle: string
  evidenceType: string
  priority: 'high' | 'medium' | 'low'
  note: string
}

export type FinalRouteMap = {
  routes: SideRouteMap[]
  attackDefenseMap: AttackDefensePair[]
  abandonedPreparedRoutes: EmergencyRoute[]
  evidenceChecklist: EvidenceChecklistItem[]
}

export type HumanPrepSession = {
  config: HumanPrepConfig
  format: DebateFormatPreset
  discovery: ArgumentDiscovery
  selection: ArgumentSelection
  iterations: SimulationIteration[]
  finalRouteMap: FinalRouteMap
  prepPack: string
}
