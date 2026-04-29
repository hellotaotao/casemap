import { createDefaultProviderSettings, type ProviderSettings } from './aiProviders'
import { createDebateMap } from './debateMap'
import { createSeededRandom, scoreBetween, stableHash } from './deterministic'
import {
  createAiRunMetadata,
  createDefaultRoleAssignments,
  debateAgentRoles,
  type AiRunMetadata,
  type DebateAgentRole,
  type GenerationSource,
  type RoleAssignments,
} from './roleAssignments'
import type {
  ArgumentCard,
  ArgumentDiscovery,
  ArgumentRecommendation,
  ArgumentSelection,
  ArgumentStatus,
  AttackDefensePair,
  CoreArgumentRoute,
  DebateFormatPreset,
  EmergencyRoute,
  EvidenceChecklistItem,
  FinalRouteMap,
  HumanPrepConfig,
  HumanPrepSession,
  OpponentLikelyArgument,
  PreparedSide,
  SideArgumentSelection,
  SideRouteMap,
  SimulationIteration,
  TimelineStageResult,
} from './types'

export type DebateGenerationContext = {
  providerSettings?: ProviderSettings
  roleAssignments?: RoleAssignments
  discoveryOverride?: ArgumentDiscovery
}

const defaultTopic = '人工智能工具应当用于辅助人类辩手备赛'

const sideLabels: Record<PreparedSide, string> = {
  affirmative: '正方',
  negative: '反方',
}

const formatPresets: DebateFormatPreset[] = [
  {
    id: 'chinese-four-v-four',
    name: '中文四辩常规赛制',
    shortName: '四辩常规',
    description: '按立论、驳立论、质辩、小结、自由辩和结辩组织路线。',
    stages: [
      {
        id: 'z1-opening',
        name: '正一立论',
        side: 'affirmative',
        speaker: '正方一辩',
        duration: '3min',
        purpose: '立判准，交代三条主线。',
      },
      {
        id: 'f1-opening',
        name: '反一立论',
        side: 'negative',
        speaker: '反方一辩',
        duration: '3min',
        purpose: '定义反方比较世界，抢对方漏洞。',
      },
      {
        id: 'f2-refute',
        name: '反二驳立论',
        side: 'negative',
        speaker: '反方二辩',
        duration: '2min',
        purpose: '攻击正方判准和机制。',
      },
      {
        id: 'z2-refute',
        name: '正二驳立论',
        side: 'affirmative',
        speaker: '正方二辩',
        duration: '2min',
        purpose: '回应反方定义，重建正方机制。',
      },
      {
        id: 'z3-cross',
        name: '正三质辩反方一二四辩',
        side: 'affirmative',
        speaker: '正方三辩',
        duration: '3min',
        purpose: '用连续追问锁住反方代价。',
      },
      {
        id: 'f3-cross',
        name: '反三质辩正方一二四辩',
        side: 'negative',
        speaker: '反方三辩',
        duration: '3min',
        purpose: '逼正方承认机制条件。',
      },
      {
        id: 'z3-summary',
        name: '正三质辩小结',
        side: 'affirmative',
        speaker: '正方三辩',
        duration: '90s',
        purpose: '把质辩收束成我方得分点。',
      },
      {
        id: 'f3-summary',
        name: '反三质辩小结',
        side: 'negative',
        speaker: '反方三辩',
        duration: '90s',
        purpose: '把对方让步转成反方比较优势。',
      },
      {
        id: 'free-debate',
        name: '自由辩论',
        side: 'both',
        speaker: '双方交替',
        duration: '8min',
        purpose: '围绕主战场快速攻防。',
      },
      {
        id: 'f4-closing',
        name: '反四总结',
        side: 'negative',
        speaker: '反方四辩',
        duration: '3min',
        purpose: '结算比较世界和剩余风险。',
      },
      {
        id: 'z4-closing',
        name: '正四总结',
        side: 'affirmative',
        speaker: '正方四辩',
        duration: '3min',
        purpose: '重申判准，完成价值称重。',
      },
    ],
  },
  {
    id: 'xin-guo-bian',
    name: '新国辩 / 华语高交锋赛制',
    shortName: '高交锋',
    description: '适合多轮陈词与质询交错，重视压缩战场和即时回应。',
    stages: [
      {
        id: 'speech-1',
        name: '陈词1',
        side: 'both',
        speaker: '双方陈词位',
        duration: '自由分配',
        purpose: '先给判准和第一主线。',
      },
      {
        id: 'cross-1',
        name: '质询1 / 被质询1',
        side: 'both',
        speaker: '双方质询位',
        duration: '自由分配',
        purpose: '抓定义、范围和责任主体。',
      },
      {
        id: 'speech-2',
        name: '陈词2',
        side: 'both',
        speaker: '双方陈词位',
        duration: '自由分配',
        purpose: '补强被攻击后的机制链。',
      },
      {
        id: 'cross-2',
        name: '质询2 / 被质询2',
        side: 'both',
        speaker: '双方质询位',
        duration: '自由分配',
        purpose: '逼迫对方放弃一条路线。',
      },
      {
        id: 'cross-summary',
        name: '质询小结',
        side: 'both',
        speaker: '双方小结位',
        duration: '自由分配',
        purpose: '把问答转化为胜负判断。',
      },
      {
        id: 'free-high-clash',
        name: '自由辩论',
        side: 'both',
        speaker: '双方交锋位',
        duration: '独立计时',
        purpose: '围绕最高价值冲突集火。',
      },
      {
        id: 'closing-high-clash',
        name: '总结陈词',
        side: 'both',
        speaker: '双方结辩位',
        duration: '自由分配',
        purpose: '用一条最终路线收束全场。',
      },
    ],
  },
  {
    id: 'campus-quick',
    name: '简化训练赛制 / 校园快速赛制',
    shortName: '快速训练',
    description: '压缩成开篇、攻防、自由辩和总结，便于队内练习。',
    stages: [
      {
        id: 'quick-opening',
        name: '一辩立论',
        side: 'both',
        speaker: '双方一辩',
        duration: '2min',
        purpose: '快速建立立场和三点框架。',
      },
      {
        id: 'quick-attack',
        name: '二辩攻防',
        side: 'both',
        speaker: '双方二辩',
        duration: '3min',
        purpose: '集中处理最强攻击。',
      },
      {
        id: 'quick-free',
        name: '自由辩',
        side: 'both',
        speaker: '双方交替',
        duration: '5min',
        purpose: '反复比较核心冲突。',
      },
      {
        id: 'quick-closing',
        name: '总结陈词',
        side: 'both',
        speaker: '双方四辩或结辩位',
        duration: '2min',
        purpose: '给裁判最后投票理由。',
      },
    ],
  },
]

