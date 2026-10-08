# Virtual Estate: Gameplay Design Spec

**Owner:** Game Designer Bot (design lead). **Builder:** Cursor. **Status:** Draft v1, 2026-10-07. Public copy for this repo.

> This is the public copy of the gameplay spec. Owner questions and database requests are tracked privately and are not part of this file, so there is no section 8 or 9. Where this copy and the roadmap (`docs/estate-roadmap.md`) disagree on process, the roadmap wins.

**Baseline read:** `JerichoTheWall/agent-office-walkaround` `main` at `09ca8a5` (merge of PR #4, "Play-feel pass", merged 2026-10-07 1:16 PM PT), package `packages/estate`. Open PRs #2 and #3 were also read.
**Companion docs (these win where they overlap):**
- `engineering/estate-code-standards.md` (Programmer Master Bot): fixed step, draw-call and bundle budgets, accessibility settings, review checklist. This spec links to it and does not repeat its numbers.
- Art direction doc (Background Bot): looks, palette, accents and glyphs, signage, budgets per area.
- `engineering/estate-backlog.md`: task order and leak checks.

**Scope:** gameplay feel, controls, doors and floors, layout, menus, access screens, the bookshelf flow, the account office desk and mini-game play design. Not in scope: architecture, sync fields, security rules (owned by PMB, Security Guard and Security Bot).

**Data rules this spec follows (locked):**
- Only signed-in, phone-verified family members walk. There are no guests and no NPC family members.
- The bookshelf reads only the protected signed-in view `signed_in_directory`. It selects only `id`, `name`, `role`, `parent_id`, `bio`, `sort_order`, `contact_listed`, and `city` if wanted. It never selects `phone`, `email` or `notes`, never uses `select *`, and it has no other list or lookup.
- Sign-up phone numbers never appear in the bookshelf, presence, HUD, spoken cues or logs. The bookshelf shows no phone numbers and no email addresses for anyone.
- When `contact_listed` is false, the bookshelf shows only the plain name and initials. It never labels anyone a teen, minor or any age, and never infers or displays age. False can also mean an adult who chose not to list contacts. The server decides what is blank; the client just renders what comes back, and an empty field shows nothing.
- No family names, people or contact data appear in game files or in this spec. Placeholders: "Home 1"–"Home 5", "Mansion", "Member A".
- Family facts (who lives in which home, real names) are never recorded in this repo. Homes stay "Home 1"–"Home 5" and "Mansion".

---

## 1. Current state (main at `09ca8a5`, including PR #4)

**Layout** (`src/buildings.ts`, `src/zones.ts`, `src/game/world.tsx`, `src/game/Homes.tsx`)
- The world is 280 × 240 m (`WORLD.halfX` 140, `halfZ` 120). Spawn and Front Gate are at (0, 82). +z is south (the gate) and −z is north (the mansion).
- `HOMES` holds 5 homes built by `home(id, label, cx, cz, facing)`. Each is 10 × 8 m with 3.4 m walls, one 1.6 × 2.4 m door gap facing the drive, and a roof slab that is also a collider. Centres: (−108, 78) E-facing, (108, 78) W, (108, 48) W, (108, −72) W, (−108, 36) E. Their current labels are five themed names that are not repeated here; they are replaced by "Home 1"–"Home 5" (see 5.1).
- `MANSION` spans x −30…30, z −40…−16. It has 3 doors (`mansion-main` at (0, −16), `mansion-west` at (−22.4, −20), `mansion-east` at (22.4, −20)) and a bookshelf at `shelf` (−2.2, −36.2). `Manor()` in `world.tsx` builds 6.8 m main walls, 5.2 m wings, and a 12-step stair at x 8.1 (0.28 m rise, 0.48 m run) up to a 3.36 m landing. The main block has an upper row of windows, but there is no upper floor to walk on.
- `ZONES` names 16 areas: Great Hall, wings, porch, terrace, Fountain Court, Front Gate, Pool Terrace, Gazebo Lawn, Chapel Garden, Pond Bridge, Orchard, Hedge Garden, West Woods, North Pasture and South Meadow. `zoneAt()` checks `homeZone()` first. Only the central drive has gravel (8.2 × 108 m at x 0). **No path leads to any home.**
- Interiors load near a building and unload away from it (`shouldLoadInterior`: 14 m to load, 24 m to unload). Home interiors are a floor box and a table. `MansionInterior` is a rug, a table and the bookshelf block.
- `EstateWorld` wraps everything, `<Homes/>` included, in one `BatchGroup` (`primitives.tsx`), which merges boxes into one mesh per colour. There is one always-on manor `pointLight` (`world.tsx:188`).

**Movement** (`src/movement.ts`, `src/game/Player.tsx`)
- A Rapier kinematic character controller (offset 0.03, autostep 0.45 m, snap 0.22 m, climb 52°, slide 58°) runs inside `useBeforePhysicsStep`. The step is fixed at `PHYSICS_DT = 1/60`, and `EstateScene` sets `<Physics timeStep={1/60}>`. Jump and dive presses are latched (`notePress`/`takePresses`), and a test checks distance at 60/120/144 Hz (`movement.test.ts`, 0.05 m tolerance).
- Constants: walk 3.45 m/s, run 7.85, ground accel 50 m/s², stop 72, air 14, gravity 26 rising and 38 falling, terminal −30. A triple-jump chain uses `JUMP_V` 8.6/10.4/12.6 with `CHAIN_WINDOW` 0.32 s. `COYOTE` and `JUMP_BUFFER` are 0.12 s. Releasing jump halves upward speed. Dive is 12.2 m/s for 0.48 s. Facing eases with `smoothYaw` (k = 10/s). `clipVelocity` kills speed into walls and ceilings.
- R returns you to the gate immediately. Falling below y −2 also resets.

**Camera** (`src/game/CameraRig.tsx`)
- Fixed 6.5 m distance. Pitch is 0.18–1.15 rad (default 0.46). The follow point eases with `1 − 0.0008^dt` (about k = 7.1/s), so the camera trails about 1.1 m at full run. A 0.32 m sphere cast pulls the camera in to `toi − 0.15` (minimum 0.7 m), and that pull is instant both ways. Mouse look is 0.0022 rad/px; Q/E turn at 1.8 rad/s. Reduced motion removes the lag.

**Controls and settings** (`src/settings.ts`, `src/touch.ts`, `EstateScene.tsx`)
- 11 remappable actions (`ACTION_LABELS`), stored in localStorage (the existing settings key). Dive is on C/V, and Ctrl is stripped. Esc toggles Settings. Settings has font size, reduced motion, colourblind markers and spoken cues. Touch has a fixed 120 px stick plus Jump/Dive/Use buttons, shown on `(pointer: coarse)` devices. There is no gamepad support.

**Doors, prompts and cues** (`buildings.ts`, `Player.tsx`, `src/cues.ts`, `src/play.ts`)
- `nearbyTarget()` returns a door within 2.6 m, a "floor" (really the doormat) within 1.35 m, or the bookshelf within 2.2 m. Pressing interact on a door **teleports you 1.7 m through the gap** (`stepThrough`). Doors have no leaf and no state, and you can also simply walk through the open gap.
- Prompt: `promptText()` ("Press F to enter" / "Press F to step outside"). Cues: `placeCue()` goes to an `aria-live="polite"` line (`PlayMenus.tsx`), plus a 660 Hz panned `blip()` and `speechSynthesis` (on by default). Zone changes and nearby walkers are also announced.

**Menus and HUD** (`src/ui/PlayMenus.tsx`, `src/ui/Hud.tsx`)
- Buttons for "Travel to…" and "Settings". `TRAVEL` lists Front gate, Mansion door and the 5 homes, with no wing doors and no floors. Travel teleports you and keeps your current height. The HUD has a roster (initials swatch, name, zone), a zone banner, a minimap (manor, fountain, pool and walker dots, but no homes) and a hard-coded hint line.

**Bookshelf** (`src/directory.ts`, `src/directoryView.ts`)
- `DirectoryPanel` has a name filter and cards.
- The bookshelf must read only `signed_in_directory` (see 6B).

**Access screens** (`src/App.tsx`, `src/ui/Gate.tsx`, `src/wait.ts`)
- `Waiting` shows "Checking your account…", `PRESENCE_OFFLINE_TEXT` or `PROFILE_MISMATCH_TEXT`. On main, `Gate` still has an email/password form (`signIn` → `signInWithPassword`), which PR #3 removes. A 3.5 s boot timer can show the Gate before `restoreSession()` finishes.

**Open PRs (no merges assumed):**
- **#3 (draft, Cursor, `cursor/presence-hardening-05bf`)** is PR A: no password form, `rpc('am_i_phone_verified')`, random per-session walker ids, snapshot validation (`snapshot.ts`), and `accountMessage('phone')`. It branches from before #4, and a test merge conflicts in `App.tsx`, `auth.ts`, `presence.ts`, `Gate.tsx`, `Hud.tsx`, `estate-server/room.js` and `server.js`.
- **#2 (Cursor)** is a separate plain-three.js walkaround in `packages/ui/walk` with its own collision code and two named NPCs in a "family office". See the conflicts in 7.4.

---

## 2. Control map

All bindings are remappable (standards §5). Prompts and the hint line must show the **current** binding and the glyph for the last device used (keyboard, gamepad or touch).

### 2.1 Keyboard and mouse
| Action (`settings.ts` id) | Default | Notes |
|---|---|---|
| Move (`forward/back/left/right`) | WASD, arrows | Camera-relative (`wishFromKeys`) |
| Run (`run`) | Shift | New setting: hold or toggle (standards §5). Toggle avoids the Windows Sticky Keys prompt. |
| Jump (`jump`) | Space | Hold for full height, tap for a short hop |
| Dive (`dive`) | C, V | Never Ctrl (Ctrl+W closes the tab) |
| Interact (`interact`) | F, Enter | Doors, stairs, lift, bookshelf, desk paper, game spots |
| Look | Mouse (pointer lock) or drag; Q/E | |
| Recenter camera (**new** `recenter`) | Middle mouse, Z | Snaps yaw behind the facing over 0.25 s (instant with reduced motion) |
| Travel to… (**new** `travel`) | T | Opens the menu from anywhere |
| Pause/Settings | Esc, P | P is needed because Esc during pointer lock only frees the mouse |
| Return to gate (`reset`) | R, **hold 0.5 s** | A ring fills and "Returning to the gate" is announced |

### 2.2 Gamepad (Standard Gamepad mapping, polled each frame)
| Action | Button |
|---|---|
| Move | Left stick (radial deadzone 0.15; 0.15–0.85 scales walk speed; ≥ 0.85 runs) |
| Look | Right stick (deadzone 0.15, response x²; yaw up to 3.0 rad/s, pitch up to 1.8 rad/s) |
| Jump / Dive / Interact | A (0) / B (1) / X (2) |
| Travel to… | Y (3) |
| Run (hold) / toggle | RB (5) or RT (7) / L3 (10) |
| Recenter camera | R3 (11) |
| Pause | Start (9) |
| Return to gate | Back/View (8), hold 0.5 s |
| Menus | D-pad or left stick to move, A to select, B to go back |

### 2.3 Touch
- **Left half:** a floating stick (it appears where the thumb lands, 60 px radius, same speed bands as the gamepad).
- **Right half:** drag to look (0.005 rad/px).
- **Bottom-right buttons:** Jump 72 px, Dive 56 px, Use 56 px (Use pulses when a prompt shows).
- **Top-right:** Menu and Travel to… buttons.
- Every target is at least 48 × 48 CSS px. Settings offers a left-handed swap and a button-size option (100/125/150 %).

### 2.4 Rebinding and accessibility notes
- Each action gets a **primary and a secondary** slot for keyboard and one slot for gamepad. Escape, Tab, Ctrl, Meta, Alt, F5, F11 and F12 can't be bound. When a new key steals a binding, the menu shows and announces "C was Dive. Dive is now unbound." Move, jump and interact can't be left unbound.
- "Reset controls" restores the defaults. Settings persist locally; nothing is stored on the server.
- One-button-friendly options: hold or toggle run, "step through doors for me" (default on), "aim assist" for mini-games, and Travel to… for all destinations.

### 2.5 Conflicts with current code (fix in PR B)
1. `Player.tsx:126` reads `jumpHeld: !!look.keys.Space`. This ignores rebinding and `touch.jump`, so remapped and touch players always get a full-height jump.
2. `Hud.tsx:96` hint, `PlayMenus.tsx:112` "Dive is C or V" and `Gate.tsx:68` "Ctrl or C to dive" are all hard-coded. The Gate line is wrong on main **and** in PR #3. Build these strings from `bindingLabel()`.
3. Esc with pointer lock: the browser takes the first Esc, so `EstateScene.tsx:114` never sees it. Add a `pointerlockchange` handler that opens Pause when the lock drops during play.
4. Travel has no key (button only, `PlayMenus.tsx:20`).
5. `assignBinding()` (`settings.ts:167-170`) keeps only one key per action, so remapping forward drops ArrowUp. It also unbinds other actions without telling the player.
6. Touch: the window `pointermove` listener (`EstateScene.tsx:136-141`) turns the camera while the thumb drags the stick. `touch.lookLeft/lookRight` are never set.
7. Touch has no run. The stick is binary at 0.25 (`Player.tsx:77-78`) and run is false.
8. E stays on look-right. Do not add E as a second interact key.

---

## 3. Movement and camera feel targets

The engineering rules (fixed step, interpolation, multi-Hz test, `tuning.ts` with units) are in standards §2 and are not repeated here. Every number below lives in `tuning.ts` and has a vitest test that drives `stepMove()` (or the new pure `cameraStep()`) at 60 Hz.

### 3.1 Movement (keep PR #4 values unless marked)
| Target | Value | Test (pass condition) |
|---|---|---|
| Walk / run speed | 3.45 / 7.85 m/s | Holding input for 1 s reaches 99 % of target |
| Start accel | 50 m/s² | 0 → run in 0.16 s ± 0.02 |
| Stop decel | 72 m/s² (60–80 band) | Run → 0 in ≤ 0.12 s, slide ≤ 0.45 m |
| **Turnaround (new)** | Use stop decel for the velocity part opposite the input | Full run reversal ≤ 0.28 s (today 0.31 s) |
| Air accel | 14 m/s² (28 % of ground) | Air steering < ground steering (existing test) |
| **Air braking (new)** | With no input in the air, slow at 14 m/s² | 1 s with no input in the air sheds ≥ 7 m/s |
| Jump 1 / 2 / 3 apex | 1.42 / 2.08 / 3.05 m (± 0.05) | Apex height from `JUMP_V` with gravity 26 |
| Jump 1 timing | Apex at 0.33 s, flat-ground airtime 0.60 s ± 0.03 | |
| Short hop | Tap ≤ 0.50 m, hold ≥ 1.40 m | Release after 1 step |
| Coyote / buffer / chain window | 0.12 / 0.12 / 0.32 s | Jump 0.11 s after leaving a ledge works; 0.13 s fails |
| **Indoor jump cap (new)** | Chain level max 1 inside any building | No head contact with a 3.4 m ceiling |
| Dive | 12.2 m/s for 0.48 s; ground slide decel 22 m/s²; needs speed > 0.25 m/s or input | Standing dive with no input does nothing |
| **One dive per airtime (new)** | Dive resets on landing | A second air dive is ignored. Today you can dive every 0.48 s in the air (`movement.ts:229`). |
| Facing | k = 10/s | A 180° turn gets within 10° in ≤ 0.30 s |
| Return to gate | Hold 0.5 s | A tap does nothing |

### 3.2 Collision
| Target | Value | Test |
|---|---|---|
| Wall push-out | Penetration never exceeds 0.03 m (controller offset) | Run into a wall for 60 steps: drift away from the wall ≤ 0.005 m, no jitter |
| Wall slide | At 45° keep ≥ 65 % of speed | |
| Stairs | 0.28 m risers climbed at run, keeping ≥ 80 % speed | Mansion stair x 8.1 |
| Ceiling | Upward speed becomes ≤ 0 on the step after contact | |
| Doorways | A 0.72 m capsule passes a 1.6 m gap with no snag at 30° approach | |

### 3.3 Camera
| Target | Value | Test |
|---|---|---|
| Distance | 6.5 m outdoors (setting 4.5–9 m); **4.0 m inside buildings**, blended over 0.4 s | |
| Pitch | 0.18–1.15 rad outdoors, 0.18–0.9 indoors; default 0.46 | |
| Horizontal lag | k = 7.1/s; ≤ 1.2 m behind at run; settles within 5 cm ≤ 0.45 s after a stop | |
| **Vertical hold (new)** | During a jump, the follow height stays at take-off height unless you rise > 1.5 m or fall below it. On landing it settles with k = 10/s. | A single jump moves the look point ≤ 0.35 m |
| Collision | Pull-in stays instant (never shows a wall's inside); **release eases out at k = 5/s** | Passing a column causes no single-frame jump > 1 m |
| Follow source | The interpolated render position, not `sim.x` from the physics step (standards §2) | No visible stepping at 144 Hz |
| Sensitivity | Mouse 0.0022 rad/px (0.0008–0.006), invert Y option; Q/E 1.8 rad/s (1.0–3.0) | |
| Auto-recenter | Gamepad and touch only, default on. After 1.5 s with no look input while moving > 1 m/s, turn toward behind the player at ≤ 1.2 rad/s. Off with reduced motion. | |
| Inside a building | Hide the roof and every floor above yours | Camera never sits inside the roof collider |

---

## 4. Doors and floors

### 4.1 Door state machine (per door, local to each client; door state is never synced)
| State | Enter when | Behaviour | Collider |
|---|---|---|---|
| `idle` | Start; or `closing` finished | Leaf shut | On |
| `prompt` | Local player ≤ 2.6 m from the door, on the same floor, with no menu open | Prompt shows; leaf 25° ajar (art doc §4.1); yellow ring on the doormat. Hides at > 3.0 m (hysteresis). | On |
| `opening` | Interact pressed in `prompt` | Leaf 0 → 90° in 0.35 s (instant with reduced motion) | Off at 50 % |
| `open` | `opening` finished | Stays open while any walker is ≤ 3.0 m away. With "step through for me" on (default), the player moves through using `stepThrough()` over 0.4 s with input locked (instant with reduced motion). | Off |
| `closing` | Nobody within 3.0 m for 2.0 s | Leaf 90 → 0 in 0.35 s. A walker within 1.2 m, or an interact press, sends it back to `opening`. | On at 50 %, only if no capsule overlaps the leaf |

- A remote walker within 1.5 m opens the door on your screen too. This is visual only and sends no network message.
- **One key:** a single interact press opens the door and, by default, steps you through. This meets the "doors open on a single key" requirement.
- This changes art doc §4.1 ("never colliders"). A closed leaf is now solid, so a closed door can't be walked through. Background Bot should update that line.
- Code: add `DoorState` and a pure `doorStep(state, input, dt)` in `buildings.ts` (testable). Remove the doormat `'floor'` kind from `Nearby` (`buildings.ts:147`) and `placeCue`. Kinds become `'door' | 'stairs' | 'lift' | 'bookshelf' | 'desk' | 'game'`.

### 4.2 Prompt UI
- A `.prompt` pill with key cap + verb + target + glyph (art doc §5.2): `[F] Open door: Home 3 ■`, `[F] Step outside`, `[F] Go upstairs: Floor 2`, `[F] Open the family directory`, `[F] Read the fund balance`.
- It appears in the same frame you enter range. On touch, the Use button shows the verb.
- Only one prompt shows at a time, the nearest target. Ties go to the one in front of the camera.

### 4.3 Floors
- Floor height is 3.4 m, matching the home walls. `floorAt(y) = floor((y − CAPSULE_CENTER + 0.5) / 3.4)`.
- **Stairs** are walkable (0.28 m rise × 0.48 m run, at least 1.2 m wide, along a back wall; 12 steps fit in the 10 × 8 m footprint). There is a **floor switch** at each end: at the bottom, `[F] Go upstairs: Floor 2`; at the top, `[F] Go downstairs: Ground floor`. One press moves the player along the stair in 0.8 s, or instantly with reduced motion.
- **Mansion lift** (accessible): a lift panel in the Great Hall next to the existing stair. With 2 floors it is a single press. A floor picker appears only if a building has 3 or more floors.
- Rendering: show your floor and the one below. Hide the roof and higher floors. Remote walkers on another floor of the same building are hidden in 3D; the roster shows "Home 1, Floor 2".
- `zoneAt(x, z)` gains `y`. Inside a building the zone becomes `"<Building>, Floor N"`.

### 4.4 What is announced (aria-live, and also spoken if "Spoken cues" is on)
| Event | Text (key from bindings) | Earcon |
|---|---|---|
| Prompt appears | "Door ahead: Home 3. Press F to open." | 660 Hz, 80 ms, panned (`blip`) |
| Door opens | "Door open." | 220→330 Hz sweep, 200 ms |
| Arrive inside | "Home 3, ground floor." | |
| Step outside | "Outside Home 3." | |
| Door closes (you are near) | (none) | 330→220 Hz, 200 ms |
| Stairs prompt | "Stairs ahead, up to Floor 2. Press F." | |
| Floor change | "Floor 2 of 2, Home 3." | Rising two-note (523→659 Hz) or falling |
| Bookshelf prompt | "Bookshelf ahead. Press F to open the family directory." | |
| Travel arrival | "Arrived at Home 3, front door. Door ahead." | 3-note chime |

- The same prompt is re-announced at most once every 8 s.
- Earcons follow the **Audio** volume setting, not reduced motion. Today `blip()` is silenced by reduced motion (`cues.ts:35`).

---

## 5. Estate layout plan (5 homes + Mansion)

The layout keeps every `buildings.ts` position and the 10 × 8 m footprint (art doc §2.1). It adds lanes, landmarks, floors and Travel entries. Home N = `HOMES[N-1]`.

### 5.1 Buildings
| Building | Door (from `buildings.ts`) | Nearest landmark | Accent / glyph (art doc) | Floors (placeholder) | Travel stop |
|---|---|---|---|---|---|
| Home 1 | (−103, 78), faces E | Hedge Garden | Orange ● | 2 | (−100.8, 78) |
| Home 2 | (103, 78), faces W | Pond Bridge | Sky blue ▲ | 2 | (100.8, 78) |
| Home 3 | (103, 48), faces W | Pond / Pool Terrace | Bluish green ■ | 2 | (100.8, 48) |
| Home 4 | (103, −72), faces W | Orchard | Reddish purple ◆ | 2 | (100.8, −72) |
| Home 5 | (−103, 36), faces E | Gazebo Lawn | Blue ⬢ | 2 | (−100.8, 36) |
| Mansion | main (0, −16); west wing (−22.4, −20); east wing (22.4, −20) | Fountain / tower | Vermillion ★ | Main block 2 (ground + upper gallery at 3.36 m via the existing stair); wings 1 | (0, −13.8), (−22.4, −17.8), (22.4, −17.8) |

- Labels become "Home 1"–"Home 5", "Mansion", "Mansion: West Wing" and "Mansion: East Wing" (in `buildings.ts`, `TRAVEL`, `cues.test.ts`, `buildings.test.ts`). Ids can stay or become `home-1`… The visible strings matter; ids are never shown.

### 5.2 Paths (3.0 m gravel lanes, y 1.02, reuse the gravel texture; art doc §3.1)
- **West Lane:** Fountain Court ring (−13.5, 30) → (−96, 30) → north-south along x −96 from z 30 to 78. Spurs run to Home 5 (z 36) and Home 1 (z 78).
- **East Lane:** (13.5, 30) → (96, 30) → along x 96 from z −72 to 78. Spurs run to Home 3 (z 48), Home 2 (z 78) and Home 4 (z −72). A link from outside the East Wing (32, −28) → (96, −28) makes a loop.
- **South Lane:** just inside the gate along z 74, from (−8, 74) west to x −96 and from (8, 74) east to x 96. It joins both lanes, so Homes 1 and 2 are near the spawn. It clears the pond rim (z ≤ 68) and the Hedge Garden wall (z ≤ 62.4).
- New zone rects: "West Lane" x −98…−94, z 28…80 and "East Lane" x 94…98, z −74…80 go before West Woods in `ZONES`. "South Lane" x −96…96, z 72…76 goes after Front Gate, so the gate area keeps its name.
- Fingerposts with glyph + "Home N" go at each fork, plus breadcrumb discs (art doc §3.2). Tree clearance: 14 m around home centres and 6 m along lanes (`trees.tsx blocked()`).
- Run times from the spawn along the lanes at 7.85 m/s: about 14 s to Homes 1 and 2, about 17 s to Home 3, about 18 s to Home 5, and about 31 s to Home 4. Travel to… covers longer trips.

### 5.3 Orientation
- The Mansion tower is visible everywhere. The fountain marks the centre. Each home has a unique roof and landmark silhouette (art doc §2.2).
- The minimap draws home glyphs and numbers, the Mansion ★, and the player as an arrow that shows facing.

### 5.4 Travel to… destinations (generated, grouped)
- **Grounds:** Front Gate, Fountain Court.
- **Mansion:** Main door, West Wing door, East Wing door, Bookshelf (Great Hall), Account office desk (East Wing), Upper gallery.
- **Homes:** Home N front door, and Home N upstairs (N = 1–5).
- **Games (phase 3):** one entry per game spot (section 6D).
- Door entries are generated from `BUILDINGS.flatMap(b => b.doors)`, so every door always has an entry (testable).
- Arrival sets y from the destination floor (today `Player.tsx:88` keeps the old y) and faces the player and camera toward the door or object.
- There is a 0.3 s fade, or none with reduced motion.

---

## 6. Menus and HUD

### 6.1 Pause menu (Esc / P / Start / touch Menu)
- Items: Resume, Travel to…, Settings, Controls help, Leave the estate (returns to the family site).
- Every dialog moves focus to its first control when it opens, traps Tab, closes on Esc or B, and returns focus when it closes. A click is needed to re-lock the pointer.

### 6.2 Settings tabs
- **Controls:** keyboard primary/secondary, gamepad, touch layout, hold/toggle run.
- **Camera:** sensitivity, invert Y, distance, auto-recenter.
- **Text:** font size; the scale levels are in standards §5.
- **Colour:** colourblind-safe markers (Okabe-Ito plus initials, never colour alone), high contrast (art doc §5.4).
- **Audio:** master, effects, cues, spoken cues, speech rate.
- **Motion:** reduced motion.
- **Spoken cues default changes to OFF.** Screen-reader users already hear the aria-live line, and having both reads everything twice (`settings.ts:51`). The setting's label says "Read cues aloud (for players without a screen reader)".

### 6.3 HUD
- **Roster:** initials swatch + display name + zone. Initials text is black or white, chosen by luminance (black on `#e69f00`, `#56b4e9`, `#009e73`, `#f0e442`, `#cc79a7`, `#d55e00`; white on `#0072b2`, `#000000`).
- **Zone banner** with glyph. **Minimap** (section 5.3). **Prompt pill.** **Feedback toast.** A **connection status** line with `role="status"`. A **hint line** built from bindings.
- Privacy: the HUD shows display names only. It never shows user ids, emails or phones, and no `'Guest'` fallback is ever displayed (`family.ts cleanName`; the neutral wording is still to be decided).

### 6.4 Bookshelf flow
1. Walk to the shelf in the Great Hall. The prompt reads `[F] Open the family directory`.
2. The panel opens as a modal and announces "Family directory open." It loads **only** `signed_in_directory` through the member's own session, selecting only `id`, `name`, `role`, `parent_id`, `bio`, `sort_order`, `contact_listed`, and `city` if wanted (never `select *`, never `phone`, `email` or `notes`).
3. While loading, it shows "Loading the directory…" with `role="status"`. On error, a generic message with `role="alert"`. It never echoes server text.
4. Cards (section 6B). The name filter only filters rows already loaded; it is not a server lookup.
5. Close (Esc / B / Close) returns to the game and announces "Back in the Great Hall".
6. Rows are never cached in localStorage, logged or sent over presence. The 3D shelf shows blank spines only (art doc §4.3).

### 6A. Access screens (signed out, not verified, presence offline)
Checks run in this order: session → `profiles` row with a name → `rpc('am_i_phone_verified')` → presence welcome. **The estate never shows a password or email field** (PR #3 removes the one on main).

| State | Heading (exact) | Body / action | ARIA |
|---|---|---|---|
| Checking | "Checking your account…" | Stays up until `restoreSession()` resolves; times out at 15 s into the signed-out screen. Today a 3.5 s timer shows the Gate early (`App.tsx:32`). | `role="status"` |
| Signed out (no session) | "Sign in on the family site to visit the estate" (`wait.ts SIGN_IN_TEXT`) | Button "Sign in on the family site" goes to `FAMILY_ACCOUNT_URL` and returns to `/estate/` (PR #3) | Heading focused |
| Not yet phone-verified | "Confirm your phone on the family site before walking the grounds." (PR #3 `accountMessage('phone')`, kept as is) | Button "Go to the family site". **Never show the phone number, not even partly masked.** | `role="alert"` |
| No profile / no name | `PROFILE_MISMATCH_TEXT` / `accountMessage('name')` (existing) | Button "Go to the family site" | `role="alert"` |
| Presence offline | "Family presence is offline right now" (`PRESENCE_OFFLINE_TEXT`) | "The grounds stay closed until family presence is back." Retries automatically at 2, 4, 8, 16, then every 30 s, with "Trying again in N s" and a "Try now" button | `role="status"` |
| Session expires mid-visit | Signed-out screen | The scene unmounts. Nothing is kept. | |
| WebGL unavailable | (existing fallback) | Travel to… list still offered | |

- `accountMessage('signin')` (`profileName.ts:25`, "…to walk the grounds.") must return `SIGN_IN_TEXT`.
- `presenceRejection()` (`wait.ts:5`) needs a `'phone'` result so a presence-side rejection doesn't show the sign-in screen.

### 6B. Bookshelf entry states and presence name labels
| Entry | Shows | Never shows |
|---|---|---|
| `contact_listed` true | Initials avatar, display name (`name`), and any of `role`, `bio`, and `city` that the view returns | Phone, email and notes, always (they are never selected) |
| `contact_listed` false | Display name and initials avatar only (plain name-and-initials card) | Phone, email, notes, role, bio and city; never a teen, minor or age label |
| Initials avatar (every card) | Initials (`markers.initials`) on `markerColor(seed)` from Okabe-Ito, with text colour per 6.3. There is no photo column, so every card uses initials. | |

- Empty fields are left out; '—' is not shown.
- `id` and `parent_id` are used only for keys and grouping, and `sort_order` only for ordering. None of them is ever shown in DOM text, `aria-label`s or sprites.
- The selected columns carry no age field. The bookshelf never labels anyone a teen, minor or any age, and never infers or displays age. The server decides what is blank (including when `contact_listed` is false); the client just renders what comes back, and an empty field shows nothing. A test with made-up rows checks that empty fields never render and that a false `contact_listed` row is the plain name-and-initials card.
- There is no passed-away state for now (the allowed columns have no flag for it). Do not infer one.
- The card's `aria-label` equals what is visible and nothing more.
- The client never decides contact visibility or age on its own. It shows fields only when `signed_in_directory` returns them; `contact_listed` comes from the server. The client reads no approval flag and no other table. Update `directoryView.test.ts` to match, using made-up rows only.
- **Presence labels** (3D name sprite, roster, walker cue, minimap) show only the display name the directory would show, plus the initials marker. They never show user ids, session ids, emails or phones.
- The marker colour seed is the **display name**, so the same person has the same colour in the directory and on the grounds without sending any id. Today the seed is `sim.id` / `person.id` (`Hud.tsx:56,77`, `Player.tsx:221`).

### 6C. Account office desk paper (Mansion East Wing)
- **Where:** the existing East Wing desk (`world.tsx:180-181`, around (22, −30)). Prompt within 1.6 m: `[F] Read the fund balance`. Travel entry: "Mansion: Account office desk".
- **Data:** one row from the existing Supabase table **`fund_stats`** (the site's Fund page source). The query uses the member's own session, selects **only the balance columns it displays (never `select *`)**, and reads one row each time the paper opens.
- The game **never writes** to `fund_stats`. Admins update it from the Fund page.
- Readers are signed-in, phone-verified members only (the scene is already gated; re-check the session before the query). Nothing is baked into game files, cached, logged, sent over presence or shown signed out.
- Account limits on the paper (if any) are still to be decided. The game adds no age logic. If the paper is made adults-only, that is a database rule (a reviewed `.sql` file, never a client check), and the paper then shows "The fund balance isn't available for your account" when no row comes back. No database change is needed for this PR.
- **UI:** a small modal titled "Family fund" showing the balance figure(s) in the same format as the Fund page, plus Close.
  - Loading: `role="status"`. Error: generic `role="alert"`.
  - The balance goes to the DOM (screen readers read it). It is **not** read by `speechSynthesis` or the aria-live cue line, so it isn't voiced on the grounds.
- Ships as its own small PR after PR B (one concern per PR).

### 6D. Mini-games (play design only)
The owner chose these eight (2026-10-07): **miniature golf, arcade basketball, bowling, baseball, football, soccer, tennis, table tennis.** They're built on Programmer Master Bot's shared base (ball physics, turn-and-score, input layer, accessible score announcements). Anything synced comes only from Security Guard's presence field list. This section is play design only. It doesn't define architecture or sync fields.

**Phases**
- **Phase 1, solo and local only (after PR B and the homes):** miniature golf, arcade basketball, bowling. No network sync. Up to 4 members can take turns on one device.
- **Phase 2, 1v1 over presence (after the Worker port and the approved field list):** table tennis, tennis.
- **Phase 3, team sports (after Phase 2 proves the sync):** baseball, football, soccer. Each also has a solo practice mode that ships in Phase 1.

**Placement (zones; exact coordinates set in the layout pass against `buildings.ts`)**
- Mansion games room: arcade basketball, bowling (2 lanes), table tennis.
- Grounds: a 9-hole miniature golf course along the lanes between homes, using the art doc's landmarks as hole themes. Tennis court and a multi-sport field (baseball diamond, football and soccer markings) on the open lawn, away from home doors.

| Game | Core loop and rules | Feel targets | Controls (shared actions) | Round |
|---|---|---|---|---|
| Miniature golf | 9 holes, par 2–4, stroke cap 6. Lowest total wins. | Putt 0.5–6 m/s, felt decel 1.0 m/s², cup capture ≤ 1.8 m/s, bank restitution 0.7 | Aim with move, hold interact to charge and release to putt, jump for the overhead view | about 10 min |
| Arcade basketball | 60 s timer, 2-pt shots, the last 15 s count 3 pts. High score wins. | Arc assist on light; release window 0.18 s light / 0.10 s off; rim restitution 0.6 | Hold interact to rise, release at the peak of the meter | 60 s |
| Bowling | 10 frames, standard scoring, simplified 10th frame (max 3 balls). | Ball 4–9 m/s, hook from release-angle input, pin scatter from the shared physics | Move to set the line, hold interact for power, steer the stick during release for hook | 8–12 min solo |
| Table tennis | First to 11, win by 2, serve swaps every 2. | Auto-move to the ball on assist; timing window shapes speed and spin | Move to position, interact to hit, hit timing sets the angle | about 5 min |
| Tennis | One tiebreak-style set (first to 7, win by 2) to keep it short. | Auto-run on assist; shot power from charge; ball speed 15–35 m/s scaled to the court | Move, interact to swing (tap for flat, hold for lob) | about 8 min |
| Baseball | 3 innings. Batting uses a timing window; pitching uses aim plus a meter. | Pitch 25–40 m/s scaled; hit window 0.15 s light / 0.09 s off | Interact to swing or pitch, move to aim | about 10 min |
| Football | Flag-football style, 5 v 5 max, first to 3 touchdowns; no tackling. | Pass leads the receiver on assist; flag pull on contact | Move, interact to pass or pull a flag, run to sprint | about 10 min |
| Soccer | 3 v 3 to 5 v 5, two 4-minute halves, no offside. | Kick power from charge, light auto-aim to goal on assist | Move, interact to kick (tap pass, hold shoot), run to sprint | 8 min |

**Rules for every game**
- Only signed-in members play. There are no AI family members. Solo practice uses targets or a ball machine, never a named NPC.
- Scores and turns show and announce display names only, following the bookshelf rules. Never IDs, phones or emails.
- No saved leaderboards yet (that would be a DB need, which isn't requested here).
- Aim assist settings: off, light or strong. A one-button mode charges on the first tap and releases on the second. Turn timers are soft and can be extended to 90 s or turned off in settings.
- Join at the game spot with `[F] Play <game>`, then choose "Solo" or "Join (n/max)". Leave with Esc / B / Back.
- Announcements: the shared base announces score and turn. This spec adds short result cues (for example "Strike", "2 metres short, left").

---

## 7. Acceptance checklist (for Cursor's PRs)

Use together with standards §7. A reviewer marks each item pass or fail.

### 7.1 PR B (gameplay)
- [ ] All section 3 numbers live in `tuning.ts`, each with a test. Turnaround ≤ 0.28 s. Indoor jump cap holds. One dive per airtime. Short hop ≤ 0.50 m. Hold-to-reset is 0.5 s.
- [ ] `jumpHeld` uses the jump binding, touch and gamepad. Remapping jump to J still gives a short hop on tap.
- [ ] Camera: vertical hold during jumps, eased collision release, 4.0 m distance indoors with the roof hidden, and it follows the interpolated position.
- [ ] Doors follow the 4.1 state machine. A closed door blocks. One interact press opens and steps through. Prompt hysteresis is 2.6 m show / 3.0 m hide. The `'floor'` doormat kind is gone.
- [ ] Every door in `BUILDINGS` has a Travel entry (test: count of doors equals count of door Travel entries). All 5 homes, the 3 Mansion doors, the bookshelf, the desk and the upper floors can be reached by keyboard alone and with a screen reader.
- [ ] Travel arrival sets the floor height and faces the door.
- [ ] Gamepad map 2.2 works. Touch: floating stick, look drag, run at ≥ 0.85, pointercancel releases buttons, `touch-action: none` on the canvas.
- [ ] Rebinding has 2 slots, conflict messages and reserved keys. Hint, Gate and Settings text come from the bindings. P and pointer-lock loss open Pause. T opens Travel.
- [ ] Spoken cues default off. Earcons follow audio settings, not reduced motion. The section 4.4 strings are used.
- [ ] Dialogs focus their first control, trap focus, close on Esc or B, and restore focus.
- [ ] Labels read "Home N" / "Mansion". No themed home names remain in code or tests.
- [ ] Bookshelf: reads only `signed_in_directory` and selects only `id`, `name`, `role`, `parent_id`, `bio`, `sort_order`, `contact_listed`, and `city` if wanted; never selects `phone`, `email` or `notes`; never uses `select *`; 6B states, with a test that uses made-up rows; no phone numbers or email addresses on any card; when `contact_listed` is true, cards show name, role, bio and city if returned; when `contact_listed` is false, the plain name-and-initials card only; never labels anyone a teen, minor or any age; empty fields show nothing.
- [ ] Presence labels and markers use the display name only, seeded by display name. No ids in DOM text, aria or sprites.
- [ ] Budgets and draw counts are stated in the PR (standards §4).

### 7.2 PR A (#3)
- [ ] 6A table: exact strings, no password or email field, never a phone number, `'phone'` rejection path, Checking stays up until the session resolves, the Gate controls list drops "Ctrl".

### 7.3 Account office PR
- [ ] Selects named balance columns from `fund_stats` (no `*`) with the member session. No writes. No cache or log. Not voiced by speech. Error and empty states work.

### 7.4 Fails outright
- Any family name, contact or real house name in code, tests, fixtures or assets.
- Any guest path or NPC family member. PR #2's named NPCs fail this.
- Any second engine or second estate implementation. PR #2's `packages/ui/walk` fails this.

---

## 7A. PR #4 gameplay review (fixes for PR B)

PR #4 was merged at 1:16 PM PT without review. These are feel and UX items only; code quality and security are covered elsewhere.

**Movement**
1. `Player.tsx:126`: `jumpHeld` is hard-wired to Space. It ignores rebinding, touch and gamepad. Use the jump binding.
2. `movement.ts:281-282`: reversing uses start accel (0.31 s). Use stop decel on the opposing part of the velocity (target ≤ 0.28 s).
3. `movement.ts:158`: with no input in the air the player keeps all momentum. Add air braking at 14 m/s².
4. `movement.ts:229`: you can dive every 0.48 s in the air, which lets you fly across the map. Allow one dive per airtime.
5. `movement.ts:248-253` with `Homes.tsx:46`: a triple jump (3.05 m) hits 3.4 m ceilings. Cap the chain at 1 indoors.
6. `Player.tsx:63-65, 103-116`: R resets immediately, which is easy to hit by accident. Make it a 0.5 s hold.
7. `Player.tsx:88`: Travel keeps the old height and facing. Set the floor height and face the destination.
8. `movement.ts:18`, `EstateScene.tsx:195`: the step is hard-coded to 1/60. Use `world.timestep` per standards §2 and tighten the multi-Hz test to 1 %.

**Camera**
9. `CameraRig.tsx:18-20` follows `sim.x/y/z`, which is written in the physics step (`Player.tsx:153-155`), so it stutters on 120/144 Hz screens. Follow the interpolated body.
10. `CameraRig.tsx:19`: vertical follow bobs on every jump. Hold height during jumps (3.3).
11. `CameraRig.tsx:50-57`: collision pull and release are both instant, so the camera pops around columns and trees. Ease the release at k = 5/s.
12. `CameraRig.tsx:21`: 6.5 m is fixed even indoors, so the camera jams into walls and the roof collider in 10 × 8 m homes. Use 4.0 m indoors and hide the roof.
13. `Player.tsx:51,54`: sensitivity is fixed and there is no invert. Add both to Settings.
14. `EstateScene.tsx:114-126`: the first Esc under pointer lock never reaches the game. Open Pause on `pointerlockchange`, and add P.

**Braking:** 72 m/s² stop is in band (keep). Items 2 and 3 cover the gaps.

**Dive key:** settings are correct (C/V). But `Gate.tsx:68` still says "Ctrl or C to dive" (also in PR #3), and `Hud.tsx:96` and `PlayMenus.tsx:112` are hard-coded. Build these from the bindings.

**Touch**
15. `EstateScene.tsx:136-141`: dragging the stick also turns the camera. Ignore touch pointers that started on controls, and add a right-half look drag. `touch.lookLeft/lookRight` are never set.
16. `Player.tsx:77-78`: no run on touch (190 m at walk speed is about 55 s). Run when the stick is at ≥ 0.85.
17. `PlayMenus.tsx:178-201`: no `onPointerCancel`/`onPointerLeave`, so a finger sliding off leaves jump, dive or walk stuck. Release on cancel and leave.
18. `styles.css:104,248`: `touch-action: none` is only on `.stick`, not the canvas, so look drags can scroll or zoom the page.
19. `styles.css:242`: the stick is fixed at 120 px. Make it a floating stick.

**Doors**
20. `Homes.tsx:59-61`, `buildings.ts:154-159`: doors are open gaps plus a 1.7 m teleport, so walking in and pressing F do the same thing. Build the 4.1 state machine with a leaf and collider.
21. `buildings.ts:147`, `cues.ts:23`: the "floor" kind is the doormat ("Floor marker ahead"), which clashes with real floors. Remove it.
22. `buildings.ts:145`: no prompt hysteresis, so the prompt flickers at 2.6 m. Show at 2.6 m and hide at 3.0 m.
23. `buildings.ts:161-165`: the prompt doesn't name the place. Use "[F] Open door: Home 3 ■".
24. `cues.ts:35`: earcons are muted by reduced motion. Tie them to Audio settings instead.

**Menus**
25. `PlayMenus.tsx:20-22`: Travel has no key, and the dialogs (`:35-55`, `:82-121`, `:147-172`) have no focus management. Add T / Y and the 6.1 focus rules.
26. `buildings.ts:167-180`: Travel lacks the wing doors, the bookshelf and floors. Generate entries from doors (5.4).
27. `settings.ts:167-170`: one key per action and silent unbinding. Add 2 slots and conflict messages.
28. `settings.ts:51`: speech on by default doubles screen-reader output. Default it off.
29. Settings lacks camera, audio-volume and run-toggle options (standards §5).

**Waiting screens**
30. `App.tsx:32`: the 3.5 s boot timer shows the sign-in Gate to signed-in members on slow networks. Keep "Checking your account…" until the session resolves (15 s cap).
31. `App.tsx:11-22`: the offline screen has no retry countdown, no "Try now" and no `role`. See 6A.
32. `profileName.ts:25`: "…to walk the grounds" differs from the agreed "Sign in on the family site to visit the estate" (`wait.ts:1`). Unify.
33. `wait.ts:5-8`: no `'phone'` rejection path (needed with PR #3).

**Background Bot's flags (checked)**
34. **Valid.** `world.tsx:188`: the Mansion `pointLight` is always on. Gate it on `loadedInteriors.has('mansion')` (standards §4).
35. **Valid.** Initials contrast. In `styles.css:228`, `.swatch` text `#1c241c` on `#0072b2` is 3.1:1 and on `#000000` is 1.3:1. Also `CharacterModel.tsx:145` tints the whole initials sprite with the marker colour, which makes the initials unreadable on black or blue markers. Draw the marker colour as the canvas background and pick black or white text (6.3).
36. **Valid, and worse than reported.** `<Homes/>` sits inside the world `BatchGroup` (`world.tsx:284,356`), and Homes re-renders on its own state (`Homes.tsx:15-19`).
    - Interior boxes are pushed into the stale batch array while `MergedBatch` (`primitives.tsx:26`) doesn't re-merge. So interior visuals likely don't appear (their colliders do: invisible furniture) until something re-renders the world.
    - When the world does re-render, every box on the estate is re-merged, which causes a hitch.
    - Fix: give each interior its own `BatchGroup` outside the world batch. Please confirm in the browser.
37. **Valid.** `buildings.ts:57-67`: themed home names and "the mansion". Change to "Home N" / "Mansion" (also in `cues.test.ts`, `buildings.test.ts`).

---

## Appendix A. Playtest checklist (60, 120 and 144 Hz; keyboard, gamepad, phone)
- **Jump timing:** tap gives a short hop (about 0.5 m) and hold gives about 1.4 m. Chained jumps 2 and 3 work only within 0.32 s of landing. A jump 0.1 s after walking off a ledge works (coyote). Pressing jump 0.1 s before landing jumps on touchdown (buffer). No triple jump indoors.
- **Braking and turning:** releasing at run stops within half a metre. A full reversal feels snappy (≤ 0.28 s). Air braking lets you stick a landing on a stair.
- **Dive:** C/V dive only while moving, once per jump. Ctrl does nothing.
- **Camera:** no bob on single jumps. No pop past columns or trees. Inside each home the camera stays inside the room with the roof hidden. No stutter at 144 Hz. Invert and sensitivity work. The first Esc under pointer lock opens Pause.
- **Door states:** for each of the 8 doors (5 homes + 3 Mansion), check idle → prompt (ring, ajar, prompt text, earcon, announcement) → one press opens and steps through → it auto-closes 2 s after you leave → walking back mid-close reopens it → a closed door blocks.
- **Floors:** stairs walk and switch with one press. The lift works. Floor announcements are correct. Remote walkers on other floors are hidden.
- **Travel to…:** from the gate, Travel to every entry in order (all homes, doors, upstairs, bookshelf, desk), then travel home-to-home in both directions. You arrive facing the door at the right height. Repeat with keyboard only and with a screen reader (NVDA or VoiceOver), mouse unplugged.
- **Touch controls:** floating stick walks and runs at full tilt. Look drag doesn't move the stick. Lifting a finger off a button mid-press doesn't leave it stuck. The page never scrolls or zooms. Use pulses on prompts. Left-handed swap works.
- **Bookshelf:** with made-up test data only, a `contact_listed` true card (name, role, bio, city if returned), a `contact_listed` false card (name and initials only), readable initials on every Okabe-Ito colour. No phone numbers and no email addresses anywhere. No teen, minor or age labels.
- **Access screens:** signed out, not verified, presence offline (retry countdown), slow network (no premature Gate).
