import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { loadFamilyDirectory } from '../directory'
import { directoryCards, type DirectoryPerson } from '../directoryView'
import { TRAVEL, type TravelStop } from '../buildings'
import { play, publishPlay, requestTravel, subscribePlay } from '../play'
import { ACTION_LABELS, assignBinding, bindingLabel, listenFor, patchOptions, resetSettings, setPaused, settings, subscribeSettings } from '../settings'
import { touch } from '../touch'
import { announce } from '../cues'

function useRevision(subscribe: (listener: () => void) => () => void, read: () => number) {
  return useSyncExternalStore(subscribe, read, read)
}

export function PlayMenus() {
  useRevision(subscribePlay, () => play.revision)
  useRevision(subscribeSettings, () => settings.revision)
  const showFeedback = play.feedback && Date.now() < play.feedbackUntil
  return (
    <>
      <p className="cue" aria-live="polite">
        {play.cue}
      </p>
      {play.prompt && !settings.paused && !play.directory ? <p className="prompt">{play.prompt.text}</p> : null}
      {showFeedback ? <p className="feedback">{play.feedback}</p> : null}
      <div className="menu-launch">
        <button type="button" onClick={() => publishPlay({ travel: true })}>
          Travel to…
        </button>
        <button type="button" onClick={() => publishPlay({ directory: true })}>
          Family directory
        </button>
        <button type="button" onClick={() => setPaused(true)}>
          Settings
        </button>
      </div>
      {play.travel ? <TravelMenu /> : null}
      {settings.paused ? <PauseMenu /> : null}
      {play.directory ? <DirectoryPanel /> : null}
      <TouchControls />
    </>
  )
}

function useDialogFocus(close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const root = ref.current
    const controls = () => Array.from(root?.querySelectorAll<HTMLElement>('button, input, a[href], [tabindex]:not([tabindex="-1"])') ?? [])
    controls()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || ((event.key === 'b' || event.key === 'B') && !(event.target instanceof HTMLInputElement))) {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab') return
      const list = controls()
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [close])
  return ref
}

