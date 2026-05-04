import { stableHash } from './deterministic'
import type {
  ArgumentCard,
  ArgumentDiscovery,
  ArgumentSelection,
  ArgumentStatus,
  AttackDefenseRow,
  ClosingVotingIssuePack,
  CrossExaminationTree,
  DebateFormatPreset,
  DebateMap,
  DebateMapArgumentNode,
  EvidenceGapChecklistItem,
  FinalRouteMap,
  FreeDebateTacticCard,
  HumanPrepConfig,
  PreparationPackage,
  PrepPackageArgumentStatus,
  PreparedSide,
  SpeechStructurePack,
  StanceMapSide,
  TrainingReviewChecklist,
} from './types'

type PreparationPackageInput = {
  config: HumanPrepConfig
  discovery: ArgumentDiscovery
  selection: ArgumentSelection
  format: DebateFormatPreset
  finalRouteMap: FinalRouteMap
  debateMap: DebateMap
}

const sideLabels: Record<PreparedSide, string> = {
  affirmative: '正方',
  negative: '反方',
}

const packageStatusLabels: Record<PrepPackageArgumentStatus, string> = {
  eliminated: '淘汰',
  mainline: '主线',
  rewrite: '待改写',
  support: '辅助',
}

const artifactNames = [
  '辩题拆解卡',
  '双方立场地图',
  '论点池与筛选表',
  '攻防表',
  '质询树 / 盘问树',
  '自由辩战术卡',
  '发言稿 / 发言结构包',
  '结辩胜负点包',
  '证据缺口清单',
  '训练与复盘清单',
]

export function createPreparationPackage({
  config,
  debateMap,
  discovery,
  finalRouteMap,
  format,
  selection,
}: PreparationPackageInput): PreparationPackage {
  const scopeLabel = config.side === 'both' ? '双方备战' : `${sideLabels[config.side]}备战`
  const preparedSides = getPackageSides(config, selection, discovery)

  return {
    artifactNames,
    artifacts: {
      attackDefenseTable: createAttackDefenseTable(finalRouteMap),
      argumentPool: createArgumentPool(discovery, selection),
      closingVotingIssuePacks: createClosingVotingIssuePacks(preparedSides, selection, finalRouteMap),
      crossExaminationTrees: createCrossExaminationTrees(debateMap, selection),
      evidenceGapChecklist: createEvidenceGapChecklist(debateMap),
      freeDebateTacticCards: createFreeDebateTacticCards(debateMap),
      motionBreakdown: createMotionBreakdown(config, debateMap, finalRouteMap),
      speechStructurePacks: createSpeechStructurePacks(preparedSides, finalRouteMap, format),
      stanceMap: {
        sides: createStanceMapSides(preparedSides, debateMap, discovery, finalRouteMap),
      },
      trainingReviewChecklist: createTrainingReviewChecklist(selection, debateMap),
    },
    formatName: format.name,
    motion: config.topic,
    positioning: 'CaseMap 是赛前准备工具：输出可打印、可训练、可复盘的战术包，不提供赛中 AI 提词。',
    scopeLabel,
    title: `CaseMap 强队式赛前战术包 · ${scopeLabel}`,
  }
}

