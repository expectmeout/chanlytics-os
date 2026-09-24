# Ask is the finder: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. One implementer and ONE combined review round per task (Ruben's rule), then fix and move on.

**Goal:** the Leads finder's composer becomes Ask on a Leads surface (the three as the door, the takeover on a phone, the Stage on a desktop), its plan card is Ask's card and lands on the search; the page keeps the plan panel for a running search.

**Architecture:** contracts say the surfaces once and the leads suggestions; the server accepts the surface and steers the model from the prompt instead of a client prefix; the bridge feeds Ask from `window.__LEADS`; the Line draws the Leads surface and its card's two fixed doors; the Leads page loses its composer, its sheet's composer CSS, its second talk hook and its draft, and keeps `LeadPlanPanel`.

**Tech stack:** the legacy Babel JSX pages under `apps/dashboard/src/legacy`, `legacy-bridge` TypeScript, `packages/contracts` (tsup dist, committed), Next route handlers, node:test suites under `tooling/scripts/tests`, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-09-24-ask-is-the-finder-design.md` (F1–F12).

**Gates (every task):** `corepack pnpm --filter "./packages/*" build` when contracts change (then commit the dist), the changed test files with `node --conditions=react-server --import tsx --test <files>`, `corepack pnpm exec prettier --check <changed files>`; Task 5 runs everything. Never add a `readCode` assertion (`source-scan-ratchet.test.mjs`); bump `?v=` in `apps/dashboard/src/legacy/Chanlytics.html` for every legacy file changed (the manifest lists are pinned identical by `legacy-harness.test.mjs`). Files are CRLF: edit with tools that keep line endings.

---

### Task 1: The surface, said once; the prompt; the leads suggestions; the card's open route

**Files:**
- Modify: `packages/contracts/src/ask.ts` (AskSurface → ASK_SURFACES, ASK_SCOPE_KINDS, SuggestionInput, buildAskSuggestions, T words)
- Modify: `packages/contracts/src/ask-answer.ts` (`cardOpenRoute`)
- Modify: `apps/dashboard/app/api/v1/ask/route.ts` (read the lists from contracts)
- Modify: `apps/dashboard/src/server/ask/prompt.ts` (`turnSystem`)
- Modify: `apps/dashboard/src/legacy-bridge/ask/palette.ts` (`surfaceFor(page, param)`, feed leadIdeas/leadSearches)
- Test: `tooling/scripts/tests/ask.test.mjs` (surfaces, suggestions, prompt), `tooling/scripts/tests/ask-answer.test.mjs` (open route), `tooling/scripts/tests/ask-routes.test.mjs` (the surface accepted)

- [ ] **Step 1: contracts — the lists**

In `packages/contracts/src/ask.ts` replace the `AskSurface` type (line ~463) with:

```ts
/** The pages Ask knows it is on. The route accepts exactly these; the prompt names them. */
export const ASK_SURFACES = ["today", "inbox", "people", "leads", "conversations", "live", "reports", "settings", "other"] as const;
export type AskSurface = (typeof ASK_SURFACES)[number];
/** The kinds a scope may have: the same five a citation may name. */
export const ASK_SCOPE_KINDS = ASK_CITATION_KINDS;
```

`SuggestionInput` gains:

```ts
  /** On Leads: the first day's suggestion words (each a search to propose), and the latest searches' own words. */
  leadIdeas?: string[];
  leadSearches?: string[];
```

`T.en` gains `moreLike: "Find more like: {asked}"`, `T.es` gains `moreLike: "Encuentra más como: {asked}"`. In `buildAskSuggestions`, add to the `switch (input.surface)`:

```ts
    case "leads": {
      const ideas = (input.leadIdeas ?? []).filter(Boolean).slice(0, 3);
      for (const w of ideas) add(w, "ask", "search");
      if (!ideas.length) for (const a of (input.leadSearches ?? []).filter(Boolean).slice(0, 2)) add(t.moreLike.replace("{asked}", a), "ask", "search");
      break;
    }
