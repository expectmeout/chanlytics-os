# Today on a phone: the build

The spec is `docs/superpowers/specs/2026-10-28-today-on-a-phone-design.md` (canvas "Today on a phone, redesigned",
design version 4). Written against `dca230386`, built on `design/today-phone` in the `cm-today-phone` worktree, all of
it on one local branch, one pull request at the end. No commit or push until Ruben's word; no lint, typecheck or test
run until the last task.

Each task names its files, what it does and how it is proven. The order is the order of dependence: contracts and the
server first, the shared pieces, then the page part by part, then the composition, then the proof.

## 1. contracts

Files: `packages/contracts/src/today/today-bands.ts`, `packages/contracts/src/today/today-day.ts`,
`packages/contracts/src/need-you/need-you-words.ts`, `packages/contracts/src/today/index.ts`,
`apps/dashboard/src/surfaces/today/helpers.ts`.

1. `todayPhoneHead(standing, runs): { title: string; line: string | null }` beside `standingWithRuns`, over the same
   ladder: the alert; the needs rung (the headline without its stop, the detail, then `runsWaitingSentence(runs)` when
   runs wait); the calm rung with something waiting (its first sentence as the title, never "Nothing needs you" over
   it); the calm rung with nothing ("Nothing needs you", and the traffic as the line).
2. The day's spans: `TodayDayItemVM.at: { from: number; to: number }` (minutes since midnight on the business's clock,
   from the calendar block's own times) and `TodayDayFrameVM.hours: { from: number; to: number } | null` (the open
   hours that day, else the first start and the last end). Every reader of the two types keeps compiling: the fields are
   added, nothing is renamed.
3. `todayDayBar(frame, nowMin)`: each visit's share of the day and its phase, the gaps between them, and now's share;
   `todayDayNote(frame, nextOpening, word)`: "Closed today · note", "Fully booked · next opening Thu 10:00", "5 visits ·
   open at 2:30".
