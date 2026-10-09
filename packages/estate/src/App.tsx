import { useCallback, useEffect, useRef, useState } from 'react'
import { FAMILY_ACCOUNT_URL, restoreSession, type Member } from './auth'
import { colorFor } from './family'
import { EstateScene } from './game/EstateScene'
import { sim } from './sim'
import { Gate } from './ui/Gate'
import { Hud } from './ui/Hud'
import {
  CHECKING_LIMIT_MS,
  FAMILY_SITE_BUTTON,
  GROUNDS_CLOSED_TEXT,
  TRY_NOW_LABEL,
  bootBlock,
  presenceRejection,
  releasedVisit,
  retryButtonDisabled,
  retryDelay,
  retryLine,
  waitingAction,
  waitingCopy,
  type WaitingMode,
} from './wait'

const RETURN_KEY = 'estate-return'

function rememberReturn() {
  try {
    sessionStorage.setItem(RETURN_KEY, '1')
  } catch {
    // The family site also notices a same-origin arrival from /estate/.
  }
}

function AccessCard({ mode, busy, onRetry }: { mode: WaitingMode; busy: boolean; onRetry: () => void }) {
  const [left, setLeft] = useState(() => retryDelay(0))
  const busyRef = useRef(busy)
  busyRef.current = busy
  const attemptRef = useRef(0)
  const fired = useRef(false)
  useEffect(() => {
    if (mode !== 'offline') return
    attemptRef.current = 0
    setLeft(retryDelay(0))
    const timer = window.setInterval(() => {
      setLeft((current) => (current > 1 ? current - 1 : 0))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [mode])
  useEffect(() => {
    if (mode !== 'offline' || left !== 0) {
      fired.current = false
      return
    }
    if (fired.current) return
    fired.current = true
    if (!busyRef.current) onRetry()
    attemptRef.current += 1
    setLeft(retryDelay(attemptRef.current))
  }, [left, mode, onRetry])
  const copy = waitingCopy(mode)
  const action = waitingAction(mode)
  return (
    <main className="gate">
      <section className="gate-card" role={copy.role ?? undefined}>
        <p className="eyebrow">The McCowan Family Estate</p>
        <h1>{copy.heading}</h1>
        {mode === 'offline' ? (
          <>
            <p className="lede">{GROUNDS_CLOSED_TEXT}</p>
            <p className="lede">{retryLine(left)}</p>
            <button type="button" className="btn btn-solid" onClick={onRetry} disabled={retryButtonDisabled(busy)} aria-busy={busy}>
              {TRY_NOW_LABEL}
            </button>
          </>
        ) : null}
        {action === 'family-site' ? (
          <p>
            <a className="btn btn-solid" href={FAMILY_ACCOUNT_URL} onClick={rememberReturn}>
              {FAMILY_SITE_BUTTON}
            </a>
          </p>
        ) : null}
      </section>
    </main>
  )
}

function releaseVisit() {
  const released = releasedVisit()
  sim.name = released.name
  sim.id = released.id
  sim.color = released.color
  sim.guest = released.guest
  sim.status = released.status
  sim.roster = released.roster
}

export function App() {
  const [member, setMember] = useState<Member | null>(null)
  const [admitted, setAdmitted] = useState(false)
  const [notice, setNotice] = useState('')
  const [booting, setBooting] = useState(true)
  const [block, setBlock] = useState<'phone' | 'profile' | 'name' | null>(null)
  const [wait, setWait] = useState<WaitingMode>('connecting')
  const [retry, setRetry] = useState(0)
  const [trying, setTrying] = useState(false)
  const retryNow = useCallback(() => {
    setTrying(true)
    setRetry((current) => current + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      if (!cancelled) setBooting(false)
    }, CHECKING_LIMIT_MS)
    restoreSession()
      .then((found) => {
        if (cancelled) return
        if (found) {
          sim.name = found.name
          sim.color = colorFor(found.id)
          sim.guest = false
          sim.id = ''
          setMember(found)
          setBlock(null)
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : ''
        const next = bootBlock(message)
        if (next) {
          setBlock(next)
          setNotice('')
          return
        }
        setNotice(message)
      })
      .finally(() => {
        if (cancelled) return
        window.clearTimeout(timer)
        setBooting(false)
      })
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  const onWelcome = useCallback((next: Member) => {
    sim.name = next.name
    sim.color = next.color || colorFor(next.id)
    sim.guest = false
    sim.id = next.id
    setMember((prev) => (prev ? { ...prev, ...next, token: prev.token } : next))
    setAdmitted(true)
    setTrying(false)
    setWait('connecting')
  }, [])

  const onReject = useCallback((message: string) => {
    setAdmitted(false)
    setTrying(false)
    const reason = presenceRejection(message)
    if (reason === 'profile' || reason === 'phone' || reason === 'name') {
      setWait(reason)
      return
    }
    releaseVisit()
    setWait('connecting')
    setMember(null)
    setNotice('')
  }, [])

  const onStatus = useCallback((status: 'connecting' | 'offline') => {
    if (status === 'connecting') setTrying(true)
    if (status === 'offline') setTrying(false)
    setWait((current) => {
      if (current === 'profile' || current === 'phone' || current === 'name') return current
      if (current === 'offline' && status === 'connecting') return 'offline'
      return status
    })
  }, [])

  if (booting && !member && !block) {
    return <AccessCard mode="checking" busy={false} onRetry={retryNow} />
  }

  if (!member && block) {
    return <AccessCard mode={block} busy={false} onRetry={retryNow} />
  }

  if (!member) {
    return <Gate notice={notice} />
  }

  const waitingMode: WaitingMode = wait === 'signed-out' || wait === 'checking' ? 'connecting' : wait

  return (
    <div className={admitted ? 'game' : undefined}>
      <EstateScene member={member} admitted={admitted} onWelcome={onWelcome} onReject={onReject} onStatus={onStatus} retry={retry} />
      {admitted ? <Hud /> : <AccessCard mode={waitingMode} busy={trying} onRetry={retryNow} />}
    </div>
  )
}
