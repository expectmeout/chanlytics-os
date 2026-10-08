# People's table says each fact once, in the kit's shapes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the desktop People table draws every cell in the kit's one badge language (a state is a dot and its word, a name is words, an act is the kit's button), says each fact once and in words, offers the owner's next step as a column, and fits the pane at 1440 with the sidebar open.

**Architecture:** every derivation stays in contracts (`packages/contracts/src/people/`): a row's reach in words is one helper beside `bookingLinkAction`, and the last contact's two parts ride the fact that already carries its sentence. The page (`apps/dashboard/src/surfaces/people/cells/columns.tsx`) only composes: the Receptionist and Offers cells become the kit's `StatePill` over the tone maps `tone.ts` already holds (`standing`, `consent`), the row's acts the kit's `Button`, and the Reach, Next step and Last contact cells two quiet lines each. Classic's rules for the old cells leave `clients.css` and nothing new carries a literal; the pins that named the old shapes move with them.

**Tech Stack:** TypeScript (contracts, the People surface), the kit (`StatePill`, `Button`, `Icon`), the house's `data-tip` tooltip (data-bits, app-wide), node:test through `tooling/scripts/checks/test.mjs`, the style and bundle measures (`UPDATE_BASELINES=1`, `check:bundle`), Playwright pins in `e2e/people/people.spec.ts`.

**Origin:** Ruben, 8 Oct 2026, after the People table audit (the chat report; memory `project_chanlytics_people_table_audit`): "build it all in one PR, receptionist off by default". The audit's six items: Reach in words, Receptionist as the standing pill and off by default, Offers toned, a Next step column, the row's acts on the kit, the width banked.

## Global constraints

Worktree `cm-audit`, branch `people/the-table-says-it-once` off `b2271d3a4` (main, 7 Oct). Local commits only; one push and one PR at the end, merge on Ruben's word. The legacy stylesheets are CRLF: edit with the Edit tool, never `sed -i`; bump `clients.css?v=` in `Chanlytics.html`. No new class in a page stylesheet may name a kit class or hold a primitive's word (`tooling/scripts/tests/_measures.mjs`, kit-primitives); no literal size, colour or radius (style-values). Falls are banked with `UPDATE_BASELINES=1`; the bundle with `check:bundle -- --update` after a build, or raised with a row under "Rises" in `docs/debt.md`. Contracts' dist is rebuilt after Prettier and committed; the other dists' CRLF noise is checked out. Tests go into existing files (`tooling/scripts/tests/people/` is at the folder cap).

## Not in this plan

- The phone's card (`plCardCell`): it draws what it drew.
- The State cell's second line for `new` and `quiet` (the audit's note, not one of the six).
- A WhatsApp glyph in the kit: the wire is said in words here, and the Inbox's face badge keeps the chat glyph for both.

---

### Task 1: Contracts say how a row reaches a person, in words

**Files:**
- Modify: `packages/contracts/src/people/person-reach.ts` (after `repliesWords`)
- Modify: `packages/contracts/src/people/index.ts` only if `person-reach` is not re-exported whole (check: `grep -n "person-reach" packages/contracts/src/people/index.ts`)
- Test: `tooling/scripts/tests/people/people-vm.test.mjs` (after the test "the Replies row says what a reply may be…")

- [x] **Step 1: Write the failing test**

