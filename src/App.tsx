import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import {
  applyProviderConnectionResult,
  getProviderDefinition,
  getProviderSummaries,
  setProviderApiKey,
  testProviderConnectivity,
  type ProviderId,
  type ProviderSettings,
  type ProviderSummary,
} from './domain/aiProviders'
import {
  autoSelectArguments,
  createHumanPrepSession,
  getDebateFormatPresets,
} from './domain/debate'
import {
  createArgumentDiscoveryGenerationRequest,
  createLocalMockArgumentDiscoveryGenerator,
  createOpenAiDevArgumentDiscoveryGenerator,
  generateArgumentDiscoveryWithFallback,
  type ArgumentDiscoveryGenerationResult,
  type ArgumentDiscoveryGeneratorId,
} from './domain/generation'
import { createProviderSettingsRepository } from './domain/providerSettings'
import {
  assignProviderToRole,
  createRoleAssignmentsRepository,
  debateAgentRoles,
  getRoleAssignmentChoices,
  type DebateAgentRole,
  type GenerationSource,
  type RoleAssignments,
  type RoleProviderSelection,
} from './domain/roleAssignments'
import type {
  ArgumentCard,
  ArgumentDiscovery,
  ArgumentStatus,
  DebateMap,
  DebateMapArgumentNode,
  DebateMapAttackNode,
  DebateMapDefenseLink,
  DebateMapEvidenceGap,
  DebateMapSideNode,
  DebateFormatPreset,
  FinalRouteMap,
  HumanPrepConfig,
  HumanPrepSession,
  PreparationPackage,
  PreparedSide,
  PrepSideChoice,
  SimulationIteration,
  StrategyMode,
} from './domain/types'

const defaultConfig: HumanPrepConfig = {
  topic: '大学应不应该强制学生使用 AI 工具完成课程学习',
  side: 'affirmative',
  formatId: 'chinese-four-v-four',
  iterationCount: 3,
  strategyMode: 'ai-auto',
}

const sideOptions: Array<{ value: PrepSideChoice; label: string }> = [
  { value: 'affirmative', label: '正方' },
  { value: 'negative', label: '反方' },
  { value: 'both', label: '双方都准备' },
]

const strategyModes: Array<{ value: StrategyMode; label: string }> = [
  { value: 'ai-auto', label: 'AI 自动选择' },
  { value: 'human-quick', label: '人类快速选择' },
]

const sideLabel: Record<PreparedSide, string> = {
  affirmative: '正方',
  negative: '反方',
}

const statusLabel: Record<ArgumentStatus, string> = {
  primary: '主线',
  backup: '备用',
  dropped: '放弃',
  unassigned: '应急',
}

type ProviderDraftKeys = Partial<Record<ProviderId, string>>

type GenerationUiState = {
  message: string
  model?: string
  status: 'idle' | 'loading' | 'success' | 'fallback' | 'error'
}

