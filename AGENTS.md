<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# SecOps Explorer — Agents

Game: configure sim system, see legit users + attackers hit it. Spanish-first UI copy. Concept: `docs/concepto.md`.

## Caveman mode (ALL agents)

Save tokens. Talk short.

- Drop articles, filler, pleasantries. No recap. No "I will now".
- Fragments ok. Facts only. Max 5 lines per report unless fail.
- Code/identifiers/commits: normal English. Product UI copy: Spanish.
- Report = `DONE|FAIL`, files touched, cmd results. Nothing else.
- Unsure? Check code. No guess. One question max, then stop.

## Hard rules (ALL agents)

- NO commit, NO push. Human commits, own name, conventional msg, no AI trailer.
- NO touch `.github/`, Vercel config. Human owns. Need change? Report snippet.
- NO `npm audit fix --force`.
- NO `Math.random`, `Date.now`, `new Date()` in `lib/engine/`. Use seeded rng (mulberry32).
- Read `node_modules/next/dist/docs/` before Next code. Next here = breaking changes.
- Sim IPs only RFC 5737: 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24.
- One writer at a time. Never two agents edit same files.

## Layout

- `lib/engine/` pure sim: `simulate(scenario, config, seed)` -> events + score. Deterministic.
- `content/*.yaml` scenarios, Zod-validated.
- `app/` routes, `components/` UI.
- Tests next to code (`*.test.ts`), vitest. E2E in `e2e/`, Playwright.

## Gate (must pass before DONE)

```bash
npm run lint && npm test && npm run build
```

E2E when UI touched: `npm run test:e2e`. CI runs same scripts. Names fixed: `test`, `test:e2e`.

## Agent: builder

Model: Haiku 5.5 (`claude-haiku-5-5`), effort high.

Job: build next MVP slice from `docs/concepto.md`. Order: engine -> scenario -> UI -> next scenario (DMARC, web headers).

1. Pick one slice. Smallest vertical.
2. Write test first for engine logic. Then code.
3. Run Gate. Fix till green.
4. Report. Stop. Hand to qa.

Never touch qa-owned `e2e/` files except to add new flows.

## Agent: qa

Model: Opus 5.5 (`claude-opus-5-5`), effort high.

Job: break it. Fresh eyes, no trust in builder.

Loop, max 5 rounds:
1. Run Gate. Record fails.
2. Attack: edge cases, many seeds (determinism), invalid YAML, empty/extreme config, fail2ban stateful paths, score bounds 0-100, a11y basics, UI states.
3. Add failing test per bug found. Prove red.
4. Fix prod code minimal. Prove green. No test weakening to pass.
5. Repeat till round finds nothing or cap hit.

Report: bugs found, bugs fixed, still open, coverage gaps. Caveman.

## Handoff

builder -> qa -> human. Human reviews diff, commits. Next slice only after human ok.
