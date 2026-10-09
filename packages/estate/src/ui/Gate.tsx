import { useEffect, useRef } from 'react'
import { FAMILY_ACCOUNT_URL, FAMILY_ESTATE_PATH } from '../auth'
import { FAMILY_SITE } from '../family'
import { controlLines } from '../settings'
import { SIGN_IN_BUTTON, SIGN_IN_TEXT } from '../wait'

const RETURN_KEY = 'estate-return'

export function Gate({ notice }: { notice?: string }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [])
  return (
    <main className="gate">
      <section className="gate-card">
        <p className="eyebrow">The McCowan Family Estate</p>
        <h1 ref={heading} tabIndex={-1}>
          {SIGN_IN_TEXT}
        </h1>
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
            {SIGN_IN_BUTTON}
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