export function exportPreparationPackageMarkdown(prepPackage: PreparationPackage): string {
  const lines = [
    `# ${prepPackage.title}`,
    '',
    `辩题：${prepPackage.motion}`,
    `赛制：${prepPackage.formatName}`,
    `定位：${prepPackage.positioning}`,
    '',
    '## Artifact 目录',
    ...prepPackage.artifactNames.map((name, index) => `${index + 1}. ${name}`),
    '',
    '## 辩题拆解卡',
    `- 辩题原文：${prepPackage.artifacts.motionBreakdown.motion}`,
    `- 关键词定义：${prepPackage.artifacts.motionBreakdown.keywords.join('；')}`,
    `- 双方解释空间：${prepPackage.artifacts.motionBreakdown.interpretationSpace.join('；')}`,
    `- 核心冲突：${prepPackage.artifacts.motionBreakdown.centralConflict}`,
    `- 主要判准：${prepPackage.artifacts.motionBreakdown.judgingCriteria.join('；')}`,
    `- 易跑偏误区：${prepPackage.artifacts.motionBreakdown.commonPitfalls.join('；')}`,
    '',
    '## 双方立场地图',
    ...prepPackage.artifacts.stanceMap.sides.flatMap((side) => [
      `### ${side.label}`,
      `- 世界观：${side.worldview}`,
      `- 最强胜负路径：${side.strongestPath.join(' / ')}`,
      `- 关键前提：${side.burdenOfProof.join(' / ')}`,
      `- 薄弱点：${side.weakPoints.join(' / ')}`,
    ]),
    '',
    '## 论点池与筛选表',
    ...prepPackage.artifacts.argumentPool.map(
      (row) =>
        `- [${row.statusLabel}] ${row.sideLabel}「${row.title}」：${row.claim}；证据需求：${row.evidenceNeeds}；最强攻击：${row.strongestAttack}；最佳防守：${row.bestDefense}；抗打 ${row.antiHitScore} / 可投票 ${row.votability}`,
    ),
    '',
    '## 攻防表',
    ...prepPackage.artifacts.attackDefenseTable.map(
      (row) =>
        `- ${row.sideLabel}：对方攻「${row.opponentAttack}」；类型：${row.attackType}；主回应：${row.mainResponse}；备用：${row.backupResponse}；底线：${row.bottomLine}；转回：${row.returnToMainline}`,
    ),
    '',
    '## 质询树 / 盘问树',
    ...prepPackage.artifacts.crossExaminationTrees.flatMap((tree) => [
      `- ${tree.sideLabel}目标：${tree.target}`,
      `  起手：${tree.openingQuestion}`,
      `  追问：${tree.branches.map((branch) => `${branch.opponentAnswer} -> ${branch.followUp}`).join('；')}`,
      `  收口：${tree.closingLine}`,
      `  成功标志：${tree.successSignal}`,
      `  撤退路线：${tree.fallbackRoute}`,
    ]),
    '',
    '## 自由辩战术卡',
    ...prepPackage.artifacts.freeDebateTacticCards.map(
      (card) =>
        `- ${card.sideLabel}：当 ${card.trigger} 时，先说「${card.oneLineResponse}」；追问：${card.followUpQuestions.join(' / ')}；回到：${card.returnMainline}`,
    ),
    '',
    '## 发言稿 / 发言结构包',
    ...prepPackage.artifacts.speechStructurePacks.flatMap((pack) => [
      `### ${pack.sideLabel}`,
      ...pack.speeches.map((speech) => `- ${speech.role}：${speech.structure.join('；')}`),
    ]),
    '',
    '## 结辩胜负点包',
    ...prepPackage.artifacts.closingVotingIssuePacks.flatMap((pack) => [
      `### ${pack.sideLabel}`,
      `- Voting issues：${pack.votingIssues.join(' / ')}`,
      `- 我方优势版：${pack.advantageClosing}`,
      `- 对方强攻版：${pack.opponentStrongAttackClosing}`,
      `- 僵持版：${pack.deadlockClosing}`,
      `- 应放弃小争议：${pack.dropDisputes.join(' / ')}`,
      `- 必须反复强调：${pack.mustRepeatMainlines.join(' / ')}`,
    ]),
    '',
    '## 证据缺口清单',
    ...prepPackage.artifacts.evidenceGapChecklist.map(
      (item) =>
        `- [${item.priority}] ${item.sideLabel}「${item.mainline}」：缺 ${item.currentGap}；案例方向：${item.caseDirection}；避免：${item.avoidMaterial}`,
    ),
    '',
    '## 训练与复盘清单',
    ...trainingChecklistLines(prepPackage.artifacts.trainingReviewChecklist),
  ]

  return lines.join('\n')
}

