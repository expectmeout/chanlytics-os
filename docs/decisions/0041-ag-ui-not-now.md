# 0041 · AG-UI not now; Ask kept AG-UI-shaped

**Status:** Decided, 9 October 2026, with the moment spec
(`docs/superpowers/specs/2026-10-09-a-moment-holds-many-campaigns-design.md`, decisions D4 and D34, approved by Ruben
the same day): Ask adopts no agent-to-frontend protocol; nothing to build. Written against `7ff179717` (main, 9 October
2026), and Ask's limits read again on the branch `campaigns/a-moment-holds-many` on 10 October 2026. Where this note
and the code disagree, the code wins.

## Context

Ruben asked, of a setup Ask runs while the owner approves each step, whether AG-UI is needed. Read on 9 October 2026
(`Claude Video/research_notes/Campaigns ledger backend and Ask flow/ag_ui_protocols.md`, outside the repository):

- AG-UI is CopilotKit's MIT-licensed event protocol between an agent and its app, at 1.0.0 since 17 September 2026: a
  run's lifecycle, streamed text and tool calls, shared state as JSON Patch, frontend-only plan messages, interrupts.
- `@ag-ui/client` 1.0.2 weighs 65,096 bytes gzipped with rxjs, zod 3 and protobuf; the dashboard's route had 1,863
  bytes of JS room under its 768,000-byte ceiling on main at `7ff179717`
  (`tooling/scripts/tests/baselines/bundle-budget.json`).
- Its shared state and frontend tools reverse two written rules: the tab sends ids the server reads again under RLS and
  believes nothing else, and every act is a card approved through its verb's route
  (`docs/superpowers/specs/2026-09-25-ask-rewired-design.md`, §7).
- Ask already holds the hard half with stronger guarantees: NDJSON lines (`apps/dashboard/app/api/v1/ask/route.ts`),
  cards committed with a role re-check, a key, a ledger line, an undo and a lapse
  (`apps/dashboard/src/legacy-bridge/ask/commit.ts`, `packages/contracts/src/ask-proposals/spec.ts`).
- AG-UI lifts none of Ask's real limits: three rounds, 45 seconds, 4,000 tokens a round, a 60-second function
  (`ASK_MAX_ROUNDS`, `ASK_TURN_BUDGET_MS` and `ASK_MAX_TOKENS` in `packages/contracts/src/ask/ask.ts`; the route's
  `maxDuration`).

## Decision

1. No agent-to-frontend protocol now, AG-UI's or another's; no new dependency for it.
2. Ask stays AG-UI-shaped: a new line or card that does what AG-UI names takes AG-UI's word for it (a step, a plan, an
   interrupt that a run ends on and the next carries the answer of), so the vocabulary maps one to one if it is ever
   needed.
3. The way back is a translation endpoint on the server alone, adding no browser bytes, if Ask ever needs a second
   client.

## What would reopen it

Ask outside the dashboard: the paused phone app, a chat app to the owner, or a host such as Claude or ChatGPT. Then a
server-side AG-UI endpoint is compared with MCP Apps for that host; the dashboard's Line stays as it is.

## What comes next instead

The setup lane after the evals (the spec's M1–M5, each on evidence): a compact plan the server expands; "Step n of N"
and "Approve the rest" for steps that send nothing; progress updates as trace lines; the ledger marking the row a card
made; a typed choice only if two next questions fail.
