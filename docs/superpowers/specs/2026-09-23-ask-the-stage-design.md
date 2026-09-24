# Ask, the Stage: design spec

**Date:** 23 Sep 2026 · **Owner:** Ruben · **Status:** approved by Ruben, 23 Sep (F · The Stage for the desktop; the takeover on a phone); built 23–24 Sep as PR #957 (the plan's "As built" section lists what differed) · S12 revised 24 Sep to one button at the field's end (the plan's "As built, one button") · **Plan:** `docs/superpowers/plans/2026-09-23-ask-the-stage.md` (one plan, one PR)
**Direction:** picked on the review page https://claude.ai/artifact/UPrgqXnortmV5HFoTPyMr9 (rows F and F · phone). D · The Composer and E · The Sheet were set aside.
**Base:** written against `origin/main` at `000d4906` (#940). The Line's spec (`2026-09-23-ask-the-line-design.md`, rev 3) stands underneath this one: the protocol, the answer's shape (Say · Show · Do, `AskAnswer` v2, one door, sources and receipts), the turn on the server, the model gate and its call are unchanged. This document changes only what a person sees and touches. Where this spec and the code disagree, the code wins.

## 1. Goal

Ruben, 23 Sep, on the Line as shipped: it "feels more lite than the original and that is great but this direction just feels like lines of text and too dull"; he wants "that sleek next gen animated experience" that takes OpenAI's and Claude's qualities "into the unique chanlytics style", "native yet AI futuristic in a subtle sleek sophisticated way", with the generative answers and follow-ups "more compact and sophisticated", "more advanced modern practice buttons and displays", the site's colours, font and badges, and room for "the three animated icon" to show. On a phone he wants Ask to "take over the screen similar to today page mobile view so that we can remove it from the today page mobile view", appearing "over the screen like openai voice orb design that takes the full screen and is animated", closed by a swipe "without having to click x", with persistence.

The goal, in one line: **the three are the object of Ask on every screen; the answer is form, not lines; the phone is one full-screen character you talk to.**

What does not change: the backend ("i like the backend"); the words of every answer and their grounding; the rows' contents (Right now, the page's questions, Earlier); the keys; the cards and their doors; the receptionist; Ask's budget.

## 2. What Ask is today

- **The Line** (`apps/dashboard/src/legacy/pages/ask-real.jsx`): a 720px panel 96px from the top (`styles/ask.css:9-20`), the three at 44×36 in a 64px bar (`:26-28`), rows or the answer under it, the earlier turns folded above (`:86-95`). It opens with a FLIP of the three from the top bar's button (`ask-real.jsx:143-163`), rides the phone's keyboard with `--ask-kb` (`:165-180`), forgets what was typed on close (`:182-185`), focuses the field on open (`:187`), takes Esc and ⌘J (`:199-224`), runs the turn (`submit`, `:296-369`) and draws itself at `:519-620`: the phone head, the folds, the bar, the body. The phone's sheet is pulled down through `touchSwipe` (`:527`; `components/data-bits.jsx:410-470`) and comes and goes through the shell's kit (`components.css:3153-3215`).
- **The answer** (`pages/ask-turn.jsx`): Say, Show and Do beside three 8px squares (`ask.css:97-110`), figures with a popover receipt (`:122-131`), the breakdown on the chart kit's bar, items as 40px rows, Open and the next questions as 40px rows (`:145-149`), cards (`:156-166`).
- **The rows** (`pages/ask-home.jsx`): `buildLineRows` (`:15-47`) makes Right now, "Ask about <page>", Earlier, the typing rows and the Earlier list; `AskRows` (`:52-99`) draws them as one listbox of 40px rows.
- **The face**: `components/ask-face.jsx` mounts the three on a canvas with `fitSide` (`legacy-bridge/mascot/character.ts:86`) and follows the one mood (`mascot/mood.ts:15-25`); a mounted character eases its squares to a new size on `setSide` (`mascot/driver.ts:47`) or fits its box every frame when none was given (`:171`, `:205`).
- **Today's band on a phone** (`pages/today-face.jsx`; `dashboard-a.jsx:17`; `dashboard-a-v2.css:27-57`): a 232px stage with 52.6px squares (`TF_SIDE`, `today-face.jsx:28`), a tap slides a field in, a hold of 320ms listens (`:30`), its own turn reducer (`mascot/turn.ts`), a settled answer drawn compact. At 721px and up it is not drawn.
- **The doors** (`pages/app-shell.jsx`): ⌘K toggles `askOpen` (`:348`), the phone's ✦ opens it (`:878-885`) and hides while it is open, `AskBar` draws `AskReal` (`:887`; `dashboard-a-ask.jsx:729`).
- **Persistence** today: an open conversation comes back until Clear because `AskReal` stays mounted and keeps `active` (`ask-real.jsx:233`); typed words and a reading turn do not survive a close (`:182-185`); nothing survives a reload. The tab's memory kit (`legacy-bridge/tab-memory.ts:34-43`, `draft`/`keepDraft`/`dropDraft`) keeps drafts per workspace for a day and is not used by Ask.