function createMotionBreakdown(
  config: HumanPrepConfig,
  debateMap: DebateMap,
  finalRouteMap: FinalRouteMap,
): PreparationPackage['artifacts']['motionBreakdown'] {
  const firstRoute = finalRouteMap.routes[0]
  const primaryTitles = firstRoute?.coreArguments.map((core) => core.card.title) ?? []

  return {
    centralConflict: debateMap.centralConflict,
    commonPitfalls: [
      '只写顺风稿，不预置对方最强版本。',
      '把自由辩准备成赛中提词，而不是赛前短线战术卡。',
      '只堆例子，不说明这些例子如何转化成裁判可投票理由。',
    ],
    interpretationSpace: [
      '正方通常会收束责任主体、收益对象和可执行路径。',
      '反方通常会扩大成本、风险、替代方案和不可逆后果。',
    ],
    judgingCriteria: primaryTitles.length > 0 ? primaryTitles : ['定义边界', '机制可行性', '价值称重'],
    keywords: extractKeywords(config.topic),
    motion: config.topic,
  }
}

function createStanceMapSides(
  sides: PreparedSide[],
  debateMap: DebateMap,
  discovery: ArgumentDiscovery,
  finalRouteMap: FinalRouteMap,
): StanceMapSide[] {
  return sides.map((side) => {
    const sideNode = debateMap.sideNodes.find((node) => node.side === side)
    const route = finalRouteMap.routes.find((item) => item.side === side)
    const opponentAttacks = discovery.opponentLikelyArguments.filter((argument) => argument.side === side)
    const routeTitles = route?.coreArguments.map((core) => core.card.title) ?? opponentAttacks.slice(0, 3).map((attack) => attack.title)
    const weakPoints = getSideArgumentNodes(debateMap, side)
      .sort((left, right) => right.riskScore - left.riskScore)
      .slice(0, 3)
      .map((node) => `${node.title}：${node.bestDefense}`)

    return {
      burdenOfProof: routeTitles.length > 0
        ? routeTitles.map((title) => `证明「${title}」不是口号，而能落到比较标准。`)
        : ['证明本方世界比对方世界更稳定、更可执行。'],
      label: sideLabels[side],
      side,
      strongestPath: routeTitles.length > 0 ? routeTitles : ['判准先手', '机制路径', '价值称重'],
      weakPoints: weakPoints.length > 0 ? weakPoints : ['定义边界容易被质询，需准备可承认范围。'],
      worldview: sideNode?.stance ?? `${sideLabels[side]}需要把辩题转化成可比较、可裁决的世界观。`,
    }
  })
}

function createArgumentPool(discovery: ArgumentDiscovery, selection: ArgumentSelection): PreparationPackage['artifacts']['argumentPool'] {
  return discovery.candidateCards.map((card): PreparationPackage['artifacts']['argumentPool'][number] => {
    const sourceStatus = selection.statusById[card.id] ?? 'unassigned'
    const status = toPackageArgumentStatus(sourceStatus, card)

    return {
      antiHitScore: Math.max(1, Math.min(99, Math.round(card.strengthScore * 0.55 + (100 - card.riskScore) * 0.45))),
      bestDefense: card.bestDefense,
      claim: card.claim,
      evidenceNeeds: card.evidenceType,
      id: card.id,
      reasoningChain: [
        card.claim,
        `本论点的可裁决意义是：${card.whyItMatters}`,
        `需要用「${card.evidenceType}」把价值判断落地。`,
      ],
      side: card.side,
      sideLabel: sideLabels[card.side],
      status,
      statusLabel: packageStatusLabels[status],
      strongestAttack: card.strongestAttack,
      title: card.title,
      votability: Math.max(1, Math.min(99, Math.round(card.strengthScore * 0.8 + (100 - card.riskScore) * 0.2))),
    }
  })
}

function createAttackDefenseTable(finalRouteMap: FinalRouteMap): AttackDefenseRow[] {
  return finalRouteMap.attackDefenseMap.map((pair) => {
    const mainline = findRouteMainline(finalRouteMap, pair.side)

    return {
      attackType: inferAttackType(pair.opponentAttack),
      backupResponse: pair.backupResponse,
      bottomLine: mainline ? `不能放弃「${mainline}」作为裁判投票路径。` : '不能放弃本方核心判准。',
      concession: '可以承认个别执行条件需要补材料，但不承认对方因此赢下整体比较。',
      mainResponse: pair.response,
      opponentAttack: pair.opponentAttack,
      returnToMainline: mainline ? `回应后立刻转回「${mainline}」。` : '回应后转回核心判准。',
      side: pair.side,
      sideLabel: sideLabels[pair.side],
    }
  })
}

