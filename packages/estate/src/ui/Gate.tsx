import { useState } from 'react'
import { signIn, FAMILY_ACCOUNT_URL, type Member } from '../auth'

export function Gate({ onEnter, notice }: { onEnter: (member: Member) => void; notice?: string }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(notice || '')
  const [busy, setBusy] = useState(false)

  return (
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">The McCowan Family Estate</p>
        <h1>Walk the grounds together</h1>
        <p className="lede">
          Sign in with your family account. On mccowanestate.com this page uses the sign-in you already have. Only a living family member on the roster can walk in, and you will see the other signed-in members who are here.
        </p>
        <form
          className="signin"
          onSubmit={async (event) => {
            event.preventDefault()
            setBusy(true)
            setError('')
            try {
              onEnter(await signIn(email, password))
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not sign in')
            } finally {
              setBusy(false)
            }
          }}
        >
          <label>
            Family email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="btn btn-solid" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in and enter'}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        <p className="fine">
          Same account as <a href={FAMILY_ACCOUNT_URL}>mccowanestate.com</a>. Family Manager keeps the living roster.
        </p>
        <ul className="controls">
          <li>WASD or arrows to walk</li>
          <li>Shift to run</li>
          <li>Space to jump, again as you land for a higher leap</li>
          <li>Ctrl or C to dive</li>
          <li>Drag the mouse, or Q and E, to look</li>
          <li>R to return to the gate</li>
        </ul>
      </section>
    </main>
  )
}
