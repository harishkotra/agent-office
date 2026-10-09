# Family Estate

The 3D grounds live in `packages/estate`. Presence (who is where) lives in `packages/estate-server`.

## Run locally

```bash
npm install
npm run estate
```

- Client: http://localhost:5174
- Presence: ws://127.0.0.1:8787
- Health: http://127.0.0.1:8787/health

Sign in with a family account. There is no guest entry.

## Controls

Walk with WASD or the arrow keys. The direction is relative to the camera. Shift runs. Space jumps, and jumping again just after you land chains a higher second jump and then a third. C or V dives. F enters a door or opens the family directory. Drag the mouse, or hold Q and E, to look. R returns you to the front gate. Esc opens settings. On a phone, use the on-screen stick.

## Who can walk in

The presence server accepts a join only with a live Supabase access token from the same project as [mccowanestate.com](https://mccowanestate.com). It then reads that user's own `profiles` row. The walker is that account. The name on the grounds is the profile name.

There is no guest entry, and the family tree is not used to decide who can walk. A session with no `profiles` row is refused. One account is one walker. Other people on the grounds are other signed-in accounts connected right now.

## Same-origin hop-in

Host the built page on the family site:

```bash
npm run build --workspace=@agent-office/estate
```

Copy `packages/estate/dist` to `estate/` on mccowanestate.com so the page is `https://mccowanestate.com/estate/`. Link it from the signed-in site. Do not iframe a different origin and do not post the access token across windows.

The estate client uses the same Supabase URL and anon key as the site, with the default auth storage key. On that origin, `getSession()` is the sign-in the member already completed.

Set `VITE_PRESENCE_URL` to a `wss://` presence socket on the same host as the page before the production build. The page ignores any `?ws=` override, so the access token cannot be pointed at another host. The server checks the token again before anyone is added to the roster.

Zones include the Great Hall, both wings, the porch, fountain court, pool, gazebo, chapel garden, pond, orchard, hedge garden, front gate, and the outer lawns.