```

Leave the `people`/`other` act lines as they are (Leads offers no offer/playbook act).

- [ ] **Step 2: contracts — the card's open route**

In `packages/contracts/src/ask-answer.ts`, `cardOpenRoute` (the `switch (p.kind)` at ~line 120): the `lead_search` case becomes

```ts
    case "lead_search": {
      const sid = p.outcome?.undo && typeof (p.outcome.undo as Record<string, unknown>).search_id === "string"
        ? String((p.outcome.undo as Record<string, unknown>).search_id) : null;
      return sid ? leadsRoute({ searchId: sid, list: "all", cls: null }) : "clients/leads";
    }
```

with `import { leadsRoute } from "./leads";` (check for an import cycle first: if `leads.ts` imports `ask-answer.ts`, write the route with the grammar `clients/leads:s-${sid}` and say so in a comment naming `leadsRoute`).

- [ ] **Step 3: the route reads contracts**

In `apps/dashboard/app/api/v1/ask/route.ts` replace the two hand-written sets (lines 41–42) with

```ts
const SCOPE_KINDS = new Set<string>(ASK_SCOPE_KINDS);
const SURFACES = new Set<string>(ASK_SURFACES);
```

importing both from `@chanlytics/contracts`.

- [ ] **Step 4: the prompt**

In `apps/dashboard/src/server/ask/prompt.ts`, `turnSystem` (line ~308), replace `if (t.surface) lines.push(...)` with:

```ts
  if (t.surface === "leads")
    lines.push(
      "They are on the Leads page, where the businesses Claude found for them are listed. Words that describe businesses (a kind, a place, a count) are a search to propose: read list_lead_searches, then propose_lead_search; ask only when the kind or the place is missing.",
    );
  else if (t.surface) lines.push(`They are on the ${t.surface} page.`);
```

- [ ] **Step 5: the bridge**

In `apps/dashboard/src/legacy-bridge/ask/palette.ts`: `surfaceFor(page: string, param?: string | null)` returns `"leads"` when `page === "clients" && typeof param === "string" && param.startsWith("leads")`, before the switch. `PaletteGlobals` gains `__LEADS?: { suggestions?: { items?: { words: string }[] } | null; searches?: { asked: string }[] } | null;` and `suggestions(...)` passes

```ts
        leadIdeas: (w.__LEADS?.suggestions?.items ?? []).map((i) => i.words),
        leadSearches: (w.__LEADS?.searches ?? []).slice(0, 2).map((s) => s.asked),