function createCrossExaminationTrees(debateMap: DebateMap, selection: ArgumentSelection): CrossExaminationTree[] {
  return debateMap.defenseLinks.slice(0, 8).flatMap((link) => {
    const attack = debateMap.attackNodes.find((node) => node.id === link.fromAttackId)
    const argument = debateMap.argumentNodes.find((node) => node.id === link.toArgumentId)

    if (!attack || !argument) return []

    return [{
      branches: [
        {
          followUp: `那请说明这个例外是否足以推翻「${argument.title}」的整体比较？`,
          opponentAnswer: 'A 承认只是局部问题',
        },
        {
          followUp: `请给出责任主体、发生概率和影响范围，否则这只是风险宣告。`,
          opponentAnswer: 'B 扩大风险范围',
        },
        {
          followUp: `如果无法证明更优替代方案，是否仍需回到双方主线比较？`,
          opponentAnswer: 'C 转向替代方案',
        },
      ],
      closingLine: `所以对方最多提出局部压力，不能击穿我方「${argument.title}」的投票路径。`,
      fallbackRoute: findBackupRoute(selection, link.side),
      id: `cross-${link.id}`,
      openingQuestion: `对方是否承认「${attack.title}」必须先证明其影响范围大于我方主线？`,
      side: link.side,
      sideLabel: sideLabels[link.side],
      successSignal: `对方承认「${attack.title}」只影响条件，不直接推翻本方主线。`,
      target: `逼对方承认「${attack.title}」不是独立胜负点。`,
    }]
  })
}

function createFreeDebateTacticCards(debateMap: DebateMap): FreeDebateTacticCard[] {
  return debateMap.freeDebatePrompts.slice(0, 8).flatMap((prompt) => {
    const attack = debateMap.attackNodes.find((node) => node.id === prompt.attackId)
    const argument = debateMap.argumentNodes.find((node) => node.id === prompt.argumentId)

    if (!attack || !argument) return []

    return [{
      expandableMaterial: argument.evidenceType,
      followUpQuestions: [
        '你的证据覆盖的是个案、趋势还是制度性结论？',
        '即使这个风险存在，为什么比我方主线更优先？',
      ],
      id: `free-${prompt.id}`,
      oneLineResponse: `这个攻击只说明要设边界，不能推翻「${argument.title}」。`,
      returnMainline: `回到「${argument.title}」和本方判准。`,
      side: prompt.side,
      sideLabel: sideLabels[prompt.side],
      trapToAvoid: '不要在自由辩中替对方补完完整机制，也不要被拖进无限举例。',
      trigger: `${sideLabels[attack.side]}打「${attack.title}」`,
    }]
  })
}

function createSpeechStructurePacks(
  sides: PreparedSide[],
  finalRouteMap: FinalRouteMap,
  format: DebateFormatPreset,
): SpeechStructurePack[] {
  return sides.map((side) => {
    const route = finalRouteMap.routes.find((item) => item.side === side)
    const mainlines = route?.coreArguments.map((core) => core.card.title) ?? ['判准', '机制', '称重']
    const crossStage = format.stages.find((stage) => stage.name.includes('质') || stage.name.includes('攻'))?.name ?? '质询 / 攻防'

    return {
      side,
      sideLabel: sideLabels[side],
      speeches: [
        {
          purpose: '建立可投票框架',
          role: '一辩稿 / 开篇结构',
          structure: route?.openingStructure ?? mainlines.map((title, index) => `${index + 1}. 用「${title}」建立主线。`),
        },
        {
          purpose: '处理对方开篇最强压力',
          role: '二辩驳论重点',
          structure: [
            `先拆对方最强攻击的证明责任。`,
            `用「${mainlines[0]}」守住判准。`,
            `用「${mainlines[1] ?? mainlines[0]}」转回比较世界。`,
          ],
        },
        {
          purpose: '把问答转为得分点',
          role: `三辩${crossStage}结构`,
          structure: [
            '起手锁定对方证明范围。',
            `连续追问其是否能击穿「${mainlines[0]}」。`,
            '小结时把让步翻译成裁判投票理由。',
          ],
        },
        {
          purpose: '收束胜负判断',
          role: '四辩结辩框架',
          structure: [
            `第一层：${mainlines[0]}是否成立。`,
            `第二层：${mainlines[1] ?? mainlines[0]}是否更可执行。`,
            `第三层：${mainlines[2] ?? mainlines[0]}如何完成称重。`,
          ],
        },
      ],
    }
  })
}