function App() {
  const providerRepository = useMemo(() => createProviderSettingsRepository(window.localStorage), [])
  const roleRepository = useMemo(() => createRoleAssignmentsRepository(window.localStorage), [])
  const localMockGenerator = useMemo(() => createLocalMockArgumentDiscoveryGenerator(), [])
  const openAiGenerator = useMemo(() => createOpenAiDevArgumentDiscoveryGenerator(window.fetch.bind(window)), [])
  const [config, setConfig] = useState<HumanPrepConfig>(defaultConfig)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ArgumentStatus>>({})
  const [copyState, setCopyState] = useState('复制战术包')
  const [providerSettings, setProviderSettings] = useState<ProviderSettings>(() => providerRepository.load())
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignments>(() => roleRepository.load())
  const [providerDraftKeys, setProviderDraftKeys] = useState<ProviderDraftKeys>({})
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null)
  const [generatedDiscovery, setGeneratedDiscovery] = useState<ArgumentDiscovery | undefined>()
  const [generationMode, setGenerationMode] = useState<ArgumentDiscoveryGeneratorId>('local-mock')
  const [generationState, setGenerationState] = useState<GenerationUiState>({
    message: '当前使用本地确定性 mock。',
    status: 'idle',
  })
  const [isGeneratingArgumentPool, setIsGeneratingArgumentPool] = useState(false)
  const presets = useMemo(() => getDebateFormatPresets(), [])
  const session = useMemo(
    () => createHumanPrepSession(config, statusOverrides, { providerSettings, roleAssignments, discoveryOverride: generatedDiscovery }),
    [config, statusOverrides, providerSettings, roleAssignments, generatedDiscovery],
  )

  function updateConfig(next: HumanPrepConfig) {
    setConfig(next)
    resetGeneratedDiscovery('配置已变更，已回到本地 mock。')
    setCopyState('复制战术包')
  }

  function rerunPrep(event: FormEvent) {
    event.preventDefault()
    setStatusOverrides({})
    resetGeneratedDiscovery('已重新生成本地 mock 论点池。')
    setCopyState('复制战术包')
  }

  function applyAutoSelect() {
    const autoSelection = autoSelectArguments(session.discovery.candidateCards)
    setStatusOverrides(autoSelection.statusById)
    setConfig((current) => ({ ...current, strategyMode: 'ai-auto' }))
    setCopyState('复制战术包')
  }

  function resetGeneratedDiscovery(message = '当前使用本地确定性 mock。') {
    setGeneratedDiscovery(undefined)
    setGenerationMode('local-mock')
    setGenerationState({ message, status: 'idle' })
  }

  function applyGenerationResult(result: ArgumentDiscoveryGenerationResult) {
    const isLocal = result.providerId === 'local-mock'

    setGeneratedDiscovery(isLocal ? undefined : result.discovery)
    setGenerationMode(isLocal ? 'local-mock' : 'openai-dev')
    setGenerationState({
      message: result.message,
      model: result.model,
      status: result.fallbackUsed ? 'fallback' : 'success',
    })
    setStatusOverrides({})
    setCopyState('复制战术包')
  }

  async function generateLocalArgumentPool() {
    const request = createArgumentDiscoveryGenerationRequest(config, session.aiRun.roles)
    const result = await localMockGenerator.generate(request)
    applyGenerationResult(result)
  }

  async function generateRealArgumentPool() {
    const request = createArgumentDiscoveryGenerationRequest(config, session.aiRun.roles)

    setIsGeneratingArgumentPool(true)
    setGenerationMode('openai-dev')
    setGenerationState({ message: '正在调用本地 OpenAI 生成接口生成论点池…', status: 'loading' })

    try {
      const result = await generateArgumentDiscoveryWithFallback(openAiGenerator, localMockGenerator, request)
      applyGenerationResult(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setGenerationState({ message: `生成失败：${message}`, status: 'error' })
    } finally {
      setIsGeneratingArgumentPool(false)
    }
  }

  function updateCardStatus(card: ArgumentCard, status: ArgumentStatus) {
    const nextStatuses = { ...session.selection.statusById }

    if (status === 'primary') {
      const currentPrimary = session.discovery.candidateCards.filter(
        (candidate) =>
          candidate.side === card.side &&
          candidate.id !== card.id &&
          session.selection.statusById[candidate.id] === 'primary',
      )
      if (currentPrimary.length >= 3) {
        const demoted = currentPrimary[currentPrimary.length - 1]
        nextStatuses[demoted.id] = 'backup'
      }
    }

    nextStatuses[card.id] = status
    setStatusOverrides(nextStatuses)
    setConfig((current) => ({ ...current, strategyMode: 'human-quick' }))
    setCopyState('复制战术包')
  }

  function updateProviderDraft(providerId: ProviderId, value: string) {
    setProviderDraftKeys((current) => ({ ...current, [providerId]: value }))
  }

  function saveProviderKey(providerId: ProviderId) {
    const draftKey = providerDraftKeys[providerId] ?? ''
    const nextSettings = setProviderApiKey(providerSettings, providerId, draftKey)

    persistProviderSettings(nextSettings)
    setProviderDraftKeys((current) => ({ ...current, [providerId]: '' }))
  }

  function clearProviderKey(providerId: ProviderId) {
    const nextSettings = setProviderApiKey(providerSettings, providerId, '')
    const nextAssignments = resetRolesUsingProvider(roleAssignments, providerId)

    persistProviderSettings(nextSettings)
    persistRoleAssignments(nextAssignments)
    setProviderDraftKeys((current) => ({ ...current, [providerId]: '' }))
  }

  async function testProvider(providerId: ProviderId) {
    const draftKey = providerDraftKeys[providerId]?.trim()
    const key = draftKey || providerSettings.providers[providerId].apiKey

    setTestingProvider(providerId)
    try {
      const result = await testProviderConnectivity(providerId, key, window.fetch.bind(window))
      const baseSettings = draftKey && result.checkedAt
        ? setProviderApiKey(providerSettings, providerId, draftKey)
        : providerSettings
      const nextSettings = applyProviderConnectionResult(baseSettings, providerId, result)
      persistProviderSettings(nextSettings)
      if (draftKey && result.checkedAt) {
        setProviderDraftKeys((current) => ({ ...current, [providerId]: '' }))
      }
    } finally {
      setTestingProvider(null)
    }
  }

  function updateRoleAssignment(role: DebateAgentRole, selection: RoleProviderSelection) {
    persistRoleAssignments(assignProviderToRole(roleAssignments, role, selection))
  }

  function persistProviderSettings(nextSettings: ProviderSettings) {
    setProviderSettings(nextSettings)
    providerRepository.save(nextSettings)
    resetGeneratedDiscovery('服务设置已变更，已回到本地 mock。')
    setCopyState('复制战术包')
  }

  function persistRoleAssignments(nextAssignments: RoleAssignments) {
    setRoleAssignments(nextAssignments)
    roleRepository.save(nextAssignments)
    resetGeneratedDiscovery('角色分配已变更，已回到本地 mock。')
    setCopyState('复制战术包')
  }

  async function copyPrepPack() {
    try {
      await navigator.clipboard.writeText(session.prepPack)
      setCopyState('已复制')
    } catch {
      setCopyState('复制失败')
    }
  }

  return (
    <main className="shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">CaseMap</p>
          <h1>强队式中文辩论赛前战术包</h1>
        </div>
        <span className="future-pill">赛前工具 · 非赛中提词</span>
      </header>

      <section className="workspace">
        <aside className="side-column">
          <SetupPanel
            config={config}
            generationMode={generationMode}
            generationState={generationState}
            isGeneratingArgumentPool={isGeneratingArgumentPool}
            presets={presets}
            session={session}
            onAutoSelect={applyAutoSelect}
            onChange={updateConfig}
            onGenerateLocal={generateLocalArgumentPool}
            onGenerateReal={generateRealArgumentPool}
            onSubmit={rerunPrep}
          />
          <ProviderSettingsPanel
            draftKeys={providerDraftKeys}
            providerSettings={providerSettings}
            testingProvider={testingProvider}
            onChangeDraft={updateProviderDraft}
            onClearKey={clearProviderKey}
            onSaveKey={saveProviderKey}
            onTestProvider={testProvider}
          />
          <RoleAssignmentsPanel
            aiRunRoles={session.aiRun.roles}
            providerSettings={providerSettings}
            roleAssignments={roleAssignments}
            onChange={updateRoleAssignment}
          />
        </aside>

        <section className="flow">
          <PreparationPackagePanel prepPackage={session.preparationPackage} />
          <DebateMapPanel map={session.debateMap} />
          <DiscoveryPanel session={session} onSetStatus={updateCardStatus} />
          <SimulationPanel iterations={session.iterations} format={session.format} />
          <FinalRoutePanel routeMap={session.finalRouteMap} />
          <ExportPanel copyState={copyState} prepPack={session.prepPack} onCopy={copyPrepPack} />
        </section>
      </section>
    </main>
  )
}

