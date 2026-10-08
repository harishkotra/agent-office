import { useEffect, useRef, useState } from 'react'
import { PlayMenus } from './PlayMenus'
import { markerColor, markerInk, initials } from '../markers'
import { controlLines, settings } from '../settings'
import { sim } from '../sim'

function cssColor(value: string) {
  return /^#[0-9a-f]{6}$/.test(value) ? value : markerColor(value || 'walker')
}
import { MARK, WORLD } from '../zones'

function dot(x: number, z: number, size: number) {
  return {
    x: ((x + WORLD.halfX) / (WORLD.halfX * 2)) * size,
    y: ((z + WORLD.halfZ) / (WORLD.halfZ * 2)) * size,
  }
}

export function Hud() {
  const [, setTick] = useState(0)
  const map = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setTick((value) => value + 1), 150)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let frame = 0
    const draw = () => {
      frame = window.requestAnimationFrame(draw)
      const canvas = map.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const size = canvas.width
      ctx.clearRect(0, 0, size, size)
      ctx.fillStyle = '#d7e7c9'
      ctx.fillRect(0, 0, size, size)
      ctx.strokeStyle = '#7d9a72'
      ctx.strokeRect(4, 4, size - 8, size - 8)
      const hall = MARK.manor
      const a = dot(hall.x0, hall.z0, size)
      const b = dot(hall.x1, hall.z1, size)
      ctx.fillStyle = '#efe4d2'
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)
      const fountain = dot(MARK.fountain.x, MARK.fountain.z, size)
      ctx.fillStyle = '#7eb8c4'
      ctx.beginPath()
      ctx.arc(fountain.x, fountain.y, 4, 0, Math.PI * 2)
      ctx.fill()
      const pool = dot(MARK.pool.x, MARK.pool.z, size)
      ctx.fillRect(pool.x - 6, pool.y - 4, 12, 8)
      for (const person of sim.roster) {
        const point = dot(person.x, person.z, size)
        ctx.fillStyle = settings.colorblind ? markerColor(person.name) : cssColor(person.color)
        ctx.beginPath()
        ctx.arc(point.x, point.y, person.self ? 4.5 : 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    frame = window.requestAnimationFrame(draw)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  const roster = sim.roster
  const status = sim.status

  return (
    <div className="hud">
      <aside className="panel roster">
        <p className="eyebrow">On the grounds</p>
        {roster.length === 0 ? <p>Just you, once you connect.</p> : null}
        <ul>
          {roster.map((person) => (
            <li key={person.id}>
              <span className="swatch" style={{ background: settings.colorblind ? markerColor(person.name) : cssColor(person.color), color: settings.colorblind ? markerInk(markerColor(person.name)) : undefined }}>
                {initials(person.name)}
              </span>
              <span>
                <strong>
                  {person.name}
                  {person.self ? ' (you)' : ''}
                </strong>
                <em>{person.zone}</em>
              </span>
            </li>
          ))}
        </ul>
        {status !== 'online' ? <p className="status" role="status">Reconnecting to the family grounds…</p> : null}
      </aside>
      <div className="zone" key={sim.zone}>
        {sim.zone}
      </div>
      <canvas ref={map} className="minimap" width={180} height={180} aria-label="Map of the estate" />
      <p className="hint">{controlLines().join(' · ')} · P settings</p>
      <PlayMenus />
    </div>
  )
}
