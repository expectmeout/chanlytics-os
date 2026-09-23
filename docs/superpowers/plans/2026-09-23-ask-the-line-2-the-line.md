# Ask, the Line · Plan 2 of 4: the Line

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The palette becomes the Line, drawing today's answers as Say · Show · Do in the prose form:
- one door;
- Right now and the quick answers read Today's queue;
- the band draws the same answer;
- no key symbol is drawn;
- no server change.

**Architecture:** Spec `docs/superpowers/specs/2026-09-23-ask-the-line-design.md`, sections 5 and 6, D2, D4, D7–D10, D13–D17, and PR 2 in section 11.
- **Contracts** gain `ask-answer.ts`: the answer's type, `answerFromV1`, `oneDoor`, `cardOpenRoute`, the quick answers and `rightNowLine`.
- **The bridge** hands the pages `answer(m)`, `quick(q)`, `rightNow()` and `cardOpenRoute`.
- **The pages:** `ask-real.jsx` becomes the Line, `ask-turn.jsx` draws the answer, `ask-home.jsx` the rows, and `today-face.jsx` the band's answer.
- **Out of scope:** the server, and the model's output, stay as they are until Plan 3.

**Tech Stack:** Legacy pages in JSX (Babel, no bundler), loaded from two lists that must match (`legacy-bridge/manifest.ts`, `legacy/Chanlytics.html`); TypeScript contracts and bridge; `node --test` on a stub React.

