# Ask on a Phone, Part A (the thread) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On a phone, Ask's conversation becomes one scrolling thread (every earlier answer drawn in full, your
questions as sent bubbles) while the three keep today's states and lead the newest answer: large while Ask reads,
small while the words stream, a still mark once it is whole, and forward over the field while you type or hold to talk.

**Architecture:** The shell (`pages/ask-real.jsx`) decides a phone's `thread` mode and draws its parts; the parts live in
the answer kit (`pages/ask-turn.jsx`, `window.AskAnswerKit`) and the scroll hooks in `pages/ask-hooks.jsx`
(`window.AskHooks`). The desktop Line keeps its folds, moved unchanged into the kit as `AskFolds`. The keyboard's slide
moves unchanged into the hooks file so the shell stays under its line ratchet. CSS in the phone block of `styles/ask.css`.
Spec: `docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md` (D1–D10). Part B (answer blocks) is section 7
of the spec and gets its own plan once Ask Rewired's Phase 4 closes.

**Tech Stack:** the legacy shell (React via Babel globals, no bundler, `window.*` publishers), node:test on a stub React
(`tooling/scripts/tests/ask/ask-palette.test.mjs`), Playwright captures against the running dashboard.

**Rules that bite here** (repo `CLAUDE.md`, `apps/dashboard/src/legacy/CLAUDE.md`):
- `tooling/scripts/tests/baselines/file-length.json` holds `ask-real.jsx` at 1,055 lines: it may only fall. Bank the
  fall with `UPDATE_BASELINES=1 corepack pnpm test` once green.
- No new file, no new window global or publisher; add to `window.AskAnswerKit` and `window.AskHooks`.
- Top-level names are unique across the legacy tree (the harness shares one scope).
- Bump `?v=N` in `apps/dashboard/src/legacy/Chanlytics.html` for every edited file, one past main's and every open PR's.
- No function over 150 lines, 30 branches or 5 levels (complexity ratchet).

---

## File map

| File | Change |
| --- | --- |
| `apps/dashboard/src/legacy/pages/ask-text.jsx` | `newChat`, `latest` words (en, es) |
| `apps/dashboard/src/legacy/pages/ask-hooks.jsx` | `useAskPin`, `useAskLatest`, pure `pinTop`/`latestShown`, `pinNow`; the keyboard slide moved in from the shell as `slide`/`slideFrom` |
| `apps/dashboard/src/legacy/pages/ask-turn.jsx` | `next` prop on `AskAnswer`/`AskTurn`; `AskQuestion`, `AskThread`, `AskNextRow`, `AskListen`, `AskLatest`; `AskFolds` moved in from the shell |
| `apps/dashboard/src/legacy/pages/ask-real.jsx` | `thread`/`listen` in `arUnder`; `heroMode` in `arHeroState`/`arHero`; `next={!thread}` in `arBody`; the phone middle in `arLineView`; New in the head; pin and Latest in `useArWalk`/`AskReal`; `arFolds` and the slide removed |
| `apps/dashboard/src/legacy/styles/ask.css` | the phone block: thread, bubble, hero modes, lighter answer, next row, listen band, Latest |
| `apps/dashboard/src/legacy/Chanlytics.html` | version keys |
| `tooling/scripts/tests/ask/ask-palette.test.mjs` | five new phone tests, one test's label (Clear → New) |
| `tooling/scripts/tests/baselines/file-length.json` | the shell's fall, banked |

---

### Task 1: The failing tests

**Files:** Modify `tooling/scripts/tests/ask/ask-palette.test.mjs` (after the phone takeover tests, before
"the takeover composes"; and the head test at "offers Clear in the head").

- [ ] **Step 1: Add the helper and five tests** after the test "on a desktop Ask pushes no entry of its own…":

