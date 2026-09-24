# Ask answers a search: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One implementer and ONE combined review round per task (Ruben's rule), then fix and move on.

**Goal:** a proposal can say which search it amends, the commit door answers that search through the answer route (which owns the answer's version and count), and a search waiting on its owner is a row in Today's queue, a clause in Ask's Right now sentence and a pill beside it.

**Architecture:** the server owns the arithmetic of an answer (`answerPlanOf`, used by the route and by the proposal); the model learns which search asks what from `list_lead_searches` and says so through `propose_lead_search`'s `amends`; the commit door posts the answer when a card carries `amends`; the Leads page's answer row rides the same card and door; contracts' Today builder takes the searches as a sixth input and speaks the waiting one in the queue's grammar; the palette hands the same row to Ask's sentence, pills and Brief me.

**Tech stack:** Next route handlers and `server/ask` (TypeScript), `legacy-bridge` TypeScript, `packages/contracts` (tsup dist, committed), the legacy Babel JSX pages under `apps/dashboard/src/legacy`, node:test suites under `tooling/scripts/tests`.

**Spec:** `docs/superpowers/specs/2026-09-24-ask-answers-a-search-design.md` (G1–G10).

**Gates (every task):** `corepack pnpm --filter "./packages/*" build` when contracts change (then commit the dist), the changed test files with `node --conditions=react-server --import tsx --test <files>`, `corepack pnpm exec prettier --check <changed files>`; Task 6 runs everything (`corepack pnpm test`, `typecheck`, `lint`, `format:check`). Never add a `readCode` assertion (`source-scan-ratchet.test.mjs`); bump `?v=` in `apps/dashboard/src/legacy/Chanlytics.html` for every legacy file changed (the manifest lists are pinned identical by `legacy-harness.test.mjs`). Files are CRLF: edit with tools that keep line endings (the Edit tool, or a python `sub()` that converts `\n` to the file's ending). Branch: `feat/ask-answers-a-search` (worktree `cm-onebutton`, from `origin/main` at `11584033`).

---

### Task 1: The server owns an answer's plan; the model knows which search asks what; a proposal may amend

**Files:**
- Modify: `apps/dashboard/src/server/leads.ts` (add `answerPlanOf`, near `searchRow`)
- Modify: `apps/dashboard/app/api/v1/lead-searches/[id]/answer/route.ts` (apply it on `include`)
- Modify: `apps/dashboard/src/server/ask/tools.ts` (`list_lead_searches`: the question, the note, the description)
- Modify: `apps/dashboard/src/server/ask/proposals.ts` (`propose_lead_search`'s schema and `proposeLeadSearch`)
- Modify: `apps/dashboard/src/server/ask/prompt.ts` (the general Leads line at ~71 and the Leads-surface line at ~310)
- Test: `tooling/scripts/tests/lead-routes.test.mjs`, `tooling/scripts/tests/lead-ask.test.mjs`, `tooling/scripts/tests/ask.test.mjs`

- [ ] **Step 1: `answerPlanOf` in `server/leads.ts`** (one derivation, G1), beside `searchRow`:

```ts
/**
 * The plan an answer carries, as the door takes it (lead_round_answer, 00140): the version after the round's, at the
 * count the round reserved. A client may send any version and count; this is the one place that sets them, for the
 * route and for a proposal that amends (server/ask/proposals.ts).
 */
export function answerPlanOf(search: Pick<SearchViewRow, "plan" | "plan_version">, plan: LeadSearchPlan): LeadSearchPlan {
  const reserved = (search.plan as LeadSearchPlan | null)?.count;
  return { ...plan, version: (search.plan_version ?? 1) + 1, count: typeof reserved === "number" ? reserved : plan.count };
}
```

- [ ] **Step 2: the route applies it.** In the answer route's `handle`, replace the rpc's plan spread with `...(input.plan ? { p_plan: answerPlanOf(search, input.plan) as unknown as Json } : {})`; import `answerPlanOf` from `@/server/leads`. Update the route's doc comment: "Include amends the plan: the route sets its version (the round's + 1) and count (the round's reservation), so a client never computes them."

- [ ] **Step 3: route test.** In `lead-routes.test.mjs`, the test "the answer takes the search's latest round…" sends `plan: { ...PLAN, version: 2, exclusions: [] }` and asserts `p_plan?.version` 2. Send `version: 7, count: 500` instead and assert the rpc saw `[R1, "include", 2]` with `p_plan.count === PLAN.count` ("the route sets the version and the count; what the client sent is not trusted"). Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-routes.test.mjs`.

- [ ] **Step 4: `list_lead_searches` says the question.** In `tools.ts` `listLeadSearches`, add per row `question: r.state === "waiting_on_owner" && r.question && typeof r.question === "object" && typeof (r.question as { sentence?: unknown }).sentence === "string" ? cut((r.question as { sentence: string }).sentence) : null` (a search not waiting has `null`). Change the note to: `"Counted is what came off this month's leads. A search with a question is waiting for the owner's answer: to answer it with a change, propose_lead_search with amends set to its id, carrying the same plan with the answer applied and everything else as it was; to carry on unchanged or stop it, the owner presses Keep going or Stop on Leads. Nothing here has started or changed because you read it; a new search is propose_lead_search without amends, which becomes a card the owner approves."`. The tool description gains: `", and, for a search that stopped to ask, its question"`. Update the key list in `lead-ask.test.mjs`'s "list_lead_searches says what was asked…" test (`question` joins the sorted keys) and assert `s.searches[0].question === null`; add a `world()` row later in Step 6 for the waiting one.

- [ ] **Step 5: `propose_lead_search` may amend.** Schema: add `amends: { type: "string" }` to the properties (not required) and this to the description's end: `" amends: the id of a search that stopped to ask (list_lead_searches shows its question) when the plan is that search with the owner's answer applied; the card then answers that search instead of starting a new one."`. In `proposeLeadSearch`, after `planLeadSearch` succeeds and before `propose`:

```ts
  const amends = str(input.amends, 40);
  let answer: { search_id: string; name: string; question: string } | null = null;
  let plan = r.plan;
  if (amends) {
    // The search it answers is read, never trusted from the words: one not waiting (or not this workspace's) is a
    // refusal in words, so the model says so instead of a card that would start a second search.
    let row: SearchViewRow | null = null;
    try {
      row = await searchRow(t.ctx, t.tenantId, requireUuid(amends, "search"));
    } catch {
      row = null;
    }
    if (!row) return refuse("that search is not in this workspace; propose a new search instead");
    const q = row.question && typeof row.question === "object" ? (row.question as { sentence?: unknown }).sentence : null;
    if (row.state !== "waiting_on_owner" || typeof q !== "string")
      return refuse("that search is not waiting for an answer; propose a new search instead");
    plan = answerPlanOf(row, r.plan);
    answer = { search_id: row.id, name: row.name, question: q };
  }
  return propose({
    kind: "lead_search",
    needs: "owner",
    title: r.view.title,
    summary: answer ? `Answers “${answer.question}”: ${planSentence(plan)}` : planSentence(plan),
    payload: {
      plan,
      view: r.view,
      facts: await planFacts(t.ctx, t.tenantId, { categoryKey: shaped.data.category_key, now: t.now }),
      ...(answer ? { amends: answer } : {}),
    },
    // An answer carries the round on; there is nothing to undo (Stop is the strip's).
    undo: answer ? null : "Stop the search",
  });
```

Imports: `searchRow`, `answerPlanOf`, `type SearchViewRow` from `../leads` (beside `planFacts`); `requireUuid` from `../request-guards` (check the path other server/ask files use; `AppError` is thrown for a bad uuid, caught by the try). `str` is the module's own helper.

- [ ] **Step 6: proposal tests** in `lead-ask.test.mjs`. Add a third `world()` row `viewRow({ id: SEARCH3, name: "Personal trainers in Austin", state: "waiting_on_owner", ending: null, plan_version: 1, question: { sentence: "Most of the first 25 are chain gyms. Include them?", criterionKey: "chains" }, waiting_since: "2026-09-19T14:00:00Z" })` (a new `SEARCH3` constant). New test "propose_lead_search with amends answers a waiting search: the plan at the round's next version and count, the question on the card, no undo": `buildProposal(t, "propose_lead_search", { ...MODEL_INPUT, count: 50, leave_out: [], amends: SEARCH3 })` → `out.isError === false`; `payload.plan.version === 2`; `payload.plan.count === PLAN.count` (200, the round's, not the 50 the model wrote); `payload.amends` deep-equals `{ search_id: SEARCH3, name: "Personal trainers in Austin", question: "Most of the first 25 are chain gyms. Include them?" }`; `summary` starts with `Answers “Most of the first 25`; `undo === null`. Then `amends: SEARCH2` (running) → `isError`, `/not waiting for an answer/`; `amends: "not-a-uuid"` and an unknown uuid → `/not in this workspace/`. Keep the existing tests green (no `amends` → unchanged).

- [ ] **Step 7: the prompt.** Line ~71 gains, after "…never a search.": `"A search with a question in list_lead_searches is waiting for the owner's answer: words that answer it are propose_lead_search with amends set to that search's id, the same plan with the answer applied; to carry on unchanged or stop it, the owner presses Keep going or Stop on Leads."` The Leads-surface line (~310) gains, after "…the kind or the place is missing.": `" If a search on this page is waiting for an answer, words that answer its question amend it (amends), and \"this search\" is the one the scope names."` In `ask.test.mjs` the Leads-surface pin (line ~271) stays; add `assert.ok(leads.includes("amends"), "an answer amends the search that asked")`.

- [ ] **Step 8: gates and commit.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/lead-routes.test.mjs tooling/scripts/tests/lead-ask.test.mjs tooling/scripts/tests/ask.test.mjs tooling/scripts/tests/ask-turn.test.mjs`; prettier on the changed files; commit "An answer's plan is the server's, and a proposal may amend the search that asked".

---

### Task 2: The commit door answers, and the card opens on the question

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/ask/commit.ts` (`lead_search` case)
- Modify: `packages/contracts/src/ask-answer.ts` (`cardOpenRoute`)
- Modify: `apps/dashboard/src/legacy/pages/ask-turn.jsx` (`approveWith`'s navigation)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (`ask-turn.jsx?v=6` → `7`)
- Test: `tooling/scripts/tests/lead-ask.test.mjs`, `tooling/scripts/tests/ask-answer.test.mjs`, `tooling/scripts/tests/ask-palette.test.mjs` (the card's approve at ~1690)

- [ ] **Step 1: the door.** In `commit.ts`'s `case "lead_search"`, before the post:

```ts
      const amends = (pl.amends ?? null) as { search_id?: unknown; name?: unknown } | null;
      if (amends && typeof amends.search_id === "string" && amends.search_id) {
        // The card answers the search that asked (spec G4): the route sets the answer's version and count.
        const a = await viaAsk(client, "POST lead-searches/[id]/answer", {
          params: { id: amends.search_id },
          body: { answer: "include", plan: pl.plan } as never,
        });
        if (!a.ok) return a;
        return { ok: true, receipt: `Answered. ${s(amends.name) || "The search"} carries on with your answer; Leads shows it.`, undo: null };
      }
```

- [ ] **Step 2: `cardOpenRoute`.** In the `lead_search` case, first: `const am = (pl.amends ?? null) as { search_id?: unknown } | null; if (am && typeof am.search_id === "string" && am.search_id) return leadQuestionRoute(am.search_id);` (import `leadQuestionRoute` from `./leads` beside `leadsRoute`). The comment: "A card that answers a search opens on that search, on the pile it asked about; a card approved opens on the search it made."

- [ ] **Step 3: `AskCard` navigates by the contract.** In `ask-turn.jsx` `approveWith`, replace the `if (p.kind === "lead_search" && r.undo && r.undo.search_id && …)` guard with `if (p.kind === "lead_search" && onNav && A && A.cardOpenRoute)` and keep the `to` computation and `if (to) onNav(to)`. Bump `ask-turn.jsx?v=7`.

- [ ] **Step 4: tests.** `lead-ask.test.mjs`: a new test "a card that amends posts the answer to the search that asked, with no undo and opening on its question": `fakeClient({ [\`POST /api/v1/lead-searches/${SEARCH3}/answer\`]: { round_id: ROUND, answered: "include" } })`, `commitProposal(win, { …kind "lead_search", payload: { plan: { ...PLAN, version: 2 }, amends: { search_id: SEARCH3, name: "Personal trainers in Austin", question: "…" } }, undo: null }, client)` → `[ok, receipt, undo]` = `[true, "Answered. Personal trainers in Austin carries on with your answer; Leads shows it.", null]`; `calls[0].headers["x-via"] === "ask"`; `calls[0].body` deep-equals `{ answer: "include", plan: { ...PLAN, version: 2 } }`; and no `POST /api/v1/lead-searches` was reached. `ask-answer.test.mjs`: `cardOpenRoute({ kind: "lead_search", payload: { plan: {}, amends: { search_id: "s9" } } })` equals `leadQuestionRoute("s9")` (import it), and the existing outcome case still answers the made search's route. `ask-palette.test.mjs` ~1690: the approve test stubs `commit` returning `undo: { search_id: "s1" }` and asserts navigation; add a second stub returning `{ ok: true, receipt: "Answered…", undo: null }` for a card whose payload carries `amends: { search_id: "s1", name: "…" }` and assert the Line navigated to `leadQuestionRoute("s1")` (read how that test asserts the hash/route and follow it).

- [ ] **Step 5: gates and commit.** Build contracts; run `lead-ask`, `ask-answer`, `ask-palette`, `ask-turn`, `ask-commit` tests; prettier; commit "The commit door answers the search a card amends".

---

### Task 3: The page's answer row rides the same card and door

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/leads-finder.jsx` (`leadFinderAmendAsk`, `leadAnswerPlan`, `leadFinderApprove`)
- Modify: `apps/dashboard/src/legacy/pages/clients-a.jsx` (`answerOf`)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (`leads-finder.jsx?v=5` → `6`, `clients-a.jsx?v=67` → `68`)
- Test: `tooling/scripts/tests/leads-finder.test.mjs` (the three "answering:" tests; `ANSWERING` fixture)

- [ ] **Step 1: the prefix names the id and the tool.** `leadFinderAmendAsk(a, words)` becomes:

```js
const leadFinderAmendAsk = (a, words) =>
  `On People › Leads, my search for ${a.name} (search id ${a.searchId}) stopped to ask: “${a.question}” ` +
  `I had asked for: “${a.asked}”${a.leavingOut && a.leavingOut.length ? `, leaving out ${a.leavingOut.join(", ")}` : ""}. ` +
  `My answer: ${String(words || "").trim()}. Propose the same search with my answer applied (propose_lead_search with amends set to that id), and keep everything I did not change.`;
```

(`a.searchId` is already in `set.more` beside `answer`.)

- [ ] **Step 2: `leadAnswerPlan` takes the card as it comes.** Replace the card branch: a card whose `payload.amends` is missing is not an answer: `set.refusal("That would start a new search. Say your answer to the question instead."); set.stage("compose"); return null;`. With `amends`: `set.proposal(card); set.plan(p); set.stage("plan"); return card;` (no version or count arithmetic: the server set both, G1). Update the doc comment.

- [ ] **Step 3: `leadFinderApprove`: one path for a card.** Delete the `if (set.more && set.more.answer && window.__leadSearchAnswer)` branch; the `else if (proposal)` branch (commit through `window.__ask.commit`) is first. Keep `__leadSearchMore` for a strip-born plan with no card. The strip's Include (no card, `set.more.answer` true, `proposal` null) still needs the answer door: add, after the proposal branch, `else if (set.more && set.more.answer && window.__leadSearchAnswer) r = await window.__leadSearchAnswer(set.more.searchId, "include", plan);` (the route sets the version and count). Update the doc comment: an answer that came back from Ask commits as its card; an Include opened on the page posts the plan and the route versions it.

- [ ] **Step 4: `answerOf(s)` in `clients-a.jsx`** drops `baseVersion` and `count` (its comment: "the question, the search's id and name, what was first asked and what it leaves out, so one Ask turn can amend the same search; the version and count are the route's"). `searchId` is set by the callers' spread (`{ searchId: s.id, purpose: "topup", ...answerOf(s) }`) already. Grep `baseVersion` and `m.count` in both pages to be sure nothing else reads them (the `LeadPlanCard` prop `baseVersion` is the card's own and stays).

- [ ] **Step 5: tests.** In `leads-finder.test.mjs`: the `ANSWERING` fixture gains `searchId: "s-b"` if it lacks one and loses `baseVersion`/`count`. Test 1 ("answering: the panel says the question…"): the fake `send` answers a card whose payload carries `amends: { search_id: "s-b", name: "personal trainers", question: ANSWERING.question }` and `plan: { ...amended, version: 2, count: 200 }`; assert the prefix matches `/search id s-b/` and `/propose_lead_search with amends/`; the plan shown is the card's own (`version 2, count 200`) with the assertion's words "the server's version and count, as the card carries them". Add: a card without `amends` → `leadAnswerPlan` returns null, `st.refusal === "That would start a new search. Say your answer to the question instead."`, `st.stage === "compose"`. Test 3 ("…approving answers include at the next version…"): `__leadSearchAnswer` throws ("an answer from Ask never posts from the page"), `__ask.commit` records the proposal it got and returns `{ ok: true, receipt: "Answered…", undo: null }`; approve with `set.more = ANSWERING` and a proposal whose payload has `amends` → `r.ok`, the commit saw `payload.plan` equal to the plan approved and `payload.amends` intact, `[s2.open, s2.stage] = [false, "compose"]`. Then the page's Include: `proposal: null`, `set.more = ANSWERING`, `__leadSearchAnswer` records `[id, a, plan.version]` → `[["s-b", "include", 4]]` with the plan sent as given ("the route versions it").

- [ ] **Step 6: gates and commit.** `node --conditions=react-server --import tsx --test tooling/scripts/tests/leads-finder.test.mjs tooling/scripts/tests/leads-honest.test.mjs tooling/scripts/tests/legacy-harness.test.mjs`; prettier; commit "The answer row's card commits through Ask's door".

---

### Task 4: A search waiting on you is in Today's queue

**Files:**
- Modify: `packages/contracts/src/today.ts` (`TodayQueueRowVM.kind` and `.channel`, `toTodayVM`'s sixth argument, the queue section, `parts`, `waiting`)
- Modify: `apps/dashboard/src/legacy-bridge/surface-data.ts` (`todayOverride`: the fetch, `refreshOnTables`, `refreshWhen`)
- Test: `tooling/scripts/tests/today-queue.test.mjs`, `tooling/scripts/tests/today-page.test.mjs`

- [ ] **Step 1: the row type.** `kind: "handoff" | "callback" | "window" | "call" | "search"`; `channel: "WhatsApp" | "Phone" | "Text" | "Email" | "Leads"` with a comment line: `"Leads" is a search waiting on its owner (spec G6), the one row that is not a person`.

- [ ] **Step 2: the input and the rows.** `toTodayVM(m, conversations, escalations, calls, now = new Date(), searches: LeadSearchDto[] | null = null)` — the sixth argument AFTER `now` so every caller stands (import `type LeadSearchDto` and `leadQuestionRoute` from `./leads`). In the queue section, after the calls loop and before the sort:

```ts
  // A search that stopped to ask waits on the owner like a person does (spec G6): its name, its question, one
  // button to answer it. Null: the searches were not read; the queue says nothing about them.
  const SEARCH_WARN_MS = 12 * 3600000; // the sweep stops a question after a day
  for (const s of searches ?? []) {
    const r = s.round;
    if (!r || r.state !== "waiting_on_owner" || !r.question) continue;
    const since = r.waiting_since ? new Date(r.waiting_since).getTime() : now.getTime();
    const waitedMs = Math.max(0, now.getTime() - since);
    queueAll.push({
      id: `q-s-${s.id}`,
      kind: "search",
      conversationId: null,
      callId: null,
      who: s.name,
      initials: initialsOf(s.name),
      channel: "Leads",
      when: `waited ${formatWaited(waitedMs)}`,
      sentence: r.question.sentence,
      quoted: false,
      status: ["Waiting for your answer", "nothing is spent while it waits"],
      tone: "escalated",
      warn: waitedMs > SEARCH_WARN_MS,
      cta: { label: "Answer", to: leadQuestionRoute(s.id) },
      also: null,
      waitedMs,
    });
  }
```

`parts`: add `searchN = countOf("search")` and the part `` searchN ? `${searchN} ${searchN === 1 ? "search" : "searches"} waiting for your answer` : "" `` after the "need you" part; `waiting: needN + winN + searchN`.

- [ ] **Step 3: the bridge reads the searches.** In `todayOverride.apply`, add `read("GET lead-searches").catch((e: unknown) => e as Error)` to the `Promise.all` (fifth), resolve it like calls: `let searches: LeadSearchDto[] | null = null; try { if (searchesRes instanceof Error) throw searchesRes; searches = searchesRes.searches; } catch (e) { console.error("today_searches_fetch_failed", …); }` and pass `searches` as the sixth argument (`toTodayVM(metrics, conversations, escalations, calls, undefined, searches)` — or pass `new Date()` explicitly; pick the one the file's style prefers). `refreshOnTables: [...DEFAULT_REFRESH_TABLES, "calls", "lead_rounds"]`; `refreshWhen` unchanged for `lead_rounds` (every change refreshes; the comment says a round that stops to ask is an UPDATE on it and each one changes what the queue says). Check the realtime subscription filter accepts `lead_rounds` (the leads override already lists it).

- [ ] **Step 4: tests.** `today-queue.test.mjs`: a `search` fixture (`LeadSearchDto` with `round: { state: "waiting_on_owner", question: { sentence: "Most of the first 25 are chain gyms. Include them?", criterion_key: "chains" }, waiting_since: "2026-09-06T11:00:00Z", … }` — copy the shape from `_lead-fixtures.mjs` if one exists, else the full `LeadSearchRoundDto`). New test "a search waiting on its owner is a row in the queue, by its wait, with one button to answer it": `toTodayVM(metrics(), conversations, escalations, calls, NOW, [waitingSearch, runningSearch])` → the kinds are `["search", "handoff", "callback", "window", "call"]` (3h waited sorts before the 2h handoff); the row: `who` the name, `channel` "Leads", `when` "waited 3h", `sentence` the question, `status` the two words, `tone` "escalated", `warn` false, `cta` `{ label: "Answer", to: leadQuestionRoute(id) }`, `also` null; `parts` includes "1 search waiting for your answer"; `waiting === 4`; a search waited 13h has `warn === true`; `searches: null` and the five-argument call are unchanged (`kinds` as before, `waiting` 3). `today-page.test.mjs`: with `TODAY_DATA` built from a VM that includes a waiting search, the queue draws `queue-search` with the name, "Leads, waited 3h", the question, and its button "Answer" navigates to `leadQuestionRoute(id)` (follow the file's `press`/`appNavigate` pattern).

- [ ] **Step 5: gates and commit.** Build contracts; run `today-queue`, `today-page`, `today-vm`, `today-sample` tests; `corepack pnpm --filter dashboard typecheck` (or the repo's typecheck script) for the bridge; prettier; commit "A search waiting on you is in Today's queue".

---

### Task 5: Ask says it too: the sentence, the pills, Brief me

**Files:**
- Modify: `packages/contracts/src/ask-answer.ts` (`AskWaiting`, `rightNowLine`, `rightNowCounts`, `needsAnswer`)
- Modify: `apps/dashboard/src/legacy-bridge/ask/palette.ts` (`waitingFrom`, `rightNowParts`, the `TODAY_DATA` type's row picks)
- Modify: `apps/dashboard/src/legacy/pages/ask-home.jsx` (the Right now row's third pill)
- Modify: `apps/dashboard/src/legacy/pages/ask-text.jsx` (`searchWaiting`, en and es)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (`ask-home.jsx?v=4` → `5`, `ask-text.jsx?v=7` → `8`)
- Test: `tooling/scripts/tests/ask-answer.test.mjs`, `tooling/scripts/tests/ask-palette.test.mjs`

- [ ] **Step 1: contracts.** `AskWaiting` gains `/** Searches that stopped to ask, waiting on the owner (Today's queue's search rows). */ searches: Array<{ id: string; name: string; question: string; to: string }>;`. `rightNowLine`: a third clause `searchesLine` — en: one → `your search for ${name} is waiting for your answer`, more → `${n} searches are waiting for your answer`; es: `tu búsqueda de ${name} espera tu respuesta` / `${n} búsquedas esperan tu respuesta`; the empty check becomes `if (!people && !runs && !searchesLine)`; join `[people, runs, searchesLine]`. `rightNowCounts` returns `{ people, runs, searches }` (`w.searches.length`; zeros for null). `needsAnswer`: after the people items and before the runs, `...w.searches.map((x) => ({ title: x.name, meta: "Leads", line: x.question, source: { kind: "page" as const, id: x.to, label: x.name, to: x.to, door: true } }))`. Every fixture that builds an `AskWaiting` gains `searches: []` (grep the tests and the bridge).

- [ ] **Step 2: the palette.** `waitingFrom`: `people` filters `r.kind !== "call" && r.kind !== "search"`; add `searches: (queue.rows ?? []).filter((r) => r.kind === "search").map((r) => ({ id: r.id, name: r.who, question: r.sentence, to: r.cta.to }))`; `more` stays `waiting - people.length - searches.length` (the queue's `waiting` now counts searches; Today's cap can hide one, and `more` must never go negative: keep `Math.max(0, …)`). `rightNowParts`'s type gains `searches: number` (it spreads `rightNowCounts`, so only the annotation changes).

- [ ] **Step 3: the Line.** `ask-text.jsx`: `searchWaiting: (n) => (n === 1 ? "1 search waiting" : `${n} searches waiting`)` (en) and `(n === 1 ? "1 búsqueda en espera" : `${n} búsquedas en espera`)` (es), beside `runsWaiting`. `ask-home.jsx`: the `now` item carries `searches: parts.searches`; `waiting = !!(it.people || it.runs || it.searches)`; a third pill `{it.searches ? <span className="pill pill-warn" data-testid="ask-pill">{t.searchWaiting(it.searches)}</span> : null}` after the runs pill; the fallback object in `parts` gains `searches: 0`. Bump both versions.

- [ ] **Step 4: tests.** `ask-answer.test.mjs`: the `waiting()` helper gains `searches: []` and a fourth argument `searches = []` (`{ id, name, question, to }` rows); `rightNowLine(waiting(["Ana"], 0, 0, [S]), "en")` → "Ana is waiting on you; your search for personal trainers is waiting for your answer."; two searches → "2 searches are waiting for your answer."; es for one; `rightNowCounts` → `{ people, runs, searches }`; `needsAnswer` lists the search after the people with `["personal trainers", "Leads", "Most of the first 25…", "clients/leads:s-…"]` (the route `leadQuestionRoute` gives) before the runs. `ask-palette.test.mjs` "the Line at rest…": add a `search` row to `TODAY_DATA.queue.rows` (`kind: "search", who: "personal trainers", channel: "Leads", when: "waited 3h", sentence: "…?", quoted: false, cta: { label: "Answer", to: "clients/leads:s-s1:c-excluded" }`) with `waiting: 2`; assert the sentence "Nora is waiting on you; your search for personal trainers is waiting for your answer." and the pills `["1 needs you", "1 search waiting"]`.

- [ ] **Step 5: gates and commit.** Build contracts; run `ask-answer`, `ask-palette`, `ask.test`, `legacy-harness`; prettier; commit "Ask says which search is waiting on you".

---

### Task 6: Everything, the docs, the PR

- [ ] **Step 1:** `corepack pnpm test` (the whole node suite), `typecheck`, `lint`, `format:check`; fix what fails. `source-scan-ratchet.test.mjs` must pass with the baseline unchanged or lower.
- [ ] **Step 2:** the spec gains a short "As built" section listing what differed; this plan's "As built" likewise.
- [ ] **Step 3:** merge `origin/main` into the branch (Chanlytics.html versions: take the higher; one above main's for files this branch changed; contracts dist: take theirs, rebuild, restore line-ending-only dists); push; open the PR with the body's four parts (what changes for a member, what changes in the code, what to know before merging, proof); watch CI; squash-merge on green; delete the branch; check production (`app.chanlytics.com`: Today's queue and the Line at rest on the e2e workspace, where no search waits: nothing new is drawn and nothing broke).

## As built

Tasks 1–5 landed as nine commits on `feat/ask-answers-a-search` (one implementer, one combined review and one fix commit per task): 50361d46 + fe855db6 (Task 1), 9629aec5 (Task 2, approved as is), 19ea44df + ec413902 (Task 3), 9684b77c + 08d0ac45 (Task 4), bf6db1c3 + 82d8c3e1 (Task 5). The review fixes are listed in the spec's section 6. The sibling packages' dists (channels, core, db, jobs) carry the hoisted `SEARCH_WARN_MS` line because they bundle contracts.