## 3. Decisions

- **S1. The three are the object.** On the desktop they stand in a stage band at 84×68, the largest face in the app; on a phone they fill the screen at Today's size and are what you talk to. The top bar's button and the ✦ stay the doors and hide while Ask is open (one character).
- **S2. Form, not lines.** What needs you is amber pills (`.pill-warn`); questions are chips (a 28px control of its own, `.ask-chip`, not the kit's 20px `.chip`, which names a thing); figures are tiles; rows carry a 24px kind mark; the door is one button; the next questions are chips. Every shape is the site's badge system or its `.btn`, at the kit's sizes (`components.css` "Badges: one shape per job", `.btn`, `.btn-sm`, `.btn-ghost`). No gradient, no second family, one accent (coral, live only).
- **S3. The rail.** The answer's three parts hang on a rail: a 12px square per part in the three's shades (light, mid, dark, as the 8px marks are today) joined by a hairline. On a phone the rail keeps its size and the gap shrinks.
- **S4. The receipt is in the tile.** A figure's source is shown as a line inside its tile on hover, focus or a tap ("From Reports, past 7 days", with the door's arrow only where oneDoor left it one). The popover receipt goes.
- **S5. One reading line.** While Ask reads, the latest trace is one line in coral ink under the field (desktop) or under the three (phone), with a pulsing dot. The trace rows go.
- **S6. The phone takes the screen.** At 720px and below the Line is a full-screen takeover: head, the three, the field at the foot. It replaces the bottom sheet and Today's band. Nothing changes at 721px and up but the Stage.
- **S7. Swipe to close.** A downward drag anywhere on the takeover, when its body is at its top, moves the screen with the finger and closes it past 80px (the kit's `touchSwipe`, `onDown`); a shorter one settles back. × and Esc stay.
- **S8. Back closes.** Opening the takeover pushes one history entry with a **null state and the same address**; the phone's back gesture or the browser's Back closes it and nothing else. Closing by ×, Esc or a swipe consumes that entry (`history.back()`), so Back after a close leaves the page as it should. Null and same-address because the shell's router lives on the hash and Next's app router reloads the whole app on a Back to an entry whose state it did not write, while it ignores one with no state (`app-shell.jsx:281-284`); the address unchanged, `hashchange` never fires.
- **S9. Persistence.** A conversation comes back until Clear (as today); the words typed come back on reopen and go on send or Clear; the open conversation's id survives a reload and is opened again on the next open; all of it through the tab's memory kit, per workspace, forgotten at sign-out.
- **S10. The keyboard never opens by itself on a phone.** The takeover opens with focus on its dialog, not the field; a tap on the field opens the keyboard; a hold on the mic or on the three listens without it. On the desktop the field takes focus on open, as today.
- **S11. Hold to talk, two places.** The mic button (as today) and the three themselves on the phone (as the band did: a press held 320ms listens, a shorter press does nothing). Space held on an empty field talks on the desktop (as today).
- **S12. One button at the field's end.** A 32px ink circle: the mic with no words (hold to talk, the kit's classic `mic` glyph), Send once there are words, Stop while a turn runs; coral while it listens; faint only where the browser cannot listen and there are no words. Its glyph blooms in as the role turns. Enter sends, as today. (Revised 24 Sep: Ruben asked for one icon that "morphs into the arrow up if user types and if not it is as the microphone", and a classic microphone in place of the waveform.)
- **S13. Motion is CSS and the one FLIP.** The panel and the takeover come and go through the shell's kit; the three FLIP from their door; parts rise 6px as they fade in, 60ms apart; the reading line fades; tiles and chips arrive with their part. No count-up (a figure is "20s" or "1 min" as often as "5"). Nothing moves under reduced motion but the finger's own drag.
- **S14. Today's band goes.** `today-face.jsx`, its styles, its tests and the turn reducer it alone used (`mascot/turn.ts`) retire; the ✦ is the phone's door. The queue starts under the header again.
- **S15. One turn runner.** The Line's `submit` is the one place a question becomes a turn on every screen; the band's reducer is not carried over.
- **S16. Haptics where the browser has them.** `navigator.vibrate(8)` when a hold starts and when an answer lands, guarded; nothing where it is absent (iOS).
- **S17. No key symbol drawn** (the Line's D17 stands).

## 4. The Stage (721px and up)

### 4.1 The panel

The scrim and the panel as today (`ask.css:9-20`), the panel 80px from the top instead of 96 (the band is taller than the bar). Width 720, radius 16, `--shadow-lg`, `max-height: calc(100vh - 128px)`, a column: the folds, the band, the body.

### 4.2 The band

- 92px tall: `background: var(--bg-sunken)`, a hairline under it, padding 12px 16px 12px 14px, the panel's top radius.
- The three: an 84×68 `AskFace` canvas at the left (`fitSide` gives 16.6px squares), `ref` for the FLIP as today.
- The scope chip, when there is one, before the field, as today (`.ask-scope`).
- The field: 20px, `letter-spacing: -0.012em`, placeholder "Ask anything" (`t.placeholder`), "Ask a follow-up" in a conversation (`t.follow`), "Listening…" while listening, as today.
- The right cluster, in order of state: at rest the one button (`.ask-send`, S12: the mic, or Send with words); while a turn runs it is Stop; with an answer drawn, Copy, Read aloud and Clear (`.ask-line-btn quiet`, as today) stand before it.
- The reading line: a second row inside the band, 12.5px in `--accent-ink` with a 6px coral dot pulsing (`ask-pulse` stays), showing `live.traces[last]` or `t.thinking`. The band grows to 112px with it (`grid-template-rows: 0fr → 1fr`, 160ms) and back.

### 4.3 Under the band, at rest

One column, padding 10px 10px 14px, gap 14px:

1. **Right now**: a row of `.pill-warn` for what needs you ("2 need you", "1 run waiting", each only when its count is above zero), the sentence (13.5px), and "Brief me" as `.btn-sm` at the right, which asks `t.needsQ`. The bridge's `rightNow` grows a second form, `rightNowParts(lang)`, that returns the sentence and the counts it was built from (needs you, runs waiting), so the pills and the sentence never disagree. With nothing needing anyone, the sentence alone.
2. **Ask about <page>**: the label (12px dim) and the page's three questions as chips (`A.suggestions`, as today's `about` section).
3. **Earlier**: the label, the three latest conversations as 36px rows (a chat glyph, the title, the time at the right, the × on hover as today), then "All earlier conversations" as a chip with the arrow.