```js
/* ------------------------------ a phone's thread (2026-09-27-ask-chat-on-a-phone) ------------------------------ */

/** The newest turn's part of a phone's thread: its question, the three and its answer. */
const nowOf = (tree) => byClass(tree, "ask-now")[0];
/** A v2 answer with next questions, as the routes return one. */
const withNext = (n) => ({
  v: 2,
  form: "structured",
  say: { headline: `Answer ${n}.`, detail: "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [`Follow ${n} up?`] },
  language: "en",
});
/** Ask a question the way a thumb does: the words typed, then Enter. */
const asks = async (tree, props, q) => {
  typed(tree, q);
  tree = await later(Palette, props);
  keyed(tree, "Enter");
  return later(Palette, props);
};

test("on a phone a conversation is one thread: an earlier answer stays drawn in full under its question as a sent bubble, with no fold, and the newest question carries the id the thread stands at its top (D1, D2, D5)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  try {
    const calls = ask([]);
    globalThis.window.__ask.send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "final", message: said(`m-${calls.sent.length}`, `Answer ${calls.sent.length}.`) });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "how was the week?");
    tree = await asks(tree, props, "and the week before?");
    assert.deepEqual(calls.sent, ["how was the week?", "and the week before?"]);
    assert.equal(byTestId(tree, "ask-fold"), null, "no fold on a phone");
    assert.deepEqual(
      all(tree, (n) => n.props?.["data-testid"] === "ask-q").map(textOf),
      ["how was the week?", "and the week before?"],
      "every question is a sent bubble, in order",
    );
    assert.ok(textOf(byTestId(tree, "ask-thread")).includes("Answer 1."), "the earlier answer is drawn in full");
    assert.equal(textOf(find(tree, (n) => n.props?.id === "ask-now-q")), "and the week before?");
    assert.equal(textOf(byTestId(nowOf(tree), "ask-say")), "Answer 2.", "the newest answer under the newest question");
    await closes();
  } finally {
    ph.restore();
  }
});

test("on a phone the three lead the newest answer: large with the reading line while Ask reads, small while the words stream, a still mark once it is whole, one face in the thread (D3)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  let say = () => {};
  let land = () => {};
  const saying = new Promise((r) => (say = r));
  const landed = new Promise((r) => (land = r));
  try {
    const calls = ask([]);
    globalThis.window.__ask.send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(6).id, title: input.text });
      on({ t: "trace", text: "Reading the inbox…" });
      await saying;
      on({ t: "say", headline: "Two people wrote", detail: "" });
      await landed;
      on({ t: "final", message: said("m-1", "Two people wrote today.") });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "who wrote today?");
    const hero = (tr) => byTestId(tr, "ask-hero");
    assert.equal(hero(tree).props.className, "ask-hero thinking", "large while Ask reads");
    assert.ok(textOf(byTestId(hero(tree), "ask-reading")).includes("Reading the inbox…"), "the reading line under them");
    assert.equal(textOf(byTestId(tree, "ask-q")), "who wrote today?", "the question is the bubble over them");
    assert.equal(byClass(hero(tree), "ask-turn-q").length, 0, "not a line under the three");
    say();
    tree = await later(Palette, props);
    assert.equal(hero(tree).props.className, "ask-hero small", "small while the words stream");
    land();
    tree = await later(Palette, props);
    assert.equal(hero(tree).props.className, "ask-hero sig", "a still mark once the answer is whole");
    assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-hero").length, 1, "one face in the thread");
    await closes();
  } finally {
    ph.restore();
  }
});

test("on a phone the field in use in a conversation brings the three forward over it to listen: the thread dims and stays drawn, its own face hidden; letting go puts them back (D4)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  try {
    const calls = ask([]);
    globalThis.window.__ask.send = async (input, on) => {
      calls.sent.push(input.text);
      on({ t: "thread", id: TH(5).id, title: input.text });
      on({ t: "final", message: said("m-1", "Answer 1.") });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "how was the week?");
    assert.equal(byTestId(tree, "ask-listen"), null, "no band while the field rests");
    inputOf(tree).props.onFocus();
    tree = await later(Palette, props);
    assert.ok(byTestId(byTestId(tree, "ask-listen"), "ask-listen-face"), "the three come forward over the field");
    assert.ok(byClass(tree, "dim").length, "the thread dims");
    assert.ok(textOf(nowOf(tree)).includes("Answer 1."), "and stays drawn");
    typed(tree, "and last");
    tree = await later(Palette, props);
    assert.ok(byTestId(tree, "ask-listen"), "typing keeps them listening");
    assert.ok(textOf(nowOf(tree)).includes("Answer 1."), "the words typed do not take the thread's place");
    inputOf(tree).props.onBlur();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-listen"), null, "let go: the band goes");
    await closes();
  } finally {
    ph.restore();
  }
});

test("on a phone the newest answer's next questions ride over the field, not inside it; an earlier answer shows none, and none stand while Ask reads or the field is in use (D6)", async () => {
  const ph = phoneWindow();
  const props = { open: true, onClose() {} };
  const nexts = (tree) => all(tree, (n) => n.props?.["data-testid"] === "ask-next");
  try {
    const calls = ask([]);
    let land = () => {};
    globalThis.window.__ask.send = async (input, on) => {
      calls.sent.push(input.text);
      const n = calls.sent.length;
      on({ t: "thread", id: TH(5).id, title: input.text });
      if (n === 2) await new Promise((r) => (land = r));
      on({ t: "final", message: { ...said(`m-${n}`, `Answer ${n}.`), answer: withNext(n) } });
    };
    render(Palette, props);
    let tree = await later(Palette, props);
    tree = await asks(tree, props, "first?");
    assert.deepEqual(nexts(byTestId(tree, "ask-next-row")).map(textOf), ["Follow 1 up?"], "over the field");
    assert.equal(nexts(tree).length, 1, "and nowhere inside the answer");
    assert.equal(nexts(tree)[0].props.id, "ask-move-0", "the id the keys walk, as inside the answer");
    inputOf(tree).props.onFocus();
    tree = await later(Palette, props);
    assert.equal(byTestId(tree, "ask-next-row"), null, "not while the field is in use");
    inputOf(tree).props.onBlur();
    tree = await later(Palette, props);
    press(nexts(tree)[0]);
    tree = await later(Palette, props);
    assert.deepEqual(calls.sent, ["first?", "Follow 1 up?"], "a press asks it");
    assert.equal(byTestId(tree, "ask-next-row"), null, "not while Ask reads");
    land();
    tree = await later(Palette, props);
    assert.deepEqual(nexts(tree).map(textOf), ["Follow 2 up?"], "the newest answer's alone; the earlier shows none");
    await closes();
  } finally {
    ph.restore();
  }
});

test("the thread's arithmetic: the newest question stands a breath under the thread's top edge, the first at the very top; Latest is offered once the newest question is below what the thread shows (D5, D7)", () => {
  const H = globalThis.window.AskHooks;
  assert.equal(H.pinTop(14), 0, "the first question: the thread's own top");
  assert.equal(H.pinTop(620), 606, "a later one, 14px under the edge");
  assert.equal(H.latestShown({ qTop: 900, scrollTop: 0, clientHeight: 600 }), true, "scrolled up: below");
  assert.equal(H.latestShown({ qTop: 900, scrollTop: 600, clientHeight: 600 }), false, "in sight");
  assert.equal(H.latestShown({ qTop: 560, scrollTop: 0, clientHeight: 600 }), false, "its first line in sight");
});
```