type ArgumentBlueprint = {
  id: string
  title: string
  axis: string
  affirmativeClaim: string
  negativeClaim: string
  whyItMatters: string
  evidenceType: string
  strongestAttack: string
  bestDefense: string
}

const argumentBlueprints: ArgumentBlueprint[] = [
  {
    id: 'criterion',
    title: '判准先手',
    axis: '可判准的胜负标准',
    affirmativeClaim: '应当先证明这件事能提供更稳定、更可检验的公共收益',
    negativeClaim: '应当先证明这件事没有把复杂问题偷换成单一指标',
    whyItMatters: '它决定裁判用什么尺子比较双方世界，能减少自由辩里的散点争执。',
    evidenceType: '定义比较、判准拆解、裁判可投票标准',
    strongestAttack: '对方会说你的判准过窄，只服务于本方结论。',
    bestDefense: '承认判准有取舍，但强调它覆盖了辩题中最可验证、最影响结果的部分。',
  },
  {
    id: 'definition',
    title: '定义收束',
    axis: '概念边界和适用范围',
    affirmativeClaim: '应当把范围收束到真实会发生选择的场景，避免空泛赞成',
    negativeClaim: '应当指出对方定义过度扩张，导致责任主体和成本无法落地',
    whyItMatters: '定义越清楚，后续机制、例证和攻防越不容易被对方拉散。',
    evidenceType: '术语定义、适用范围表、边界案例',
    strongestAttack: '对方会指控你缩题，避开辩题中最难承担的部分。',
    bestDefense: '说明收束不是逃避，而是把比赛放回可执行、可检验的真实范围。',
  },
  {
    id: 'mechanism',
    title: '机制路径',
    axis: '责任主体、流程和约束',
    affirmativeClaim: '应当说明主体、步骤和纠错机制如何连成完整路径',
    negativeClaim: '应当追问主体是否有权力、预算和动机执行这条路径',
    whyItMatters: '机制能把价值主张变成可被质询和防守的路线。',
    evidenceType: '流程图、政策步骤、执行主体清单',
    strongestAttack: '对方会说机制链缺少关键环节，收益只是愿望。',
    bestDefense: '把机制拆成最低可行版本，先守住核心环节，再承认外围优化。',
  },
  {
    id: 'stakeholder',
    title: '关键人群',
    axis: '谁最先承受利弊',
    affirmativeClaim: '应当证明最受影响的人群会因为本方世界获得真实改善',
    negativeClaim: '应当证明最弱势或最先受影响的人群会承担不可转嫁的代价',
    whyItMatters: '人群叙事能把抽象价值转成裁判更容易记住的比较。',
    evidenceType: '利益相关者地图、用户访谈、群体影响数据',
    strongestAttack: '对方会质疑你挑选的人群不代表多数或不代表核心问题。',
    bestDefense: '解释该人群是风险或收益最集中的检验点，不是唯一受众。',
  },
  {
    id: 'irreversibility',
    title: '不可逆风险',
    axis: '错误发生后的修复成本',
    affirmativeClaim: '应当证明不行动或慢行动会制造更难补救的长期损害',
    negativeClaim: '应当证明贸然推进会制造难以撤回的制度或社会成本',
    whyItMatters: '不可逆性适合在结辩中压过短期收益或短期不便。',
    evidenceType: '风险登记表、失败案例、后果链条',
    strongestAttack: '对方会说你在制造恐惧，缺少发生概率。',
    bestDefense: '把概率、规模和可逆性拆开称重，说明低概率高损害也需要处理。',
  },
  {
    id: 'fairness',
    title: '公平分配',
    axis: '成本与收益是否错配',
    affirmativeClaim: '应当证明本方能让收益和责任更接近真正承担风险的人',
    negativeClaim: '应当证明对方把收益给了强势方，把成本转嫁给弱势方',
    whyItMatters: '公平分配能连接价值层和现实层，是自由辩常见主战场。',
    evidenceType: '成本收益表、资源分布、弱势群体案例',
    strongestAttack: '对方会说公平只是口号，无法说明效率和结果。',
    bestDefense: '把公平落到资源、机会和风险三项指标，避免只做价值宣告。',
  },
  {
    id: 'alternative',
    title: '替代方案',
    axis: '有没有更窄、更稳的方案',
    affirmativeClaim: '应当证明替代方案依旧需要本方核心原则才能成立',
    negativeClaim: '应当提出更小成本的替代方案，切断对方必要性',
    whyItMatters: '替代方案能迫使比赛从单方好坏转为比较哪个世界更优。',
    evidenceType: '对照方案、试点经验、条件清单',
    strongestAttack: '对方会说你的替代方案只是换名字，没有解决核心问题。',
    bestDefense: '明确替代方案和命题之间的边界，指出它少承担哪些风险。',
  },
  {
    id: 'incentive',
    title: '长期激励',
    axis: '行为者会被怎样改变',
    affirmativeClaim: '应当证明本方会创造更好的长期行为激励',
    negativeClaim: '应当证明对方会扭曲激励，使行为者选择表演性合规',
    whyItMatters: '激励论点能解释为什么短期看似相近的方案，长期结果会分叉。',
    evidenceType: '激励结构、历史类比、行为变化指标',
    strongestAttack: '对方会要求你证明行为者真的会按预期改变。',
    bestDefense: '用奖惩、声誉和成本三类激励交叉支撑，而不是只靠善意。',
  },
  {
    id: 'execution-cost',
    title: '执行成本',
    axis: '资源、时间和组织能力',
    affirmativeClaim: '应当证明执行成本可被分阶段吸收，并换来更高确定性',
    negativeClaim: '应当证明执行成本会挤占更优先的问题，导致净效果下降',
    whyItMatters: '执行成本是质询中最容易被追问的现实漏洞。',
    evidenceType: '预算估算、执行里程碑、组织能力对照',
    strongestAttack: '对方会说你低估成本，或把成本转给无法承担的人。',
    bestDefense: '用分阶段、最低可行版本和边际收益解释成本为什么值得承担。',
  },
  {
    id: 'weighing',
    title: '价值称重',
    axis: '概率、幅度、时间和可逆性',
    affirmativeClaim: '应当证明本方收益在幅度和可持续性上更值得裁判优先',
    negativeClaim: '应当证明对方收益不确定，而风险更早、更集中、更难逆转',
    whyItMatters: '它是结辩的收口工具，决定零散攻防如何变成投票理由。',
    evidenceType: '称重表、影响比较、结辩投票语句',
    strongestAttack: '对方会说你的称重只是重述己方立场，没有回应冲突。',
    bestDefense: '逐项比较概率、规模、时间和可逆性，让裁判看到明确排序。',
  },
]