```js
test("a row says how to reach a person in words: the wire a reply goes on over the one identifier, and what a reply may be only where that matters", () => {
  const { rowReachWords } = contracts;
  const base = {
    name: "Zoë",
    phone: "+1 (786) 555-0181",
    email: null,
    channels: ["whatsapp", "voice"],
    replyVia: "WhatsApp",
    replyWindow: { open: true, hoursLeft: 9 },
    emailSuppressed: false,
    stopped: false,
    channelWords: "WhatsApp · Phone",
  };
  // Named, with an open window: the wire, the number, nothing more to say; every wire in the tip.
  assert.deepEqual(rowReachWords(base, true), {
    wire: "WhatsApp",
    id: "+1 (786) 555-0181",
    may: null,
    tip: "WhatsApp · Phone · Any message, for 9 more hours",
  });
  // The window shut: a reply is held to approved messages, and the row says so.
  assert.equal(rowReachWords({ ...base, replyWindow: { open: false, hoursLeft: 0 } }, true).may, "Approved messages only");
  // Named by their number: the number is the name, so the cell says the wire alone.
  assert.deepEqual(rowReachWords({ ...base, name: "+1 (786) 555-0181" }, false).id, null);
  assert.equal(rowReachWords({ ...base, name: "+1 (786) 555-0181" }, false).wire, "WhatsApp");
  // By email: the address is the identifier, even beside a number, and a stopped address says so.
  const mail = { ...base, email: "zoe@example.com", replyVia: "Email", replyWindow: null, channelWords: "Email" };
  assert.deepEqual(rowReachWords(mail, true), { wire: "Email", id: "zoe@example.com", may: null, tip: "Email · Any time, by email" });
  assert.equal(rowReachWords({ ...mail, emailSuppressed: true }, true).may, "Stopped accepting mail");
  // Only ever phoned: the wire is the phone, no window to speak of.
  const phoned = { ...base, channels: ["voice"], replyVia: null, replyWindow: null, channelWords: "Phone" };
  assert.deepEqual(rowReachWords(phoned, true), { wire: "Phone", id: "+1 (786) 555-0181", may: null, tip: "Phone" });
  // Nothing at all (added by hand, never wrote): the identifier alone.
  const quiet = { ...phoned, channels: [], channelWords: "" };
  assert.deepEqual(rowReachWords(quiet, true), { wire: null, id: "+1 (786) 555-0181", may: null, tip: "" });
  // Opted out: the State says it; the row's reach says only the wire and the number.
  assert.equal(rowReachWords({ ...base, stopped: true }, true).may, null);
  assert.equal(rowReachWords({ ...base, stopped: true }, true).tip, "WhatsApp · Phone");
});
```

- [x] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/people/people-vm.test.mjs`
Expected: the new test fails with `rowReachWords is not a function` (the namespace import holds no such export).

- [x] **Step 3: Write the helper**

In `person-reach.ts`, after `repliesWords`:

```ts
/** What a reply may be, in a row's few words: the one constraint worth a line, or nothing (repliesWords is the page's sentence). */
const EMAIL_STOPPED_SHORT = "Stopped accepting mail";
const APPROVED_ONLY_SHORT = "Approved messages only";

/** What a People row says of reaching a person: the wire over the one identifier, a constraint where there is one, and every wire in the tip. */
export interface RowReachWords {
  /** The wire a reply goes out on ("WhatsApp", "Text", "Email"), "Phone" for someone who only ever called, null with no wire at all. */
  wire: string | null;
  /** The one way to reach them on that wire: the address when the reply goes by email, else the number, else the address; null where the identifier is already the name. */
  id: string | null;
  /** The constraint on a reply, where there is one: the window shut, or an address that stopped. Null where any message may go, or the State says why none may. */
  may: string | null;
  /** Every wire in words, then what a reply may be as the page's Replies row says it. */
  tip: string;
}

export function rowReachWords(
  p: {
    name: string;
    phone: string | null;
    email: string | null;
    channels: readonly string[];
    replyVia: "WhatsApp" | "Text" | "Email" | null;
    replyWindow: { open: boolean; hoursLeft: number } | null;
    emailSuppressed: boolean;
    stopped: boolean;
    channelWords: string;
  },
  /** Whether the row has a name of its own: named by a number or an address, the identifier is the name already. */
  named: boolean,
): RowReachWords {
  const wire = p.replyVia ?? (p.channels.includes("voice") ? "Phone" : null);
  const id = !named ? null : wire === "Email" ? p.email || p.phone : p.phone || p.email;
  const may = p.stopped
    ? null
    : wire === "Email" && p.emailSuppressed
      ? EMAIL_STOPPED_SHORT
      : wire === "WhatsApp" && p.replyWindow && !p.replyWindow.open
        ? APPROVED_ONLY_SHORT
        : null;
  const replies = repliesWords(p.replyVia, p.replyWindow, {
    optedOut: p.stopped,
    who: p.name,
    emailStopped: p.emailSuppressed,
  });
  const tip = [p.channelWords, p.stopped ? null : replies].filter(Boolean).join(" · ");
  return { wire, id: id ?? null, may, tip };
}
```

- [x] **Step 4: Run the test to see it pass**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/people/people-vm.test.mjs`
Expected: PASS (every test in the file). If the import of `rowReachWords` through `@chanlytics/contracts` fails, the suite reads the package's `src` through tsx; check `packages/contracts/src/people/index.ts` exports `person-reach` (`export * from "./person-reach"`).

