# Ask Rewired, Phase 3: the registry and the specs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** one definition per tool and one spec per card. A tool is a zod input, a handler and a label in a file of its
own, its JSON schema generated from the zod and its input checked before it runs; dispatch is a map. A card is one
object in contracts that says who may approve it, which route commits it and with what body, how it undoes, where it
opens and what its receipt says; the committer walks it. Then, measured, the model gets the descriptions the docs ask
for and a tool set held under twenty.

**Architecture:** `server/ask/tools/` replaces `tools.ts` (1,243 lines) and `proposals.ts` (1,214): `registry.ts`
(`defineRead`, `defineAct`, `toApiTools(role)`, `runTool`, `buildProposal`), `context.ts` (the tool context and its
helpers), `read/` and `act/` (one file per tool family, each under 400 lines). `packages/contracts/src/ask-proposals.ts`
holds `PROPOSAL_SPECS`, and `PROPOSAL_GATE`, `askUndoOpen` and `cardOpenRoute` become readings of it;
`legacy-bridge/ask/commit.ts` becomes a walk. The route keys reach contracts as a generated, import-free list.

**Tech stack:** TypeScript 5.9, zod 4.6.5 (`z.toJSONSchema`, installed and unused today), Next 16 route handlers, the
typed client (`client/api.ts` over `client/routes.generated.ts`), `node --test` over `_fake-db.mjs` and the fake fetch of
`ask-commit.test.mjs`. Runner flags for any suite that imports `.ts`:
`node --conditions=react-server --import tsx --test <files>`.

