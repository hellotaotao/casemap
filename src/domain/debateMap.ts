import { stableHash } from './deterministic'
import type {
  ArgumentCard,
  ArgumentSelection,
  DebateMap,
  DebateMapArgumentNode,
  DebateMapAttackNode,
  DebateMapDefenseLink,
  DebateMapEvidenceGap,
  DebateMapFreeDebatePrompt,
  DebateMapSideNode,
  EvidenceGapSeverity,
  FinalRouteMap,
  HumanPrepConfig,
  OpponentLikelyArgument,
  PreparedSide,
  SideArgumentSelection,
} from './types'

type DebateMapInput = {
  config: HumanPrepConfig
  selection: ArgumentSelection
  opponentLikelyArguments: OpponentLikelyArgument[]
  finalRouteMap: FinalRouteMap
}

const sideLabels: Record<PreparedSide, string> = {
  affirmative: '正方',
  negative: '反方',
}

export function createDebateMap({
  config,
  finalRouteMap,
  opponentLikelyArguments,
  selection,
}: DebateMapInput): DebateMap {
  const sideNodes = selection.sides.map(createSideNode)
  const evidenceGaps = selection.sides.flatMap(createEvidenceGaps)
  const evidenceGapByArgumentId = new Map(evidenceGaps.map((gap) => [gap.argumentId, gap.id]))
  const argumentNodes = selection.sides.flatMap((sideSelection) =>
    createArgumentNodes(sideSelection, evidenceGapByArgumentId),
  )
  const attackNodes = selection.sides.flatMap((sideSelection) =>
    opponentLikelyArguments
      .filter((argument) => argument.againstSide === sideSelection.side)
      .slice(0, 4)
      .map(createAttackNode),
  )
  const attackNodeBySourceId = new Map(attackNodes.map((node) => [node.id, node]))
  const defenseLinks = selection.sides.flatMap((sideSelection) =>
    createDefenseLinks(sideSelection, opponentLikelyArguments, attackNodeBySourceId),
  )
  const freeDebatePrompts = createFreeDebatePrompts(defenseLinks, attackNodes, argumentNodes)

  return {
    argumentNodes,
    attackNodes,
    centralConflict: createCentralConflict(config, finalRouteMap, opponentLikelyArguments),
    defenseLinks,
    evidenceGaps,
    freeDebatePrompts,
    motion: config.topic,
    sideNodes,
  }
}

function createSideNode(sideSelection: SideArgumentSelection): DebateMapSideNode {
  const coreTitles = sideSelection.primary.map((card) => card.title).join('、')
  const backupTitles = sideSelection.backup.slice(0, 2).map((card) => card.title).join('、')

  return {
    backupArgumentIds: sideSelection.backup.map((card) => card.id),
    coreArgumentIds: sideSelection.primary.map((card) => card.id),
    label: sideLabels[sideSelection.side],
    side: sideSelection.side,
    stance: backupTitles
      ? `主线压在 ${coreTitles}；备用用 ${backupTitles} 补位。`
      : `主线压在 ${coreTitles}。`,
  }
}

function createArgumentNodes(
  sideSelection: SideArgumentSelection,
  evidenceGapByArgumentId: Map<string, string>,
): DebateMapArgumentNode[] {
  return [
    ...sideSelection.primary.map((card) => createArgumentNode(card, 'primary', evidenceGapByArgumentId)),
    ...sideSelection.backup.map((card) => createArgumentNode(card, 'backup', evidenceGapByArgumentId)),
  ]
}

function createArgumentNode(
  card: ArgumentCard,
  status: DebateMapArgumentNode['status'],
  evidenceGapByArgumentId: Map<string, string>,
): DebateMapArgumentNode {
  const evidenceGapId = evidenceGapByArgumentId.get(card.id)

  return {
    bestDefense: card.bestDefense,
    claim: card.claim,
    evidenceType: card.evidenceType,
    ...(evidenceGapId ? { evidenceGapId } : {}),
    id: card.id,
    riskScore: card.riskScore,
    side: card.side,
    status,
    strengthScore: card.strengthScore,
    title: card.title,
  }
}

function createAttackNode(argument: OpponentLikelyArgument): DebateMapAttackNode {
  return {
    againstSide: argument.againstSide,
    claim: argument.claim,
    id: argument.id,
    likelyStage: argument.likelyStage,
    side: argument.side,
    threatScore: argument.threatScore,
    title: argument.title,
  }
}

