# Ask, the Stage: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Line becomes the Stage on a desktop (the three at 84px in a band, the answer as tiles, chips, marks and one button on a rail of the three's squares) and a full-screen takeover on a phone (the three at Today's size, hold to talk, swipe or Back to close, the draft and the conversation kept), and Today's phone band goes.

**Architecture:** Every change is in the Line's own files (`apps/dashboard/src/legacy/pages/ask-*.jsx`, `styles/ask.css`) and the one bridge function they read; the server, the protocol and the answer's shape are untouched. The phone is the same component under `arPhone()` with a few more elements and CSS that makes the panel the screen. Today loses one line and one block of CSS; `today-face.jsx` and the reducer only it used are deleted.

**Spec:** `docs/superpowers/specs/2026-09-23-ask-the-stage-design.md` (S1–S17; sections 4, 5 and 6 are the shape). The Line's spec (`2026-09-23-ask-the-line-design.md`) stands under it.

**Tech Stack:** React 18 without a bundler (Babel in the harness, imported by `legacy-bridge/manifest.ts` in the app); the tests run the pages on the stub React in `tooling/scripts/tests/ask-palette.test.mjs` with `node --test` through tsx; pnpm via corepack; Playwright for the nightly e2e.

**Worktree:** `C:\Users\Ruben\Documents\Claude Projects\Claude Video\cm-stage`, branch `design/ask-the-stage` off `origin/main` at `000d4906`. `corepack pnpm install --frozen-lockfile --prefer-offline` is done there.

**Rules that apply:** every edited page or stylesheet bumps its `?v=` in BOTH lists (`legacy-bridge/manifest.ts` has no versions; `legacy/Chanlytics.html` does; `legacy-harness.test.mjs` pins the two lists together); tests execute the page on the stub React, never a `readCode` pin (`source-scan-ratchet.test.mjs` only falls); no key symbol drawn (D17); badges are `.pill`, `.chip`, `.tally`, `.mark` from components.css at their sizes; Prettier does not run on `legacy/` (the hook skips it) so keep the files' own style; the dashboard's `.env.local` is needed to look at a page (`docs/runbook.md`, "See a real page").

**Tests to run per task:** `corepack pnpm exec tsx --test tooling/scripts/tests/<file>` runs one file; `corepack pnpm test` the suite (about four minutes). At the end: `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check && corepack pnpm test` and `node tooling/scripts/check-dist.mjs` (contracts changes in Task 2 rebuild its dist).

---

## Files

| File | Responsibility | Change |
|---|---|---|
| `apps/dashboard/src/legacy/pages/ask-text.jsx` | Ask's words, en and es | Adds the Stage's words; drops the band's three |
| `packages/contracts/src/ask-answer.ts` | The answer's pure helpers | Adds `rightNowCounts` beside `rightNowLine` |
| `apps/dashboard/src/legacy-bridge/ask/palette.ts` | What the Line knows before a model | Adds `rightNowParts` (the sentence and its counts) |
| `apps/dashboard/src/legacy/pages/ask-home.jsx` | The rows under the band | Right now as pills + sentence + Brief me; questions as chips; 36px rows; All-earlier as a chip; no Earlier section on a phone at rest |
| `apps/dashboard/src/legacy/pages/ask-turn.jsx` | The answer | The rail; tiles with the receipt inside; items with a kind mark and a chevron; the Do row (Open as `.btn`, chips) |
| `apps/dashboard/src/legacy/pages/ask-hooks.jsx` | The hooks | Adds `useHoldPress` (a press held 320ms) |
| `apps/dashboard/src/legacy/pages/ask-real.jsx` | One open Line | The band and the reading line; Send; the takeover's head, hero and foot; the hold on the three; the focus rule; the history entry; the draft and the thread id kept |
| `apps/dashboard/src/legacy/styles/ask.css` | The Line's look | Rewritten around the band, the rail, the kit's shapes and the takeover |
| `apps/dashboard/src/legacy/pages/dashboard-a.jsx`, `styles/dashboard-a-v2.css` | Today | The band's line and rules go |
| `apps/dashboard/src/legacy/pages/today-face.jsx`, `apps/dashboard/src/legacy-bridge/mascot/turn.ts` | The band and its reducer | Deleted |
| `apps/dashboard/src/legacy-bridge/manifest.ts`, `apps/dashboard/src/legacy/Chanlytics.html` | The two lists | `today-face.jsx` out; versions bumped |
| `apps/dashboard/src/legacy/CLAUDE.md` | Conventions | Today's and Ask's paragraphs |
| `tooling/scripts/tests/ask-answer.test.mjs` | Contracts | `rightNowCounts` |
| `tooling/scripts/tests/ask-palette.test.mjs` | The Line, run | The new shapes; the takeover; persistence |
| `tooling/scripts/tests/today-page.test.mjs` | Today, run | No band in the composition |
| `tooling/scripts/tests/today-face.test.mjs`, `mascot-turn.test.mjs` | The band | Deleted |
| `tooling/scripts/serve-legacy.mjs` | The harness | One comment (the mascot bundle stays for the Line) |
| `e2e/today.spec.ts`, `e2e/ask.spec.ts` | Nightly | The phone: no band, the ✦ opens the takeover, a swipe closes |

---

### Task 1: The words

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-text.jsx` (en at `:8-62`, es after `:96`)

- [ ] **Step 1: Add the Stage's words to `en`** after `noVoice` (`:57`), and remove `todayPlaceholder`, `continueInAsk`, `reviewInAsk` (`:58-61`; only `today-face.jsx` read them, which Task 8 deletes):

```js
    askAnything: "Ask anything",
    send: "Ask",
    briefMe: "Brief me",
    letGo: "Let go to ask",
    typeInstead: "Type instead",
    needYou: (n) => (n === 1 ? "1 needs you" : `${n} need you`),
    runsWaiting: (n) => (n === 1 ? "1 run waiting" : `${n} runs waiting`),
```

- [ ] **Step 2: The same in `es`**, replacing its three band words:

```js
    askAnything: "Pregunta lo que quieras",
    send: "Preguntar",
    briefMe: "Resúmeme",
    letGo: "Suelta para preguntar",
    typeInstead: "Escribir",
    needYou: (n) => (n === 1 ? "1 te necesita" : `${n} te necesitan`),
    runsWaiting: (n) => (n === 1 ? "1 envío en espera" : `${n} envíos en espera`),
```

- [ ] **Step 3: Change `placeholder`** in both languages to the Stage's: en `"Ask anything"`, es `"Pregunta lo que quieras"` (the jump hint moves to the typing rows, which already say "Jump to").

- [ ] **Step 4: Run the palette test** (its cases read these words): `corepack pnpm exec tsx --test tooling/scripts/tests/ask-palette.test.mjs`. Expected: every case passes as before (nothing reads the removed words yet).

- [ ] **Step 5: Commit** `git add apps/dashboard/src/legacy/pages/ask-text.jsx && git commit -m "Ask's words for the Stage"`.

### Task 2: The counts Right now is built from

**Files:**
- Modify: `packages/contracts/src/ask-answer.ts` after `rightNowLine` (`:275-294`)
- Modify: `apps/dashboard/src/legacy-bridge/ask/palette.ts:195`
- Test: `tooling/scripts/tests/ask-answer.test.mjs`

- [ ] **Step 1: Write the failing test** in `ask-answer.test.mjs` (import `rightNowCounts` beside `rightNowLine`):

```js
test("rightNowCounts: the people and the runs the sentence counts; zeros for a queue not read", () => {
  assert.deepEqual(rightNowCounts(null), { people: 0, runs: 0 });
  const w = {
    people: [
      { id: "c1", kind: "thread", who: "Nora", channel: "WhatsApp", when: "2h", line: "", to: "inbox/th-c1" },
      { id: "c2", kind: "call", who: "Emily", channel: "Phone", when: "3d", line: "", to: "conversations/c2" },
    ],
    more: 1,
    runs: [{ id: "r1", label: "Win-back", reach: 1, to: "outbound" }],
  };
  assert.deepEqual(rightNowCounts(w), { people: 3, runs: 1 });
  assert.match(rightNowLine(w, "en"), /Nora, Emily and 1 more are waiting on you; one playbook run is waiting/);
});
```

- [ ] **Step 2: Run it**: `corepack pnpm exec tsx --test tooling/scripts/tests/ask-answer.test.mjs`. Expected: FAIL, `rightNowCounts` is not exported.

- [ ] **Step 3: Implement** in `ask-answer.ts` after `rightNowLine`:

```ts
/** The counts rightNowLine's sentence is built from, so pills beside it never disagree: people waiting (drawn and past the rows) and runs waiting. */
export function rightNowCounts(w: AskWaiting | null): { people: number; runs: number } {
  return w ? { people: w.people.length + w.more, runs: w.runs.length } : { people: 0, runs: 0 };
}
```

  If `AskWaiting.runs` entries have a different shape than the test's, match the type (`:257-262`) in the test, not the function.

- [ ] **Step 4: Add `rightNowParts` to the bridge** in `palette.ts` next to `rightNow` (`:195`), importing `rightNowCounts`:

```ts
    rightNow: (lang?: AskLanguage) => rightNowLine(waiting(), lang ?? lastLanguage()),
    /** The sentence and the counts it was built from (the Stage's pills, spec 4.3). */
    rightNowParts: (lang?: AskLanguage) => {
      const w = waiting();
      return { sentence: rightNowLine(w, lang ?? lastLanguage()), ...rightNowCounts(w) };
    },