- [ ] **Step 2: The head says New.** In the test "on a phone a preset question answered without a model offers Clear
  in the head…", rename it to "…offers New in the head, as a conversation does, and New goes home", and after
  `assert.ok(byTestId(tree, "ask-clear-head"), "and the head offers Clear over it");` add:

```js
    assert.equal(textOf(byTestId(tree, "ask-clear-head")), "New", "it says New (D9), and does what Clear did");
```

- [ ] **Step 3: Run them and see them fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask/ask-palette.test.mjs 2>&1 | tail -40`
Expected: the five new tests FAIL (`ask-q` not found, `pinTop` undefined, className `ask-hero small`…) and the head
test fails on "New"; every other test passes.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tooling/scripts/tests/ask/ask-palette.test.mjs
git commit -m "Ask on a phone: the thread's tests, failing (D1–D9)"
```

---

### Task 2: The words

**Files:** Modify `apps/dashboard/src/legacy/pages/ask-text.jsx`

- [ ] **Step 1:** In `en`, after `clear: "Clear",` add `newChat: "New",` and `latest: "Latest",`. In `es`, after
  `clear: "Borrar",` add `newChat: "Nueva",` and `latest: "Lo último",`.

---

### Task 3: The hooks: pin, Latest, and the keyboard's slide moved in

**Files:** Modify `apps/dashboard/src/legacy/pages/ask-hooks.jsx`; `apps/dashboard/src/legacy/pages/ask-real.jsx:61-122`

- [ ] **Step 1: Move the slide.** Cut `AR_KEYS_MS`, `arRect`, `arSlideFrom`, `arSlide` and their comments from
  `ask-real.jsx` (lines 61–122) and paste them before `window.AskHooks` in `ask-hooks.jsx`, renamed `AH_KEYS_MS`,
  `ahRect`, `ahSlideFrom`, `ahSlide`, with `arStill()` read as `ahStill()`. Nothing else in them changes.

- [ ] **Step 2: Add the thread's scroll** before `window.AskHooks`:

```js
// A phone's thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md): the newest question stands at
// the top as a question is asked or a conversation opened (D5), and Latest is offered once it is out of sight below
// (D7). The arithmetic is pure, so it is proved without a layout; the thread is the question's offsetParent (ask.css).
const ahStill = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
/** The scroll that stands the newest question a breath under the thread's top edge; the first stands at the top. */
const ahPinTop = (qTop, gap = 14) => Math.max(0, qTop - gap);
/** Whether the newest question's first line is below what the thread shows: Latest is offered then. */
const ahLatestShown = ({ qTop, scrollTop, clientHeight }) => qTop > scrollTop + clientHeight - 24;
/** Stand the newest question at the top of the thread `body`, gliding unless motion is reduced. */
const ahPinNow = (body) => {
  const q = body && body.querySelector ? body.querySelector("#ask-now-q") : null;
  if (!q) return;
  const top = ahPinTop(q.offsetTop);
  if (typeof body.scrollTo === "function") body.scrollTo({ top, behavior: ahStill() ? "auto" : "smooth" });
  else body.scrollTop = top;
};
/** D5: each time `key` changes (another question, another conversation), the newest question stands at the top. */
const useAskPin = (bodyRef, key, on) => {
  useAhEffect(() => {
    if (on) ahPinNow(bodyRef.current);
  }, [key, on]);
};
/** D7: whether the newest question is out of sight below, read again as the thread scrolls, once a frame. */
const useAskLatest = (bodyRef, on) => {
  const [shown, setShown] = useAhState(false);
  useAhEffect(() => {
    const body = bodyRef.current;
    if (!on || !body || !body.addEventListener) {
      setShown(false);
      return undefined;
    }
    let frame = 0;
    const look = () => {
      frame = 0;
      const q = body.querySelector("#ask-now-q");
      setShown(!!q && ahLatestShown({ qTop: q.offsetTop, scrollTop: body.scrollTop, clientHeight: body.clientHeight }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(look);
    };
    body.addEventListener("scroll", onScroll, { passive: true });
    look();
    return () => {
      body.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [on]);
  return shown;
};
```

- [ ] **Step 3: Publish them** (the same one publisher):

```js
window.AskHooks = {
  useAskTalk, useHoldSpace, useHoldPress, useAskFocus, useAskSpeech, useAskPin, useAskLatest,
  pinNow: ahPinNow, pinTop: ahPinTop, latestShown: ahLatestShown, slide: ahSlide, slideFrom: ahSlideFrom,
};
```

- [ ] **Step 4: The shell calls the moved slide.** In `ask-real.jsx`, `useArSlide` takes `H` and calls
  `H.slide(from, stageRef.current, heroRef.current)`; `arStage` takes `H` and its field's `onFocus` sets
  `slideFrom.current = H.slideFrom(stageRef.current, heroRef.current)`.

---

### Task 4: The kit's parts

**Files:** Modify `apps/dashboard/src/legacy/pages/ask-turn.jsx`; `apps/dashboard/src/legacy/pages/ask-real.jsx` (`arFolds`)

- [ ] **Step 1: `next` on `AskAnswer`.** Add `next = true` to its props; after `const a = answer;` add
  `const nexts = next ? a.do.next : [];`; in `hasDo` and the Do row read `nexts` for `a.do.next`. Add to the comment
  above it: "`next`: whether the next questions are drawn in the answer: a phone's thread draws the newest answer's
  over its field (AskNextRow) and an earlier answer's nowhere (D6)."

- [ ] **Step 2: `next` on `AskTurn`.** Add `next = true` to its props and pass `next={next}` to `AskAnswer`.

- [ ] **Step 3: The new parts**, before `window.AskAnswerKit`:

```jsx
// ---- A phone's thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md) ----------------------------

// A question in a phone's thread (D2): the person's own words at the right, in the Inbox's sent bubble. The newest
// carries the id the thread stands at its top (D5, AskHooks.useAskPin).
const AskQuestion = ({ text, now = false }) => (
  <p className="ask-q" id={now ? "ask-now-q" : undefined} data-testid="ask-q">{text}</p>
);

// A phone's earlier turns, each in full (D1): its question, then its answer with its cards as they were left and its
// Open, and no next questions (D6: they are the newest answer's). What a card became is kept on the conversation
// (`onOutcome`), so a card drawn again here never offers Send twice.
const AskThread = ({ turns, t, lang, onNav, onFollow, onOutcome, onEdit }) => (
  <div className="ask-thread" data-testid="ask-thread">
    {turns.map((tn, k) => (
      <div key={tn.q.id || k} className="ask-thread-turn">
        <AskQuestion text={tn.q.text} />
        <AskTurn m={tn.a} next={false} t={t} lang={lang} onNav={onNav} onFollow={onFollow} onOutcome={onOutcome} onEdit={() => onEdit(tn.q.text)} />
      </div>
    ))}
  </div>
);

// The newest answer's next questions over a phone's field (D6): one row that scrolls sideways, so a long question is
// never cut to an ellipsis. Each keeps the id the keys walk (answerMoves' order), as it had inside the answer.
const AskNextRow = ({ answer, sel = -1, onFollow }) => {
  const first = answerMoves(answer).findIndex((mv) => mv.type === "next");
  if (first < 0) return null;
  return (
    <div className="ask-next-row" data-testid="ask-next-row">
      {answer.do.next.map((q, k) => (
        <button key={q} type="button" id={`ask-move-${first + k}`} className={`ask-chip next${sel === first + k ? " sel" : ""}`} onClick={() => onFollow(q)} data-testid="ask-next"><span>{q}</span></button>
      ))}
    </div>
  );
};

// The three come forward to listen (D4): over a phone's field while it is in use in a conversation, or while a held
// mic listens, with the words heard. The thread's own face is hidden meanwhile (ask.css `.ask-line-body.dim`): one
// character on the screen.
const AskListen = ({ AskFace, heard }) => (
  <div className="ask-listen" data-testid="ask-listen">
    <span className="ask-listen-stage">{AskFace ? <AskFace className="ask-hero-canvas" testId="ask-listen-face" /> : null}</span>
    {heard ? <p className="ask-heard" aria-live="polite">{heard}</p> : null}
  </div>
);

// Latest (D7): scrolled up past the newest question, a pill over the field with the three's still mark (a second live
// canvas would be a second character) stands the newest question at the top again.
const AskLatest = ({ t, overNext, onPress }) => (
  <button type="button" className="ask-latest" data-over-next={overNext ? "1" : "0"} onClick={onPress} data-testid="ask-latest">
    <Icon name="three" size={13} />
    {t.latest}
  </button>
);
```