function ProviderSettingsPanel({
  draftKeys,
  providerSettings,
  testingProvider,
  onChangeDraft,
  onClearKey,
  onSaveKey,
  onTestProvider,
}: {
  draftKeys: ProviderDraftKeys
  providerSettings: ProviderSettings
  testingProvider: ProviderId | null
  onChangeDraft: (providerId: ProviderId, value: string) => void
  onClearKey: (providerId: ProviderId) => void
  onSaveKey: (providerId: ProviderId) => void
  onTestProvider: (providerId: ProviderId) => void
}) {
  const summaries = getProviderSummaries(providerSettings)

  return (
    <section className="settings-panel" aria-labelledby="ai-settings-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">AI Settings</p>
          <h2 id="ai-settings-title">服务设置</h2>
        </div>
      </div>
      <p className="security-note">
        本地原型：API Key 仅保存在本浏览器 localStorage；生产环境应迁移到后端或安全 vault。保存后只显示脱敏摘要。
      </p>

      <div className="provider-list">
        {summaries.map((summary) => (
          <ProviderSettingsCard
            draftKey={draftKeys[summary.providerId] ?? ''}
            isTesting={testingProvider === summary.providerId}
            key={summary.providerId}
            summary={summary}
            testDisabled={testingProvider !== null && testingProvider !== summary.providerId}
            onChangeDraft={onChangeDraft}
            onClearKey={onClearKey}
            onSaveKey={onSaveKey}
            onTestProvider={onTestProvider}
          />
        ))}
      </div>
    </section>
  )
}

function ProviderSettingsCard({
  draftKey,
  isTesting,
  summary,
  testDisabled,
  onChangeDraft,
  onClearKey,
  onSaveKey,
  onTestProvider,
}: {
  draftKey: string
  isTesting: boolean
  summary: ProviderSummary
  testDisabled: boolean
  onChangeDraft: (providerId: ProviderId, value: string) => void
  onClearKey: (providerId: ProviderId) => void
  onSaveKey: (providerId: ProviderId) => void
  onTestProvider: (providerId: ProviderId) => void
}) {
  const definition = getProviderDefinition(summary.providerId)
  const inputId = `${summary.providerId}-api-key`

  return (
    <article className="provider-card">
      <div className="provider-head">
        <div>
          <h3>{summary.displayName}</h3>
          <span>{summary.modelFamily}</span>
        </div>
        <ProviderStatusBadge summary={summary} />
      </div>

      {summary.configured ? <p className="masked-key">已保存 {summary.maskedKey}</p> : null}

      <label htmlFor={inputId}>API Key</label>
      <input
        autoComplete="off"
        id={inputId}
        placeholder={summary.configured ? `已保存 ${summary.maskedKey}` : definition.keyHint}
        spellCheck={false}
        type="password"
        value={draftKey}
        onChange={(event) => onChangeDraft(summary.providerId, event.target.value)}
      />

      <div className="provider-actions">
        <button
          className="secondary-action small-action"
          disabled={!draftKey.trim()}
          type="button"
          onClick={() => onSaveKey(summary.providerId)}
        >
          保存
        </button>
        <button
          className="primary-action small-action"
          disabled={testDisabled}
          type="button"
          onClick={() => onTestProvider(summary.providerId)}
        >
          {isTesting ? '测试中' : '测试'}
        </button>
        <button
          className="danger-action small-action"
          disabled={!summary.configured && !draftKey.trim()}
          type="button"
          onClick={() => onClearKey(summary.providerId)}
        >
          清除
        </button>
      </div>

      {summary.message ? <p className="provider-message">{summary.message}</p> : null}
      {summary.lastCheckedAt ? <p className="provider-message muted">上次测试：{formatCheckedAt(summary.lastCheckedAt)}</p> : null}
    </article>
  )
}

function ProviderStatusBadge({ summary }: { summary: ProviderSummary }) {
  return <span className={`status-badge status-${summary.status}`}>{summary.statusLabel}</span>
}

