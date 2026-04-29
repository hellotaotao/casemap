import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import {
  buildOpenAiArgumentDiscoveryPrompt,
  parseOpenAiArgumentDiscoveryResponse,
  resolveOpenAiArgumentModel,
  type ArgumentDiscoveryGenerationRequest,
} from './src/domain/openAiArgumentGeneration'

declare const Buffer: {
  from(input: Uint8Array): { toString(encoding: 'utf8'): string }
}

declare const fetch: (url: string, init: OpenAiFetchInit) => Promise<OpenAiFetchResponse>
declare const process: { env: Record<string, string | undefined> }

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

type MiddlewareRequest = AsyncIterable<Uint8Array | string> & {
  headers?: Record<string, string | string[] | undefined>
  method?: string
  socket?: {
    remoteAddress?: string
  }
}

type MiddlewareResponse = {
  end: (body?: string) => void
  setHeader: (name: string, value: string) => void
  statusCode: number
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), openAiArgumentGenerationDevEndpoint()],
})

function openAiArgumentGenerationDevEndpoint(): Plugin {
  return {
    name: 'casemap-openai-argument-generation-dev-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/casemap/openai/argument-discovery', async (req, res) => {
        const devReq = req as unknown as MiddlewareRequest
        const devRes = res as unknown as MiddlewareResponse

        if (devReq.method !== 'POST') {
          sendJson(devRes, 405, { error: 'Only POST is supported.' })
          return
        }

        if (!isLocalRequest(devReq)) {
          sendJson(devRes, 403, { error: 'This development endpoint only accepts local requests.' })
          return
        }

        const apiKey = process.env.OPENAI_API_KEY?.trim()

        if (!apiKey) {
          sendJson(devRes, 400, {
            error: 'Missing OPENAI_API_KEY in the Vite dev server environment. Start the app from a shell that has the key loaded (for example via ~/.env.local sourced by ~/.zshrc).',
          })
          return
        }

        try {
          const request = await readGenerationRequest(devReq)
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
          const payload = await openAiResponse.json() as OpenAiChatCompletionResponse

          if (!openAiResponse.ok) {
            sendJson(devRes, 502, {
              error: `OpenAI request failed: ${payload.error?.message ?? `HTTP ${openAiResponse.status} ${openAiResponse.statusText}`}`,
            })
            return
          }

          const content = payload.choices?.[0]?.message?.content
          const discovery = parseOpenAiArgumentDiscoveryResponse(content, request, { model })

          sendJson(devRes, 200, {
            discovery,
            message: modelResolution.warning
              ? `已使用 OpenAI ${model} 真实生成论点池。${modelResolution.warning}`
              : `已使用 OpenAI ${model} 真实生成论点池。`,
            model,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          sendJson(devRes, 500, { error: message })
        }
      })
    },
  }
}

async function readGenerationRequest(req: MiddlewareRequest): Promise<ArgumentDiscoveryGenerationRequest> {
  const raw = await readBody(req)
  const parsed = JSON.parse(raw) as unknown

  if (!isGenerationRequest(parsed)) {
    throw new Error('Invalid argument generation request payload.')
  }

  return parsed
}

async function readBody(req: MiddlewareRequest): Promise<string> {
  let body = ''

  for await (const chunk of req) {
    body += decodeBodyChunk(chunk)

    if (body.length > 1_000_000) {
      throw new Error('Request body is too large.')
    }
  }

  if (!body.trim()) {
    throw new Error('Request body is empty.')
  }

  return body
}

function decodeBodyChunk(chunk: Uint8Array | string): string {
  return typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
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

function isLocalRequest(req: MiddlewareRequest): boolean {
  const address = req.socket?.remoteAddress

  return !address || address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' || address.startsWith('::ffff:127.')
}

function sendJson(res: MiddlewareResponse, statusCode: number, payload: Record<string, unknown>) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