export function getDebateFormatPresets(): DebateFormatPreset[] {
  return formatPresets
}

export function getDebateFormatPreset(formatId: HumanPrepConfig['formatId']): DebateFormatPreset {
  return formatPresets.find((preset) => preset.id === formatId) ?? formatPresets[0]
}

export function normalizePrepConfig(config: HumanPrepConfig): HumanPrepConfig {
  return {
    topic: cleanTopic(config.topic),
    side: config.side,
    formatId: getDebateFormatPreset(config.formatId).id,
    iterationCount: clampIterationCount(config.iterationCount),
    strategyMode: config.strategyMode,
  }
}

export function clampIterationCount(iterationCount: number): number {
  return Math.max(1, Math.min(5, Math.round(iterationCount || 3)))
}

export function getPreparedSides(side: HumanPrepConfig['side']): PreparedSide[] {
  return side === 'both' ? ['affirmative', 'negative'] : [side]
}

export function generateArgumentDiscovery(
  config: HumanPrepConfig,
  roleSources?: Partial<Record<DebateAgentRole, GenerationSource>>,
): ArgumentDiscovery {
  const normalized = normalizePrepConfig(config)
  const format = getDebateFormatPreset(normalized.formatId)
  const candidateCards = getPreparedSides(normalized.side).flatMap((side) =>
    buildArgumentCardsForSide(normalized.topic, side, roleSources?.[side]),
  )
  const opponentLikelyArguments = getPreparedSides(normalized.side).flatMap((side) =>
    buildOpponentLikelyArguments(normalized.topic, side, format, roleSources?.attackSimulator),
  )

  return {
    candidateCards,
    opponentLikelyArguments,
  }
}

