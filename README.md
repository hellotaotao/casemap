# AI Debate Lab

A local product prototype for structured AI-assisted debate preparation and model-vs-model debate benchmarking.

## Current Scope

- Human debate prep workbench with configurable motion, roles, round count, and judge style.
- Deterministic local debate generation with pro/con turns, judge ballot, attack-defense roadmap, and copyable prep report.
- Model arena with side-swapped benchmark matches and leaderboard.
- Local AI provider settings for OpenAI, Claude/Anthropic, Google/Gemini, and xAI, including browser-local API key storage, connectivity tests, role routing, and deterministic fallback labels.
- First real generation path: an OpenAI-backed dev endpoint can generate the argument pool and opponent likely arguments, with deterministic mock fallback when unavailable.

## AI Provider Security Notes

The real OpenAI argument generation path is intentionally server-side during local development: Vite exposes a local-only `/api/ai-debate/openai/argument-discovery` endpoint that reads `process.env.OPENAI_API_KEY` from the shell running `npm run dev`. The key is never bundled into the browser app and should not be committed.

The older provider settings UI still stores user-supplied API keys in this browser's `localStorage` for connectivity/routing experiments and masks saved keys in the UI. Production deployments should move all secrets to a backend or secure vault before using real user accounts.

## Local OpenAI Generation

If your shell already loads `OPENAI_API_KEY` from `~/.zshrc`, start the dev server from that shell:

```bash
npm run dev -- --host 127.0.0.1
```

By default the OpenAI dev endpoint uses `gpt-5.4` as the cost/performance default. Use a model override when you want a quality-first run with `gpt-5.5`:

```bash
AI_DEBATE_OPENAI_MODEL=gpt-5.5 npm run dev -- --host 127.0.0.1
OPENAI_MODEL=gpt-5.5 npm run dev -- --host 127.0.0.1
```

`AI_DEBATE_OPENAI_MODEL` takes precedence over `OPENAI_MODEL` when both are set.

Use the **真实 AI 生成论点池** button in the app. If the env key is missing or OpenAI returns invalid JSON, the UI shows the error and falls back to the deterministic local mock.

## Commands

```bash
npm install
npm test
npm run build
npm run lint
npm run dev -- --host 127.0.0.1
```