**Spec:** `docs/superpowers/specs/2026-09-25-ask-rewired-design.md` §5.3, §5.4, §5.5 (rounds and ceiling), §5.9, §6,
§9 (Phase 3). Written against `origin/main` at `0c136563` (#1150, PR 2.4; 26 Sep 2026) after a three-part map read at
that commit (the tools; the cards' commit path; the tests, evals and telemetry that pin both). Phase 2 plan:
`docs/superpowers/plans/2026-09-26-ask-rewired-2-page-context.md`.

---

## Where this fits, and what the code map found

Phase 2 put the page before the question. Phase 3 is the recode of what the model can call and what a person can
approve. The map corrected the spec in twelve places; the ones that shape this plan:

1. **Twenty-six tools, in two files, behind two switches.** Fourteen reads in `tools.ts:108-197` (dispatch `runTool`,
   `:1179-1243`, labels `:813-832`) and twelve acts in `proposals.ts:108-312` (dispatch `buildProposal`, `:1154-1195`,
   labels `:1197-1214`). `obj()` is written twice (`tools.ts:101-106`, `proposals.ts:96-101`); `UUID` and `str()` too.
   The spec's "14 read · 12 act" is right; its tool table (§5.3) is the target, not today.
2. **Nothing is checked before a tool runs.** `argsOf` (`loop.ts:467-474`) parses the JSON and each handler coerces by
   hand. Two acts already parse with zod (`AskSettingsChangeSchema`, `contracts/ask.ts:812`; `ProposeLeadSearchSchema`,
   `lead-plan.ts:137`, after hand normalising, `proposals.ts:1084-1102`). The schemas and the code disagree in places:
   `filter` on list_threads and list_calls, `day` and `service` on get_openings and `day` on get_calendar are required
   in the schema and defaulted in the code; get_calendar's `days` is a `number` clamped to 1..14 by hand.
3. **The loop is the per-tool field filter, not the edge.** `loop.ts:529` rebuilds each tool as
   `{name, description, input_schema}`; the edge forwards `tools` as sent (`apps/edge/lib/ask-gateway.ts:230`, at most
   `GATEWAY_MAX_TOOLS = 40`) and sends no `anthropic-beta` header (`api/admin/llm.ts:91-96`). `input_examples` is a
   documented optional tool property (define-tools and tool-reference pages, read 25 Sep 2026, primary-sources §1,
   no beta named); the dashboard alone decides whether it is sent.
4. **`z.toJSONSchema` is not byte-equal to the hand-written schemas.** Measured at `0c136563`: it adds `$schema`, puts
   the safe-integer bounds on every `.int()`, writes a union of literals as `anyOf` of `const`s, and orders an optional
   field's keys `description` before `type`. A generated schema needs one normaliser, and "the same schema" is proven as
   data (deep-equal), with the key order inside each schema the only bytes that move.
5. **Roles.** A viewer gets no act tool; an operator gets all twelve, the three owner-only ones included
   (`loop.ts:346`). No builder checks the role but `propose_lead_search` (`proposals.ts:1077`); an operator can be
   handed a person_mode, settings or invite card that the client gates and the route refuses. On the client `p.needs`
   is never read: the gate is `PROPOSAL_GATE` (`contracts/ask.ts:226-239`), and every gate's role equals its card's
   `needs` today.
6. **The route keys live in the dashboard only.** `RouteKey = keyof Routes` (`client/api.ts:16`) over
   `client/routes.generated.ts`, whose `Routes` type imports the route files; contracts depends on zod alone and knows no
   route key. `ProposalSpec.commit.route: RouteKey` (§5.4) cannot be typed in contracts as written. The generator's
   `ROUTES` object is already import-free, and `gen-schema-sets.mjs` is the precedent for a generated file in contracts.
7. **What does not fit §5.4's sketch** (`commit: {route, params, body}`, `receipt(p, data)`):
   - the route depends on the payload: a thread verb picks its route by verb (`resolve` by `escalation_id`), a lead
     search by `amends` (`commit.ts:118-121, 263-283`);
   - settings reads the tab's `__SETTINGS` before it sends and before it undoes (`commit.ts:191-199, 358-364`);
   - a deal with a next step makes two calls, the second needing the first answer's `deal.id` (`commit.ts:168-172`);
   - some commits send window events (`surface:clients`, `note:saved`);
   - some receipts read the answer (broadcast `name`, `recipient_count` and `was`; playbook `name`);
   - the undo record is built per kind, and `undoOf` is left off for policy and settings, whose routes answer no
     decision id.
8. **The wake card's undo is offered and always refused.** `INVERSE.wake = "snooze"` (`commit.ts:56-57`) with
   `until: null` posts `{until: ""}`, which core's snooze refuses (`NEEDS_UNTIL`,
   `packages/core/src/conversations/snooze.ts:20-21`); the card shows "Snooze again" for ten minutes. `ask-commit.test.mjs:240-244`
   pins the broken record. §5.4 already decides it: the wake spec declares no undo.
9. **The reply's voice is read and dropped.** `draft_reply` requires `voice` (`proposals.ts:112-119`), the builder puts
   it on the payload (`:386`), and nothing reads it: `commit.ts:91-94` sends `{text}`, and the route's `ReplyBody` is
   `.strict()` without it (`reply/route.ts:28-44`), so sending it today would be a 400. Every dashboard reply is the
   person's own voice: core claims the thread, takes control and sends as `human` (`core/conversations/reply.ts:452-490`).
   What a receptionist-voiced reply should do (claim or not, pause or not, which sender) is written nowhere.
10. **The reply card sends no idempotency key.** The Inbox composer sends one (`legacy-bridge/inbox-verbs.ts:224, 237`;
    the route reads the `idempotency-key` header, `reply/route.ts:73`); Ask's card does not, so a double press on
    Approve could queue two replies.
11. **The Approve control is gated the way the shell forbids.** `ask-turn.jsx:126` uses `disabled` and `title`;
    `apps/dashboard/src/legacy/CLAUDE.md` ("Role gates") requires `window.gate(...)`.
12. **The blast radius of a rename.** The 26 names appear about 230 times in `ask-turn.test.mjs`, in 36 of the 59 eval
    cases (84 entries of `expect.tools_any`, judged as literal strings, `eval-ask.mjs:281-287`), 19 times in
    `prompt.ts`, 16 in `cross-page.ts` and in the prompt's own bytes (`read://<name>` blocks). No stored-telemetry reader
    keys on them: `ask-day.mjs` reads none of `content.tools`, `shape.tools_ms` or `shape.cross_page`. Eighteen
    source-text reads in four suites break when the two files move (`ask.test.mjs` 11 sites, `broadcasts` 3, `calendar`
    1, `playbooks` 3), among them the tool-count regex (`ask.test.mjs:1151`) and the `case "…":` dispatch regexes.

Sizes at `0c136563` (ceiling 400): `tools.ts` 1,243, `proposals.ts` 1,214, `loop.ts` 790, `prompt.ts` 405,
`commit.ts` 390, `contracts/ask.ts` 927, `contracts/ask-answer.ts` 889.

## Decisions this plan takes (Ruben may overrule any; each names its PR)

| #   | Decision | Why | PR |
| --- | -------- | --- | -- |
| D1  | The registry lands as a move: the same 26 tools, names, order and descriptions, their schemas generated from zod and deep-equal to today's (a frozen fixture of `0c136563`'s tools, both roles). The model's request moves only in key order inside each schema. | One change at a time: the registry is proven by the fixture, before anything the model reads changes. | 3.1 |
| D2  | A tool's input is parsed by its zod before it runs; a failure goes back as `{error: "<tool>: <the zod issues>"}` with `is_error`, which the model corrects in one cheap retry (§5.3). The schemas as written are the contract: a test that sent an input the schema refuses is corrected, named. The handlers keep their defaults. | The spec's rule; the model is shown the schema, so an input it refuses is a mistake to say, not to guess past. | 3.1 |
| D3  | One normaliser turns zod into the tool's JSON schema: `$schema` dropped, the safe-integer bounds dropped, a union of same-typed literals written as `{type, enum}`, keys in one order. Deterministic: two calls give the same bytes. | Finding 4; the tools block is the cache's first prefix. | 3.1 |
| D4  | Files: `server/ask/tools/{registry,context,index}.ts`, `read/` and `act/` one file per family (reads: today, threads, people, calls, report, settings, calendar, campaigns, leads; acts: reply, thread-verb, person, deal, policy, settings, whisper, invite, broadcast, playbook, lead-search). `tools.ts` and `proposals.ts` go; every importer moves to `tools/index.ts`. | §6's tree; each file under 400 lines. | 3.1 |
| D5  | The route keys reach contracts generated: `gen-route-types.mjs` also writes `packages/contracts/src/route-keys.generated.ts` (`ROUTE_KEYS` as const, `type ApiRouteKey`), import-free; `--check` and `route-types.test.mjs` hold both files. `Input<K>` stays in the dashboard; the walk casts, as `commit.ts` does today. | Finding 6; the `gen-schema-sets` precedent. | 3.2 |
| D6  | `ProposalSpec` answers finding 7: `commit(p, tab)` returns a call or a refusal in words (the route may depend on the payload; `tab` carries the settings the tab holds); `then?(p, data)` a second call (the deal's step); `events?`; `receipt(p, data, then?)`; `undo?: { label(p), window: "cancelable" \| "ten_minutes" \| "version", record(p, data), call(record) }`; `open(p, outcome)`. A flat file, `contracts/src/ask-proposals.ts` (Phase 2's D5). | The table is the shape the cards already have; nothing forced into a field it does not fit. | 3.2 |
| D7  | One source for what server and client both say: the act tools take `needs` and the undo label from the spec, and refuse a person below the spec's `needs` in words ("only an owner can…"), as the route would. `PROPOSAL_GATE`, `askUndoOpen` and `cardOpenRoute` keep their names and answers, derived from the specs. | Finding 5; a card the route will refuse is never drawn. | 3.2 |
| D8  | The wake spec declares no undo (§5.4); the reply spec sends the card's id as the idempotency key (a double press queues one reply); the Approve control is gated with `window.gate` (the shell's rule). | Findings 8, 10, 11. | 3.2 |
| D9  | Descriptions at the documented length (what it reads, when to call it and when its sibling, what it returns, its limits), the tool-specific rules moved out of `ASK_RULES` into them, and `input_examples` on the tools whose inputs have a shape (a day, a window, a list token, a change, a plan). A 400 naming `input_examples` is asked once more without them (logged `ask_examples_rejected`), as Phase 2's D14 does for the data blocks. | §5.3, primary-sources §1; the edge forwards the field and sends no beta header (finding 3), so a refusal must never cost the turn. | 3.3 |
| D10 | §5.5 lands with D9: rounds 4 → 3 (the last still forced to answer) and the round ceiling 2,000 → 4,000 (`ASK_MAX_TOKENS`; the edge clamps to the same contracts number, so an older edge clamps to 2,000 and nothing refuses). | Phase 2's D15 deferred them to this phase; the lead plan's card was cut at 2,000. | 3.3 |
| D11 | The reads consolidate under `action` to nine (today, inbox {list, thread}, people {search, get}, calls {list, get}, report, calendar {week, openings}, campaigns {audiences, playbooks}, leads {searches}, workspace {settings}) and the acts by card family to ten (propose_reply {draft, steer}, propose_thread_verb, propose_person, propose_deal, propose_autonomy, propose_settings, propose_whisper, propose_team, propose_campaign {broadcast, playbook}, propose_lead_search): nineteen, sorted by name. The turn records `name.action`. | §5.3's target, held under the documented twenty before Phase 4 adds its readers; at 26 plus Phase 4's families the set would sit in the 30–50 band where selection degrades. | 3.4 |
| D12 | Owner-only act tools are offered to owners only: three prefixes (viewer, operator, owner), each deterministic. | Finding 5; an operator is never handed a card nobody on the call can approve, and the cache holds per role as it does. | 3.4 |
| D13 | The rename is carried through in one PR: the eval cases rewritten by a committed mapping (old name → `name.action`), `cross-page.ts`, `scopedRead`, the prompt and `docs/system-prd.md` (whose "fourteen tools" is already stale). The judge also reads the old names through the mapping, so PR 2.3's baseline stays comparable. | Finding 12. | 3.4 |
| D14 | `detail: "concise" \| "full"` waits for Phase 4, where results grow; today only get_thread has a full form (`more`), and it keeps it. | One change to the request at a time; nothing today needs it. | — |
| D15 | The voice is Ruben's to define before any code: what a reply in the receptionist's voice does (claims the thread or not, pauses the receptionist or not, the sender it is stored under). Until then the reply spec carries `voice` and the route does not take it. PR 3.5 is written when he has said. | Finding 9: it changes the one send door (`deliver.ts`) and what a customer receives. | 3.5 |
| D16 | PRs 3.3 and 3.4 change what the model reads; they go up green and wait for Ruben's word (his eval re-run against PR 2.3's baseline, or his go-ahead without it, as with PR 2.4). PRs 3.1 and 3.2 change nothing the model reads and merge on green. | They spend nothing to prove; the two that do are his to run. | 3.3, 3.4 |

