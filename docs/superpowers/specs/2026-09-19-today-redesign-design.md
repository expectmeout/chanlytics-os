# Today redesign: design spec

**Date:** 19 Sep 2026 · **Owner:** Ruben · **Status:** approved (design review, 19 Sep) · **Plan:** `docs/superpowers/plans/2026-09-19-today-redesign.md`
**Analysis:** 82 agents read the page nine ways (structure, data, test pins, desktop, phone, repetition, charts, the owner's job, the live workspace); 71 findings survived a skeptic who re-checked each one against its own evidence, 1 did not. Every claim below carries the file, line or measurement it came from.

## 1. Goal

Make the page called Today about today.

The work still comes first and does not move: #556's rule (the queue under one quiet line, nothing above it) held for a year and holds here. What changes is everything under it. Today's own day is currently the quietest thing on the page — one 13.5px sentence under a 9.5px tag — while the six largest numbers (21px) count the last seven days, and four families of numbers are printed twice inside a single card. On this workspace the seven-day card cannot even fill six tiles honestly: 25 customer messages in 30 days, over 13 days, busiest day 3.

So: the queue, then a card whose subject is the day and nothing else, then what is left over. The period becomes one sentence and a door to Reports, which was rebuilt on 19 September to carry exactly that material.

## 2. Decisions taken in brainstorming

| # | Decision | Why |
|---|---|---|
| D1 | Today answers "what needs me now" and "how did today go". The last seven days become one sentence with a door to Reports. | The page's name is Today. Ruben: "Give the day its card". |
| D2 | The five things the page gets wrong ship first, as their own PR, before any redesign. | They misinform an owner now. Ruben: "Now, as their own PR". |
| D3 | "Where people are" folds into "Worth a look"; People owns the journey. | Its one useful fact ("7 said yes to messages, 0 can receive an offer") is already a Worth a look rule, and its rows repeat People's own counts. Ruben's choice. |
| D4 | No charts on Today. Sentences and rows only. | 25 customer messages in 30 days. A chart of three numbers is ornament; Reports owns the shapes. Ruben's choice. |
| D5 | Build a `today-sample` so the standalone mockup draws the real page. | At `#/today` the mockup still draws the page #556 deleted: a greeting, an arc gauge, three stat cards, an invented live call, an 8-agent fleet. Reports could be designed against itself; Today cannot. Ruben's choice. |
| D6 | The day's schedule stays beside the queue, capped, rather than folding into the day's card. | The glance value (who is coming, the now marker, the red flag on a person whose thread needs someone) belongs next to the work. |

## 3. Principles the page holds

- **The work first.** On a phone nothing sits above the first thing that needs a person except the standing line. Measured today: the first actionable element is 97px down. That number may not grow.
- **Each number once.** Six numbers are printed twice on the page today; each is deleted at exactly one site (section 4.8).
- **Every sentence that contains a number lives in the view model.** Today writes seven of them in the page (`dashboard-a-brief.jsx:174`, `:32`; `dashboard-a-command.jsx:82`, `:97`, `:108`, `:124`, `:152`, `:159`, `:194`). The rule is stated in `today.ts:6-11` and was enforced next door on Reports.
- **A borrowed read that fails says so.** Four of the five regions below the queue vanish without a word when Calendar, Reports or People fails; "Worth a look" disappearing reads as "nothing is worth a look".
- **No congratulation state, no invented number, no delta on a small count.** All three restraints survive.
- **Coral marks live state only.** Seven accent-coloured elements are on the page and none of them is live (`tokens.css:102-103` says the token is for live state and never decorative).

## 4. The page

### 4.1 Layout (desktop, 12 columns, 12px gaps, the column left-aligned at `--measure-wide`, `--gutter-page` sides)

```
[ standing line: day · clock · which lines are listening · a red sentence when one is down ]

[ Your queue (8)                                  ][ The day (4): next open time, 5 rows, Open Calendar ]

[ Today (12): the day's own numbers, the proof, what is not a number, one line for the last 7 days ]

[ Worth a look (7): at most two problems, arithmetic under each ][ While you were away (5) ]
```

Below 1180px each row becomes one column in the same order. On a phone (760px and below) everything stacks; the order is the order above; the standing line stays one line; the day's schedule follows the queue.

The page's side gutter becomes the house token (`--gutter-page`, 28px) instead of the hard-coded 32px, so switching tabs stops moving the left edge by 4px.

### 4.2 The standing line

Unchanged in shape: the day and clock the business keeps, then which lines are listening, then a red sentence when one is down. Two corrections, both from the bug PR (section 7): the count sees every wire a message can arrive on (email is live since 18 September and is not counted today), and every channel is named in words (an SMS line currently reads "sms", its database value).

The pulsing dot stops being coral. Accent is reserved for a call that is happening; a healthy line is a quiet dot, and a line that is down is red including its ring (today the ring is a pseudo-element hard-coded to accent, so a dead line animates in the live colour).

### 4.3 Your queue

Unchanged. The rows keep #659's two-line ceiling and the customer's own sentence. Two fixes ride along:

- The state line (the line an owner decides from) may wrap on a phone rather than truncate. At 390px the box is 286px and a three-segment status measures 427-460px, and truncation eats from the right, so what disappears is the deadline.
- One primary button per card. Five solid coral buttons currently stack down the queue; the first row keeps the solid verb and the rest are quiet.

### 4.4 The day's schedule (beside the queue)

Capped at five rows with an "Open Calendar" tail, and the two columns stop sharing a row height. Today the rail has no cap and grows 47px per appointment (66px when flagged): 561px at four appointments, 843px at ten, against a full queue's 430px, which leaves 258px of empty floor under the queue at 1440 (495px on a calm day).

### 4.5 Today (the new card)

The card the page is named after, at the scale the seven-day tiles have now.

- **The day's own numbers**: four figures in one row, each 22px in proportional figures with its word beneath, in this order: customer messages, answered by the receptionist, calls, anyone new. A figure whose count is zero is drawn as 0 only while the day has traffic; on a day with nothing at all the row does not render (see the quiet day below). All of it comes from fields Today already fetches on every load and has never read (`today.ts:38-69`: `period.new_contacts`, `period.call_sentiments`, `period.calls_voicemail`, `period.escalation_reasons`, `period.messages_out_ai`).
- **Each figure carries its own receipt.** Under every figure, one clause that is always there, in 12px dim: "last at 4:52 PM, answered in 41s" under the messages, "typically in 34s, 2 handed over" under the answered, "1 to voicemail" under the calls, "both on WhatsApp" under the new. Behind the figure, on hover, focus or tap, the why and one door: "Handed over twice: once because a customer asked for a person, once for a photo it can't read. The rest it answered itself. See the handovers". On a desktop it is a popover anchored under the figure; on a phone it is a panel that opens under the row of figures. A receipt adds to its figure and never repeats its number or its clause, so nothing on the card is said twice and nothing lives only behind a hover. This replaces the sentence that sat under the figures (four facts in one paragraph, the same facts the figures were about) and the "listening" line, which said what the standing line already says.
- **The proof, always.** When the last message arrived and how long the receptionist took to answer it rides the customer-messages figure as its clause. Today this proof is gated on the queue being empty as well as the day being quiet, so on this workspace (no traffic, three or four open escalations) it is suppressed exactly when an owner needs it. Which lines are listening is the standing line's to say, once.
- **What is not a number**, as today: a reply that failed to deliver with its door, what Setup still wants, a review that landed, what ran, what was sent.
- **One line for the last seven days** at the foot, with a door to Reports: the messages, the share the receptionist answered and its median reply. It replaces the three-way control and the six tiles.
- **A quiet day** is "No customer has written yet today." and the proof as a line (there is no figure to hang it on), and that one line. There is no congratulation and nothing invented to fill the space.

### 4.6 Worth a look

Unchanged in spirit: at most two problems, in a fixed order, each one sentence with its arithmetic printed underneath, and the whole card absent when nothing qualifies. Four changes:

- It absorbs the reach fact from "Where people are": "7 said yes to messages, 0 can receive an offer", with its door to People.
- It says when it dropped a third problem ("and 1 more"), instead of silently showing two of three.
- The unanswered row names who was ignored, up to two people, and opens them. The identity is returned by the query today and discarded one layer up (`today.ts`), so only the count survives.
- Severity stops being carried by colour alone: each row's tone rides with a word or an icon (today it is a 3px bar hidden from assistive tech, and under forced colours all three rows look identical).
- Each row gains an Ask door beside its own ("Ask why"), which opens Ask with the row's facts as the prompt through the shell's `askAbout`. Ask already grounds every citation in what it read, so "why did 17 people never book" is answered from the people themselves, not composed.

The rows stay deterministic: rules with floors, the arithmetic printed under each sentence, tested on fixtures. A model does not write them. Every sentence on this page is checked by `the-pages-say-only-what-is-true`, and a generated sentence is a new way to be untrue that no test can pin; the analysis that produced this spec found the page's problem was exactly untrue sentences. A generated read of the week ("This week, read for you": one cached paragraph a day per workspace, every number in it required to appear in the fact list it was given, else the deterministic sentence stands) is a follow-on to decide after the redesign ships, not part of it (section 12).

### 4.7 While you were away

Grouped as today, with three corrections: the dedupe covers all four row kinds (it covers two now, so a conversation shown as a closing reply window prints again, and call rows can never be covered); the footer counts what the bell actually still holds, so the head and the foot add up and the sentence about the bell is true; and when the card is empty only because every unread row is already in the queue above, it says so instead of "All caught up." beside a badge of four.

### 4.8 What leaves, and where each repeated number is deleted

| Leaves | Where it lives afterwards |
|---|---|
| The "How it's going" card, its header and its three-way control | The day's card (4.5) and the period line at its foot |
| The six seven-day tiles and the "What stopped it" chip row | Reports, one door away. Today is the last place in the product with 9px mono uppercase tile labels, for numbers drawn at 12.5px sentence case one click away |
| The "Where people are" card | People, with its one live fact kept as a Worth a look row (4.6) |
| The next open time, printed twice (`dashboard-a-day.jsx:38` and `today.ts:971`) | The day's schedule header keeps it; the recap sentence drops it |
| "3 booked" and "3 appointments today" (`today.ts:948` and `:984`) | The schedule keeps it |
| The queue's badge, always the sum of the line beside it | The sub-line keeps it; the badge goes |
| The unanswered count and its three companions, printed in Worth a look and again in the next card's tiles | Worth a look keeps them |
| "The lines are connected", said three times in three fonts plus a fourth in the queue's empty state | The standing line keeps it, once |
| The sentence under the figures ("Typically answered in 34s. The receptionist sent 11 messages and handed over twice ... 1 call went to voicemail.") | Each fact becomes the clause under the figure it explains; the why lives in that figure's receipt |
| "Asked, never booked 17" in Worth a look and again in Where people are | Worth a look keeps it |

## 5. Copy and colour

- Sentences with numbers come from contracts. Two of the seven the page writes today are pure relocations (the words already exist in the view model); the rest need an input the view model has never had, so contracts exports a pure helper the page calls with the runs it holds (`todayRunsLine(runs)`), rather than the page composing the words.
- Two sentences say WhatsApp over a count that spans every channel (`today.ts:563`, `ask/tools.ts:94`); both name the channel only when the count is one channel's.
- Coral: the queue count in ink, one solid verb per card, the standing dot quiet unless a call is live.
- No em dashes in new UI strings; sentence case; each number once. A figure's receipt adds to the figure: it never repeats the figure's number or its clause.

## 6. Data (contracts, `packages/contracts/src/today.ts`)

- `todayDay(metrics, calls, ...)`: the day's four figures, each `{ id, label, value, meta, receipt }` where `meta` is the clause always drawn under it and `receipt` is `{ text, door: { label, to } } | null`, reading the five fields already fetched and never read. Returns nulls, never zeros dressed as facts, when the day has nothing; a figure with nothing to add has no receipt and is not a button.
- `todayProof(...)`: when the last message arrived and how long the answer took. Always returned, not gated on the queue; on a day with traffic it is the messages figure's `meta`, on a quiet day the card's line.
- `todayPeriodLine(reports)`: the seven days in one sentence, from the same numbers Reports draws, using its own words (`vm.lines`, `compareWords`).
- `todayLeaks(...)`: gains the reach rule, a `more` count, the unanswered row's people, a tone carried by a word, and each row's `ask` prompt (the row's sentence and arithmetic, for `askAbout`).
- `todayAwayGrouped(...)`: dedupe over all four row kinds through `conversationOfNeedsKey` and the call rows' own key; `more` counts the bell's remainder; a distinct empty state for "all of it is in your queue".
- `todayRunsLine(runs)`: the playbook-run sentences the page writes today.
- Removed: `standing.greeting`, `pulse`, the top-level `launchpad` and `updatedAt` (no reader anywhere), and the two stale comments describing the hero #556 deleted.
- No migration and no new read: every field above is already in the payloads Today fetches on each load, including the unanswered conversations' identities, which the query returns per row and the view model currently discards.
- Kept because Ask reads them and nothing else does: `standing.headline`, `standing.detail`, `standing.tone`, `needsYou`, `windowClosing`, `recap.facts`, `calls.line`, `calls.rows`, `quiet.headline`. The duplicated escalation derivation (`today.ts:349-372` and `:691-724`, which disagree on a callback row) becomes one.

## 7. What ships first: the five wrong things (their own PR)

1. A failed campaigns read replaces the whole page with an error pane, and the broken snapshot is cached, so a reload lands on it again (`today.ts:1058` dereferences `r.campaigns.tiles`; Reports publishes null on failure).
2. "While you were away" and the bell count the same feed and disagree by the size of the queue; the footer states a number about the bell that is false.
3. "6 jobs did not finish" includes two successful broadcast sends, in warning amber (`apps/edge/lib/job-alert.ts:30` hard-codes `job_failed`).
4. "2 of 2 lines connected" cannot see email and calls SMS by its database name.
5. Ask is handed the reply-window rows as "drafts about to send", the opposite of what they mean (`ask/tools.ts:267`).

## 8. Accessibility

The queue's state line wraps rather than truncates on a phone. Every touch target keeps the shell's 44px floor. Severity carries a word or an icon, never colour alone. The day's card is a `section` with its own heading. Focus rings on every control. Reduced motion stops the standing dot's pulse. A figure with a receipt is a `button` with `aria-expanded` and `aria-controls` naming the receipt; hover shows it, Enter or Space toggles it, Escape closes it, and a tap toggles it on touch. The clause under the figure is always drawn, so nothing an owner needs lives only behind a hover.

## 9. Testing

- **Contracts:** every new helper and every branch of every sentence, on fixtures that copy the real payload shape; and one test over every figure that its receipt repeats neither its number nor its clause.
- **Page:** the three bands drawn from a view model on the shared stub React (`_legacy-react.mjs`, which the Reports work added), including the quiet day, a failed borrowed read for each of the five, the empty-because-queued away card, a figure's receipt opened and closed, and the phone's wrapping state line.
- **The pins move, they do not multiply.** Thirty-two places read Today's files as raw text and a ratchet forbids a thirty-third anywhere in the repo; a new test file gets a budget of zero, so the new tests read no source at all, the existing reads move with the code they pin, and the baseline is re-banked in the same PR. Eighteen exact CSS strings are pinned (including a grid template and a two-line media block whose newline and indent are part of the match), the card order is pinned as substring positions, and four unrelated suites use `today-standing` as their signed-in signal: that test id survives.
- **e2e:** `e2e/today.spec.ts` rewritten; `e2e/signals.ts` updated; the twelve specs that navigate to the route checked.
- **Look:** the mockup at 1440, 1180 and 390, light and dark, against the `today-sample`.

## 10. The mockup's sample

`legacy-bridge/today-sample.ts`, built the way `reports-sample.ts` was: a sample workspace through the same view models, served as `data/today-sample.js` by `tooling/scripts/serve-legacy.mjs` and loaded by `Chanlytics.html`. It publishes what the page reads, so the mockup draws the real Today instead of the one deleted in September.

## 11. Rollout

1. **The five wrong things** (section 7), on their own, first.
2. **Data PR:** the contracts helpers, the bridge's reads, the dead fields removed, the sample.
3. **Page PR:** the three bands, the stylesheet, the tests and their moved pins, the e2e, the docs.

## 12. Out of scope

Charts on Today. Business hours. Any new metric or new migration. The Calendar page, the Inbox, the bell's own surface. A second Today for a busy workspace: the page is designed for a business that receives a handful of messages a day, and its emptiness is a fact about the business, not a hole to fill. A generated read of the week (section 4.6): a decision for after the redesign ships, with its own spec, because it needs a validation rule, a cache and a cost ceiling that this page does not.
