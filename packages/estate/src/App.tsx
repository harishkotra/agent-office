import { useCallback, useEffect, useRef, useState } from 'react'
import { restoreSession, type Member } from './auth'
import { accountMessage } from './profileName'
import { EstateScene } from './game/EstateScene'
import { Gate } from './ui/Gate'
import { Hud } from './ui/Hud'
import { colorFor } from './family'
import { sim } from './sim'
import { ACCOUNT_NOT_READY_TEXT, PRESENCE_OFFLINE_TEXT, nextRetry, presenceRejection, PROFILE_MISMATCH_TEXT, retryButtonDisabled } from './wait'

function Waiting({ mode, busy, onRetry }: { mode: 'connecting' | 'offline' | 'profile' | 'phone'; busy: boolean; onRetry: () => void }) {
  const [left, setLeft] = useState(8)
  const busyRef = useRef(busy)
  busyRef.current = busy
  useEffect(() => {
    if (mode !== 'offline') return
    setLeft(8)
    const timer = window.setInterval(() => {
      setLeft((current) => {
        const next = nextRetry(current)
        if (next === 0 && !busyRef.current) onRetry()
        return next === 0 ? 8 : next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [mode, onRetry])
  const title = mode === 'offline' ? PRESENCE_OFFLINE_TEXT : mode === 'profile' ? PROFILE_MISMATCH_TEXT : mode === 'phone' ? ACCOUNT_NOT_READY_TEXT : 'Checking your account…'
  return (
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">The McCowan Family Estate</p>
        <h1>{title}</h1>
        {mode === 'offline' ? (
          <>
            <p className="lede" role="status">Trying again in {left}s. The grounds stay closed until family presence is back.</p>
            <button type="button" className="btn btn-solid" onClick={onRetry} disabled={retryButtonDisabled(busy)} aria-busy={busy}>
              Try now
            </button>
          </>
        ) : null}
      </section>
    </main>
  )
}

export function App() {
  const [member, setMember] = useState<Member | null>(null)
  const [admitted, setAdmitted] = useState(false)
  const [notice, setNotice] = useState('')
  const [booting, setBooting] = useState(true)
  const [wait, setWait] = useState<'connecting' | 'offline' | 'profile' | 'phone'>('connecting')
  const [retry, setRetry] = useState(0)
  const [trying, setTrying] = useState(false)
  const retryNow = useCallback(() => {
    setTrying(true)
    setRetry((current) => current + 1)
  }, [])

  useEffect(() => {
    restoreSession()
      .then((found) => {
        if (found) {
          sim.name = found.name
          sim.color = colorFor(found.id)
          sim.guest = false
          sim.id = ''
          setMember(found)
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : ''
        if (message === accountMessage('profile') || message === accountMessage('name')) {
          setNotice('')
          return
        }
        setNotice(message)
      })
      .finally(() => {
        setBooting(false)
      })
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
    sim.id = ''
    sim.roster = []
    setAdmitted(false)
    setTrying(false)
    const reason = presenceRejection(message)
    if (reason === 'profile' || reason === 'phone') {
      setWait(reason)
      return
    }
    setWait('connecting')
    setMember(null)
    setNotice('')
  }, [])

  const onStatus = useCallback((status: 'connecting' | 'offline') => {
    if (status === 'connecting') setTrying(true)
    if (status === 'offline') setTrying(false)
    setWait((current) => {
      if (current === 'profile' || current === 'phone') return current
      if (current === 'offline' && status === 'connecting') return 'offline'
      return status
    })
  }, [])

  if (booting && !member) {
    return (
      <main className="gate">
        <section className="gate-card">
          <p className="eyebrow">The McCowan Family Estate</p>
          <h1>Checking your account…</h1>
        </section>
      </main>
    )
  }

  if (!member) {
    return <Gate notice={notice} />
  }

  return (
    <div className={admitted ? 'game' : undefined}>
      <EstateScene member={member} admitted={admitted} onWelcome={onWelcome} onReject={onReject} onStatus={onStatus} retry={retry} />
      {admitted ? <Hud /> : <Waiting mode={wait} busy={trying} onRetry={retryNow} />}
    </div>
  )
}
