import { stableHash } from './deterministic'

export type PreparedSide = 'affirmative' | 'negative'

export type DebateAgentRole =
  | 'affirmative'
  | 'negative'
  | 'judge'
  | 'strategyCoach'
  | 'evidenceScout'
  | 'attackSimulator'

export type ArgumentRecommendation = 'primary' | 'backup' | 'emergency' | 'discard'

export type HumanPrepConfig = {
  topic: string
  side: PreparedSide | 'both'
  formatId: string
  iterationCount: number
  strategyMode: string
}

export type DebateFormatPreset = {
  id: string
  name: string
  shortName: string
  description: string
  stages: Array<{
    id: string
    name: string
    side: PreparedSide | 'both'
    speaker: string
    duration: string
    purpose: string
  }>
}

export type GenerationSourceSnapshot = {
  mode?: 'provider' | 'local-fallback' | string
  providerName?: string
  reason?: string
  roleLabel?: string
}

export type GeneratedSource = {
  label: string
  mode: 'provider'
  providerId: 'openai'
  providerName: string
  reason?: string
  role: DebateAgentRole
  roleLabel: string
  status: 'connected'
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
  generatedBy?: GeneratedSource
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
  generatedBy?: GeneratedSource
}

export type ArgumentDiscovery = {
  candidateCards: ArgumentCard[]
  opponentLikelyArguments: OpponentLikelyArgument[]
}

export const defaultOpenAiArgumentModel = 'gpt-5.4'

export type ArgumentDiscoveryGenerationRequest = {
  config: HumanPrepConfig
  format: DebateFormatPreset
  preparedSides: PreparedSide[]
  roleSources: Partial<Record<DebateAgentRole, GenerationSourceSnapshot>>
}

export type OpenAiChatMessage = {
  role: 'system' | 'user'
  content: string
}

export type OpenAiArgumentDiscoveryPrompt = {
  messages: OpenAiChatMessage[]
  schema: typeof openAiArgumentDiscoveryJsonSchema
}

type UnknownRecord = Record<string, unknown>

type GeneratedSourceOptions = {
  model?: string
  providerName?: string
}

const sideLabels: Record<PreparedSide, string> = {
  affirmative: '正方',
  negative: '反方',
}

const roleLabels: Record<DebateAgentRole, string> = {
  affirmative: '正方',
  attackSimulator: '攻击模拟器',
  evidenceScout: '证据侦察',
  judge: '裁判',
  negative: '反方',
  strategyCoach: '策略教练',
}

const recommendationValues: ArgumentRecommendation[] = ['primary', 'backup', 'emergency', 'discard']

export const openAiArgumentDiscoveryJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['candidateCards', 'opponentLikelyArguments'],
  properties: {
    candidateCards: {
      type: 'array',
      minItems: 6,
      maxItems: 24,
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'side',
          'title',
          'claim',
          'whyItMatters',
          'evidenceType',
          'strongestAttack',
          'bestDefense',
          'strengthScore',
          'riskScore',
          'recommendedRole',
        ],
        properties: {
          side: { type: 'string', enum: ['affirmative', 'negative'] },
          title: { type: 'string' },
          claim: { type: 'string' },
          whyItMatters: { type: 'string' },
          evidenceType: { type: 'string' },
          strongestAttack: { type: 'string' },
          bestDefense: { type: 'string' },
          strengthScore: { type: 'integer', minimum: 0, maximum: 100 },
          riskScore: { type: 'integer', minimum: 0, maximum: 100 },
          recommendedRole: { type: 'string', enum: ['primary', 'backup', 'emergency', 'discard'] },
        },
      },
    },
    opponentLikelyArguments: {
      type: 'array',
      minItems: 4,
      maxItems: 16,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['againstSide', 'side', 'title', 'claim', 'likelyStage', 'threatScore', 'responseHint'],
        properties: {
          againstSide: { type: 'string', enum: ['affirmative', 'negative'] },
          side: { type: 'string', enum: ['affirmative', 'negative'] },
          title: { type: 'string' },
          claim: { type: 'string' },
          likelyStage: { type: 'string' },
          threatScore: { type: 'integer', minimum: 0, maximum: 100 },
          responseHint: { type: 'string' },
        },
      },
    },
  },
} as const

