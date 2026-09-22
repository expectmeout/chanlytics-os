# Settings · Business: design spec

**Date:** 20 Sep 2026 · **Owner:** Ruben · **Status:** approved (design canvas, 20 Sep)
**Canvas:** https://claude.ai/artifact/GomguHCbTbFahYS9aotLn2 — 18 artboards on the house tokens.
**Scope taken:** the page, the kit and the honesty. Nothing here needs a new route, a new column or an edge change.

Every claim below carries the file and line it came from, checked against `origin/main` at `eea146af`.

## 1. Goal

Make the Business tab a record an owner reads, not a form they fill in.

Today it is two surfaces that disagree about what exists. `PaneWorkspace` (`settings.jsx:1998`) shows **nine** facts in one card. Press Edit and the card is replaced by `BusinessEditor` (`settings.jsx:1013-1965`), which edits about **twenty-five** across **fourteen sections in four groups**, behind one Save at the bottom. On this workspace's real record that form renders roughly **150 inputs in a single 720px scroll** — 99 of them the three fields on 33 services.

The page already knows the right shape and does not use it. Three rows — the timezone, the published number, the transfer number — edit **inline, in the row that states them**, through `useFieldSave` (`settings.jsx:415`). Its own comment says why: those two numbers "used to be sections nine and thirteen of a fourteen-section form". The big form is the holdout.

## 2. Decisions taken in brainstorming

| # | Decision | Why |
|---|---|---|
| D1 | One view. The read card and the form stop being two surfaces; every fact is a row, and editing happens where the fact is stated. | They disagree about what exists: 9 facts readable, ~25 editable. Twelve facts are editable and invisible. |
| D2 | The gesture is chosen by the shape of the data: **inline** for one value, **fold** for a set of fields, **sheet** for a list you scroll. | `useFieldSave` already proves the inline case. A 99-input list inside a 720px column is the wall we are removing. Ruben's choice. |
| D3 | One fold open at a time; each fold saves only its own keys onto the stored config. | Otherwise the page becomes the long form again, and the all-or-nothing Save returns. |
| D4 | Every fold footer states what the receptionist will be told, composed by the same function the edge runs. | The edge's resolver, `resolveSystemPrompt`, is pure. The settings read already runs it with the edge's inputs, and `window.__composedPrompt` shows what it composed. A fold's unsaved draft is resolved by the same function with the same inputs (plan Task 3.1). The link between a typed 2 and "at least 2 hours' notice" is currently drawn nowhere. |
| D5 | `profile.tone` gets a field, and it is the first row of *How it answers*. | It is read (`:1036`), diffed (`:1109`), saved (`:1272`) and composed into every prompt — and `value={tone}` appears **zero times** in the file. |
| D6 | A new card, **What it can do**, and an honest **what it cannot**. | The phone agent has four tools (`voice-shell.ts` `voiceShellTools`). This tab sets the inputs to three and never says a tool exists. |
| D7 | The four guardrails are drawn at three different strengths, because they have three different guarantees. | One is structural, one has a detector on both channels, two are prompt lines — and `policy.ts` says so in its own header. |
| D8 | A conflict moves onto the row it is about; the banner above the card goes. | `factConflicts` already computes them with severity and a sentence. |
| D9 | One kit, `record-*`, in the house shape. No shadcn, no JS animation library. | Babel, no bundler (`legacy/CLAUDE.md`). The precedent is stated: "Charts are one kit, shaped like shadcn's." |
| D10 | The old `BusinessEditor` is deleted in the PR that replaces it, not left behind a flag. | Two editors writing one versioned config is how they drift, and the page's worst historical bug was a save that rebuilt rather than patched. |
| D11 | The `facts_used` aggregate and the Google place imagery are out of scope, and get their own plans. | Both need backend work. Ruben's choice, 20 Sep. |

## 3. Principles the page holds