export function createRecommendedStatuses(cards: ArgumentCard[]): Record<string, ArgumentStatus> {
  return Object.fromEntries(
    cards.map((card) => {
      if (card.recommendedRole === 'primary') return [card.id, 'primary']
      if (card.recommendedRole === 'backup') return [card.id, 'backup']
      if (card.recommendedRole === 'discard') return [card.id, 'dropped']
      return [card.id, 'unassigned']
    }),
  )
}

export function autoSelectArguments(cards: ArgumentCard[]): ArgumentSelection {
  const statusById: Record<string, ArgumentStatus> = Object.fromEntries(cards.map((card) => [card.id, 'unassigned']))

  for (const side of uniqueSides(cards)) {
    const ranked = rankCards(cards.filter((card) => card.side === side))

    ranked.forEach((card, index) => {
      if (index < 3) {
        statusById[card.id] = 'primary'
      } else if (index < 6) {
        statusById[card.id] = 'backup'
      } else if (index >= 8) {
        statusById[card.id] = 'dropped'
      }
    })
  }

  return createSelectionFromStatuses(cards, statusById)
}

export function createSelectionFromStatuses(
  cards: ArgumentCard[],
  statusById: Record<string, ArgumentStatus>,
): ArgumentSelection {
  const normalizedStatus: Record<string, ArgumentStatus> = Object.fromEntries(cards.map((card) => [card.id, statusById[card.id] ?? 'unassigned']))

  const sides = uniqueSides(cards).map((side): SideArgumentSelection => {
    const sideCards = rankCards(cards.filter((card) => card.side === side))
    const droppedIds = new Set(sideCards.filter((card) => normalizedStatus[card.id] === 'dropped').map((card) => card.id))
    const explicitPrimary = sideCards.filter((card) => normalizedStatus[card.id] === 'primary' && !droppedIds.has(card.id))
    const primary = takeUnique(
      [
        ...explicitPrimary,
        ...sideCards.filter(
          (card) =>
            !droppedIds.has(card.id) &&
            normalizedStatus[card.id] !== 'backup' &&
            normalizedStatus[card.id] !== 'primary',
        ),
      ],
      3,
    )
    const primaryIds = new Set(primary.map((card) => card.id))
    const backup = takeUnique(
      [
        ...sideCards.filter((card) => normalizedStatus[card.id] === 'backup' && !primaryIds.has(card.id) && !droppedIds.has(card.id)),
        ...explicitPrimary.filter((card) => !primaryIds.has(card.id) && !droppedIds.has(card.id)),
        ...sideCards.filter(
          (card) =>
            card.recommendedRole === 'backup' &&
            !primaryIds.has(card.id) &&
            normalizedStatus[card.id] !== 'dropped',
        ),
      ],
      4,
    )
    const backupIds = new Set(backup.map((card) => card.id))
    const emergency = takeUnique(
      sideCards.filter(
        (card) =>
          !primaryIds.has(card.id) &&
          !backupIds.has(card.id) &&
          !droppedIds.has(card.id) &&
          (card.recommendedRole === 'emergency' || normalizedStatus[card.id] === 'unassigned'),
      ),
      3,
    )
    const emergencyIds = new Set(emergency.map((card) => card.id))
    const dropped = sideCards.filter(
      (card) =>
        droppedIds.has(card.id) ||
        (!primaryIds.has(card.id) &&
          !backupIds.has(card.id) &&
          !emergencyIds.has(card.id) &&
          card.recommendedRole === 'discard'),
    )

    for (const card of primary) normalizedStatus[card.id] = 'primary'
    for (const card of backup) normalizedStatus[card.id] = 'backup'
    for (const card of dropped) normalizedStatus[card.id] = 'dropped'
    for (const card of emergency) normalizedStatus[card.id] = 'unassigned'

    return {
      side,
      primary,
      backup,
      emergency,
      dropped,
    }
  })

  return {
    statusById: normalizedStatus,
    sides,
  }
}