function createDefenseLinks(
  sideSelection: SideArgumentSelection,
  opponentLikelyArguments: OpponentLikelyArgument[],
  attackNodeBySourceId: Map<string, DebateMapAttackNode>,
): DebateMapDefenseLink[] {
  return opponentLikelyArguments
    .filter((argument) => argument.againstSide === sideSelection.side)
    .slice(0, 4)
    .flatMap((pressure, index) => {
      const attackNode = attackNodeBySourceId.get(pressure.id)
      const responseCard = sideSelection.primary[index % Math.max(sideSelection.primary.length, 1)]
      const backupCard = sideSelection.backup[index % Math.max(sideSelection.backup.length, 1)]

      if (!attackNode || !responseCard) return []

      const id = createStableId('defense', sideSelection.side, pressure.id, responseCard.id)
      const freeDebatePromptId = createStableId('prompt', sideSelection.side, pressure.id, responseCard.id)

      return [{
        backupResponse: backupCard
          ? `追问升级时转入「${backupCard.title}」：${backupCard.claim}`
          : pressure.responseHint,
        freeDebatePromptId,
        fromAttackId: attackNode.id,
        id,
        response: `用「${responseCard.title}」防守：${responseCard.bestDefense}`,
        side: sideSelection.side,
        toArgumentId: responseCard.id,
      }]
    })
}

function createEvidenceGaps(sideSelection: SideArgumentSelection): DebateMapEvidenceGap[] {
  return [...sideSelection.primary, ...sideSelection.backup].map((card) => {
    const severity = getEvidenceGapSeverity(card)

    return {
      argumentId: card.id,
      argumentTitle: card.title,
      evidenceType: card.evidenceType,
      id: createStableId('gap', card.side, card.id, card.evidenceType),
      reason: createEvidenceGapReason(card, severity),
      severity,
      side: card.side,
    }
  })
}

function createFreeDebatePrompts(
  defenseLinks: DebateMapDefenseLink[],
  attackNodes: DebateMapAttackNode[],
  argumentNodes: DebateMapArgumentNode[],
): DebateMapFreeDebatePrompt[] {
  const attacksById = new Map(attackNodes.map((node) => [node.id, node]))
  const argumentsById = new Map(argumentNodes.map((node) => [node.id, node]))

  return defenseLinks.flatMap((link) => {
    const attack = attacksById.get(link.fromAttackId)
    const argument = argumentsById.get(link.toArgumentId)

    if (!attack || !argument) return []

    return [{
      argumentId: argument.id,
      attackId: attack.id,
      id: link.freeDebatePromptId,
      prompt: `自由辩追问：如果对方用「${attack.title}」压迫，先问其证据范围，再用「${argument.title}」把比较拉回本方判准。`,
      side: link.side,
    }]
  })
}

function createCentralConflict(
  config: HumanPrepConfig,
  finalRouteMap: FinalRouteMap,
  opponentLikelyArguments: OpponentLikelyArgument[],
): string {
  const routeLines = finalRouteMap.routes
    .map((route) => {
      const core = route.coreArguments[0]?.card.title ?? '核心判准'
      const pressure = opponentLikelyArguments.find((argument) => argument.againstSide === route.side)?.title ?? '对方压力'
      return `${sideLabels[route.side]}以「${core}」证明命题，预期被「${pressure}」攻击`
    })
    .join('；')

  return routeLines || `围绕「${config.topic}」比较双方世界的收益、风险和可执行性。`
}

function getEvidenceGapSeverity(card: ArgumentCard): EvidenceGapSeverity {
  if (card.riskScore >= 60 || card.recommendedRole === 'primary') return 'high'
  if (card.riskScore >= 42 || card.recommendedRole === 'backup') return 'medium'
  return 'low'
}

function createEvidenceGapReason(card: ArgumentCard, severity: EvidenceGapSeverity): string {
  if (severity === 'high') {
    return `主线材料必须补齐，否则会被连续追问「${card.strongestAttack}」打穿。`
  }

  if (severity === 'medium') {
    return '备用材料需要一条可复述例证，避免自由辩补位时只剩价值判断。'
  }

  return '低优先级材料，保留定义或称重口径即可。'
}

function createStableId(kind: string, side: PreparedSide, ...parts: string[]): string {
  return `${kind}-${side}-${stableHash(parts.join('|')).toString(16)}`
}
