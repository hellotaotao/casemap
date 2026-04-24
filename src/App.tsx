import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import {
  autoSelectArguments,
  createHumanPrepSession,
  getDebateFormatPresets,
} from './domain/debate'
import type {
  ArgumentCard,
  ArgumentStatus,
  DebateFormatPreset,
  FinalRouteMap,
  HumanPrepConfig,
  HumanPrepSession,
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

function App() {
  const [config, setConfig] = useState<HumanPrepConfig>(defaultConfig)
  const [statusOverrides, setStatusOverrides] = useState<Record<string, ArgumentStatus>>({})
  const [copyState, setCopyState] = useState('复制备赛包')
  const presets = useMemo(() => getDebateFormatPresets(), [])
  const session = useMemo(() => createHumanPrepSession(config, statusOverrides), [config, statusOverrides])

  function updateConfig(next: HumanPrepConfig) {
    setConfig(next)
    setCopyState('复制备赛包')
  }

  function rerunPrep(event: FormEvent) {
    event.preventDefault()
    setStatusOverrides({})
    setCopyState('复制备赛包')
  }

  function applyAutoSelect() {
    const autoSelection = autoSelectArguments(session.discovery.candidateCards)
    setStatusOverrides(autoSelection.statusById)
    setConfig((current) => ({ ...current, strategyMode: 'ai-auto' }))
    setCopyState('复制备赛包')
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
    setCopyState('复制备赛包')
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
          <p className="eyebrow">AI Debate Lab</p>
          <h1>人类备赛工作台</h1>
        </div>
        <span className="future-pill">Model Arena · future</span>
      </header>

      <section className="workspace">
        <SetupPanel
          config={config}
          presets={presets}
          session={session}
          onAutoSelect={applyAutoSelect}
          onChange={updateConfig}
          onSubmit={rerunPrep}
        />

        <section className="flow">
          <DiscoveryPanel session={session} onSetStatus={updateCardStatus} />
          <SimulationPanel iterations={session.iterations} format={session.format} />
          <FinalRoutePanel routeMap={session.finalRouteMap} />
          <ExportPanel copyState={copyState} prepPack={session.prepPack} onCopy={copyPrepPack} />
        </section>
      </section>
    </main>
  )
}

function SetupPanel({
  config,
  presets,
  session,
  onAutoSelect,
  onChange,
  onSubmit,
}: {
  config: HumanPrepConfig
  presets: DebateFormatPreset[]
  session: HumanPrepSession
  onAutoSelect: () => void
  onChange: (config: HumanPrepConfig) => void
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
      <h3>{card.title}</h3>
      <p className="claim">{card.claim}</p>

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
        <SectionHeader eyebrow="Prep Pack" title="导出备赛包" />
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

function ScorePill({ label, value }: { label: string; value: number }) {
  return (
    <span className="score-pill">
      {label}
      <b>{value}</b>
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

export default App
