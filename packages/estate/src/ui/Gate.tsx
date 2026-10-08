import { FAMILY_ACCOUNT_URL, FAMILY_ESTATE_PATH } from '../auth'
import { FAMILY_SITE } from '../family'
import { controlLines } from '../settings'

const RETURN_KEY = 'estate-return'

export function Gate({ notice }: { notice?: string }) {
  return (
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">The McCowan Family Estate</p>
        <h1>Walk the grounds together</h1>
        <p className="lede">Sign in on the family site to visit the estate.</p>
        {notice ? <p className="error">{notice}</p> : null}
        <p>
          <a
            className="btn btn-solid"
            href={FAMILY_ACCOUNT_URL}
            onClick={() => {
              try {
                sessionStorage.setItem(RETURN_KEY, '1')
              } catch {
                // The family site also notices a same-origin arrival from /estate/.
              }
            }}
          >
            Sign in on the family site
          </a>
        </p>
        <p className="fine">
          After you sign in, the family site brings you back to <a href={`${FAMILY_SITE}${FAMILY_ESTATE_PATH}`}>/estate/</a>. You need a site profile to walk in.
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
