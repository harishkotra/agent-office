# McCowan Family Estate

A huge walkable 3D estate for the McCowan family. Family members use the same sign-in as [mccowanestate.com](https://mccowanestate.com), walk the grounds with a keyboard, and see who else is here and which part of the estate they are standing in.

The grounds are a page on the family site, at `/estate/` on the same origin as [mccowanestate.com](https://mccowanestate.com). Sign in on the site, open the estate, and walk. The page reads that same sign-in. Guests are not admitted.

## Play

```bash
npm install
npm run estate
```

Open **http://localhost:5174** and sign in with your family account. A second signed-in window shows up as another living member. There is no guest entry.

| Key | Action |
| --- | --- |
| WASD or arrows | Walk, relative to the camera |
| Shift | Run |
| Space | Jump. Jump again as you land for a higher second and third leap |
| C or V | Dive |
| F | Enter a door, or open the family directory |
| Mouse drag, or Q / E | Look around |
| R | Return to the front gate |
| Esc | Settings |

Movement is a blend of Super Mario 64 (acceleration, jump chains, camera-relative steering), Fall Guys (bean body, dive), and Gang Beasts (loose, wobbly stride).

## Family site

Hop-in is a normal page on the family site, not a frame on another origin. Same origin keeps the Supabase session in the browser, so the estate does not take a token through `postMessage`.

Family Manager hosts the built client at `https://mccowanestate.com/estate/` and links it for signed-in members. The build uses relative asset paths (`base: './'`). Set `VITE_PRESENCE_URL` to a websocket on that same host before building. A `?ws=` query cannot retarget it. See [docs/docs/family-estate.md](docs/docs/family-estate.md).

A walker is created only after the presence server checks the live session and finds that account's `profiles` row. The name on the grounds is the profile name. Guests and anonymous sockets never appear. The family tree is not used for admission.

`npm run estate` starts the presence server on port **8787** and the 3D client on port **5174**. Build the client with `npm run build --workspace=@agent-office/estate`.

## Checks

```bash
npm run lint
npx tsc --noEmit -p packages/estate
npm test --workspace=@agent-office/estate
npm test --workspace=@agent-office/estate-server
npm run build --workspace=@agent-office/estate
```

## Docs

- [Run and host the grounds](docs/docs/family-estate.md)
- [Roadmap](docs/estate-roadmap.md)
- [Gameplay spec](docs/gameplay-spec.md)
- [Changelog](CHANGELOG.md)

The original pixel-office packages and the vendored pixel-agents snapshot have been removed. They were not used by the estate client. The Pixel Agents MIT license remains in `pixel-agents-repo/LICENSE`.