**Worktree:** `cm-face`, on branch `design/ask-the-line-2`, off `origin/main` at `c93061cb` (it includes #922 and #923).

**Motion kept from #922:** the scrim keeps the class `ask-overlay` and `ref={window.leaving("ask")}`, and the panel keeps the class `ask-modal` and `window.touchSwipe`. The components.css motion block keys on those classes.

---

## Files

| File | Change |
|---|---|
| `packages/contracts/src/ask-answer.ts` | Create: the anatomy, `answerFromV1`, `oneDoor`, `cardOpenRoute`, the quick answers, `rightNowLine`, `answerText` |
| `packages/contracts/src/ask.ts` | `askIntent` and `callsToday` replace `fastPath`; `FOLLOWUP_ECHO` exported; `AskMessageVM.answer?` |
| `packages/contracts/src/index.ts` | `export * from "./ask-answer";` |
| `packages/contracts/src/chrome.ts` | `SHORTCUTS` gains the Ask group |
| `apps/dashboard/src/legacy-bridge/ask/palette.ts` | `answer`, `intent`, `waiting`, `rightNow`, `callsToday`; `shapeAnswer` and `fast` go |
| `apps/dashboard/src/legacy-bridge/ask.ts` | `quick` composed; `cardOpenRoute` and `answerText` published |
| `apps/dashboard/src/legacy-bridge/mascot/turn.ts` | A quick answer carries its `answer`; `links` go |
| `apps/dashboard/src/legacy/pages/ask-text.jsx` | The Line's words (en, es) |
| `apps/dashboard/src/legacy/pages/ask-hooks.jsx` | `useHoldSpace`; `useAskWide` goes |
| `apps/dashboard/src/legacy/pages/ask-turn.jsx` | Rewritten: `AskAnswer`, `AskTurn`, `AskCard`, `answerMoves` |
| `apps/dashboard/src/legacy/pages/ask-home.jsx` | Rewritten: `buildLineRows`, `AskRows` |
| `apps/dashboard/src/legacy/pages/ask-real.jsx` | Rewritten: the Line |
| `apps/dashboard/src/legacy/pages/today-face.jsx` | The quick path via `A.quick`; the exchange draws `AskAnswer` |
| `apps/dashboard/src/legacy/components/sidebar.jsx`, `pages/app-shell.jsx` | New Chat and `ask:new` go |
| `apps/dashboard/src/legacy/styles/ask.css` | Rewritten for the Line |
| `apps/dashboard/src/legacy/Chanlytics.html` | `?v=` bumps |
| Tests | New `ask-answer.test.mjs`. Updated: `ask-palette`, `today-face`, `mascot-turn`, `ask.test.mjs` (the intent case, the bridge case, retired pins), `chrome`, `the-pages-say-only-what-is-true`, `refusals-on-the-page` (unchanged API, kept green), `source-scan-baseline.json`, `e2e/ask.spec.ts`, `e2e/team-card.spec.ts`, `e2e/phone.spec.ts` |

---

### Task 1: The answer's anatomy in contracts

**Files:** Create `packages/contracts/src/ask-answer.ts`; modify `packages/contracts/src/ask.ts` and `packages/contracts/src/index.ts`. Test: create `tooling/scripts/tests/ask-answer.test.mjs`.

- [ ] **Step 1: Write the failing test** — `tooling/scripts/tests/ask-answer.test.mjs`:

```js
/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): every
 * answer made today read back in the prose form, one door per place, and the three quick answers from Today's queue.
 * Run on the contract itself.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_ANSWER_CAPS,
  answerFromV1,
  answerText,
  askIntent,
  callsAnswer,
  callsToday,
  cardOpenRoute,
  needsAnswer,
  oneDoor,
  openingsAnswer,
  rightNowLine,
} from "@chanlytics/contracts";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const v1 = (over = {}) => ({
  text: "Nora asked about Saturday; nobody else is waiting.",
  citations: [
    { kind: "thread", id: ID, label: "Nora", to: `inbox/th-${ID}` },
    { kind: "page", id: "reports", label: "Reports", to: "reports" },
  ],
  navigate: null,
  followups: ["Reply to Nora?", "What did the receptionist tell Nora?"],
  language: "en",
  ...over,
});

test("an answer made before the Line reads back as prose: its rows are items, a page it rested on is its Open, the follow-ups are next", () => {
  const a = answerFromV1(v1());
  assert.equal(a.v, 2);
  assert.equal(a.form, "prose");
  assert.deepEqual(a.say, { headline: "", detail: "Nora asked about Saturday; nobody else is waiting." });
  assert.deepEqual(
    a.show.items.map((i) => [i.title, i.meta, i.source.to, i.source.door]),
    [["Nora", "Thread", `inbox/th-${ID}`, true]],
  );
  assert.deepEqual(a.do.open, { to: "reports", label: "Reports", now: false }, "a page citation was a door to its page");
  assert.deepEqual(a.do.next, ["Reply to Nora?", "What did the receptionist tell Nora?"]);
  const nav = answerFromV1(v1({ navigate: { to: `conversations/cv-${ID2}`, label: "Open", now: true } }));
  assert.deepEqual(nav.do.open, { to: `conversations/cv-${ID2}`, label: "Open the call", now: true }, "navigate wins, in the app's words");
  assert.equal(answerFromV1(v1({ language: "es" })).show.items[0].meta, "Hilo");
});

test("one door: an item keeps its door, Open goes when an item has its route, a card's Open hides behind either, a receipt's door shows once, and a next question that points at an offered place goes", () => {
  const src = (kind, id, to) => ({ kind, id, label: id, to, door: true });
  const a = {
    v: 2,
    form: "structured",
    say: { headline: "Two people are waiting on you.", detail: "" },
    show: {
      figures: [
        { value: "5", label: "times it needed you", note: "up from 1", source: src("page", "reports", "reports") },
        { value: "1 min", label: "median reply", note: "", source: src("page", "reports", "reports") },
      ],
      items: [{ title: "Nora", meta: "WhatsApp · 3 days", line: "", source: src("thread", ID, `inbox/th-${ID}`) }],
      breakdown: null,
    },
    do: {
      open: { to: `inbox/th-${ID}`, label: "Open the thread", now: false },
      next: ["Show me Nora's thread", "Which threads still need me?", "which threads still need me"],
    },
    language: "en",
  };
  const cards = [
    { id: "p1", kind: "thread_verb", payload: { conversation_id: ID } },
    { id: "p2", kind: "playbook", payload: {} },
    { id: "p3", kind: "reply", payload: { conversation_id: ID } },
  ];
  const { answer, cardOpen } = oneDoor(a, cards);
  assert.equal(answer.do.open, null, "the item is already the door to the thread");
  assert.deepEqual(cardOpen, { p1: false, p2: true, p3: false }, "the thread's card hides its Open; a reply never had one");
  assert.deepEqual(
    answer.show.figures.map((f) => f.source.door),
    [true, false],
    "the first receipt that points at Reports draws the door; the second says where it comes from without one",
  );
  assert.deepEqual(answer.do.next, ["Which threads still need me?"], "the echo of an offered thread goes, and so does a repeat");
  const routes = [
    ...answer.show.items.map((i) => i.source.to),
    ...(answer.do.open ? [answer.do.open.to] : []),
    ...cards.filter((c) => cardOpen[c.id]).map((c) => cardOpenRoute(c)),
    ...answer.show.figures.filter((f) => f.source && f.source.door).map((f) => f.source.to),
  ];
  assert.equal(new Set(routes).size, routes.length, `no route offered twice: ${routes.join(", ")}`);
});

test("a card's Open is the contract's: its page, the person's, or none, never a route with a hole in it", () => {
  assert.equal(cardOpenRoute({ kind: "settings", payload: {} }), "admin/workspace");
  assert.equal(cardOpenRoute({ kind: "policy", payload: {} }), "admin/autonomy");
  assert.equal(cardOpenRoute({ kind: "deal", payload: { contact_id: ID } }), `clients/${ID}`);
  assert.equal(cardOpenRoute({ kind: "deal", payload: {} }), null, "REGRESSION: it opened clients/undefined");
  assert.equal(cardOpenRoute({ kind: "broadcast", payload: {} }), "broadcasts");
  assert.equal(cardOpenRoute({ kind: "lead_search", payload: {} }), "clients/leads");
  assert.equal(cardOpenRoute({ kind: "thread_verb", payload: { conversation_id: ID } }), `inbox/th-${ID}`);
  for (const k of ["reply", "steer", "whisper", "invite"]) assert.equal(cardOpenRoute({ kind: k, payload: {} }), null, k);
});

const waiting = (people, runs = 0) => ({
  people: people.map((who, i) => ({
    id: `c${i}`,
    kind: "thread",
    who,
    channel: "WhatsApp",
    when: "waited 3d",
    line: "“Can I come at 3?”",
    to: `inbox/th-c${i}`,
  })),
  runs: Array.from({ length: runs }, (_, i) => ({
    id: `r${i}`,
    label: "Win-back · quiet 30 days",
    line: "1 person. Nothing sends until you say so.",
    to: `broadcasts/run:r${i}`,
  })),
});

test("Right now is Today's queue in a sentence: the people waiting, then the runs waiting for a yes, in English and Spanish", () => {
  assert.equal(rightNowLine(waiting([]), "en"), "Nobody is waiting on you right now.");
  assert.equal(rightNowLine(waiting(["Ana"]), "en"), "Ana is waiting on you.");
  assert.equal(
    rightNowLine(waiting(["Ana", "Sam"], 1), "en"),
    "Ana and Sam are waiting on you; one playbook run is waiting for your approval.",
  );
  assert.equal(rightNowLine(waiting(["Ana", "Sam", "Lee", "Kai"]), "en"), "Ana, Sam and 2 others are waiting on you.");
  assert.equal(rightNowLine(waiting([], 2), "en"), "2 playbook runs are waiting for your approval.");
  assert.equal(rightNowLine(waiting([]), "es"), "Nadie te espera ahora mismo.");
  assert.equal(rightNowLine(waiting(["Ana", "Sam"]), "es"), "Ana y Sam te esperan.");
});

test("who needs me: the sentence, then the people and the runs as their own doors, and the Inbox only for the rest past the cap", () => {
  const a = needsAnswer(waiting(["Ana", "Sam"], 1), "en");
  assert.equal(a.form, "structured");
  assert.equal(a.say.headline, "Ana and Sam are waiting on you; one playbook run is waiting for your approval.");
  assert.deepEqual(
    a.show.items.map((i) => [i.title, i.meta, i.line, i.source.to]),
    [
      ["Ana", "WhatsApp · waited 3d", "“Can I come at 3?”", "inbox/th-c0"],
      ["Sam", "WhatsApp · waited 3d", "“Can I come at 3?”", "inbox/th-c1"],
      ["Win-back · quiet 30 days", "Playbook", "1 person. Nothing sends until you say so.", "broadcasts/run:r0"],
    ],
  );
  assert.equal(a.do.open, null, "each item is already a door");
  const many = needsAnswer(waiting(["A", "B", "C", "D", "E", "F", "G"]), "en");
  assert.equal(many.show.items.length, ASK_ANSWER_CAPS.items);
  assert.deepEqual(many.do.open, { to: "inbox", label: "See all 7 in the Inbox", now: false });
  assert.equal(answerText(needsAnswer(waiting([]), "en")), "Nobody is waiting on you right now.");
});

test("did anyone call: today's missed calls by the business's clock as doors, or none with the call on the line", () => {
  const NOW = Date.parse("2026-09-05T16:00:00Z");
  const calls = [
    { callId: "k1", who: "+1 917 555 0100", missed: true, live: false, startedAtMs: NOW - 3_600_000 },
    { callId: "k2", who: "Old", missed: true, live: false, startedAtMs: NOW - 3 * 86_400_000 },
    { callId: "k3", who: "Live", missed: false, live: true, startedAtMs: NOW },
  ];
  const { missed, live } = callsToday(calls, NOW, "America/New_York");
  assert.deepEqual([missed.map((c) => c.callId), live.map((c) => c.callId)], [["k1"], ["k3"]]);
  const a = callsAnswer(missed, live, "en");
  assert.equal(a.say.headline, "One missed call today.");
  assert.deepEqual(a.show.items.map((i) => i.source.to), ["conversations/cv-k1"]);
  const quiet = callsAnswer([], live, "en");
  assert.equal(quiet.say.headline, "No missed calls today; one call is on the line now.");
  assert.deepEqual(quiet.do.open, { to: "live", label: "See the calls", now: false });
});

test("what is open: the days as items, each a door to its day; no calendar says so and points at where to connect one", () => {
  const ok = openingsAnswer(
    {
      state: "ok",
      text: "Tomorrow has two open times. Saturday is full.",
      days: [{ key: "2026-09-24", label: "Tomorrow, Thursday", windows: ["9:30–10:30 AM", "4:30–6 PM"] }],
    },
    "en",
  );
  assert.equal(ok.say.headline, "Tomorrow has two open times.");
  assert.deepEqual(
    ok.show.items.map((i) => [i.title, i.line, i.source.to]),
    [["Tomorrow, Thursday", "9:30–10:30 AM · 4:30–6 PM", "calendar/2026-09-24"]],
  );
  const none = openingsAnswer({ state: "no_calendar", text: "", days: [] }, "en");
  assert.equal(none.say.headline, "No calendar is connected, so I can't see open times.");
  assert.equal(none.do.open.to, "admin/integrations");
  assert.equal(openingsAnswer({ state: "unavailable", text: "", days: [] }, "es").say.headline, "No se pudo leer el calendario ahora.");
});

test("a quick question is one of three, by its words; the long tail is the model's", () => {
  const NOW = Date.parse("2026-09-05T16:00:00Z");
  assert.deepEqual(askIntent("who needs me right now?", NOW, "America/New_York"), { kind: "needs" });
  assert.deepEqual(askIntent("¿quién me necesita?", NOW, "America/New_York"), { kind: "needs" });
  assert.deepEqual(askIntent("did anyone call while I was busy?", NOW, "America/New_York"), { kind: "calls" });
  assert.deepEqual(askIntent("what's open saturday for a balayage", NOW, "America/New_York"), {
    kind: "openings",
    day: "sat",
    service: "what's open saturday for a balayage",
  });
  assert.equal(askIntent("qué hay libre mañana", NOW, "America/New_York").day, "2026-09-06");
  assert.equal(askIntent("what did the receptionist tell Dani?", NOW, "America/New_York"), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-answer.test.mjs`
Expected: FAIL. The imports do not exist yet, so the test throws a SyntaxError on the named imports.

- [ ] **Step 3: Implement `ask.ts`'s part**

In `packages/contracts/src/ask.ts`:
- Add `import type { AskAnswer } from "./ask-answer";` under the existing imports.
- Change `const FOLLOWUP_ECHO` to `export const FOLLOWUP_ECHO`.
- In `AskMessageVM`, after `failed: boolean;`, add:

```ts
  /** The answer as the Line draws it: set by the server from plan 3; absent on every answer made before (answerFromV1). */
  answer?: AskAnswer | null;
```

- Replace the block from `export interface FastContext {` to the end of `fastPath` (the `FastContext` and `FastPath` types and `function fastPath`). Keep `FastCall`, `NEEDS_RE`, `CALLS_RE`, `OPEN_RE`, `DAY_WORDS`, `dayKey` and `dayFromQuestion` exactly as they are, and add after `dayFromQuestion`:

```ts
/** What a quick question asks for, answered without a model; ask-answer.ts words the answer. */
export type AskIntent = { kind: "needs" } | { kind: "calls" } | { kind: "openings"; day: string | null; service: string } | null;

/**
 * The three questions an owner asks most, answered without a model: who needs me, did anyone call, what is open.
 * This only says which one a question is; the bridge reads Today's queue, the calls or the openings route, and
 * ask-answer.ts says the answer. Everything else is the model's.
 */
export function askIntent(question: string, now: number, tz?: string | null): AskIntent {
  const q = question.trim();
  if (!q || q.length > 160) return null;
  if (NEEDS_RE.test(q)) return { kind: "needs" };
  if (CALLS_RE.test(q)) return { kind: "calls" };
  if (OPEN_RE.test(q)) return { kind: "openings", day: dayFromQuestion(q, now, tz), service: q };
  return null;
}

/** Today's missed calls by the business's clock, and the calls on the line now. */
export function callsToday(calls: FastCall[], now: number, tz?: string | null): { missed: FastCall[]; live: FastCall[] } {
  const today = dayKey(now, tz);
  return {
    missed: calls.filter((c) => c.missed && c.startedAtMs && dayKey(c.startedAtMs, tz) === today),
    live: calls.filter((c) => c.live),
  };
}
```

`FastContext` read `NotificationItem`. If nothing else in `ask.ts` uses it, remove `import type { NotificationItem } from "./notifications";` (lint says so).

- [ ] **Step 4: Implement `ask-answer.ts`** — create `packages/contracts/src/ask-answer.ts`:

```ts
/**
 * Ask's answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, the
 * finding; Show, what it rests on; Do, the next step. One shape for every surface that answers -- the palette, Today's
 * band and the answers that need no model -- and one rule for the doors it offers. Pure: the bridge feeds it and the
 * pages draw it. What the model writes, and its parser, arrive with the structured answer (plan 3).
 */
import {
  FOLLOWUP_ECHO,
  citationRoute,
  navigateLabel,
  sameQuestion,
  type AskCitation,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type FastCall,
} from "./ask";

/* ------------------------------------------------------------------ the shape */

/** A row or a page read this turn, with the route the app gives it and whether its door is drawn (oneDoor). */
export interface AskSource extends AskCitation {
  to: string;
  door: boolean;
}
export interface AskFigure {
  value: string;
  label: string;
  note: string;
  source: AskSource | null;
}
export interface AskItem {
  title: string;
  meta: string;
  line: string;
  source: AskSource;
}
export interface AskBreakdownPart {
  label: string;
  value: number;
  warn: boolean;
}
export interface AskBreakdown {
  /** What the whole is ("customer messages"); the Line says "16 customer messages". */
  label: string;
  total: number;
  parts: AskBreakdownPart[];
  source: AskSource | null;
}
export interface AskOpen {
  to: string;
  label: string;
  /** Opened 250ms after the answer lands (ask-real.jsx), when the person asked to open, show or see it. */
  now: boolean;
}
export interface AskAnswer {
  v: 2;
  /** Structured has a headline; prose is words only (every answer made before the Line, and a refused format). */
  form: "structured" | "prose";
  say: { headline: string; detail: string };
  show: { figures: AskFigure[]; items: AskItem[]; breakdown: AskBreakdown | null };
  do: { open: AskOpen | null; next: string[] };
  language: AskLanguage;
}

/** One cap per part: read by the builders here and, from plan 3, by the format's words and its parser. */
export const ASK_ANSWER_CAPS = {
  headline: 160,
  detail: 700,
  figures: 4,
  items: 5,
  parts: 4,
  next: 2,
  value: 24,
  label: 60,
  note: 60,
  title: 80,
  meta: 60,
  line: 160,
  question: 90,
} as const;

const clip = (s: string | null | undefined, n: number) =>
  (s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);

const structured = (headline: string, language: AskLanguage): AskAnswer => ({
  v: 2,
  form: "structured",
  say: { headline: clip(headline, ASK_ANSWER_CAPS.headline), detail: "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [] },
  language,
});

/** The answer's words, for copy, reading aloud and a folded turn: the headline, then the detail. */
export function answerText(a: AskAnswer): string {
  return [a.say.headline, a.say.detail].filter(Boolean).join(a.form === "prose" ? "\n" : " ");
}

/* ------------------------------------------------------------- one door */

/** Where a card's Open goes, or null for the kinds that have none (a reply, a rewrite, a whisper, an invite). */
export function cardOpenRoute(p: Pick<AskProposal, "kind" | "payload">): string | null {
  const pl = (p.payload ?? {}) as Record<string, unknown>;
  const id = (k: string) => (typeof pl[k] === "string" && pl[k] ? (pl[k] as string) : null);
  switch (p.kind) {
    case "reply":
    case "steer":
    case "whisper":
    case "invite":
      return null;
    case "settings":
      return "admin/workspace";
    case "policy":
      return "admin/autonomy";
    case "person_mode":
    case "deal":
      return id("contact_id") ? `clients/${id("contact_id")}` : null;
    case "broadcast":
      return "broadcasts";
    case "playbook":
      return "outbound";
    case "lead_search":
      return "clients/leads";
    default:
      return id("conversation_id") ? `inbox/th-${id("conversation_id")}` : null;
  }
}

function nextQuestions(next: string[], places: string[]): string[] {
  const out: string[] = [];
  for (const raw of next) {
    const q = clip(raw, ASK_ANSWER_CAPS.question);
    if (!q || out.some((x) => sameQuestion(x, q))) continue;
    if (FOLLOWUP_ECHO.some(([words, route]) => words.test(q) && places.some((p) => route.test(p)))) continue;
    out.push(q);
    if (out.length >= ASK_ANSWER_CAPS.next) break;
  }
  return out;
}

/**
 * A place appears once per answer (the Line, D4, section 5.5). An item keeps its door; Do's Open goes when an item has
 * its route; a card's Open is hidden when an item or Open has its route; a receipt keeps its words and draws its door
 * only when nothing else offers that route; a next question that points at an offered place goes. Returns the answer
 * as drawn and, per card, whether its Open is drawn.
 */
export function oneDoor(
  a: AskAnswer,
  cards: ReadonlyArray<Pick<AskProposal, "id" | "kind" | "payload">> = [],
): { answer: AskAnswer; cardOpen: Record<string, boolean> } {
  const items = a.show.items.map((it) => ({ ...it, source: { ...it.source, door: true } }));
  const offered = new Set(items.map((it) => it.source.to));
  const open = a.do.open && !offered.has(a.do.open.to) ? a.do.open : null;
  if (open) offered.add(open.to);
  const cardOpen: Record<string, boolean> = {};
  for (const c of cards) {
    const to = cardOpenRoute(c);
    cardOpen[c.id] = !!to && !offered.has(to);
    if (to && cardOpen[c.id]) offered.add(to);
  }
  const receipt = (s: AskSource | null): AskSource | null => {
    if (!s) return null;
    const door = !offered.has(s.to);
    if (door) offered.add(s.to);
    return { ...s, door };
  };
  const breakdown = a.show.breakdown ? { ...a.show.breakdown, source: receipt(a.show.breakdown.source) } : null;
  const figures = a.show.figures.map((f) => ({ ...f, source: receipt(f.source) }));
  return {
    answer: { ...a, show: { figures, items, breakdown }, do: { open, next: nextQuestions(a.do.next, [...offered]) } },
    cardOpen,
  };
}

/* ------------------------------------------------------------- old answers */

const KIND_WORDS = {
  en: { thread: "Thread", conversation: "Conversation", call: "Call", person: "Profile", page: "Page" },
  es: { thread: "Hilo", conversation: "Conversación", call: "Llamada", person: "Perfil", page: "Página" },
} as const;

/**
 * Every answer made before the Line (prose, sources, a navigate door, follow-ups) as the Line draws it: the prose form.
 * A row it cited is an item (a row the answer named); a page it cited was a door to that page, so it is Open when the
 * answer had none and goes otherwise; navigate is Open; the follow-ups are next. Kept for good: the purge drops only
 * threads untouched for 90 days (00040_ask.sql:86-103), so a thread in use keeps its old turns.
 */
export function answerFromV1(
  m: Pick<AskMessageVM, "text" | "citations" | "navigate" | "followups" | "language">,
): AskAnswer {
  const language = m.language ?? "en";
  const words = KIND_WORDS[language === "es" ? "es" : "en"];
  const cites = m.citations ?? [];
  const items: AskItem[] = cites
    .filter((c) => c.kind !== "page")
    .slice(0, ASK_ANSWER_CAPS.items)
    .map((c) => ({
      title: clip(c.label, ASK_ANSWER_CAPS.title),
      meta: words[c.kind],
      line: "",
      source: { kind: c.kind, id: c.id, label: c.label, to: c.to || citationRoute(c), door: true },
    }));
  const page = cites.find((c) => c.kind === "page");
  const nav = m.navigate && m.navigate.to ? m.navigate : null;
  const open: AskOpen | null = nav
    ? { to: nav.to, label: navigateLabel(nav, language) ?? nav.label, now: nav.now === true }
    : page
      ? { to: page.to || citationRoute(page), label: page.label, now: false }
      : null;
  return {
    v: 2,
    form: "prose",
    say: { headline: "", detail: (m.text ?? "").trim() },
    show: { figures: [], items, breakdown: null },
    do: { open, next: m.followups ?? [] },
    language,
  };
}

/* ------------------------------------------------------------- quick answers */

/** Who is waiting, as Today's queue draws them (TodayVM.queue.rows), and the runs waiting for a yes. */
export interface AskWaiting {
  people: Array<{ id: string; kind: "thread" | "call"; who: string; channel: string; when: string; line: string; to: string }>;
  runs: Array<{ id: string; label: string; line: string; to: string }>;
}

const names = (list: string[], es: boolean) => {
  if (list.length <= 2) return list.join(es ? " y " : " and ");
  const rest = list.length - 2;
  return es ? `${list[0]}, ${list[1]} y ${rest} más` : `${list[0]}, ${list[1]} and ${rest} ${rest === 1 ? "other" : "others"}`;
};

/** Right now, in a sentence: the people waiting, then the runs waiting for a yes -- two populations, two clauses. */
export function rightNowLine(w: AskWaiting, language: AskLanguage): string {
  const es = language === "es";
  const who = w.people.map((p) => p.who);
  const people = who.length
    ? es
      ? `${names(who, true)} ${who.length === 1 ? "te espera" : "te esperan"}`
      : `${names(who, false)} ${who.length === 1 ? "is" : "are"} waiting on you`
    : "";
  const n = w.runs.length;
  const runs = n
    ? es
      ? `${n === 1 ? "un envío de playbook espera" : `${n} envíos de playbook esperan`} tu aprobación`
      : `${n === 1 ? "one playbook run is" : `${n} playbook runs are`} waiting for your approval`
    : "";
  if (!people && !runs) return es ? "Nadie te espera ahora mismo." : "Nobody is waiting on you right now.";
  const s = [people, runs].filter(Boolean).join("; ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

/** Who needs me: the sentence; the people, then the runs, as their own doors; the Inbox only for the rest past the cap. */
export function needsAnswer(w: AskWaiting, language: AskLanguage): AskAnswer {
  const es = language === "es";
  const all: AskItem[] = [
    ...w.people.map((p) => ({
      title: p.who,
      meta: `${p.channel} · ${p.when}`,
      line: p.line,
      source: { kind: p.kind, id: p.id, label: p.who, to: p.to, door: true },
    })),
    ...w.runs.map((r) => ({
      title: r.label,
      meta: "Playbook",
      line: r.line,
      source: { kind: "page" as const, id: r.to, label: r.label, to: r.to, door: true },
    })),
  ];
  const a = structured(rightNowLine(w, language), language);
  a.show.items = all.slice(0, ASK_ANSWER_CAPS.items);
  if (all.length > a.show.items.length)
    a.do.open = { to: "inbox", label: es ? `Ver los ${all.length} en el Inbox` : `See all ${all.length} in the Inbox`, now: false };
  return a;
}

/** Did anyone call: today's missed calls as doors, or none, with the call on the line. */
export function callsAnswer(missed: FastCall[], live: FastCall[], language: AskLanguage): AskAnswer {
  const es = language === "es";
  if (!missed.length) {
    const on = live.length
      ? es
        ? `; ${live.length === 1 ? "hay una llamada en curso" : `hay ${live.length} en curso`}`
        : `; ${live.length === 1 ? "one call is" : `${live.length} calls are`} on the line now`
      : "";
    const a = structured(`${es ? "Ninguna llamada perdida hoy" : "No missed calls today"}${on}.`, language);
    a.do.open = { to: "live", label: es ? "Ver las llamadas" : "See the calls", now: false };
    return a;
  }
  const a = structured(
    es
      ? `${missed.length === 1 ? "Una llamada perdida" : `${missed.length} llamadas perdidas`} hoy.`
      : `${missed.length === 1 ? "One missed call" : `${missed.length} missed calls`} today.`,
    language,
  );
  a.show.items = missed.slice(0, ASK_ANSWER_CAPS.items).map((c) => ({
    title: c.who,
    meta: es ? "Perdida" : "Missed",
    line: "",
    source: { kind: "call", id: c.callId, label: c.who, to: `conversations/cv-${c.callId}`, door: true },
  }));
  return a;
}

/** The openings route's answer, as the palette reads it (legacy-bridge/ask/api.ts `openings`). */
export interface AskOpeningsView {
  state: "ok" | "no_calendar" | "unavailable";
  text: string;
  days: Array<{ key: string; label: string; windows: string[] }>;
}

/** What is open: the days as items, each a door to its day on the Calendar. */
export function openingsAnswer(o: AskOpeningsView, language: AskLanguage): AskAnswer {
  const es = language === "es";
  if (o.state === "no_calendar") {
    const a = structured(
      es ? "No hay calendario conectado, así que no veo horas libres." : "No calendar is connected, so I can't see open times.",
      language,
    );
    a.say.detail = es ? "El horario está en Ajustes." : "The hours are in Settings.";
    a.do.open = { to: "admin/integrations", label: es ? "Conectar un calendario" : "Connect a calendar", now: false };
    return a;
  }
  if (o.state === "unavailable")
    return structured(es ? "No se pudo leer el calendario ahora." : "The calendar couldn't be read right now.", language);
  const first = /^(.+?[.!?])(\s|$)/.exec(o.text.trim());
  const a = structured(first ? first[1] : o.text || (es ? "Horas libres" : "Open times"), language);
  a.show.items = o.days.slice(0, ASK_ANSWER_CAPS.items).map((d) => ({
    title: d.label,
    meta: "",
    line: d.windows.length ? d.windows.join(" · ") : es ? "Nada libre" : "Nothing open",
    source: { kind: "page", id: `calendar/${d.key}`, label: d.label, to: `calendar/${d.key}`, door: true },
  }));
  return a;
}
```

In `packages/contracts/src/index.ts`, after `export * from "./ask";`:

```ts
export * from "./ask-answer";
```

- [ ] **Step 5: Build contracts and run the test**

- Run `corepack pnpm --filter "./packages/*" build`, then restore any package whose dist has no real change (`git diff -w --shortstat packages/<p>/dist` is empty → `git checkout -- packages/<p>/dist`).
- Then run `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-answer.test.mjs`.

Expected: every case passes. If `quiet.say.headline` differs only in its punctuation, fix the words in `callsAnswer`, not the test.

- [ ] **Step 6: Move `ask.test.mjs`'s quick-answer case to the intent**

In `tooling/scripts/tests/ask.test.mjs`:
- Replace the import of `fastPath` with `askIntent`.
- Replace the case `"the three fast paths: …"` with:

```js
test("the three quick questions are told by their words; the answers are ask-answer.ts's (ask-answer.test.mjs)", () => {
  assert.deepEqual(askIntent("who needs me right now?", NOW, "America/New_York"), { kind: "needs" });
  assert.deepEqual(askIntent("did anyone call while I was busy?", NOW, "America/New_York"), { kind: "calls" });
  assert.deepEqual(askIntent("what's open saturday for a balayage", NOW, "America/New_York"), {
    kind: "openings",
    day: "sat",
    service: "what's open saturday for a balayage",
  });
  assert.equal(askIntent("qué hay libre mañana", NOW, "America/New_York").day, "2026-09-06");
  assert.equal(dayFromQuestion("any slots today", NOW, "America/New_York"), "2026-09-05");
  assert.equal(askIntent("what did the receptionist tell Dani?", NOW, "America/New_York"), null, "the long tail is the model's");
  assert.equal(askIntent("tell rosa we are running late", NOW, "America/New_York"), null);
});
```

Run: `node --conditions=react-server --import tsx --test --test-name-pattern="quick questions" tooling/scripts/tests/ask.test.mjs`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/contracts tooling/scripts/tests/ask-answer.test.mjs tooling/scripts/tests/ask.test.mjs
git commit -m "Contracts: Ask's answer as the Line draws it, one door per place, and the quick answers from Today's queue"
```

### Task 2: The Line's keys in the shortcuts sheet

**Files:** `packages/contracts/src/chrome.ts`; test `tooling/scripts/tests/chrome.test.mjs`.

- [ ] **Step 1: Change the test.** In the shortcuts case, the group order becomes `["Everywhere", "Ask", "People", "Inbox"]`. Add:

```js
  assert.deepEqual(
    groups.find((g) => g.group === "Ask").items.map((s) => [s.keys.join(" "), s.does]),
    [
      ["↑ ↓", "Walk what is under the line"],
      ["↵", "Ask, or open the row"],
      ["⌘J", "Earlier conversations"],
      ["Space", "Hold on an empty line to talk"],
      ["Esc", "Stop an answer, then close"],
    ],
    "the Line draws no key (D17): the sheet is where its keys are listed",
  );
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/chrome.test.mjs`
Expected: FAIL on the group order.

- [ ] **Step 3: Implement.** In `SHORTCUTS`, insert after the `Esc` "Close what is open" row:

```ts
  { group: "Ask", keys: ["↑", "↓"], does: "Walk what is under the line" },
  { group: "Ask", keys: ["↵"], does: "Ask, or open the row" },
  { group: "Ask", keys: ["⌘J"], does: "Earlier conversations" },
  { group: "Ask", keys: ["Space"], does: "Hold on an empty line to talk" },
  { group: "Ask", keys: ["Esc"], does: "Stop an answer, then close" },
```

- [ ] **Step 4: Rebuild contracts, then run chrome and people-honest to verify they pass**

The people-honest test also reads `SHORTCUTS`.

- [ ] **Step 5: Commit** — `git commit -m "The shortcuts sheet lists the Line's keys; the Line draws none"`.

### Task 3: The bridge hands the pages the answer, the quick answers and Right now

**Files:**
- Modify: `apps/dashboard/src/legacy-bridge/ask/palette.ts` and `apps/dashboard/src/legacy-bridge/ask.ts`.
- Test: the bridge case in `tooling/scripts/tests/ask.test.mjs`, `"the bridge: the jump index and Right now come from the surfaces, …"`.

- [ ] **Step 1: Change the test first.** In that case:
  - Replace the `rightNow()` expectations: the bell's rows go; the sentence reads `TODAY_DATA.queue.rows` and `__BROADCASTS.rows`.
  - Replace the `fast` expectations with `intent`. Set up the window with:

```js
  win.TODAY_DATA = {
    queue: {
      rows: [
        { id: "q1", conversationId: "c1", callId: null, who: "Nora", channel: "WhatsApp", when: "waited 2h", sentence: "Can I come at 3?", quoted: true, cta: { to: "inbox/th-c1" } },
      ],
    },
  };
  win.__BROADCASTS = {
    rows: [
      { id: "r1", state: "pending_approval", recipient_count: 1, when: "now", counts: { sent: 0, replied: 0 }, audience: { label: "Win-back · quiet 30 days" } },
      { id: "r2", state: "sent", recipient_count: 4, when: "Sep 20", counts: { sent: 4, replied: 1 }, audience: { label: "Welcome" } },
    ],
  };
  const p = askPalette(win, null);
  assert.equal(p.rightNow("en"), "Nora is waiting on you; one playbook run is waiting for your approval.");
  assert.deepEqual(p.waiting().people[0], { id: "c1", kind: "thread", who: "Nora", channel: "WhatsApp", when: "waited 2h", line: "“Can I come at 3?”", to: "inbox/th-c1" });
  assert.deepEqual(p.waiting().runs.map((r) => [r.id, r.to]), [["r1", "broadcasts/run:r1"]]);
  assert.deepEqual(p.intent("who needs me?"), { kind: "needs" });
  const { answer } = p.answer({ text: "Hi", citations: [], navigate: null, followups: [], proposals: [], language: "en" });
  assert.equal(answer.form, "prose");
```

- [ ] **Step 2: Run it to verify it fails.** `rightNow` still returns the bell's rows.

- [ ] **Step 3: Implement `palette.ts`.**
  - Imports: add `answerFromV1`, `askIntent`, `callsToday`, `oneDoor`, `rightNowLine`, `todayRunWords`, and `type AskAnswer`, `type AskWaiting`. Remove `citationsToShow`, `fastPath`, `followupsToShow`, `navigateLabel`, `type FastPath`. Keep `feedFromGlobals` for `heldDrafts`.
  - Widen `PaletteGlobals` with:

```ts
  TODAY_DATA?: {
    queue?: {
      rows?: Array<{
        id: string;
        conversationId: string | null;
        callId: string | null;
        who: string;
        channel: string;
        when: string;
        sentence: string;
        quoted: boolean;
        cta: { to: string };
      }>;
    };
  } | null;
  __BROADCASTS?: {
    rows?: Array<{
      id: string;
      state: string;
      recipient_count: number;
      when: string;
      counts: { sent: number; replied: number };
      audience?: { label?: string };
    }>;
  } | null;
```

  - Delete `shapeAnswer`.
  - In `askPalette`, replace `rightNow` and `fast` with:

```ts
  // Who is waiting: Today's queue itself (the Line, D7), and the playbook runs waiting for a yes. Every surface starts
  // at boot (LegacyApp.tsx SURFACES), so both are here on every page once they are read.
  const waiting = (): AskWaiting => ({
    people: (w.TODAY_DATA?.queue?.rows ?? []).map((r) => ({
      id: r.conversationId ?? r.callId ?? r.id,
      kind: r.conversationId ? ("thread" as const) : ("call" as const),
      who: r.who,
      channel: r.channel,
      when: r.when,
      line: r.quoted ? `“${r.sentence}”` : r.sentence,
      to: r.cta.to,
    })),
    runs: (w.__BROADCASTS?.rows ?? [])
      .filter((r) => r.state === "pending_approval")
      .map((r) => ({
        id: r.id,
        label: r.audience?.label || "Playbook",
        line: todayRunWords(r).waiting.sentence,
        to: `broadcasts/run:${r.id}`,
      })),
  });
```

  - The returned object gains:

```ts
    waiting,
    rightNow: (lang?: AskLanguage) => rightNowLine(waiting(), lang ?? lastLanguage()),
    intent: (question: string) => askIntent(question, Date.now(), activeWorkspace()?.timezone ?? null),
    callsToday: () => callsToday(calls(), Date.now(), activeWorkspace()?.timezone ?? null),
    /** What an answer shows, decided once: the Line's answer (plan 3) or today's read back, with one door per place. */
    answer: (m: AskMessageVM): { answer: AskAnswer; cardOpen: Record<string, boolean> } =>
      oneDoor(m.answer ?? answerFromV1(m), m.proposals ?? []),
```

  - In `suggestions`:
    - `const feed = feedFromGlobals(w as Parameters<typeof feedFromGlobals>[0], Date.now());`
    - `needsYou: waiting().people.length,`
    - `heldDrafts` stays from `feed`.
  - Remove `shape: shapeAnswer`.

- [ ] **Step 4: Implement `ask.ts` (bridge).**
  - Import `answerText`, `callsAnswer`, `cardOpenRoute`, `needsAnswer`, `openingsAnswer` and `type AskAnswer` from contracts.
  - Remove `shapeAnswer` from the re-export line.
  - Extend `AskApi` with:

```ts
    /** A quick question's answer, without a model: Today's queue, today's calls or the openings route; null for the rest. */
    quick(question: string): Promise<AskAnswer> | null;
    answerText: typeof answerText;
    cardOpenRoute: typeof cardOpenRoute;
```

  - In `installAsk`, add to `ask`:

```ts
    quick: (question) => {
      const intent = palette.intent(question);
      if (!intent) return null;
      const lang = palette.language(question);
      if (intent.kind === "needs") return Promise.resolve(needsAnswer(palette.waiting(), lang));
      if (intent.kind === "calls") {
        const c = palette.callsToday();
        return Promise.resolve(callsAnswer(c.missed, c.live, lang));
      }
      return api
        .openings(intent.day, intent.service)
        .then((o) => openingsAnswer(o, lang))
        .catch(() => openingsAnswer({ state: "unavailable", text: "", days: [] }, lang));
    },
    answerText,
    cardOpenRoute,
```

  - After `PROPOSAL_GATE` is published, add `(win as unknown as { __askCardOpen?: typeof cardOpenRoute }).__askCardOpen = cardOpenRoute;`.

- [ ] **Step 5: Run the bridge case and typecheck.** Run `node --conditions=react-server --import tsx --test --test-name-pattern="the bridge" tooling/scripts/tests/ask.test.mjs` and `corepack pnpm --filter @chanlytics/dashboard typecheck`. Expected: PASS, with no type errors.

- [ ] **Step 6: Commit** — `git commit -m "The bridge hands the Line the answer, the quick answers and Right now from Today's queue"`.

### Task 4: The band's turn carries a quick answer

**Files:** `apps/dashboard/src/legacy-bridge/mascot/turn.ts`; test `tooling/scripts/tests/mascot-turn.test.mjs`.

- [ ] **Step 1: Change the test.** Where it dispatches `{ t: "fast", text, links }`:
  - send `{ t: "fast", text: "Two people need you.", answer: A1, seq: s.seq }`;
  - define `const A1 = { v: 2, form: "structured", say: { headline: "Two people need you.", detail: "" }, show: { figures: [], items: [], breakdown: null }, do: { open: null, next: [] }, language: "en" };`;
  - assert `s.answer === A1` in place of `s.links`.
  - The `"Nobody is waiting."` fast event gains `answer: A1`.
  - After a new `asked`, assert `s.answer === null`.
- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Implement.**
  - `import type { AskAnswer, AskLanguage, AskMessageVM } from "@chanlytics/contracts";`.
  - In `Turn`, replace `links: TurnLink[]` with `/** a quick answer, drawn as the Line draws it */ answer: AskAnswer | null;`.
  - Delete `TurnLink`.
  - The fast event becomes `{ t: "fast"; text: string; answer: AskAnswer; seq: number }`.
  - `initialTurn` has `answer: null`.
  - Every reducer case that set `links: []` sets `answer: null`.
  - The fast case returns `{ ...turn, phase: "settled", trace: null, text: ev.text, message: null, answer: ev.answer }`.
- [ ] **Step 4: Run mascot-turn to verify it passes, then commit.**

### Task 5: The words and the hold on Space

**Files:** `apps/dashboard/src/legacy/pages/ask-text.jsx`, `apps/dashboard/src/legacy/pages/ask-hooks.jsx`.

- [ ] **Step 1: `ask-text.jsx`.** In both tables:
  - **Remove** `askRow`, `askSub`, `instant`, `footNote`, `next`, `newChat`, `threads`, `now`, `act`, `recent`, `kindThread`, `kindCall`, `kindPerson`, `openings`, `noCalendar` and `unavailable`. The calendar's sentences are contracts' now.
  - **Keep** every other key.
  - **Change** `empty` to `nothing`, and change `deleted`.
  - **Add** the keys below.

English:

```js
    nothing: "Nothing matches. Ask it as a question.",
    deleted: "Conversation deleted",
    needsQ: "Who needs me right now?",
    askAbout: (surface) =>
      `Ask about ${({ today: "Today", inbox: "the Inbox", people: "People", conversations: "Conversations", live: "Live", reports: "Reports", settings: "Settings" })[surface] || "this page"}`,
    earlier: "Earlier",
    allEarlier: "All earlier conversations",
    earlierFolded: (n) => `${n} earlier in this conversation`,
    kind: { person: "Person", thread: "Thread", call: "Call", page: "Page" },
    rowsLabel: "Ask Chanlytics",
    stopAnswer: "Stop",
    stopped: "Stopped. Ask again when you're ready.",
    clearScope: "Clear the scope",
    tagCard: "Card",
```

Spanish:

```js
    nothing: "Nada coincide. Pregúntalo.",
    deleted: "Conversación borrada",
    needsQ: "¿Quién me necesita ahora?",
    askAbout: (surface) =>
      `Pregunta sobre ${({ today: "Hoy", inbox: "el Inbox", people: "Personas", conversations: "Conversaciones", live: "En vivo", reports: "Informes", settings: "Ajustes" })[surface] || "esta página"}`,
    earlier: "Anteriores",
    allEarlier: "Todas las conversaciones anteriores",
    earlierFolded: (n) => `${n} anteriores en esta conversación`,
    kind: { person: "Persona", thread: "Hilo", call: "Llamada", page: "Página" },
    rowsLabel: "Ask Chanlytics",
    stopAnswer: "Detener",
    stopped: "Detenido. Pregunta de nuevo cuando quieras.",
    clearScope: "Quitar el alcance",
    tagCard: "Tarjeta",
```

- [ ] **Step 2: `ask-hooks.jsx`.** Delete `useAskWide`: the rail is gone. Add before `window.AskHooks = …`:

```js
// Held Space on an empty line talks (the Line, 6.6): a hold of 300ms starts listening and letting go asks; a tap does
// nothing, because an empty line takes no leading space; once there are words, Space is a space. Two cells.
const AH_HOLD_MS = 300;
const useHoldSpace = ({ empty, talk }) => {
  const timer = useAhRef(null);
  const held = useAhRef(false);
  const onKeyDown = (e) => {
    if (e.key !== " ") return false;
    if (held.current || timer.current) {
      e.preventDefault();
      return true;
    }
    if (!empty()) return false;
    e.preventDefault();
    timer.current = setTimeout(() => {
      timer.current = null;
      held.current = true;
      talk.start();
    }, AH_HOLD_MS);
    return true;
  };
  const onKeyUp = (e) => {
    if (e.key !== " ") return false;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      return true;
    }
    if (held.current) {
      held.current = false;
      talk.stop();
      return true;
    }
    return false;
  };
  return { onKeyDown, onKeyUp };
};
```

Publish it: `window.AskHooks = { useAskTalk, useAskFocus, useAskSpeech, useHoldSpace };`. Check the code for other readers of `AskHooks.useAskWide`; there are none besides `ask-real.jsx`.

- [ ] **Step 3: Commit** (with Task 6: the pages load together).

### Task 6: The answer, the rows and the Line

**Files:** rewrite `apps/dashboard/src/legacy/pages/ask-turn.jsx`, `ask-home.jsx` and `ask-real.jsx`.

- [ ] **Step 1: `ask-turn.jsx`** (replace the whole file):

```jsx
/* global React, Icon */
// One answer as the Line draws it (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 5): Say, Show and
// Do, each beside one of the three's own squares, lightest to darkest; a figure's receipt; the rows it names as their
// own doors; the next step once; and the cards, which approve, edit, wait or undo through the verbs' own routes. What
// an answer shows is decided by the contract (window.__ask.answer: the answer and oneDoor's doors); this file only
// draws. Published as window.AskAnswerKit, and AskTurn, AskAnswer and AskCard on window.