- **One fact, one owner.** `facts.ts` states it: a fact the system can know is owned by whatever provisions or verifies it; free text is only for what only a human knows. The page applies it to every field (§8).
- **A fact carries where it came from.** `SOURCE_WORDS` already names five sources. Every row shows one, not three rows out of nine.
- **Nothing is asked twice.** The legal name and registered address stay on Connections, and this tab says so once.
- **A save patches, never rebuilds.** Every fold starts from the stored profile and writes its own keys. This is the discipline `BusinessEditor.save` learned after a rebuild lost a live workspace its 5,000-character prompt (`:1257-1265`).
- **The accent appears once per screen**, on the open fold. `tokens.css:102` reserves it for live state; nothing on Settings is live, so nothing pulses.
- **Every sentence with a number comes from a view model.** The standing line, the consequence lines and the capability words are composed in `contracts`, never written in the page.
- **A refused act is absent and the page says why once.** The existing `gate()` rule, unchanged.
- **A read that failed says so where its content would be.** `FailedRead`, unchanged.

## 4. The page

`--measure-prose` (720px), as every settings card already is. Six cards in one column.

```
Business                                        [ Read what it's told ]
Last changed by Ruben, just now

[ standing: three clauses — what it can say, what it deliberately won't, what is missing ]

[ Who you are         ]  7 rows
[ When you're open    ]  4 rows
[ What you offer      ]  3 rows
[ How it answers      ]  7 rows
[ What it can do      ]  6 abilities + what it cannot
[ Your data           ]  2 rows
```

> **Amended 22 Sep, in execution (Task 5.1).** *Read what it's told* is not in the head. It is the door of a small section of its own after *What it can do*, "What your receptionist is told": its title, one muted phrase saying who reads it (contracts' `PROMPT_READERS`, for the channel last chosen) and the door, "Read it", which opens the prompt sheet (§5). It stands where `PromptPreview`'s card stood, which the sheet replaces, and at rest it carries nothing else -- no count, no text, no toggle.

### 4.1 The standing line

Three clauses, not a meter: what it can answer, what it deliberately will not, and what is missing — the last one a link to the row that fixes it. Derived from which fields are filled against `BRAIN_INTENTS` (booking, pricing, hours, services, location, complaint, smalltalk, other). A percentage would be a number nobody can act on.

> **Amended 22 Sep, in execution (Task 4.2, the plan's M-1).** The second clause names the difference between the two channels on a workspace that answers calls, because it lands differently on each: in chat a draft sits between the model and the customer and `violatesNoPrices` swaps the words before the reply is sent; on a call the figure has been heard and `spokenBreach` corrects it in the next turn (`policy.ts`'s own header). So "It offers a consult or the booking link instead of a price." becomes "… — in chat before the reply is sent, on a call as a correction right after." where there is a call, and stays exactly as it was where there is not. Still one clause, and the line is still three. `standingLine` takes which lines the workspace answers on as a required argument, checked as it runs, so an untyped page that left it out cannot quietly read the chat sentence over a phone.

### 4.2 Who you are

| Row | Source | Gesture |
|---|---|---|
| Name | `typed`, which is how the read reports a typed name even where Google agrees (below); a different name Google lists is offered as **Use Google's**, and a different workspace name is shown and never offered, since it is only what the workspace was called when it was made | inline |
| Address | `verified` / `typed`, with **Use Google's** when they differ | inline |
| Website | `typed`; empty says the receptionist is given no website, which is exact: the prompt names one only when it is typed here, and the carriers are filed the carrier record's own website, or `/b/<slug>` when that has none (`a2p.ts`), never this field | inline |
| Booking link | `typed`; the note about never confirming moves under it | inline |
| Answers on | `provisioned`, read-only, one link to Connections | — |
| Tells customers to call | `typed` or follows the line | inline (unchanged behaviour) |
| Transfers a caller to | `typed` | inline (unchanged behaviour) |

The chip is the source the settings read resolved (facts.ts `resolveFacts`, which this spec does not change), and it reports a typed value that agrees with Google's as typed: a name Google agrees with reads "you set this", and "from Google" is shown only on a value that came from Google alone.

> **Amended 22 Sep, in execution (Task 4.0).** There is no chip, and a typed fact says nothing at all. "You set this" is the default on five of these seven rows, it tells an owner nothing they could act on, and at a phone's width the pill wrapped onto a line of its own under every value. The kit draws a source only where the value is NOT the owner's — from Google, your line, this workspace, not set, and a disagreement's two answers — and draws it as a muted word beside the value, in the same contracts words (`SOURCE_WORDS`). The resolver is unchanged: a name Google agrees with is still reported typed, and is now simply said nothing of.

Foot: one sentence saying the legal name and registered address live on Connections and are asked once.

