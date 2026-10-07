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

## Controls

Walk with WASD or the arrow keys. The direction is relative to the camera, the way a 3D platform game works. Shift runs. Space jumps, and jumping again just after you land chains a higher second jump and then a third. Ctrl or C dives. Drag the mouse, or hold Q and E, to look. R returns you to the front gate. Esc releases the mouse.

## Accounts

Sign-in uses the same Supabase project as [mccowanestate.com](https://mccowanestate.com). A signed-in member is shown by their profile name. Guests pick a display name and are marked guest on the roster.

The presence server checks an access token with Supabase before it trusts a name. A rejected token does not enter as that member.

## Embedding on the family site

Host the built client (`npm run build --workspace=@agent-office/estate`) and the presence server together, or set `VITE_PRESENCE_URL` at build time.

From a signed-in page on an allowed origin, send the session into the frame:

```js
frame.contentWindow.postMessage({
  type: 'mccowan-estate:session',
  accessToken: session.access_token,
  refreshToken: session.refresh_token
}, estateOrigin)
```

Listen for:

- `mccowan-estate:ready` when the grounds can take a session
- `mccowan-estate:presence` with `players`: `id`, `name`, `zone`, `x`, `y`, `z`, `guest`

Allowed parent origins: `https://mccowanestate.com`, `https://www.mccowanestate.com`, `https://jerichothewall.github.io`, and localhost.

Zones include the Great Hall, both wings, the porch, fountain court, pool, gazebo, chapel garden, pond, orchard, hedge garden, front gate, and the outer lawns.