export function simulateStrategyIterations(
  config: HumanPrepConfig,
  format: DebateFormatPreset,
  selection: ArgumentSelection,
  opponentLikelyArguments: OpponentLikelyArgument[],
  generatedBy?: GenerationSource,
): SimulationIteration[] {
  const normalized = normalizePrepConfig(config)
  const iterations: SimulationIteration[] = []

  for (let iteration = 1; iteration <= normalized.iterationCount; iteration += 1) {
    for (const sideSelection of selection.sides) {
      iterations.push(simulateSideIteration(normalized, format, sideSelection, opponentLikelyArguments, iteration, generatedBy))
    }
  }

  return iterations
}

export function createFinalRouteMap(
  selection: ArgumentSelection,
  opponentLikelyArguments: OpponentLikelyArgument[],
  generatedBy?: GenerationSource,
): FinalRouteMap {
  const routes = selection.sides.map((sideSelection) => createSideRouteMap(sideSelection))
  const attackDefenseMap = selection.sides.flatMap((sideSelection) => createAttackDefensePairs(sideSelection, opponentLikelyArguments))
  const abandonedPreparedRoutes = selection.sides.flatMap((sideSelection) => createEmergencyRoutes(sideSelection))
  const evidenceChecklist = selection.sides.flatMap((sideSelection) => createEvidenceChecklist(sideSelection))

  return {
    routes,
    attackDefenseMap,
    abandonedPreparedRoutes,
    evidenceChecklist,
    ...(generatedBy ? { generatedBy } : {}),
  }
}

export function createHumanPrepSession(
  config: HumanPrepConfig,
  statusOverrides: Record<string, ArgumentStatus> = {},
  generationContext: DebateGenerationContext = {},
): HumanPrepSession {
  const normalized = normalizePrepConfig(config)
  const format = getDebateFormatPreset(normalized.formatId)
  const aiRun = createSessionAiRun(generationContext)
  const discovery = generationContext.discoveryOverride ?? generateArgumentDiscovery(normalized, aiRun.roles)
  const baseSelection =
    normalized.strategyMode === 'ai-auto'
      ? autoSelectArguments(discovery.candidateCards)
      : createSelectionFromStatuses(discovery.candidateCards, createRecommendedStatuses(discovery.candidateCards))
  const selection = createSelectionFromStatuses(discovery.candidateCards, {
    ...baseSelection.statusById,
    ...statusOverrides,
  })
  const iterations = simulateStrategyIterations(normalized, format, selection, discovery.opponentLikelyArguments, aiRun.roles.attackSimulator)
  const finalRouteMap = createFinalRouteMap(selection, discovery.opponentLikelyArguments, aiRun.roles.strategyCoach)
  const debateMap = createDebateMap({
    config: normalized,
    finalRouteMap,
    opponentLikelyArguments: discovery.opponentLikelyArguments,
    selection,
  })

  return {
    aiRun,
    config: normalized,
    debateMap,
    discovery,
    format,
    finalRouteMap,
    iterations,
    prepPack: exportPrepPack(normalized, format, discovery, selection, iterations, finalRouteMap, aiRun),
    selection,
  }
}

function createSessionAiRun(generationContext: DebateGenerationContext): AiRunMetadata {
  return createAiRunMetadata(
    generationContext.roleAssignments ?? createDefaultRoleAssignments(),
    generationContext.providerSettings ?? createDefaultProviderSettings(),
  )
}