- [x] **Step 5: Commit**

```bash
git add packages/contracts/src/people/person-reach.ts tooling/scripts/tests/people/people-vm.test.mjs
git commit -m "Contracts say how a row reaches a person, in words"
```

### Task 2: The last contact carries its two parts

**Files:**
- Modify: `packages/contracts/src/people/person-row-facts.ts` (`PersonLastContact`, `lastContactOf`)
- Test: `tooling/scripts/tests/people/people-vm.test.mjs` (the test "last contact says who and how long ago…")

- [x] **Step 1: Extend the existing test**

Inside "last contact says who and how long ago, and the newer of message vs call wins", after its first assertions on `label`, add:

```js
  // The two parts the table draws on two lines: when, over who. Together they are the label.
  const lc = toPersonRowVM(base({}), TZ, new Date(NOW), null, null).lastContact;
  assert.equal(`${lc.by} · ${lc.when}`, lc.label);
  assert.equal(lc.by, "They wrote");
  const none = toPersonRowVM(base({ last_message_at: null, last_call_at: null }), TZ, new Date(NOW), null, null).lastContact;
  assert.deepEqual([none.by, none.when, none.label], ["No contact recorded", "", "No contact recorded"]);
```

(Use the file's own row builder and clock names; `base`, `TZ`, `NOW` stand for whatever that test already uses.)

- [x] **Step 2: Run it to see it fail**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/people/people-vm.test.mjs`
Expected: FAIL, `by` is undefined.

- [x] **Step 3: Carry the parts**

In `person-row-facts.ts`:

```ts
export interface PersonLastContact {
  ts: number | null;
  at: string | null;
  kind: "message" | "call" | null;
  who: "they" | "receptionist" | "you" | "system" | null;
  /** Who spoke: "They wrote", "Receptionist replied", "Phoned", "We called"; "No contact recorded" with none. */
  by: string;
  /** How long ago: "2h ago", the business's date past a week; empty with none. */
  when: string;
  /** "They wrote · 2h ago": `by` and `when`, the one sentence the CSV and a phone's card say. */
  label: string;
}
```

and in `lastContactOf` build each return from `by` and `when`:

```ts
  if (m === null && k === null)
    return { ts: null, at: null, kind: null, who: null, by: "No contact recorded", when: "", label: "No contact recorded" };
  if (k !== null && (m === null || k > m)) {
    const theirs = ts(r.last_inbound_call_at) === k;
    const by = theirs ? "Phoned" : "We called";
    const when = ago(k, tz, nowMs);
    return { ts: k, at: r.last_call_at, kind: "call", who: theirs ? "they" : "system", by, when, label: `${by} · ${when}` };
  }
  …
  const by = verb;
  const when = ago(m as number, tz, nowMs);
  return { ts: m, at: r.last_message_at, kind: "message", who, by, when, label: `${by} · ${when}` };
```

- [x] **Step 4: Run the test to see it pass**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/people/people-vm.test.mjs`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/contracts/src/people/person-row-facts.ts tooling/scripts/tests/people/people-vm.test.mjs
git commit -m "The last contact carries when and who as two parts"
```

### Task 3: The cells, on the kit

**Files:**
- Modify: `apps/dashboard/src/surfaces/people/cells/columns.tsx`
- Modify: `apps/dashboard/src/surfaces/people/page/shown.ts` (`sortKeyOf`: `next`)
- Modify: `apps/dashboard/src/surfaces/people/words.ts` (`PL_SORTED_BY`: `next`)
- Delete the import of `ChannelGlyph` from `columns.tsx` (`cells/channel-glyph.tsx` stays: `people-globals.ts` publishes it)
- Test: `tooling/scripts/tests/people/people-honest.test.mjs`, `tooling/scripts/tests/consent/consent-door.test.mjs`, `tooling/scripts/tests/calendar/calendar-people.test.mjs`, `e2e/people/people.spec.ts`

- [x] **Step 1: Move the pins to the new shapes (red first)**

In `people-honest.test.mjs`:
- every default headings list `["Person", "State", "Reach", "Last contact", "Receptionist", "Offers"]` becomes `["Person", "State", "Next step", "Reach", "Last contact", "Offers"]`; with a calendar `["Person", "State", "Next step", "Reach", "Last contact", "Visits", "Offers"]`; with Came from / Email / Lists shown, the same with those at the end; `sorting(tree)` lists gain `"Next step"` after `"State"`.
- the test "without a calendar the Receptionist column shows, and the word is beside the state too" becomes: the column is off by default, the mark beside the state is not `is-in-column`; after `flipColumn(tree, "receptionist")` the heading "Receptionist" shows, the mark is `is-in-column`, and the cell `row-receptionist` says "Reply queued".
- the Columns menu test's items list: `{ key: "receptionist", on: false, locked: false }` after `next`'s `{ key: "next", on: true, locked: false }`.
- a new test after "the table's columns…":

```js
test("the next step is a column: its words and its day, the day in the warn ink once it has come, and a row with none is quiet", async () => {
  const today = new Date(NOW).toISOString().slice(0, 10);
  await freshPage({
    people: [
      person(1, { step_id: "s1", step_body: "Call about the quote", step_due_on: today, step_for_me: true }),
      person(2),
    ],
  });
  const tree = draw();
  const cell = byTestId(rowOf(tree, "p1"), "row-next-step");
  assert.match(textOf(cell), /Call about the quote/);
  assert.match(textOf(cell), /today/);
  assert.equal(cell.props["data-due"], "today");
  assert.equal(textOf(byTestId(rowOf(tree, "p2"), "row-next-step")).trim(), "", "nothing where there is no step");
  sortByHeading(tree, "Next step");
  const sorted = draw();
  assert.equal(all(sorted, (n) => n.type === "tr" && /^person-/.test(n.props?.id || "")).map((tr) => tr.props.id)[0], "person-p1", "the soonest first");
});
```

- the Reach pin: `assert.match(textOf(byTestId(rowOf(tree, "p1"), "row-reach")), /WhatsApp/, "and it names the wire");` beside the `/786/` one.

In `consent-door.test.mjs`, the `drawn` reader reads the pill:

```js
  const drawn = (consent, marketing) => {
    const p = personRow({ consent, marketing_consent: marketing });
    const td = offersColumn.cell(p, {});
    const pill = td.props.children;
    return { p, td, word: pill.props.label, cls: pill.props.className, tone: pill.props.value };
  };
  …
  assert.match(drawn("unknown", "opted_in").cls, /\bcl-row-offers yes\b/);
  assert.equal(drawn("unknown", "opted_in").tone, "opted_in", "the ok tone: a yes is a quiet green dot");
```

In `e2e/people/people.spec.ts`, the headers:

```ts
    expect(headers).toEqual([
      "person",
      "state",
      "next step",
      "reach",
      "last contact",
      ...(cal?.state === "ok" ? ["visits"] : []),
      "offers",
    ]);
```

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/people/people-honest.test.mjs tooling/scripts/tests/consent/consent-door.test.mjs`
Expected: the moved pins FAIL.

- [x] **Step 2: Draw the cells**

In `columns.tsx`:

```tsx
import { Button } from "../../kit/button/button";
import { rowReachWords } from "@chanlytics/contracts";
```

Receptionist (replaces `PeopleReceptionist`):

```tsx
  {
    key: "receptionist",
    label: "Receptionist",
    sortable: false,
    // Off until asked for (Ruben, 8 Oct 2026): "Answering" on every row said nothing, and the State cell says the
    // exception beside the pill while this column is hidden (cl-row-recept-mark).
    on: false,
    cell: (p) => (
      <td key="receptionist" className="cl-recept-cell">
        <StatePill kind="standing" value={p.receptionist.tone} label={p.receptionist.label} testid="row-receptionist" />
      </td>
    ),
  },
```

Offers:

```tsx
/** The Offers cell: the answer as the consent pill (a yes a quiet green dot), its history the tip; a yes nobody can be sent is said plainly. */
const plOffersCell = (p: PersonRowVM) => {
  const offers = offersOf(p.consent.marketing);
  const unsent = p.consent.marketing === "opted_in" && !p.canReceive.offers;
  return (
    <td
      key="offers"
      className="shrink cl-offers-cell"
      title={unsent ? `${p.consent.marketingSub} · no channel can carry an offer to them now` : p.consent.marketingSub}
      data-testid="row-offers"
    >
      <StatePill
        kind="consent"
        value={unsent ? "unknown" : p.consent.marketing}
        label={offers[0]}
        className={`cl-row-offers ${offers[1]}${unsent ? " unsent" : ""}`}
      />
    </td>
  );
};
```

Reach:

```tsx
/** How to reach them: the wire a reply goes on over the one identifier (contracts rowReachWords); the number is the name on a row named by it. */
const plReachCell = (p: PersonRowVM) => {
  const words = rowReachWords(p, !plIsNumber(p.name) && !plIsAddress(p));
  return (
    <td key="reach" className="shrink cl-reach-cell" title={words.tip || undefined} data-testid="row-reach">
      {words.wire || words.id ? (
        <span className="cl-row-reach">
          {words.wire && <span className="cl-row-reach-wire">{words.wire}</span>}
          {words.id && <span className={p.phone && words.id === p.phone ? "cl-row-reach-id tabular" : "cl-row-reach-id"}>{words.id}</span>}
          {words.may && <span className="cl-row-reach-may">{words.may}</span>}
        </span>
      ) : (
        <span className="dim">—</span>
      )}
    </td>
  );
};
```

Next step, after State in `PL_COLUMNS`:

```tsx
  {
    key: "next",
    label: "Next step",
    sortable: true,
    cell: (p) => (
      <td
        key="next"
        className="shrink cl-next-cell"
        data-due={p.nextStep ? p.nextStep.due : undefined}
        title={p.nextStep ? [p.nextStep.words, p.nextStep.day.words, p.nextStep.forWho].filter(Boolean).join(" · ") : undefined}
        data-testid="row-next-step"
      >
        {p.nextStep ? (
          <span className="cl-row-next">
            <span className="cl-row-next-words">{p.nextStep.words}</span>
            <span className="cl-row-next-when">{p.nextStep.day.near}</span>
          </span>
        ) : null}
      </td>
    ),
  },
```

Last contact:

```tsx
    cell: (p) => (
      <td key="last" className="shrink dim cl-last-cell" title={plWhen(p.lastContact.at)}>
        <span className="cl-row-last">
          <span className="cl-row-last-when">{p.lastContact.when || p.lastContact.by}</span>
          {p.lastContact.when && <span className="cl-row-last-by">{p.lastContact.by}</span>}
        </span>
      </td>
    ),
```

Row acts (replaces the raw buttons in `PeopleRowActions`):

```tsx
      {p.threadId && (
        <Button variant="quiet" size="sm" iconOnly aria-label="Open the thread" data-tip="Open the thread" onClick={open} data-testid="row-open-thread">
          <Icon name="chat" size={12} />
        </Button>
      )}
      {p.threadId && bookingLink && (
        <Button variant="quiet" size="sm" iconOnly aria-label={p.bookingLinkAction.label} data-tip={p.bookingLinkAction.title} onClick={link} data-testid="row-booking-link">
          <Icon name="send" size={12} />
        </Button>
      )}
      {drop && (
        <Button variant="quiet" size="sm" iconOnly aria-label={`Take ${p.name} off ${drop.list.name}`} data-tip={`Take ${p.name} off ${drop.list.name}`} onClick={() => drop.onDrop(p)} data-testid="row-drop-list">
          <Icon name="x" size={11} />
        </Button>
      )}
```

In `shown.ts`'s `sortKeyOf`, before `default`:

```ts
    // The soonest step first, a row with none last whichever way the heading is pressed.
    case "next":
      return p.nextStep ? p.nextStep.day.day : sortDir === "asc" ? "~" : "";
```

In `words.ts`'s `PL_SORTED_BY`: `next: "next step",`.

- [x] **Step 3: Run the tests to see them pass**

Run: `node tooling/scripts/checks/test.mjs tooling/scripts/tests/people/people-honest.test.mjs tooling/scripts/tests/consent/consent-door.test.mjs tooling/scripts/tests/calendar/calendar-people.test.mjs tooling/scripts/tests/people/people-table.test.mjs tooling/scripts/tests/deals/pipeline.test.mjs`
Expected: PASS. (`calendar-people` presses the acts by their test ids; the kit `Button` keeps `onClick` and `data-testid`.)

- [x] **Step 4: Typecheck and lint**

Run: `corepack pnpm --filter @chanlytics/dashboard typecheck` and `corepack pnpm lint`
Expected: clean; the lint's warning count at or under its baseline.

- [x] **Step 5: Commit**

```bash
git add apps/dashboard/src/surfaces/people tooling/scripts/tests e2e/people/people.spec.ts
git commit -m "People's cells on the kit: Reach in words, the receptionist's standing pill off by default, Offers toned, a Next step column, the row's acts the kit's"
```

### Task 4: The rules: Classic's cells leave, the new lines arrive

**Files:**
- Modify: `apps/dashboard/src/legacy/styles/clients.css` (CRLF; the Edit tool)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (`clients.css?v=64` → `?v=65`)

- [x] **Step 1: Delete the old cells' rules**

Delete whole: `.cl-row-agent { … }`, `.cl-row-agent .live-dot`, `.cl-row-agent.approval`, `.cl-row-agent.escalated`, `.cl-row-agent .agent-avatar { … }`, `.cl-row-agent-verb { … }`, `.cl-row-channels { … }`, `.cl-row-channel-primary { … }` (lines 903–936); `.cl-row-offers { font-size: 11.5px; }` and its `.yes/.no/.unasked` lines (1936–1939); `.cl-row-act { … }`, `.cl-row-act:hover { … }` (1944–1945); `.cl-row-act-drop:hover { … }` (2233); `.cl-row-reach { … }` and `.cl-row-reach .tabular` (2215–2216).

- [x] **Step 2: Write the new lines, with tokens only**

In the table section (after `.cl-row-fullname`), replacing the deleted Reach rule's place:

```css
/* Reach (8 Oct 2026): the wire a reply goes on over the one identifier, in words (contracts rowReachWords); a constraint on a
   reply under them only where there is one. Two quiet lines, as the State's and the name's are. */
.cl-row-reach { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: var(--text-sm); color: var(--ink-muted); white-space: nowrap; }
.cl-row-reach-id { font-size: var(--text-xs); color: var(--ink-dim); }
.cl-row-reach-id.tabular { font-variant-numeric: tabular-nums; }
.cl-row-reach-may { font-size: var(--text-xs); color: var(--ink-dim); }
/* The next step (0007): the words, then the day as a chip says it; the day in the warn ink once it has come. */
.cl-row-next { display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; max-width: 22ch; }
.cl-row-next-words { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink); font-size: var(--text-sm); }
.cl-row-next-when { flex: none; font-size: var(--text-xs); color: var(--ink-dim); white-space: nowrap; }
.cl-next-cell[data-due]:not([data-due="ahead"]) .cl-row-next-when { color: var(--warn-ink); font-weight: var(--weight-medium); }
/* The last contact: when, over who, so the column the table is sorted by reads by its time. */
.cl-row-last { display: flex; flex-direction: column; gap: 2px; white-space: nowrap; }
.cl-row-last-by { font-size: var(--text-xs); color: var(--ink-dim); }
/* Name them takes no room until a pointer or the keyboard reaches it: hidden at opacity 0 it still widened the Person column. */
.cl-row-name-them { max-width: 0; overflow: hidden; }
.cl-table tbody tr:hover .cl-row-name-them, .cl-table tbody tr.focused .cl-row-name-them, .cl-row-name-them:focus-visible { max-width: none; }
```

Bump the stylesheet: `clients.css?v=65`.

- [x] **Step 3: The measures bank the fall**

Run: `UPDATE_BASELINES=1 node tooling/scripts/checks/test.mjs tooling/scripts/tests/styles/style-values.test.mjs tooling/scripts/tests/styles/kit-primitives.test.mjs tooling/scripts/tests/repo/debt-register.test.mjs` (the exact test files: `ls tooling/scripts/tests/styles tooling/scripts/tests/repo | grep -E "style-values|kit-primitives|debt-register"`).
Expected: the clients.css counts fall (the literal 11.5px/12px/9px sizes and the `agent-avatar` selector are gone), nothing rises. `git diff --stat tooling/scripts/tests/baselines docs/debt.md docs/takeover.md` shows the banked numbers.

- [x] **Step 4: Commit**

```bash
git add apps/dashboard/src/legacy/styles/clients.css apps/dashboard/src/legacy/Chanlytics.html tooling/scripts/tests/baselines docs/debt.md docs/takeover.md
git commit -m "Classic's People cells leave the stylesheet; the new lines read tokens"
```

### Task 5: Look at it, and bank the width

**Files:**
- Run: the dev server (`bookings-app` in the session-root launch.json runs `cm-audit` on port 3301; sign in through `people-signin` on `:3396` pointed at 3301, or the pane's existing localhost cookie) — reads only in Ruben's workspace; never toggle a column there (it writes the member's view).
- Modify: `tooling/scripts/tests/baselines/bundle-budget.json` through `corepack pnpm check:bundle -- --update` after `corepack pnpm --filter @chanlytics/dashboard build`, or a raise with a "Rises" row in `docs/debt.md`.

- [x] **Step 1: Measure at 1440×900 with the sidebar open**

In the pane's `javascript_tool`: `const s=document.querySelector('.pl-table-scroll'); [s.clientWidth, s.scrollWidth]`.
Expected: `scrollWidth <= clientWidth` without a calendar (Ruben's workspace). If it is over, narrow `.cl-row-next { max-width }` to 18ch and `.cl-row-words` (Glass block) to 22ch, in that order, and measure again.

- [x] **Step 2: Shots for the PR**

A screenshot at 1440 (dark) of the table at rest and with a row hovered (the acts as the kit's quiet buttons), and the Columns menu open.

- [x] **Step 3: Build and bank the bundle**

Run: `corepack pnpm --filter "./packages/*" build`, then `corepack pnpm --filter @chanlytics/dashboard build`, then `corepack pnpm check:bundle`.
Expected: the CSS falls (bank with `-- --update`); the route JS within its 512 B allowance, else `check:bundle -- --raise js=<bytes>` with a Rises row in `docs/debt.md` naming the column and the kit button. Rebuild contracts' dist after Prettier (`corepack pnpm format`), keep only `packages/contracts/dist`'s real diff, `git checkout -- packages/{core,db,jobs,channels}/dist`.

- [x] **Step 4: Docs**

`apps/dashboard/src/legacy/CLAUDE.md`, the People paragraph: one sentence after the parity pass's: "An 8 October 2026 pass draws the cells in the kit's shapes: Reach is the wire over the identifier in words (contracts `rowReachWords`), the receptionist's standing the kit's pill and off by default, Offers the consent pill, the next step a column after State, the last contact's time over its speaker, and the row's acts the kit's quiet buttons."

- [x] **Step 5: The whole check line, then commit**

Run: `corepack pnpm -r typecheck`, `corepack pnpm lint`, `node tooling/scripts/checks/changed-tests.mjs origin/main HEAD`, `corepack pnpm check:dead-exports`, `corepack pnpm format:check`.
Expected: all green. Commit:

```bash
git add -A
git commit -m "Bank the width and the bundle; the docs say the pass"
```

## Self-review

- Spec coverage: Reach in words (T1, T3, T4); Receptionist as the standing pill, off by default (T3); Offers toned with the unsent yes said (T3); Next step column, sortable, soonest first (T3, T4); the row's acts on the kit with the send glyph and the house tip (T3, T4); the width (T4 "Name them", T5). The last contact's two lines (T2, T3, T4) are the width's means, said in the PR.
- Pins moved: `people-honest` headings/menu/receptionist/reach, `consent-door` offers reader, `e2e/people.spec` headers. Unchanged on purpose: `calendar-people` acts (same test ids and `onClick`), `row-offers` innerTexts (the pill's word).
- Types: `rowReachWords(p, named)` returns `{ wire, id, may, tip }`; `PersonLastContact.by/when`; `StatePill` props `kind, value, label, className, testid`.

## As built, after the review (8 Oct 2026)

One review round over the whole branch, before the merge. What it changed from the tasks as written:

- **The wire is the one they last wrote on** (Task 1). `rowReachWords` took the row's `replyVia`, which reads WhatsApp for anyone who has written and is not email-only (the strictest window, so a button never offers free text it cannot send). Said as a word, that called a person who only ever texted "WhatsApp" and held them to "Approved messages only". It reads `lastChannel` now (00320), then the first wire they have written on, then the phone; only WhatsApp's wire reads the window. The row's own `replyVia` and its booking-link button still read the conservative wire: a follow-up of its own.
- **The next step sorts soonest first on its first press** (Task 3). The page's sort handler started `next` ascending on the Pipeline alone, so People's first press was the latest step first; the test had one person with a step and could not see it. It has three people now and reads both presses.
- **The next step is two lines**, its words over its day in words ("Due today", "Overdue since Mon"), as the cells beside it are: a day that has come is said, never shown by the warn ink alone, and the column is narrower (18ch) than the words and the day side by side.
- **A no to offers is plain** (Task 3 had the consent pill's amber). Amber says Needs you on every badge (`tone.ts`), and a no asks nothing of the owner; the answer's tone is `words.ts`'s, drawn through the kit's `tone` kind. A yes that cannot be sent says why in contracts' `heldWords`, not in a sentence of the page's own.
- **Two rules went back into the stylesheet** (Task 4): `.cl-row-channels` and `.cl-row-channel-primary`, which the demo's Lists page still draws.
- **Name them keeps its room** (Task 4 collapsed it to no width until hover). In a tight table the Person column grew under the pointer as the button opened, and every column beside it moved.
- **The width, as measured** (Task 5), at 1440 by 900 with the sidebar open, in the e2e workspace: the table fits its pane with no step on any row (0 over), and is 6 over where rows are named by their number, which keeps Name them's room (main was 87 over in such a workspace of five). With a step on every row it is 56 wider than the pane, 83 with a row named by its number as well, and it scrolls in its own box with Person pinned, as it did before. A window wider than that fits all of it.
- **WhatsApp's window is the tip's, never a line** (Task 1 put "Approved messages only" under the identifier while the window was shut). Shut is the ordinary state of a WhatsApp thread, a day after they last wrote, so the line stood on nearly every row of a real workspace, made each of them a third line tall and widened the column by about 25px; the e2e workspace's one WhatsApp person had written that morning, so it never showed. The cell's line is for an address that stopped accepting mail alone; what a reply may be, open or shut, is the cell's tip.
- **A long address is cut** (Task 4 left the identifier uncapped). An address of thirty-four characters made the Reach column 220px and the table 86 wider than its pane; main had the same for someone with an address and no number, and this cell says the address more often (whenever their last message was an email). An address ends in an ellipsis at 18ch (column 139, 6 over) and rides whole in the cell's tip; a number is never cut (`.cl-row-reach-id:not(.tabular)`).
- **Two classes that already meant something** (Tasks 3 and 4), each found by drawing a state the e2e workspace does not have, never by a test. The Offers word wore the bare class of its answer, and `app/globals.css` styles `.yes` (the public consent page's column, 7vh over it and 10vh under): on main's inline span that moved nothing, on the kit's pill, a flex box, every row whose answer was yes stood about 190px tall. The answer's class is gone; nothing read it. And the step's box was `cl-row-next`, which is the next visit's day in the Visits cell: one rule of that name drew both, and the visit's day broke onto its own line wherever a calendar is connected. The step's classes are `cl-row-step*` and its cell `cl-step-cell`. A new class name is grepped against the tree and against `app/globals.css` before it is used.
- **A test the pull request could not see.** `tooling/scripts/tests/consent/marketing-consent.test.mjs` read the Offers word as the old span's child. CI on a pull request runs the tests of the folders it changed, and that folder was not one: the pull request was green three times and the nightly would have gone red. It reads the pill's label. Found by running every test file, in every folder, that names anything this branch changed (48 files, 1,287 tests).
- **Light theme**, looked at after the first review pass: every new line reads at 4.9:1 or better on the pane.
- Main moved under the branch (#1491): merged, the register's numbers regenerated from the merged tree.