export function buildOpenAiArgumentDiscoveryPrompt(
  request: ArgumentDiscoveryGenerationRequest,
): OpenAiArgumentDiscoveryPrompt {
  const roleContext = Object.entries(request.roleSources).map(([role, source]) => ({
    role,
    roleLabel: source?.roleLabel ?? getRoleLabel(role as DebateAgentRole),
    providerName: source?.providerName ?? '未指定',
    mode: source?.mode ?? 'local-fallback',
  }))

  const task = {
    task: 'generate_argument_discovery_for_debate_prep',
    language: 'zh-CN',
    debateMotion: request.config.topic,
    preparingSides: request.preparedSides.map((side) => ({ id: side, label: sideLabels[side] })),
    debateFormat: {
      id: request.format.id,
      name: request.format.name,
      description: request.format.description,
      stages: request.format.stages.map((stage) => ({
        id: stage.id,
        name: stage.name,
        side: stage.side,
        speaker: stage.speaker,
        duration: stage.duration,
        purpose: stage.purpose,
      })),
    },
    currentRoleRouting: roleContext,
    outputRules: [
      'Return JSON only; no markdown, no commentary.',
      'candidateCards must contain 8-10 usable cards per preparing side when possible.',
      'opponentLikelyArguments must contain 4-6 likely opponent attacks for each preparing side.',
      'Make claims concrete to the exact motion; avoid generic debate boilerplate.',
      'Scores are integers from 0 to 100. Higher risk means easier to attack.',
      'recommendedRole must be one of primary, backup, emergency, discard.',
    ],
  }

  return {
    schema: openAiArgumentDiscoveryJsonSchema,
    messages: [
      {
        role: 'system',
        content:
          '你是一个中文辩论备赛教练。你的任务是生成可直接用于备赛工作台的结构化 JSON：论点池、攻防弱点、证据方向、对方可能主打。优先具体、可交锋、可被裁判投票的内容。',
      },
      {
        role: 'user',
        content: JSON.stringify(task, null, 2),
      },
    ],
  }
}

export function parseOpenAiArgumentDiscoveryResponse(
  content: unknown,
  request: ArgumentDiscoveryGenerationRequest,
  options: GeneratedSourceOptions = {},
): ArgumentDiscovery {
  const parsed = typeof content === 'string' ? parseJsonContent(content) : content

  if (!isRecord(parsed)) {
    throw new Error('OpenAI 返回内容不是 JSON object。')
  }

  const rawCards = readArray(parsed, 'candidateCards') ?? readArray(parsed, 'argumentCards')
  const rawOpponentArguments = readArray(parsed, 'opponentLikelyArguments') ?? readArray(parsed, 'opponentArguments')

  if (!rawCards) throw new Error('OpenAI JSON 缺少 candidateCards 数组。')
  if (!rawOpponentArguments) throw new Error('OpenAI JSON 缺少 opponentLikelyArguments 数组。')

  const preparedSideSet = new Set(request.preparedSides)
  const candidateCards = rawCards
    .map((value, index) => normalizeArgumentCard(value, index, request, options))
    .filter((card): card is ArgumentCard => card !== null && preparedSideSet.has(card.side))

  const opponentLikelyArguments = rawOpponentArguments
    .map((value, index) => normalizeOpponentLikelyArgument(value, index, request, options))
    .filter((argument): argument is OpponentLikelyArgument => argument !== null && preparedSideSet.has(argument.againstSide))

  assertEveryPreparedSideHasCards(candidateCards, request.preparedSides)

  if (opponentLikelyArguments.length === 0) {
    throw new Error('OpenAI JSON 没有可用的 opponentLikelyArguments。')
  }

  return {
    candidateCards,
    opponentLikelyArguments,
  }
}

export function parseJsonContent(content: string): unknown {
  const trimmed = content.trim()

  try {
    return JSON.parse(trimmed)
  } catch {
    const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    try {
      return JSON.parse(unfenced)
    } catch {
      const firstBrace = unfenced.indexOf('{')
      const lastBrace = unfenced.lastIndexOf('}')

      if (firstBrace >= 0 && lastBrace > firstBrace) {
        return JSON.parse(unfenced.slice(firstBrace, lastBrace + 1))
      }

      throw new Error('OpenAI 返回内容无法解析为 JSON。')
    }
  }
}

