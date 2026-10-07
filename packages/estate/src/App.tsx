import { useCallback, useEffect, useState } from 'react'
import { announceReady, listenForSiteSession, restoreSession, type Member } from './auth'
import { EstateScene } from './game/EstateScene'
import { Gate } from './ui/Gate'
import { Hud } from './ui/Hud'
import { colorFor } from './family'
import { sim } from './sim'

export function App() {
  const [member, setMember] = useState<Member | null>(null)
  const [booting, setBooting] = useState(true)

  useEffect(() => {
    announceReady()
    const stop = listenForSiteSession((next) => {
      sim.name = next.name
      sim.color = next.color || colorFor(next.id)
      sim.guest = false
      sim.id = next.id
      setMember(next)
    })
    const timer = window.setTimeout(() => setBooting(false), 3500)
    restoreSession()
      .then((found) => {
        if (found) {
          sim.name = found.name
          sim.color = colorFor(found.id)
          sim.guest = false
          sim.id = found.id
          setMember(found)
        }
      })
      .catch(() => {
        // The gate still works if the family account service is unreachable.
      })
      .finally(() => {
        window.clearTimeout(timer)
        setBooting(false)
      })
    return stop
  }, [])

  const onWelcome = useCallback((next: Member) => {
    sim.name = next.name
    sim.color = next.color || sim.color
    sim.guest = next.guest
    sim.id = next.id
    setMember((prev) => (prev ? { ...prev, ...next, token: next.token || prev.token } : next))
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

  if (!member) return <Gate onEnter={(next) => setMember(next)} />

  return (
    <div className="game">
      <EstateScene member={member} onWelcome={onWelcome} />
      <Hud />
    </div>
  )
}
