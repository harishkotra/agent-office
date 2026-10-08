import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PerfApp, startPhysics } from './scene'

function Boot() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    startPhysics(
      () => {
        if (live) setReady(true)
      },
      (message) => {
        if (!live) return
        setError(message)
        const node = document.getElementById('estate-perf-status')
        if (!node) return
        node.dataset.state = 'error'
        node.textContent = JSON.stringify({ error: 'Physics could not start' })
      },
    )
    return () => {
      live = false
    }
  }, [])

  if (error) return <p id="estate-perf-status" data-state="error">{JSON.stringify({ error: 'Physics could not start' })}</p>
  if (!ready) return <p id="estate-perf-status" data-state="loading">loading</p>
  return <PerfApp />
}

const root = document.getElementById('root')
if (!root) throw new Error('Missing root')
createRoot(root).render(<Boot />)