```

- [ ] **Step 6: tests (executed)**

`ask.test.mjs`: `ASK_SURFACES` includes `leads` and `ASK_SCOPE_KINDS` equals `ASK_CITATION_KINDS`; `buildAskSuggestions({ surface: "leads", leadIdeas: ["100 nail salons in Queens, NY", "…"] , … })` starts with those words with icon `search`; with no ideas and `leadSearches: ["50 dentists in Austin, TX"]` the first chip is "Find more like: 50 dentists in Austin, TX"; `turnSystem({ …, surface: "leads" })` contains "Leads page" and "propose_lead_search" and no "leads page" line of the generic form. Find where `surfaceFor` is executed (grep `surfaceFor(` in the tests) and add: `surfaceFor("clients", "leads")`, `surfaceFor("clients", "leads:s-x")` → `leads`; `surfaceFor("clients", null)` → `people`; `surfaceFor("clients", "uuid")` → `people`.
`ask-answer.test.mjs`: `cardOpenRoute` for a `lead_search` with `outcome.undo.search_id` answers the search's route; without, `clients/leads`.
`ask-routes.test.mjs`: a turn sent with `surface: "leads"` reaches the turn with that surface (extend the existing surface test at ~line 179 in its own style).

- [ ] **Step 7: build, run, commit**

`corepack pnpm --filter "./packages/*" build`; run the three test files; `git add -A && git commit -m "Ask knows the Leads surface: one list of surfaces, the prompt steers a search, the card opens the search"`.

---

### Task 2: The Line on Leads: the placeholder, the section, the consent line, the card's two doors

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-text.jsx` (words), `ask-home.jsx` (the section's note), `ask-real.jsx` (surface with param, placeholder, `onEdit`, nav on approve), `ask-turn.jsx` (AskCard `onEdit`, nav after approve), `apps/dashboard/src/legacy/styles/ask.css` (`.ask-rows-note`)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (bumps: ask-text, ask-home, ask-real, ask-turn, ask.css)
- Test: `tooling/scripts/tests/ask-palette.test.mjs`

- [ ] **Step 1: words** — in both languages of `ask-text.jsx`: `describeLeads: "Describe the businesses you want"` / `"Describe los negocios que quieres"`; `findBusinesses: "Find businesses"` / `"Encontrar negocios"`; `leadsConsent: "You can email and call leads. Texts and offers wait for their yes."` / `"Puedes escribir y llamar a los leads. Los SMS y las ofertas esperan su sí."`. `askAbout(surface)` answers `t.findBusinesses` for `leads` (add `leads` before the map lookup).

- [ ] **Step 2: the rows** — `ask-home.jsx` `buildLineRows`: the `about` section gets `note: surface === "leads" ? t.leadsConsent : null`; `AskRows` draws `sec.note` after the chips as `<p className="ask-rows-note" data-testid="ask-rows-note">{sec.note}</p>`. `ask.css`: `.ask-rows-note { margin: 6px 0 0; font-size: 12px; line-height: 1.4; color: var(--ink-dim); }` and, in the phone block, `.ask-rows-note { text-align: center; }`.

- [ ] **Step 3: the Line** — `ask-real.jsx`: `const surface = A ? A.surfaceFor(route.page, route.param) : "other";`; the input's placeholder expression ends `: active ? t.follow : surface === "leads" ? t.describeLeads : t.placeholder`. Add, near `nav`:

```js
  // "Change what I asked" on a card: the turn's own question back in the field, to change (spec F4).
  const editWords = () => {
    const last = active ? [...active.messages].reverse().find((m) => m.role === "user") : null;
    setQuery(last ? last.text : "");
    setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
  };
```

and pass `onEdit={editWords}` to every `<AskTurn …>` the Line draws (the live one, the quick one, the latest, the folds).

- [ ] **Step 4: the card** — `ask-turn.jsx`: `AskTurn` takes `onEdit` and hands it to `AskCard`; `AskCard({ …, onEdit })` uses `onBack: () => onEdit && onEdit(p)` for the lead_search plan card (the reply editor stays for `reply`). In `approveWith`, after `record({ state: "done", … })`:

```js
      // A search approved is opened (spec F4): the receipt's "Leads shows it" is kept true by going there.
      if (p.kind === "lead_search" && r.undo && r.undo.search_id && onNav && A && A.cardOpenRoute) {
        const to = A.cardOpenRoute({ ...p, outcome: { state: "done", receipt: r.receipt, atMs: at, undo: r.undo } });
        if (to) onNav(to);
      }
```

(`A.cardOpenRoute` is on `window.__ask` already; confirm in `legacy-bridge/ask/palette.ts`.)

- [ ] **Step 5: tests** — `ask-palette.test.mjs`, a new block "the Leads surface": with `window.location.hash = "#/clients/leads"` and `window.__LEADS = { suggestions: { items: [{ words: "100 nail salons in Queens, NY" }] }, searches: [] }`: at rest the placeholder is "Describe the businesses you want", the section label "Find businesses", a chip with the suggestion words, `ask-rows-note` with the consent line; typing "50 dentists in Austin, TX" and Enter sends exactly those words with `surface: "leads"` and no scope; a final message with a `lead_search` proposal draws `lead-plan`; its "Change what I asked" (`plan-back`) puts the words back in the field; Approve (a `commit` stub answering `{ ok: true, receipt: "…", undo: { search_id: "s1" } }`) navigates to `clients/leads:s-s1`. On the Today hash the placeholder is still "Ask anything" and there is no note. Restore the hash and delete `__LEADS` in `finally`.

- [ ] **Step 6: bump, run, commit** — bump the five files' `?v=`; run `ask-palette.test.mjs`, `legacy-harness.test.mjs`; Prettier; commit "The Line on Leads: describe the businesses, the chips and the consent line, the card changes its words and opens the search".

---

### Task 3: The doors: the three's mark, the button, the ✦, the first day, the key

**Files:**
- Modify: `apps/dashboard/src/legacy/components/icons.jsx` (`three`), `apps/dashboard/src/legacy/pages/leads-scope.jsx` (the bar, the button, the first day), `apps/dashboard/src/legacy/pages/clients-a.jsx` (`openFind`, the F key)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (bumps)
- Test: `tooling/scripts/tests/leads-honest.test.mjs` (the first day, the keys), `tooling/scripts/tests/leads-finder.test.mjs` (the icon test at line 275 names the icons the file uses)

- [ ] **Step 1: the mark** — `icons.jsx`: `case "three": return <svg {...props}><rect x="1.5" y="1.5" width="4.5" height="4.5" rx="1.2"/><rect x="5.75" y="5.75" width="4.5" height="4.5" rx="1.2"/><rect x="10" y="10" width="4.5" height="4.5" rx="1.2"/></svg>;` (the three at rest: a descending diagonal, the pose the canvas holds).

- [ ] **Step 2: the door** — `clients-a.jsx`: `openFind` becomes

```js
  // Find leads is Ask on this page (spec F1, F2): the takeover on a phone, the Stage on a desktop, the words ready.
  const openFind = (words = "") => window.askAbout({ mode: "compose", prompt: typeof words === "string" ? words : "" });
```

(it no longer touches the finder's state); the keys' `find: openFind` stays, so F opens Ask. `leads-scope.jsx`: the desktop button's glyph is `<Icon name="three" size={12} />`; `LeadsPhoneBar` loses its `trailing` find square; the first day's `composer` becomes

```jsx
<button type="button" className="btn btn-primary fr-find" onClick={() => p.onFind()} data-testid="leads-first-find" {...(p.canFind ? {} : window.gate("find", "find businesses for you"))}><Icon name="three" size={13} /> Find leads</button>
```

and `onPick={(words) => p.onFind(words)}`. `leads.css`: `.fr-find { align-self: flex-start; }` if the slot needs it (look at `.fr` first).

- [ ] **Step 3: tests** — `leads-honest.test.mjs`: the first-day tests at ~941 and ~954 become "the first day offers Find leads, which opens Ask; a suggestion picked opens Ask with its words" (stub `window.askAbout`, assert the detail `{ mode: "compose", prompt }`); the keys test at ~1597: F calls `askAbout`; the phone bar test(s) that expect `leads-phone-find`: the bar has no find square. `leads-finder.test.mjs` line 275: add `three` to the icons named if the test enumerates them (it draws each with the real kit).

- [ ] **Step 4: bump, run, commit** — bumps for icons, leads-scope, clients-a (and leads.css if touched); run the two test files + `legacy-harness.test.mjs`; commit "Find leads is Ask: the three's mark on the button, the ✦ on a phone, the first day's button".

---

### Task 4: The page keeps the plan panel: the composer, the sheet's composer, the hook, the draft and the prefix go

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/leads-finder.jsx` (`LeadFinder` → `LeadPlanPanel`, `leadFinderPlan` → `leadAnswerPlan`, delete `leadFinderAsk`, `LEAD_FINDER_CONSENT`), `leads-scope.jsx` (`LeadFinderSheet` → `LeadPlanSheet`, the panel's props), `clients-a.jsx` (the talk hook, the toasts, the draft, `finderPlanIt`), `apps/dashboard/src/legacy/styles/leads.css`
- Modify: `apps/dashboard/src/legacy/CLAUDE.md` (the Leads paragraph), `apps/dashboard/src/legacy/Chanlytics.html`
- Test: `tooling/scripts/tests/leads-finder.test.mjs`, `leads-honest.test.mjs`, `e2e/leads.spec.ts`, `tooling/scripts/tests/source-scan-baseline.json` (if a `readCode` count falls)

- [ ] **Step 1: the panel** — in `leads-finder.jsx` replace `LeadFinder` with

```jsx
/**
 * The plan panel: the card for a plan born from the strip (more, nearby, look further, carry on, try again), and,
 * when a search stopped to ask, the answer row that runs the amend turn (spec F5). A fresh Find is Ask's (F1, F2);
 * nothing here composes one. stage: compose (answering only) | thinking | plan | starting.
 */
const LeadPlanPanel = ({ open, stage, words, proposal, plan = null, facts = null, refusal, busy, trace, pick = null, answering,
  onWords, onAnswer, onChangePlan = () => {}, onApprove, onBack, onClose, onPick = () => {} }) => {
  if (!open) return null;
  const card = proposal && proposal.payload ? proposal.payload : {};
  const shown = plan || card.plan || null;
  const composing = stage === "compose" && !!answering;
  const thinking = stage === "thinking";
  const planning = stage === "plan" || stage === "starting";
  const typed = !!(words || "").trim();
  return (
    <div className="lf-panel pl-plan" role="dialog" aria-label={answering ? "Change the search" : "The plan"} data-testid="lead-plan-panel">
      {composing ? <p className="lf-answering" data-testid="plan-answering">{answering.question}</p> : null}
      {composing || thinking ? (
        <div className={`lf-compose${thinking ? " thinking" : ""}`}>
          <input className="lf-input" type="text" value={words || ""} maxLength={400} placeholder="Tell Claude what you meant" aria-label="Tell Claude what you meant" data-testid="plan-answer-input" disabled={!composing}
            onChange={(e) => onWords(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && composing && !busy && typed) { e.preventDefault(); onAnswer(words); } }} />
          {thinking ? <span className="lf-think" role="status" data-testid="plan-thinking">{trace || "Reading what you asked"}</span> : null}
          {composing ? <button type="button" className="btn btn-primary btn-sm lf-go" data-testid="plan-answer-send" disabled={!!busy || !typed} onClick={() => onAnswer(words)}>Send my answer</button> : null}
          <button type="button" className="lf-close" aria-label="Close" title="Close (esc)" data-testid="plan-close" onClick={onClose}><Icon name="x" size={12} /></button>
          {thinking ? <span className="lf-sweep" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {composing && refusal ? <p className="lf-said" role="status" data-testid="plan-refusal">{refusal}</p> : null}
      {planning && shown ? <LeadPlanCard plan={shown} view={card.view || null} facts={facts || card.facts || null} baseVersion={(card.plan && card.plan.version) || 1} busy={stage === "starting" || !!busy} refusal={refusal} pick={pick} onPick={onPick} onChange={onChangePlan} onApprove={onApprove} onBack={onBack} answering={answering} /> : null}
    </div>
  );
};
```

`leadFinderPlan` becomes `leadAnswerPlan(words, set)`: it requires `set.more && set.more.answer` (else `set.refusal("Nothing to answer here.")`, `set.stage("compose")`, return null), builds `leadFinderAmendAsk(set.more, words)` and sends `{ text, threadId: null, scope: null, surface: "leads" }`; the compose branch and `leadFinderAsk` are deleted. Delete `LEAD_FINDER_CONSENT` and the lock. Export `LeadPlanPanel`, `leadAnswerPlan` on window in place of `LeadFinder`, `leadFinderPlan`, `leadFinderAsk`. The `answering` prop is required where the row is drawn (no default that hides the discriminator).

- [ ] **Step 2: the page** — `clients-a.jsx`: delete the `talk` hook block (~3055–3070) and `usePlNoTalk` if nothing else uses it; delete `ldFinderLoad`/the keep-draft effect (~698–706, ~3171–3180) and the `leads-find` draft; `finderPlanIt` → `finderAnswer = (words) => window.leadAnswerPlan(words, finderSet)`; the props handed to the scope: `onFinderAnswer` in place of `onFinderPlan`, no `talk`. The Esc branch that closes the panel stays (`k.finderOpen` is the panel now). `leads-scope.jsx`: `LeadFinderSheet` → `LeadPlanSheet` (`data-testid="lead-plan-sheet"`, class `sb-sheet pl-plan`), the panel drawn with the new props; the first day no longer passes a composer component (Task 3 did that).

- [ ] **Step 3: CSS** — `leads.css`: delete `.lf-spark*`, `.lf-mic*`, `.lf-lock*`, `.lf-examples`, `.lf-ex*`, `.lf-ex-h`, and in the phone block every `.pl-finder .lf-*` rule about the composer (the 76px mic, the centred column, the lock and close corners, the examples); keep the sheet frame (`.sb-sheet.pl-plan`, the handle), the panel, the answer row (one row on a desktop, a column on a phone: input full width, the button under it) and the card rules. Rename `.pl-finder` → `.pl-plan` everywhere it survives.

- [ ] **Step 4: tests** — `leads-finder.test.mjs`: delete the composer tests ("the composer turns words into a plan card…", "a refusal is words under the input…", "hold-to-talk…", "the composer offers three suggestions…", "the finder is the page's own overlay…", "the composer is one row…"); rewrite the two answering tests (~630, ~660) for `leadAnswerPlan` and the new testids, asserting the turn is sent with `surface: "leads"`; keep the card and strip tests; the helper `drawFinder` draws `LeadPlanPanel`. `leads-honest.test.mjs`: the Esc-order test names the plan panel; the draft test (~2230) goes (Ask keeps its own draft, tested in `ask-palette.test.mjs`). Run `UPDATE_SOURCE_SCAN_BASELINE=1` on the ratchet test only if a `readCode` count fell; the baseline may only fall.

- [ ] **Step 5: e2e** — `e2e/leads.spec.ts`: the phone bar test drops `leads-phone-find`; the two desktop finder tests (~295–325) become: click `leads-find` → `ask-line` visible → fill `ask-input` with the same words → press Enter → `lead-plan` visible inside `ask-card` → click `plan-approve` → the URL has `leads:s-` and `lead-strip` is visible; one phone test: on Leads tap `phone-ask` → the takeover's `ask-input` has placeholder "Describe the businesses you want" and `ask-rows-note` is visible; close with Escape. Keep the spec's own helpers and sign-in.

- [ ] **Step 6: docs, bump, run, commit** — `apps/dashboard/src/legacy/CLAUDE.md`: in the Leads/Ask paragraph, say Find leads is Ask on the Leads surface and the page keeps `LeadPlanPanel`. Bump leads-finder, leads-scope, clients-a, leads.css. Run `leads-finder.test.mjs`, `leads-honest.test.mjs`, `leads-bridge.test.mjs`, `ask-palette.test.mjs`, `legacy-harness.test.mjs`, `source-scan-ratchet.test.mjs`; Prettier; commit "The page keeps the plan panel: the composer, its sheet, the second mic and the prefix are gone".

---

### Task 5: Gates, the browser pass, the PR

- [ ] **Step 1:** `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check` and the whole suite `node --conditions=react-server --import tsx --test tooling/scripts/tests/*.test.mjs`; `git status` shows no dist drift (rebuild every package, keep only dists with a real diff).
- [ ] **Step 2:** a dev server on the branch (a launch entry in the session's `.claude/launch.json`, the worktree's `apps/dashboard/.env.local`), signed in as the e2e owner (`scratchpad/mint-cookie.mjs`), `/w/chanlytics-e2e/#/clients/leads`: at 1440 the controls row's Find leads wears the mark; F opens the Stage with "Describe the businesses you want", the Find businesses chips and the consent line; a question draws the card on the rail; "Change what I asked" puts the words back. On the phone preset: the bar has no square; the ✦ opens the takeover with the same rows. Do not approve a plan on the e2e workspace from the browser unless the month's leads allow it (the e2e spec does, nightly). Screenshots at both sizes; `git checkout -- apps/dashboard/tsconfig.json apps/dashboard/next-env.d.ts` after.
- [ ] **Step 3:** the spec's status line says built with the PR number; this plan gets an "As built" section for what differed. PR body: what changes for a member, what to know before merging (nothing to set; deploy order either; the e2e Leads spec rewritten; the nightly not yet run since the Stage), proof. CI on green: squash-merge, delete the branch, production check on the salon (`/api/version`), memory.

## As built (24 Sep)

Five tasks, one implementer and one combined review round each; the review's fixes are their own commits after each task.

- **Task 1:** `cardOpenRoute`'s `Pick` widened to include `outcome`; the route test also pins that a surface outside the list is dropped, not refused (the old `clients` bug). Review: the Leads chips are added before the day's counts (the section under the field keeps three, and they must be the ideas); the bridge no longer slices the searches (contracts alone says two).
- **Task 2:** `.ask-rows-note` carries the chips' 6px gutter; the test presses the plan card's own Approve. Review: a fold's card puts its own question back (`editWords(text)`), not the latest one.
- **Task 3:** eight page tests that reached the old composer through F were rerouted through a kept search's "Search again, changed"; `LeadsPhoneBar` lost its unused `onFind`/`canFind`. Review: the button and F open Ask as ⌘K does (`window.appAsk`, a draft kept), a suggestion's words go through `askAbout`; the `three` mark is the canvas's stair (wider than tall, the squares clear of each other); the key's comment says Ask.
- **Task 4:** `onFinderBack` on a strip-born plan closes the panel and opens Ask with what the search asked for (the panel no longer composes); `components.css` and `ask-hooks.jsx` were touched for a renamed class and a comment; `.lf-said`/`.lf-answering` lost the spark's padding; the e2e's paid tests share an `askForBusinesses` helper. Review: "Search again, changed" now sets the panel's plan (it drew the last strip-born plan, or nothing: pre-existing, exposed by the rewrite); the e2e phone test asserts the "Find more like" chip before the note it depends on; the first day's comments no longer say composer; the spec's F7 says the peek closes before the panel, as the code does.
- **The browser pass:** a dev server on the branch, signed in as the e2e owner. Desktop at 1440: the button wears the mark, F opens the Stage with "Describe the businesses you want", "Find businesses" with the "Find more like" chip, the consent line; a question draws the card on the rail ("One card to review: Find 6 personal trainers."), "Change what I asked" puts the words back, focused. Phone: the bar is lists and search, the ✦ opens the takeover; the desktop's conversation came back on the phone (Ask's persistence); cleared, the same rows stand at rest. Found there and fixed: on a phone the rows' centred column let a long "Find more like" chip run past both edges (`.ask-rows-sec > .ask-chips { max-width: 100% }`), and the chip's label is now clipped at 40 letters while the question sent keeps the whole words (`AskSuggestion.label`).
- **Gates on the branch:** the node suite 4,881 tests with one failure that was the harness doing its job (`e2e-harness.test.mjs`: the People pages no longer read `__ask`, so its excuse went); typecheck, lint (0 errors), `format:check`, no dist drift.
- **Not verified here:** the nightly (`e2e/leads.spec.ts` rewritten; the paid tests approve a real search on the e2e workspace), the answer row on a search that stopped to ask (no such search on the e2e workspace), Ruben's own phone.

## Self-review

- **Spec coverage:** F1 (Task 3), F2 (Task 1 + Task 2 Step 3), F3 (Tasks 1–2), F4 (Task 2 Steps 3–4, Task 1 Step 2), F5–F7 (Task 4), F8 (unchanged; Task 1 Step 3 keeps the route's policy), F9 (Task 2 Step 1), F10 (each task's tests, Task 4 Step 5), F11 (each task's bumps, Task 5), F12 (nothing here builds it).
- **Names used as declared:** `ASK_SURFACES`, `ASK_SCOPE_KINDS`, `leadIdeas`, `leadSearches`, `moreLike`, `surfaceFor(page, param)`, `describeLeads`, `findBusinesses`, `leadsConsent`, `ask-rows-note`, `editWords`/`onEdit`, `three`, `openFind(words)`, `leads-first-find`, `LeadPlanPanel`, `LeadPlanSheet`, `leadAnswerPlan`, `onFinderAnswer`, testids `lead-plan-panel`, `plan-answering`, `plan-answer-input`, `plan-answer-send`, `plan-thinking`, `plan-refusal`, `plan-close`, `lead-plan-sheet`.
- **Placeholders:** none; where a step says "look first" it names the file and what to look for.