```

  Add `rightNowParts` to the palette's type where `rightNow` is declared.

- [ ] **Step 5: Rebuild the dist and run**: `corepack pnpm --filter @chanlytics/contracts build && corepack pnpm exec tsx --test tooling/scripts/tests/ask-answer.test.mjs`. Expected: PASS.

- [ ] **Step 6: Commit** the source, the dist and the test: `git add packages/contracts/src/ask-answer.ts packages/contracts/dist apps/dashboard/src/legacy-bridge/ask/palette.ts tooling/scripts/tests/ask-answer.test.mjs && git commit -m "Right now says its counts beside its sentence"`.

### Task 3: The rows under the band

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-home.jsx` (`buildLineRows` `:15-47`, `AskRows` `:52-99`)
- Modify: `apps/dashboard/src/legacy/styles/ask.css` (the rows, `:60-75`)
- Test: `tooling/scripts/tests/ask-palette.test.mjs` (the at-rest case, `:409-460`)

- [ ] **Step 1: Change the at-rest test** so it expects the new shapes. Replace the three assertions after the Right now sentence with:

```js
    // The pills beside the sentence say its counts (rightNowParts): one person waiting, no run.
    assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "ask-pill").map(textOf), ["1 needs you"]);
    assert.equal(textOf(byTestId(tree, "ask-row-brief")), "Brief me");
    assert.ok(textOf(tree).includes("Ask about Today"), "questions about the page, under its name");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-row-sug").length, 3, "three questions, as chips");
    assert.ok(byTestId(tree, "ask-row-sug").props.className.split(" ").includes("ask-chip"));
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread").length, 3, "three earlier conversations");
    assert.ok(byTestId(tree, "ask-row-all").props.className.split(" ").includes("ask-chip"), "and the rest as a chip");
```

  The `TODAY_DATA` the case sets holds one person and no run, so the pills are one. Keep the rest of the case (Enter asks the quick question, D17).

- [ ] **Step 2: Run it**: `corepack pnpm exec tsx --test tooling/scripts/tests/ask-palette.test.mjs`. Expected: the at-rest case FAILS on `ask-pill`.

- [ ] **Step 3: `buildLineRows`**: the Right now item carries its counts and the phone keeps Earlier for its head. Replace `:37-46` with:

```js
  // At rest: Right now is the first row, with the counts its sentence was built from as pills, and ↵ on the empty line
  // asks who needs you (the quick answer). On a phone Earlier is the head's, not a section here (spec 5.2).
  const parts = A.rightNowParts ? A.rightNowParts(lang) : { sentence: A.rightNow(lang), people: 0, runs: 0 };
  const sections = [{ key: "now", items: [{ type: "now", label: parts.sentence, q: t.needsQ, people: parts.people, runs: parts.runs }] }];
  const asks = A.suggestions(surface, scope, lang).filter((s) => s.kind !== "act" && s.q !== t.needsQ).slice(0, 3);
  if (asks.length) sections.push({ key: "about", label: t.askAbout(surface), items: asks.map((s) => ({ type: "sug", label: s.q, q: s.q })) });
  if (threads.length && !phone) {
    const items = threads.slice(0, 3).map(thread);
    if (threads.length > 3) items.push({ type: "all", label: t.allEarlier });
    sections.push({ key: "earlier", label: t.earlier, items });
  }
  return sections;
```

  and add `phone = false` to `buildLineRows`'s parameters.

- [ ] **Step 4: `AskRows`** draws a chip for `sug`, `act` and `all`, the Right now block for `now`, a row for the rest. Replace the body of the `sec.items.map` (`:66-96`) with:

```js
            const i = at++;
            const sel = i === selIdx;
            const shared = {
              key: i,
              id: `ask-row-${i}`,
              role: "option",
              "aria-selected": sel,
              onMouseMove: () => setSel(i),
              onClick: () => onActivate(it),
              "data-testid": `ask-row-${it.type}`,
            };
            if (it.type === "now")
              return (
                <div {...shared} className={`ask-row now${sel ? " sel" : ""}`}>
                  {it.people || it.runs ? (
                    <span className="ask-now-pills">
                      {it.people ? <span className="pill pill-warn" data-testid="ask-pill">{t.needYou(it.people)}</span> : null}
                      {it.runs ? <span className="pill pill-warn" data-testid="ask-pill">{t.runsWaiting(it.runs)}</span> : null}
                    </span>
                  ) : null}
                  <span className="ask-row-label">{it.label}</span>
                  <span className="btn btn-sm ask-now-brief" data-testid="ask-row-brief">{t.briefMe}</span>
                </div>
              );
            if (it.type === "sug" || it.type === "act" || it.type === "all")
              return (
                <button type="button" {...shared} className={`ask-chip${it.type === "all" ? " door" : ""}${sel ? " sel" : ""}`}>
                  <span>{it.label}</span>
                  {it.meta ? <span className="ask-chip-meta">{it.meta}</span> : null}
                  {it.type === "all" ? <Icon name="arrow-right" size={12} /> : null}
                </button>
              );
            return (
              <div {...shared} className={`ask-row ${it.type}${sel ? " sel" : ""}`}>
                {it.type === "thread" ? <Icon name="chat" size={13} className="ask-row-glyph" /> : null}
                <span className="ask-row-main">
                  <span className="ask-row-label">{it.label}</span>
                  {it.sub ? <span className="ask-row-sub">{it.sub}</span> : null}
                </span>
                {it.meta ? <span className="ask-row-meta">{it.meta}</span> : null}
                {it.type === "thread" ? (
                  <button type="button" className="ask-row-del" tabIndex={-1} aria-label={t.deleteThread} title={t.deleteThread} onClick={(e) => { e.stopPropagation(); onDelete(it.th); }} data-testid="ask-row-del">
                    <Icon name="x" size={10} />
                  </button>
                ) : null}
              </div>
            );
```

  Rename the component's `sel` prop use to `selIdx` where it is read (`const selIdx = sel;` at the top of `AskRows`) so the row's own `sel` flag reads clearly. The chips of one section sit in a wrap: where a section's items are all chips (`about`, `match`, and `earlier`'s trailing `all`), draw the label then `<div className="ask-chips">…</div>`; for `earlier`, the rows then the `all` chip in its own `.ask-chips` under them. The `now` row's Brief me is a `<span>` styled as a button inside the one option (one row, one door: Enter or a click anywhere on it asks; a second option would be the same question twice).

- [ ] **Step 5: The typing rows** keep their shape (`ask`, `jump`, `sug`, `act` at `:23-34`): `sug` and `act` now draw as chips through the branch above, `ask` and `jump` as rows.

- [ ] **Step 6: The styles**, replacing `.ask-rows` … `.ask-rows-empty` (`ask.css:60-75`):