function createClosingVotingIssuePacks(
  sides: PreparedSide[],
  selection: ArgumentSelection,
  finalRouteMap: FinalRouteMap,
): ClosingVotingIssuePack[] {
  return sides.map((side) => {
    const sideSelection = selection.sides.find((item) => item.side === side)
    const route = finalRouteMap.routes.find((item) => item.side === side)
    const votingIssues = route?.coreArguments.map((core) => core.card.title) ?? sideSelection?.primary.map((card) => card.title) ?? ['核心判准']
    const risky = sideSelection?.primary.sort((left, right) => right.riskScore - left.riskScore)[0]

    return {
      advantageClosing: `本方已经把比赛收束到 ${votingIssues.join('、')}，这些点比对方零散攻击更能解释裁判应如何投票。`,
      deadlockClosing: `即使双方都有局部成立，本方在证明责任、可执行性和影响称重上仍保留更稳定路线。`,
      dropDisputes: ['边缘例子数量竞赛', '无法落地的定义争执', '不影响主线的材料瑕疵'],
      mustRepeatMainlines: votingIssues,
      opponentStrongAttackClosing: risky
        ? `对方最强攻势集中在「${risky.title}」，我方承认需要边界，但已用防守和备用路线保住投票路径。`
        : '对方最强攻势只能制造疑问，不能完成反向证明。',
      side,
      sideLabel: sideLabels[side],
      votingIssues: votingIssues.slice(0, 3),
    }
  })
}

function createEvidenceGapChecklist(debateMap: DebateMap): EvidenceGapChecklistItem[] {
  return debateMap.evidenceGaps.map((gap) => ({
    avoidMaterial: '避免只用无法核验的口号、单一轶事或没有比较对象的数据。',
    caseDirection: `查找能支撑「${gap.argumentTitle}」的定义、案例、趋势或反例材料。`,
    currentGap: gap.reason,
    evidenceType: gap.evidenceType,
    id: gap.id,
    mainline: gap.argumentTitle,
    priority: gap.severity,
    side: gap.side,
    sideLabel: sideLabels[gap.side],
  }))
}

function createTrainingReviewChecklist(selection: ArgumentSelection, debateMap: DebateMap): TrainingReviewChecklist {
  const riskyMainlines = selection.sides.flatMap((side) =>
    side.primary.filter((card) => card.riskScore >= 55).map((card) => `${sideLabels[side.side]}「${card.title}」`),
  )
  const crossPaths = debateMap.defenseLinks.slice(0, 4).map((link) => {
    const attack = debateMap.attackNodes.find((node) => node.id === link.fromAttackId)
    return `${sideLabels[link.side]}逼问「${attack?.title ?? '对方攻击'}」的证明范围`
  })
  const rewriteCards = debateMap.freeDebatePrompts.slice(0, 4).map((prompt) => {
    const attack = debateMap.attackNodes.find((node) => node.id === prompt.attackId)
    return `${sideLabels[prompt.side]}应重写触发「${attack?.title ?? '对方攻击'}」时的一句话回应`
  })

  return {
    effectiveCrossExaminationPaths: crossPaths.length > 0 ? crossPaths : ['至少测试一条定义追问和一条机制追问。'],
    freeDebateCardsToRewrite: rewriteCards.length > 0 ? rewriteCards : ['自由辩卡需补充触发条件、追问和撤退路线。'],
    piercedArguments: riskyMainlines.length > 0 ? riskyMainlines : ['暂无高风险主线，但模拟赛仍需记录被连续追问的论点。'],
    postMatchReviewQuestions: [
      '哪些论点真的成为裁判可投票理由？',
      '哪些对方攻击需要新增攻防表条目？',
      '哪些证据缺口在质询或自由辩中被放大？',
    ],
    roleTrainingFocus: [
      '一辩训练：三条主线必须能在两分钟内清楚落地。',
      '二辩训练：先拆证明责任，再转回本方主线。',
      '三辩训练：每棵质询树只追一个承认目标。',
      '四辩训练：用 voting issues 放弃小争议并完成称重。',
    ],
    scrimmageChecks: [
      '赛前只使用战术包训练，不在正式比赛中调用 AI 提词。',
      '每轮模拟赛后标记主线、辅助、待改写和淘汰论点。',
      '自由辩只练触发条件和撤退路线，不背长段稿。',
    ],
  }
}

