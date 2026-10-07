import { useState } from 'react'
import { signIn, FAMILY_ACCOUNT_URL, type Member } from '../auth'
import { cleanName, colorFor } from '../family'

export function Gate({ onEnter }: { onEnter: (member: Member) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">The McCowan Family Estate</p>
        <h1>Walk the grounds together</h1>
        <p className="lede">
          A shared 3D estate for the family. Move like a platform game, see who else is here, and use the same sign-in as the family site.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const display = cleanName(name)
            if (display === 'Guest' && !name.trim()) {
              setError('Add the name your family should see.')
              return
            }
            setError('')
            onEnter({ id: `local-${crypto.randomUUID()}`, name: display, guest: true, color: colorFor(display) })
          }}
        >
          <label>
            Your name
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} autoComplete="nickname" />
          </label>
          <button className="btn" type="submit">
            Enter as guest
          </button>
        </form>
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
            {busy ? 'Signing in…' : 'Sign in with your family account'}
          </button>
        </form>
        {error ? <p className="error">{error}</p> : null}
        <p className="fine">
          This is the same account as <a href={FAMILY_ACCOUNT_URL}>mccowanestate.com</a>. Once you are signed in there, the site can open these grounds and bring your session with it.
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