function normalizeArgumentCard(
  value: unknown,
  index: number,
  request: ArgumentDiscoveryGenerationRequest,
  options: GeneratedSourceOptions,
): ArgumentCard | null {
  if (!isRecord(value)) return null

  const side = readPreparedSide(value.side) ?? request.preparedSides[index % request.preparedSides.length]
  const title = readRequiredText(value.title, `candidateCards[${index}].title`)
  const claim = readRequiredText(value.claim, `candidateCards[${index}].claim`)
  const generatedBy = createGeneratedSource(side, request, options)

  return {
    id: createGeneratedId('arg', request, side, title, index),
    side,
    title,
    claim,
    whyItMatters: readOptionalText(value.whyItMatters, '说明它如何影响裁判投票。'),
    evidenceType: readOptionalText(value.evidenceType, '需要补充可检索证据。'),
    strongestAttack: readOptionalText(value.strongestAttack, '对方可能攻击定义、机制或证据不足。'),
    bestDefense: readOptionalText(value.bestDefense, '先缩小承诺，再回到本方判准和比较优势。'),
    strengthScore: readScore(value.strengthScore, 70),
    riskScore: readScore(value.riskScore, 45),
    recommendedRole: readRecommendation(value.recommendedRole, index),
    generatedBy,
  }
}

function normalizeOpponentLikelyArgument(
  value: unknown,
  index: number,
  request: ArgumentDiscoveryGenerationRequest,
  options: GeneratedSourceOptions,
): OpponentLikelyArgument | null {
  if (!isRecord(value)) return null

  const againstSide = readPreparedSide(value.againstSide) ?? request.preparedSides[index % request.preparedSides.length]
  const side = readPreparedSide(value.side) ?? oppositeSide(againstSide)
  const title = readRequiredText(value.title, `opponentLikelyArguments[${index}].title`)
  const claim = readRequiredText(value.claim, `opponentLikelyArguments[${index}].claim`)
  const generatedBy = createGeneratedSource('attackSimulator', request, options)

  return {
    againstSide,
    claim,
    generatedBy,
    id: createGeneratedId('opp', request, againstSide, title, index),
    likelyStage: readOptionalText(value.likelyStage, '自由辩论'),
    responseHint: readOptionalText(value.responseHint, '先承认局部压力，再用本方主线重新称重。'),
    side,
    threatScore: readScore(value.threatScore, 65),
    title,
  }
}

function createGeneratedSource(
  role: PreparedSide | 'attackSimulator',
  request: ArgumentDiscoveryGenerationRequest,
  options: GeneratedSourceOptions,
): GeneratedSource {
  const sourceRole: DebateAgentRole = role === 'attackSimulator' ? 'attackSimulator' : role
  const routedSource = request.roleSources[sourceRole]
  const providerName = options.providerName ?? 'OpenAI'
  const modelSuffix = options.model ? ` · ${options.model}` : ''

  return {
    label: `${getRoleLabel(sourceRole)}：${providerName}${modelSuffix}（真实生成）`,
    mode: 'provider',
    providerId: 'openai',
    providerName,
    reason: routedSource?.reason,
    role: sourceRole,
    roleLabel: getRoleLabel(sourceRole),
    status: 'connected',
  }
}

function assertEveryPreparedSideHasCards(cards: ArgumentCard[], preparedSides: PreparedSide[]) {
  for (const side of preparedSides) {
    if (!cards.some((card) => card.side === side)) {
      throw new Error(`OpenAI JSON 没有生成 ${sideLabels[side]} 候选论点。`)
    }
  }
}

function createGeneratedId(
  kind: string,
  request: ArgumentDiscoveryGenerationRequest,
  side: PreparedSide,
  title: string,
  index: number,
): string {
  return `ai-${kind}-${side}-${stableHash(`${request.config.topic}|${request.format.id}|${side}|${title}|${index}`).toString(16)}`
}

function readArray(record: UnknownRecord, key: string): unknown[] | undefined {
  return Array.isArray(record[key]) ? record[key] : undefined
}

function readRequiredText(value: unknown, label: string): string {
  const text = readOptionalText(value, '')

  if (!text) throw new Error(`OpenAI JSON 字段 ${label} 为空。`)

  return text
}

function readOptionalText(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback

  const trimmed = value.trim().replace(/\s+/g, ' ')
  return trimmed || fallback
}

function readPreparedSide(value: unknown): PreparedSide | undefined {
  return value === 'affirmative' || value === 'negative' ? value : undefined
}

function readScore(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numeric)) return fallback

  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function readRecommendation(value: unknown, index: number): ArgumentRecommendation {
  if (recommendationValues.includes(value as ArgumentRecommendation)) {
    return value as ArgumentRecommendation
  }

  if (index < 3) return 'primary'
  if (index < 6) return 'backup'
  if (index < 8) return 'emergency'
  return 'discard'
}

function oppositeSide(side: PreparedSide): PreparedSide {
  return side === 'affirmative' ? 'negative' : 'affirmative'
}

function getRoleLabel(role: DebateAgentRole): string {
  return roleLabels[role]
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null
}