### The spec amendments this plan makes (in the plan's PR)

- §5.3: the registry lands as a move first (D1), with the normaliser (D3); descriptions and examples (D9), then the
  consolidation (D11) and owner-only acts to owners (D12); `detail` waits for Phase 4 (D14).
- §5.4: the spec's shape as D6 (payload-dependent routes, tab state, a follow-on call, events, per-kind undo records);
  the route keys in contracts are generated (D5); the voice waits for Ruben (D15).
- §9 Phase 2 closed, and Phase 3 as five PRs, as below.

## How every PR is proven (the same six checks, then each PR's own)

1. `corepack pnpm -r typecheck`; `corepack pnpm lint` (0 errors); `node tooling/scripts/gen-route-types.mjs --check`;
   `corepack pnpm format:check`.
2. The full `corepack pnpm test`; the harness suite (`ask-turn.test.mjs`) runs every request the loop sends through a
   scripted model and asserts on `s.requests[i]`.
3. Contracts changes: dists rebuilt after formatting and committed (`corepack pnpm --filter "./packages/*" build`, then
   `git status` shows no drift).
4. `git diff origin/main --stat` limited to the PR's named files.
5. The model's request: a PR that must not change it proves it (3.1: the tools deep-equal the frozen fixture, the
   system and messages byte-equal over the harness fixtures; 3.2: `s.requests[0]` byte-equal); a PR that changes it
   names every byte that moved.