export function exportPrepPack(
  config: HumanPrepConfig,
  format: DebateFormatPreset,
  discovery: ArgumentDiscovery,
  selection: ArgumentSelection,
  iterations: SimulationIteration[],
  finalRouteMap: FinalRouteMap,
  aiRun?: AiRunMetadata,
): string {
  const sideText = config.side === 'both' ? '双方都准备' : sideLabels[config.side]
  const lines = [
    '# CaseMap 人类备赛包',
    '',
    `辩题：${config.topic}`,
    `我方：${sideText}`,
    `赛制：${format.name}`,
    `迭代轮数：${config.iterationCount}`,
    ...createAiRunPrepPackLines(aiRun),
    '',
    '## 选择概览',
    ...selection.sides.map(
      (sideSelection) =>
        `${sideLabels[sideSelection.side]}：主线 ${sideSelection.primary.length}，备用 ${sideSelection.backup.length}，应急 ${sideSelection.emergency.length}，放弃 ${sideSelection.dropped.length}`,
    ),
    '',
    '## 最终主线',
    ...finalRouteMap.routes.flatMap((route) => [
      `### ${sideLabels[route.side]}`,
      ...route.coreArguments.map((core) => `${core.order}. ${core.card.title}：${core.card.claim}`),
      '开篇结构：',
      ...route.openingStructure.map((line) => `- ${line}`),
      '',
    ]),
    '## 攻防地图',
    ...finalRouteMap.attackDefenseMap.map(
      (pair) => `- ${sideLabels[pair.side]}：对方攻「${pair.opponentAttack}」；回应「${pair.response}」；备用「${pair.backupResponse}」。`,
    ),
    '',
    '## 迭代记录',
    ...iterations.map(
      (iteration) =>
        `- 第${iteration.iteration}轮 ${sideLabels[iteration.side]}：健康度 ${iteration.routeHealth}；有效 ${iteration.worked.join(' / ')}；受攻 ${iteration.gotAttacked.join(' / ')}；调整 ${iteration.replaced.join(' / ')}。`,
    ),
    '',
    '## 备用路线库',
    ...finalRouteMap.abandonedPreparedRoutes.map(
      (route) => `- ${sideLabels[route.side]} ${route.title}：当 ${route.trigger} 时使用，${route.use}`,
    ),
    '',
    '## 证据清单',
    ...finalRouteMap.evidenceChecklist.map(
      (item) => `- [${item.priority}] ${sideLabels[item.side]} ${item.argumentTitle}：${item.evidenceType}；${item.note}`,
    ),
    '',
    '## 候选论点概览',
    ...discovery.candidateCards.map(
      (card) =>
        `- ${sideLabels[card.side]} ${card.title}：强度 ${card.strengthScore} / 风险 ${card.riskScore} / 建议 ${card.recommendedRole}`,
    ),
  ]

  return lines.join('\n')
}

function createAiRunPrepPackLines(aiRun?: AiRunMetadata): string[] {
  if (!aiRun) return []

  return [
    '',
    '## AI 提供方记录',
    ...debateAgentRoles.map((role) => {
      const source = aiRun.roles[role.id]
      const modeLabel = source.mode === 'provider' ? '已连接' : '本地 fallback'
      const reason = source.reason ? `；${source.reason}` : ''
      return `- ${source.roleLabel}：${source.providerName} / ${modeLabel}${reason}`
    }),
  ]
}

function buildArgumentCardsForSide(topic: string, side: PreparedSide, generatedBy?: GenerationSource): ArgumentCard[] {
  const cards = argumentBlueprints.map((blueprint) => {
    const random = createSeededRandom(`${topic}|${side}|${blueprint.id}`)
    const strengthScore = scoreBetween(random, 62, 94)
    const riskScore = scoreBetween(random, 16, 76)
    const label = sideLabels[side]
    const sideClaim = side === 'affirmative' ? blueprint.affirmativeClaim : blueprint.negativeClaim

    return {
      id: `${side}-${blueprint.id}-${stableHash(`${topic}|${side}|${blueprint.id}`).toString(16)}`,
      side,
      title: blueprint.title,
      claim: `${label}主张：围绕「${topic}」，${sideClaim}，把胜负压在${blueprint.axis}。`,
      whyItMatters: blueprint.whyItMatters,
      evidenceType: blueprint.evidenceType,
      strongestAttack: blueprint.strongestAttack,
      bestDefense: blueprint.bestDefense,
      strengthScore,
      riskScore,
      recommendedRole: 'discard' as ArgumentRecommendation,
      ...(generatedBy ? { generatedBy } : {}),
    }
  })

  return rankCards(cards).map((card, index) => ({
    ...card,
    recommendedRole: recommendationForRank(index),
  }))
}

function buildOpponentLikelyArguments(
  topic: string,
  againstSide: PreparedSide,
  format: DebateFormatPreset,
  generatedBy?: GenerationSource,
): OpponentLikelyArgument[] {
  const opponentSide = oppositeSide(againstSide)
  const opponentCards = buildArgumentCardsForSide(topic, opponentSide).slice(0, 5)
  const pressureStages = format.stages.filter((stage) => stage.side === opponentSide || stage.side === 'both')

  return opponentCards.map((card, index) => ({
    id: `opp-${againstSide}-${card.id}`,
    againstSide,
    side: opponentSide,
    title: card.title,
    claim: card.claim,
    likelyStage: pressureStages[index % pressureStages.length]?.name ?? '自由辩论',
    threatScore: Math.round(card.strengthScore * 0.7 + card.riskScore * 0.3),
    responseHint: card.strongestAttack.includes('判准')
      ? '先承认判准差异，再把比较拉回本方可验证收益。'
      : card.bestDefense,
    ...(generatedBy ? { generatedBy } : {}),
  }))
}

