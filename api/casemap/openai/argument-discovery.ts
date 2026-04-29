import {
  buildOpenAiArgumentDiscoveryPrompt,
  parseOpenAiArgumentDiscoveryResponse,
  resolveOpenAiArgumentModel,
  type ArgumentDiscoveryGenerationRequest,
} from '../../../src/domain/openAiArgumentGeneration.js'

declare const process: { env: Record<string, string | undefined> }
declare const fetch: (url: string, init: OpenAiFetchInit) => Promise<OpenAiFetchResponse>


type OpenAiFetchInit = {
  body?: string
  headers?: Record<string, string>
  method?: string
}

type OpenAiFetchResponse = {
  json: () => Promise<unknown>
  ok: boolean
  status: number
  statusText: string
}

type VercelRequest = {
  body?: unknown
  method?: string
}

type VercelResponse = {
  status: (statusCode: number) => VercelResponse
  json: (payload: Record<string, unknown>) => void
  setHeader: (name: string, value: string) => void
}

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
  error?: {
    message?: string
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Only POST is supported.' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    res.status(500).json({ error: 'Missing OPENAI_API_KEY in the Vercel project environment.' })
    return
  }

  try {
    const request = readGenerationRequest(req.body)
    const modelResolution = resolveOpenAiArgumentModel(process.env)
    const model = modelResolution.model
    const prompt = buildOpenAiArgumentDiscoveryPrompt(request)

    const openAiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      body: JSON.stringify({
        max_completion_tokens: 3000,
        messages: prompt.messages,
        model,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'casemap_argument_discovery',
            schema: prompt.schema,
            strict: true,
          },
        },
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    })
    const payload = (await openAiResponse.json()) as OpenAiChatCompletionResponse

    if (!openAiResponse.ok) {
      res.status(502).json({
        error: `OpenAI request failed: ${payload.error?.message ?? `HTTP ${openAiResponse.status} ${openAiResponse.statusText}`}`,
      })
      return
    }

    const content = payload.choices?.[0]?.message?.content
    const discovery = parseOpenAiArgumentDiscoveryResponse(content, request, { model })

    res.status(200).json({
      discovery,
      message: modelResolution.warning
        ? `已使用 OpenAI ${model} 真实生成论点池。${modelResolution.warning}`
        : `已使用 OpenAI ${model} 真实生成论点池。`,
      model,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    res.status(500).json({ error: message })
  }
}

function readGenerationRequest(value: unknown): ArgumentDiscoveryGenerationRequest {
  if (!isGenerationRequest(value)) {
    throw new Error('Invalid argument generation request payload.')
  }

  return value
}

function isGenerationRequest(value: unknown): value is ArgumentDiscoveryGenerationRequest {
  if (!isRecord(value) || !isRecord(value.config) || !isRecord(value.format)) return false

  return (
    typeof value.config.topic === 'string' &&
    typeof value.config.side === 'string' &&
    typeof value.config.formatId === 'string' &&
    typeof value.config.iterationCount === 'number' &&
    typeof value.config.strategyMode === 'string' &&
    typeof value.format.id === 'string' &&
    Array.isArray(value.format.stages) &&
    Array.isArray(value.preparedSides) &&
    value.preparedSides.every((side) => side === 'affirmative' || side === 'negative') &&
    isRecord(value.roleSources)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