6. Text pins converted to behaviour where a PR moves the text; `source-scan-baseline.json` only falls; a new suite
   reads no source text.

Each PR: its own worktree from that day's `origin/main`; one implementer; one combined review round; squash-merge on
green (3.3 and 3.4 wait for Ruben, D16). Before every push: `git fetch origin main`, rebase, and check
`git diff origin/main --stat` lists only this PR's files.

---

# PR 3.1 · The registry, a move

**Branch:** `ask-rewired/3-1-registry`. The same 26 tools, through one registry. The model's request moves only in key
order inside each tool's schema.

### Task 1: Freeze today's tools

- [ ] On `0c136563`, write `tooling/scripts/tests/fixtures/ask-tools-0c136563.json`: `{ viewer, operator }`, each the
      array the loop sends (`{name, description, input_schema}` in order), dumped from `READ_TOOLS` and `ACT_TOOLS`.
      The fixture is data; the suite that reads it reads no source.

### Task 2: The registry and the context

- [ ] `tools/context.ts`: `ToolContext`, `ToolRun`, `ToolOutcome`, `newToolContext`, and the helpers today written
      twice (`UUID`, `str`, `json`, `unread`, `unlessNotFound`), once.
- [ ] `tools/registry.ts`:
  - `defineRead({ name, description, input, label, run })` and `defineAct({ name, description, input, label, build })`,
    `input` a zod object;
  - `toolSchema(zod)`, the normaliser (D3);
  - `READ_TOOLS` and `ACT_TOOLS` as today's `ToolDef[]`, generated, in today's order;
  - `runTool(t, run)` and `buildProposal(t, name, input)`: a map lookup, the zod parse (D2), the handler, and today's
    failure words (`unknown tool …`, `that read failed; …`, `that could not be checked; …`) and labels.
