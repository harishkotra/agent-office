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

Walk with WASD or the arrow keys. The direction is relative to the camera. Shift runs. Space jumps, and jumping again just after you land chains a higher second jump and then a third. Ctrl or C dives. Drag the mouse, or hold Q and E, to look. R returns you to the front gate. Esc releases the mouse.

## Who can walk in

The presence server accepts a join only with a live Supabase access token from the same project as [mccowanestate.com](https://mccowanestate.com). It then reads `tree_people` with that token and admits the walker only when the account matches exactly one living person.

Living uses the same check as the family site directory: records `evelyn` and `vivian` are not living, and a role that says passed is not living. The rows themselves belong to Family Manager. This repo does not keep its own roster.

The account email must equal one `tree_people.email`. That is the link Family Manager sets. A matching name is not enough, so a new account cannot walk as someone else.

No email link, a memorial match, or more than one match is refused. The name on the grounds is the roster name. One living member is one walker.

Memorial records stay off the grounds: Evelyn Rosborough, Lee Rosborough, Vivian McCowan, Sammy McCowan III, and Jeremiah Devon McCowan, along with any roster row whose role says passed.

## Same-origin hop-in

Host the built page on the family site:

```bash
npm run build --workspace=@agent-office/estate
```

Copy `packages/estate/dist` to `estate/` on mccowanestate.com so the page is `https://mccowanestate.com/estate/`. Link it from the signed-in site. Do not iframe a different origin and do not post the access token across windows.

The estate client uses the same Supabase URL and anon key as the site, with the default auth storage key. On that origin, `getSession()` is the sign-in the member already completed.

Set `VITE_PRESENCE_URL` to a `wss://` presence socket on the same host as the page before the production build. The page ignores any `?ws=` override, so the access token cannot be pointed at another host. The server checks the token again before anyone is added to the roster.

Zones include the Great Hall, both wings, the porch, fountain court, pool, gazebo, chapel garden, pond, orchard, hedge garden, front gate, and the outer lawns.