function RoleAssignmentsPanel({
  aiRunRoles,
  providerSettings,
  roleAssignments,
  onChange,
}: {
  aiRunRoles: Record<DebateAgentRole, GenerationSource>
  providerSettings: ProviderSettings
  roleAssignments: RoleAssignments
  onChange: (role: DebateAgentRole, selection: RoleProviderSelection) => void
}) {
  const choices = getRoleAssignmentChoices(providerSettings)

  return (
    <section className="settings-panel" aria-labelledby="role-settings-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Agent Routing</p>
          <h2 id="role-settings-title">角色分配</h2>
        </div>
      </div>

      <div className="role-list">
        {debateAgentRoles.map((role) => {
          const selection = roleAssignments[role.id] ?? 'auto'
          const source = aiRunRoles[role.id]
          const hasCurrentChoice = choices.some((choice) => choice.value === selection)

          return (
            <div className="role-row" key={role.id}>
              <div>
                <strong>{role.label}</strong>
                <GenerationBadge source={source} />
              </div>
              <select
                aria-label={`${role.label} provider`}
                value={selection}
                onChange={(event) => onChange(role.id, event.target.value as RoleProviderSelection)}
              >
                {choices.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {formatRoleChoice(choice)}
                  </option>
                ))}
                {!hasCurrentChoice && selection !== 'auto' ? (
                  <option disabled value={selection}>
                    {getProviderDefinition(selection).displayName}（未配置）
                  </option>
                ) : null}
              </select>
              {source.reason ? <p className="role-reason">{source.reason}</p> : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function SetupPanel({
  config,
  generationMode,
  generationState,
  isGeneratingArgumentPool,
  presets,
  session,
  onAutoSelect,
  onChange,
  onGenerateLocal,
  onGenerateReal,
  onSubmit,
}: {
  config: HumanPrepConfig
  generationMode: ArgumentDiscoveryGeneratorId
  generationState: GenerationUiState
  isGeneratingArgumentPool: boolean
  presets: DebateFormatPreset[]
  session: HumanPrepSession
  onAutoSelect: () => void
  onChange: (config: HumanPrepConfig) => void
  onGenerateLocal: () => void
  onGenerateReal: () => void
  onSubmit: (event: FormEvent) => void
}) {
  const selectedPrimaryCount = session.selection.sides.reduce((sum, side) => sum + side.primary.length, 0)
  const selectedBackupCount = session.selection.sides.reduce((sum, side) => sum + side.backup.length, 0)

  return (
    <form className="setup-panel" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="topic">辩题</label>
        <textarea
          id="topic"
          rows={4}
          value={config.topic}
          onChange={(event) => onChange({ ...config, topic: event.target.value })}
        />
      </div>

      <div className="field">
        <span className="field-label">我方</span>
        <div className="segmented" role="group" aria-label="选择我方">
          {sideOptions.map((option) => (
            <button
              className={config.side === option.value ? 'selected' : ''}
              key={option.value}
              onClick={() => onChange({ ...config, side: option.value })}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label htmlFor="format">赛制</label>
        <select
          id="format"
          value={config.formatId}
          onChange={(event) => onChange({ ...config, formatId: event.target.value as HumanPrepConfig['formatId'] })}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        <p className="format-note">{session.format.description}</p>
      </div>

      <div className="compact-grid">
        <div className="field">
          <label htmlFor="iteration-count">迭代次数</label>
          <input
            id="iteration-count"
            max={5}
            min={1}
            type="number"
            value={config.iterationCount}
            onChange={(event) => onChange({ ...config, iterationCount: Number(event.target.value) })}
          />
        </div>

        <div className="field">
          <span className="field-label">策略模式</span>
          <div className="segmented stacked" role="group" aria-label="选择策略模式">
            {strategyModes.map((mode) => (
              <button
                className={config.strategyMode === mode.value ? 'selected' : ''}
                key={mode.value}
                onClick={() => onChange({ ...config, strategyMode: mode.value })}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="generation-control">
        <span className="field-label">论点池生成</span>
        <div className="generation-actions">
          <button
            className={generationMode === 'local-mock' ? 'secondary-action selected-generator' : 'secondary-action'}
            disabled={isGeneratingArgumentPool}
            type="button"
            onClick={onGenerateLocal}
          >
            本地 mock 生成
          </button>
          <button
            className={generationMode === 'openai-dev' ? 'primary-action selected-generator' : 'primary-action'}
            disabled={isGeneratingArgumentPool}
            type="button"
            onClick={onGenerateReal}
          >
            {isGeneratingArgumentPool ? '真实生成中…' : '真实 AI 生成论点池'}
          </button>
        </div>
        <p className={`generation-message generation-${generationState.status}`}>
          {generationState.message}{generationState.model ? `（${generationState.model}）` : ''}
        </p>
      </div>

      <div className="setup-actions">
        <button className="primary-action" type="button" onClick={onAutoSelect}>
          AI 自动选择
        </button>
        <button className="secondary-action" type="submit">
          重新生成
        </button>
      </div>

      <div className="selection-meter" aria-label="当前选择概览">
        <div>
          <span>主线</span>
          <strong>{selectedPrimaryCount}</strong>
        </div>
        <div>
          <span>备用</span>
          <strong>{selectedBackupCount}</strong>
        </div>
        <div>
          <span>迭代</span>
          <strong>{session.iterations.length}</strong>
        </div>
      </div>
    </form>
  )
}

function PreparationPackagePanel({ prepPackage }: { prepPackage: PreparationPackage }) {
  const { artifacts } = prepPackage
  const firstArgumentRows = artifacts.argumentPool.slice(0, 8)
  const firstAttackRows = artifacts.attackDefenseTable.slice(0, 5)
  const firstCrossTrees = artifacts.crossExaminationTrees.slice(0, 4)
  const firstFreeDebateCards = artifacts.freeDebateTacticCards.slice(0, 4)
  const firstEvidenceGaps = artifacts.evidenceGapChecklist.slice(0, 6)

  return (
    <section className="stage-section prep-package-section">
      <div className="package-hero">
        <div>
          <p className="eyebrow">Main Output</p>
          <h2>{prepPackage.title}</h2>
          <p>{prepPackage.positioning}</p>
        </div>
        <div className="package-stat-grid" aria-label="备战包概览">
          <PackageStat label="Artifacts" value={prepPackage.artifactNames.length} />
          <PackageStat label="论点筛选" value={artifacts.argumentPool.length} />
          <PackageStat label="攻防条目" value={artifacts.attackDefenseTable.length} />
          <PackageStat label="训练缺口" value={artifacts.evidenceGapChecklist.length} />
        </div>
      </div>

      <div className="artifact-directory" aria-label="Artifact 目录">
        {prepPackage.artifactNames.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>

      <div className="package-grid">
        <ArtifactCard title="辩题拆解卡">
          <p className="artifact-lead">{artifacts.motionBreakdown.motion}</p>
          <ArtifactList
            items={[
              `核心冲突：${artifacts.motionBreakdown.centralConflict}`,
              `主要判准：${artifacts.motionBreakdown.judgingCriteria.join(' / ')}`,
              `易跑偏：${artifacts.motionBreakdown.commonPitfalls[0]}`,
            ]}
          />
        </ArtifactCard>

        <ArtifactCard title="双方立场地图">
          <div className="stance-mini-grid">
            {artifacts.stanceMap.sides.map((side) => (
              <div className="stance-mini-card" key={side.side}>
                <strong>{side.label}</strong>
                <p>{side.worldview}</p>
                <span>{side.strongestPath.slice(0, 3).join(' → ')}</span>
              </div>
            ))}
          </div>
        </ArtifactCard>
      </div>

      <ArtifactCard title="论点池与筛选表">
        <div className="artifact-table argument-artifact-table">
          {firstArgumentRows.map((row) => (
            <div className="artifact-row" key={row.id}>
              <span className={`package-status status-${row.status}`}>{row.statusLabel}</span>
              <strong>{row.sideLabel} · {row.title}</strong>
              <p>{toLead(row.claim)}</p>
              <p>证据：{row.evidenceNeeds}</p>
              <b>抗打 {row.antiHitScore} / 可投票 {row.votability}</b>
            </div>
          ))}
        </div>
      </ArtifactCard>

      <div className="package-grid">
        <ArtifactCard title="攻防表">
          <div className="artifact-stack">
            {firstAttackRows.map((row) => (
              <div className="artifact-mini-row" key={`${row.side}-${row.opponentAttack}`}>
                <span>{row.sideLabel} · {row.attackType}</span>
                <strong>{toLead(row.opponentAttack)}</strong>
                <p>{row.mainResponse}</p>
                <em>{row.returnToMainline}</em>
              </div>
            ))}
          </div>
        </ArtifactCard>

        <ArtifactCard title="质询树 / 盘问树">
          <div className="artifact-stack">
            {firstCrossTrees.map((tree) => (
              <div className="artifact-mini-row" key={tree.id}>
                <span>{tree.sideLabel}</span>
                <strong>{tree.target}</strong>
                <p>{tree.openingQuestion}</p>
                <em>{tree.closingLine}</em>
              </div>
            ))}
          </div>
        </ArtifactCard>

        <ArtifactCard title="自由辩战术卡">
          <div className="artifact-stack">
            {firstFreeDebateCards.map((card) => (
              <div className="artifact-mini-row" key={card.id}>
                <span>{card.sideLabel} · {card.trigger}</span>
                <strong>{card.oneLineResponse}</strong>
                <p>{card.followUpQuestions.join(' / ')}</p>
                <em>{card.returnMainline}</em>
              </div>
            ))}
          </div>
        </ArtifactCard>

        <ArtifactCard title="发言稿 / 发言结构包">
          <div className="artifact-stack">
            {artifacts.speechStructurePacks.flatMap((pack) =>
              pack.speeches.slice(0, 2).map((speech) => (
                <div className="artifact-mini-row" key={`${pack.side}-${speech.role}`}>
                  <span>{pack.sideLabel}</span>
                  <strong>{speech.role}</strong>
                  <p>{speech.structure.slice(0, 2).join('；')}</p>
                </div>
              )),
            )}
          </div>
        </ArtifactCard>

        <ArtifactCard title="结辩胜负点包">
          <div className="artifact-stack">
            {artifacts.closingVotingIssuePacks.map((pack) => (
              <div className="artifact-mini-row" key={pack.side}>
                <span>{pack.sideLabel}</span>
                <strong>{pack.votingIssues.join(' / ')}</strong>
                <p>{pack.advantageClosing}</p>
                <em>放弃：{pack.dropDisputes.slice(0, 2).join(' / ')}</em>
              </div>
            ))}
          </div>
        </ArtifactCard>

        <ArtifactCard title="证据缺口清单">
          <div className="artifact-stack">
            {firstEvidenceGaps.map((item) => (
              <div className="artifact-mini-row" key={item.id}>
                <span>{item.sideLabel} · {item.priority}</span>
                <strong>{item.mainline}</strong>
                <p>{item.currentGap}</p>
                <em>{item.caseDirection}</em>
              </div>
            ))}
          </div>
        </ArtifactCard>
      </div>

      <ArtifactCard title="训练与复盘清单">
        <div className="training-grid">
          <TrainingColumn title="模拟赛检查" lines={artifacts.trainingReviewChecklist.scrimmageChecks} />
          <TrainingColumn title="辩位训练" lines={artifacts.trainingReviewChecklist.roleTrainingFocus} />
          <TrainingColumn title="复盘问题" lines={artifacts.trainingReviewChecklist.postMatchReviewQuestions} />
        </div>
      </ArtifactCard>
    </section>
  )
}

function PackageStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ArtifactCard({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="artifact-card">
      <h3>{title}</h3>
      {children}
    </article>
  )
}

function ArtifactList({ items }: { items: string[] }) {
  return (
    <ul className="artifact-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  )
}

function TrainingColumn({ lines, title }: { lines: string[]; title: string }) {
  return (
    <div className="training-column">
      <strong>{title}</strong>
      <ArtifactList items={lines} />
    </div>
  )
}

function DebateMapPanel({ map }: { map: DebateMap }) {
  const argumentById = new Map(map.argumentNodes.map((node) => [node.id, node]))
  const attackById = new Map(map.attackNodes.map((node) => [node.id, node]))
  const gapById = new Map(map.evidenceGaps.map((gap) => [gap.id, gap]))
  const promptById = new Map(map.freeDebatePrompts.map((prompt) => [prompt.id, prompt]))

  return (
    <section className="stage-section visual-map-section">
      <SectionHeader eyebrow="Attack Defense Map" title="结构化攻防地图" />

      <div className="motion-node">
        <span>中心命题</span>
        <h3>{map.motion}</h3>
        <p>{map.centralConflict}</p>
      </div>

      <div className="visual-map-grid">
        {map.sideNodes.map((sideNode) => (
          <DebateMapSideColumn
            argumentById={argumentById}
            attackById={attackById}
            gapById={gapById}
            key={sideNode.side}
            map={map}
            promptById={promptById}
            sideNode={sideNode}
          />
        ))}
      </div>
    </section>
  )
}

function DebateMapSideColumn({
  argumentById,
  attackById,
  gapById,
  map,
  promptById,
  sideNode,
}: {
  argumentById: Map<string, DebateMapArgumentNode>
  attackById: Map<string, DebateMapAttackNode>
  gapById: Map<string, DebateMapEvidenceGap>
  map: DebateMap
  promptById: Map<string, DebateMap['freeDebatePrompts'][number]>
  sideNode: DebateMapSideNode
}) {
  const coreArguments = sideNode.coreArgumentIds.map((id) => argumentById.get(id)).filter(isDefined)
  const backupArguments = sideNode.backupArgumentIds.map((id) => argumentById.get(id)).filter(isDefined)
  const sideLinks = map.defenseLinks.filter((link) => link.side === sideNode.side)

  return (
    <article className={`map-side-column side-${sideNode.side}`}>
      <div className="side-node">
        <span className="role-badge">{sideNode.label}</span>
        <p>{sideNode.stance}</p>
      </div>

      <MapCluster count={coreArguments.length} label="Core line" title="主线">
        {coreArguments.map((argument) => (
          <VisualArgumentNode gap={argument.evidenceGapId ? gapById.get(argument.evidenceGapId) : undefined} key={argument.id} node={argument} />
        ))}
      </MapCluster>

      <MapCluster count={backupArguments.length} label="Backup" title="备用">
        {backupArguments.map((argument) => (
          <VisualArgumentNode gap={argument.evidenceGapId ? gapById.get(argument.evidenceGapId) : undefined} key={argument.id} node={argument} />
        ))}
      </MapCluster>

      <MapCluster count={sideLinks.length} label="Attack ⇄ Defense" title="攻防连线">
        {sideLinks.map((link) => (
          <VisualDefenseLink
            argument={argumentById.get(link.toArgumentId)}
            attack={attackById.get(link.fromAttackId)}
            key={link.id}
            link={link}
            prompt={promptById.get(link.freeDebatePromptId)}
          />
        ))}
      </MapCluster>
    </article>
  )
}

function MapCluster({
  children,
  count,
  label,
  title,
}: {
  children: ReactNode
  count: number
  label: string
  title: string
}) {
  return (
    <section className="map-cluster">
      <div className="cluster-heading">
        <span>{label}</span>
        <strong>{title}</strong>
        <b>{count}</b>
      </div>
      <div className="map-node-stack">{children}</div>
    </section>
  )
}

function VisualArgumentNode({
  gap,
  node,
}: {
  gap?: DebateMapEvidenceGap
  node: DebateMapArgumentNode
}) {
  return (
    <div className={`visual-argument-node is-${node.status}`}>
      <div className="map-node-topline">
        <span className="state-badge">{statusLabel[node.status]}</span>
        <span>强 {node.strengthScore} / 风险 {node.riskScore}</span>
      </div>
      <strong>{node.title}</strong>
      <p className="node-claim">{toLead(node.claim)}</p>
      {gap ? <EvidenceGapFlag gap={gap} /> : null}
    </div>
  )
}

function VisualDefenseLink({
  argument,
  attack,
  link,
  prompt,
}: {
  argument?: DebateMapArgumentNode
  attack?: DebateMapAttackNode
  link: DebateMapDefenseLink
  prompt?: DebateMap['freeDebatePrompts'][number]
}) {
  if (!attack || !argument) return null

  return (
    <div className="visual-defense-link">
      <div className="attack-node">
        <div className="map-node-topline">
          <span className="state-badge danger">{sideLabel[attack.side]}攻击</span>
          <span>{attack.likelyStage} · 威胁 {attack.threatScore}</span>
        </div>
        <strong>{attack.title}</strong>
        <p className="node-claim">{toLead(attack.claim)}</p>
      </div>
      <div className="defense-node">
        <span className="state-badge defense">防守 → {argument.title}</span>
        <p className="node-claim">{toLead(link.response)}</p>
        <div className="secondary-detail">
          <p>{link.backupResponse}</p>
          {prompt ? <a href={`#${prompt.id}`} id={prompt.id}>{prompt.prompt}</a> : null}
        </div>
      </div>
    </div>
  )
}

function EvidenceGapFlag({ gap }: { gap: DebateMapEvidenceGap }) {
  return (
    <div className={`evidence-gap-flag gap-${gap.severity}`}>
      <span>{formatEvidenceGapSeverity(gap.severity)}</span>
      <p>{gap.evidenceType}</p>
      <p className="gap-reason">{gap.reason}</p>
    </div>
  )
}

function DiscoveryPanel({
  session,
  onSetStatus,
}: {
  session: HumanPrepSession
  onSetStatus: (card: ArgumentCard, status: ArgumentStatus) => void
}) {
  return (
    <section className="stage-section">
      <SectionHeader eyebrow="Argument Discovery" title="论点发现" />
      <div className="card-grid">
        {session.discovery.candidateCards.map((card) => (
          <ArgumentCardView
            card={card}
            key={card.id}
            status={session.selection.statusById[card.id] ?? 'unassigned'}
            onSetStatus={onSetStatus}
          />
        ))}
      </div>

      <div className="opponent-panel">
        <h3>对方可能主打</h3>
        <div className="opponent-list">
          {session.discovery.opponentLikelyArguments.map((argument) => (
            <article className="opponent-row" key={argument.id}>
              <div>
                <span>{sideLabel[argument.side]} · {argument.likelyStage}</span>
                <GenerationBadge source={argument.generatedBy} />
                <strong>{argument.title}</strong>
              </div>
              <p>{argument.claim}</p>
              <b>{argument.threatScore}</b>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined
}

function ArgumentCardView({
  card,
  status,
  onSetStatus,
}: {
  card: ArgumentCard
  status: ArgumentStatus
  onSetStatus: (card: ArgumentCard, status: ArgumentStatus) => void
}) {
  return (
    <article className={`argument-card is-${status}`}>
      <div className="card-topline">
        <span>{sideLabel[card.side]}</span>
        <span>{statusLabel[status]}</span>
      </div>
      <GenerationBadge source={card.generatedBy} />
      <h3>{card.title}</h3>
      <p className="claim">{toLead(card.claim)}</p>

      <dl className="card-facts">
        <div>
          <dt>意义</dt>
          <dd>{card.whyItMatters}</dd>
        </div>
        <div>
          <dt>证据</dt>
          <dd>{card.evidenceType}</dd>
        </div>
        <div>
          <dt>最强攻击</dt>
          <dd>{card.strongestAttack}</dd>
        </div>
        <div>
          <dt>最佳防守</dt>
          <dd>{card.bestDefense}</dd>
        </div>
      </dl>

      <div className="score-row">
        <ScorePill label="强度" value={card.strengthScore} />
        <ScorePill label="风险" value={card.riskScore} />
        <span className="recommendation">{card.recommendedRole}</span>
      </div>

      <div className="card-actions" aria-label={`${card.title} 状态`}>
        <button
          className={status === 'primary' ? 'active' : ''}
          onClick={() => onSetStatus(card, 'primary')}
          type="button"
        >
          主线
        </button>
        <button
          className={status === 'backup' ? 'active' : ''}
          onClick={() => onSetStatus(card, 'backup')}
          type="button"
        >
          备用
        </button>
        <button
          className={status === 'dropped' ? 'active danger' : ''}
          onClick={() => onSetStatus(card, 'dropped')}
          type="button"
        >
          放弃
        </button>
      </div>
    </article>
  )
}

function SimulationPanel({
  iterations,
  format,
}: {
  iterations: SimulationIteration[]
  format: DebateFormatPreset
}) {
  return (
    <section className="stage-section">
      <SectionHeader eyebrow={format.shortName} title="策略模拟" />
      <div className="iteration-list">
        {iterations.map((iteration, index) => (
          <details className="iteration-card" key={iteration.id} open={index < 2}>
            <summary>
              <span>第{iteration.iteration}轮 · {sideLabel[iteration.side]}</span>
              <GenerationBadge source={iteration.generatedBy} />
              <b>{iteration.routeHealth}</b>
            </summary>
            <div className="iteration-body">
              <ResultBlock title="有效" lines={iteration.worked} />
              <ResultBlock title="受攻" lines={iteration.gotAttacked} />
              <ResultBlock title="调整" lines={iteration.replaced} />
              <p className="why-line">{iteration.why}</p>
              <div className="timeline">
                {iteration.timeline.map((stage) => (
                  <div className="timeline-row" key={stage.stageId}>
                    <div>
                      <strong>{stage.stageName}</strong>
                      <span>{stage.speaker} · {stage.duration}</span>
                    </div>
                    <p>{stage.move}</p>
                    <p>{stage.pressure}</p>
                  </div>
                ))}
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  )
}

function FinalRoutePanel({ routeMap }: { routeMap: FinalRouteMap }) {
  return (
    <section className="stage-section">
      <SectionHeader eyebrow="Final Route Map" title="最终路线图" />
      <GenerationBadge source={routeMap.generatedBy} />
      <div className="route-layout">
        {routeMap.routes.map((route) => (
          <article className="route-panel" key={route.side}>
            <h3>{sideLabel[route.side]}主线</h3>
            <ol className="core-list">
              {route.coreArguments.map((core) => (
                <li key={core.card.id}>
                  <span>{core.order}</span>
                  <div>
                    <strong>{core.card.title}</strong>
                    <p>{core.roleInOpening}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="opening-box">
              {route.openingStructure.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="map-grid">
        <MapBlock title="攻防地图">
          {routeMap.attackDefenseMap.map((pair) => (
            <div className="map-row" key={`${pair.side}-${pair.opponentAttack}`}>
              <strong>{sideLabel[pair.side]}</strong>
              <p>{pair.opponentAttack}</p>
              <p>{pair.response}</p>
              <p>{pair.backupResponse}</p>
            </div>
          ))}
        </MapBlock>

        <MapBlock title="备用路线库">
          {routeMap.abandonedPreparedRoutes.map((route) => (
            <div className="map-row" key={`${route.side}-${route.title}`}>
              <strong>{sideLabel[route.side]} · {route.title}</strong>
              <p>{route.trigger}</p>
              <p>{route.use}</p>
            </div>
          ))}
        </MapBlock>

        <MapBlock title="证据清单">
          {routeMap.evidenceChecklist.map((item) => (
            <div className="evidence-row" key={`${item.side}-${item.argumentTitle}`}>
              <span>{item.priority}</span>
              <strong>{sideLabel[item.side]} · {item.argumentTitle}</strong>
              <p>{item.evidenceType}</p>
              <p>{item.note}</p>
            </div>
          ))}
        </MapBlock>
      </div>
    </section>
  )
}

function ExportPanel({
  copyState,
  prepPack,
  onCopy,
}: {
  copyState: string
  prepPack: string
  onCopy: () => void
}) {
  return (
    <section className="stage-section export-section">
      <div className="export-header">
        <SectionHeader eyebrow="Prep Pack" title="导出赛前战术包" />
        <button className="primary-action" onClick={onCopy} type="button">
          {copyState}
        </button>
      </div>
      <pre className="prep-pack">{prepPack}</pre>
    </section>
  )
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  )
}

function toLead(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ')
  const match = normalized.match(/^(.+?[。！？!?])(?:\s|$)/)
  return match?.[1] ?? normalized
}

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="score-pill">
      {label}
      <b>{value}</b>
    </span>
  )
}

function GenerationBadge({ source }: { source?: GenerationSource }) {
  if (!source) return null

  const modeLabel = source.mode === 'provider' ? '已连接' : '本地 fallback'

  return (
    <span className={`generation-badge mode-${source.mode}`} title={source.reason ?? source.label}>
      {source.roleLabel} · {source.providerName} · {modeLabel}
    </span>
  )
}

function ResultBlock({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="result-block">
      <span>{title}</span>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  )
}

function MapBlock({ children, title }: { children: ReactNode; title: string }) {
  return (
    <article className="map-block">
      <h3>{title}</h3>
      {children}
    </article>
  )
}

function formatCheckedAt(isoDate: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(new Date(isoDate))
}

function formatEvidenceGapSeverity(severity: DebateMapEvidenceGap['severity']): string {
  if (severity === 'high') return '高优先证据缺口'
  if (severity === 'medium') return '中优先证据缺口'
  return '低优先证据缺口'
}

function formatRoleChoice(choice: ReturnType<typeof getRoleAssignmentChoices>[number]): string {
  if (choice.value === 'auto') return 'Auto'
  const status = choice.status === 'connected' ? '已连接' : '已配置'
  return `${choice.label}（${status}）`
}

function resetRolesUsingProvider(assignments: RoleAssignments, providerId: ProviderId): RoleAssignments {
  return debateAgentRoles.reduce((nextAssignments, role) => {
    nextAssignments[role.id] = assignments[role.id] === providerId ? 'auto' : assignments[role.id]
    return nextAssignments
  }, { ...assignments })
}

export default App