- [ ] **Step 4: Move the desktop's folds.** Cut `arFolds` (its comment and body) from `ask-real.jsx` and paste it into
  the kit as a component, the markup unchanged:

```jsx
// A desktop's conversation, folded above the band (the Line's spec, 6.4): a row per earlier answer, one opened at a
// time, the rest behind "+N earlier" past three. A phone draws AskThread instead (D1).
const AskFolds = ({ folded, shown, unfolded, setUnfolded, setFoldAll, t, A, lang, onNav, onFollow, onOutcome, onEdit }) => (
  <div className="ask-folds" data-testid="ask-folds">
    {folded.length > shown.length ? (
      <button type="button" className="ask-fold-more" onClick={() => setFoldAll(true)}>{t.earlierFolded(folded.length - shown.length)}</button>
    ) : null}
    {shown.map((tn) => {
      const k = folded.indexOf(tn);
      const isOpen = unfolded === k;
      return (
        <div key={tn.q.id || k} className={`ask-fold${isOpen ? " open" : ""}`}>
          <button type="button" className="ask-fold-row" aria-expanded={isOpen} onClick={() => setUnfolded(isOpen ? -1 : k)} data-testid="ask-fold">
            <span className="ask-mark m1" aria-hidden="true" />
            <span className="ask-fold-q">{tn.q.text}</span>
            <span className="ask-fold-a">{A.answerText(A.answer(tn.a).answer)}</span>
            <Icon name="chevron" size={12} className="ask-fold-chev" />
          </button>
          {isOpen ? <AskTurn m={tn.a} t={t} lang={lang} onNav={onNav} onFollow={onFollow} onOutcome={onOutcome} onEdit={() => onEdit(tn.q.text)} /> : null}
        </div>
      );
    })}
  </div>
);
```

- [ ] **Step 5: Publish** (the same publisher):

```js
window.AskAnswerKit = { AskTurn, AskAnswer, AskCard, answerMoves, askKindGlyph, AskQuestion, AskThread, AskNextRow, AskListen, AskLatest, AskFolds };
```

---

### Task 5: The shell chooses the thread

**Files:** Modify `apps/dashboard/src/legacy/pages/ask-real.jsx`

- [ ] **Step 1: `arUnder`** — after `const words = …`, add and return:

```js
  // A phone's thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md, D1): a conversation or a quick
  // answer, every turn in full, unless its words were left in the field for their rows or Earlier is open; the field in
  // use or a held mic keeps it, dimmed, with the three come forward over the field (D4).
  const thread = phone && view === "rows" && (!!active || !!quick) && (!showRows || composing || talk.listening);
  const listen = thread && (composing || talk.listening) && !live && !(quick && quick.pending);
  const nowQ = live ? live.q : quick ? quick.q : latest && latest.q ? latest.q.text : "";
```

and return `composingRows: composingRows && !thread` with `thread, listen, nowQ` added.

- [ ] **Step 2: `arBody`** — take `thread`; pass `next={!thread}` to the quick answer's and the newest answer's `AskTurn`.

- [ ] **Step 3: `arHeroState`** — take `thread`; return `heroMode`, drop the question line in a thread, and never
  centre or stand pills in it:

```js
  // In a phone's thread the three lead the newest answer (D3): large while Ask reads, small while the words stream, a
  // still mark at the answer's start once it is whole; its question is the bubble over them, not a line under.
  const reading = (!!live && !(live.say || live.text)) || !!(quick && quick.pending);
  const heroMode = !thread ? (heroSmall ? " small" : "") : reading ? " thinking" : live ? " small" : " sig";
  const heroQ = !heroSmall || thread ? null : live ? live.q : quick && quick.answer ? quick.q : latest && latest.q ? latest.q.text : null;
  const restful = !thread && (talk.listening || (showRows && view === "rows" && !query));
```

- [ ] **Step 4: `arHero`** — `className={`ask-hero${heroMode}`}`; the heard words only when `!thread` (a thread's are
  the band's); inside the reading branch, `{thread ? null : <p className="ask-turn-q">…</p>}`.

- [ ] **Step 5: The phone's middle in `arLineView`**:

```jsx
        {body || phone ? (
          <div className={`ask-line-body${restful ? " rest" : ""}${composingRows ? " composing" : ""}${thread ? " thread" : ""}${listen ? " dim" : ""}`} ref={bodyRef}>
            {thread ? <AskThread turns={folded} t={t} lang={lang} onNav={nav} onFollow={submit} onOutcome={noteOutcome} onEdit={editWords} /> : null}
            {phone ? <div className="ask-now">{thread && nowQ ? <AskQuestion text={nowQ} now /> : null}{hero}{body}</div> : body}
          </div>
        ) : null}
        {listen ? <AskListen AskFace={AskFace} heard={talk.listening ? query || t.listening : ""} /> : null}
        {nextRow}
        {thread && below && !listen ? <AskLatest t={t} overNext={!!nextRow} onPress={() => H.pinNow(bodyRef.current)} /> : null}
```

with, before the return, `const nextRow = thread && !composing && !talk.listening && !live && drawn && drawn.answer.do.next.length ? <AskNextRow answer={drawn.answer} sel={move} onFollow={submit} /> : null;`

- [ ] **Step 6: New.** The head's `ask-clear-head` button draws `<Icon name="plus" size={13} />{t.newChat}`.

- [ ] **Step 7: Pin and Latest.** In `useArWalk` (taking `H`), the reset to the top becomes the desktop's, and a phone
  pins once per question:

```js
  // A new answer starts at its top on a desktop; on a phone the newest question stands at the top of the thread, once
  // per question or conversation, never again as its answer lands (D5).
  useArEffect(() => { if (bodyRef.current && !arPhone()) bodyRef.current.scrollTop = 0; }, [active && active.messages.length, quick, view]);
  H.useAskPin(bodyRef, arNowKey(active, quick), open && arPhone() && view === "rows");
```

with `arNowKey` beside `arTurns`:

```js
/** The newest question's key: a phone's thread stands it at the top once each (D5). */
const arNowKey = (active, quick) => {
  const q = active ? [...active.messages].reverse().find((m) => m.role === "user") : null;
  return q ? q.id : quick ? `quick:${quick.q}` : "";
};
```

and in `AskReal`, after `useArWalk(ln);`:
`ln.below = H.useAskLatest(ln.bodyRef, open && arPhone() && ln.view === "rows" && !!(ln.active || ln.quick));`

- [ ] **Step 8: The kit's parts reach the shell.** `AskReal` destructures `AskThread, AskQuestion, AskNextRow,
  AskListen, AskLatest, AskFolds` from `window.AskAnswerKit` into `ln`; `ln.folds` becomes

```js
  // A desktop's conversation folds above the band (AskAnswerKit.AskFolds); a phone draws its thread instead (D1).
  ln.folds = !ln.phone && ln.view === "rows" && ln.folded.length ? <AskFolds folded={ln.folded} shown={ln.shownFolds} unfolded={ln.unfolded} setUnfolded={ln.setUnfolded} setFoldAll={ln.setFoldAll} t={ln.t} A={A} lang={ln.lang} onNav={ln.nav} onFollow={ln.submit} onOutcome={ln.noteOutcome} onEdit={ln.editWords} /> : null;
```

- [ ] **Step 9: Run the palette suite**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask/ask-palette.test.mjs 2>&1 | tail -15`
Expected: every test passes, the five new ones included.

- [ ] **Step 10: Commit**

```bash
git add apps/dashboard/src/legacy/pages
git commit -m "Ask on a phone: one thread, and the three lead each answer (D1–D9)"
```

---

### Task 6: The look (the phone block of ask.css)

**Files:** Modify `apps/dashboard/src/legacy/styles/ask.css` (inside `@media (max-width: 720px)`, and the reduced
motion block at its end)

- [ ] **Step 1:** `.ask-line-body > .ask-turn > .ask-turn-q` becomes `.ask-line-body .ask-turn > .ask-turn-q`; add
  `position: relative` to the phone's `.ask-line-body` (the question's offsetParent); `.ask-hero.small .ask-hero-stage`
  becomes 56px.