- [ ] `tools/index.ts`: the exports `loop.ts` and the suites use.

### Task 3: The handlers move

- [ ] Each read family to `tools/read/<family>.ts` and each act family to `tools/act/<family>.ts`, the code moved
      whole: same queries, same result shapes, same refusals. A handler takes the parsed input.
- [ ] The two acts that parsed with zod keep their contracts schemas as their input (settings), or wrap them (the lead
      search's hand normalising becomes a zod `preprocess`, its refusal words kept).
- [ ] `loop.ts` imports from `tools/index.ts`; `tools.ts` and `proposals.ts` are deleted.

### Task 4: The proof

- [ ] `ask-registry.test.mjs` (new, no source reads):
  - the generated tools for a viewer and an operator deep-equal the fixture, name by name;
  - `toApiTools` twice gives the same bytes;
  - every tool's schema equals `toolSchema` of its zod (the spec's proof);
  - an input a schema refuses comes back as the zod's words with `is_error`, and the handler never runs;
  - an unknown tool is refused as today.
- [ ] The eighteen source-text reads that pin the two files become behaviour (the tool is in the registry and runs;
      the switch regexes become "the registry dispatches it"); the tool-count regex becomes a count of the registry.
      `source-scan-baseline.json` falls for `ask.test.mjs`, `broadcasts`, `calendar` and `playbooks`.
- [ ] A suite input the schema refuses (get_calendar `{days: 3}` without `day`) is corrected, named in the PR.

### Task 5: Gates and the PR

- [ ] The six checks; `s.requests[0]`'s `system` and `messages` byte-equal to main's over the harness fixtures, its
      `tools` deep-equal.

# PR 3.2 · The route keys in contracts, and one spec per card

**Branch:** `ask-rewired/3-2-specs`. Nothing the model reads changes. The cards commit, undo and open from their specs.

### Task 6: The route keys (D5)

- [ ] `gen-route-types.mjs` writes `packages/contracts/src/route-keys.generated.ts`; the barrel exports
      `ROUTE_KEYS` and `ApiRouteKey`; `--check` covers it; `route-types.test.mjs` holds it equal to the dashboard's.

### Task 7: The specs (D6, D7, D8)

