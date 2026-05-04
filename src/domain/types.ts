import type { AiRunMetadata, GenerationSource } from './roleAssignments'

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
  generatedBy?: GenerationSource
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
  generatedBy?: GenerationSource
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
  generatedBy?: GenerationSource
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
  generatedBy?: GenerationSource
}

export type PrepPackageArgumentStatus = 'mainline' | 'support' | 'rewrite' | 'eliminated'

export type MotionBreakdownCard = {
  motion: string
  keywords: string[]
  interpretationSpace: string[]
  centralConflict: string
  judgingCriteria: string[]
  commonPitfalls: string[]
}

export type StanceMapSide = {
  side: PreparedSide
  label: string
  worldview: string
  strongestPath: string[]
  burdenOfProof: string[]
  weakPoints: string[]
}

export type StanceMapArtifact = {
  sides: StanceMapSide[]
}

export type ArgumentPoolRow = {
  id: string
  side: PreparedSide
  sideLabel: string
  title: string
  claim: string
  reasoningChain: string[]
  evidenceNeeds: string
  strongestAttack: string
  bestDefense: string
  antiHitScore: number
  votability: number
  status: PrepPackageArgumentStatus
  statusLabel: string
}

export type AttackDefenseRow = {
  side: PreparedSide
  sideLabel: string
  opponentAttack: string
  attackType: string
  mainResponse: string
  backupResponse: string
  concession: string
  bottomLine: string
  returnToMainline: string
}

export type CrossExaminationBranch = {
  opponentAnswer: string
  followUp: string
}

export type CrossExaminationTree = {
  id: string
  side: PreparedSide
  sideLabel: string
  target: string
  openingQuestion: string
  branches: CrossExaminationBranch[]
  closingLine: string
  successSignal: string
  fallbackRoute: string
}

export type FreeDebateTacticCard = {
  id: string
  side: PreparedSide
  sideLabel: string
  trigger: string
  oneLineResponse: string
  followUpQuestions: string[]
  expandableMaterial: string
  trapToAvoid: string
  returnMainline: string
}

export type SpeechStructure = {
  role: string
  purpose: string
  structure: string[]
}

export type SpeechStructurePack = {
  side: PreparedSide
  sideLabel: string
  speeches: SpeechStructure[]
}

export type ClosingVotingIssuePack = {
  side: PreparedSide
  sideLabel: string
  votingIssues: string[]
  advantageClosing: string
  opponentStrongAttackClosing: string
  deadlockClosing: string
  dropDisputes: string[]
  mustRepeatMainlines: string[]
}

export type EvidenceGapChecklistItem = {
  id: string
  side: PreparedSide
  sideLabel: string
  mainline: string
  evidenceType: string
  currentGap: string
  priority: 'high' | 'medium' | 'low'
  caseDirection: string
  avoidMaterial: string
}

export type TrainingReviewChecklist = {
  scrimmageChecks: string[]
  roleTrainingFocus: string[]
  postMatchReviewQuestions: string[]
  piercedArguments: string[]
  effectiveCrossExaminationPaths: string[]
  freeDebateCardsToRewrite: string[]
}

export type PreparationPackageArtifactSet = {
  motionBreakdown: MotionBreakdownCard
  stanceMap: StanceMapArtifact
  argumentPool: ArgumentPoolRow[]
  attackDefenseTable: AttackDefenseRow[]
  crossExaminationTrees: CrossExaminationTree[]
  freeDebateTacticCards: FreeDebateTacticCard[]
  speechStructurePacks: SpeechStructurePack[]
  closingVotingIssuePacks: ClosingVotingIssuePack[]
  evidenceGapChecklist: EvidenceGapChecklistItem[]
  trainingReviewChecklist: TrainingReviewChecklist
}

export type PreparationPackage = {
  title: string
  motion: string
  scopeLabel: string
  formatName: string
  positioning: string
  artifactNames: string[]
  artifacts: PreparationPackageArtifactSet
}

export type DebateMapSideNode = {
  side: PreparedSide
  label: string
  stance: string
  coreArgumentIds: string[]
  backupArgumentIds: string[]
}

export type DebateMapArgumentNode = {
  id: string
  side: PreparedSide
  status: ArgumentStatus
  title: string
  claim: string
  bestDefense: string
  evidenceType: string
  strengthScore: number
  riskScore: number
  evidenceGapId?: string
}

export type DebateMapAttackNode = {
  id: string
  side: PreparedSide
  againstSide: PreparedSide
  title: string
  claim: string
  likelyStage: string
  threatScore: number
}

export type DebateMapDefenseLink = {
  id: string
  side: PreparedSide
  fromAttackId: string
  toArgumentId: string
  response: string
  backupResponse: string
  freeDebatePromptId: string
}

export type EvidenceGapSeverity = 'high' | 'medium' | 'low'

export type DebateMapEvidenceGap = {
  id: string
  side: PreparedSide
  argumentId: string
  argumentTitle: string
  evidenceType: string
  severity: EvidenceGapSeverity
  reason: string
}

export type DebateMapFreeDebatePrompt = {
  id: string
  side: PreparedSide
  attackId: string
  argumentId: string
  prompt: string
}

export type DebateMap = {
  motion: string
  centralConflict: string
  sideNodes: DebateMapSideNode[]
  argumentNodes: DebateMapArgumentNode[]
  attackNodes: DebateMapAttackNode[]
  defenseLinks: DebateMapDefenseLink[]
  evidenceGaps: DebateMapEvidenceGap[]
  freeDebatePrompts: DebateMapFreeDebatePrompt[]
}

export type HumanPrepSession = {
  config: HumanPrepConfig
  format: DebateFormatPreset
  aiRun: AiRunMetadata
  discovery: ArgumentDiscovery
  selection: ArgumentSelection
  iterations: SimulationIteration[]
  finalRouteMap: FinalRouteMap
  debateMap: DebateMap
  preparationPackage: PreparationPackage
  prepPack: string
}
