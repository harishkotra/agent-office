import { useState } from 'react'
import { signIn, FAMILY_ACCOUNT_URL, type Member } from '../auth'
import { controlLines } from '../settings'

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
        <p className="lede">Sign in on the family site to visit the estate.</p>
        <p>
          <a className="btn btn-solid" href={FAMILY_ACCOUNT_URL}>
            Sign in on the family site
          </a>
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
          Same account as <a href={FAMILY_ACCOUNT_URL}>mccowanestate.com</a>. You need a site profile to walk in.
        </p>
        <ul className="controls">
          {controlLines().map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  )
}
