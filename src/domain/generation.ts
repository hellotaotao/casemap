import { generateArgumentDiscovery, getDebateFormatPreset, getPreparedSides, normalizePrepConfig } from './debate'
import type { DebateAgentRole, GenerationSource } from './roleAssignments'
import type { ArgumentDiscovery, HumanPrepConfig } from './types'
import type { ArgumentDiscoveryGenerationRequest } from './openAiArgumentGeneration'

export type ArgumentDiscoveryGeneratorId = 'local-mock' | 'openai-dev'

export type ArgumentDiscoveryGenerationResult = {
  discovery: ArgumentDiscovery
  fallbackUsed: boolean
  message: string
  model?: string
  providerId: ArgumentDiscoveryGeneratorId
}

export type ArgumentDiscoveryGenerator = {
  id: ArgumentDiscoveryGeneratorId
  label: string
  generate: (request: ArgumentDiscoveryGenerationRequest) => Promise<ArgumentDiscoveryGenerationResult>
}

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

type OpenAiDevEndpointResponse = {
  discovery?: ArgumentDiscovery
  error?: string
  message?: string
  model?: string
}

export function createArgumentDiscoveryGenerationRequest(
  config: HumanPrepConfig,
  roleSources: Partial<Record<DebateAgentRole, GenerationSource>>,
): ArgumentDiscoveryGenerationRequest {
  const normalized = normalizePrepConfig(config)

  return {
    config: normalized,
    format: getDebateFormatPreset(normalized.formatId),
    preparedSides: getPreparedSides(normalized.side),
    roleSources,
  }
}

export function createLocalMockArgumentDiscoveryGenerator(): ArgumentDiscoveryGenerator {
  return {
    id: 'local-mock',
    label: '本地 mock',
    async generate(request) {
      return {
        discovery: generateArgumentDiscovery(
          request.config as HumanPrepConfig,
          request.roleSources as Partial<Record<DebateAgentRole, GenerationSource>>,
        ),
        fallbackUsed: false,
        message: '已使用本地确定性 mock 生成论点池。',
        providerId: 'local-mock',
      }
    },
  }
}

export function createOpenAiDevArgumentDiscoveryGenerator(fetcher: FetchLike = fetch): ArgumentDiscoveryGenerator {
  return {
    id: 'openai-dev',
    label: 'OpenAI dev endpoint',
    async generate(request) {
      const response = await fetcher('/api/ai-debate/openai/argument-discovery', {
        body: JSON.stringify(request),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      })
      const payload = await readJsonSafely(response)

      if (!response.ok) {
        throw new Error(payload.error || payload.message || `OpenAI dev endpoint failed: HTTP ${response.status}`)
      }

      if (!payload.discovery?.candidateCards?.length || !payload.discovery?.opponentLikelyArguments?.length) {
        throw new Error('OpenAI dev endpoint returned an empty discovery payload.')
      }

      return {
        discovery: payload.discovery,
        fallbackUsed: false,
        message: payload.message ?? '已使用 OpenAI 真实生成论点池。',
        model: payload.model,
        providerId: 'openai-dev',
      }
    },
  }
}

export async function generateArgumentDiscoveryWithFallback(
  primary: ArgumentDiscoveryGenerator,
  fallback: ArgumentDiscoveryGenerator,
  request: ArgumentDiscoveryGenerationRequest,
): Promise<ArgumentDiscoveryGenerationResult> {
  try {
    return await primary.generate(request)
  } catch (error) {
    const fallbackResult = await fallback.generate(request)
    const reason = error instanceof Error ? error.message : String(error)

    return {
      ...fallbackResult,
      fallbackUsed: true,
      message: `真实 AI 生成失败，已切回本地 mock：${reason}`,
    }
  }
}

async function readJsonSafely(response: Response): Promise<OpenAiDevEndpointResponse> {
  try {
    return await response.json() as OpenAiDevEndpointResponse
  } catch {
    return {}
  }
}
