# Ask Rewired: design spec

**Date:** 25 Sep 2026 · **Owner:** Ruben · **Status:** APPROVED 25 Sep 2026 ("the plan as you best suggest is approved
to continue as you recommend"), with one decision taken at approval: the build is model-agnostic and the default model
is Opus 5.5 (§5.11) · **Canvas:** https://claude.ai/artifact/BQLLJrUhjRkSQwGtghZZF5 (v2; the two figures of §4 are
drawn there) · **Companion:** the Ask Wiring Map, https://claude.ai/artifact/L91MDmxoRzTgN7NezP2T1n (23 pages and
engines against Ask, a 23×23 matrix, a 61-row gap ledger) · **Sources:** every load-bearing claim about the API was
read against its page on 25 Sep 2026; the notes, with every URL and read date, are
`docs/superpowers/specs/2026-09-25-ask-rewired-primary-sources.md` · **Plans:** one per phase in
`docs/superpowers/plans/`, written when its phase starts against the `main` of that day; Phase 0 is
`2026-09-25-ask-rewired-0-measure.md`.

**Analysis:** every fact in §2 was read on `origin/main` at `e1615a91` (25 Sep 2026, #1049), file and line beside it.
The files Phase 0 touches (the loop, the round, the stream parser, the gateway on both sides, the route, the store,
the eval runner) were re-read at `acd8ef73` (#1070) when this spec was written into the repo; nothing in §2 had moved.
Where this spec and the code disagree, the code wins and the spec is corrected.

## 0. In one paragraph

The same Ask, the same charter and the same answer on the Stage, rebuilt on three ideas: **the page is the prompt**,
**pages and Ask read through one read layer**, and **every row read is a door**. The turn becomes page-aware from its
first token, most on-page questions answer in one model round, and the code that runs it shrinks to a registry, a
context plane and one spec per card. Everything planned or in flight elsewhere (usage tiers, Reach out, campaigns on
every channel, the phone app, the finder's question loop) is left to its own plan and named in §8.

Where the numbers stand today (the 23 Sep gate, Sonnet 5 at low effort, the loop as built; the Opus 5.5 row lands with
Phase 0):

| Measure                     | Today                             |
| --------------------------- | --------------------------------- |
| Tools                       | 14 read · 12 act (viewers see 14) |
| First words, median         | 3.1–3.3 s                         |
| One-round turns             | 13–15 of 28 (Today only)          |
| Cost per turn               | $0.010                            |
| Pre-reads per turn          | 5 queries + ≤2 regex              |
| Threads · follow-ups (prod) | 366 · 0                           |
| Rounds · budget             | ≤4 · 45 s                         |
| tools.ts · proposals.ts     | 1,332 · 1,195 lines               |
| Read layers                 | 3                                 |
| Citation kinds              | 5                                 |
| Eval surfaces               | 1 of 9                            |
| Prompt cache hit ratio      | unmeasured                        |

Legend used below: **keep** stays as built · **fix** the same thing done properly · **new** added · **cut** removed ·
**out** stays out on purpose.

## 1. Checked against the sources

Before approval, every load-bearing choice was read against the page that owns it: the platform docs on tool use,
structured outputs, prompt caching, thinking and effort, citations, memory, batches and latency; Anthropic's engineering
posts from December 2024 to May 2026; the MCP specification of July 2026. The shape of the plan holds. Five specifics
of the first draft were wrong and are corrected here; the rest are refinements, each folded into its section.

| Topic                               | Verdict       | What the sources say, and what changed                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tool descriptions                   | changed       | The docs call descriptions the most important factor and ask for at least three or four sentences each, with when to use the tool and when not. v1 said two sentences. Now: three to four sentences, the sibling tool named, and `input_examples` on the tools with format-sensitive inputs.                                                                              |
| Tool count                          | changed       | Past roughly twenty tools the docs recommend tool search, and selection degrades between thirty and fifty. v1 planned about thirty-five. Now: about twenty-two with `action` parameters (eleven read, eleven act; a viewer sees eleven). Tool search with `defer_loading` stays a fallback only.                                                                          |
| Where the page context lives        | changed       | Sonnet 5 has no mid-conversation `system` messages, and the docs place third-party text (customers' words) in data blocks, never in `system`. v1 put the block in the system prompt. Now: `search_result` blocks at the start of the turn's user message, citations off, one stable `source` id per row; the clock and the person follow it in the same message.           |
| The warm call                       | changed       | A model pre-warm with `max_tokens: 0` is rejected alongside `output_config.format`, and a per-person cache entry is read only if the same person asks again within the TTL. Now: the warm is a data warm; it fills the readers and builds the blocks and never calls the model. Whether the context blocks earn a cache breakpoint is decided by measured follow-up rates. |
| Strict tools and the caps           | refined       | No Anthropic page documents the twenty-strict or twenty-four-optional-parameter limits; they are the 23 Sep measurement. Strict stays off and the caps are re-measured after each API version, never written down as a spec.                                                                                                                                              |
| Structured output and streaming     | confirmed     | Tools and `output_config.format` in one request is documented; the format plus the tool set is one compiled grammar per role and a format change invalidates the thread's cache. The docs give no partial-JSON guarantee for the answer, so the Say preview stays a tolerant parse of the first field and first-words claims are measured, not assumed.                   |
| Page context as prefetch            | confirmed     | The context-engineering post's hybrid: some data up front for speed, more through tools at the agent's discretion, carried as lightweight identifiers. The block is trimmed to ids, display names and a few high-signal fields, and readers take a concise-or-full switch.                                                                                                 |
| Grounding                           | confirmed     | API citations return 400 with structured output, so the application read set is the only mechanism. It stays, and "not enough information" becomes a first-class answer.                                                                                                                                                                                                 |
| Effort and thinking                 | confirmed     | Low effort with adaptive thinking is what the docs suggest for chat-shaped, latency-sensitive work; Sonnet 5 follows effort strictly with some risk of under-thinking at low. Effort is pinned per route, hard questions are steered by text, and a measured `medium` route is kept as a fallback. Opus 5.5 always thinks and takes effort as its only control (§5.11).    |
| Memory, compaction, context editing | confirmed out | All three are for long-running agents; the memory tool injects a "read your memory first" instruction that costs a round. A live thread replays verbatim (append-only, cache-safe) and rebuilds compactly only on a cold reopen.                                                                                                                                          |
| Evals                               | refined       | The January 2026 post and the docs: grade outcomes, not tool paths; held-out sets, repetitions and confidence intervals; pass^k for must-never behaviours; a judge on another model; batches at half price for single-turn cases. The scripted-model run is named a harness test and the real-model gate is defined (§5.10).                                               |
| Latency                             | refined       | Fast mode is Opus-only and Priority Tier is not offered on Sonnet 5, so neither is budgeted for either model. The levers are a warm shared prefix, low effort, the default omitted thinking display, a small schema and no tool on the hot path.                                                                                                                           |
| MCP                                 | not now       | Anthropic's connector consumes tools only, so an MCP surface buys nothing today. The registry is kept MCP-shaped (name, description, input schema, an optional output schema, a read-only flag, deterministic order) so a later `tools/list` is a projection.                                                                                                              |

## 2. Diagnosis

Ten findings from the code at `e1615a91`, each with where it lives. Together they explain the two numbers that matter:
half the turns take two rounds, and first words arrive after three seconds.

**F1 · The first round does not know the page.** Every turn starts with the same snapshot: the newest eight threads
with three messages each, the open escalations, six held drafts, today's calls and five counts. On Today and the Inbox
that is the page. On Reports, Calendar, Leads, Pipeline, Campaigns and Settings it is several thousand tokens of the
wrong page, and the rows the person is looking at are absent, so the model must call a tool and the answer waits for
round two. The eval set is entirely `surface: "today"`, which is why its one-round rate looks as good as it does.
`apps/dashboard/src/server/ask/snapshot.ts:148-334` · `tools.ts:321-401` (get_today without searches) ·
`tooling/scripts/eval-ask.mjs:168`.

**F2 · The browser already holds what the server re-reads.** When the palette opens, the tab holds the page's rows in
window globals (`TODAY_DATA`, `INBOX_DATA`, `__PEOPLE`, `__LEADS`, `__REPORTS`, `__CALENDAR`, `__PLAYBOOKS`,
`__BROADCASTS`, `__SETTINGS`), kept across reloads by the surface cache. The palette reads them for chips, jumps and the
quick answers, then sends the server only a surface word and, sometimes, one scope id. The server rebuilds the day from
zero. `legacy-bridge/ask/palette.ts:56-81, 108-172` · `legacy-bridge/surface-cache.ts:79-93` ·
`legacy-bridge/ask/api.ts:109-131`.

**F3 · Three read layers, and they drift.** The bridge overrides fetch `/api/v1`; the routes call server modules; Ask's
tools re-implement the loads beside them, and the snapshot re-implements them again. The drift is visible: `get_report`
reads `report_series` only while the Reports route also reads the booking line and the deals; `get_today` calls
`toTodayVM` without the waiting searches the page passes; `get_person` is nine queries of its own.
`tools.ts:248-306, 649-747, 855-876` · `snapshot.ts:152-211` · `app/api/v1/reports/route.ts:36-66` · `tools.ts:331`.

**F4 · Some reads do a send's work for a question.** `search_people`, `list_audiences` and `list_playbooks` each start
from the audience pool: every person through `people_list` a thousand at a time, their reply modes, then the calendar
feed fetched and parsed for visits. That is right for a send, whose count must equal the page's, and heavy for "who said
yes?" on a 2,500-person workspace. The tenant's name and zone are read again in four tools and the route, unmemoised.
`server/audience.ts:45-68` · `server/people.ts:82-84` · `packages/db/src/repositories/people.ts:44-47` ·
`server/calendar.ts:643-668` · `server/tenant.ts:9-17`.

**F5 · The tool surface is hand-written, paragraph-long and unvalidated.** Twenty-six schemas are typed by hand; two
descriptions run past a thousand characters (`list_audiences`, `propose_lead_search`) and carry rules that belong in the
system block. Inputs are read with `str()` and `Number()`; only two tools use zod. Strict mode is off because the API
took twenty strict tools and twenty-four optional parameters on 23 Sep, which is right, but nothing validates in its
place. The dispatch is a switch of fourteen cases and a second switch of twelve. `tools.ts:106-195, 1268-1332` ·
`proposals.ts:104-306`.

**F6 · Memory replays words and forgets the cards.** A later turn sees only the text of earlier answers, cut to 1,200
characters each; the cards it proposed, what became of them, and the ids it cited are invisible, so "approve that one"
or "open the second" cannot resolve. `readThread` takes the oldest sixty messages, so a long thread's newest turns are
neither shown nor replayed. Production shows the result: 366 threads, 412 questions, no second question in any thread.
`server/ask/store.ts:95-99, 118-123` · `loop.ts:58-59, 163-176`.

**F7 · Five citation kinds, routes spelled twice.** A source may be a thread, a conversation, a call, a person or a page.
A lead, a search, a deal, a list, a broadcast, a playbook or a domain is never citable, so an answer about them has no
door. The route for a kind is a switch in contracts, a second spelling of the routes the pages own; a page is allowed by
a regex prefix. `packages/contracts/src/ask.ts:79-87, 145-185` · `ask-answer.ts:636-661`.

**F8 · Nothing searches what customers said.** People are found by name, number or address with `ilike`; there is no
text index over messages or transcripts. "Did anyone mention parking this month?" has no tool, and the model can only
page through threads. `supabase/migrations/00127:221-223`; no tsvector or trigram index in any migration.

**F9 · The gateway counts the budget by shipping rows, and nobody watches the cache.** Every minute per instance the
edge reads up to two thousand usage rows for a workspace to sum them, where one indexed SUM would do. Each round's usage
row carries the cache-read tokens, but nothing computes the hit ratio, so a silent invalidator would raise the bill
without a signal. The dashboard reaches the model through the edge, one hop more than a direct call, which the key rule
requires. `apps/edge/lib/ask-gateway.ts:32-52` · `api/admin/llm.ts:76-86` · `migrations/00002:161` (the index exists).

**F10 · The eval set proves one surface.** Twenty-eight cases, every one sent with `surface: "today"`, no scope, no
thread; the judge matches keywords and tool names; nine of the thirteen card kinds are never proposed; every run spends
the receptionist's key against production. `tooling/evals/ask-cases.json` · `eval-ask.mjs:163-260`.

Beside these, the small defects the wiring map listed stand: the wake card's undo posts snooze with no day, the reply
card drops its voice, scope is lost on Live and on peeks, "this search" never has a scope to resolve, and the template
drafter records its rounds as "ask". Each is closed by construction below rather than patched.

## 3. What Ask is

The front desk's own assistant for the owner: it knows what is on the screen, answers in one breath from what the
pages already show, reads only what the page does not hold, proposes and never acts, cites what it read, and gets out of
the way.

1. **Context before cognition.** The page is the prompt. What the person is looking at rides into the first round,
   hydrated on the server from the ids the tab already holds, so the common question needs no read.
2. **One read layer.** Pages, routes, the context plane and the tools all read through the same readers. The number
   Ask says is the number the page shows, by construction, not by discipline.
3. **Reads are cheap, rounds are expensive.** Reads are memoised, parallel and bounded; a second model round happens
   only when the question leaves the page.
4. **Every fact has a door.** A reader returns its rows as references with a route. Anything read can be cited and
   opened; nothing read can be invented.
5. **A card is a verb.** One spec per card kind says what it checks, which route commits it, how it undoes, where it
   opens and who may press it. Server and client walk the same spec.
6. **Say it once, then stop.** One sentence, the figures it rests on, one door, at most two next questions. No
   preamble, no markdown, no second door to the same place.

If Ask lived inside Chanlytics, it would want to know the page before it hears the question, so that "why is she
waiting?" on the Inbox is answered from the row already in front of both of them, not from a fresh trip to the database.
It would want every number it says to be the page's number, so nobody has to check it. It would want to answer in a
breath and offer one door, then keep quiet. It would want to remember the card it proposed a minute ago, so "approve
it" means something. It would want to say "I can't see that" instead of guessing, and "that's one press on the Leads
page" instead of taking a job that belongs to a button. And it would not want to be a chatbot with opinions about the
world: it is the workspace, spoken.

## 4. Target architecture

The canvas draws two figures: one turn as it runs today against one turn rewired, and the layers with what talks to
what. In words: the difference is where the page's rows enter the turn. Today they enter after round 1 asks for them;
rewired, before round 1 begins. The reads themselves do not get faster; they move earlier and run once. The route stays
one door; what changes is that the turn, the tools and the routes read through one layer, and the page arrives before
the question does.

### 4.1 One turn, rewired, step by step

1. **The palette opens.** The page's provider assembles a `PageContext` from the globals it already holds: surface,
   route, view, the ids of the rows on screen (at most 40), the focus if a row is open. The tab posts it to `ask/warm`.
   Reads only, no model.
2. **The server hydrates.** The surface's context provider re-reads those ids through the readers under RLS, adds the
   page's own aggregate (the report, the day, the queue, the searches, the pipeline groups, the pane's facts), and
   writes the context as data blocks: one `search_result` per row on screen, citations off, a stable `source` id each,
   ids and display names and a few high-signal fields rather than whole rows. Its RowRefs seed the read set. Cached
   60 s by person and context hash, on the server; the model is not called.
3. **The question arrives.** With the same context and, if the words name a row on screen, a focus. The blocks come
   from the warm cache; a focused row is read in full; a question that names another page starts that page's reader in
   parallel (the regex table shrinks to cross-page nouns).
4. **Round 1.** In `system`, byte-stable: the tools, the rules, the examples and the facts (breakpoint 1), then the
   shape of the workspace (breakpoint 2). In the user message: the context blocks, then the clock, the person, the
   scope, the language and the question. Tools for the role, one deterministic set of about twenty-two, the same effort
   and thinking on every round. The model answers in the format, streaming Say, or calls reads and acts in parallel.
5. **Round 2, only off-page.** Results go back as one message; the answer follows. A third round is the forced last.
   Most on-page turns never get here.
6. **The answer and its cards.** Sources are grounded against RowRefs (any kind read this turn), one door per place,
   cards drawn from their spec. The turn is stored with its cards, outcomes and cited ids, so the next question can
   point at them.

## 5. The pieces

Each piece names what it replaces, what it keeps, and the file it lands in. Together they are the whole of the change;
nothing about the Stage, the cards' routes or the charter moves.

### 5.1 One read layer (new; cuts the loaders in tools.ts and snapshot.ts)

A reader is a function of the request context and typed arguments that returns `data`, what the page's route answers,
the rows it touched as references, and a freshness stamp. Readers live in `apps/dashboard/src/server/readers/`, one file
per domain, and are the only thing a `/api/v1` GET route, an Ask tool or a context provider calls. A reader's `data` is
what the page's route answers today (the DTO the browser builds its view model from), key for key, so a route that reads
through a reader answers the same bytes; a tool applies the page's own view-model builder to it and projects that; a
provider folds it into the block. The repositories in `packages/db` and the view models in `packages/contracts` stay
where they are; readers compose them.

```ts
// apps/dashboard/src/server/readers/index.ts
export interface RowRef {
  kind: RowKind;
  id: string;
  route: string;
  label: string;
}
export interface Read<T> {
  data: T;
  rows: RowRef[];
  stamp: number;
}
export interface Reader<A, T> {
  name: string;
  read(rc: ReaderContext, args: A): Promise<Read<T>>;
  ttlMs?: number;
}
```

Two caches, both on the server. A `TurnCache` memoises by reader and arguments for the life of one turn (the memo that
exists today, generalised). A `ReaderCache` per instance holds answers across turns with a TTL per reader: twenty seconds
for threads and calls, sixty for a report, five minutes for facts, settings and the shape of the workspace. The warm call
fills it; the turn reads it. A write through a card marks its readers stale, the way the refresh map does in the browser.

The audience pool stops being the way to find a person. `search_people` reads one page of `people_list` with the query
passed to SQL, as the People page does; the pool is read only by the tools that count a send or a moment, and their
counts move toward SQL as the lists program's Phase 5 lands. The tenant's facts are one reader with a five-minute TTL,
read once a turn.

### 5.2 The page context (new; cuts snapshot.ts and prefetch.ts)

The contract is small and the trust boundary is clear: the tab sends identities and words, never facts. The server
decides what is true.

```ts
// packages/contracts/src/ask/context.ts
export interface PageContext {
  v: 1;
  surface: AskSurface; // today · inbox · people · leads · pipeline · calendar · reports · campaigns · settings · start · other
  route: string; // the hash route as the shell parses it
  view?: string; // a list token, a period ("30"), a calendar day, a Campaigns tab, a Settings pane
  focus?: AskScope | null; // the row that is open (thread, call, person, lead, search, deal, run)
  rows: Array<{ kind: RowKind; id: string }>; // what is on screen, in the order shown, at most 40
  askedAt: number;
}
```

Each real page registers one provider in `legacy-bridge/ask/context.ts` that reads the globals it already holds. Today
gives its queue and the searches waiting; the Inbox its threads and the open one; People its rows and the list picked;
Leads the view, its rows and the search open; the Pipeline its groups; Calendar the days drawn; Reports the period;
Campaigns the tab and its rows; Settings the pane. Surfaces grow from nine to eleven (pipeline, campaigns, calendar and
start stop being "other").

On the server, `context/providers/<surface>.ts` hydrates: ids become rows through the readers (RLS makes a foreign id
a miss, never a leak), the page's aggregate is read through its own reader, and the context is written as data, not
prose: one `search_result` block per row on screen with citations off, its `source` the stable row reference the
answer's citation must echo (`thread://…`, `lead://…`), its `title` the display name, its text the few high-signal
fields the page shows (state, last activity, who); and one block for the page's aggregate. The blocks go at the start of
the turn's user message, followed by the clock, the person, the scope and the language, then the question. They never
enter `system`: Sonnet 5 has no mid-conversation system messages, and customers' words belong in data blocks by the
API's own guidance. The context replaces the snapshot on every surface; the shape of the workspace (channels, deals on,
lists, playbooks running, calendar, mailbox) stays in `system` as a byte-stable block refreshed every five minutes. The
regex prefetch keeps only the cross-page nouns (a report from the Inbox, the calendar from Reports) and runs from the
context, not before it.

**Warm:** `POST /api/v1/ask/warm` (read, workspace scope, the aggregate bucket) takes the context and returns nothing
but a stamp; its effect is a filled `ReaderCache` and the built blocks keyed by person and context hash for sixty
seconds. It is a data warm: the model is never called, because a pre-warm with `max_tokens: 0` is refused beside
`output_config.format` and a per-person cache entry pays for itself only when the same person asks again inside the
TTL. The palette calls it on open and when the route changes while it is open. Whether the context blocks carry a
`cache_control` of their own is decided after Phase 0 measures palette-open to question and question to follow-up
rates; until then the shared prefix (tools, rules, facts, shape) is what the cache holds, and the context rides
uncached, which is cheap because it is identifiers.

### 5.3 The tool registry (fix; cuts the two switches)

One definition per tool: a zod input, the reader it calls or the check it runs, a projection for the model, and the
surfaces it is most likely on. The JSON schema the API sees is generated from the zod schema, so a tool cannot accept a
field the code does not read; the model's input is validated before it runs, and a bad input goes back as the zod
message, which the model corrects in one cheap retry. Every description is three or four sentences, as the docs ask:
what it reads, when to call it and when to prefer its sibling, what it returns, and its limits. The tools whose inputs
have a shape (a day window, a list token, a channel) carry `input_examples`. Dispatch is a map lookup.

```ts
// apps/dashboard/src/server/ask/tools/registry.ts
export function defineRead<A, T>(t: {
  name: string;
  description: string;
  input: z.ZodType<A>;
  examples?: A[];
  reader: Reader<A, T>;
  forModel: (data: T, detail: "concise" | "full") => unknown; // the projection, after the page's builder
}): ReadTool;
export function toApiTools(role: AskRole): ApiTool[]; // deterministic, sorted by name, the same array every round
```

The count is held near twenty, the threshold past which the docs recommend tool search, by consolidating related reads
under an `action` parameter: eleven read tools and eleven act tools for an owner or operator, eleven for a viewer. The
set stays deterministic per role, sorted by name, so the tools block is a cache hit across the workspace. Strict stays
off: the limits met on 23 Sep are a measurement, not a documented spec, and are re-measured after each API version.
Tool search with `defer_loading` is the fallback if the eval ever shows selection errors; the tool-search model table
lists Opus 5.5 and omits Sonnet 5, so on Sonnet 5 it would need one probe request first. Every tool result is compact by
default and takes `detail: "concise" | "full"`; ids are stable and semantic (`thread://…` beside the display name);
every list is paged with an explicit truncation note; every error says what to try next.

| Tool      | Actions                                            | State | Reads through                                                                                     | Cites                                  | Note                                                                                                                                                                                                                                                      |
| --------- | -------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| today     | —                                                  | fix   | readers.today (with searches)                                                                     | thread · call · search · run           | the page's queue, Worth a look, pins and steps; not the snapshot's subset                                                                                                                                                                                 |
| inbox     | list · thread · search                             | fix   | readers.inbox · readers.thread · readers.messages (the new text index)                            | thread · person                        | list keeps its filters; search is "did anyone mention parking?" over messages and transcripts, days bounded, RLS                                                                                                                                          |
| people    | search · get                                       | fix   | readers.people (one SQL page, query in SQL) · readers.person (the person page's own read)         | person · thread · call · deal · list   | no pool on search; get replaces nine queries with the page's one read                                                                                                                                                                                     |
| calls     | list · get                                         | keep  | readers.calls · readers.call                                                                      | call · person                          | unchanged shape, thinner code                                                                                                                                                                                                                             |
| report    | —                                                  | fix   | readers.report (series + booking + deals)                                                         | page                                   | what the Reports page reads, all of it                                                                                                                                                                                                                    |
| calendar  | week · openings                                    | keep  | readers.calendar · readers.openings                                                               | person · page                          | the fast path stays in the palette                                                                                                                                                                                                                        |
| campaigns | audiences · playbooks · broadcasts · broadcast     | new   | readers.audiences · readers.playbooks · readers.broadcasts                                        | list · playbook · template · broadcast | the pool stays under audiences and playbooks, where counts must match a send; broadcasts adds history, results and a run waiting                                                                                                                          |
| lists     | —                                                  | new   | readers.lists                                                                                     | list                                   | every list with its rule in words and its count, or why it can't be counted                                                                                                                                                                               |
| leads     | searches · leads                                   | new   | readers.searches · readers.leads (leads_page)                                                     | search · lead                          | the businesses themselves, by view; Ask reads searches only today                                                                                                                                                                                         |
| pipeline  | —                                                  | new   | readers.pipeline (pipelineOf over the people read)                                                | deal · person                          | where deals are on: groups, waiting, pace                                                                                                                                                                                                                 |
| workspace | settings · connections · notifications · activity | fix   | readers.settings · readers.connections (the setup DTO) · readers.notifications · readers.activity | page                                   | settings gains the business record's public facts (address, website, booking link, handoff, tone); connections says lines, channels, calendar, Google, mailbox and domains in Setup's words; notifications is the bell unread first; activity is who did what (owner only) |

The act tools, one per card family: `propose_reply` (draft or steer), `propose_thread_verb`, `propose_person` (mode,
details, note), `propose_deal`, `propose_autonomy`, `propose_settings`, `propose_whisper`, `propose_team`,
`propose_campaign` (broadcast, playbook, a waiting run), `propose_list`, `propose_lead_search`. Each checks through its
card's spec (§5.4).

### 5.4 One spec per card (fix; cuts the commit.ts switch, cardOpenRoute, PROPOSAL_GATE)

Every card kind is one object in contracts that says what it needs, what gate the client checks, which route commits it
and with what body, how it undoes, where it opens and what its receipt says. The server's act tool runs the spec's check
to build the card; the client walks the spec to commit and undo. What is now spread over `proposals.ts`, `commit.ts`,
`cardOpenRoute`, `PROPOSAL_GATE` and `askUndoOpen` becomes a table of thirteen entries plus the four new ones.

```ts
// packages/contracts/src/ask/proposals.ts
export interface ProposalSpec<P> {
  kind: ProposalKind;
  needs: "operator" | "owner";
  gate: "approve" | "autonomy" | "settings" | "team" | "find";
  commit: { route: RouteKey; params(p: P): Record<string, string>; body(p: P): unknown };
  undo?: {
    route: RouteKey;
    params(u: Undo): Record<string, string>;
    body?(u: Undo): unknown;
    window: "cancelable" | "version" | "ten_minutes";
  };
  open(p: P, outcome?: AskProposalOutcome): string | null;
  receipt(p: P, data: unknown): string;
}
// wake has no inverse that needs no day: its spec declares no undo, and the card offers none.
```

| Card                                                                                                                        | State | Commits through                                             | Why it is in                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| reply · steer · thread_verb · whisper · person_mode · policy · settings · invite · broadcast · playbook · lead_search · deal | keep  | as today, from the spec                                     | the reply card carries its voice through to the route (a field the route gains); the wake card declares no undo                           |
| note                                                                                                                        | new   | `POST contacts/[id]/notes`                                  | "note that Ana prefers mornings", or a step with a day; today only a deal can carry one                                                   |
| list                                                                                                                        | new   | `POST segments` (rule from the drafter, purpose list_draft) | "make a list of everyone who booked in the last month and never said yes"; the rule is shown on the card in the People page's own words   |
| run                                                                                                                         | new   | `POST broadcasts/[id]/approve` · `/cancel`                  | a playbook run waiting on Today: "approve the win-back run" from anywhere                                                                 |
| person_details                                                                                                              | new   | `PUT contacts/[id]/details`                                 | a name or an address a customer gave in a message, offered as a card, never written from the words alone                                  |

### 5.5 The turn (fix)

Rounds fall from four to three, since the context makes one the norm; the last round is still forced to answer with
`tool_choice: none`, which the docs say misses the messages cache for that round alone, a cost measured before anything
is done about it. The round ceiling rises from 2,000 to 4,000 tokens, one number in contracts, because the lead plan's
card was cut mid-argument at 2,000, Sonnet 5's tokenizer spends about a third more tokens on the same text, and a
cut-off costs a round. Effort stays low with adaptive thinking on, pinned per route and identical on every round: a
change mid-thread invalidates the messages cache, and Sonnet 5 has no per-message effort. A question the eval shows
under-thought at low is steered by a sentence appended to its user turn, never by a change of effort; a second route at
`medium`, with its own cache prefix, is kept for the question kinds where that is not enough. Thinking display stays at
its default, which the docs say is the faster path to the first text token. The Say preview streams as it does, as a
tolerant parse of the answer's first field, since the docs give no partial-JSON guarantee for the format.

The prompt's order is the cache's order. In `system`, byte-stable and shared by everyone in the workspace: the tools,
then the rules, the examples, the definitions and the facts (breakpoint 1, changes with settings), then the shape of the
workspace (breakpoint 2, five minutes, no counters that tick). In the user message: the context blocks, then the clock,
the person, the scope and the language, then the question, never cached. Two breakpoints spent, a third kept in reserve
for the context blocks if the follow-up rate earns it. The tools block, the answer schema and the effort are one
compiled grammar and one cache prefix per role; none varies per person, page or surface.

Focus resolution moves to the client where it is free: when the words name a row on screen by name or ordinal ("the
second one", "Ana's thread"), the provider sets `focus` from its rows, and the server's block carries that row in full.
Scope from a route grows to every kind a page can open: a lead in a peek, a search, a deal in the Pipeline's peek, a run,
a call on Live.

### 5.6 Memory (fix)

Two replays, by temperature. While a thread is warm (a follow-up inside the cache's five minutes), the exact assistant
content and tool results of the earlier turns are sent back verbatim and append-only, which is what keeps the prompt
cache and the thinking blocks valid; the store keeps each turn's raw blocks for that. On a cold reopen, when there is no
cache to lose, the history is rebuilt compactly, one line per turn: its words, the cards it proposed with their kind,
title and outcome, and the sources it cited as kind and id; from that rebuild on the session is append-only again.
Either way "approve that one" resolves to the card and "open the second" to the item. Replay is bounded to the last
twelve turns, never the ninety days. `readThread` reads the newest sixty in descending order and reverses. The thread
keeps its first question as its title and updates its scope on each turn. Threads stay per person, ninety days,
scrubbed on erasure; a name becomes a needle for the scrub as well as an id, since a turn that only names a person is
the one that survives today.

### 5.7 Grounding (fix)

The read set becomes a map from kind to a map from id to the RowRef the reader returned, so a source's route is looked
up, never re-derived. Kinds grow from five to twelve: thread, conversation, call, person, page, lead, search, deal, list,
broadcast, playbook, template, domain. Anything a reader returned can be cited and opened; pages stay allowed by the
registry's route list rather than a regex. The application read set is the only mechanism available: the API's own
citations return 400 beside `output_config.format`. Rows reach the model in one uniform envelope, `search_result` blocks
with citations disabled whose `source` is the row reference the answer's citation must echo, inside tool results and in
the context alike, so customers' words always sit in data blocks. "Not enough information" becomes a first-class answer,
and a citation outside the read set is a hard failure the eval counts. The answer's normaliser is unchanged in shape; it
only consults the map.

### 5.8 The gateway, the budget and the telemetry (fix)

The budget check becomes one SQL function, `ask_tokens_day(tenant)`, a SUM over the index that already exists, cached a
minute per instance as now. The stream parser on the dashboard reads each round's usage off `message_start` and
`message_delta` (the cache-read, cache-write, uncached-input and output tokens), the loop computes the cache hit ratio
(cache read over cache read plus uncached input plus cache writes), and writes it into `ask_turn_shape` with the rounds,
the tool timings and three latencies kept apart: the first byte of the stream, the first text token, and the first
complete answer field (the first Say). The same shape is stored on the turn's own row (`ask_messages.content.shape`),
so a day's numbers are one query, not a log search. In development every round also sends
`diagnostics.previous_message_id`, so a miss names what moved (system, tools, messages) instead of being guessed at;
that field lands with Phase 6, because the edge rebuilds each request from an allowlist and the gateway is the file that
phase touches. A nightly check reads the day's median hit ratio and first-token time and opens an issue when either
crosses its line, so a silent invalidator is caught the day it lands. The edge stays the key holder; the extra hop is
measured (the trace log gains a gateway timestamp) before anything is done about it. Fast mode and Priority Tier are
not budgeted for either model.

### 5.9 The client (fix)

`legacy-bridge/ask/context.ts` holds the providers and the warm call; `api.ts` sends the context with every turn;
`commit.ts` walks the spec. The Stage, the takeover, the one button, the chips and the quick answers do not change. The
Reports and Today doors stay; the first run gets the palette mounted (⌘K flips a hidden state there today) with the
`start` surface, so "what is left to set up?" is answered from the steps in front of the person. The seeded palette's
demo intents stay demo.

### 5.10 Evals and proof (fix)

Two tiers, named for what they prove. **The harness test** runs in CI against a scripted model through the ports that
exist (`setAskPorts`): it proves routing, RLS, read-set enforcement, card assembly and prefix stability with zero model
variance and zero spend; it is not an eval and is never quoted as one. **The gate** runs the real model at the exact
production configuration on a case set built the way the January 2026 guidance builds one: twenty to fifty cases per
surface drawn from real palette questions, each with a context fixture from the nightly's workspace, both directions
covered (needs no tool, needs one, must decline), scope and two-turn cases, a card case per kind, a held-out slice never
tuned against, two or three repetitions with confidence intervals, and the smallest change worth shipping written down
before the run. It grades outcomes, never the tool path: answer correctness by a rubric judge on a different model with
structured output and an "unknown" escape, calibrated on a few dozen human labels; cited ids inside the read set, card
kind and payload, latency and tokens, all programmatic. Must-never behaviours (a foreign id, an act without a card, a
claim of a write) report pass^k; helpfulness reports pass@1. Single-turn cases run through the Message Batches API at
half price with the one-hour cache TTL; cases with a tool round run interactively. Production transcripts are sampled
weekly and real failures promoted to cases; saturated capability cases graduate to the regression suite. The gate stays
Ruben's to run, with its turn count and cost said before it starts, and it stops at the first credit refusal (the key is
the receptionist's).

### 5.11 The model (new; decided at approval)

Ask is built model-agnostic. The turn, the registry, the prompt, the context blocks, the specs, the read set and the
store know nothing of the model but its name and the effort it is asked at. What differs between the models Ask may
name lives in one profile in contracts, so a switch is one environment variable and a redeploy, never a code change.

```ts
// packages/contracts/src/ask-model.ts
export const ASK_MODELS = ["claude-opus-5-5", "claude-sonnet-5"] as const;
export interface AskModelProfile {
  id: AskModelId;
  effort: "low" | "medium"; // identical on every round of a thread
  forcedToolChoice: boolean; // recorded, never used: Ask sends auto and none only
  thinking: "always" | "adaptive"; // either way its blocks go back unmodified
}
export const ASK_MODEL: AskModelId = "claude-opus-5-5"; // the default
export function askModelProfile(name: string | null | undefined): AskModelProfile; // one of the list, else the default
```

The dashboard picks the profile once from `ASK_MODEL` in its environment (`server/ask/model.ts`), validated against
the list, the default when unset or unknown (and a warning in the log when unknown). The loop sends the profile's id and
effort; the route stores the id the turn ran on; the edge gateway's allowlist is built from the same list, so the two
cannot disagree. The eval runner prices both.

**Opus 5.5 is the default.** Ruben's decision at approval, 25 Sep 2026: on the 23 Sep gate it wrote its first words a
second sooner (2.2–2.3 s against 3.1–3.3 s median) and answered in one round far more often (25–26 of 28 against
13–15), at $0.012 a turn against $0.010; it lost that gate on grounding (24, 23, 22 of 28 against 27 every run: it
skipped a read and cited an unread row, and twice claimed a card it never proposed). The rewire addresses exactly the
conditions under which it lost: the page's rows arrive before round 1, so there is no read to skip; the read set is a
map of RowRefs, so an unread row cannot be cited; cards are built from a spec, so a claimed card is a made card.

**What the loop guarantees for every model in the list**, checked by the harness: `tool_choice` is `auto` or `none`
and never `any` or a named tool (a 400 on Opus 5.5); thinking blocks and redacted thinking go back exactly as they came;
the history is append-only within a turn and across a warm replay; the effort is the same on every round; no sampling
parameter is sent; the round ceiling is one number the edge also clamps to.

**The gate is a confirmation, not a decision.** Phase 0 re-runs the case set three times on each model through the
new runner, at the production configuration, before and after the default flips; must-never cases report pass^k. The
rule of the Line's spec (8.3) still names what to watch: a must-never case that fails on Opus 5.5 and passes on Sonnet 5
is reported to Ruben the day it is seen, with the case and the transcript, and the variable can flip production back
without a code change. It is never reverted silently.

## 6. Files and patterns

The tree after the change. Every file stays under 400 lines, which is the ceiling the two big ones broke.

```
apps/dashboard/src/server/ask/
  index.ts                 runAskTurn, the one export the route calls
  model.ts                 the profile this deployment runs on (ASK_MODEL in the environment)
  turn/
    loop.ts                rounds, budget, the answer (from today's loop.ts, half its size)
    round.ts · stream.ts   the gateway stream and its frames (gateway.ts + sse.ts)
    grounding.ts           the RowRef read set, normalizeAnswer's partner
  context/
    context.ts             buildContext(ctx, PageContext) → { block, rows }; the warm cache
    providers/             today · inbox · people · leads · pipeline · calendar · reports · campaigns · settings · start · other
  tools/
    registry.ts            defineRead, defineAct, toApiTools(role), runTool
    read/                  one file per read tool, each ≤ 60 lines over a reader
    act/                   one file per card kind: check() over its ProposalSpec
  prompt/
    rules.ts · definitions.ts · examples.ts · facts.ts · shape.ts · system.ts
  store.ts
  (gone) snapshot.ts · prefetch.ts · tools.ts · proposals.ts

apps/dashboard/src/server/readers/
  index.ts                 Reader, RowRef, TurnCache, ReaderCache
  today.ts · inbox.ts · thread.ts · person.ts · calls.ts · report.ts · calendar.ts · openings.ts
  people.ts · lists.ts · audiences.ts · playbooks.ts · broadcasts.ts · leads.ts · searches.ts
  pipeline.ts · notifications.ts · connections.ts · settings.ts · facts.ts · activity.ts · messages.ts
  (the /api/v1 GET routes import from here; server/<domain>.ts keeps the writes and the ports)

packages/contracts/src/ask/
  limits.ts · citations.ts · context.ts · proposals.ts · surfaces.ts · suggestions.ts · quick.ts · answer.ts
  (ask.ts (898) and ask-answer.ts (889) split; every export keeps its name, the barrel re-exports)
packages/contracts/src/ask-model.ts   the profiles (Phase 0)

apps/dashboard/src/legacy-bridge/ask/
  api.ts · commit.ts (a spec walk) · palette.ts · speech.ts · context.ts

apps/dashboard/app/api/v1/ask/
  route.ts · warm/route.ts · openings/route.ts · threads/… · messages/…

supabase/migrations/
  001xx_messages_have_a_text_index.sql   a generated tsvector on messages.body and calls' transcript text, GIN, RLS unchanged
  001xx_ask_tokens_day.sql               one SUM; the gateway stops shipping rows

tooling/scripts/tests/
  ask-context.test.mjs · ask-readers.test.mjs · ask-registry.test.mjs · ask-specs.test.mjs · ask-turn.test.mjs (scripted model)
tooling/evals/
  ask-cases.json           per surface, with context fixtures, scopes, two-turn and one case per card
```

Three patterns, as they would read:

```ts
// server/readers/report.ts — one reader; the route and the tool both call it
export const report: Reader<{ days: 7 | 30 | 90 }, ReportRead> = {
  name: "report",
  async read(rc, { days }) {
    const [series, people] = await Promise.all([reportSeries(rc, days), load(rc, readers.people, undefined)]);
    const booking = await bookingReport(rc, people.data, days).catch(() => null);
    const deals = await dealReport(rc, days, people.data).catch(() => null);
    return {
      data: { report: series, booking, deals },
      rows: [page("reports", `Reports, ${days} days`)],
      stamp: now(),
    };
  },
};

// server/ask/tools/read/get-report.ts — the tool is a projection, not a second read
export default defineRead({
  name: "get_report",
  description:
    "The Reports page for 7, 30 or 90 days: answered by whom, reply time, calls, bookings after asking, deals, and the change against the period before. Call it for any question about how the business is doing over a period; for one person's history call people get, and for today's queue call today. Returns the page's tiles as figures with their period label. Never returns individual conversations.",
  input: z.object({ days: z.union([z.literal(7), z.literal(30), z.literal(90)]) }),
  examples: [{ days: 7 }, { days: 30 }],
  reader: readers.report,
  forModel: ({ report, booking, deals }, detail) => {
    const vm = toReportVM(report); // the page's own builder, as the bridge applies it
    return {
      range: vm.rangeLabel,
      tiles: vm.tiles.map(tile),
      booking: booking?.line ?? null,
      deals: detail === "full" ? deals : (deals?.summary ?? null),
    };
  },
});

// legacy-bridge/ask/context.ts — a provider reads what the page already holds
registerContext("reports", (w) => ({
  v: 1,
  surface: "reports",
  route: w.location.hash.slice(2),
  view: String(w.__REPORTS?.days ?? 7),
  rows: [{ kind: "page", id: "reports" }],
  focus: null,
  askedAt: Date.now(),
}));
```

## 7. What stays out

Each of these was considered and left out on purpose, with the reason and where the job lives instead. This is what
keeps Ask from becoming a clutter of either code or answers.

| Left out                                                           | Why                                                                                                                                           | Where the job lives |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Acting without a card                                              | The charter. Every act is approved by a person through the verb's own route, where role and state are checked again.                          | the cards           |
| Booking, moving or cancelling an appointment                       | There is no appointments table by decision (0002); the receptionist sends the link and never books.                                           | the booking link    |
| Anything about money                                               | The money class is locked by a database trigger; a policy card cannot touch it.                                                               | the charter         |
| A free-form query tool ("ask the database")                        | It would state facts no page can show, outside the view models and the read-set rule. Every read is a named reader with a projection.         | the registry        |
| Recording a consent answer                                         | A yes is written from the customer's own message or a signed form with its evidence; words in a chat are neither.                             | the person's page   |
| Keep, Exclude or Stop on a lead, and Keep/Stop on a waiting search | Each is one press on the row or the strip, and the waiting search's Keep/Stop is a recorded no.                                               | the Leads page      |
| Handing over or ending a live call                                 | Both ask before they act on Live; a card would be a second confirmation of a thing that must be pressed while listening.                      | Live                |
| Editing the receptionist's prompt, tone or instructions box        | The prompt preview is the prompt; a card that edits free text the receptionist reads verbatim is an unreviewed change to what customers hear. | Settings › Business |
| A general assistant persona (web, opinions, small talk)            | Ask is the workspace spoken; anything outside it is a guess dressed as an answer.                                                             | nowhere             |
| Reading other workspaces, or a cross-workspace view                | RLS is the floor; the back office is its own surface for platform staff.                                                                      | the back office     |
| Routing hard questions to a second, larger model                   | A router adds a decision and a cache miss to every turn. One model per deployment (§5.11); the profile is the switch.                         | the model profile   |
| Server-side speech to text                                         | A provider key and spend, which is Ruben's decision; the browser's recogniser stays.                                                          | Ruben               |
| Sending the page's facts from the tab                              | The tab sends ids; the server re-reads under RLS. Anything else lets a tab tell the model what is true.                                       | the context plane   |
| Long conversational memory across threads                          | Threads quote customers; ninety days and one person is the promise. What the receptionist should remember is a settings note.                 | the settings card   |

## 8. Planned elsewhere

Not in this plan because another plan owns it, or because it waits on Ruben. This plan leaves each a seam and takes
nothing from it.

| Item                                                                      | Owned by                                                               | The seam this plan leaves                                                                           |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| get_usage · propose_plan_change · the usage halo on the face              | decision 0011 and the usage spec v2 (branch docs/pricing-reassessment) | a reader slot `readers.usage` and a card spec slot; the registry takes them as two files            |
| Reach out: sending domains, the batch writer, leads as an audience        | the Reach out plans, Part 2.5 in flight                                | `readers.connections` already says a domain's state; a reach_out card is one spec when Part 3 lands |
| Campaigns on every channel: consent per channel, a version per channel    | the campaigns-on-every-channel spec                                    | the audiences reader carries the channel when the pool does                                         |
| The finder's question loop, its defects, Include re-judging               | the lead-question plans                                                | unchanged: the answer row still runs its turn through Ask with `answering`                          |
| The phone app, push routing                                               | mobile groundwork PRs 1–4                                              | the takeover is unchanged                                                                           |
| Note suggestions, the first run's live walk, after-the-first-run switches | their own plans                                                        | none needed                                                                                         |

## 9. Delivery

Eight phases, each a pull request (Phase 0 is two) mergeable on its own, each in the house shape: a spec status line,
one combined review round, gates green, either deploy order. The migrations are two, both additive, pushed to production
(dry run first) before their PR merges and held for Ruben. Each phase is a worktree of its own from `origin/main` at
the day it starts, with its plan written that day against that `main`; one implementer, one combined review, merged on
green. The order is the order the value arrives in: measure, then read once, then know the page.

**Targets** (measured by the Phase 0 telemetry, on the default model):

| Target                               | To       | From                 |
| ------------------------------------ | -------- | -------------------- |
| First words, median                  | ≤ 2.0 s  | 3.1–3.3 s (Sonnet 5) |
| One-round turns on on-page questions | ≥ 80%    | ~50% (Today only)    |
| Turn end to end, p95                 | ≤ 8 s    | 6–8 s median         |
| Cost per turn                        | ≤ $0.012 | $0.010 / $0.012      |
| Prompt cache hit ratio, median       | ≥ 80%    | unmeasured           |
| Citation kinds                       | 12       | 5                    |
| Lines in any Ask file                | ≤ 400    | 1,332                |
| Surfaces · card kinds in the evals   | 11 · 17  | 1 · 4                |

**Phase 0 · Measure first, and the model as a profile** (two PRs; plan `2026-09-25-ask-rewired-0-measure.md`).
PR 0.1: `ask_turn_shape` gains the three latencies, per-round model time, per-tool ms, the per-round tokens and the
cache hit ratio, the surface, the scope kind, whether the turn was a follow-up and how long after the last, and the
palette-open-to-question time the tab now sends; the same shape is stored on the turn's row; the eval runner gains
repetitions, a per-surface report with confidence intervals, first-trace and first-say timings kept apart, the
announcement of its turn count and cost before it starts, and a stop at the first credit refusal; a script prints a
day's production numbers per model and surface. PR 0.2: the model profile (§5.11), the dashboard's `ASK_MODEL`
variable, the edge allowlist built from the list, the default flipped to Opus 5.5. No migration. **Proof:** a day of
production numbers on each model before anything else moves, and the gate re-run three times on each; the baseline
rows of this document filled from them. The `defer_loading` probe of the canvas is dropped: the tool-search page lists
Opus 5.5; it is written only if Sonnet 5 is ever made the default again.

**Phase 1 · One read layer** (seven PRs; plan `2026-09-25-ask-rewired-1-readers.md`). `server/readers/` with RowRefs
and the two caches (the cross-turn cache holds the tenant's facts only until Phase 2); the `/api/v1` GET routes Ask's
world reads become one-liners over their readers, byte-equal (their tests unchanged, a query-log pin each); every Ask
tool reads the reader and applies the page's builder, so thirteen named divergences close on purpose; `tenantFacts`,
`sells_by`, the policies and the config read once a turn. The snapshot keeps its queries until Phase 2 replaces it. No
migration. **Proof:** route tests unchanged and a pure-move diff per route; `ask-turn`'s tool test updated only where a
divergence is named; the eval set holds. This phase ships nothing else.

**Phase 2 · The page context and the warm call.** Contracts `PageContext` and eleven surfaces; the client providers;
`POST ask/warm` as a data warm; the server providers and the context as `search_result` blocks in the user turn; the
shape of the workspace as the byte-stable second system block; the snapshot and the regex prefetch replaced (the
cross-page nouns kept inside the context builder); focus from the client; scope kinds grown; a cache breakpoint on the
context only if Phase 0's follow-up rate earns it. No migration. **Proof:** eval cases per surface with context
fixtures; one-round rate and first-token time against the Phase 0 baseline; the e2e ask spec asks one question on each
of five surfaces.

**Phase 3 · The registry and the specs.** `defineRead`/`defineAct` with zod, generated schemas, the reads consolidated
under `action` parameters to about twenty-two tools, three-to-four-sentence descriptions with `input_examples` where
inputs have a shape, concise-or-full results, the rules moved into the stable block; `ProposalSpec` per kind in
contracts, `commit.ts` a spec walk, `cardOpenRoute` and `PROPOSAL_GATE` folded in; the wake undo and the reply voice
closed by the spec; the route accepts the voice. No migration. **Proof:** a test that every tool's schema equals the zod
schema; a test that every spec commits and undoes over a fake client; the existing ask-commit tests rewritten over the
specs.

**Phase 4 · Aware of all data.** Readers and tools for leads, pipeline, lists, broadcasts, notifications, connections,
activity and message search; citation kinds to twelve; four new cards (note, list, run, person_details); the text index
migration and the search reader. Migration: the text index (additive, RLS unchanged), pushed before the merge, either
order works. **Proof:** a case per new tool and card in the eval set; a db test that the index answers under RLS as the
person; the wiring map's Ask column re-read.

**Phase 5 · Memory.** Raw turn blocks stored for a warm verbatim replay; the compact rebuild with cards, outcomes and
cited ids for a cold reopen; replay bounded to twelve turns; newest-sixty; scope updated per turn; a name as a scrub
needle. No migration. **Proof:** two-turn eval cases; a db test for the scrub.

**Phase 6 · The gateway and the budget.** `ask_tokens_day` in SQL; the gateway sums by it; `diagnostics.previous_message_id`
through the gateway in development; the hop timestamp; the nightly hit-ratio check with its issue. Migration: one
function (additive). **Proof:** the budget refusal still fires at the line (a db test); the nightly opens an issue on a
forced miss.

**Phase 7 · The first run and the last doors.** The palette mounted on `#/start` with the `start` surface; ⌘K jumps for
Pipeline, Memory and the back office; the demo palette's stale comments and the registry's stale rows corrected. No
migration. **Proof:** the e2e first-run spec asks a question; the jump index test lists every real surface.

Phases 0–3 are the recode and carry most of the value; 4–7 add reach.

## 10. Risks

| Risk                                                                     | Where it bites                                                                          | What holds it                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The context blocks get a cache breakpoint that is written and never read | a per-person entry is read only if the same person asks again inside the TTL            | the blocks ride uncached until Phase 0's follow-up counter says otherwise; they are identifiers, so uncached is cheap                                                                                |
| Tool selection degrades as the set grows                                 | the docs put tool search at about twenty tools and degradation at thirty to fifty       | eleven read and eleven act tools through `action` parameters; descriptions at the documented length; tool search as the fallback                                                                    |
| Low effort under-thinks a hard question                                  | Sonnet 5 follows effort strictly at the low end; Opus 5.5 at low is measured in Phase 0 | a steering sentence on the question's turn first; a `medium` route with its own prefix for the kinds the eval names; never a mid-thread effort change                                                |
| Opus 5.5 grounds worse than Sonnet 5 on the rewired loop                 | the 23 Sep gate: a skipped read, an unread row cited, a card claimed and not made       | the read set as a RowRef map, cards from specs, the page's rows before round 1; the gate re-run on both at Phase 0 and after Phase 3; a must-never regression is reported the day it is seen (§5.11) |
| A tab sends ids it should not see                                        | the context rows                                                                        | every id is re-read under the person's RLS; a miss is a miss, never an error that names the row                                                                                                     |
| Readers change a route's answer                                          | Phase 1 touches every GET route                                                         | snapshot tests byte-compare each route before and after; the eval set holds; the phase ships nothing else                                                                                           |
| The warm call becomes a load                                             | a palette opened often on a large workspace                                             | it reads what the page read a moment ago through the same caches; sixty-second key; the aggregate bucket rate-limits it                                                                             |
| The text index grows the database                                        | messages and transcripts                                                                | a generated column and a GIN index, sized on the largest workspace before the migration is pushed; RLS unchanged                                                                                    |
| Evals spend the shared key                                               | every production run                                                                    | the CI run uses the scripted model; the production gate says its turn count and cost before it starts and stops at the first credit refusal                                                         |
| The answer gets cleverer and longer                                      | more context invites more words                                                         | the format's caps are unchanged; the judge fails a headline over one sentence; nothing here loosens Say · Show · Do                                                                                 |
