# Changelog

All notable changes to this project are documented in this file.

## [0.1.0] - 2026-10-07

### Added
- Walkable 3D McCowan Family Estate (`packages/estate`) with keyboard controls in the style of Super Mario 64, Fall Guys, and Gang Beasts: camera-relative walk and run, jump chains, dive, and a wobbly bean character.
- Live presence server (`packages/estate-server`) so family members on the grounds can see each other and which part of the estate they are in.
- Family-site sign-in bridge using the same accounts as mccowanestate.com, plus a `postMessage` session the website can pass into an embedded frame.

## [0.0.2] - 2026-04-13

### Added
- Viral showrunner controls for scenario start, chaos triggers, and cinematic mode.
- Audience voting API: `POST /api/vote-chaos` to let viewers trigger chaos events collaboratively.
- Episode recap API: `GET /api/episode-recap` with:
  - top 10 highlights
  - agent leaderboard
  - scenario outcome card
- Relationship graph system (alliances/rivalries/neutral) with real-time `relationship-update` events.
- New UI panels:
  - `ViralControlPanel`
  - `HighlightsFeed`
  - `AgentPulseBoard`
  - `RelationshipGraph`
  - `EpisodeRecapPanel`
- Reusable draggable/minimizable `FloatingPanel` component with persisted position/state.
- Live layout rendering pipeline for custom furniture from Layout Editor (including plants).
- In-canvas layout editing support (drag mode + per-item nudge controls in editor list).
- Camera zoom in/out using mouse wheel.
- Unified root start command: `npm run start` to run server + UI together.

### Changed
- Agent state schema extended with live telemetry fields:
  - `mood`
  - `reputation`
  - `riskLevel`
  - `momentum`
- Highlight/event system expanded to capture conversations, tool calls, hires, tasks, scenario changes, and audience-triggered chaos.
- Websocket endpoint resolution improved in UI:
  - auto-detect from current host
  - override via URL query `?ws=...`
  - persisted override via local storage
- Camera movement behavior updated to prioritize manual input and respect office bounds.

### Fixed
- Layout editor saved items that were not rendered in the game scene.
- Layout sync on join/save so custom furniture appears after reload/reconnect.
- Custom layout movement escaping office bounds.
- Keyboard navigation reliability improvements for camera panning.

## [0.0.1] - 2026-02-25

### Added
- Initial AgentOffice release with local-first multi-agent office simulation.
- Core features:
  - LLM-driven agents (Ollama/OpenAI-compatible adapters)
  - agent-to-agent conversations
  - task assignment and task updates
  - dynamic agent hiring
  - tool execution (code/search/notes/read file)
  - persistent memory with SQLite and semantic recall
  - Phaser office scene with React overlays
  - layout editor and system activity log
  - Colyseus real-time synchronization
