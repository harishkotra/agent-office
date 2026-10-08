# Auto-merge Spec (CI + safe auto-merge)

**For:** Cursor, to build in the CI PR (roadmap task 0, draft PR #5).
**Reviewer:** Security Bot. **Ruleset on `main`:** set by Grok Bot after the CI check has run once.
**Status:** Draft, 2026-10-07.

This repo is public. Nothing in these workflows, their config, their logs or their comments may contain a family name, contact detail, security finding, key or token.

---

## 1. Goal

Cursor works for days with no human reviewer online. Small, safe PRs should merge on their own once CI passes. Anything risky (the paths in roadmap section B) must never merge on its own.

We get this with **two separate workflows**:

| | CI workflow | Auto-merge workflow |
|---|---|---|
| File | `.github/workflows/ci.yml` | `.github/workflows/auto-merge.yml` |
| Trigger | `pull_request` (and `push` to `main`) | `workflow_run` when CI completes |
| Which copy runs | The PR's copy | Always `main`'s copy (GitHub runs `workflow_run` from the default branch) |
| Token permissions | `contents: read` only | `contents: write` and `pull-requests: write` only |
| Secrets | None. The file never mentions `secrets.` | None. It uses only the built-in workflow token |
| Runs PR code? | Yes (lint, types, tests, build) | **Never.** No checkout, no install, no PR scripts. GitHub API calls only |

Never use `pull_request_target` anywhere in this repo.

---

## 2. Files

All of these live under `.github/`, which is a protected path, so none of them can change through auto-merge.

| File | Purpose |
|---|---|
| `.github/workflows/ci.yml` | CI checks |
| `.github/workflows/auto-merge.yml` | Auto-merge |
| `.github/auto-merge/protected-paths.txt` | Protected-path globs. Must match roadmap section B exactly |
| `.github/auto-merge/config.json` | Branch prefix, optional author allowlist and other settings |
| `.github/scripts/check-self-hosted.mjs` | SRI / self-host check used by CI |

### 2.1 `protected-paths.txt`

One glob per line. `#` starts a comment. Blank lines are ignored.

```text
# Must match docs/estate-roadmap.md section B. This file is itself protected (.github/**).
packages/estate-server/**
**/auth.ts
**/presence.ts
**/snapshot.ts
**/directory.ts
**/fundStats.ts
**/*.sql
.github/**
# Leak-test scripts and leak-test fixtures / test data
packages/estate/src/ciGuard.test.ts
packages/estate/src/securityScan*.ts
packages/estate/src/pathGuard*.ts
**/*.leak.test.*
scripts/leak/**
**/leak-fixtures/**
**/*.leak.fixture.*
**/package.json
**/package-lock.json
**/npm-shrinkwrap.json
**/yarn.lock
**/pnpm-lock.yaml
**/.npmrc
**/.eslintrc*
**/eslint.config.*
**/vitest.config.*
**/vite.config.*
**/vite.*config.*
**/tsconfig*.json
# Pages: scripts and SRI hashes live here
**/index.html
# Cloudflare Worker config
**/wrangler.toml
**/wrangler.json
**/wrangler.jsonc
**/.dev.vars*
docs/auto-merge-spec.md
.gitleaks.toml
.gitignore
**/.env*
# docs/estate-roadmap.md is handled by the special rule in section 4.3
```

**Glob rules** (write a small matcher; do not add a dependency):
- `**` matches any number of folders, including none.
- `*` matches any characters except `/`.
- `?` matches one character except `/`.
- Patterns are matched against the full path from the repo root, case-sensitive.
- `**/name` also matches `name` at the repo root.
- Add a unit test for the matcher with sample paths (for example `packages/estate/src/auth.ts` → protected, `auth.ts` → protected, `packages/estate/tsconfig.json` → protected, `packages/estate/index.html` → protected, `wrangler.toml` → protected, `packages/estate/src/leak-fixtures/rows.ts` → protected, `packages/estate/src/movement.ts` → not protected, `packages/estate/src/game/Homes.tsx` → not protected).
- Naming rules that keep this list matchable: leak tests are named `*.leak.test.*` (plus the existing `ciGuard.test.ts`); leak-test helper scripts live in `scripts/leak/`; leak-test fixtures and test data live in a `leak-fixtures/` folder or are named `*.leak.fixture.*`; the Worker port's code lives under `packages/estate-server/`.

### 2.2 `config.json`

```json
{
  "baseBranch": "main",
  "ciWorkflowPath": ".github/workflows/ci.yml",
  "allowedAuthors": ["JerichoTheWall"],
  "allowedBranchPrefixes": ["cursor/"],
  "holdLabel": "hold",
  "roadmapPath": "docs/estate-roadmap.md"
}
```

- **Identity rule (confirmed):** a PR qualifies when its head branch is in this same repository **and** the branch name starts with `cursor/` (`allowedBranchPrefixes`). That is the main check. Only people with write access can push branches to this repo, so the two together are enough for now.
- `allowedAuthors` is **optional and secondary**. If the list is non-empty, the PR author must also be on it; if it is empty, the author is not checked. Default: `["JerichoTheWall"]` (Cursor's PRs so far are opened under the owner's account). If Cursor ever opens PRs as its own bot account, add that login through a reviewed PR, or empty the list.
- The owner can still merge anything by hand.
- `holdLabel`: any PR with this label is never auto-merged.

### 2.3 Off switch

The auto-merge job runs only when the repository **variable** `AUTO_MERGE_ENABLED` is `true` (Settings → Secrets and variables → Actions → Variables). This is a plain setting, not a secret. Setting it to anything else stops all auto-merges at once.

---

## 3. CI workflow (`ci.yml`)

Update the existing `ci.yml` in PR #5 to this shape.

**Requirements**
1. Triggers: `pull_request` on `main` with types `opened`, `synchronize`, `reopened`, `ready_for_review` (so marking a draft ready runs CI again and lets auto-merge act), plus `push` to `main`.
2. `permissions: contents: read` at the top level. Nothing else.
3. No `secrets.` anywhere in the file. No environment files. Checkout uses `persist-credentials: false`.
4. Every action is pinned to a full commit SHA, with the version in a comment.
5. Install with `npm ci --ignore-scripts`. If a package truly needs an install script, stop and ask Security Bot (it would be a protected change anyway).
6. Steps, all must pass: lint, `tsc --noEmit`, estate vitest (includes the leak tests), estate-server tests, leak tests (run by name too, so they cannot be silently skipped), live/production build, separate perf-page build (CI only; not deployed), SRI / self-host check, secret scan.
7. One job, with a stable name. The job is named `estate` (as in PR #5). That name is the required status check in the ruleset. If it is ever renamed, the ruleset must be updated the same day.
8. The leak tests / bundle scan also fail if `ci.yml` contains `secrets.` or if any workflow contains `pull_request_target`. They must fail if the live bundle contains the perf page, its made-up test data, or Playwright.
9. Playwright is added in this CI PR as a `devDependency` with an exact pinned version. Only Chromium is installed, and only inside the CI job, which uses a read-only token and no secrets. The live build and the Pages/Worker deploy never include the perf page, its made-up data, or Playwright.

**SRI / self-host check** (`.github/scripts/check-self-hosted.mjs`, plain Node, no dependencies). Scan `packages/estate/index.html` and every `.html`, `.js` and `.css` file in `packages/estate/dist`. Fail if any of these point to another origin (anything starting with `http:`, `https:` or `//`):
- `<script src>`, `<link href>` (stylesheets, fonts, preloads, icons), `<img src>`, `<audio src>`, `<source src>`, CSS `url(...)` and `@import`, dynamic `import("http…")`.
- Also fail on known tracker or CDN hosts appearing anywhere in the bundle (for example `googletagmanager`, `google-analytics`, `fonts.googleapis`, `cdn.jsdelivr`, `unpkg.com`, `cdnjs`).
- The runtime Supabase and presence addresses come from build-time settings that CI does not set, so they are not in the CI build.
- Because every asset must be self-hosted, no external `<script>` or stylesheet is allowed at all, so there is nothing to add SRI hashes to. If one is ever approved, it must carry an `integrity` attribute, and the check enforces that.

**Secret scan.** Use the `gitleaks` command-line tool, downloaded at a pinned version and checked against its published SHA-256 before running. Do not use an action that needs a token or a licence key. Scan the working tree and the PR's commits (base SHA to head SHA).

### 3.1 YAML sketch

```yaml
name: CI

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  estate:
    name: estate
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<full-commit-sha> # v4
        with:
          persist-credentials: false
          fetch-depth: 0

      - uses: actions/setup-node@<full-commit-sha> # v4
        with:
          node-version: 22
          cache: npm

      - name: Install from the lockfile (no install scripts)
        run: npm ci --ignore-scripts

      - name: Install Playwright Chromium (CI only)
        run: npx playwright install chromium
        # Exact pinned version from package.json (added in this PR). Read-only token; no secrets.

      - name: Lint
        run: npm run lint

      - name: Typecheck
        run: npx tsc --noEmit -p packages/estate

      - name: Estate tests
        run: npm test --workspace=@agent-office/estate

      - name: Estate server tests
        run: npm test --workspace=@agent-office/estate-server

      - name: Leak tests (by name)
        working-directory: packages/estate
        run: npx vitest run src/ciGuard.test.ts

      - name: Build live bundle
        run: npm run build --workspace=@agent-office/estate

      - name: Build perf page (CI only; never deployed)
        run: npm run build:perf --workspace=@agent-office/estate
        # Separate build target / entry. Must not land in the live dist or Pages/Worker deploy.

      - name: SRI / self-host check
        run: node .github/scripts/check-self-hosted.mjs packages/estate

      - name: Secret scan
        env:
          GITLEAKS_VERSION: "<pinned version>"
          GITLEAKS_SHA256: "<published sha256 for linux x64>"
          BASE_SHA: ${{ github.event.pull_request.base.sha }}
          HEAD_SHA: ${{ github.event.pull_request.head.sha }}
        run: |
          curl -sSfL -o gitleaks.tgz "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz"
          echo "${GITLEAKS_SHA256}  gitleaks.tgz" | sha256sum -c -
          tar -xzf gitleaks.tgz gitleaks
          ./gitleaks dir . --redact --no-banner
          if [ -n "$BASE_SHA" ]; then
            ./gitleaks git . --log-opts="${BASE_SHA}..${HEAD_SHA}" --redact --no-banner
          fi
```

`--redact` keeps any hit out of the public log. If a hit happens, Cursor follows standing rule 5 (post only "security issue found, needs Security Bot").

---

## 4. Auto-merge workflow (`auto-merge.yml`)

### 4.1 Hard rules
- Triggered only by `workflow_run` for the `CI` workflow, type `completed`. GitHub always runs this from `main`'s copy of the file, so a PR cannot change what it does.
- `permissions: contents: write, pull-requests: write`. Nothing else.
- **It never checks out, installs, builds or runs PR code.** No `actions/checkout`, no `npm`, no scripts from the PR. Its only steps are GitHub API calls.
- It reads its own config (`protected-paths.txt`, `config.json`) through the API **from `main`**, never from the PR branch.
- It never prints PR file contents, patches or comments to the log.

### 4.2 Merge only when ALL of these are true

Check them in this order. If any check fails, log one short line saying which check failed (no file contents) and stop without merging. Only the merge failure in 4.4 posts a comment.

1. `AUTO_MERGE_ENABLED` repository variable is `true`.
2. The CI run's `event` is `pull_request`, its `conclusion` is `success`, and its workflow file `path` is `.github/workflows/ci.yml`.
3. The CI run's head repository is this repository (no forks).
4. Exactly one **open** PR matches the CI run (same head branch, same head repository, base `main`).
5. The PR's head repository full name equals the base repository full name (no forks).
6. The head branch starts with one of `allowedBranchPrefixes` (`cursor/`). Secondary: if `allowedAuthors` is non-empty, the PR author's login is on it.
7. The PR is not a draft.
8. The PR's base branch is `main`.
9. The PR does not carry the `hold` label.
10. The PR's current head SHA equals the CI run's head SHA (nothing was pushed after CI ran).
11. No changed file matches a protected glob. For renamed files, check both the new and the old path. If the PR changes 3,000 files or more (the API's limit), treat it as protected.
12. Special rule for `docs/estate-roadmap.md` (section 4.3).
13. The PR is not known to be unmergeable (`mergeable` is not `false`).

### 4.3 The roadmap checkbox rule

Task PRs tick their own checkbox in `docs/estate-roadmap.md`, but the rules sections of that file are protected. Glob matching works per file, not per section, so:
- If `docs/estate-roadmap.md` is in the changed files, read its `patch` from the PR files API.
- Allowed only if the roadmap file's diff is **exactly one `- [ ]` → `- [x]`** and nothing else:
  - the file's status is `modified` (not added, renamed or deleted), and the API reports exactly 1 addition and 1 deletion;
  - the patch has exactly one removed line and one added line;
  - the removed line starts with `- [ ] `, and the added line is byte-for-byte the same line with that one space changed to `x` (same length, every other character identical, including trailing spaces).
- The tick may come in the same PR as the task's own code changes. Those other files are checked normally against the protected list; the special rule only decides whether the roadmap file itself is acceptable.
- Anything else (other edits, more than one tick, unticking, missing or truncated patch, file renamed or deleted) means the PR is protected.
- To keep this rule sound, only section D of the roadmap may use `- [ ]` checkboxes. Sections A, B, C and E must use numbered or plain lists.

### 4.4 Merging
- Squash merge through the API, passing the CI run's head SHA as `sha`. GitHub then refuses the merge if the head moved, which closes the gap between checking and merging.
- If the merge call fails (conflict, ruleset refusal or anything else): post **one** comment on the PR and stop. The comment has a hidden marker with the head SHA (`<!-- estate-auto-merge:<sha> -->`). Before posting, check for that marker so the same head SHA never gets a second comment. After Cursor rebases and CI passes on the new SHA, auto-merge tries again.
- The comment is generic and has no error text from the API: "Auto-merge could not merge this PR at <short sha>. It may conflict with `main`. Please rebase; auto-merge will try again after CI passes."
- It never retries in a loop, never force-pushes, never updates the branch and never re-runs CI.

### 4.5 YAML sketch

```yaml
name: Auto-merge

on:
  workflow_run:
    workflows: [CI]
    types: [completed]

permissions:
  contents: write
  pull-requests: write

concurrency:
  group: auto-merge-${{ github.event.workflow_run.head_branch }}
  cancel-in-progress: false

jobs:
  merge:
    if: >-
      vars.AUTO_MERGE_ENABLED == 'true' &&
      github.event.workflow_run.event == 'pull_request' &&
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.path == '.github/workflows/ci.yml' &&
      github.event.workflow_run.head_repository.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      # No checkout. No install. API calls only.
      - uses: actions/github-script@<full-commit-sha> # v7
        with:
          script: |
            const run = context.payload.workflow_run;
            const { owner, repo } = context.repo;
            const full = `${owner}/${repo}`;

            // Config always comes from main, never from the PR.
            async function readMain(path) {
              const { data } = await github.rest.repos.getContent({ owner, repo, path, ref: 'main' });
              return Buffer.from(data.content, 'base64').toString('utf8');
            }
            const cfg = JSON.parse(await readMain('.github/auto-merge/config.json'));
            const globs = (await readMain('.github/auto-merge/protected-paths.txt'))
              .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
            if (!globs.length || !cfg.allowedBranchPrefixes?.length) return core.setFailed('auto-merge config missing');

            const toRe = g => new RegExp('^' + g
              .replace(/[.+^${}()|[\]\\]/g, '\\$&')
              .replace(/\*\*\//g, '\u0000')
              .replace(/\*\*/g, '\u0001')
              .replace(/\*/g, '[^/]*')
              .replace(/\?/g, '[^/]')
              .replace(/\u0000/g, '(?:.*/)?')
              .replace(/\u0001/g, '.*') + '$');
            const res = globs.map(toRe);
            const isProtected = p => res.some(r => r.test(p));
            const stop = why => core.info(`skip: ${why}`);

            // Find the one open PR for this CI run.
            const prs = await github.paginate(github.rest.pulls.list, {
              owner, repo, state: 'open', base: cfg.baseBranch, head: `${owner}:${run.head_branch}`,
            });
            if (prs.length !== 1) return stop('no single open PR for this run');
            const { data: pr } = await github.rest.pulls.get({ owner, repo, pull_number: prs[0].number });

            if (pr.head.repo?.full_name !== full || pr.base.repo.full_name !== full) return stop('fork');
            if (!cfg.allowedBranchPrefixes.some(p => pr.head.ref.startsWith(p))) return stop('branch prefix');
            const authors = cfg.allowedAuthors ?? [];   // optional, secondary
            if (authors.length && !authors.includes(pr.user.login)) return stop('author not allowed');
            if (pr.draft) return stop('draft');
            if (pr.base.ref !== cfg.baseBranch) return stop('base is not main');
            if (pr.labels.some(l => l.name === cfg.holdLabel)) return stop('hold label');
            if (pr.head.sha !== run.head_sha) return stop('head moved since CI');

            const files = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number: pr.number, per_page: 100 });
            if (files.length >= 3000) return stop('too many files');
            for (const f of files) {
              if (f.filename === cfg.roadmapPath || f.previous_filename === cfg.roadmapPath) {
                if (!checkboxOnly(f)) return stop('roadmap change is not a single checkbox tick');
                continue;
              }
              if (isProtected(f.filename) || (f.previous_filename && isProtected(f.previous_filename))) {
                return stop('protected path');
              }
            }
            if (pr.mergeable === false) return failOnce();

            try {
              await github.rest.pulls.merge({ owner, repo, pull_number: pr.number, sha: run.head_sha, merge_method: 'squash' });
              core.info(`merged #${pr.number}`);
            } catch (e) {
              return failOnce();
            }

            function checkboxOnly(f) {
              if (f.status !== 'modified' || !f.patch) return false;
              if (f.additions !== 1 || f.deletions !== 1) return false;
              const body = f.patch.split('\n').filter(l => !l.startsWith('@@') && !l.startsWith('\\'));
              const minus = body.filter(l => l.startsWith('-')).map(l => l.slice(1));
              const plus = body.filter(l => l.startsWith('+')).map(l => l.slice(1));
              if (minus.length !== 1 || plus.length !== 1) return false;
              const [a, b] = [minus[0], plus[0]];
              if (!a.startsWith('- [ ] ') || a.length !== b.length) return false;
              // Exactly one character differs: position 3, ' ' -> 'x'.
              const diffs = [...a].reduce((n, ch, i) => n + (ch !== b[i] ? 1 : 0), 0);
              return diffs === 1 && b.startsWith('- [x] ');
            }

            async function failOnce() {
              const mark = `<!-- estate-auto-merge:${run.head_sha} -->`;
              const comments = await github.paginate(github.rest.issues.listComments, { owner, repo, issue_number: pr.number });
              if (comments.some(c => c.body?.includes(mark))) return;
              await github.rest.issues.createComment({
                owner, repo, issue_number: pr.number,
                body: `${mark}\nAuto-merge could not merge this PR at ${run.head_sha.slice(0, 7)}. ` +
                      'It may conflict with `main`. Please rebase; auto-merge will try again after CI passes.',
              });
            }
```

This is a sketch. Cursor should move the matcher and `checkboxOnly` logic into a small tested module only if it can be loaded **from `main`** without checking out the PR (for example, keep it inline as above, and copy the same logic into a vitest test under `.github/` for coverage).

### 4.6 Known GitHub behaviours to plan around
- A merge made with the built-in workflow token does **not** start new workflow runs, so the `push` to `main` after an auto-merge will not run CI. Optional: add a nightly `schedule` run of CI on `main`.
- `workflow_run` only fires once `auto-merge.yml` exists on `main`. Nothing auto-merges until the CI PR is merged.
- CI runs on the PR merged with the `main` of that moment. If `main` moves later, the squash merge is not re-tested. This is accepted for small PRs; the nightly run catches drift.

---

## 5. Repository settings and ruleset (set by Grok Bot)

Set after the CI PR is merged and the `estate` check has run at least once (so the check name exists).

**Ruleset on `main`** (Settings → Rules → Rulesets, target `main`, enforcement Active):
- Require a pull request before merging, with **0** required approvals (no stale-review dismissal, no code-owner review, no last-push approval needed).
- Require status checks to pass: `estate` (source: GitHub Actions). Do not require "branch up to date" for now.
- Block force pushes.
- Restrict deletions.
- **No bypass actors** (bypass list empty).
- Allowed merge method: squash.

**Repository settings:**
- Actions → General → Workflow permissions: "Read repository contents and packages permissions" (read-only by default; the auto-merge workflow asks for its two write permissions itself).
- Actions → General: leave "Allow GitHub Actions to create and approve pull requests" **off**.
- Actions → General: require approval for workflows from outside collaborators / forks.
- Pull requests: allow squash merging.
- Variables: add `AUTO_MERGE_ENABLED` = `true` only when everyone is ready.

---

## 6. The CI PR itself is protected

The CI PR (PR #5) changes `.github/workflows/**`, adds `.github/auto-merge/**` and the lockfile, touches `package.json` (including the pinned Playwright `devDependency`), and wires Chromium install plus the perf-page build into the CI job only. All of these are protected paths. So:
- It stays a **draft**, and Security Bot reviews it.
- A person merges it by hand after Security Bot clears it.
- Auto-merge can only start after it is on `main`, the ruleset in section 5 is set, and `AUTO_MERGE_ENABLED` is `true`.

---

## 7. Acceptance checklist for the CI PR

- [ ] `ci.yml`: `pull_request` + `push` to `main` triggers, `ready_for_review` included, `permissions: contents: read`, no `secrets.`, `persist-credentials: false`, actions pinned by SHA.
- [ ] CI runs lint, tsc, estate tests, estate-server tests, leak tests by name, live build, separate perf-page build (CI only), SRI/self-host check and secret scan, all in job `estate`.
- [ ] Playwright is a pinned exact-version `devDependency`; CI installs only Chromium, only in the job, with a read-only token and no secrets. The live build and Pages/Worker deploy never include the perf page.
- [ ] `npm ci --ignore-scripts` works with the committed lockfile.
- [ ] `auto-merge.yml`: `workflow_run` on `CI` completed, `contents: write` + `pull-requests: write` only, no checkout or install step, config read from `main`.
- [ ] All 13 merge conditions in 4.2 are coded (branch prefix `cursor/` + same repo as the main identity check; author list optional), plus the one-character checkbox rule in 4.3.
- [ ] Squash merge passes `sha`; a failed merge posts one comment per head SHA and stops.
- [ ] `protected-paths.txt` matches roadmap section B, line for line in meaning.
- [ ] Glob matcher and checkbox rule have unit tests with made-up paths, including `tsconfig*.json`, `index.html`, `wrangler.toml` and leak fixtures.
- [ ] Leak tests / bundle scan fail on `secrets.` in `ci.yml` or `pull_request_target` in any workflow, and fail if the live bundle contains the perf page, its made-up test data, or Playwright.
- [ ] PR description lists every new dependency (Playwright, exact pinned version) and states that the PR is protected and waiting for Security Bot.