const useAtState = React.useState;

/** An answer no client can shape (the mockup, a test): its words, as prose. */
const atProse = (m, lang) => ({
  v: 2,
  form: "prose",
  say: { headline: "", detail: (m && m.text) || "" },
  show: { figures: [], items: [], breakdown: null },
  do: { open: null, next: [] },
  language: lang || "en",
});

/** The rows the keys walk, in the order they are drawn: the items, then Open, then the next questions. */
const answerMoves = (a) => [
  ...a.show.items.map((it) => ({ type: "item", to: it.source.to })),
  ...(a.do.open ? [{ type: "open", to: a.do.open.to }] : []),
  ...a.do.next.map((q) => ({ type: "next", q })),
];

// A proposal as a card: the exact change, Approve (or Send, or Edit in the composer), Not now, the undo its verb has,
// and Open where oneDoor leaves it one (`hideOpen`). The commit runs through the verb's own route, which checks the
// role and the state again; what happened is kept on the turn, so a thread reads back with "Sent", not a fresh Approve.
const AskCard = ({ p, messageId, t, onNav, hideOpen }) => {
  // Keep the body of the current AskCard (ask-turn.jsx:79-176 at c93061cb) as it is, with two changes:
  // 1. `openRoute` is the contract's: const openRoute = window.__askCardOpen ? window.__askCardOpen(p) : null;
  // 2. The Open button is drawn when `state === "idle" && openRoute && !hideOpen`, in place of the kind list.
  // Its classes stay (`ask-card`, `ask-card-head`, `ask-card-actions`, `ask-card-receipt`), and its test ids stay
  // (`ask-card`, `ask-card-approve`, `ask-card-undo`).
};

