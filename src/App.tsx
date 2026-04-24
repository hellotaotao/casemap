import { FormEvent, useState } from 'react'
import './App.css'
import { createArenaResult, createDebateSession } from './domain/debate'
import type { ArenaConfig, ArenaResult, DebateConfig, DebateSession, JudgeStyle, RoadmapItem } from './domain/types'

const defaultDebateConfig: DebateConfig = {
  motion: 'AI debate tools should be used to prepare human debaters',
  proRole: 'Affirmative coach',
  conRole: 'Negative sparring partner',
  roundCount: 3,
  judgeStyle: 'policy',
}

const defaultArenaConfig: ArenaConfig = {
  motion: 'AI model debates are a useful reasoning benchmark',
  modelA: 'GPT-5.5',
  modelB: 'Claude Strategy',
  roundCount: 2,
  judgeStyle: 'executive',
}

const judgeStyles: Array<{ value: JudgeStyle; label: string }> = [
  { value: 'policy', label: 'Policy judge' },
  { value: 'parliamentary', label: 'Parliamentary judge' },
  { value: 'socratic', label: 'Socratic judge' },
  { value: 'executive', label: 'Executive judge' },
]

function App() {
  const [mode, setMode] = useState<'prep' | 'arena'>('prep')
  const [debateConfig, setDebateConfig] = useState<DebateConfig>(defaultDebateConfig)
  const [arenaConfig, setArenaConfig] = useState<ArenaConfig>(defaultArenaConfig)
  const [session, setSession] = useState<DebateSession>(() => createDebateSession(defaultDebateConfig))
  const [arena, setArena] = useState<ArenaResult>(() => createArenaResult(defaultArenaConfig))
  const [copyState, setCopyState] = useState('Copy report')

  function runDebate(event: FormEvent) {
    event.preventDefault()
    setSession(createDebateSession(debateConfig))
    setCopyState('Copy report')
  }

  function runArena(event: FormEvent) {
    event.preventDefault()
    setArena(createArenaResult(arenaConfig))
  }

  async function copyReport() {
    await navigator.clipboard.writeText(session.report)
    setCopyState('Copied')
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AI Debate Lab</p>
          <h1>Debate workbench</h1>
        </div>
        <nav className="mode-switch" aria-label="Mode switcher">
          <button className={mode === 'prep' ? 'active' : ''} onClick={() => setMode('prep')} type="button">
            Human prep
          </button>
          <button className={mode === 'arena' ? 'active' : ''} onClick={() => setMode('arena')} type="button">
            Model arena
          </button>
        </nav>
      </header>

      {mode === 'prep' ? (
        <section className="workspace">
          <form className="panel controls" onSubmit={runDebate}>
            <p className="eyebrow">Prepare a debate</p>
            <label>
              Motion
              <textarea
                value={debateConfig.motion}
                onChange={(event) => setDebateConfig({ ...debateConfig, motion: event.target.value })}
                rows={4}
              />
            </label>
            <div className="two-col">
              <label>
                Pro role
                <input
                  value={debateConfig.proRole}
                  onChange={(event) => setDebateConfig({ ...debateConfig, proRole: event.target.value })}
                />
              </label>
              <label>
                Con role
                <input
                  value={debateConfig.conRole}
                  onChange={(event) => setDebateConfig({ ...debateConfig, conRole: event.target.value })}
                />
              </label>
            </div>
            <div className="two-col">
              <label>
                Rounds
                <input
                  max={5}
                  min={1}
                  type="number"
                  value={debateConfig.roundCount}
                  onChange={(event) => setDebateConfig({ ...debateConfig, roundCount: Number(event.target.value) })}
                />
              </label>
              <label>
                Judge style
                <select
                  value={debateConfig.judgeStyle}
                  onChange={(event) => setDebateConfig({ ...debateConfig, judgeStyle: event.target.value as JudgeStyle })}
                >
                  {judgeStyles.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary" type="submit">Run debate</button>
          </form>

          <section className="results">
            <JudgePanel session={session} onCopy={copyReport} copyState={copyState} />
            <TurnSheet session={session} />
            <Roadmap title="Attack route" items={session.roadmap.attacks} />
            <Roadmap title="Defense route" items={session.roadmap.defenses} />
            <Roadmap title="Cross-exam questions" items={session.roadmap.crossExamination} />
            <Roadmap title="Prep priorities" items={session.roadmap.prepPriorities} />
          </section>
        </section>
      ) : (
        <section className="workspace">
          <form className="panel controls" onSubmit={runArena}>
            <p className="eyebrow">Benchmark models</p>
            <label>
              Benchmark motion
              <textarea
                value={arenaConfig.motion}
                onChange={(event) => setArenaConfig({ ...arenaConfig, motion: event.target.value })}
                rows={4}
              />
            </label>
            <div className="two-col">
              <label>
                Model A
                <input value={arenaConfig.modelA} onChange={(event) => setArenaConfig({ ...arenaConfig, modelA: event.target.value })} />
              </label>
              <label>
                Model B
                <input value={arenaConfig.modelB} onChange={(event) => setArenaConfig({ ...arenaConfig, modelB: event.target.value })} />
              </label>
            </div>
            <div className="two-col">
              <label>
                Rounds per side
                <input
                  max={5}
                  min={1}
                  type="number"
                  value={arenaConfig.roundCount}
                  onChange={(event) => setArenaConfig({ ...arenaConfig, roundCount: Number(event.target.value) })}
                />
              </label>
              <label>
                Judge style
                <select
                  value={arenaConfig.judgeStyle}
                  onChange={(event) => setArenaConfig({ ...arenaConfig, judgeStyle: event.target.value as JudgeStyle })}
                >
                  {judgeStyles.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button className="primary" type="submit">Run side-swap arena</button>
          </form>

          <section className="results">
            <article className="panel">
              <p className="eyebrow">Leaderboard</p>
              <h2>Side-adjusted result</h2>
              <div className="leaderboard">
                {arena.leaderboard.map((entry, index) => (
                  <div className="leader-row" key={entry.model}>
                    <b>#{index + 1}</b>
                    <strong>{entry.model}</strong>
                    <span>{entry.score} pts</span>
                    <small>{entry.wins}W {entry.losses}L {entry.ties}T · margin {entry.avgMargin}</small>
                  </div>
                ))}
              </div>
            </article>
            {arena.matches.map((match) => (
              <article className="panel match" key={match.id}>
                <p className="eyebrow">Side-swap match</p>
                <h2>{match.proModel} vs {match.conModel}</h2>
                <div className="score-grid">
                  <div><span>Pro</span><strong>{match.proModel}</strong><b>{match.proScore}</b></div>
                  <div><span>Con</span><strong>{match.conModel}</strong><b>{match.conScore}</b></div>
                </div>
                <p className="ballot-line">Winner: {match.winner}</p>
                {match.judge.ballot.map((line) => <p className="ballot-line" key={line}>{line}</p>)}
              </article>
            ))}
          </section>
        </section>
      )}
    </main>
  )
}

function JudgePanel({ session, onCopy, copyState }: { session: DebateSession; onCopy: () => void; copyState: string }) {
  const winner = session.judge.winner === 'tie' ? 'Tie' : session.judge.winner === 'pro' ? session.config.proRole : session.config.conRole

  return (
    <article className="panel judge-card">
      <div>
        <p className="eyebrow">Judge ballot</p>
        <h2>{winner}</h2>
        <p>{session.config.motion}</p>
      </div>
      <div className="score-grid">
        <div><span>Pro</span><strong>{session.config.proRole}</strong><b>{session.judge.pro.total}</b></div>
        <div><span>Con</span><strong>{session.config.conRole}</strong><b>{session.judge.con.total}</b></div>
      </div>
      {session.judge.ballot.map((line) => <p className="ballot-line" key={line}>{line}</p>)}
      <button className="secondary" onClick={onCopy} type="button">{copyState}</button>
    </article>
  )
}

function TurnSheet({ session }: { session: DebateSession }) {
  return (
    <article className="panel turn-sheet">
      <p className="eyebrow">Turn sheet</p>
      <h2>Generated rounds</h2>
      {session.turns.map((turn) => (
        <details key={turn.id} open={turn.round === 1}>
          <summary>Round {turn.round} · {turn.side.toUpperCase()} · {turn.role}</summary>
          <p><strong>Claim:</strong> {turn.claim}</p>
          <p><strong>Warrant:</strong> {turn.warrant}</p>
          <p><strong>Evidence:</strong> {turn.evidence}</p>
          <p><strong>Impact:</strong> {turn.impact}</p>
          <p><strong>Attack:</strong> {turn.attacks.join('; ')}</p>
          <p><strong>Defense:</strong> {turn.defenses.join('; ')}</p>
        </details>
      ))}
    </article>
  )
}

function Roadmap({ title, items }: { title: string; items: RoadmapItem[] }) {
  return (
    <article className="panel roadmap">
      <p className="eyebrow">Roadmap</p>
      <h2>{title}</h2>
      {items.map((item) => (
        <div className="roadmap-item" key={item.label}>
          <span>{item.priority}</span>
          <strong>{item.label}</strong>
          <p>{item.detail}</p>
        </div>
      ))}
    </article>
  )
}

export default App