function TravelMenu() {
  const ref = useDialogFocus(() => publishPlay({ travel: false }))
  return (
    <div ref={ref} className="pause-back" role="dialog" aria-modal="true" aria-labelledby="travel-title">
      <section className="pause-card">
        <h2 id="travel-title">Travel to…</h2>
        <ul className="travel-list">
          {TRAVEL.map((stop) => (
            <li key={stop.id}>
              <button type="button" onClick={() => go(stop)}>
                {stop.label}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn" onClick={() => publishPlay({ travel: false })}>
          Close
        </button>
      </section>
    </div>
  )
}

function go(stop: TravelStop) {
  requestTravel(stop.x, stop.z, stop.zone, stop.yaw)
  publishPlay({ travel: false, feedback: `Traveling to ${stop.label}`, feedbackUntil: Date.now() + 1600 })
  announce(`Traveling to ${stop.label}.`)
}

function PauseMenu() {
  const ref = useDialogFocus(() => setPaused(false))
  useEffect(() => {
    if (!settings.listening) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (!settings.listening) return
      assignBinding(settings.listening, event.code)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [settings.listening, settings.revision])
  return (
    <div ref={ref} className="pause-back" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <section className="pause-card">
        <h2 id="pause-title">Settings</h2>
        <ul className="key-list">
          {ACTION_LABELS.map((action) => (
            <li key={action.id}>
              <span>{action.label}</span>
              <button type="button" onClick={() => listenFor(action.id)}>
                {settings.listening === action.id ? 'Press a key…' : bindingLabel(action.id)}
              </button>
            </li>
          ))}
        </ul>
        <fieldset>
          <legend>Font size</legend>
          {(['small', 'medium', 'large'] as const).map((size) => (
            <label key={size}>
              <input type="radio" name="font" checked={settings.font === size} onChange={() => patchOptions({ font: size })} /> {size}
            </label>
          ))}
        </fieldset>
        <label>
          <input type="checkbox" checked={settings.reducedMotion} onChange={(event) => patchOptions({ reducedMotion: event.target.checked })} /> Reduced motion
        </label>
        <label>
          <input type="checkbox" checked={settings.colorblind} onChange={(event) => patchOptions({ colorblind: event.target.checked })} /> Colorblind-safe markers
        </label>
        <label>
          <input type="checkbox" checked={settings.spoken} onChange={(event) => patchOptions({ spoken: event.target.checked })} /> Spoken cues
        </label>
        <p className="fine">Dive is {bindingLabel('dive')}. Ctrl is left free so it does not close the tab.</p>
        {settings.bindingWarning ? <p className="error">{settings.bindingWarning}</p> : null}
        <label>
          <input type="checkbox" checked={settings.sound} onChange={(event) => patchOptions({ sound: event.target.checked })} /> Sound
        </label>
        <label>
          Volume
          <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(event) => patchOptions({ volume: Number(event.target.value) })} />
        </label>
        <label>
          Look sensitivity
          <input type="range" min={0.2} max={3} step={0.1} value={settings.sensitivity} onChange={(event) => patchOptions({ sensitivity: Number(event.target.value) })} />
        </label>
        <label>
          <input type="checkbox" checked={settings.invertY} onChange={(event) => patchOptions({ invertY: event.target.checked })} /> Invert Y
        </label>
        <label>
          <input type="checkbox" checked={settings.runToggle} onChange={(event) => patchOptions({ runToggle: event.target.checked })} /> Run toggle
        </label>
        <button type="button" className="btn" onClick={() => resetSettings()}>
          Reset
        </button>
        <button type="button" className="btn btn-solid" onClick={() => setPaused(false)}>
          Resume
        </button>
      </section>
    </div>
  )
}

function DirectoryPanel() {
  const ref = useDialogFocus(() => publishPlay({ directory: false }))
  const [people, setPeople] = useState<DirectoryPerson[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let live = true
    loadFamilyDirectory()
      .then((rows) => {
        if (live) setPeople(rows)
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : 'The family directory could not be loaded right now.')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [])
  const cards = directoryCards(people, query)
  return (
    <div ref={ref} className="pause-back" role="dialog" aria-modal="true" aria-labelledby="directory-title">
      <section className="pause-card directory-card">
        <h2 id="directory-title">Family directory</h2>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" aria-label="Search by name" />
        {loading ? <p>Loading the directory…</p> : null}
        {error ? <p className="error">{error}</p> : null}
        <div className="directory-list">
          {cards.map((card) => (
              <article key={card.id} aria-label={card.spoken}>
                <h3>{card.name}</h3>
                {card.listed ? (
                  <>
                    {card.role ? <p>{card.role}</p> : null}
                    {card.bio ? <p>{card.bio}</p> : null}
                    {card.city ? <p>{card.city}</p> : null}
                  </>
                ) : (
                  <p>{card.initials}</p>
                )}
              </article>
            ))}
        </div>
        <button type="button" className="btn" onClick={() => publishPlay({ directory: false })}>
          Close
        </button>
      </section>
    </div>
  )
}

function releaseStick() {
  touch.x = 0
  touch.y = 0
}

function TouchControls() {
  return (
    <div className="touch">
      <div
        className="stick"
        onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
          const rect = event.currentTarget.getBoundingClientRect()
          touch.x = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1))
          touch.y = Math.max(-1, Math.min(1, 1 - ((event.clientY - rect.top) / rect.height) * 2))
        }}
        onPointerUp={releaseStick}
        onPointerCancel={releaseStick}
        onLostPointerCapture={releaseStick}
        aria-label="Move"
      />
      <button type="button" onPointerDown={() => (touch.jump = true)} onPointerUp={() => (touch.jump = false)} onPointerCancel={() => (touch.jump = false)} onLostPointerCapture={() => (touch.jump = false)}>
        Jump
      </button>
      <button type="button" onPointerDown={() => (touch.dive = true)} onPointerUp={() => (touch.dive = false)} onPointerCancel={() => (touch.dive = false)} onLostPointerCapture={() => (touch.dive = false)}>
        Dive
      </button>
      <button type="button" onPointerDown={() => (touch.interact = true)} onPointerUp={() => (touch.interact = false)} onPointerCancel={() => (touch.interact = false)} onLostPointerCapture={() => (touch.interact = false)}>
        Use
      </button>
    </div>
  )
}