function simulateSideIteration(
  config: HumanPrepConfig,
  format: DebateFormatPreset,
  sideSelection: SideArgumentSelection,
  opponentLikelyArguments: OpponentLikelyArgument[],
  iteration: number,
  generatedBy?: GenerationSource,
): SimulationIteration {
  const primary = sideSelection.primary
  const backup = sideSelection.backup
  const opponentPressure = opponentLikelyArguments.filter((argument) => argument.againstSide === sideSelection.side)
  const workedCard = primary[(iteration - 1) % primary.length] ?? backup[0]
  const attacked = opponentPressure[(iteration + sideSelection.side.length) % opponentPressure.length]
  const riskiestPrimary = [...primary].sort((left, right) => right.riskScore - left.riskScore)[0] ?? workedCard
  const replacementCandidate = backup[(iteration - 1) % Math.max(backup.length, 1)]
  const shouldReplace = iteration > 1 && riskiestPrimary && replacementCandidate && riskiestPrimary.riskScore > 55
  const routeHealth = calculateRouteHealth(primary, backup, attacked?.threatScore ?? 55, iteration)
  const timeline = format.stages.map((stage, stageIndex) =>
    createTimelineStageResult(stage, stageIndex, sideSelection, opponentPressure),
  )
  const replaced = shouldReplace
    ? [`${riskiestPrimary.title} 降为防守素材，${replacementCandidate.title} 补入主线边缘`]
    : [`保留三论主线，收窄 ${riskiestPrimary?.title ?? '核心论点'} 的承诺范围`]

  return {
    id: `${sideSelection.side}-${iteration}-${stableHash(`${config.topic}|${format.id}|${sideSelection.side}|${iteration}`).toString(16)}`,
    iteration,
    side: sideSelection.side,
    routeHealth,
    worked: [
      `${workedCard?.title ?? '主线'} 能把比赛拉回 ${workedCard?.evidenceType ?? '核心证据'}。`,
      `${sideLabels[sideSelection.side]}在结辩可用它完成称重。`,
    ],
    gotAttacked: [
      attacked
        ? `${sideLabels[attacked.side]}会在「${attacked.likelyStage}」用「${attacked.title}」压迫本方。`
        : '对方主要会质疑定义和执行边界。',
    ],
    replaced,
    why: shouldReplace
      ? '模拟显示高风险主论点容易被连续质询追穿，因此把它改成防守材料，用低风险备选稳住开篇。'
      : '模拟显示现有三论点可以互相补位，只需要减少过度承诺并预写反问。',
    timeline,
    ...(generatedBy ? { generatedBy } : {}),
  }
}

function createTimelineStageResult(
  stage: DebateFormatPreset['stages'][number],
  stageIndex: number,
  sideSelection: SideArgumentSelection,
  opponentPressure: OpponentLikelyArgument[],
): TimelineStageResult {
  const primary = sideSelection.primary
  const backup = sideSelection.backup
  const core = primary[stageIndex % Math.max(primary.length, 1)]
  const reserve = backup[stageIndex % Math.max(backup.length, 1)]
  const opponent = opponentPressure[stageIndex % Math.max(opponentPressure.length, 1)]

  if (stage.side === sideSelection.side) {
    return {
      stageId: stage.id,
      stageName: stage.name,
      speaker: stage.speaker,
      duration: stage.duration,
      move: `主动打出「${core?.title ?? '主线'}」，把 ${core?.evidenceType ?? '证据'} 放进裁判视野。`,
      pressure: `预置防守：${core?.bestDefense ?? '先缩小承诺，再回到判准。'}`,
    }
  }

  if (stage.side === oppositeSide(sideSelection.side)) {
    return {
      stageId: stage.id,
      stageName: stage.name,
      speaker: stage.speaker,
      duration: stage.duration,
      move: `预计对方主打「${opponent?.title ?? '定义攻击'}」。`,
      pressure: `回应时用「${reserve?.title ?? core?.title ?? '备用路线'}」挡住追问。`,
    }
  }

  return {
    stageId: stage.id,
    stageName: stage.name,
    speaker: stage.speaker,
    duration: stage.duration,
    move: `围绕「${core?.title ?? '主线'}」发起短攻，逼对方处理 ${core?.strongestAttack ?? '关键机制'}。`,
    pressure: `若被反压，转入「${reserve?.title ?? '备用路线'}」并回到本方判准。`,
  }
}