function getPackageSides(
  config: HumanPrepConfig,
  selection: ArgumentSelection,
  discovery: ArgumentDiscovery,
): PreparedSide[] {
  const sides = new Set<PreparedSide>([
    ...(config.side === 'both' ? ['affirmative', 'negative'] as PreparedSide[] : [config.side]),
    ...selection.sides.map((side) => side.side),
    ...discovery.opponentLikelyArguments.map((argument) => argument.side),
  ])

  return ['affirmative', 'negative'].filter((side): side is PreparedSide => sides.has(side as PreparedSide))
}

function toPackageArgumentStatus(status: ArgumentStatus, card: ArgumentCard): PrepPackageArgumentStatus {
  if (status === 'primary') return 'mainline'
  if (status === 'backup') return 'support'
  if (status === 'dropped') return 'eliminated'
  if (card.riskScore >= 58) return 'rewrite'
  return 'support'
}

function getSideArgumentNodes(debateMap: DebateMap, side: PreparedSide): DebateMapArgumentNode[] {
  return debateMap.argumentNodes.filter((node) => node.side === side)
}

function findRouteMainline(finalRouteMap: FinalRouteMap, side: PreparedSide): string | undefined {
  return finalRouteMap.routes.find((route) => route.side === side)?.coreArguments[0]?.card.title
}

function findBackupRoute(selection: ArgumentSelection, side: PreparedSide): string {
  const backup = selection.sides.find((item) => item.side === side)?.backup[0]
  return backup ? `失败时撤到「${backup.title}」：${backup.bestDefense}` : '失败时承认局部条件，回到本方判准。'
}

function inferAttackType(text: string): string {
  if (/定义|范围|缩题/.test(text)) return '定义'
  if (/证据|数据|案例|材料/.test(text)) return '证据'
  if (/成本|执行|机制|主体|预算/.test(text)) return '可行性'
  if (/称重|收益|风险|价值/.test(text)) return '价值称重'
  if (/反例|替代/.test(text)) return '反例'
  return '逻辑'
}

function extractKeywords(topic: string): string[] {
  const tokens = topic
    .replace(/[，。！？、；：“”"'（）()]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)

  if (tokens.length >= 3) return tokens.slice(0, 6)

  const compact = topic.replace(/\s+/g, '')
  const chunks = compact.match(/.{1,4}/g) ?? [topic]
  return chunks.slice(0, 6)
}

function trainingChecklistLines(checklist: TrainingReviewChecklist): string[] {
  return [
    '### 模拟赛检查项',
    ...checklist.scrimmageChecks.map((line) => `- ${line}`),
    '### 辩位训练重点',
    ...checklist.roleTrainingFocus.map((line) => `- ${line}`),
    '### 赛后复盘问题',
    ...checklist.postMatchReviewQuestions.map((line) => `- ${line}`),
    '### 被打穿论点',
    ...checklist.piercedArguments.map((line) => `- ${line}`),
    '### 有效质询路径',
    ...checklist.effectiveCrossExaminationPaths.map((line) => `- ${line}`),
    '### 需重写自由辩卡',
    ...checklist.freeDebateCardsToRewrite.map((line) => `- ${line}`),
  ]
}

export function createArtifactAnchor(name: string): string {
  return `artifact-${stableHash(name).toString(16)}`
}