const AskFigure = ({ f, open, onToggle, t, onNav }) => (
  <div className="ask-figure">
    {f.source ? (
      <button type="button" className="ask-figure-value" aria-expanded={open} onClick={onToggle} data-testid="ask-figure">
        {f.value}
      </button>
    ) : (
      <span className="ask-figure-value plain">{f.value}</span>
    )}
    <span className="ask-figure-label">{f.label}</span>
    {f.note ? <span className="ask-figure-note">{f.note}</span> : null}
    {open && f.source ? (
      <div className="ask-receipt" role="dialog" aria-label={f.label} data-testid="ask-receipt">
        <span className="ask-receipt-from">
          {t.from} {f.source.label}
        </span>
        {f.source.door ? (
          <button type="button" className="ask-receipt-door" onClick={() => onNav(f.source.to)}>
            {t.open}
          </button>
        ) : null}
      </div>
    ) : null}
  </div>
);

// One whole in its parts, on the chart kit's bar (chart-core.jsx SegmentBar): the parts in order in the kit's blues,
// the one marked for attention in the warn status with its icon, as Reports draws who answered.
const AT_PART_COLORS = ["var(--chart-1)", "var(--chart-1-soft)", "var(--chart-ramp-2)", "var(--chart-ramp-1)"];
const AskBreakdown = ({ b, t, onNav }) => {
  const SegmentBar = window.SegmentBar;
  const config = {};
  let n = 0;
  const rows = b.parts.map((p, k) => {
    const key = `p${k}`;
    config[key] = p.warn
      ? { label: p.label, color: "var(--warn)", icon: "alert" }
      : { label: p.label, color: AT_PART_COLORS[n++] || "var(--chart-1)" };
    return { key, value: p.value };
  });
  const title = `${b.total} ${b.label}`;
  return (
    <div className="ask-breakdown" data-testid="ask-breakdown">
      {SegmentBar ? <SegmentBar title={title} rows={rows} config={config} small /> : <span className="ask-breakdown-title">{title}</span>}
      {b.source ? (
        <span className="ask-breakdown-from">
          {t.from} {b.source.label}
          {b.source.door ? (
            <button type="button" className="ask-receipt-door" onClick={() => onNav(b.source.to)}>
              {t.open}
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
};

const AskAnswer = ({ answer, cardOpen, cards, messageId, retry, sel, t, onNav, onFollow, compact }) => {
  const [receipt, setReceipt] = useAtState(-1);
  const a = answer;
  const hasShow = a.show.figures.length > 0 || a.show.items.length > 0 || !!a.show.breakdown;
  const hasDo = !!a.do.open || a.do.next.length > 0 || (cards && cards.length > 0) || !!retry;
  let i = -1;
  const move = () => {
    i += 1;
    return i;
  };
  return (
    <div className={`ask-answer${compact ? " compact" : ""}`} data-testid="ask-answer">
      <div className="ask-part say" data-testid="ask-say">
        <span className="ask-mark m1" aria-hidden="true" />
        <div className="ask-say">
          {a.say.headline ? <p className="ask-headline">{a.say.headline}</p> : null}
          {a.say.detail ? <p className={a.say.headline ? "ask-detail" : "ask-prose"}>{a.say.detail}</p> : null}
        </div>
      </div>
      {hasShow ? (
        <div className="ask-part show" data-testid="ask-show">
          <span className="ask-mark m2" aria-hidden="true" />
          <div className="ask-show">
            {a.show.breakdown ? <AskBreakdown b={a.show.breakdown} t={t} onNav={onNav} /> : null}
            {a.show.figures.length ? (
              <div className="ask-figures">
                {a.show.figures.map((f, k) => (
                  <AskFigure key={k} f={f} open={receipt === k} onToggle={() => setReceipt(receipt === k ? -1 : k)} t={t} onNav={onNav} />
                ))}
              </div>
            ) : null}
            {a.show.items.length ? (
              <div className="ask-items">
                {a.show.items.map((it) => {
                  const me = move();
                  return (
                    <button key={me} type="button" id={`ask-move-${me}`} className={`ask-item${sel === me ? " sel" : ""}`} onClick={() => onNav(it.source.to)} data-testid="ask-item">
                      <span className="ask-item-top">
                        <span className="ask-item-title">{it.title}</span>
                        {it.meta ? <span className="ask-item-meta">{it.meta}</span> : null}
                      </span>
                      {it.line ? <span className="ask-item-line">{it.line}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {hasDo ? (
        <div className="ask-part do" data-testid="ask-do">
          <span className="ask-mark m3" aria-hidden="true" />
          <div className="ask-do">
            {(cards || []).map((p) => (
              <AskCard key={p.id} p={p} messageId={messageId} t={t} onNav={onNav} hideOpen={!!cardOpen && cardOpen[p.id] === false} />
            ))}
            {retry ? (
              <button type="button" className="ask-move" onClick={retry} data-testid="ask-retry">
                {t.tryAgain}
              </button>
            ) : null}
            {a.do.open
              ? (() => {
                  const me = move();
                  return (
                    <button type="button" id={`ask-move-${me}`} className={`ask-move open${sel === me ? " sel" : ""}`} onClick={() => onNav(a.do.open.to)} data-testid="ask-open">
                      {a.do.open.label}
                    </button>
                  );
                })()
              : null}
            {a.do.next.map((q) => {
              const me = move();
              return (
                <button key={q} type="button" id={`ask-move-${me}`} className={`ask-move next${sel === me ? " sel" : ""}`} onClick={() => onFollow(q)} data-testid="ask-next">
                  {q}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

// A turn: the question above it, then the answer. While it streams, its words with a cursor; a failed turn says why
// and, on the latest only, offers Try again (N20). A quick answer (no model) is drawn the same way.
const AskTurn = ({ m, q, quick, latest, streaming, sel, t, lang, onFollow, onNav, onRetry, compact }) => {
  const A = window.__ask;
  if (streaming) {
    return (
      <div className="ask-turn streaming" data-testid="ask-turn">
        {q ? <p className="ask-turn-q">{q}</p> : null}
        <div className="ask-part say">
          <span className="ask-mark m1" aria-hidden="true" />
          <p className="ask-prose" aria-live="polite">
            {m.text}
            <span className="ask-cursor" />
          </p>
        </div>
      </div>
    );
  }
  if (quick && quick.pending) {
    return (
      <div className="ask-turn" data-testid="ask-turn">
        {q ? <p className="ask-turn-q">{q}</p> : null}
        <p className="ask-trace-row">{t.thinking}</p>
      </div>
    );
  }
  const drawn = quick
    ? { answer: quick.answer, cardOpen: {} }
    : A && A.answer
      ? A.answer(m)
      : { answer: atProse(m, lang), cardOpen: {} };
  const failed = !!(m && m.failed);
  return (
    <div className={`ask-turn${failed ? " failed" : ""}${latest ? " latest" : ""}`} data-testid="ask-turn">
      {q ? <p className="ask-turn-q">{q}</p> : null}
      <AskAnswer
        answer={drawn.answer}
        cardOpen={drawn.cardOpen}
        cards={m && !failed ? m.proposals || [] : []}
        messageId={m ? m.id : null}
        retry={failed && latest && onRetry ? onRetry : null}
        sel={sel}
        t={t}
        onNav={onNav}
        onFollow={onFollow}
        compact={compact}
      />
      {m && m.ungrounded ? (
        <div className="ask-unverified">
          <Icon name="alert" size={11} /> {t.unverified}
        </div>
      ) : null}
    </div>
  );
};

window.AskAnswerKit = { AskTurn, AskAnswer, AskCard, answerMoves };
Object.assign(window, { AskTurn, AskAnswer, AskCard });
```

When writing the file, AskCard's body is the current one (ask-turn.jsx:79-176), moved whole, with the two changes named in its comment. Its `KIND` and `ICON` maps and its `LeadPlanCard` branch stay as they are. The comment block inside `AskCard` above is an instruction for this plan only. The file carries the real body.

- [ ] **Step 2: `ask-home.jsx`** (replace the whole file):

```jsx
/* global React, Icon */
// The rows under the Line (ask-real.jsx): at rest, Right now, three questions about the page and three earlier
// conversations; while typing, the words as a question, the jumps and the questions that match; Earlier (⌘J), every
// conversation. Pure of state: buildLineRows turns what the bridge holds into rows, AskRows draws them. No key symbol
// is drawn (the Line, D17). Published as window.AskHome.

const ahAgo = (ms) => {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return Math.round(s / 60) + "m ago";
  if (s < 86400) return Math.round(s / 3600) + "h ago";
  return Math.round(s / 86400) + "d ago";
};

const buildLineRows = ({ A, t, lang, query, surface, scope, threads, view }) => {
  const q = query.trim();
  const thread = (th) => ({ type: "thread", label: th.title, sub: ahAgo(th.lastAtMs), th });
  if (view === "earlier") return [{ key: "earlier", label: t.earlier, items: threads.map(thread) }];
  if (q) {
    const sections = [{ key: "ask", items: [{ type: "ask", label: q, q }] }];
    const jumps = A.jump(q);
    if (jumps.length)
      sections.push({
        key: "jump",
        label: t.jump,
        items: jumps.map((j) => ({ type: "jump", label: j.label, sub: j.sub, meta: t.kind[j.kind] || "", to: j.to })),
      });
    const hits = A.suggestions(surface, scope, lang).filter((s) => (s.label || s.q).toLowerCase().includes(q.toLowerCase()));
    if (hits.length)
      sections.push({
        key: "match",
        items: hits.map((s) => ({
          type: s.kind === "act" ? "act" : "sug",
          label: s.label || s.q,
          q: s.q,
          compose: s.compose,
          meta: s.kind === "act" ? t.tagCard : undefined,
        })),
      });
    return sections;
  }
  const sections = [{ key: "now", items: [{ type: "now", label: A.rightNow(lang), q: t.needsQ }] }];
  const asks = A.suggestions(surface, scope, lang)
    .filter((s) => s.kind !== "act" && s.q !== t.needsQ)
    .slice(0, 3);
  if (asks.length) sections.push({ key: "about", label: t.askAbout(surface), items: asks.map((s) => ({ type: "sug", label: s.q, q: s.q })) });
  if (threads.length) {
    const items = threads.slice(0, 3).map(thread);
    if (threads.length > 3) items.push({ type: "all", label: t.allEarlier });
    sections.push({ key: "earlier", label: t.earlier, items });
  }
  return sections;
};

const AskRows = ({ sections, sel, setSel, onActivate, onDelete, t }) => {
  const flat = [];
  sections.forEach((sec) =>
    sec.items.forEach((it) => {
      it._i = flat.length;
      flat.push(it);
    }),
  );
  if (!flat.length) return <div className="ask-rows-empty">{t.nothing}</div>;
  return (
    <div className="ask-rows" role="listbox" id="ask-rows" aria-label={t.rowsLabel}>
      {sections.map((sec) => (
        <React.Fragment key={sec.key}>
          {sec.label ? <div className="ask-rows-label">{sec.label}</div> : null}
          {sec.items.map((it) => (
            <button
              key={it._i}
              id={`ask-row-${it._i}`}
              type="button"
              role="option"
              aria-selected={it._i === sel}
              className={`ask-row ${it.type}${it._i === sel ? " sel" : ""}`}
              onMouseMove={() => setSel(it._i)}
              onClick={() => onActivate(it)}
              data-testid={`ask-row-${it.type}`}
            >
              <span className="ask-row-main">
                <span className="ask-row-label">{it.label}</span>
                {it.sub ? <span className="ask-row-sub">{it.sub}</span> : null}
              </span>
              {it.meta ? <span className="ask-row-meta">{it.meta}</span> : null}
              {it.type === "thread" ? (
                <span
                  className="ask-row-del"
                  role="button"
                  tabIndex={-1}
                  aria-label={t.deleteThread}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(it.th);
                  }}
                >
                  <Icon name="x" size={10} />
                </span>
              ) : null}
            </button>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};

const flatRows = (sections) => sections.flatMap((sec) => sec.items);

window.AskHome = { buildLineRows, AskRows, flatRows, ahAgo };
```

- [ ] **Step 3: `ask-real.jsx`** (replace the whole file):

```jsx
/* global React, Icon, Confirm */
// AskReal: Ask as the Line (docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6). One line over the
// page with the three inside it; under it the rows (home, typing, Earlier), the trace while Ask reads, or the answer,
// Say · Show · Do (ask-turn.jsx); a conversation folds above it. This file is the shell: the state of one open Line,
// its keys and the turn runner. The rows are ask-home.jsx's, the words ask-text.jsx's and the hooks ask-hooks.jsx's;
// everything that talks to the workspace goes through window.__ask. No key symbol is drawn (D17): the Keyboard
// shortcuts sheet in the user menu lists the keys.

const useArState = React.useState;
const useArEffect = React.useEffect;
const useArRef = React.useRef;

/** Folded questions shown above the line before "N earlier in this conversation". */
const AR_FOLDED = 3;

// arRoute, arScopeLabel and arScopeIcon: as they are at ask-real.jsx:16-35 (c93061cb), unchanged.

const arFailed = (id, text) => ({
  id,
  role: "assistant",
  text,
  failed: true,
  citations: [],
  followups: [],
  proposals: [],
  atMs: Date.now(),
});

/** A conversation as its questions and the turns that answered them, in order. */
const arTurns = (messages) => {
  const out = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ q: m, a: null });
    else if (out.length && !out[out.length - 1].a) out[out.length - 1].a = m;
    else out.push({ q: null, a: m });
  }
  return out;
};

const arPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

const AskReal = ({ open, onClose }) => {
  const A = window.__ask;
  const H = window.AskHooks;
  const { buildLineRows, AskRows, flatRows } = window.AskHome;
  const { AskTurn, answerMoves } = window.AskAnswerKit;
  // Ask's face: the one mood every face follows (legacy-bridge/mascot mood.ts), standing in the line.
  const M = window.__mascot || null;
  const AskFace = window.AskFace || null;

  const [query, setQuery] = useArState("");
  const [threads, setThreads] = useArState([]);
  const [active, setActive] = useArState(null); // { id, title, messages, scope }
  const [live, setLive] = useArState(null); // the turn in flight: { q, text, traces }
  const [quick, setQuick] = useArState(null); // a quick answer, no model: { q, answer } or { q, pending: true }
  const [scope, setScope] = useArState(null);
  const [sel, setSel] = useArState(0);
  const [lang, setLang] = useArState(() => (A ? A.language() : "en"));
  const [tick, setTick] = useArState(0);
  const [view, setView] = useArState("rows"); // "rows" or "earlier"
  const [unfolded, setUnfolded] = useArState(-1);
  const [foldAll, setFoldAll] = useArState(false);
  // The conversation a × or the Delete key asked to delete, waiting for a yes (N5).
  const [doomed, setDoomed] = useArState(null);
  const speech = H.useAskSpeech(A);
  const [toastNode, flash] = window.usePPToast();
  const inputRef = useArRef(null);
  const faceRef = useArRef(null);
  const bodyRef = useArRef(null);
  // The thread list as it is being fetched on open: a question typed before it lands still finds its twin.
  const threadsReady = useArRef(null);
  // The turn in flight, and the one the person stopped waiting for: a stopped turn's later events change nothing.
  const turnSeq = useArRef(0);
  const stopped = useArRef(0);
  const asked = useArRef(null);
  const t = window.askText(lang);
  const route = arRoute();
  const surface = A ? A.surfaceFor(route.page) : "other";

  const talk = H.useAskTalk({
    lang,
    disabled: !!live,
    onWords: (words) => {
      setQuery(words);
      if (M) M.mood.hear(0.8);
    },
    onHeard: (heard, error) => {
      if (heard) {
        submit(heard);
        return;
      }
      if (error === "blocked") flash({ msg: <>{t.micBlocked}</> });
      else if (error === "not-allowed") flash({ msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ msg: <>{t.micFailed}</> });
    },
  });
  // Held Space on an empty line talks (6.6).
  const hold = H.useHoldSpace({ empty: () => !query && !live, talk });

  // Ask's mood, said once for every face: listening while held, reading until the first words, answering while they
  // stream or are read aloud, at rest otherwise. Said while the Line is closed too, so a turn left running still shows.
  const moodState = talk.listening
    ? "listening"
    : live
      ? live.text
        ? "speaking"
        : "thinking"
      : quick && quick.pending
        ? "thinking"
        : speech.speakingId
          ? "speaking"
          : "idle";
  useArEffect(() => {
    if (M) M.mood.set(moodState);
  }, [moodState]);

  // Open: the route's scope, the threads, the surfaces followed.
  useArEffect(() => {
    if (!open || !A) return;
    const r = arRoute();
    setScope(A.scopeFor(r.page, r.param, arScopeLabel(r.page, r.param)));
    threadsReady.current = A.threads().then((list) => {
      setThreads(list);
      return list;
    });
    const bump = () => setTick((n) => n + 1);
    const evs = ["surface:inbox", "surface:live", "surface:clients", "surface:settings", "surface:today", "surface:broadcasts"];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, [open]);

  // Open: the three move from the top bar's button into the line (a FLIP), and the button's face hides while they stand
  // here (ask.css, body.ask-open). With reduced motion they are simply here.
  useArEffect(() => {
    if (!open) return;
    const body = typeof document !== "undefined" ? document.body : null;
    if (body && body.classList) body.classList.add("ask-open");
    const from = typeof document !== "undefined" && document.querySelector ? document.querySelector('[data-testid="tb-ask-face"]') : null;
    const to = faceRef.current;
    const still = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    if (from && to && to.animate && !still) {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      if (b.width)
        to.animate(
          [{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})` }, { transform: "none" }],
          { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
    }
    return () => {
      if (body && body.classList) body.classList.remove("ask-open");
    };
  }, [open]);

  // Closed: nothing typed survives and nothing keeps reading; an open conversation comes back until Clear (D14).
  useArEffect(() => {
    if (!open) {
      setQuery("");
      setQuick(null);
      setDoomed(null);
      setView("rows");
      speech.stop();
    }
  }, [open]);

  H.useAskFocus(inputRef, open && !doomed, [open, live, active, doomed, view, quick]);

  // What the shell sends as the Line opens: a question to ask or to finish, or a thread to open (Today's band). The
  // Line listens while closed too and keeps the last request until it is open (the wiring audit's N3).
  useArEffect(() => {
    const onSeed = (e) => {
      asked.current = (e && e.detail) || {};
      setTick((n) => n + 1);
    };
    window.addEventListener("ask:seed", onSeed);
    return () => window.removeEventListener("ask:seed", onSeed);
  }, []);

  useArEffect(() => {
    if (!open) return;
    // Esc from anywhere in the Line: stop a turn in flight, else close. The input says so first when it has focus.
    const onEsc = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (live) stop();
      else onClose();
    };
    window.addEventListener("keydown", onEsc);
    const d = asked.current;
    if (d) {
      asked.current = null;
      if (d.about) setScope(typeof d.about === "object" ? d.about : null);
      if (d.thread) openThread({ id: d.thread });
      else if (d.mode === "compose" || !d.prompt) {
        setActive(null);
        setQuick(null);
        setQuery(d.prompt || "");
      } else submit(d.prompt);
    }
    return () => window.removeEventListener("keydown", onEsc);
  });

  useArEffect(() => {
    setSel(0);
  }, [query, active, open, view, quick]);
  useArEffect(() => {
    const b = bodyRef.current;
    if (!b || !b.querySelector) return;
    const el = b.querySelector(".ask-row.sel, .ask-item.sel, .ask-move.sel");
    if (!el) return;
    const top = el.offsetTop;
    const h = el.offsetHeight;
    if (top < b.scrollTop) b.scrollTop = Math.max(0, top - 8);
    else if (top + h > b.scrollTop + b.clientHeight) b.scrollTop = top + h - b.clientHeight + 8;
  }, [sel]);

  if (!open || !A) return null;

  // Going somewhere closes the Line; ⌘K brings the conversation back.
  const nav = (to) => {
    onClose();
    window.CHANLY.nav(to);
  };
  // Clear: the conversation ends and the Line is home; the thread stays in Earlier.
  const clearLine = () => {
    setActive(null);
    setQuery("");
    setQuick(null);
    setView("rows");
    setUnfolded(-1);
    setFoldAll(false);
    speech.stop();
  };

  // openThread, askDelete and removeThread: as they are at ask-real.jsx:188-210 (c93061cb), with openThread also doing
  // setQuick(null); setView("rows"); setUnfolded(-1); setFoldAll(false); before `return opened;`.

  const stop = () => {
    if (!live) return;
    stopped.current = turnSeq.current;
    setLive(null);
    setActive((prev) => (prev ? { ...prev, messages: [...prev.messages, arFailed("s-" + Date.now(), t.stopped)] } : prev));
    if (M) {
      M.mood.set("idle");
      M.mood.react("shake");
    }
  };

  // One turn: the question goes in, the words stream back, the answer lands. A question that repeats a thread's first
  // question resumes that thread rather than opening a twin beside it. A quick question needs no model and no thread.
  const submit = async (qArg) => {
    const q = (typeof qArg === "string" ? qArg : query).trim();
    if (!q || live) return;
    setQuery("");
    setView("rows");
    setUnfolded(-1);
    setLang(A.language(q));
    if (!active) {
      const pending = A.quick(q);
      if (pending) {
        setQuick({ q, pending: true });
        const answer = await pending;
        setQuick({ q, answer });
        if (M) {
          M.mood.set("idle");
          M.mood.react("nod");
        }
        return;
      }
    }
    setQuick(null);
    let base = active;
    if (!base) {
      const list = await (threadsReady.current || Promise.resolve(threads));
      const twin = list.find((th) => A.sameQuestion(th.title, q));
      if (twin) base = await openThread(twin);
    }
    const userMsg = { id: "u-" + Date.now(), role: "user", text: q, atMs: Date.now(), citations: [], followups: [], proposals: [] };
    const thread = base ? { ...base, messages: [...base.messages, userMsg] } : { id: null, title: q, messages: [userMsg], scope };
    setActive(thread);
    const mine = ++turnSeq.current;
    setLive({ q, text: "", traces: [] });
    let threadId = thread.id;
    let final = null;
    let spoke = false;
    await A.send({ text: q, threadId, scope: thread.scope || scope, surface }, (ev) => {
      if (stopped.current === mine) return;
      if (ev.t === "thread") {
        threadId = ev.id;
        setActive((prev) => (prev ? { ...prev, id: ev.id, title: prev.title || ev.title } : prev));
      } else if (ev.t === "trace") setLive((prev) => (prev ? { ...prev, traces: [...prev.traces, ev.text].slice(-3) } : prev));
      else if (ev.t === "delta") {
        setLive((prev) => (prev ? { ...prev, text: prev.text + ev.text } : prev));
        spoke = true;
        if (M) M.mood.beat(Math.min(1, ev.text.length / 6));
      } else if (ev.t === "final") final = ev.message;
      else if (ev.t === "error") final = arFailed("e-" + Date.now(), ev.text);
    });
    if (stopped.current === mine) return;
    if (!final) final = arFailed("e-" + Date.now(), t.cutOff);
    setLive(null);
    if (M) {
      M.mood.set("idle");
      if (final.failed) M.mood.react("shake");
      else if (!spoke) M.mood.react("nod");
    }
    setActive((prev) => (prev ? { ...prev, id: threadId || prev.id, messages: [...prev.messages, final] } : prev));
    if (threadId)
      A.threads().then((list) => {
        setThreads(list);
        const now = list.find((x) => x.id === threadId);
        if (now) setActive((prev) => (prev && prev.id === threadId ? { ...prev, title: now.title } : prev));
      });
    // "Open the 3:34 AM call": the app goes there as the answer lands (the answer's `now`, section 5.1), before oneDoor.
    const o = final.answer ? final.answer.do.open : final.navigate && final.navigate.to ? final.navigate : null;
    if (o && o.now && !final.failed) setTimeout(() => nav(o.to), 250);
  };

  // ---- what is under the line, and the keys that walk it ----
  const turns = active ? arTurns(active.messages) : [];
  const latest = turns.length ? turns[turns.length - 1] : null;
  const folded = turns.slice(0, -1);
  const shownFolds = foldAll ? folded : folded.slice(-AR_FOLDED);
  const hiddenFolds = folded.length - shownFolds.length;
  const showRows = view === "earlier" || !!query || (!active && !quick && !live);
  const sections = showRows ? buildLineRows({ A, t, lang, query, surface, scope, threads, view }) : [];
  const answerMsg = !showRows && !live && !quick && latest && latest.a ? latest.a : null;
  const drawn = answerMsg ? A.answer(answerMsg) : quick && quick.answer ? { answer: quick.answer, cardOpen: {} } : null;
  const rows = showRows ? flatRows(sections) : drawn ? answerMoves(drawn.answer) : [];
  const words = drawn ? A.answerText(drawn.answer) : "";

  const activate = (it) => {
    if (!it) return;
    if (it.type === "thread") {
      openThread(it.th);
      return;
    }
    if (it.type === "all") {
      setView("earlier");
      return;
    }
    if (it.type === "jump" || it.type === "item" || it.type === "open") {
      nav(it.to);
      return;
    }
    if (it.compose) {
      setQuery(it.q);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 20);
      return;
    }
    submit(it.q);
  };

  const onKey = (e) => {
    if (hold.onKeyDown(e)) return;
    if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
      e.preventDefault();
      setView((v) => (v === "earlier" ? "rows" : "earlier"));
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (live) stop();
      else onClose();
      return;
    }
    if (e.key === "ArrowDown" && rows.length) {
      e.preventDefault();
      setSel((s) => Math.min(rows.length - 1, s + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      if (rows.length && sel > 0) {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
        return;
      }
      if (active && !query && !rows.length) {
        const last = [...active.messages].reverse().find((m) => m.role === "user");
        if (last) {
          e.preventDefault();
          setQuery(last.text);
        }
      }
      return;
    }
    if (e.key === "Delete" && rows[sel] && rows[sel].type === "thread") {
      e.preventDefault();
      askDelete(rows[sel].th);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const q = query.trim();
      if (q) {
        if (rows[sel] && sel > 0) activate(rows[sel]);
        else submit(q);
      } else if (rows[sel]) activate(rows[sel]);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(words);
      flash({ msg: <>{t.copied}</> });
    } catch {
      flash({ tone: "danger", msg: <>{t.copyFailed}</> });
    }
  };

  const right = live ? (
    <button type="button" className="ask-line-btn" onClick={stop} aria-label={t.stopAnswer} title={t.stopAnswer} data-testid="ask-stop">
      <Icon name="stop" size={14} />
    </button>
  ) : drawn && !query ? (
    <>
      <button type="button" className="ask-line-btn quiet" onClick={copy} aria-label={t.copy} title={t.copy} data-testid="ask-copy">
        <Icon name="content" size={14} />
      </button>
      {speech.canSpeak ? (
        <button
          type="button"
          className={`ask-line-btn quiet${speech.speakingId === "line" ? " on" : ""}`}
          onClick={() => {
            if (!speech.toggle("line", words, lang)) flash({ msg: <>{t.noSpeech}</> });
          }}
          aria-label={speech.speakingId === "line" ? t.stop : t.read}
          aria-pressed={speech.speakingId === "line"}
          title={speech.speakingId === "line" ? t.stop : t.read}
          data-testid="ask-read"
        >
          <Icon name={speech.speakingId === "line" ? "pause" : "headphones"} size={14} />
        </button>
      ) : null}
      <button type="button" className="ask-line-btn quiet" onClick={clearLine} aria-label={t.clear} title={t.clear} data-testid="ask-clear">
        <Icon name="x" size={14} />
      </button>
    </>
  ) : talk.canTalk ? (
    <button
      type="button"
      className={`ask-line-btn ask-talk${talk.listening ? " on" : ""}`}
      data-testid="ask-talk"
      aria-pressed={talk.listening}
      aria-label={t.talk}
      title={t.talk}
      onPointerDown={talk.start}
      onPointerUp={talk.stop}
      onPointerLeave={talk.stop}
      onPointerCancel={talk.stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Icon name="wave" size={14} />
    </button>
  ) : (
    <button type="button" className="ask-line-btn ask-talk off" data-testid="ask-talk-off" aria-label={t.noVoice} title={t.noVoice} onClick={() => flash({ msg: <>{t.noVoice}</> })}>
      <Icon name="wave" size={14} />
    </button>
  );

  let body = null;
  if (showRows) body = <AskRows sections={sections} sel={sel} setSel={setSel} onActivate={activate} onDelete={askDelete} t={t} />;
  else if (live)
    body = live.text ? (
      <AskTurn m={{ id: "live", role: "assistant", text: live.text, citations: [], followups: [], proposals: [] }} q={live.q} streaming t={t} lang={lang} onNav={nav} onFollow={submit} />
    ) : (
      <div className="ask-trace" data-testid="ask-trace" aria-live="polite">
        <p className="ask-turn-q">{live.q}</p>
        {(live.traces.length ? live.traces : [t.thinking]).map((line, k, all) => (
          <div key={k} className={`ask-trace-row${k < all.length - 1 ? " done" : ""}`}>
            {k < all.length - 1 ? <Icon name="check" size={12} className="ask-trace-check" /> : <span className="ask-trace-dot" />}
            <span>{line}</span>
          </div>
        ))}
      </div>
    );
  else if (quick) body = <AskTurn quick={quick} q={quick.q} latest sel={sel} t={t} lang={lang} onNav={nav} onFollow={submit} />;
  else if (answerMsg)
    body = (
      <AskTurn
        m={answerMsg}
        q={latest.q ? latest.q.text : ""}
        latest
        sel={sel}
        t={t}
        lang={lang}
        onNav={nav}
        onFollow={submit}
        onRetry={answerMsg.failed && latest.q ? () => submit(latest.q.text) : undefined}
      />
    );

  return (
    // It goes the way it came as it closes (data-bits leaving), and on a phone, where it is a sheet from the bottom
    // (ask.css), a thumb pulls it down (touchSwipe). The class names ask-overlay and ask-modal carry #922's motion.
    <div className="ask-overlay ask-line-scrim" onClick={onClose} data-tick={tick} ref={window.leaving ? window.leaving("ask") : undefined}>
      <div
        className="ask-modal ask-real ask-line"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ask Chanlytics"
        data-testid="ask-real"
        {...(window.touchSwipe ? window.touchSwipe({ onDown: onClose, when: arPhone }) : {})}
      >
        {view === "rows" && folded.length ? (
          <div className="ask-folds" data-testid="ask-folds">
            {hiddenFolds > 0 ? (
              <button type="button" className="ask-fold-more" onClick={() => setFoldAll(true)}>
                {t.earlierFolded(hiddenFolds)}
              </button>
            ) : null}
            {shownFolds.map((tn) => {
              const idx = folded.indexOf(tn);
              const isOpen = unfolded === idx;
              return (
                <div key={idx} className={`ask-fold${isOpen ? " open" : ""}`}>
                  <button type="button" className="ask-fold-row" aria-expanded={isOpen} onClick={() => setUnfolded(isOpen ? -1 : idx)} data-testid="ask-fold">
                    <span className="ask-mark m1" aria-hidden="true" />
                    <span className="ask-fold-q">{tn.q ? tn.q.text : ""}</span>
                    <span className="ask-fold-a">{tn.a ? A.answerText(A.answer(tn.a).answer) : ""}</span>
                    <Icon name="chevron" size={12} className="ask-fold-chev" />
                  </button>
                  {isOpen && tn.a ? <AskTurn m={tn.a} t={t} lang={lang} onNav={nav} onFollow={submit} /> : null}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className={`ask-line-bar${talk.listening ? " listening" : ""}`} data-testid="ask-line">
          <span className="ask-line-face" ref={faceRef}>
            {AskFace ? <AskFace className="ask-line-face-canvas" testId="ask-line-face" /> : null}
          </span>
          {scope ? (
            <span className="ask-scope" title={`${scope.kind}: ${scope.label}`} data-testid="ask-scope">
              <Icon name={arScopeIcon(scope)} size={10} />
              <span>{scope.label}</span>
              <button type="button" onClick={() => setScope(null)} aria-label={t.clearScope}>
                <Icon name="x" size={9} />
              </button>
            </span>
          ) : null}
          <input
            ref={inputRef}
            className="ask-line-input"
            placeholder={talk.listening ? t.listening : active || quick ? t.follow : t.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            onKeyUp={(e) => hold.onKeyUp(e)}
            role="combobox"
            aria-expanded={rows.length > 0}
            aria-controls="ask-rows"
            aria-activedescendant={rows.length ? (showRows ? `ask-row-${sel}` : `ask-move-${sel}`) : undefined}
            aria-label="Ask Chanlytics"
            data-testid="ask-input"
            maxLength={1000}
          />
          <span className="ask-line-right">{right}</span>
        </div>
        {doomed ? (
          <Confirm question={t.deleteAsk} detail={doomed.title} yes={t.deleteYes} no={t.deleteKeep} danger block className="ask-confirm" onYes={() => removeThread(doomed)} onNo={() => setDoomed(null)} testid="ask-delete" />
        ) : null}
        <div className="ask-line-body" ref={bodyRef}>
          {body}
        </div>
      </div>
      {toastNode}
    </div>
  );
};

window.AskReal = AskReal;
```

When writing the file, the helper bodies the comments name (`arRoute`, `arScopeLabel`, `arScopeIcon`, `openThread`, `askDelete`, `removeThread`) are copied whole from the current file, with the one `openThread` addition named. The comments that say "as they are" are instructions for this plan only.

- [ ] **Step 4: Run the palette's current tests to see what changed.** Run `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-palette.test.mjs`. Expected: failures in the cases that read `ask-msgs`, `ask-stage`, `cmd-row*`, `ask-rail` and `ask:new`. Task 7 rewrites them.

### Task 7: The palette's cases, on the Line

**Files:** `tooling/scripts/tests/ask-palette.test.mjs`.

- [ ] **Step 1: Point the harness at the new parts.**
  - Import `ask-turn.jsx` after `ask-home.jsx`: `await import("../../../apps/dashboard/src/legacy/pages/ask-turn.jsx");`.
  - In `ask()`, the stand-in gains the real contract pieces: `...askPalette(...)` already brings `answer`, `intent`, `rightNow` and `waiting`. Add:

```js
    quick: (q) => {
      const i = palette.intent(q);
      return i && i.kind === "needs" ? Promise.resolve(needsAnswer(palette.waiting(), "en")) : null;
    },
    answerText,
```

    Here `palette` is the `askPalette(...)` result held in a const, and `needsAnswer` and `answerText` are imported from `@chanlytics/contracts`.

- [ ] **Step 2: Rewrite the cases.**
  - **N3.** Keep the case, rename it `"… a seeded question and a compose seed are taken as the Line opens"`, and drop its New chat part. `byClass(tree, "ask-msgs")` becomes `byTestId(tree, "ask-turn")`. "⌘K alone brings the conversation back" stays.
  - **Thread seed.** It asserts `byTestId(tree, "ask-turn")`.
  - **Ask's face.** Assert `byTestId(tree, "ask-line-face")`, where it read `ask-stage`. The moods stay `["thinking", "speaking", "idle"]` with two beats.
  - **Quick answer nods.** It stays as it is. With no `TODAY_DATA` the answer is "Nobody is waiting on you right now."; assert it with `textOf(byTestId(tree, "ask-say"))`.
  - **N5, the ×.**
    - `cmd-row-del` becomes `ask-row-del`.
    - The rows are `ask-row`, and the selection is `ask-row … sel`.
    - The walk to a conversation uses `String(n.props?.className || "").startsWith("ask-row ")`.
  - **N5, the rail's ×.** Replace it with Earlier:

```js
test("REGRESSION (N5): Earlier's × asks first too, and ⌘J opens Earlier from the line", async () => {
  const calls = ask([TH(1), TH(2), TH(3), TH(4)]);
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  const j = { ...pressOf("j"), metaKey: true };
  inputOf(tree).props.onKeyDown(j);
  tree = await later(Palette, OPEN);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-row-thread").length, 4, "every conversation");
  press(byClass(tree, "ask-row-del")[1]);
  tree = await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [], "it asks first");
  assert.ok(textOf(byTestId(tree, "ask-delete-confirm")).includes("Question 2"));
  press(byTestId(tree, "ask-delete-yes"));
  await later(Palette, OPEN);
  assert.deepEqual(calls.deleted, [TH(2).id]);
  await closes();
});
```

- [ ] **Step 3: Add the Line's own cases:**

```js
test("the Line at rest: Right now is Today's queue, then questions about the page, then earlier conversations -- and no key is drawn", async () => {
  globalThis.window.TODAY_DATA = {
    queue: {
      rows: [
        {
          id: "q1",
          conversationId: "c1",
          callId: null,
          who: "Nora",
          channel: "WhatsApp",
          when: "waited 2h",
          sentence: "Can I come at 3?",
          quoted: true,
          cta: { to: "inbox/th-c1" },
        },
      ],
    },
  };
  try {
    ask([TH(1)]);
    render(Palette, OPEN);
    const tree = await later(Palette, OPEN);
    assert.equal(textOf(byTestId(tree, "ask-row-now")), "Nora is waiting on you.");
    assert.ok(byTestId(tree, "ask-row-thread"), "an earlier conversation");
    assert.ok(!/[↵⌘]|Esc/.test(textOf(tree)), `no key symbol (D17): ${textOf(tree)}`);
    await closes();
  } finally {
    delete globalThis.window.TODAY_DATA;
  }
});

test("a follow-up folds the answer above the line; Clear ends the conversation and the thread stays in Earlier", async () => {
  const calls = ask([]);
  globalThis.window.__ask.send = async (input, on) => {
    calls.sent.push(input.text);
    on({ t: "thread", id: TH(5).id, title: input.text });
    on({
      t: "final",
      message: {
        id: `m-${calls.sent.length}`,
        role: "assistant",
        text: `Answer ${calls.sent.length}.`,
        atMs: Date.now(),
        failed: false,
        citations: [],
        followups: [],
        proposals: [],
      },
    });
  };
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "how was the week?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(textOf(byTestId(tree, "ask-say")), "Answer 1.");
  typed(tree, "and the week before?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.equal(all(tree, (n) => n.props?.["data-testid"] === "ask-fold").length, 1, "the first answer folds above the line");
  assert.equal(textOf(byTestId(tree, "ask-say")), "Answer 2.");
  press(byTestId(tree, "ask-clear"));
  tree = await later(Palette, OPEN);
  assert.equal(byTestId(tree, "ask-turn"), null, "home again");
  assert.ok(byTestId(tree, "ask-row-now"));
  await closes();
});

test("Esc while Ask reads stops waiting: the turn says so, and what the stream sends after changes nothing", async () => {
  const calls = ask([]);
  let finish;
  globalThis.window.__ask.send = (input, on) =>
    new Promise((res) => {
      calls.sent.push(input.text);
      on({ t: "trace", text: "Reading the inbox…" });
      finish = () => {
        on({ t: "final", message: { id: "late", role: "assistant", text: "Too late.", atMs: 0, failed: false, citations: [], followups: [], proposals: [] } });
        res();
      };
    });
  render(Palette, OPEN);
  let tree = await later(Palette, OPEN);
  typed(tree, "who wrote today?");
  tree = await later(Palette, OPEN);
  keyed(tree, "Enter");
  tree = await later(Palette, OPEN);
  assert.ok(byTestId(tree, "ask-trace"), "reading");
  keyed(tree, "Escape");
  tree = await later(Palette, OPEN);
  finish();
  tree = await later(Palette, OPEN);
  assert.ok(textOf(byTestId(tree, "ask-say")).startsWith("Stopped."), textOf(tree));
  assert.ok(!textOf(tree).includes("Too late."), "the late answer changed nothing");
  await closes();
});

test("Space held on an empty line talks; a tap does nothing; after words, Space is a space", async () => {
  ask([]);
  const started = [];
  const H = globalThis.window.AskHooks;
  const talk = { start: () => started.push("start"), stop: () => started.push("stop") };
  const cells = new Map();
  let slot = 0;
  const r0 = globalThis.React.useRef;
  globalThis.React.useRef = (init) => {
    const k = slot++;
    if (!cells.has(k)) cells.set(k, { current: init });
    return cells.get(k);
  };
  try {
    slot = 0;
    const hold = H.useHoldSpace({ empty: () => true, talk });
    const down = pressOf(" ");
    assert.equal(hold.onKeyDown(down), true);
    assert.equal(down.prevented, true, "no leading space");
    await new Promise((r) => setTimeout(r, 320));
    assert.deepEqual(started, ["start"], "held: listening");
    assert.equal(hold.onKeyUp(pressOf(" ")), true);
    assert.deepEqual(started, ["start", "stop"], "let go: ask");
    slot = 0;
    const tap = H.useHoldSpace({ empty: () => true, talk });
    tap.onKeyDown(pressOf(" "));
    tap.onKeyUp(pressOf(" "));
    await new Promise((r) => setTimeout(r, 320));
    assert.deepEqual(started, ["start", "stop"], "a tap started nothing");
    slot = 0;
    const words = H.useHoldSpace({ empty: () => false, talk });
    const typing = pressOf(" ");
    assert.equal(words.onKeyDown(typing), false);
    assert.equal(typing.prevented, false, "a space between words is typed");
  } finally {
    globalThis.React.useRef = r0;
  }
});
```

- [ ] **Step 4: Run the palette tests to verify they pass.**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-palette.test.mjs`. Expected: every case passes.

- [ ] **Step 5: Keep the card and refusal suites green.**
  - In `the-pages-say-only-what-is-true.test.mjs`, where the card cases install `window.__ask`, also set `globalThis.window.__askCardOpen = cardOpenRoute;`, importing `cardOpenRoute` from contracts. The deal card's Open must still go to the person's page.
  - `refusals-on-the-page.test.mjs` runs `window.AskTurn` with no `__ask`; `AskTurn` draws the prose and Try again for it.
  - Run both files. Expected: PASS.

- [ ] **Step 6: Commit** (Tasks 5–7):

```bash
git add apps/dashboard/src/legacy/pages/ask-*.jsx tooling/scripts/tests/ask-palette.test.mjs tooling/scripts/tests/the-pages-say-only-what-is-true.test.mjs
git commit -m "The Line: one line with the three in it, today's answers as Say, Show and Do, one door, no key drawn"
```

### Task 8: The band draws the same answer

**Files:** `apps/dashboard/src/legacy/pages/today-face.jsx`; test `tooling/scripts/tests/today-face.test.mjs`.

- [ ] **Step 1: Change the test.**
  - Import `ask-turn.jsx` after `ask-hooks.jsx`.
  - Import `answerFromV1`, `oneDoor` and `needsAnswer` from contracts.
  - The stand-in `client()` loses `fast` and `shape` and gains:

```js
    quick: () => null,
    answer: (m) => oneDoor(answerFromV1(m), m.proposals || []),
    answerText: (a) => [a.say.headline, a.say.detail].filter(Boolean).join(" "),
```

  - **"a question …"**: the follow-up is `byTestId(tree, "ask-next")`, where it looked for `.ask-follow-chip`.
  - **"a quick answer settles …"**:

```js
  A.quick = () =>
    Promise.resolve(
      needsAnswer(
        {
          people: [
            {
              id: "c1",
              kind: "thread",
              who: "Nora",
              channel: "WhatsApp",
              when: "waited 2h",
              line: "“Can I come at 3?”",
              to: "inbox/th-c1",
            },
          ],
          runs: [],
        },
        "en",
      ),
    );
```

  - Then assert the exchange says "Nora is waiting on you.". Pressing `byTestId(tree, "ask-item")` navigates to `inbox/th-c1`, and there is still no Continue.

- [ ] **Step 2: Run it to verify it fails.**
- [ ] **Step 3: Implement.** In `ask`, replace the quick block (from `const fp = A.fast(q);` to its `return;` after the openings) with:

```js
    // The palette's quick answers first (contracts askIntent, ask-answer.ts): no model, no thread.
    const pending = A.quick(q);
    if (pending) {
      const answer = await pending;
      if (alive.current) dispatch({ t: "fast", text: A.answerText(answer), answer, seq });
      return;
    }
```

Replace `const shape = …` with:

```js
  // What a settled answer shows, decided once (the Line's answer and oneDoor's doors): a quick answer's own, or the turn's.
  const drawn =
    turn.phase === "settled" && A
      ? turn.answer
        ? { answer: turn.answer, cardOpen: {} }
        : turn.message && !turn.message.failed
          ? A.answer(turn.message)
          : null
      : null;
  const AskAnswer = window.AskAnswer || null;
```

In the exchange:
- Draw the answer's text only while `answering` (with the cursor) or `failed`.
- When `settled` and `drawn && AskAnswer`, draw `<AskAnswer answer={drawn.answer} cardOpen={drawn.cardOpen} cards={[]} t={t} onNav={tfNav} onFollow={ask} compact />`.
- Delete the `.ask-follow` block and the `shape.open` and `turn.links` doors.
- Retry, Continue/Review in Ask, read aloud and Clear stay.

- [ ] **Step 4: Run today-face and mascot-turn to verify they pass, then commit.**

### Task 9: One door

**Files:** `apps/dashboard/src/legacy/components/sidebar.jsx`, `apps/dashboard/src/legacy/pages/app-shell.jsx`, `e2e/team-card.spec.ts`, `e2e/ask.spec.ts`, `e2e/phone.spec.ts`.

- [ ] **Step 1: The sidebar.**
  - Delete the New Chat block (`sidebar.jsx:436-452`: the `sb-newchat` div and its comment).
  - Delete the `onNewChat` prop in the component's signature and in its callers.
  - Remove any `.sb-newchat` rule left without a user.
  - The header comment line 3 loses "→ New Chat".
- [ ] **Step 2: The shell.** Delete `onNewChat={…}` (`app-shell.jsx:815`). `ask:new` has no sender left.
- [ ] **Step 3: e2e.**
  - **`team-card.spec.ts:102`** becomes `"the top bar's Ask opens the real palette, never the fabricated assistant"`, pressing `page.getByTestId("tb-ask")`.
  - **`ask.spec.ts`:**
    - `.cmd-sec-label` becomes `.ask-rows-label`, and `ask-stage` becomes `ask-line-face`.
    - The quick question asserts `page.getByTestId("ask-say")` contains `/waiting|Nobody/`.
    - The streamed case drops the rail and New chat, and asserts `ask-say`.
  - **`phone.spec.ts:39`:** the sheet is `ask-real`, and the rest of its assertions stand.
- [ ] **Step 4: Run the sidebar and shell tests** (`grep -ln "sb-newchat\|New Chat\|onNewChat" tooling/scripts/tests`), update them, and commit.

### Task 10: The Line's look

**Files:** `apps/dashboard/src/legacy/styles/ask.css` (replace the whole file); `apps/dashboard/src/legacy/Chanlytics.html`.

- [ ] **Step 1: Write `ask.css`:**

```css
/* Ask as the Line (pages/ask-real.jsx; docs/superpowers/specs/2026-09-23-ask-the-line-design.md, section 6): one line
   over the page with the three inside it, the rows or the answer under it, a conversation folded above it. The scrim
   and the panel keep the mockup's .ask-overlay and .ask-modal (their fade and slide in dashboard-a-v2.css, their leaving
   in components.css, #922); what the Line changes is here. Imported last, so its phone rules win over mobile.css. No key
   symbol is drawn (D17). */

/* ---- The scrim and the panel ---- */
.ask-overlay.ask-line-scrim { background: color-mix(in oklab, var(--bg-sunken) 64%, transparent); backdrop-filter: none; padding: 96px 24px 48px; align-items: flex-start; }
.ask-modal.ask-line { max-width: 720px; max-height: calc(100vh - 144px); display: flex; flex-direction: column; overflow: hidden; border-color: var(--line-strong); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); }
body.ask-open .tb-ask .tb-ask-face { visibility: hidden; }

/* ---- The line ---- */
.ask-line-bar { flex: none; display: flex; align-items: center; gap: 10px; height: 64px; padding: 0 12px 0 10px; border-bottom: 1px solid var(--line); }
.ask-line-face { flex: none; display: block; width: 44px; height: 36px; }
.ask-line-face-canvas { display: block; width: 44px; height: 36px; }
.ask-line-input { flex: 1; min-width: 0; height: 40px; border: 0; outline: 0; background: transparent; font: inherit; font-size: 18px; letter-spacing: -0.01em; color: var(--ink); }
.ask-line-input::placeholder { color: var(--ink-dim); }
.ask-line-bar.listening .ask-line-input::placeholder { color: var(--accent); }
.ask-line-right { flex: none; display: flex; align-items: center; gap: 2px; }
.ask-line-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: var(--radius-md); border: 1px solid var(--line); background: transparent; color: var(--ink-muted); cursor: pointer; touch-action: none; user-select: none; -webkit-user-select: none; }
.ask-line-btn:hover, .ask-line-btn:focus-visible { color: var(--ink); background: var(--bg-hover); outline: none; }
.ask-line-btn.quiet { width: 32px; height: 32px; border-color: transparent; color: var(--ink-dim); }
.ask-line-btn.on { color: var(--accent); background: var(--accent-soft); border-color: transparent; }
.ask-line-btn.off { opacity: .5; }
.ask-scope { flex: none; display: inline-flex; align-items: center; gap: 5px; max-width: 180px; height: 26px; padding: 0 4px 0 8px; border: 1px solid var(--line); border-radius: var(--radius-full); font-size: 12px; color: var(--ink-muted); }
.ask-scope > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ask-scope button { display: inline-flex; padding: 2px; border: 0; background: transparent; color: var(--ink-dim); cursor: pointer; }
.ask-line .ask-confirm { flex: none; margin: 8px 16px 0; max-width: none; }

/* ---- Under the line: the rows and the trace ---- */
.ask-line-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.ask-rows { display: flex; flex-direction: column; padding: 8px; }
.ask-rows-label { padding: 10px 12px 4px; font-size: 12px; color: var(--ink-dim); }
.ask-row { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-radius: var(--radius-md); background: transparent; font: inherit; text-align: left; color: var(--ink-muted); cursor: pointer; }
.ask-row.sel { background: var(--bg-hover); color: var(--ink); }
.ask-row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ask-row-label { font-size: 14px; }
.ask-row.now { color: var(--ink); }
.ask-row.now .ask-row-label { font-size: 14.5px; line-height: 1.45; }
.ask-row-sub { font-size: 12px; color: var(--ink-dim); }
.ask-row-meta { flex: none; font-size: 12px; color: var(--ink-dim); }
.ask-row-del { display: none; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 5px; color: var(--ink-faint); }
.ask-row.thread:hover .ask-row-del, .ask-row.thread.sel .ask-row-del { display: inline-flex; }
.ask-row-del:hover { color: var(--danger); background: var(--danger-soft); }
.ask-rows-empty { padding: 18px 20px; font-size: 13px; color: var(--ink-dim); }
.ask-trace { display: flex; flex-direction: column; gap: 10px; padding: 18px 24px 20px 22px; font-size: 13.5px; color: var(--ink); }
.ask-trace-row { display: flex; align-items: center; gap: 10px; margin: 0 0 0 24px; }
.ask-trace-row.done { color: var(--ink-muted); }
.ask-trace-dot { flex: none; width: 7px; height: 7px; margin: 0 3px; border-radius: 50%; background: var(--accent); animation: ask-pulse 1.2s ease-in-out infinite; }
.ask-trace-check { flex: none; color: var(--ink-dim); }
@keyframes ask-pulse { 0%, 100% { transform: scale(.7); opacity: .4; } 50% { transform: scale(1); opacity: 1; } }

/* ---- A conversation, folded above the line ---- */
.ask-folds { flex: none; max-height: 40vh; overflow-y: auto; display: flex; flex-direction: column; border-bottom: 1px solid var(--line); }
.ask-fold-row { display: flex; align-items: center; gap: 10px; width: 100%; height: 42px; padding: 0 16px 0 20px; border: 0; background: transparent; font: inherit; font-size: 13px; color: var(--ink-dim); text-align: left; cursor: pointer; }
.ask-fold-row:hover { background: var(--bg-hover); }
.ask-fold-q { flex: none; max-width: 45%; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ask-fold-a { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ask-fold-chev { flex: none; transition: transform 120ms var(--ease-out); }
.ask-fold.open .ask-fold-chev { transform: rotate(90deg); }
.ask-fold-more { height: 34px; padding: 0 20px; border: 0; background: transparent; font: inherit; font-size: 12px; color: var(--ink-dim); text-align: left; cursor: pointer; }

/* ---- The answer: Say, Show, Do, each beside one of the three's squares, lightest to darkest ---- */
.ask-turn { display: flex; flex-direction: column; gap: 8px; padding: 18px 24px 18px 22px; }
.ask-fold .ask-turn { padding: 4px 20px 16px; }
.ask-turn-q { margin: 0 0 4px 24px; font-size: 13px; color: var(--ink-dim); }
.ask-answer { display: flex; flex-direction: column; gap: 22px; }
.ask-part { display: grid; grid-template-columns: 8px minmax(0, 1fr); column-gap: 16px; align-items: start; }
.ask-mark { display: block; width: 8px; height: 8px; border-radius: 2px; }
.ask-mark.m1 { background: color-mix(in oklab, var(--ink) 88%, transparent); }
.ask-mark.m2 { background: color-mix(in oklab, var(--ink-muted) 90%, transparent); }
.ask-mark.m3 { background: color-mix(in oklab, var(--ink-dim) 70%, var(--ink-faint)); }
.ask-part.say .ask-mark { margin-top: 9px; }
.ask-part.show .ask-mark { margin-top: 5px; }
.ask-part.do .ask-mark { margin-top: 16px; }
.ask-say { display: flex; flex-direction: column; gap: 6px; }
.ask-headline { margin: 0; font-size: 20px; font-weight: 500; line-height: 1.35; letter-spacing: -0.012em; color: var(--ink); text-wrap: balance; }
.ask-detail { margin: 0; font-size: 14px; line-height: 1.5; color: var(--ink-muted); white-space: pre-wrap; }
.ask-prose { margin: 0; font-size: 14.5px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
.ask-turn.failed .ask-prose { color: var(--ink-dim); }
.ask-cursor { display: inline-block; width: 6px; height: 13px; margin-left: 2px; vertical-align: -2px; background: var(--accent); border-radius: 1px; animation: ask-blink 1s steps(2, start) infinite; }
@keyframes ask-blink { to { visibility: hidden; } }
.ask-unverified { display: inline-flex; align-self: flex-start; align-items: center; gap: 6px; margin-left: 24px; font-size: 11px; color: var(--warn); background: var(--warn-soft); border-radius: var(--radius-full); padding: 3px 9px; }
.ask-show { display: flex; flex-direction: column; gap: 18px; }
.ask-figures { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.ask-figure { position: relative; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ask-figure-value { align-self: flex-start; padding: 0; border: 0; background: transparent; font: inherit; font-size: 22px; font-weight: 500; letter-spacing: -0.025em; line-height: 1.15; color: var(--ink); cursor: pointer; text-decoration: underline dotted var(--line-strong); text-underline-offset: 5px; }
.ask-figure-value.plain { cursor: default; text-decoration: none; }
.ask-figure-value[aria-expanded="true"] { text-decoration: underline solid var(--ink-muted); }
.ask-figure-label { font-size: 12.5px; color: var(--ink-muted); }
.ask-figure-note { font-size: 11.5px; color: var(--ink-dim); }
.ask-receipt { position: absolute; left: 0; top: calc(100% + 6px); z-index: 2; width: 260px; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: var(--bg-hover); border: 1px solid var(--line-strong); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); font-size: 12.5px; color: var(--ink); }
.ask-receipt-from { color: var(--ink-muted); }
.ask-receipt-door { align-self: flex-start; padding: 0; border: 0; background: transparent; font: inherit; font-size: 12.5px; color: var(--ink); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.ask-breakdown { display: flex; flex-direction: column; gap: 6px; }
.ask-breakdown-title { font-size: 13px; font-weight: 500; color: var(--ink); }
.ask-breakdown-from { display: inline-flex; gap: 8px; font-size: 12px; color: var(--ink-dim); }
.ask-items { display: flex; flex-direction: column; gap: 2px; margin: 0 -12px; }
.ask-item { display: flex; flex-direction: column; gap: 3px; width: 100%; padding: 10px 12px; border: 0; border-radius: var(--radius-md); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.ask-item:hover, .ask-item.sel { background: var(--bg-hover); }
.ask-item-top { display: flex; align-items: baseline; gap: 8px; }
.ask-item-title { font-size: 13.5px; font-weight: 500; color: var(--ink); }
.ask-item-meta { font-size: 12px; color: var(--ink-dim); }
.ask-item-line { font-size: 13px; line-height: 1.45; color: var(--ink-muted); }
.ask-do { display: flex; flex-direction: column; gap: 2px; margin-left: -12px; }
.ask-move { display: flex; align-items: center; width: 100%; min-height: 40px; padding: 8px 12px; border: 0; border-radius: var(--radius-md); background: transparent; font: inherit; font-size: 14px; color: var(--ink); text-align: left; cursor: pointer; }
.ask-move:hover, .ask-move.sel { background: var(--bg-hover); }
.ask-move.next { color: var(--ink-muted); }
.ask-answer.compact { gap: 14px; width: min(620px, 100%); text-align: left; }
.ask-answer.compact .ask-headline { font-size: 16px; }
.ask-answer.compact .ask-figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }

/* ---- Cards: a proposal the person approves (no coloured edge: coral is only for Ask at work) ---- */
.ask-card { margin: 0 0 8px 12px; border: 1px solid var(--line); border-radius: var(--radius-lg); background: var(--bg); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
.ask-card.dismissed, .ask-card.undone { opacity: .6; }
.ask-card-head { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 500; color: var(--ink); }
.ask-card-kind { margin-left: auto; font-size: 11px; color: var(--ink-dim); }
.ask-card-summary { font-size: 13px; line-height: 1.45; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
.ask-card-note { font-size: 11px; color: var(--warn); }
.ask-card-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.ask-card-receipt { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-dim); }
.ask-card-receipt .ok { color: var(--ok); }
.ask-card-undo { margin-left: auto; }

/* ---- A phone: the ✦, and the Line docked at the thumb with the answer rising above it ---- */
.phone-ask { display: none; }
@media (prefers-reduced-motion: reduce) { .ask-cursor, .ask-trace-dot { animation: none; } }
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
  .ask-overlay.ask-line-scrim { padding: 0; align-items: flex-end; }
  .ask-modal.ask-line {
    max-width: 100%; width: 100%; max-height: 88vh;
    border-radius: 20px 20px 0 0; border-bottom: 0;
    padding-bottom: env(safe-area-inset-bottom);
  }
  /* The line at the thumb: the folds on top, then the answer or the rows, then the line. */
  .ask-line .ask-folds { order: 0; }
  .ask-line .ask-line-body { order: 1; }
  .ask-line .ask-confirm { order: 2; }
  .ask-line .ask-line-bar { order: 3; height: 60px; margin: 8px 12px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius-xl); background: var(--bg); }
  .ask-line-input { font-size: 16px; }
  .ask-line-btn { width: 44px; height: 44px; }
  .ask-row, .ask-move { min-height: 48px; }
  .ask-figures { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

- [ ] **Step 2: Bump the versions in `Chanlytics.html`:**

| File | From | To |
|---|---|---|
| `ask.css` | v5 | v6 |
| `ask-text.jsx` | v4 | v5 |
| `ask-hooks.jsx` | v2 | v3 |
| `ask-turn.jsx` | v2 | v3 |
| `ask-home.jsx` | v1 | v2 |
| `ask-real.jsx` | v6 | v7 |
| `today-face.jsx` | v6 | v7 |
| `sidebar.jsx` | v23 | v24 |
| `app-shell.jsx` | v52 | v53 |

`legacy-harness.test.mjs` holds the two lists together. No file is added or removed, so `manifest.ts` does not change.

- [ ] **Step 3: Commit.**

### Task 11: The retired pins

- [ ] **Step 1: Run the whole suite.** Run `corepack pnpm test > st2-test.txt 2>&1` and list the failing cases (`grep "^not ok" st2-test.txt`). Expected: `ask.test.mjs` cases whose source reads name what went, including:
  - `ask-rail`, `ask-new-btn`, `AR_RAIL_CAP`, `railOn`;
  - `A.shape(m, lang)`, `className="ask-from"`, `AskFollowups`;
  - `ask-fast`, the Act section, `useAskWide`, `.ask-tools`;
  - New Chat;
  - `stage`.
- [ ] **Step 2: For each failing source assertion:**
  - If it pins a behaviour the Line keeps, move it to an executed case in `ask-palette.test.mjs`. The mic is always visible when nothing is answered, and "open" goes there (`now`).
  - If it pins what the Line removed, delete it.
  - Never add a `readCode` or `readRaw`.
- [ ] **Step 3: Lower the baseline.** Run `UPDATE_SOURCE_SCAN_BASELINE=1 corepack pnpm test` so `source-scan-baseline.json` records `ask.test.mjs`'s lower count. Check that only the files this PR touched moved.
- [ ] **Step 4: Commit** — `git commit -m "Ask's retired source pins go with the palette they pinned; the Line's behaviour is executed instead"`.

### Task 12: Seen in the running app

- [ ] **Step 1: Start `cm-face-app`** with the `.env.local` it has. Ask answers as a preview ("Ask only answers on the production dashboard"), which is enough to see:
  - the Line at rest;
  - typing and jumps;
  - Earlier;
  - a quick answer, which needs no model;
  - hold Space, as the mic's pressed state;
  - Esc;
  - the phone at 375 wide.
- [ ] **Step 2: Measure against canvas frames A1 and A4** (read_page, computed styles):
  - the panel is 720 wide at 96 from the top, with no key symbol in its text;
  - Right now names the queue's people, and the badge's count matches;
  - on a phone, the line sits at the bottom with 44px targets.
- [ ] **Step 3: Restore `apps/dashboard/tsconfig.json` and `next-env.d.ts`** (`next dev` rewrites them) before staging.

### Task 13: Gates, PR, merge

- [ ] **Step 1: Run the gates.** Run test, typecheck, lint, format:check and check:dist, each to its own log. Expected: all green.
- [ ] **Step 2: Merge `origin/main` on its own.** Resolve any conflict, rebuild dist if contracts conflict, and run the gates again. Only then push.
- [ ] **Step 3: Open the PR:** `The Line: Ask as one line with the three in it, answers as Say · Show · Do, one door, no key drawn (2 of 4)`.
  - **What changes for a customer:** the palette itself; Right now and "who needs me" now match the queue; New Chat is gone from the sidebar.
  - **Before merging:** nothing.
  - **Deploy order:** either. There is no server change.
- [ ] **Step 4: CI green, then squash-merge.** Then check main's newest run and look at production: the Line opens from the top bar, "who needs me right now?" names the queue's people, and a model answer draws as prose with one Open.