- [ ] `contracts/src/ask-proposals.ts`: `ProposalSpec`, `PROPOSAL_SPECS` for the twelve kinds, from today's
      `commit.ts` behaviour kind by kind (the map's table). The wake spec has no undo; the reply spec sends the card's
      id as the idempotency key.
- [ ] `PROPOSAL_GATE`, `askUndoOpen` and `cardOpenRoute` derived from the specs, same answers (the wake undo aside).
- [ ] `legacy-bridge/ask/commit.ts`: the walk (commit, `then`, events, receipt, undo record; undo by `record` and
      `call`), through `viaAsk`, `refresh` as today.
- [ ] The act tools take `needs` and the undo label from the spec and refuse a person below `needs` in words (D7).
- [ ] `ask-turn.jsx`: Approve gated with `window.gate` (D8); the undo label from the card as before.

### Task 8: The proof

- [ ] `ask-specs.test.mjs` (new): for every kind, a commit and (where declared) an undo through the real typed client
      over `ask-commit.test.mjs`'s fake fetch — method, URL, body, `x-via`, `x-undo-of`, refresh and receipt; every
      route a spec names is a `ROUTE_KEYS` entry; every spec's `needs` is its commit route's policy role
      (`route-policy.json`), the one named exception the lead search's stop (an operator's route undoing an owner's
      card); every gate's role is its `needs` (`ROLE_PERMS`).
- [ ] `ask-commit.test.mjs` rewritten over the specs, its coverage kept; its wake assertions now say "no undo".
- [ ] A double press on a reply card sends one idempotency key twice (the route answers the first).

### Task 9: Gates and the PR

- [ ] The six checks; `s.requests[0]` byte-equal to main's.

# PR 3.3 · The descriptions, the examples, the rounds and the ceiling

**Branch:** `ask-rewired/3-3-descriptions`. The model reads new descriptions and examples; the rules that describe a
tool move into it; three rounds; a 4,000-token round. Waits for Ruben's word (D16).

### Task 10: The words

- [ ] Every description at the documented length; `ASK_RULES` loses the rules that describe one tool (`prompt.ts:69`,
      `:72`, `:73`, and the tool parts of `:70`, `:74`, `:76` at `0c136563`), each landing in its tool; the results' `note`s that repeat a rule
      are cut to what the rows need.
- [ ] `input_examples` on the shaped tools (D9); `loop.ts:529` sends the field; a 400 naming it is asked again without
      them, once (`ask_examples_rejected`).
- [ ] `ASK_MAX_ROUNDS` 3 and `ASK_MAX_TOKENS` 4,000 (D10), their comments and `docs/system-prd.md` updated.

### Task 11: The proof

- [ ] The request's tools carry the descriptions and examples, deterministic across pages and people; the rules block
      is shorter by what moved; the examples retry (a scripted 400, two requests, the second without examples, the
      format kept); the third round is the forced last.
- [ ] `node tooling/scripts/eval-ask.mjs --list` says the run's turns and cost; the run is Ruben's.

# PR 3.4 · Nineteen tools, sorted, and the owner's acts to owners

**Branch:** `ask-rewired/3-4-consolidate`. Waits for Ruben's word (D16).

### Task 12: The consolidation (D11, D12)

- [ ] The read families become nine tools with an `action` (a zod discriminated union, so each action's fields are
      its own); the act families ten. `toApiTools(role)` is sorted by name; three prefixes.
- [ ] The turn records `name.action`; `cross-page.ts`, `scopedRead` and the `read://` blocks name the new tools.

### Task 13: The rename carried through (D13)

- [ ] `tooling/evals/tool-names.json` (old → new) and a script that rewrites `ask-cases.json` by it, run once and
      committed; the judge reads old names through it.
- [ ] `prompt.ts`, `docs/system-prd.md`, the suites.

### Task 14: The proof

- [ ] The tool count and order per role; the prefix identical across pages and people of one role; an operator is
      offered no owner-only act; every action runs what its old tool ran (the fourteen reads' test over the new names).
- [ ] `eval-ask.mjs --list`; the run is Ruben's.

# PR 3.5 · The reply's voice (after D15)

Written when Ruben has said what a receptionist-voiced reply does. The shape it will take: the route's `ReplyBody` and
core's take `voice` as optional (the route first, so either deploy order holds), the reply spec sends it, and the
ledger records it.
