# Ask Rewired, Phase 4: aware of all data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask reads what every page reads and cites what it read. The reads that already have readers become actions of
the nine tools (leads and one lead, one search, lists, the pipeline, broadcasts and one broadcast, connections,
notifications, activity); message search gets its index and its reader; citations grow from five kinds to thirteen
names, each a row a reader returned; four new cards (a person's note, a person's details, a list, a waiting run) join
the twelve. The tool set stays at twenty or fewer per role.

**Architecture:** the grammar that the answer's citations build (contracts `ask/ask.ts`, `ask/ask-answer.ts`, both at
their file-length baselines) is split first, as a pure move, so the kinds can grow in the files that hold them; the read
set becomes kind → id → RowRef (§5.7), so a citation's route is the reader's, never re-derived; the registry offers
each role the ACTIONS it may use (a tool's schema and description built per role from its actions), so one tool may
hold an operator's action and an owner's; the message index is an expression GIN index read through a SECURITY
INVOKER function, so RLS judges the person and no column rides the realtime payloads.

**Spec:** `docs/superpowers/specs/2026-09-25-ask-rewired-design.md` §5.1, §5.3, §5.4, §5.7, §6, §9 (Phase 4), §10.
Written against `origin/main` at `7becc4b4c` (#1183, PR 3.4; 27 Sep 2026) after a code map read at that commit (read
only; its findings below). Phase 3 plan: `docs/superpowers/plans/2026-09-26-ask-rewired-3-registry.md`.

---

## Where this fits, and what the code map found

Phase 3 made one definition per tool and one spec per card, and held the set at nineteen. Phase 4 is reach: what the
pages hold that Ask cannot yet read, cite or propose. The map corrected the spec in twenty places; the ones that shape
this plan:

1. **Six of the eight domains already have readers**, moved out of their routes in Phases 1–2: `readers/leads.ts`,
   `lists.ts`, `broadcasts.ts` (the list and one), `notifications.ts`, `connections.ts`, `activity.ts`, and
   `searches.ts`. Missing: the pipeline (built in the browser from People's rows, and server-side only inside the context
   provider, `server/ask/context/people.ts:98-144`), message search, one lead (`GET leads/[id]` → `leadOne`,
   `server/leads/lead-page.ts:330`) and one search (`GET lead-searches/[id]` → `searchRow`). Phase 4 is mostly actions
   over readers that exist.
2. **The grammar sits at its ratchet.** Contracts `ask/ask.ts` is 891 lines and `ask/ask-answer.ts` 859, each exactly
   its `file-length.json` baseline, and together they hold the citation kinds, the read set, `groundCitations`,
   `citationRoute`, `KIND_WORDS`, the answer format and `groundRef`. One added line in either is a red build.
   `server/ask/loop.ts` is 794 lines, six under the 800 limit.
3. **Two directories are full.** `server/readers/` is at its tree-shape baseline (31 modules); `tooling/scripts/tests/ask/`
   holds 20 (a 21st is a new offender).
4. **§5.3's `propose_person {mode, details, note}` mixes an owner's card with two operator cards**, which the registry's
   offer (`tools/registry.ts:213-221`, by the first action's `needs`) and its test (`ask-registry.test.mjs:161-165`, one
   `needs` per tool) forbid. The same holds for a read an owner alone may use: activity is owner-only at its route alone
   (RLS lets every member read the ledgers), and every read is offered to every role today.
5. **§5.3's table is twenty-two tools**; Phase 3's D11 held nineteen "under the documented twenty" and the registry test
   says so (`:149`). Folding lists and the pipeline into `people` keeps nine reads; with `propose_list` the owner has
   twenty.
6. **"Five to twelve" citation kinds names thirteen** (twelve row kinds and `page`), and the rows and scope the page
   already sends call a Broadcasts row `run` (`server/ask/context/pages.ts:86`; `ASK_SCOPE_KINDS`, `ask.ts:287`) where
   §5.7 says `broadcast`.
7. **No text index, no search function, no pg_trgm** in the 204 migrations; the Inbox's search is a browser filter over
   the rows it holds. `messages` and `calls` are published to realtime with no column list and subscribed by the
   dashboard, so the spec's stored generated column would ride every change; an expression index would not.
8. **The four cards each need a choice.** A note that is not team-only is read by the receptionist before it answers
   that person (00157), and the page's default is not team-only. A list's rule came, in the spec, from the drafter — a
   second model call inside the turn. A waiting run may be a reach-out run, which the same route approves (cold email).
   `PUT contacts/[id]/details` also writes notes and the proposal link, and answers no previous value.
9. **Where a new kind must be added**: thirteen places, from `ASK_CITATION_KINDS` to the palette's glyphs and the eval's
   id check (the map's list, carried into Task 2).
10. **The next free migration number is 00217 at the earliest** (main tops at 00213; open PRs hold 00214–00216 and 00196);
    re-checked against production's ledger, main and open PRs immediately before the push.

## Decisions this plan takes (Ruben may overrule any; each names its PR)

| # | Decision | Why | PR |
| --- | --- | --- | --- |
| D1 | Nine reads and eleven acts. Reads gain actions: `leads` {searches, leads, lead, search}, `people` {search, get, lists, pipeline}, `campaigns` {audiences, playbooks, broadcasts, broadcast}, `workspace` {settings, connections, notifications, activity}, `inbox` {list, thread, search}. Acts: `propose_person` {mode, note, details}, `propose_campaign` {broadcast, playbook, run}, and a new `propose_list`. An owner is offered twenty; the registry's count test becomes "at most twenty". | The documented threshold for tool search is "roughly twenty"; selection degrades in the 30–50 band. §5.3's `lists` and `pipeline` tools would make twenty-two. | 4.3, 4.6, 4.7 |
| D2 | The offer goes per action. Each role is offered, for each tool, the actions it may use (a read action may carry a `needs`; an act's is its card kind's); a tool with none is not offered. The tool's `action` enum, its examples and its description are built per role from its actions, so an operator's `propose_person` lists note and details and an owner's adds mode. Four prefixes stay deterministic per role. | Finding 4; one tool per card family, and no role ever reads an action it cannot use. | 4.3 |
| D3 | The citation kinds are thirteen names: `page` and twelve row kinds — thread, conversation, call, person, lead, search, deal, list, broadcast, playbook, template, domain. A Broadcasts row cites as `broadcast`; `run` stays the scope and context word the route spells (`broadcasts/run:<id>`), mapped to `broadcast`. | Finding 6; one word per row in the answer's grammar, the route's word where the route is concerned. | 4.2 |
| D4 | The read set is kind → id → RowRef (§5.7): a citation's route is the RowRef the reader returned (`citationRoute` a lookup), so a deal opens its person's route and a template the page it came from. `groundRef`'s fallbacks read the same map. | A deal and a template have no route of their own (map §3.2). | 4.2 |
| D5 | The grammar splits first, as a pure move proven by values: contracts `ask/ask.ts` and `ask/ask-answer.ts` give their citation and grounding pieces, and the format, to new modules in `packages/contracts/src/ask/`; every export equal to main's bundle; both baselines fall and are banked. | Finding 2; the kinds PR must have room to grow. | 4.1 |
| D6 | The message index is an expression GIN index (`to_tsvector('simple', coalesce(body, ''))` on `messages`, the same on `calls.transcript`), read through one SECURITY INVOKER function (the workspace, the words, a day bound, a limit) that answers message and call hits newest first; no stored column; `simple`, not a stemmer (the workspaces write English and Spanish). Additive, RLS unchanged. | Finding 7. | 4.4 |
| D7 | The migration is held for Ruben: pushed to production (dry run first, the number re-checked) before its PR merges, by Ruben or on his explicit yes. Nothing calls it until 4.5, so either deploy order. | The repo's rule for schema changes; production's key. | 4.4 |
| D8 | A note card carries a required `for`: `receptionist` (the receptionist reads it before it answers that person) or `team` (team only). No default: the model says which, and the card says it back. A fact about the business stays a settings card; the eval case `propose_note` is split into one of each. | Finding 8; a default would decide what a customer hears without anyone choosing (the required-parameter rule). | 4.6 |
| D9 | A person's details card takes name and email only (the page's two fields); its builder reads the previous values, which the undo sets back. | The route also writes notes and the proposal link, which have their own doors. | 4.6 |
| D10 | A list card's rule is written by the turn's model in the list vocabulary (`LIST_RULE_FIELDS`) and checked in the builder by `cleanListRule`; no second model call. Undo deletes it (or archives it, as the route does when something depends on it). | Finding 8; one model per turn. | 4.7 |
| D11 | A run card is a playbook's waiting run: approve (undo: cancel) or skip. A reach-out run is refused in words ("a reach-out run is approved on Leads"). | Finding 8; cold email stays on its own page. | 4.7 |
| D12 | New readers live in the domain files that exist where they fit (one lead in `readers/leads.ts`, one search in `readers/searches.ts`, the pipeline in `readers/people.ts` under a name that is not a third `pipeline`), and the message search reader is the one new file (`readers/messages.ts`), its `tree-shape` rise banked in `docs/debt.md` with this row's reason. New suites go to their domain's test folder, not `tests/ask/`. | Finding 3. | 4.3, 4.5 |
| D13 | `workspace.activity` is an owner's action (D2) and its handler checks again; `workspace.connections` leaves out billing (the charter, §7); `workspace.notifications` is the person's server notifications, said as such. | Findings 1 and the map's §8. | 4.3 |
| D14 | Results stay capped as today; `detail: "concise" \| "full"` is deferred again (no Phase 4 read needs a full form beyond `inbox.thread`'s `more`). | One change to the request at a time. | — |
| D15 | Merge on green, as Phase 3's last two (Ruben, 26 Sep: "merge right away and continue working"); his eval re-run follows each change to what the model reads. The migration alone waits (D7). | His instruction. | all |

### The spec amendments this plan makes (in the plan's PR)

- §9: Phase 3 landed (3.1 #1157, 3.2 #1160, 3.3 #1167, 3.4 #1183; 3.5 deferred by Ruben), and Phase 4 as eight PRs.
- §5.3: nine reads and eleven acts (D1), the per-action offer (D2), twenty for an owner.
- §5.4: the four cards as D8–D11.
- §5.7: thirteen names, `broadcast` the citation kind for a Broadcasts row (D3).
- §6: the readers that exist, and the new modules.

## How every PR is proven (the six checks, then each PR's own)

1. `corepack pnpm --filter "./packages/*" build` after formatting; `corepack pnpm -r typecheck`; `corepack pnpm lint`
   (0 errors, warnings at their allowance); `node tooling/scripts/gen-route-types.mjs --check`; `corepack pnpm format:check`.
2. The full `corepack pnpm test`; the harness (`tests/ask/ask-turn.test.mjs`) asserts on `s.requests[i]`.
3. Dists rebuilt and committed; `node tooling/scripts/check-dist.mjs` in sync.
4. The ratchets: nothing rises without a banked reason; every fall banked (`UPDATE_BASELINES=1`, `docs/debt.md` in the
   same diff); knip's dead exports at their baseline (#1170's test-seam rule).
5. The model's request: a PR that must not change it proves it byte-equal; a PR that changes it names every byte that
   moved and re-dumps the per-role fixture.
6. `git diff origin/main --stat` limited to the PR's files; the rebase-and-rebank cycle before every push when main
   moved (`docs/debt.md` conflicts are regenerated, never hand-merged).

Each PR: its own worktree from that day's `origin/main`; one implementer; one combined review round; squash-merge on
green (D15).

---

# PR 4.1 · The grammar, split (a pure move)

**Branch:** `ask-rewired/4-1-grammar-split`. Nothing the model reads changes.

### Task 1: Split and prove by values
- [ ] Move out of contracts `ask/ask.ts`: the citation kinds, `AskCitation`, the read set and `emptyReadSet`,
      `ASK_PAGE_ROUTES`/`PAGE_PREFIX`, `groundCitations`, `citationRoute` → `ask/citations.ts`; out of `ask/ask-answer.ts`:
      `ASK_ANSWER_FORMAT` and `SOURCE` → `ask/answer-format.ts`, `groundRef`/`ROW_KINDS`/`ROW_ROUTE` → beside the
      citations. Named in `ask/index.ts` (never `export *`; a module imports another by path). No import cycle
      (`contracts-import-cycles.test.mjs`).
- [ ] Proof: the export list of `packages/contracts/dist/index.d.ts` unchanged; every exported value of the built bundle
      deep-equal to main's (the pure-move proof: main's `dist/index.js` beside the new one, both imported, compared;
      functions by arity); `ASK_ANSWER_FORMAT` byte-equal; `s.requests[0]` byte-equal.
- [ ] Both files fall below their baselines: banked, `docs/debt.md` rewritten.

# PR 4.2 · Thirteen names: the citation kinds and the read set

**Branch:** `ask-rewired/4-2-kinds`. The answer's grammar changes (the format's `kind` enum, the prompt's source rule).

### Task 2: The kinds (D3, D4)
- [ ] `ASK_CITATION_KINDS` = page + the twelve; the read set becomes `ReadRows` (kind → id → RowRef); `citationRoute`
      reads a RowRef; `KIND_WORDS` en/es for each; `groundRef` over the map; `PAGE_PREFIX` stops matching
      `clients/list:<id>` (a list is a row now).
- [ ] Server: `RowKind` (`readers/index.ts:34`) = the twelve; `refOf` (`context/rows.ts:76`) and the context's `citable`
      set take every kind; the providers' `ref: null` rows (leads, searches, runs as `broadcast`, playbooks, templates)
      get their RowRefs; the readers that exist return their rows' RowRefs (leads, searches, lists, broadcasts,
      playbooks, templates, connections' domains).
- [ ] The prompt's source rule and items list (`prompt.ts:66-67`) and the format's `SOURCE.description`; the palette's
      `kindGlyph` and `arScopeIcon`; the eval's `no_invented_citations` accepts a built-in list id.
- [ ] Every "until Phase 4" pin becomes behaviour (map §3.3 item 13).

### Task 3: The proof
- [ ] `normalizeAnswer` keeps a read row of each new kind with the reader's route and drops an unread one (counted);
      a deal opens its person; the format measured under the edge's 8,000 characters; the harness names every byte that
      moved (the format's enum, the prompt's rule); `ASK_ANSWER_FORMAT` re-measured.

# PR 4.3 · The reads that have readers, offered per action

**Branch:** `ask-rewired/4-3-reads`. The model reads new actions.

### Task 4: The per-action offer (D2, D13)
- [ ] A read action may declare `needs`; an act action's is its card kind's. `toApiTools(role, examples)` builds each
      tool from the actions the role may use: its `action` enum, its fields, its examples and its description
      (a preface per tool, a sentence set per action). Four prefixes, each deterministic.
- [ ] The registry test: per role, the exact tools, actions and bytes (a new frozen fixture); no role reads an action it
      cannot use; a builder's own role check stays as the second guard.

### Task 5: The actions
- [ ] `leads {leads, lead, search}` (one lead and one search as readers in `readers/leads.ts` and `readers/searches.ts`),
      `people {lists, pipeline}` (the pipeline reader moved out of `context/people.ts` into `readers/people.ts`, the
      provider then reading it), `campaigns {broadcasts, broadcast}`, `workspace {connections, notifications, activity}`
      (D13).
- [ ] `scopedRead` reads a lead, a search and a run by id (moved out of `loop.ts` if its 800-line ratchet needs the room);
      the prompt's "no tool reads it by its id yet" words go.
- [ ] Each action records its RowRefs in the read set (Task 2's map).

### Task 6: The proof
- [ ] Each new action answers what its page's builder answers over the same reader (a value test per action over the
      fake database); the pipeline reader equals the provider's result; activity refused below an owner.
- [ ] New eval cases per new action (and `ROW_SOURCES` where a page draws rows); `eval-ask.mjs --list` says the turns and
      cost.

# PR 4.4 · The text index (the migration, held)

**Branch:** `ask-rewired/4-4-text-index`. Nothing calls it yet.

### Task 7: The migration (D6, D7)
- [ ] `supabase/migrations/<n>_messages_have_a_text_index.sql` (the number re-checked at push): the two expression
      indexes, the SECURITY INVOKER search function, grants as the other member functions; re-runnable statements.
- [ ] `database.types.ts` regenerated; a `packages/db` repository function over the RPC; dists rebuilt.
- [ ] A db test in `tests/messages/`: a member finds a word in their workspace's messages and a call's transcript; a
      member of another workspace finds nothing; the plan uses the index (EXPLAIN on the local stack).
- [ ] The size read on production (a read-only count Ruben runs) before the push; the push held for Ruben (D7).

# PR 4.5 · The search reader and `inbox.search`

**Branch:** `ask-rewired/4-5-search`. After 4.4 is in production.

### Task 8: The reader and the action
- [ ] `readers/messages.ts` over the repository: days bounded, capped, each hit a thread or call RowRef with the words
      around the match; its `tree-shape` rise banked (D12).
- [ ] `inbox {search}`; a cross-page noun only if an eval case asks for one.
- [ ] Proof: the reader's bounds and caps over the fake database; a harness turn citing a hit; eval cases ("did anyone
      mention parking this month?") on two surfaces.

# PR 4.6 · A person's note and details

**Branch:** `ask-rewired/4-6-person-cards`.

### Task 9: Two specs (D8, D9)
- [ ] `note`: `POST contacts/[id]/notes` with `team_only` from the required `for`; undo `notes/remove` with the answer's
      note id; the card's summary says who reads it.
- [ ] `person_details`: `PUT contacts/[id]/details` with name and/or email; the builder reads the previous values; undo
      sets them back.
- [ ] `propose_person {mode, note, details}` offered per action (an operator note and details, an owner all three);
      the palette's KIND/ICON/words (no new branch in `AskCard`, whose complexity is at its baseline).
- [ ] Proof: `ask-specs.test.mjs` extended (commit, undo, needs = the route's role, gate); the builders over the fake
      database; the `propose_note` eval case split into a settings case and a note case.

# PR 4.7 · A list and a waiting run

**Branch:** `ask-rewired/4-7-list-run`.

### Task 10: Two specs (D10, D11)
- [ ] `propose_list`: a name and a rule in the vocabulary, checked by `cleanListRule`; `POST segments`; undo
      `DELETE segments/[id]`; Open `clients/list:<id>` from the answer.
- [ ] `propose_campaign {run}`: approve (undo cancel) or skip a playbook's waiting run; a reach-out run refused in words.
- [ ] Proof: as 4.6; the tools per role pinned (twenty for an owner).

# PR 4.8 · Phase 4 closed

**Branch:** `docs/ask-rewired-4-closed`. No code the model reads.

- [ ] The spec's Phase 4 paragraph as landed; `docs/system-prd.md`'s Ask section; the eval's `--list` turns and cost.
- [ ] The wiring map's Ask column re-read against the new `main` (Ruben opens the artifact, or it is rebuilt).