- [ ] **Step 2:** Add, at the end of the phone block:

```css
  /* ---- One thread (docs/superpowers/specs/2026-09-27-ask-chat-on-a-phone-design.md): every turn in full, your words a
     sent bubble, the three leading the newest answer, the next questions over the field ---- */
  .ask-line-body.thread .ask-now { display: flex; flex-direction: column; min-height: 100%; padding-top: 14px; }
  .ask-thread-turn { display: flex; flex-direction: column; padding-top: 14px; }
  .ask-q { align-self: flex-end; max-width: 80%; margin: 0 16px 0 56px; padding: 10px 14px; border-radius: 20px 20px 6px 20px; background: var(--bubble-us-bg); font-size: 15px; line-height: 1.45; color: var(--ink); overflow-wrap: anywhere; }
  /* The three leading the newest answer (D3): large while Ask reads, small while the words stream, a still mark at its
     start once it is whole. The canvas fits its box every frame, so the squares ease with the stage. */
  .ask-hero-stage { transition: height 200ms var(--ease-out), width 200ms var(--ease-out); }
  .ask-hero.thinking { padding-top: 12px; }
  .ask-hero.thinking .ask-hero-stage { height: min(190px, 28dvh); }
  .ask-hero.sig { align-items: flex-start; padding: 12px 16px 0; }
  .ask-hero.sig .ask-hero-stage { width: 34px; height: 28px; }
  /* The answer, lighter (D8): no rail, a 17px headline, the detail in ink, rows bordered, each figure one line. */
  .ask-answer { gap: 16px; }
  .ask-part { grid-template-columns: minmax(0, 1fr); column-gap: 0; }
  .ask-part::before, .ask-part > .ask-mark { display: none; }
  .ask-headline { font-size: 17px; line-height: 1.42; }
  .ask-detail { font-size: 15px; line-height: 1.55; color: var(--ink); }
  .ask-prose { font-size: 15px; }
  .ask-items { margin: 0; gap: 8px; }
  .ask-item { border: 1px solid var(--line); border-radius: 14px; background: var(--bg-raised); }
  .ask-item.plain:hover { background: var(--bg-raised); }
  .ask-figures { display: flex; flex-direction: column; gap: 6px; }
  .ask-tile, .ask-tile.open, .ask-tile:has(:focus-visible) { display: block; padding: 0; border: 0; border-radius: 0; background: transparent; }
  .ask-tile-value { display: inline; font-size: 15px; font-weight: 600; letter-spacing: 0; }
  .ask-tile-label { font-size: 15px; color: var(--ink-muted); margin-left: 5px; }
  .ask-tile-note, .ask-tile.open .ask-tile-note, .ask-tile:has(:focus-visible) .ask-tile-note { display: inline; font-size: 15px; color: var(--ink-dim); }
  .ask-tile-note::before { content: " · "; }
  .ask-tile-from { margin-top: 2px; }
  /* The newest answer's next questions over the field (D6): one row that scrolls sideways, never cut. */
  .ask-next-row { order: 8; flex: none; display: flex; gap: 8px; overflow-x: auto; padding: 8px 12px 0; scrollbar-width: none; }
  .ask-next-row::-webkit-scrollbar { display: none; }
  .ask-next-row .ask-chip { flex: none; max-width: none; height: 34px; font-size: 13px; }
  .ask-next-row .ask-chip > span:first-child { overflow: visible; }
  /* The three come forward over the field to listen (D4); the thread dims under them and its own face hides. */
  .ask-listen { order: 8; flex: none; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 16px 0; animation: wash-in 160ms var(--ease-out) both; }
  .ask-listen-stage { display: block; width: 100%; height: min(116px, 16dvh); }
  .ask-listen .ask-heard { margin: 0; font-size: 20px; }
  .ask-line-body.dim > * { opacity: 0.36; transition: opacity 200ms var(--ease-out); }
  .ask-line-body.dim .ask-hero { visibility: hidden; }
  /* Latest (D7): over the field, and over the next questions when they stand. */
  .ask-latest { position: absolute; z-index: 2; left: 50%; bottom: calc(env(safe-area-inset-bottom) + var(--ask-keys, 0px) + 84px); translate: -50% 0; display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; border: 1px solid var(--line); border-radius: var(--radius-full); background: var(--bg-raised); box-shadow: var(--shadow-md); font: inherit; font-size: 12.5px; font-weight: 500; color: var(--ink); cursor: pointer; animation: wash-in 160ms var(--ease-out) both; }
  .ask-latest[data-over-next="1"] { bottom: calc(env(safe-area-inset-bottom) + var(--ask-keys, 0px) + 126px); }
```