function createSideRouteMap(sideSelection: SideArgumentSelection): SideRouteMap {
  const roles = ['先定判准', '再给机制或人群', '最后完成称重']
  const coreArguments: CoreArgumentRoute[] = sideSelection.primary.slice(0, 3).map((card, index) => ({
    order: index + 1,
    card,
    roleInOpening: roles[index] ?? '补强主线',
  }))

  return {
    side: sideSelection.side,
    coreArguments,
    openingStructure: coreArguments.map(
      (core) => `${core.order}. ${core.roleInOpening}：用「${core.card.title}」证明 ${core.card.claim.replace(/^.+?主张：/, '')}`,
    ),
  }
}

function createAttackDefensePairs(
  sideSelection: SideArgumentSelection,
  opponentLikelyArguments: OpponentLikelyArgument[],
): AttackDefensePair[] {
  const opponentPressure = opponentLikelyArguments.filter((argument) => argument.againstSide === sideSelection.side).slice(0, 4)

  return opponentPressure.map((pressure, index) => {
    const responseCard = sideSelection.primary[index % Math.max(sideSelection.primary.length, 1)]
    const backupCard = sideSelection.backup[index % Math.max(sideSelection.backup.length, 1)]

    return {
      side: sideSelection.side,
      opponentAttack: `${pressure.title}：${pressure.claim}`,
      response: responseCard
        ? `用「${responseCard.title}」回应：${responseCard.bestDefense}`
        : '先承认局部问题，再把裁判拉回我方判准。',
      backupResponse: backupCard
        ? `若被追问，转入「${backupCard.title}」：${backupCard.claim}`
        : pressure.responseHint,
    }
  })
}

function createEmergencyRoutes(sideSelection: SideArgumentSelection): EmergencyRoute[] {
  return [...sideSelection.backup, ...sideSelection.emergency].slice(0, 6).map((card) => ({
    side: sideSelection.side,
    title: card.title,
    trigger: `对方把战场转向${card.strongestAttack.replace('对方会', '')}`,
    use: `不要进入长写作，直接用这张卡的证据类型：${card.evidenceType}。`,
  }))
}

function createEvidenceChecklist(sideSelection: SideArgumentSelection): EvidenceChecklistItem[] {
  return [...sideSelection.primary, ...sideSelection.backup].map((card) => ({
    side: sideSelection.side,
    argumentTitle: card.title,
    evidenceType: card.evidenceType,
    priority: sideSelection.primary.some((primary) => primary.id === card.id) ? 'high' : 'medium',
    note: card.recommendedRole === 'primary' ? '开篇必须准备一条可复述材料。' : '作为自由辩或质询补位材料。',
  }))
}

function recommendationForRank(index: number): ArgumentRecommendation {
  if (index < 3) return 'primary'
  if (index < 6) return 'backup'
  if (index < 8) return 'emergency'
  return 'discard'
}

function rankCards(cards: ArgumentCard[]): ArgumentCard[] {
  return [...cards].sort((left, right) => {
    const scoreDiff = cardRankScore(right) - cardRankScore(left)
    return scoreDiff || left.title.localeCompare(right.title, 'zh-Hans-CN')
  })
}

function cardRankScore(card: ArgumentCard): number {
  return card.strengthScore * 1.7 - card.riskScore * 0.9
}

function calculateRouteHealth(
  primary: ArgumentCard[],
  backup: ArgumentCard[],
  threatScore: number,
  iteration: number,
): number {
  const primaryAverage = average(primary.map((card) => card.strengthScore - card.riskScore * 0.35))
  const backupAverage = average(backup.map((card) => card.strengthScore - card.riskScore * 0.25))
  const raw = 42 + primaryAverage * 0.55 + backupAverage * 0.2 - threatScore * 0.18 + iteration * 3
  return Math.max(35, Math.min(96, Math.round(raw)))
}

function average(values: number[]): number {
  if (values.length === 0) return 50
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function uniqueSides(cards: ArgumentCard[]): PreparedSide[] {
  const sides = new Set(cards.map((card) => card.side))
  return ['affirmative', 'negative'].filter((side): side is PreparedSide => sides.has(side as PreparedSide))
}

function takeUnique(cards: ArgumentCard[], limit: number): ArgumentCard[] {
  const seen = new Set<string>()
  const result: ArgumentCard[] = []

  for (const card of cards) {
    if (seen.has(card.id)) continue
    seen.add(card.id)
    result.push(card)
    if (result.length >= limit) break
  }

  return result
}

function oppositeSide(side: PreparedSide): PreparedSide {
  return side === 'affirmative' ? 'negative' : 'affirmative'
}

function cleanTopic(topic: string): string {
  const trimmed = topic.trim().replace(/\s+/g, ' ')
  return trimmed || defaultTopic
}