```css
/* ---- Under the band: Right now, chips for the questions, compact rows for the conversations ---- */
.ask-line-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
.ask-rows { display: flex; flex-direction: column; gap: 14px; padding: 10px 10px 14px; }
.ask-rows-label { padding: 0 6px 6px; font-size: 12px; color: var(--ink-dim); }
.ask-row { display: flex; align-items: center; gap: 10px; min-height: 36px; padding: 0 8px 0 10px; border-radius: var(--radius-md); color: var(--ink); cursor: pointer; }
.ask-row.sel { background: var(--bg-hover); }
.ask-row-glyph { flex: none; color: var(--ink-dim); }
.ask-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.ask-row-label { font-size: 13.5px; line-height: 1.4; overflow-wrap: anywhere; }
.ask-row.thread .ask-row-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ask-row-sub, .ask-row-meta { flex: none; font-size: 12px; color: var(--ink-dim); }
.ask-row.now { align-items: center; gap: 8px; min-height: 44px; padding: 6px 6px 6px 8px; }
.ask-row.now .ask-row-label { flex: 1; }
.ask-now-pills { display: inline-flex; flex: none; gap: 6px; }
.ask-now-brief { flex: none; }
.ask-row-del { display: none; flex: none; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--ink-faint); cursor: pointer; }
.ask-row.thread:hover .ask-row-del, .ask-row.thread.sel .ask-row-del { display: inline-flex; }
.ask-row-del:hover { color: var(--danger); background: var(--danger-soft); }
.ask-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 6px; }
.ask-chip { display: inline-flex; align-items: center; gap: 7px; height: 28px; padding: 0 11px; border: 1px solid var(--line); border-radius: var(--radius-full); background: var(--bg-raised); font: inherit; font-size: 12.5px; color: var(--ink); white-space: nowrap; cursor: pointer; text-align: left; }
.ask-chip.door { padding-right: 9px; }
.ask-chip .icon, .ask-chip-meta { color: var(--ink-dim); }
.ask-chip-meta { font-size: 11px; }
.ask-chip:hover, .ask-chip.sel { border-color: var(--line-strong); background: var(--bg-hover); }
.ask-chip.next::before { content: ""; flex: none; width: 7px; height: 7px; border-radius: 2px; background: color-mix(in oklab, var(--ink) 34%, var(--bg-raised)); }
.ask-rows-empty { padding: 18px 20px; font-size: 13px; color: var(--ink-dim); }
```

- [ ] **Step 7: Run the palette test**: `corepack pnpm exec tsx --test tooling/scripts/tests/ask-palette.test.mjs`. Expected: PASS. If a case reads `ask-row-sug` as a row (`.props.className` "ask-row sug"), it now reads a chip; update that case's expectation to the chip class.

- [ ] **Step 8: Commit** `git add apps/dashboard/src/legacy/pages/ask-home.jsx apps/dashboard/src/legacy/styles/ask.css tooling/scripts/tests/ask-palette.test.mjs && git commit -m "The rows under the band: pills, chips, compact rows"`.

### Task 4: The answer on the rail

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-turn.jsx` (`AskFigure` `:120-142`, `AskAnswer` `:167-272`)
- Modify: `apps/dashboard/src/legacy/styles/ask.css` (`:97-153`)
- Test: `tooling/scripts/tests/ask-palette.test.mjs`

- [ ] **Step 1: Write the failing test**, after the case "a turn since the Line" (`:652`), sending a final message whose answer has four figures with sources, one item, an open and two next questions (build it with `normalizeAnswer` as that case does, over a read set that holds a page `reports`, a thread `c1` and a call):

```js
test("the answer on the rail: tiles with the receipt inside, items with a kind mark, one Open button and chips", async () => {
  const calls = ask([]);
  const final = {
    id: "m-r", role: "assistant", atMs: Date.now(), failed: false, citations: [], followups: [], proposals: [],
    text: "6 of 16 went unanswered.",
    answer: {
      v: 2, form: "structured", language: "en",
      say: { headline: "6 of 16 went unanswered.", detail: "Mostly after hours." },
      show: {
        figures: [
          { value: "5", label: "needed you", note: "up from 1", source: { kind: "page", id: "reports", label: "Reports, past 7 days", to: "reports", door: true } },
          { value: "20s", label: "median reply", note: "stayed fast", source: null },
        ],
        items: [{ title: "Nora", meta: "WhatsApp · 2h", line: "Can I come at 3?", source: { kind: "thread", id: "c1", label: "Nora", to: "inbox/th-c1", door: true } }],
        breakdown: null,
      },
      do: { open: { to: "reports", label: "Open the week in Reports", now: false }, next: ["What caused it?", "Who still needs me?"] },
    },
  };
  globalThis.window.__ask.send = async (input, on) => { calls.sent.push(input.text); on({ t: "thread", id: TH(1).id, title: input.text }); on({ t: "final", message: final }); };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how did the week go?");
  keyed(tree, "Enter");
  for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-mark").length, 3, "the rail's three squares");
  const tiles = all(tree, (n) => n.props?.["data-testid"] === "ask-tile");
  assert.equal(tiles.length, 2);
  assert.equal(byTestId(tiles[0], "ask-tile-from").props["data-open"], "false", "the receipt waits inside the tile");
  press(byTestId(tiles[0], "ask-figure"));
  tree = await later(Palette, OPEN);
  const opened = all(tree, (n) => n.props?.["data-testid"] === "ask-tile")[0];
  assert.equal(byTestId(opened, "ask-tile-from").props["data-open"], "true");
  assert.match(textOf(byTestId(opened, "ask-tile-from")), /From Reports, past 7 days/);
  assert.equal(byTestId(all(tree, (n) => n.props?.["data-testid"] === "ask-tile")[1], "ask-figure"), null, "a figure with no source is words");
  assert.ok(byTestId(tree, "ask-item-mark"), "a row carries its kind");
  const open = byTestId(tree, "ask-open");
  assert.ok(open.props.className.split(" ").includes("btn"), "Open is the kit's button");
  assert.deepEqual(all(tree, (n) => n.props?.["data-testid"] === "ask-next").map((n) => n.props.className.split(" ").includes("ask-chip")), [true, true]);
  // The reports door is offered once: the tile's receipt has no door beside Open (oneDoor), and the keys walk item, Open, next, next.
  keyed(tree, "ArrowDown"); keyed(tree, "ArrowDown"); keyed(tree, "ArrowDown");
  tree = await later(Palette, OPEN);
  assert.ok(all(tree, (n) => n.props?.["data-testid"] === "ask-next")[0].props.className.split(" ").includes("sel"));
  await closes();
});
```

- [ ] **Step 2: Run it**: expected FAIL on `ask-mark` count or `ask-tile`.

- [ ] **Step 3: `AskFigure` becomes a tile** (`ask-turn.jsx:120-142`):

```jsx
// A figure as a tile: the value, what it counts, how it moved; where it comes from is inside the tile, shown on hover
// (ask.css) or opened by a press on the value, with a door only where oneDoor left it one (spec S4).
const AskFigure = ({ f, open, onToggle, t, onNav }) => (
  <div className={`ask-tile${open ? " open" : ""}`} data-testid="ask-tile">
    {f.source ? (
      <button type="button" className="ask-tile-value" aria-expanded={open} onClick={onToggle} data-testid="ask-figure">{f.value}</button>
    ) : (
      <span className="ask-tile-value plain">{f.value}</span>
    )}
    <span className="ask-tile-label">{f.label}</span>
    {f.note ? <span className="ask-tile-note">{f.note}</span> : null}
    {f.source ? (
      <span className="ask-tile-from" data-open={open ? "true" : "false"} data-testid="ask-tile-from">
        {t.from} {f.source.label}
        {f.source.door ? (
          <button type="button" className="ask-tile-door" onClick={() => onNav(f.source.to)} aria-label={t.open} title={t.open}><Icon name="arrow-right" size={11} /></button>
        ) : null}
      </span>
    ) : null}
  </div>
);
```

- [ ] **Step 4: The rail's marks and the items** in `AskAnswer`: give each `.ask-mark` `data-testid="ask-mark"`; in `itemBody` prepend the kind mark and append a chevron:

```jsx
  const kindGlyph = (k) => (k === "call" ? "phone" : k === "person" ? "users" : k === "page" ? "arrow-right" : "chat");
  const itemBody = (it) => (
    <>
      <span className="ask-item-mark" data-testid="ask-item-mark"><Icon name={kindGlyph(it.source.kind)} size={12} /></span>
      <span className="ask-item-body">
        <span className="ask-item-top">
          <span className="ask-item-title">{it.title}</span>
          {it.meta ? <span className="ask-item-meta">{it.meta}</span> : null}
        </span>
        {it.line ? <span className="ask-item-line">{it.line}</span> : null}
      </span>
      {it.source.door !== false ? <Icon name="chevron" size={12} className="ask-item-chev" /> : null}
    </>
  );
```

- [ ] **Step 5: The Do row**: replace the retry, open and next buttons (`:245-259`) with one row after the cards:

```jsx
            <div className="ask-do-row">
              {retry ? <button type="button" className="btn ask-retry" onClick={retry} data-testid="ask-retry">{t.tryAgain}</button> : null}
              {a.do.open ? (
                <button type="button" {...moveProps(openAt, "btn ask-open")} onClick={() => onNav(a.do.open.to)} data-testid="ask-open">
                  <Icon name="arrow-right" size={14} className="icon" />{a.do.open.label}
                </button>
              ) : null}
              {a.do.next.map((q, k) => (
                <button key={q} type="button" {...moveProps(nextAt + k, "ask-chip next")} onClick={() => onFollow(q)} data-testid="ask-next">{q}</button>
              ))}
            </div>
