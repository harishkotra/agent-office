import { useCallback, useEffect, useState } from 'react'
import { restoreSession, type Member } from './auth'
import { EstateScene } from './game/EstateScene'
import { Gate } from './ui/Gate'
import { Hud } from './ui/Hud'
import { colorFor } from './family'
import { sim } from './sim'

function Checking() {
  return (
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">The McCowan Family Estate</p>
        <h1>Checking your account…</h1>
        <p className="lede">Your family sign-in has to match a site profile before you step onto the grounds.</p>
      </section>
    </main>
  )
}

export function App() {
  const [member, setMember] = useState<Member | null>(null)
  const [admitted, setAdmitted] = useState(false)
  const [notice, setNotice] = useState('')
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 3500)
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
        setNotice(error instanceof Error ? error.message : 'Sign in on the family site to walk the grounds.')
      })
      .finally(() => {
        window.clearTimeout(timer)
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
  }, [])

  const onReject = useCallback((message: string) => {
    sim.id = ''
    sim.roster = []
    setAdmitted(false)
    setMember(null)
    setNotice(message)
  }, [])

  if (booting && !member) {
    return (
      <main className="gate">
        <section className="gate-card">
          <p className="eyebrow">The McCowan Family Estate</p>
          <h1>Opening the gate…</h1>
        </section>
      </main>
    )
  }

  if (!member) {
    return (
      <Gate
        notice={notice}
        onEnter={(next) => {
          setNotice('')
          setAdmitted(false)
          sim.name = next.name
          sim.color = colorFor(next.id)
          sim.guest = false
          sim.id = ''
          setMember(next)
        }}
      />
    )
  }

  return (
    <div className={admitted ? 'game' : undefined}>
      <EstateScene member={member} admitted={admitted} onWelcome={onWelcome} onReject={onReject} />
      {admitted ? <Hud /> : <Checking />}
    </div>
  )
}