4. `NEED_YOU_WORDS` gains the sheet's words: the pager ("Need you · 2 of 4"), Read, the end ("That's everyone",
   "Nobody is waiting on you now.", "Back to Today", "2 to-dos left"), the quick asks ("Shorter", "Warmer", "Ask for a
   day") and the field's label; the day's ("2 more visits", "an email sends at 6:00", "Calendar"); To do's and Ask
   found's titles; the end line ("That's everything for today."). One set, read by the page and the tests.
5. `TODAY_HELPERS` exports `phoneHead`, `dayBar`, `dayNote`.

Proven by `tooling/scripts/tests/today/today-phone-head.test.mjs` (each rung, the S7-1 cases: a run, a search, a
closing window, nothing) and `tooling/scripts/tests/today/today-day-bar.test.mjs` (closed, fully booked, open, a visit
under way, before opening, an all-day entry that takes no span).

## 2. The draft door takes an instruction

Files: `apps/dashboard/app/api/v1/conversations/[id]/draft/route.ts`, the draft writer it calls
(`apps/dashboard/src/server/conversations/drafts.ts` `draftForThread`), `tooling/scripts/tests/route-policy.json` if
the input's pin changes,
`docs/api.md` (`corepack pnpm gen:api-reference`), the typed client (`node tooling/scripts/gen/route-types.mjs`).

`{ kind: "reply" | "brief", instruction?: string }`, the instruction at most 280 characters, handed to the writer as
the member's steer on the draft it writes again; the drafts store's entry is replaced with the new one
(`need-you/drafts.ts` gains `rewriteDraft(want, instruction)`). The held reply keeps its `steer` verb.

Proven by the route's test beside the drafts' own (an instruction reaches the writer; one over 280 is refused at the
input), and the drafts store's test (the new draft replaces the old for the same want).

## 3. Shared pieces

1. `apps/dashboard/src/surfaces/today/pages/listen.tsx`: `useSpeech`, `listenButton`, `spokenLength`, moved out of
   `brief-pane.tsx` as they are; the pane imports them. Nothing it does changes.
2. A phone hook, `usePhone()`, subscribed to `--bp-phone` (720px, tokens.css; the frame's head turns at `--bp-narrow`,
   900px, and stays as it is), read before the first draw; `today-head.tsx`'s `todayOnPhone` reads it too.
3. `queue-coral.ts`: To do's turn. Need you says whether it holds the coral (as now); To do takes it only when Need you
   does not, and says so; setup hears both.
4. `AttnRow` (`kit/attention/attn-row.tsx`) gains `wait?: string`, drawn after the name; the phone block of the page's
   CSS shows it, in the amber ink from an hour up (the row's own `when`, never a measure made on the page). Its gallery
   entry draws a row with one.
5. `Acts` (`need-you/parts.tsx`) draws into a sheet's foot when one is provided (`SheetFoot` context), in place
   everywhere else.
6. The kit's Meter gains a mark (`mark?: number`, a share): the day bar's now. Its variant in `kit.css`, its class in
   `classes.json`, its gallery entry, its type test beside it.
7. `useAwayGroups()` out of `away.tsx`: the bell's unread rows grouped, deduped against the queue as now; `TodayAway`
   reads it unchanged.

## 4. The head and the warnings

Files: `pages/today-head.tsx`, a new `phone/head.tsx`, a new `phone/warnings.tsx`.

- On a phone `useTodayStanding` says `{ title: null }`; `TodayPhoneHead` draws the greeting with Listen at its right,
  the title and the line from `TODAY_HELPERS.phoneHead(standingWithRuns(...), runs)`, the title an `h1` the list is
  labelled by. On a desk nothing changes.
- `PhoneWarnings`: the alert (`TodayAlert`), a recap sentence with `warn` and its "See the thread", a warning group of
  `useAwayGroups()` with its door. Nothing when there is none.

## 5. Need you on a phone

Files: `pages/queue.tsx`, `need-you/people-rows.tsx`, `need-you/rows.tsx`, `need-you/parts.tsx` (Words' Read),
`need-you/need-you.css`.

- `TodayQueue` on a phone: no head; Ask's line; the rows without steps, visits, ideas or reviews (steps and visits are
  handed to To do through one derivation both read, so the cut and the coral stay one rule); the runs.
- `needYouRows` on a phone: the first open row that works in place is the card, its words clamped to two lines with
  Read at the panel's head; every other open row short, its press opening the sheet on it; kept rows with their receipt
  as now. On a desk, `SHORT_FROM` 2 as now.
- The row's body on a phone opens the sheet on it (the sheet holds the door to the thread); on a desk it opens the
  thread as now.

## 6. The sheet

Files: a new `need-you/walk-sheet.tsx`, its words in contracts (task 1.4).

- The kit's Sheet, record shape, phone only, open state held by `TodayQueue` (`walk: { at: rowId } | null`).
- Its steps are the drawn rows in order; across with `touchSwipe` onLeft/onRight (the lead sheet's walk,
  `leads/sheet/sheet.tsx`, is the example);
  the pager and its dots in the head; who, how they came and the wait; their words; the row's `workOf` with the same
  props, its `Acts` in the sheet's foot.
- A row in view kept: after a beat the next open row; the one before as a line at the top while it counts down, with
  Undo.
- The end: "That's everyone", every row kept this visit with its receipt and undo, "Back to Today", and "2 to-dos left"
  when To do holds rows (closes the sheet and scrolls To do into view).
- Change with Ask on a reply draft: the quick asks as chips and the field, `rewriteDraft` (task 2); a held reply keeps
  its own Change it with Ask.
- Single mode for Ask found: opened on one review or one idea, no pager, `ReviewWork` or `IdeaWork`.

## 7. The day card

Files: a new `phone/day.tsx`; `pages/going-today.tsx` (its row and its Stop shared: `GoingRow`'s confirm and
`stopRun` exported for the day's rest); `pages/card.tsx` (`RunsDone`'s facts shared for the runs that went out).

- On a phone it replaces `TodayStrip` (which stays the desk's) and `TodayGoing` (which stays the desk's).
- The date and `dayNote`; Now or Next and the one after; the Meter of `dayBar` with now's mark; the one line for the
  rest, a button that opens the rest in place: later visits, Going today's sends with Stop and the same Confirm, the
  runs that went out today, then the Calendar's door.
- Opened by itself when Need you and To do are empty.

## 8. To do

Files: a new `phone/to-do.tsx`.

The steps due and visits to mark the queue handed over, under "To do" and their count, as compact rows with
`StepWork` and `VisitWork` (their presses at the right on a phone), their caps and rows for the rest as contracts give
them, the coral by task 3.3.

## 9. Ask found

Files: a new `phone/ask-found.tsx`; `pages/queue.tsx` (`useExtras` moved out so both read it); `pages/leaks.tsx` (its
rows drawn as cards on a phone).

A rail across of the ideas, the reviews to answer and Worth a look's rows, as Panels, snapped; each card's tag, one
sentence, what Ask prepared, Not today where the kind has one, and its door (Reply, See it: the sheet's single mode;
a leak's own door and Ask why). On a desk, `useExtras` feeds Need you as now and Worth a look stands as now.

## 10. The rest, the order and the styles

Files: `pages/pins.tsx`, `pages/setup-card-body.tsx`, a new `phone/end.tsx`, `pages/today-page.tsx`,
`legacy/styles/dashboard-a-v2.css` (its 720px block; nothing new in `legacy/` but these rules, which the page's styles
already hold).

- Pins as the kit's chips in one row that scrolls; setup as one row (title, how far, its segments, the next step,
  Continue when it holds the coral); the end line.
- `DashboardA` on a phone: the two orders of the spec (§9), from `usePhone()`; on a desk the tree is the one it is now.
- The phone block: the head's sizes, the card and short rows, the day card, the rail, the chips, the end; every value
  a token.

## 11. Tests

- `tooling/scripts/tests/today/today-page.test.mjs` (the 720px query stubbed): the phone's two orders; Need you without
  steps, visits, ideas or reviews; To do with them; the coral passing Need you → To do → setup; one card and the rest
  short; the desk's tree as it was (its existing cases unchanged).
- `tooling/scripts/tests/today/walk-sheet.test.mjs`: opens on the row pressed; across; on after a send with the one
  before counting down; the end's receipts and their undo.
- `tooling/scripts/tests/styles/today-head.test.mjs`: the phone head's greeting, title and line.
- `e2e/today/today-phone.spec.ts`, at an iPhone's size in WebKit, in the suite's own workspace: the head's words, the
  list under it, a send and its Undo from the sheet, the day's rest opened, Ask found's rail.

## 12. Docs

- The decision note at the next free number when it lands (0076 at `dca230386`): the nine calls of the spec, written
  against the commit it lands on; its row in `docs/decisions/README.md`; 0071's row says phones draw its extras under
  Ask found.
- The spec's status line: built, with the pull request.

## 13. Proof, then the push

1. Run the app (`corepack pnpm --filter @chanlytics/dashboard dev`) and look at Today at 390px in WebKit, light and
   dark, on a busy workspace and a calm one; the sheet walked end to end; the day's rest opened; nothing under the tab
   bar but the end.
2. The checks, once: the tests of the folders touched, one file per command; then `corepack pnpm check:local` on the
   committed branch (lint, hygiene, typecheck, the changed tests); the bundle and the route's CSS against their lines
   (a `Bundle:` line if it grows past them, with why); `check:debt` (a `Debt:` line only if a number rises, with why).
3. One review round over the whole diff.
4. Ask Ruben for the push; then `node tooling/scripts/land.mjs` with the title and body (what changes for an owner on a
   phone, nothing to set, either deploy order).
