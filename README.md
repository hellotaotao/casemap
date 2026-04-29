# CaseMap

CaseMap 是一个面向中文辩论的 AI 备赛与攻防地图工具，用结构化论点池、对方攻击预测、迭代压力测试和可复制备赛包帮助队伍准备比赛。

## 当前范围

- 中文辩论备赛工作台，支持配置辩题、备赛方、赛制、迭代轮数和裁判风格。
- 本地确定性生成论点池、正反路线、裁判 ballot、攻防地图和可复制备赛包。
- 模型竞技场规划：支持换边 benchmark 和排行榜。
- 本地 AI 服务设置，覆盖 OpenAI、Claude/Anthropic、Google/Gemini 和 xAI，包含浏览器本地 API key 存储、连通性测试、角色路由和确定性 fallback 标签。
- 首条真实生成路径：本地 OpenAI 生成接口可生成论点池和对方可能主打，失败时回退到本地确定性 mock。

## AI 服务安全说明

真实 OpenAI 论点生成路径在本地开发时刻意放在服务端：Vite 暴露仅允许本地访问的 `/api/casemap/openai/argument-discovery`，并从运行 `npm run dev` 的 shell 读取 `process.env.OPENAI_API_KEY`。该 key 不会打包进浏览器应用，也不应提交到代码库。

现有服务设置 UI 仍会把用户输入的 API key 存在本浏览器的 `localStorage`，用于连通性和角色路由实验，并在界面中隐藏已保存 key。用于真实用户前，生产部署应把所有密钥迁移到后端或安全 vault。

## 本地 OpenAI 生成

如果 shell 已通过 `~/.env.local`（由 `~/.zshrc` source）加载 `OPENAI_API_KEY`，在该 shell 启动开发服务器：

```bash
npm run dev -- --host 127.0.0.1
```

默认情况下，本地 OpenAI 生成接口使用 `gpt-5.4` 作为成本/效果平衡模型。需要质量优先时，可用 `gpt-5.5` 覆盖：

```bash
CASEMAP_OPENAI_MODEL=gpt-5.5 npm run dev -- --host 127.0.0.1
OPENAI_MODEL=gpt-5.5 npm run dev -- --host 127.0.0.1
```

同时设置时，`CASEMAP_OPENAI_MODEL` 优先于 `OPENAI_MODEL`。
该本地接口的论点发现路径只接受 `gpt-5.4` 和 `gpt-5.5`；不支持的覆盖值会被忽略，并回退到 `gpt-5.4`。

在应用中点击 **真实 AI 生成论点池**。如果缺少环境变量 key，或 OpenAI 返回无效 JSON，界面会显示错误并回退到本地确定性 mock。

## 命令

```bash
npm install
npm test
npm run build
npm run lint
npm run dev -- --host 127.0.0.1
```