```

  `moveProps` already adds `sel` to the class it is given; `.btn.sel` and `.ask-chip.sel` take the hover look (Step 6).

- [ ] **Step 6: The styles**, replacing `.ask-answer` … `.ask-answer.compact .ask-figures` (`ask.css:100-153`):

```css
/* ---- The answer: Say, Show and Do on a rail of the three's squares (spec S3) ---- */
.ask-turn { display: flex; flex-direction: column; gap: 10px; padding: 16px 20px 18px; }
.ask-fold .ask-turn { padding: 6px 20px 16px; }
.ask-turn-q { margin: 0 0 2px 30px; font-size: 13px; color: var(--ink-dim); overflow-wrap: anywhere; }
.ask-answer { display: flex; flex-direction: column; gap: 22px; }
.ask-part { position: relative; display: grid; grid-template-columns: 12px minmax(0, 1fr); column-gap: 18px; align-items: start; }
.ask-part:not(:last-child)::before { content: ""; position: absolute; left: 5.5px; top: 22px; bottom: -22px; width: 1px; background: var(--line); }
.ask-part.show, .ask-part.do { animation: ask-part-in 160ms var(--ease-out) both; }
.ask-part.do { animation-delay: 60ms; }
@keyframes ask-part-in { from { opacity: 0; translate: 0 6px; } }
.ask-mark { display: block; width: 12px; height: 12px; border-radius: 3px; }
.ask-mark.m1 { background: color-mix(in oklab, var(--ink) 84%, var(--bg-raised)); }
.ask-mark.m2 { background: color-mix(in oklab, var(--ink) 56%, var(--bg-raised)); }
.ask-mark.m3 { background: color-mix(in oklab, var(--ink) 34%, var(--bg-raised)); }
.ask-part.say .ask-mark { margin-top: 7px; }
.ask-part.show .ask-mark { margin-top: 4px; }
.ask-part.do .ask-mark { margin-top: 10px; }
.ask-say { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ask-headline { margin: 0; font-size: 19px; font-weight: 500; line-height: 1.35; letter-spacing: -0.012em; color: var(--ink); text-wrap: pretty; }
.ask-detail { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--ink-muted); white-space: pre-wrap; }
.ask-prose { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; overflow-wrap: anywhere; }
.ask-turn.failed .ask-prose, .ask-turn.failed .ask-headline { font-size: 14.5px; font-weight: 400; line-height: 1.55; letter-spacing: 0; color: var(--ink-dim); }
.ask-cursor { display: inline-block; width: 2px; height: 18px; margin-left: 2px; vertical-align: -3px; background: var(--accent); border-radius: 1px; animation: ask-blink 1s steps(2, start) infinite; }
@keyframes ask-blink { to { visibility: hidden; } }
.ask-unverified { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; margin-left: 30px; font-size: 11px; color: var(--warn-ink); background: var(--warn-soft); border-radius: var(--radius-full); padding: 3px 9px; }
.ask-show { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ask-figures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.ask-tile { display: flex; flex-direction: column; gap: 3px; min-width: 0; padding: 10px 12px 9px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); transition: background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out); }
.ask-tile:hover, .ask-tile.open { background: var(--bg-hover); border-color: var(--line-strong); }
.ask-tile-value { align-self: flex-start; padding: 0; border: 0; background: transparent; font: inherit; font-size: 20px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.15; font-variant-numeric: tabular-nums; color: var(--ink); cursor: pointer; }
.ask-tile-value.plain { cursor: default; }
.ask-tile-label { font-size: 12px; color: var(--ink-muted); }
.ask-tile-note { font-size: 11.5px; color: var(--ink-dim); }
.ask-tile-from { display: none; align-items: center; gap: 5px; font-size: 11.5px; color: var(--ink-dim); }
.ask-tile:hover .ask-tile-from, .ask-tile-from[data-open="true"] { display: inline-flex; }
.ask-tile:hover .ask-tile-note, .ask-tile.open .ask-tile-note { display: none; }
.ask-tile-door { display: inline-flex; padding: 2px; border: 0; background: transparent; color: var(--ink-muted); cursor: pointer; }
.ask-tile-door:hover { color: var(--ink); }
.ask-breakdown { display: flex; flex-direction: column; gap: 6px; }
.ask-breakdown-title { font-size: 13px; font-weight: 500; color: var(--ink); }
.ask-breakdown-from { display: inline-flex; align-items: baseline; gap: 8px; font-size: 12px; color: var(--ink-dim); }
.ask-receipt-door { padding: 0; border: 0; background: transparent; font: inherit; font-size: 12px; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.ask-items { display: flex; flex-direction: column; gap: 2px; margin: 0 -10px; }
.ask-item { display: grid; grid-template-columns: 24px minmax(0, 1fr) 12px; column-gap: 12px; align-items: center; width: 100%; min-height: 44px; padding: 8px 10px; border: 0; border-radius: 10px; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.ask-item:hover, .ask-item.sel { background: var(--bg-hover); }
.ask-item.plain { grid-template-columns: 24px minmax(0, 1fr); cursor: default; }
.ask-item.plain:hover { background: transparent; }
.ask-item-mark { display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; background: var(--bg-sunken); color: var(--ink-muted); }
.ask-item-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ask-item-top { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 8px; }
.ask-item-title { font-size: 13.5px; font-weight: 500; color: var(--ink); }
.ask-item-meta { font-size: 12px; color: var(--ink-dim); }
.ask-item-line { font-size: 13px; line-height: 1.45; color: var(--ink-muted); overflow-wrap: anywhere; }
.ask-item-chev { color: var(--ink-faint); }
.ask-do { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.ask-do-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.ask-do-row .btn.sel { background: var(--bg-hover); border-color: var(--line-strong); }
/* Today's… nothing: the band is gone; the compact answer is the takeover's (Task 6). */
.ask-answer.compact .ask-figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
```

  Delete `.ask-receipt` and `.ask-receipt-from` (the popover; `:129-130`), `.ask-move*` (`:146-149`) and the old `.ask-figure*` rules. Keep `.ask-card*` (`:156-166`).

- [ ] **Step 7: Run the palette test**: expected PASS, the older cases too (the one at `:652` asserts an Open by testid and the one at `:613` reads `ask-open`'s absence; `ask-move` is read by none). If a case reads `.ask-figure-value` or `ask-receipt`, point it at `ask-figure` and `ask-tile-from`.

- [ ] **Step 8: Commit** `git add apps/dashboard/src/legacy/pages/ask-turn.jsx apps/dashboard/src/legacy/styles/ask.css tooling/scripts/tests/ask-palette.test.mjs && git commit -m "The answer on the rail: tiles, marks, one button, chips"`.

### Task 5: The band and the reading line (desktop)

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx` (`right` `:470-503`, the trace body `:518-531`, the bar `:562-589`)
- Modify: `apps/dashboard/src/legacy/styles/ask.css` (`:9-45`)
- Test: `tooling/scripts/tests/ask-palette.test.mjs`

- [ ] **Step 1: Write the failing test** after "the Line draws Ask's face" (`:797`): while a turn reads, the band shows one reading line with the latest trace and Stop at the field's end; with words typed, Send is live; empty, it is not.

```js
test("the band: one reading line says what Ask reads, Send fills with words, Stop while a turn runs", async () => {
  const calls = ask([]);
  const tick = () => new Promise((r) => setImmediate(r));
  let release;
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(1).id, title: input.text });
    on({ t: "trace", text: "Reading the inbox…" });
    on({ t: "trace", text: "Reading this week's calls…" });
    await new Promise((r) => { release = r; });
    on({ t: "final", message: { id: "m-b", role: "assistant", text: "Done.", atMs: Date.now(), failed: false, citations: [], followups: [], proposals: [] } });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, true, "nothing to send yet");
  assert.equal(byTestId(tree, "ask-reading"), null, "no reading line at rest");
  typed(tree, "how did the week go?");
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-send").props.disabled, false);
  keyed(tree, "Enter");
  await tick();
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byTestId(tree, "ask-reading")), "Reading this week's calls…", "the latest trace, one line");
  assert.ok(byTestId(tree, "ask-stop"), "Stop while it reads");
  assert.equal(byTestId(tree, "ask-send"), null);
  release();
  for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-reading"), null, "the line goes with the answer");
  await closes();
});
```

- [ ] **Step 2: Run it**: expected FAIL, `ask-send` is null.

- [ ] **Step 3: The band's markup.** Replace the `.ask-line-bar` block (`:562-589`) with:

```jsx
        <div className={`ask-stage${talk.listening ? " listening" : ""}${live ? " live" : ""}`} data-testid="ask-line">
          <div className="ask-stage-row">
            {!phone ? (
              <span className="ask-stage-face" ref={faceRef}>
                {AskFace ? <AskFace className="ask-stage-canvas" testId="ask-line-face" /> : null}
              </span>
            ) : null}
            {scope ? (
              <span className="ask-scope" title={`${scope.kind}: ${scope.label}`} data-testid="ask-scope">
                <Icon name={arScopeIcon(scope)} size={10} />
                <span>{scope.label}</span>
                <button type="button" onClick={() => setScope(null)} aria-label={t.clearScope}><Icon name="x" size={9} /></button>
              </span>
            ) : null}
            <input
              ref={inputRef}
              className="ask-line-input"
              placeholder={talk.listening ? t.listening : active ? t.follow : t.placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKey}
              onKeyUp={(e) => hold.onKeyUp(e)}
              role="combobox"
              aria-expanded={showRows && rows.length > 0}
              aria-controls={showRows ? "ask-rows" : undefined}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label="Ask Chanlytics"
              data-testid="ask-input"
              maxLength={1000}
              enterKeyHint="send"
              autoCapitalize="sentences"
              autoComplete="off"
              spellCheck={false}
            />
            <span className="ask-line-right">{right}</span>
          </div>
          {live ? (
            <p className="ask-reading" aria-live="polite" data-testid="ask-reading">
              <span className="ask-reading-dot" aria-hidden="true" />
              {live.traces.length ? live.traces[live.traces.length - 1] : t.thinking}
            </p>
          ) : null}
        </div>
```

  `const phone = arPhone();` goes at the top of the render (after `if (!open || !A) return null;`); Task 6 gives the phone its own face.

- [ ] **Step 4: Send.** In `right` (`:470-503`), the rest state adds Send after the mic, and the answer state after Clear:

```jsx
  const sendButton = (
    <button type="button" className="ask-send" onClick={() => submit()} disabled={!query.trim()} aria-label={t.send} title={t.send} data-testid="ask-send">
      <Icon name="arrow-up" size={15} />
    </button>
  );
```

  `right` becomes: live → Stop (as today); `drawn` → Copy, Read aloud, Clear, then `sendButton`; else `talkButton` then `sendButton`.

- [ ] **Step 5: The trace body goes.** Replace the `else if (live || (quick && quick.pending))` branch (`:518-531`) with one that shows only the question:

```jsx
  else if (live || (quick && quick.pending)) {
    body = (
      <div className="ask-trace" data-testid="ask-trace">
        <p className="ask-turn-q">{live ? live.q : quick.q}</p>
      </div>
    );
  }
```

- [ ] **Step 6: The styles**, replacing `.ask-modal.ask-line` … the hold-to-talk rules (`ask.css:14-45`):

```css
.ask-modal.ask-line {
  max-width: var(--measure-prose); max-height: calc(100vh - 128px);
  display: flex; flex-direction: column; overflow: hidden;
  border-color: var(--line-strong); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg);
}
.ask-overlay.ask-line-scrim { padding-top: 80px; }
@media (min-width: 721px) { .ask-modal.ask-line { animation: line-in 160ms var(--ease-out); } }
@keyframes line-in { from { opacity: 0; translate: 0 4px; } }
body.ask-open .tb-ask .tb-ask-face { visibility: hidden; }

/* ---- The band: the three at 84px beside the field; under it, while Ask reads, one line in coral ink (spec 4.2) ---- */
.ask-stage { flex: none; display: grid; grid-template-rows: auto 0fr; background: var(--bg-sunken); border-bottom: 1px solid var(--line); padding: 12px 16px 12px 14px; transition: grid-template-rows 160ms var(--ease-out); }
.ask-stage.live { grid-template-rows: auto 1fr; }
.ask-stage-row { display: flex; align-items: center; gap: 12px; min-height: 68px; }
.ask-stage-face { flex: none; display: block; width: 84px; height: 68px; }
.ask-stage-canvas { display: block; width: 84px; height: 68px; }
.ask-line-input { flex: 1; min-width: 0; height: 44px; border: 0; outline: 0; background: transparent; font: inherit; font-size: 20px; letter-spacing: -0.012em; color: var(--ink); }
.ask-line-input::placeholder { color: var(--ink-dim); }
.ask-stage.listening .ask-line-input::placeholder { color: var(--accent); }
.ask-line-right { flex: none; display: flex; align-items: center; gap: 4px; }
.ask-line-btn { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--radius-md); border: 1px solid var(--line); background: transparent; color: var(--ink-muted); cursor: pointer; }
.ask-line-btn:hover, .ask-line-btn:focus-visible { color: var(--ink); background: var(--bg-hover); outline: none; }
.ask-line-btn.quiet { width: 32px; height: 32px; border-color: transparent; color: var(--ink-dim); }
.ask-line-btn.on { color: var(--accent); background: var(--accent-soft); border-color: transparent; }
.ask-send { flex: none; display: inline-grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 50%; background: var(--ink); color: var(--bg); cursor: pointer; transition: background-color var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out); }
.ask-send:disabled { background: var(--bg-active); color: var(--ink-faint); cursor: default; }
.ask-send:not(:disabled):hover { background: oklch(from var(--ink) calc(l + 0.08) c h); }
.ask-reading { display: flex; align-items: center; gap: 8px; min-height: 0; overflow: hidden; margin: 0; padding: 0 0 0 96px; font-size: 12.5px; color: var(--accent-ink); }
.ask-stage.live .ask-reading { padding-top: 6px; }
.ask-reading-dot { flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); animation: ask-pulse 1.2s ease-in-out infinite; }
@keyframes ask-pulse { 0%, 100% { transform: scale(.7); opacity: .4; } 50% { transform: scale(1); opacity: 1; } }
.ask-scope { flex: none; display: inline-flex; align-items: center; gap: 5px; max-width: 180px; height: 26px; padding: 0 4px 0 8px; border: 1px solid var(--line); border-radius: var(--radius-full); font-size: 12px; color: var(--ink-muted); }
.ask-scope > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ask-scope button { display: inline-flex; padding: 2px; border: 0; background: transparent; color: var(--ink-dim); cursor: pointer; }
.ask-scope button:hover { color: var(--ink); }
.ask-line .ask-confirm { flex: none; margin: 0 16px 10px; max-width: none; }
.ask-line-head { display: none; }
.ask-said { position: absolute; width: 1px; height: 1px; margin: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.ask-talk { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--radius-md); border: 0; background: transparent; color: var(--ink-dim); cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; }
.ask-talk:hover { color: var(--ink); background: var(--bg-hover); }
.ask-talk.on { background: var(--accent-soft); color: var(--accent); }
.ask-talk.off { opacity: .5; }
.ask-talk:disabled { opacity: .4; cursor: default; }
```

  Delete the old `.ask-line-bar`, `.ask-line-face*`, `.ask-trace-row`, `.ask-trace-dot`, `.ask-trace-check` rules; keep `.ask-tool` and `.ask-follow-chip` (the peek's), `.ask-trace { padding: … }` for the question line.

- [ ] **Step 7: Run the palette test**: expected PASS (the face case reads `ask-line-face`, kept; the Esc case reads `ask-stop`, kept).

- [ ] **Step 8: Commit** `git add apps/dashboard/src/legacy/pages/ask-real.jsx apps/dashboard/src/legacy/styles/ask.css tooling/scripts/tests/ask-palette.test.mjs && git commit -m "The band: the three at 84px, one reading line, Send"`.

### Task 6: The takeover (phone)

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-hooks.jsx` (add `useHoldPress`)
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx` (the render; the focus rule `:187`; the history entry; the hero)
- Modify: `apps/dashboard/src/legacy/styles/ask.css` (the phone block `:170-217`)
- Test: `tooling/scripts/tests/ask-palette.test.mjs`

- [ ] **Step 1: Write the failing test.** A phone is the window's `matchMedia` answering true for `(max-width: 720px)`; `history` gains `pushState` and `back` that record; the test opens the Line, checks the screen and its close paths:

```js
const phoneWindow = () => {
  const mm = globalThis.window.matchMedia;
  const hist = globalThis.window.history;
  const log = [];
  globalThis.window.matchMedia = (q) => ({ matches: q === "(max-width: 720px)", addEventListener() {}, removeEventListener() {} });
  globalThis.window.history = { replaceState() {}, pushState: (s, t, u) => log.push(["push", s, u]), back: () => { log.push(["back"]); globalThis.window.dispatchEvent(new Event("popstate")); } };
  globalThis.window.location.href = "https://app.chanlytics.com/w/studio#/today";
  return { log, restore: () => { globalThis.window.matchMedia = mm; globalThis.window.history = hist; } };
};

test("on a phone the Line is the screen: no focus on open, the three in the hero, one history entry, Back closes, × goes back", async () => {
  const ph = phoneWindow();
  let closed = 0;
  const props = { open: true, onClose: () => { closed++; } };
  try {
    ask([]);
    render(Palette, props);
    let tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-hero"), null ? false : !!byTestId(tree, "ask-hero"), "the hero stands on a phone");
    assert.ok(byTestId(byTestId(tree, "ask-hero"), "ask-line-face"), "the three are in the hero, not the band");
    assert.equal(byTestId(tree, "ask-real").props["aria-modal"], "true");
    assert.deepEqual(ph.log, [["push", null, "https://app.chanlytics.com/w/studio#/today"]], "one entry, null state, same address (S8)");
    // Back: the entry pops and the takeover closes, pushing nothing more.
    globalThis.window.dispatchEvent(new Event("popstate"));
    assert.equal(closed, 1);
    render(Palette, CLOSED);
    await later(Palette, CLOSED);
    assert.equal(ph.log.length, 1, "closing by Back goes back no further");
    // Open again; × closes through history.back().
    render(Palette, props);
    tree = await later(Palette, props);
    press(byTestId(tree, "ask-close"));
    assert.equal(closed, 2);
    render(Palette, CLOSED);
    await later(Palette, CLOSED);
    assert.deepEqual(ph.log.slice(1), [["push", null, "https://app.chanlytics.com/w/studio#/today"], ["back"]]);
  } finally {
    ph.restore();
  }
});
```

  Fix the first assertion to `assert.ok(byTestId(tree, "ask-hero"), "the hero stands on a phone");` (written plainly). The focus rule is asserted through `useAskFocus`: on a phone it is given `false`, which the stub's effects show as the input never receiving `focus`; add to the case, after the first `later`: `assert.equal(inputOf(tree).focused, undefined)` only if the stub records focus; otherwise leave focus to the browser check in Task 9.

- [ ] **Step 2: Run it**: expected FAIL, `ask-hero` is null.

- [ ] **Step 3: `useHoldPress`** in `ask-hooks.jsx` after `useHoldSpace`:

```js
// A press held AH_HOLD_MS listens; a shorter one does nothing. Pointer events, so no keyboard opens and a touch's
// mouse twin is not a second press. The phone's three take it (spec S11); the mic keeps its own down/up.
const useHoldPress = ({ talk, onHold }) => {
  const timer = useAhRef(null);
  const held = useAhRef(false);
  const end = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (held.current) { held.current = false; talk.stop(); }
  };
  return {
    onPointerDown: (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (timer.current || held.current) return;
      timer.current = setTimeout(() => { timer.current = null; held.current = true; if (onHold) onHold(); talk.start(); }, AH_HOLD_MS);
    },
    onPointerUp: end,
    onPointerLeave: end,
    onPointerCancel: end,
    onContextMenu: (e) => { if (e && e.preventDefault) e.preventDefault(); },
  };
};
```

  Export it: `window.AskHooks = { useAskTalk, useHoldSpace, useHoldPress, useAskFocus, useAskSpeech };`. `AH_HOLD_MS` exists at the top of the file (the band used 320ms; keep the hook's value).

- [ ] **Step 4: The focus rule** (`ask-real.jsx:187`): `H.useAskFocus(inputRef, open && !doomed && !arPhone(), [open, live, active, doomed, view, quick]);`

- [ ] **Step 5: The history entry** (after the keyboard effect, `:180`):

```js
  // Back closes the takeover (S8): one entry with a null state and the same address, so the shell's hash router
  // never hears it and Next's app router, which reloads on a Back to a state it did not write (app-shell.jsx), ignores
  // it. Whether the entry is ours is this ref, not the popped state. Closing any other way goes back over it.
  const pushed = useArRef(false);
  useArEffect(() => {
    const h = typeof window !== "undefined" ? window.history : null;
    if (!open || !arPhone() || !h || !h.pushState) return;
    h.pushState(null, "", window.location.href);
    pushed.current = true;
    const onPop = () => { if (pushed.current) { pushed.current = false; onClose(); } };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (pushed.current) { pushed.current = false; if (h.back) h.back(); }
    };
  }, [open]);
```

- [ ] **Step 6: The hero, the heard words and the foot.** In the render, after `const phone = arPhone();`, the phone's hold and haptics:

```js
  const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* none here */ } };
  const holdThree = H.useHoldPress({ talk: { start: () => (talk.canTalk ? talk.start() : flash({ msg: <>{t.noVoice}</> })), stop: talk.stop }, onHold: () => buzz(8) });
```

  `useHoldPress` is a hook: call it unconditionally with the other hooks (before `if (!open || !A) return null;`), not after `phone` is known. The hero, drawn inside `.ask-line-body`'s place on a phone, above the body:

```jsx
  const heroSmall = !!(live && (live.say || live.text)) || !!answerMsg || !!(quick && quick.answer);
  const hero = phone ? (
    <div className={`ask-hero${heroSmall ? " small" : ""}${talk.listening ? " listening" : ""}`} data-testid="ask-hero">
      <span className="ask-hero-stage" ref={faceRef} {...holdThree} data-testid="ask-hero-stage">
        {AskFace ? <AskFace className="ask-hero-canvas" testId="ask-line-face" /> : null}
      </span>
      {talk.listening ? (
        <p className="ask-heard" aria-live="polite" data-testid="ask-heard">{query || t.listening}</p>
      ) : live && !heroSmall ? (
        <>
          <p className="ask-turn-q">{live.q}</p>
          <p className="ask-reading" aria-live="polite" data-testid="ask-reading"><span className="ask-reading-dot" aria-hidden="true" />{live.traces.length ? live.traces[live.traces.length - 1] : t.thinking}</p>
        </>
      ) : heroSmall && latest && latest.q ? (
        <p className="ask-turn-q">{latest.q.text}</p>
      ) : null}
    </div>
  ) : null;
```

  On a phone the `.ask-stage` band (Task 5) draws no face and no reading line (`!phone` guards both) and sits last in the column as the foot. While listening on a phone the foot shows the pill instead of the field:

```jsx
  const foot = phone && talk.listening ? (
    <div className="ask-letgo-wrap">
      <button type="button" className="btn btn-ghost" onClick={() => { talk.stop(); setTimeout(() => inputRef.current && inputRef.current.focus(), 20); }}>{t.typeInstead}</button>
      <button type="button" className="ask-letgo" aria-pressed="true" onPointerUp={talk.stop} data-testid="ask-letgo"><Icon name="wave" size={18} />{t.letGo}</button>
    </div>
  ) : null;
```

  and the band is drawn only when `!foot`. In the returned tree, the order inside `.ask-modal` becomes: `.ask-said`, `.ask-line-head`, the folds, `hero`, the body, the confirm, `foot || band`. `buildLineRows` is called with `phone` so Earlier is not a section on a phone at rest; the head's Earlier button and a Clear button (`{active ? <button type="button" className="btn btn-ghost" onClick={clearLine} data-testid="ask-clear-head">{t.clear}</button> : null}`) sit in `.ask-line-head`, which loses its grabber. The final `buzz(8)` goes where the final message lands in `submit` (after `setLive(null)`).

- [ ] **Step 7: The styles.** Replace the phone block (`ask.css:170-217`) with the takeover:

```css
/* ---- A phone: the takeover. The Line is the screen; the three in a hero; the field at the foot (spec 5) ---- */
.phone-ask { display: none; }
.ask-hero { display: none; }
@media (max-width: 720px) {
  .phone-ask {
    display: grid; place-items: center;
    position: fixed; right: 10px; bottom: calc(6px + env(safe-area-inset-bottom));
    width: 44px; height: 44px; border-radius: 50%; border: 0; cursor: pointer;
    background: var(--accent); color: var(--accent-fg); z-index: 121;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
  }
  .phone-ask .phone-ask-face { display: block; width: 30px; height: 24px; }
  .phone-ask:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .phone-ask:active { transform: scale(0.96); }
  body:has(.inbox.phone-thread) .phone-ask,
  body:has(.conversations.phone-detail) .phone-ask { display: none; }

  .ask-overlay { padding: 0; align-items: flex-end; }
  .ask-overlay.ask-line-scrim { padding: 0; }
  .ask-modal.ask-line {
    position: fixed; inset: 0; max-width: none; width: auto; max-height: none; height: 100dvh;
    padding-top: env(safe-area-inset-top); padding-bottom: calc(env(safe-area-inset-bottom) + var(--ask-kb, 0px));
    border: 0; border-radius: 0; box-shadow: none; background: var(--bg);
    animation: wash-in var(--duration-base) var(--ease-out);
  }
  .ask-line-head { position: relative; flex: none; display: flex; align-items: center; gap: 4px; min-height: 52px; padding: 4px 6px 0 8px; }
  .ask-line-head .ask-line-btn { margin-left: auto; width: 44px; height: 44px; border-color: transparent; }
  .ask-line-head .btn-ghost { height: 36px; }
  .ask-line .ask-folds { order: 0; max-height: none; flex: none; border-bottom: 0; }
  .ask-hero { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 4px 20px 0; }
  .ask-hero-stage { display: block; width: 100%; height: min(232px, 34dvh); border: 0; padding: 0; background: transparent; touch-action: none; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; transition: height 200ms var(--ease-out); }
  .ask-hero-canvas { display: block; width: 100%; height: 100%; }
  .ask-hero.small .ask-hero-stage { height: 78px; }
  .ask-hero .ask-turn-q { margin: 0; text-align: center; }
  .ask-hero .ask-reading { padding: 0; justify-content: center; font-size: 13.5px; }
  .ask-heard { margin: 8px 0 0; text-align: center; font-size: 26px; font-weight: 500; line-height: 1.25; letter-spacing: -0.02em; color: var(--ink); text-wrap: balance; }
  .ask-hero.listening .ask-hero-canvas { filter: none; }
  .ask-line .ask-line-body { flex: 1 1 auto; border-top: 0; }
  .ask-rows { align-items: center; gap: 16px; padding: 8px 16px 12px; }
  .ask-row.now { flex-direction: column; align-items: center; gap: 10px; text-align: center; min-height: 0; padding: 0; }
  .ask-row.now .ask-row-label { font-size: 14.5px; line-height: 1.45; max-width: 32ch; }
  .ask-row.now.sel { background: transparent; }
  .ask-chips { justify-content: center; }
  .ask-line .ask-stage { order: 9; margin: 8px 12px 10px; padding: 0 8px 0 16px; border: 1px solid var(--line); border-bottom-color: var(--line); border-radius: var(--radius-xl); grid-template-rows: auto; }
  .ask-stage-row { min-height: 56px; gap: 8px; }
  .ask-line-input { font-size: 16px; height: 44px; }
  .ask-talk { width: 40px; height: 40px; }
  .ask-letgo-wrap { order: 9; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 0 16px 12px; }
  .ask-letgo { display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 60px; border: 0; border-radius: 18px; background: var(--accent); color: var(--accent-fg); font: inherit; font-size: 16px; font-weight: 600; touch-action: none; user-select: none; }
  .ask-figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ask-item { min-height: 48px; }
  .ask-turn { padding: 12px 16px 16px; }
  .ask-part { column-gap: 14px; }
  .ask-trace { padding: 0; }
  .ask-trace .ask-turn-q { display: none; }
}
```

  The leaving copy (`components.css:3197`) plays `modal-out` on `.ask-modal` on a phone too; a sheet-drop is not wanted for a full screen, and the kit's `.ask-overlay[data-leaving]` wash-out covers it: check `components.css:3211-3215` and exclude `.ask-line` from `sheet-drop` there if it lists `.ask-modal`.

- [ ] **Step 8: Run the palette test**: expected PASS for the new case and the rest (they run with `matchMedia` false, the desktop).

- [ ] **Step 9: Commit** `git add apps/dashboard/src/legacy/pages/ask-hooks.jsx apps/dashboard/src/legacy/pages/ask-real.jsx apps/dashboard/src/legacy/styles/ask.css tooling/scripts/tests/ask-palette.test.mjs && git commit -m "The takeover: the Line is the screen on a phone"`.

### Task 7: Persistence

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx` (the closed effect `:182-185`; new effects; `clearLine`; `submit`)
- Test: `tooling/scripts/tests/ask-palette.test.mjs`

- [ ] **Step 1: Write the failing test.** A tab memory stub records drafts; the words typed come back on the next open; a conversation's id is kept and opened first after a "reload" (a fresh render with `active` empty is the stub's reload):

```js
test("what was typed comes back on the next open; the open conversation's id is kept and opened again (spec S9)", async () => {
  const drafts = new Map();
  globalThis.window.__tabMemory = {
    draft: (k) => (drafts.has(k) ? drafts.get(k) : null),
    keepDraft: (k, v) => drafts.set(k, v),
    dropDraft: (k) => drafts.delete(k),
    place: () => null, keepPlace() {},
  };
  try {
    const calls = ask([TH(1)]);
    render(Palette, OPEN);
    let tree = await later(Palette, OPEN);
    typed(tree, "how did the");
    await new Promise((r) => setTimeout(r, 350));
    assert.equal(drafts.get("ask"), "how did the", "kept as typed");
    await closes();
    tree = await opens();
    assert.equal(inputOf(tree).props.value, "how did the", "back on the next open");
    keyed(tree, "Enter");
    for (let i = 0; i < 3; i++) tree = await later(Palette, OPEN);
    assert.equal(drafts.has("ask"), false, "gone once sent");
    assert.equal(drafts.get("ask-thread"), TH(1).id, "the conversation's id is kept");
    press(byTestId(tree, "ask-clear"));
    tree = await later(Palette, OPEN);
    assert.equal(drafts.has("ask-thread"), false, "and forgotten at Clear");
    // A kept id is opened first: set one, then open a Line with nothing active.
    drafts.set("ask-thread", TH(1).id);
    await closes();
    tree = await opens();
    tree = await later(Palette, OPEN);
    assert.deepEqual(calls.threadsOpened, [TH(1).id], "opened again after a reload");
    await closes();
  } finally {
    delete globalThis.window.__tabMemory;
  }
});
```

  `ask()` (`:322`) builds the stand-in for the routes: give it `threadsOpened`, pushed by its `thread(id)` function, if it does not record opens yet. The `closes()`/`opens()` helpers exist (`:281-288`). The case's "reload" is the second open with `active` null after Clear, which is what a reload gives.

- [ ] **Step 2: Run it**: expected FAIL at `drafts.get("ask")`.

- [ ] **Step 3: The effects** in `ask-real.jsx`. The closed effect (`:182-185`) stops forgetting the words:

```js
  // Closed: nothing keeps reading and the rows are home again; the words typed and an open conversation come back
  // until Clear (D14, S9).
  useArEffect(() => {
    if (!open) { setQuick(null); setDoomed(null); setView("rows"); speech.stop(); }
  }, [open]);
```

  After it:

```js
  // The draft and the conversation's id, kept in the tab (legacy-bridge/tab-memory.ts): the words as typed, a beat
  // after the last key; the id whenever a thread is opened or made; both gone at Clear, the words gone once sent.
  const mem = () => (typeof window !== "undefined" && window.__tabMemory) || null;
  useArEffect(() => {
    const m = mem();
    if (!open || !m) return;
    const kept = m.draft("ask");
    if (typeof kept === "string" && kept && !query) setQuery(kept);
    const th = m.draft("ask-thread");
    if (typeof th === "string" && th && !active) openThread({ id: th }).then((o) => { if (!o) m.dropDraft("ask-thread"); });
  }, [open]);
  useArEffect(() => {
    const m = mem();
    if (!open || !m) return;
    const id = setTimeout(() => { if (query.trim()) m.keepDraft("ask", query); else m.dropDraft("ask"); }, 300);
    return () => clearTimeout(id);
  }, [query, open]);
  useArEffect(() => {
    const m = mem();
    if (!m) return;
    if (active && active.id) m.keepDraft("ask-thread", active.id);
    else if (!active) m.dropDraft("ask-thread");
  }, [active && active.id]);
```

  `openThread` is declared below the effects in the component; the effect calls it at run time, after the render, which the stub's effects allow (the file's own comment at `:1-6` and the N3 case rely on this).

- [ ] **Step 4: Run the test**: expected PASS.

- [ ] **Step 5: Commit** `git add apps/dashboard/src/legacy/pages/ask-real.jsx tooling/scripts/tests/ask-palette.test.mjs && git commit -m "The draft and the conversation come back"`.

### Task 8: Today's band goes

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/dashboard-a.jsx:1,6,17`
- Modify: `apps/dashboard/src/legacy/styles/dashboard-a-v2.css:27-57`
- Delete: `apps/dashboard/src/legacy/pages/today-face.jsx`, `apps/dashboard/src/legacy-bridge/mascot/turn.ts`, `tooling/scripts/tests/today-face.test.mjs`, `tooling/scripts/tests/mascot-turn.test.mjs`
- Modify: `apps/dashboard/src/legacy-bridge/manifest.ts:67`, `apps/dashboard/src/legacy/Chanlytics.html:110`, `apps/dashboard/src/legacy-bridge/mascot/index.ts` (the `turn` export), `tooling/scripts/serve-legacy.mjs:72-73` (the comment), `tooling/scripts/tests/today-page.test.mjs:67,1405-1406`, `apps/dashboard/src/legacy/CLAUDE.md` (the Today paragraph at `:68`)
- Test: `tooling/scripts/tests/today-page.test.mjs`

- [ ] **Step 1: Change the composition pin** in `today-page.test.mjs:1406` to `["HeroBrief", "dash-a-v2-core", "TodayCard", "dash-a-v2-foot"]` and remove the import at `:67`. Run `corepack pnpm exec tsx --test tooling/scripts/tests/today-page.test.mjs`. Expected: FAIL (TodayFace still drawn).

- [ ] **Step 2: Remove the band**: `dashboard-a.jsx:17` (`<TodayFace />`), its name from the `/* global */` line and the comment at `:6`; `dashboard-a-v2.css:27-57`; `manifest.ts:67`; `Chanlytics.html:110`; delete the four files; in `mascot/index.ts` drop the `turn` import and export (`{ initial, reduce }`); `serve-legacy.mjs:72-73` say the bundle is the Line's face. Grep for leftovers: `grep -rn "today-face\|TodayFace\|mascot/turn\|turnReducer" apps tooling e2e docs/superpowers/plans --include=*.jsx --include=*.ts --include=*.mjs --include=*.html` must list only the two Line specs and the old plans.

- [ ] **Step 3: Run**: `corepack pnpm exec tsx --test tooling/scripts/tests/today-page.test.mjs` PASS; `corepack pnpm exec tsx --test tooling/scripts/tests/legacy-harness.test.mjs` PASS (the lists match); `corepack pnpm exec tsx --test tooling/scripts/tests/ask-palette.test.mjs` PASS (the seed case at `:395` still passes: `askAbout({ thread })` stays on the shell).

- [ ] **Step 4: The ratchet**: `UPDATE_SOURCE_SCAN_BASELINE=1 corepack pnpm exec tsx --test tooling/scripts/tests/source-scan-ratchet.test.mjs` if the deleted files lowered a count; commit the baseline only if it fell.

- [ ] **Step 5: `legacy/CLAUDE.md`**: the Today paragraph (`:68`) loses the band's sentences and gains one: "On a phone Ask is a full-screen takeover from the ✦ (`pages/ask-real.jsx`, spec `docs/superpowers/specs/2026-09-23-ask-the-stage-design.md`); Today draws no band." The Ask sentence in the same paragraph names the Stage.

- [ ] **Step 6: The e2e specs** (nightly only; write them, run none against production):
  - `e2e/today.spec.ts:214-238` becomes:

```ts
  test("the ✦ opens Ask over the whole screen; no band stands above the queue; a swipe down closes it", async ({ page }) => {
    await signIn(page);
    await page.goto("/#/today");
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("today-face")).toHaveCount(0);
    await page.getByTestId("phone-ask").tap();
    const ask = page.getByTestId("ask-real");
    await expect(ask).toBeVisible();
    const box = await ask.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBeGreaterThan(800);
    await expect(ask.getByTestId("ask-hero")).toBeVisible();
    await expect(ask.getByTestId("ask-input")).not.toBeFocused();
    // A pull down past 80px from the head closes it, following the finger (data-bits touchSwipe).
    await page.touchscreen.tap(195, 30);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: 40 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: 180 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(ask).toHaveCount(0);
  });
```

  - `e2e/ask.spec.ts` gains, in a phone describe (`test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })`), a case: the ✦ opens the takeover, words typed and a close by Back (`page.goBack()`) bring the words back on the next open (`expect(ask.getByTestId("ask-input")).toHaveValue(...)`).

- [ ] **Step 7: Commit** `git add -A apps/dashboard/src/legacy apps/dashboard/src/legacy-bridge tooling/scripts e2e && git commit -m "Today's band goes: the takeover is the phone's Ask"`.

### Task 9: Versions, gates, the browser, the PR

**Files:**
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (`?v=` on `ask.css`, `dashboard-a-v2.css`, `ask-text.jsx`, `ask-hooks.jsx`, `ask-turn.jsx`, `ask-home.jsx`, `ask-real.jsx`, `dashboard-a.jsx`)

- [ ] **Step 1: Bump every edited file's `?v=`** in `Chanlytics.html` by one (`ask.css?v=8`, `dashboard-a-v2.css?v=41`, `ask-text.jsx?v=6`, `ask-hooks.jsx?v=4`, `ask-turn.jsx?v=5`, `ask-home.jsx?v=3`, `ask-real.jsx?v=9`, `dashboard-a.jsx?v=15`). `manifest.ts` carries no versions.

- [ ] **Step 2: The gates**: `corepack pnpm --filter "./packages/*" build && corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm format:check && corepack pnpm test`, then `git status` (no dist drift but contracts', committed in Task 2) and `node tooling/scripts/check-dist.mjs` after the commit. Expected: all green, `dist in sync with src`.

- [ ] **Step 3: The browser** (`docs/runbook.md` "See a real page": `.env.local` with the three keys; `corepack pnpm --filter @chanlytics/dashboard dev`; `/w/<slug>/`; then `git status` and restore `tsconfig.json`/`next-env.d.ts` if `next dev` rewrote them):
  - 1440: the band at 92px with the three at 84×68; a question: the reading line and the leapfrog; the answer on the rail: tiles, a receipt on hover, items with marks, Open as a button, chips; ↑↓ walk them; Esc; ⌘K brings it back with the draft.
  - 390 (`resize_window` mobile, reload): the ✦ opens the takeover full screen, no keyboard; the three at 52px breathing; a tap on the field opens the keyboard and the foot rides it; a hold on the three shows "Let go to ask" (the pane's mic is blocked: the toast says so); a question: the three shrink as the headline streams; tiles two across; a swipe down closes; Back closes; reopening resumes; Today has no band.
  - Dark; reduced motion (`prefers-reduced-motion` emulation): nothing flies.
  - Take the screenshots the PR shows: 1440 rest and answer; 390 rest, listening, answer.

- [ ] **Step 4: Squash-merge `origin/main` alone** (`git merge origin/main`, read `git status`, rebuild `packages/*` and commit any dist with a real diff), then push, open the PR with what changes for a customer (nothing on the server; the phone's Ask is a full screen; Today's phone band is gone), what to set (nothing), the deploy order (either), the screenshots; CI; merge on green; production checked on the salon at 1440 and on Ruben's phone.

- [ ] **Step 5: Docs**: the spec's status line says "built" with the PR number; `docs/superpowers/plans/2026-09-23-ask-the-stage.md` (this file) gets an "As built" note for anything that differed.

---

## Self-review

- **Spec coverage**: S1 (Task 5 band, Task 6 hero), S2 (Tasks 3–4), S3 (Task 4), S4 (Task 4 tile), S5 (Task 5 reading line, Task 6 hero), S6–S8 (Task 6), S9 (Task 7), S10 (Task 6 Step 4), S11 (Task 6 Step 3, 6), S12 (Task 5 Step 4), S13 (Tasks 4–6 CSS; the FLIP is the existing one, its `faceRef` now on the band's face or the hero's stage), S14–S15 (Task 8), S16 (Task 6 `buzz`), S17 (no key drawn; the at-rest case keeps its D17 assertion). Section 6's table: every row has a task above; "where speech is absent" is the existing `talkButton` and `holdThree`'s `noVoice` toast.
- **Types and names**: `rightNowParts` (Tasks 2–3), `useHoldPress` (Task 6), testids `ask-pill`, `ask-row-brief`, `ask-tile`, `ask-tile-from`, `ask-item-mark`, `ask-send`, `ask-reading`, `ask-hero`, `ask-hero-stage`, `ask-heard`, `ask-letgo`, `ask-clear-head` used as declared.
- **Placeholders**: none; every code step shows its code.