The **Workspace** row goes. It printed the business's name a second time whenever it differed.

### 4.3 When you're open

Hours as a week ribbon plus one sentence; timezone with the local time beside it; closed days; the calendar it reads, stating its last read and event count. The **Check the address** button goes — the row says what a check would have told you.

> **Amended 22 Sep, in execution (Task 4.0).** The calendar row states WHERE it reads (the feed's host, in the page's own typeface, never the path — a private address is a long secret and the row is read over a shoulder), one quiet mark for whether the last read worked (the Calendar page's own words in its accessible name and its tip, not a pill), and WHEN it was read (`feed.read`, "read 4m ago"). The address whole, the source and the event count are in the fold, which is where somebody who wants them goes. The hours fold's line names the zone the way the card above it does — "All times in New York time" (`hoursZoneWords`), never `America/New_York`.

The hours fold is a week on one scale: a day is a toggle, a bar on a 6am–10pm axis, and its times. A break is a second bar on the same row. Copy-to-day becomes one menu, and names every day it opens or overwrites, with the whole grid restorable in one press — the behaviour `applyToAll` already has (`:1225-1256`), given a control that does not sit inches from two other links.

### 4.4 What you offer

Services as a count, four chips and a sentence about pricing, opening a **sheet**: searchable, inline rows, sticky footer, remove-with-undo. Booking rules as one sentence, opening a **fold** with the five numbers. Consult-first gets its own row and its own name — it is one of two unlabelled textareas today.

### 4.5 How it answers

Its voice (the new field) · Languages · Rules it always keeps · Hands you a customer · Things it should know · In your own words · When it can't answer.

**Hands you a customer** is one row naming both channels: the WhatsApp reasons (which compose only for WhatsApp — `config.ts` says "On the phone there is no token to emit"), and the phone's transfer number. Today these are a form section and a read-card row, a page apart, neither naming the other.

> **Amended 22 Sep, in execution (Task 3.5).** The reasons compose on both channels. Only the `[[HUMAN]]` token is WhatsApp's: the call's hand-off block carries the same reasons ("and whenever:"), with the transfer, or a message taken, as what it does. The row's fold says so, and the transfer number stays Who you are's to edit (plan, Task 3.2's review).

### 4.6 Rules it always keeps — three strengths

| Rule | Strength | What actually happens |
|---|---|---|
| Never confirm an appointment | **It cannot anyway** | There is no appointments table. Switching it off would not let it book, only stop it being told not to *claim* it had. |
| Never quote a price | **Checked, not just told** | `violatesNoPrices` swaps the words before a chat customer sees them; on a call `spokenBreach` reads the agent's turns and a correction goes in live, and the owner is told while the call is up. The detector runs whether the switch is on or off: the owner decided (20 Sep 2026) that a receptionist never states a price, so the switch changes only the wording. On, one prompt line tells it not to quote one. |
| Say it's an assistant | Told, and trusted | A prompt line. `policy.ts` says why there is no detector: the phrase that catches a denial also catches the correct disclosure. |
| Never give health advice | Told, and trusted | Same. |

The vision toggle is separated by a dashed rule and labelled as an ability, not a limit — it is the only one that starts off.

> **Amended 22 Sep, in execution (Task 3.5).** Not the only one: "Never give health advice" is opt-in too (`GuardrailsSchema`, and the form's own "absent means on" for the other three). The photos switch starts off because it gives the receptionist an ability, and its hint says that, not that the four limits start on.

> **Amended 22 Sep, in execution (Task 4.2), under the owner's quiet rule.** The three strengths live in the fold, not on the row. Each switch wears its strength as ONE muted word (`ruleStrength(key).chip`) and carries its sentence under the label — under 761px that sentence is off the glass and on the switch's `aria-describedby`, since four of them is most of a phone's screen. The form's own hint is gone from the four: two sentences on one switch (what the rule asks for, then how far it goes) is the clutter, and the strength's sentence says both. The checked rule alone draws its two `checkedOn` lines, opening with the channel's name in the abilities card's words.
>
> **At rest the row stays one row**, and what it may name is derived from the strengths rather than the switches (`rulesKept`): the **checked** rule is named whether its switch is on or off, because the detector runs either way (the owner's decision, 20 Sep 2026) and a row that dropped the word would read as if prices went through; an **instructed** rule is a prompt line and nothing else, so it is named only where the record composes a prompt to put it in; the **structural** rule changes its words rather than going — *Cannot book anything* — because the switch decides only whether it is told not to CLAIM it booked, and the product has no appointments table either way. On a record whose details compose nothing the row therefore reads *Never quotes a price · Cannot book anything · Won't look at photos* — the photos word is always the last chip, because the switch reaches the receptionist without the prompt — and the fold goes on saying the rest once (the plan's M-2).

### 4.7 What it can do

Six abilities, each with which channel has it and what it runs on, computed from `capabilityStatus` and the tool list, never typed:

- Answer from your facts — both; in chat it also records which facts it leaned on
- Say which times are open — phone asks the calendar mid-call; chat is handed the next few days' openings with each message
- Send the booking link — **by WhatsApp on both channels**: in the thread, or on a call as a template to the caller's own WhatsApp. So it needs WhatsApp connected, and the call side needs an approved booking-link template too. While the Autonomy tab holds bookings for a person to confirm, it sends none
- Put a caller through — phone only, during opening hours, staying on the line until someone picks up; otherwise it takes a message
- Hand the thread to you — chat only; a pause for the Autonomy tab's `pause_hours` (a day by default, and a day when nothing is stored, as the Autonomy pane reads it), after which it answers the next message itself
- Look at a photo — off

And what it cannot: book, move or cancel an appointment (structural); call a customer (it answers, and the only number it rings is the owner's, to transfer); send a text message (not sold until the carriers approve a line, and not listed once texting is live on the workspace's line).

> **Amended 22 Sep, in execution (Tasks 4.1 and 4.1b).** Three sentences of this section are now narrower, each
> because the code refuses what the wider one promised.
>
> | Said here | Said on the card |
> |---|---|
> | Say which times are open ... "then the link" | **"then the link in chat"** on a workspace on both lines with no approved booking-link template: the call has no template to deliver, so it cannot send it (M-3) |
> | Send the booking link ... While the Autonomy tab holds bookings, it sends none | and **while the Autonomy tab holds REPLIES** (Asks you, Stays quiet) it has no channel at all: the call's send is refused by the same gate (`outbound-gate.ts`) |
> | Six abilities, each with which channel has it and what it runs on | each with which channel has it; **what it runs on is drawn only where that row is still empty**, which is the one thing an owner can act on from here (Task 4.0's rule) |
>
> The Replies row is said ONCE for the whole card, above the rows, with one door to the Autonomy tab -- one cause with
> one fix on another tab, and six rows repeating it is the page shouting.

> **Corrected 20 Sep, by the Phase 1 review.** This section first said the phone "texts" the booking link, that a hand-off never resumes, that a transfer "steps out", and that the receptionist "never dials". None was true. The link is a WhatsApp template and never an SMS; a hand-off is a pause that ends; the transfer stays on the line and runs only during opening hours; and the transfer does dial — the owner's number. A redesign whose argument is that the old page said untrue things cannot ship an untrue sentence, so each one is pinned by a test that fails on the old wording.

## 5. The three gestures

**Inline.** The value becomes an input on the same baseline. Save/Cancel on the row, Esc cancels, ⌘↵ saves. The consequence line sits between the field and the buttons. Refusals appear under the box before any round trip.

> **Amended 21 Sep, in execution (Task 3.3).** The timezone row has no consequence line. Its consequence is the local time beside it (4.3): "New York, 7:23 PM there now" says what the choice does. The zone is in the prompt (the hours heading names it, and closures pass by its clock), but it is the workspace's, saved through its own route (`PATCH workspaces`), not a key of the brain a save sends, so no draft of it can be resolved as the edge resolves one (`FOLD_BLOCK.timezone` is null on purpose). Once the zone is saved, the settings surface is read again (`refresh-map.ts`), so the prompt's preview, the hours fold's hint and every fold's block name the new zone.

**Fold.** Opens under its row inside the card, `grid-template-rows: 0fr → 1fr`. The accent left edge marks it. Its footer carries the composed block and its own Save. One at a time: opening another closes a clean fold and asks about a dirty one. The rows below are pushed, never covered, and the fold's top edge does not move.

> **Amended 22 Sep, in execution (Task 6.2b).** On a phone (760px and under) an open fold rises from the bottom as a sheet instead: the same head, fields, composed block and Save, in the sheet's frame, modal, as tall as what it holds up to 88% of the screen. A press on the wash behind it is its Cancel, so reaching for another row asks about what was typed. The inline editor stays in its row at every width: one value, already the row's full width on a phone.

**Sheet.** Right-hand panel for the services list and the prompt. Head, search, rows, sticky footer. The page behind stays readable.

> **Amended 22 Sep, in execution (Task 5.1).** The prompt's sheet has no search and nothing to save. Its head is the title and who reads it (no count); its tools the channel, WhatsApp or Phone; its body the contents ("Written by", an entry per block with ONE thin bar as long as the block's share, the exact count only in the entry's accessible description and tip) beside the blocks (each its row's label, its door back to that row, its text in the page's face, its note), then what is sent beside the prompt under a dashed rule with the reason it is apart. On a phone the contents are not drawn, each block's head says its share in words, and the foot is one Close; on a desktop it has no foot. Both sheets go through one slot, drawn last on the page, which draws one of them or neither.

`window.__settingsUnsaved` narrows from the whole form to the open fold.

## 6. The record kit

`apps/dashboard/src/legacy/components/record-*.jsx` + `apps/dashboard/src/legacy/styles/record.css`, added to **both** load lists (`legacy-bridge/manifest.ts` and `legacy/Chanlytics.html`) with `?v=` bumped, as `legacy/CLAUDE.md` requires.

| Component | Replaces |
|---|---|
| `RecordRow` | `.cl-prof-attr`, `.set-row`, `.set-team-row`, `.set-int-row` — four classes drawing one row |
| `RecordField` | `.biz-field`, `.set-ident-row`, `.set-br-field`; wraps the existing `FieldError` |
| `RecordFold` | new |
| `RecordInline` | the inline editing `PublishedNumberRow` and `HandoffRow` each drew by hand (`.set-row-editing`, `.set-pub-inline`); beside `RecordFold` in `record-fold.jsx`, sharing its focus, keys, foot and `RecordSays`, what saving writes (added in Task 3.2's review) |
| `RecordSheet` | new; the phone's `PeopleListsSheet` is the precedent |
| `RecordSwitch` | `.set-switch`, lifted out of settings.css |
| `RecordToggleGroup` | `.cl-tabs` used as a radiogroup |
| `RecordTip` / `RecordTipCard` | `set-mark` + `window.__tip`, formalised as two tiers |
| `RecordCombobox` | the 418-option timezone `<select>`, and the language add |

> **Amended 22 Sep, in execution (Task 6.2b).** `RecordFold` is one component with two frames: under the phone query it draws itself in `RecordSheet`'s phone frame (a dialog in the app's root) and above it folds inline, with the same hooks either way, so a page calls it the same way at every width. `RecordSheet` itself is unchanged.

Not built, and why: DatePicker (native `type="date"` is deliberate — 31 November cannot be typed), DataTable (`PeopleTable` is one; Settings has no table), Command (⌘K is Ask, shell-owned), Pagination, Drawer, Progress, Carousel, Menubar, Message/Bubble.

Reused unchanged: `StatePill`, `Confirm`, `EmptyState`, `FailedRead`, `FieldError`, `MoreMenu`, `usePPToast`, `gate()`.

## 7. Contracts

All additive; nothing existing changes meaning but the one fix item 3 names, where the instructions box stops opening the product's baseline as the owner's own words.

1. **`tone.ts`** — a `fact` StateKind: `verified`/`provisioned` → `ok`, `typed`/`workspace`/`absent` → `plain`, `disputed` → `warn`. Deletes the bespoke `.set-fact-src` family.
2. **`business-tab.ts`** (new — named apart from the existing `business-page.ts`, which is the public `/b/<slug>` page, and `business-record.ts`, which is the carrier record) — the sentence tables the page composes from:
   - `standingLine(inputs)` → the three clauses.
   - `abilityRows(inputs)` → §4.7. Every input is required: which lines answer, what is filled in, the Autonomy reply row's stored `pause_hours`, and whether the Autonomy tab holds bookings (`bookingHeld(policy)`). A boolean left out throws a `TypeError`, because the page is untyped.
   - `cannotRows({ smsLive })` → the cannots, texting left out once it is live.
   - `ruleStrength(key)` → `structural | checked | instructed`, with its sentence.

   **`prompt-blocks.ts`** (split out of `business-tab.ts` by the Phase 1 review, because it reads what `config.ts` writes instead of holding sentences):
   - `promptBlocks(text, channel, from)` → the prompt cut into blocks with the row that wrote each, its character count, and a note wherever whose words they are needs saying.

   `consequenceOf(section, next, channel)`, the block a fold shows, is cut by `promptBlocks` from `resolveSystemPrompt` over the brain the fold would save, with the inputs the settings read's preview carries (plan Task 3.1).
3. **No change to what `composeSystemPrompt` or `resolveSystemPrompt` return**, and no change at all to `facts.ts`, `capabilities.ts`, `policy.ts` or `voice-shell.ts`. The page reads what they already return.

   Amended 20 Sep, in execution. This line first said "no change to `config.ts`". But the prompt view cuts the *resolved* prompt, and the resolver decides whose words count as the owner's: `profile.extra_instructions` when there are any, and `brain.system_prompt` carried in their place when there are not (`config.ts:1292`). A page that re-derived that rule would drift from it. So one exported helper, `ownWordsOf(brain)`, lives beside the resolver and the resolver itself calls it. It is a pure extract: the prompt's output stays byte-identical, and the thirteen test files that exercise the resolver, plus an equivalence test, hold it there. The live line reads this file, so the promise that matters is about what it *returns*, not whether a line of it moved.

   Amended again 20 Sep, by the Phase 1 review. `config.ts` gained three more exports, and none changes what either function returns. `PROMPT_OPENINGS` holds the openings the composer writes its blocks under. `composeSystemPrompt` and `resolveSystemPrompt` write them from there and `prompt-blocks.ts` reads them there, so the prompt view cannot drift from the composer. `whoseWords(brain)`, built on `ownWordsOf`, decides once whose words stand in the owner's place, and both `instructionsDraft` and `promptBlocks` ask it. `bookingHeld(policy)` asks the question the edge asks about the Autonomy tab's Booking row, for the ability card. One existing function changes meaning, on purpose: `instructionsDraft` now opens empty where the owner's own field holds the product's baseline, which saves before S4 put there. That is the S4 fix its comment always described, and it now agrees with the prompt view.

   The equivalence test is "the resolver composes the typed details with the owner's words as ownWordsOf names them", in `tooling/scripts/tests/prompt-blocks.test.mjs`. With no platform facts, the resolver equals `composeSystemPrompt` over the typed details and the profile with `ownWordsOf`'s words (864 combinations), and a workspace whose fields compose nothing gets its stored prompt as it stands, with only Autonomy's rules after it (432 more). Byte identity was also proven outside the suite, over 256,608 cases. Both functions built at `36dec914` and with the review's changes (`917391b6`) agree on every one. Merged with main, whose #753 rewrote the call's booking and medium lines, they agree on every one with main's own build (`390180c6`). Deliberately broken builds are caught.

## 8. One fact, one owner — applied

| Fact | Owner | What changes |
|---|---|---|
| Business name | Google, else the workspace | One row, chipped. The Workspace row goes. |
| Address | Google | **Use Google's** instead of a silently recorded disagreement. |
| The line it answers | the platform | Shown, never a box. |
| The published number | you | Asked once, in its row — not again in the create path. |
| Website | you | Says what empty means. |
| Legal name, registered address, EIN | Connections | **Never asked here.** One sentence at the foot of *Who you are*. |

## 9. Motion

Four additions to the grammar `components.css` already documents (rise-in + 30ms stagger, draw-line, breathing only where live, press feedback), on the existing duration tokens:

1. **Fold** — `grid-template-rows` + opacity, `--duration-base`, `--ease-out` opening and `--ease-in-out` closing. Never `max-height`.
2. **Value → field** — 120ms cross-fade on a shared baseline; the focus ring arrives on the second frame; the caret lands at the end.
3. **Consequence line** — only the changed clause washes `--ok-soft` → transparent over 400ms, once. Never a typewriter, never a re-layout.
4. **Save settle** — fold closes (200ms), row value arrives on `rise-in`, toast rises 8px. Overlapping, about a third of a second.

Four refusals: nothing pulses (the accent means a live call); no skeleton shimmer (a read in flight dims the last value); no number counts up; every new selector joins the `prefers-reduced-motion` block.

## 10. The words

| Retired | Kept |
|---|---|
| Anything else it should know · Other things it should know · Rules it always follows · extra instructions | **what it's told**, each row naming its own part |
| Your business · Business · Business facts | **Business**; *the business on record* only for the carrier form |
| Hand over to a person when · Transfers a caller to | **Hands you a customer**, one row, both channels named |
| Calendar it may look at | **Calendar it reads**, here and on the Calendar page |

Sentence case throughout; no colons in a label; the label names the thing and the hint says what it is for, never both in the label.

> **Amended 22 Sep, in execution (Task 4.0).** Four sentences changed, each because it said something an owner cannot act on from where it stood:
>
> | Retired | Kept |
> |---|---|
> | you set this | *nothing* — a fact the owner set says nothing; only a fact that is not theirs does |
> | Last changed by ruben@rjcapital.io, 7m ago | **Changed by you, 7m ago**, or the person's name, or the local part of their address — never the address |
> | In your own words · 339 characters | the opening alone; **339 of 20,000 characters** under the box that edits them |
> | 3 messages sent in your name · 3 differ from the default wording | **3 messages, in your words** / **3 messages, the product's wording** |
> | All times America/New_York, as the receptionist states them | **All times in New York time, as the receptionist states them** |
>
> The told section's head keeps its title, its Show and "every WhatsApp message, word for word"; its character count is inside, beside the text it counts.

> **Amended again 22 Sep, in execution (Task 5.1).** The told section has no Show: its door is **Read it**, which opens the prompt sheet, and its phrase follows the channel last chosen ("every phone call, composed when the call starts" on Phone). The character count is on no glass at all -- a block's cost is its share, a thin bar, or "a quarter of everything it reads" on a phone, and the count is the accessible description of the entry that draws it. What is sent beside the prompt is "Sent alongside it, rebuilt for every message", and "... for every call" on Phone, where it said "every message" on both.

## 11. What is on screen

At rest: **four** controls — *Read what it's told*, the standing line's one link, *Download*, and the one act under the pointer. Twenty more are in the tab order at all times and draw themselves on hover or focus.

Four things are never hidden: anything wrong or missing; the act on an empty row; everything on a touch screen (no hover on a phone — the whole row is the act and the chevron is always drawn); and the keyboard path.

> **Amended 22 Sep, in execution (Task 5.1).** The first of the four is **Read it**, the door of the told section after *What it can do* (§4's amendment), not a *Read what it's told* in the head. Inside the prompt sheet, each block's door back to its row follows the same rule: drawn when its block is hovered or holds focus, and always on a touch screen and at a phone's width.

## 12. Tests

House rule: no `readCode` assertions. Every test executes the page on the stub React, as `today-page.test.mjs` does.

- `settings-editor`, `settings-save`, `settings-save-keeps-rules`, `settings-truth`, `settings-words`, `settings-honest`, `settings-owner-panes` all pin the current form and are rewritten against the rows and folds.
- New: one test per fold proving it writes **only** its own keys onto a stored profile carrying an unknown key, and that the unknown key survives.
- New: the standing line, the ability rows and the rule strengths are pure functions with their own contract tests.
- `legacy-harness.test.mjs` pins the two load lists in file order; the kit's files go in both.

## 13. Risks

- **A save that loses config.** The one historical catastrophe on this page. Mitigation: every fold patches from stored, and the unknown-key test above is written red first.
- **Test churn.** Seven test files pin the form's shape. They are rewritten, not deleted, and each PR keeps the suite green.
- **The live workspace.** This is an operator surface, not a customer one, and no edge code changes — but the config it writes is read by the live line within a minute. No PR lands without `corepack pnpm test` green.

## 14. Out of scope, with a home

- The `facts_used` aggregate and the suggestion cards (canvas board *The loop closes*) — needs one `/api/v1` read and a period query.
- The Google place imagery (`photo_uri` on `GoogleListingDto`, a Places photo call) — touches `apps/edge`.
- Colouring the prompt blocks by which tab wrote them (Autonomy's policy rows compose into this same prompt).
- The voice half of the loop: `caller_wanted`, `outcome`, `follow_up`, `caller_name`.
