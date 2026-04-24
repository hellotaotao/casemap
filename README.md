# AI Debate Lab

A local product prototype for structured AI-assisted debate preparation and model-vs-model debate benchmarking.

## Current Scope

- Human debate prep workbench with configurable motion, roles, round count, and judge style.
- Deterministic local debate generation with pro/con turns, judge ballot, attack-defense roadmap, and copyable prep report.
- Model arena with side-swapped benchmark matches and leaderboard.
- Local AI provider settings for OpenAI, Claude/Anthropic, Google/Gemini, and xAI, including browser-local API key storage, connectivity tests, role routing, and deterministic fallback labels.

## AI Provider Security Notes

This prototype stores user-supplied API keys in this browser's `localStorage` and masks saved keys in the UI. Keys are not logged by the app, but production deployments should move secrets to a backend or secure vault before using real user accounts.

## Commands

```bash
npm install
npm test
npm run build
npm run dev -- --host 127.0.0.1
```
