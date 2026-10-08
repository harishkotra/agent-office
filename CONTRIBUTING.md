# Contributing

The walkable grounds live in `packages/estate`. Presence lives in `packages/estate-server`.

```bash
npm install
npm run estate
```

The client is http://localhost:5174. The presence server is ws://127.0.0.1:8787.

Before opening a pull request:

```bash
npm run lint
npx tsc --noEmit -p packages/estate
npm test --workspace=@agent-office/estate
npm test --workspace=@agent-office/estate-server
npm run build --workspace=@agent-office/estate
```

Design notes are in `docs/gameplay-spec.md`. The work plan is in `docs/estate-roadmap.md`.