- [ ] **Step 3:** In the reduced-motion block add `.ask-listen, .ask-latest` to the `animation: none` list and
  `.ask-line-body.dim > *` to the `transition: none` list (one class each; see the reduced-motion specificity note).

---

### Task 7: Keys, ratchets, gates

- [ ] **Step 1: Version keys.** In `apps/dashboard/src/legacy/Chanlytics.html`, one past main's and every open PR's key:
  `ask.css`, `ask-text.jsx`, `ask-hooks.jsx`, `ask-turn.jsx`, `ask-real.jsx`. Check with
  `gh pr list --repo expectmeout/chanlytics-os --state open --json number,files --jq '.[] | select([.files[].path] | any(test("Chanlytics.html"))) | .number'`
  and read each such PR's keys for these files.
- [ ] **Step 2: Gates.** `corepack pnpm -r typecheck && corepack pnpm lint && corepack pnpm test`; then
  `UPDATE_BASELINES=1 corepack pnpm test` to bank the shell's fall in `file-length.json`; `corepack pnpm format:check`.
  Expected: green; `git diff --stat` shows only this plan's files and the banked baseline.
- [ ] **Step 3: Commit** the CSS, the keys and the baseline.

---

### Task 8: Proof on the running app

- [ ] **Step 1:** Copy `apps/dashboard/.env.local` from another worktree (never print it), start the dashboard from
  this worktree through a session `launch.json` entry, sign the pane in as the e2e owner (`e2e/session.ts`'s recipe).
- [ ] **Step 2:** At 390×844, light and dark, in `/w/chanlytics-e2e/`: open Ask; with a stand-in `window.__ask.send` in
  the page (a trace, a say, a final with next questions), capture the home, reading, answering, answered, a follow-up
  with the earlier answer above it, the field in use, and scrolled up with Latest. Then one real question.
- [ ] **Step 3:** Remove the `launch.json` entry and stop the server; `git checkout -- apps/dashboard/tsconfig.json
  apps/dashboard/next-env.d.ts` if `next dev` rewrote them.

---

### Task 9: One review, the PR, Ruben's yes, the merge

- [ ] **Step 1:** One combined review (spec compliance and quality) of the branch; fix its findings once, no re-review.
- [ ] **Step 2:** Before pushing: `git fetch --refmap= origin +refs/heads/main:refs/ask-chat/main`, rebase onto it,
  `git diff refs/ask-chat/main --stat` shows only this plan's files, re-check the version keys, run the gates again.
- [ ] **Step 3:** Push, open the PR (what changes for a customer, nothing to set, either deploy order), bind it.
- [ ] **Step 4:** Show Ruben the captures; on his yes and green checks, squash-merge; then check main's next CI run.

---

## Part A, refined (spec 7a: D11–D16), after the review round

### Task 10: The refinements, tests first

**Files:** `pages/ask-turn.jsx` (AskReads, AskActs, the card in parts: AskCardHead, AskCardChange, AskCardActs,
AskCardReceipt, AskRing, atUndoOpen), `pages/ask-real.jsx` (the three's mode, the reading list, the placeholder, the
acts under the newest answer, a desktop's acts from the kit), `pages/ask-text.jsx` (Undo), `styles/ask.css`,
`tooling/scripts/tests/ask/ask-palette.test.mjs`, `tooling/scripts/tests/shell/the-pages-say-only-what-is-true.test.mjs`.

- [x] Tests, failing: the D3 test says `ask-hero sig speaking` while words arrive, lists two reads with the repeat said
      once and the newest `now`, and the field says Follow up (D11–D13); the newest answer carries Copy, which copies
      its words, and an earlier one none (D14); a reply card draws the bubble, the undo's words under it and Not now
      apart; its receipt leads with the ring and says Undo while its window is open, and neither once it has closed (D16);
      the reads say Thinking before the first and a read again once, where it was last; the ring starts where the window
      stands and its end takes the ring and the Undo (D12, D16).
- [x] The kit's parts, then the shell's four changes, then the look. The desktop's Copy and Read aloud are the kit's
      AskActs too (one copy of both acts; the shell 1,030 → 1,014 lines). The shell test's "the undo outlived the send"
      now also fails on a button saying Undo (it passed on any label but the old one; proved by forcing the undo open).
- [x] AskCard falls under its banked 105 lines and 58 branches (the parts take them); bank the fall: it left the
      complexity baseline (functions over the limit 207 → 206).
- [x] Gates; captures of R1–R5 on the running app, light and dark (`_gen/refined-capture.mts`, the card's verbs stood in:
      nothing sent), and a desktop's card and its line.