The rows are one listbox as today (`role="listbox"`, `aria-activedescendant`); a chip is an `option` too, so the keys walk pills, chips and rows in the drawn order and Enter activates the one they stand on. The selected chip shows the kit's hover look (border `--line-strong`, `--bg-hover`).

### 4.4 Typing

The words as the first row ("Ask <words>") and the jumps as 36px rows; the matching questions and the matching acts (with their "Card" meta) as chips; all in one listbox.

### 4.5 The answer

On the rail (S3), padding 16px 20px 18px, parts 22px apart:

- **Say** beside the light square: the headline 19px/500 (`text-wrap: pretty`), the detail 13.5px muted. While streaming: the headline as written with the caret (`.ask-cursor`), the detail under it when it arrives; Show and Do wait for the final message (the Line's 7.4).
- **Show** beside the mid square, 14px apart: the breakdown on the chart kit's bar (`SegmentBar small`, as today); the figures as tiles in a 4-column grid, 8px apart; the items as rows.
  - A **tile**: 1px `--line`, radius 10, padding 10px 12px 9px; the value 20px/500 tabular; the label 12px muted; the note 11.5px dim. With a source: on hover, focus (the value is a button, `aria-expanded`) or a tap the note becomes "From <source.label>" and, where `source.door`, the arrow that opens it; the tile takes `--bg-hover` and `--line-strong`.
  - An **item**: a 24px kind mark (`--bg-sunken`, radius 6, the kind's glyph: chat for a thread or conversation, phone for a call, users for a person, arrow-right for a page), the title 13.5px/500 with the meta 12px dim beside it, the line 13px muted under, a chevron at the right; 44px min; a door (oneDoor) is a button with the hover ground, a later row to the same place is plain.
- **Do** beside the dark square: the cards first (`.ask-card`, as today, with `.btn-sm` actions), then one wrapping row: Open as `.btn` with the place's glyph ("Open the week in Reports"), Try again as `.btn` on a failed turn, and the next questions as chips with a 7px dark square as their glyph.
- The keys walk the same moves as today, in the drawn order: the item doors, Open, the next questions.
- The unverified badge stays (`.ask-unverified`).

### 4.6 The folds

Above the band, as today (`.ask-folds`), each fold a 36px row: the light square, the question, the answer's words, the chevron; opened, the turn draws on the rail under it.

### 4.7 Motion

- **Open**: `line-in` (160ms) as today; the three FLIP from the top bar's button to the band (the existing FLIP scales by width, 30→84).
- **Ask**: the reading line's row grows (160ms) and its words fade in; the three leapfrog (mood `thinking`); Send becomes Stop.
- **Answer**: the headline streams; on the final message Show then Do come in with `ask-part-in`, now `opacity 0 → 1, translate 0 6px → 0`, 160ms, Do 60ms after Show; the reading line's row closes.
- **Follow-up**: as today (the answer folds, the new question streams).
- **Rest**: the three breathe (the character's own idle).
- Under reduced motion: no FLIP, no rise, no pulse (the block at `ask.css:167-170` widens).

## 5. The takeover (720px and below)

### 5.1 The screen

`.ask-modal.ask-line` is the screen: `position: fixed; inset: 0`, `background: var(--bg)`, no radius, no shadow, padding-top `env(safe-area-inset-top)`, padding-bottom `env(safe-area-inset-bottom)`; the wash behind it is the kit's, fully covered. `role="dialog" aria-modal="true" aria-label="Ask Chanlytics"`. Three rows: the head, the middle (flex 1, scrolls when it must, `overscroll-behavior: contain`), the foot.

- **Head** (52px): "Earlier" as `.btn-ghost` with the chat glyph at the left (toggles the Earlier list, `aria-pressed`); Clear as `.btn-ghost` beside it only in a conversation; × (44px) at the right.
- **Foot**: the field (56px, `--bg-sunken`, radius 16, `--line`), the one button (36px) inside it, in 12px side padding; it rides the keyboard through `--ask-kb` as today.

### 5.2 At rest

The middle centres its content: the three (a `<canvas>` in a stage of `min(232px, 34dvh)` height and full width, mounted with `fitSide` so the squares are 52px on a 390px phone); under them the amber pills and the Right now sentence (14.5px centred, `max-width: 32ch`); under those the page's three questions as chips, centred and wrapping. The Earlier rows are not here: the head's Earlier opens them as a full list of 48px rows (the Line's `view === "earlier"`), the field searching it as today.

### 5.3 Listening

A hold on the mic, or a press held 320ms on the three (S11): the three huddle in coral (mood `listening`); the pills, sentence and chips give way to the words heard, centred, 26px/500, the last word dim until it settles; the foot becomes "Let go to ask" (a 60px coral pill, `--accent` on `--accent-fg`, the mic glyph) with "Type instead" (`.btn-ghost`) above it. Letting go with words asks them; with none, the screen is at rest again. The keyboard never opens for a hold (`preventDefault` on the pointer down, `touch-action: none` on the button and the stage, as `.ask-send` and `.tf-stage` do).

### 5.4 Reading

The question at the top of the middle (a 7px dark square and the words, 14px); the three leapfrog large (mood `thinking`); the reading line (S5) centred under them; the foot's field says the question dimly and its end is Stop. The head's Earlier and Clear are disabled while a turn runs (as the Line's are hidden).

### 5.5 The answer

On the first `say` line the stage eases to 96×78 (a CSS `height` transition of 200ms; the canvas fits its box every frame, so the squares shrink with it) and stays centred at the top with the question under it in 12.5px dim; the answer draws on the rail under that, as 4.5 but the tiles two across and the items at 48px; the folds of earlier turns above the answer in the same scrolling middle; the foot's field says "Ask a follow-up" with the one button. The middle scrolls; the stage and the question scroll with it (they are part of it), so a long answer is read with the three out of the way.

The answer's `do.open` with `now` goes where it points and closes the takeover, as today (`nav`).

### 5.6 Closing

- ×, Esc (a keyboard, when one is attached), a swipe down (S7), Back (S8).
- The swipe: `touchSwipe({ onDown: close, when: arPhone })` on the screen as today, so the middle's own scroll keeps the gesture until it is at its top; the screen follows the finger and the kit's wash fades with it; past 80px it closes through the kit's leaving copy, else it settles back.
- Closing keeps the conversation (S9) and stops nothing: a turn in flight goes on, and reopening shows where it got to (the Line's `live` state is kept across a close; only the mood is said idle while closed so the ✦ rests). Clear ends the conversation and forgets the draft.
- On close, `history.back()` if the takeover's entry is on top; on `popstate` without it, close without pushing again.

### 5.7 The door

The ✦ (`.phone-ask`, the three on coral) opens it with a tap; it hides while the takeover is open, as today. The takeover's three FLIP from the ✦ to the stage's centre (the same FLIP as the desktop's, from `[data-testid="phone-ask-face"]` when it is drawn), the wash fading beneath; under reduced motion they are simply there.

### 5.8 Today

`TodayFace` is not rendered and its file, styles, sample wiring and tests go (S14). The queue is Today's first band on a phone. The `askAbout({ thread })` seed the band used stays on the shell for any caller.

## 6. Persistence and the practices, in one place

| Practice | Where | How |
|---|---|---|
| Conversation until Clear | both | `AskReal` keeps `active` across a close (today) |
| Draft comes back | both | `__tabMemory.keepDraft("ask", query)` on change, never on a timer (the kit's rule), `draft("ask")` on open, `dropDraft` on send and Clear |
| Conversation survives a reload | both | `keepDraft("ask-thread", active.id)` when a thread is opened or made; on the first open after a reload, `openThread({ id })`; `dropDraft` on Clear or a deleted thread |
| Swipe down closes | phone | `touchSwipe` on the screen, when at the top |
| Back closes | phone | one `pushState(null, "", location.href)` on open; `popstate` closes; ×, Esc and a swipe `history.back()` as they close |
| No surprise keyboard | phone | focus on the dialog on open; the field only on a tap |
| Hold to talk | both | the mic; the three on the phone; Space on the desktop |
| Safe areas | phone | `env(safe-area-inset-*)` on head and foot |
| Rides the keyboard | phone | `--ask-kb` (today) |
| Scroll stays inside | phone | `overscroll-behavior: contain` on the middle; the page under it is not scrolled (the overlay is fixed) |
| One button: the mic, Send, Stop | both | S12 |
| Haptics | phone | S16 |
| Reduced motion | both | S13 |
| Screen readers | both | `aria-modal`, the listbox and `aria-activedescendant` as today, the headline said once whole (`.ask-said`), the reading line `aria-live="polite"` |
| Where speech is absent | both | the one button is Send alone; a held Space or the three's hold says so (`t.noVoice`), once |
| The field | both | `enterkeyhint="send"`, `autocapitalize="sentences"`, `autocomplete="off"`, `spellcheck="false"`, `maxLength=1000` (today) |

## 7. The code: modules and what each owns

| File | Owns | Change |
|---|---|---|
| `legacy/styles/ask.css` | The Line's look | The band and its reading line; the rail; tiles, items, chips, the Do row; the compact home; the takeover (replaces the phone sheet rules, `:170-217`); motion; reduced motion |
| `legacy/pages/ask-real.jsx` | One open Line | The band's markup and the reading line; Send; the takeover's head, stage and foot on a phone; the three's hold on the phone; the history entry; the draft and the thread id through `__tabMemory`; the focus rule (S10); the FLIP from the ✦ |
| `legacy/pages/ask-home.jsx` | The rows | Right now as pills + sentence + Brief me; chips for the questions; 36px rows; "All earlier" as a chip; the Earlier list |
| `legacy/pages/ask-turn.jsx` | The answer | The rail; tiles with the in-tile receipt; items with the kind mark; the Do row (Open as `.btn`, chips); `compact` for the phone (two tiles across) |
| `legacy/pages/ask-text.jsx` | The words | "Ask anything", "Brief me", "Let go to ask", "Type instead", "Thinking…" (exists), "Clear" (exists), en and es |
| `legacy/pages/dashboard-a.jsx`, `styles/dashboard-a-v2.css` | Today | The band's line (`:17`) and rules (`:27-57`) go |
| `legacy/pages/today-face.jsx`, `legacy-bridge/mascot/turn.ts` | The band, its reducer | Deleted; both lists (`legacy-bridge/manifest.ts`, `legacy/Chanlytics.html`) drop the file; `serve-legacy.mjs` keeps `data/mascot.js` for the Line |
| `legacy/pages/app-shell.jsx` | The doors | Nothing but the phone's ✦ `data-testid` on its face, which exists |
| `legacy/CLAUDE.md` | Conventions | The Today and Ask paragraphs say the band is gone and the Line is the Stage and the takeover |
| Tests | | `ask-palette.test.mjs` (the rows' shapes, the tiles' receipt, the Do row, the takeover's structure and its close paths, the draft and the thread id kept); `today-page.test.mjs` (no band on a phone); `today-face.test.mjs` and `mascot-turn.test.mjs` deleted; `legacy-harness.test.mjs` (the two lists); `e2e/today.spec.ts` (the phone test at `:214` replaced: no band, the ✦ opens the takeover); `e2e/ask.spec.ts` (a phone case: full screen, a swipe closes, the draft returns) |

Every edited page and stylesheet bumps its `?v=` in both lists. No new page file: the takeover is the Line on a phone.

## 8. Proof

### 8.1 Node tests (`pnpm test`)

Behaviour tests on the stub React through the real bridge, as `ask-palette.test.mjs` does today, never a source pin:

- the home draws the pills only for counts above zero, the sentence, Brief me, three chips, three rows and the All-earlier chip, in one listbox the keys walk;
- the answer draws the rail's three squares, four tiles, the in-tile receipt on `aria-expanded`, the items' marks, one Open button, the next questions as chips, and the moves in the drawn order;
- on a phone (`matchMedia` stub): the screen is `aria-modal`, the field is not focused on open, a `popstate` closes, × calls `history.back`, a swipe down past 80px closes, a typed draft comes back on the next open, a kept thread id is opened on the first open;
- Today on a phone draws no band and the queue first;
- the two file lists match.

### 8.2 In a browser (a dev server, `/w/<slug>/`, 1440 and 390)

- 1440: the band at 92px, the three at 84×68 breathing; a question shows the reading line and the leapfrog; the answer on the rail with tiles and chips; hover a tile: the receipt line; ↑↓ walk chips, items, Open; Esc closes; ⌘K brings the conversation back.
- 390: the ✦ opens the takeover full screen with the three at 52px; no keyboard; a tap on the field opens it; a hold on the three listens (where the pane allows a mic) and "Let go to ask" shows; a question: the three shrink as the headline streams; tiles two across; a swipe down closes; Back closes; reopening resumes; the draft returns; Today has no band and the queue starts under the header.
- Light and dark; reduced motion.

### 8.3 Production, after the deploy

The three questions plan 3 used, on the salon, on a desktop; on Ruben's phone: the ✦, the takeover, a swipe.

## 9. Delivery

One PR (Ruben: "one plan, one PR"): the kit and the desktop first, the phone second, Today's band last, each task green on its own; the e2e specs run on the nightly.

## 10. Risks

- **R1. The takeover's height and the keyboard.** `100dvh` with `--ask-kb`: the foot must stay above the keyboard on iOS Safari; the Line's `visualViewport` listener does this today and the takeover keeps it.
- **R2. History.** The takeover's entry must carry a null state (S8): Next's app router reloads the app on a Back to a state it did not write, and the shell keeps its own Back bookkeeping out of `history.state` for that reason (`app-shell.jsx:281-284`). Whether the entry is ours is known from a ref set on push, not from the popped state. Verified in the browser on a phone: Back closes the takeover and the page stays.
- **R3. The stage's shrink.** The canvas fits its box every frame only when mounted without `side`; the takeover mounts without it (unlike the band), and the CSS transition of the stage's height does the easing.
- **R4. Scroll and swipe.** The swipe must not fire while the middle scrolls: `touchSwipe` already checks the scroller is at its top (`swipeScrollerAtTop`).
- **R5. The source-scan ratchet.** Deleting `today-face.jsx` and `mascot/turn.ts` may lower pins; the baseline only falls.

## 11. Out of scope

- The Companion (B) and any pointing at a page's rows.
- Tap-to-talk (toggle) and always-listening; answering aloud unasked.
- New tools, kinds or answers; the model (Sonnet 5, per #940).
- A native app's haptics beyond `navigator.vibrate`.
- Count-up figures.

## 12. Approved (Ruben, 23 Sep)

1. F · The Stage for the desktop.
2. The takeover on a phone, replacing Today's band; a swipe closes; persistence as in section 6.
3. "Write the spec and plan with all of the modern sleek practices."
