# The three, on Today: design spec

**Date:** 23 Sep 2026 · **Owner:** Ruben · **Status:** approved (Ruben, 23 Sep) · **Plan:** `docs/superpowers/plans/2026-09-23-the-three-on-today.md`
**Prototype:** `Claude Video/chanlytics-mascot-prototype/index.html` (22 Sep). Its `Character` script is the character below, to the number; its page is throwaway. It is kept on branch `prototype/the-three` as `tooling/prototypes/the-three/` (section 8.6).
**Analysis:** the Today page, the Ask client, the two Ask hooks, the answer renderer, the legacy manifest, the page tests, the harness, the e2e and the role gates were read on `origin/main` at `a4005880` (#874). Every claim about existing code below names its file and line.

## 1. Goal

Give Chanlytics OS a face on the page an owner opens first, and let them ask it a question there.

The face is the mark itself: the three rounded squares that step down a diagonal in the favicon and the wordmark (`chanlytics-site/app/icon.svg`), drawn alive. At rest they hold the logo. Addressed, they huddle and lean in. While Ask reads the workspace they leapfrog down their own stair. While it answers they line up and each word lifts one of them. When it is done they nod. The band sits above the queue, where Ruben placed it, and the question it takes goes to the Ask that already exists: the same route, the same model, the same answer shape, the same threads. No new backend, no new model call, no second way of asking.

## 2. Decisions taken in brainstorming

| # | Decision | Why |
|---|---|---|
| D1 | The face is the logo's three squares, not an orb. | Ruben, 22 Sep: "a unique mascot for our saas rather than copy openais orb". A sphere is now every assistant's face; the three are only Chanlytics'. |
| D2 | It lives on Today, above the queue, and the queue moves down. | Ruben circled the spot on the phone screenshot. The band costs the first actionable row about 300px on a phone (section 4.5). |
| D3 | App colours: the app's ink at rest, its coral only while the agent is at work. Never the logo's blue-teal in the app. | `tokens.css:102-103`: the accent is for live agent state and never decorative. Listening, reading and answering are live agent state. Ruben chose App over Logo on 22 Sep. |
| D4 | One size for every state. Nothing shrinks to make room. | Ruben: "on the other states it seems to get smaller i dont like that". The band is taller than the squares need (232px for squares sized to 200px) so the leap fits at full size. |
| D5 | No docking: the face does not shrink beside the answer while it talks. | Ruben, 22 Sep. |
| D6 | The reading move is the leapfrog and does not change. | Ruben: "the read state animation is amazing". Its numbers are frozen in section 5.3. |
| D7 | The question goes through `window.__ask.send`, the palette's own stream, on a thread of its own. Proposals are not drawn on Today; an answer that carries one hands off to the palette. | `ask.ts:35-56` installs one client for the whole app; `leads-finder.jsx:139-171` already consumes it outside the palette. Cards need approval, undo and gates (`ask-turn.jsx:95-161`); that is the palette's job. |
| D8 | The character is a pure module with no DOM and no clock; a driver owns the canvas; a reducer owns the turn; a page component wires them. | The stub React draws pages on node with no canvas and no `requestAnimationFrame` (`_legacy-react.mjs:64-77`); anything that needs a browser must sit behind a seam the tests can replace. |
| D9 | The listening level comes from the words the recogniser hears, not from the microphone's audio. | The app captures no audio anywhere (no `getUserMedia`, no `AudioContext` in `apps/dashboard/src`); `useAskTalk` hands back words only (`ask-hooks.jsx:16-61`). Words arriving are what the app actually knows; a real level is a later refinement, not a requirement. |
| D10 | The answer is read aloud only when the owner asks, with the palette's own tool. The face does not speak on its own. | `speech.ts:19-35` has no per-word events; a voice with no beats would leave the three still. The delta stream carries the beats instead. |
| D11 | At rest the band is the mark alone, small, at the top of the queue's column; no field, no box. A click opens it; a press held on it listens. | Ruben, 23 Sep, on main: "too much dead space left and right", "the type in chat looks ugly, I'd rather like it open or appear or slide appear when users click to activate the agent". Section 4.6. |
| D12 | Open, the stage is a 620px block centred in the column (the column on a phone), 232px tall; the squares grow with it. Escape, a press outside, or Clear folds it back; a question in flight carries on behind the mark. | The same block as the field it answers into; the character keeps its one size when open (D4). |
| D13 | Before the recogniser starts, the press asks the browser whether the microphone is blocked (the Permissions API, where it exists) and says where to allow it. The site cannot make a browser ask again after a No. | Ruben hit the block on main. A stored denial is silent in Chrome; the old toast said only that permission was needed. |
| D14 | Wider than a phone (721px and up) the band is not drawn. The three are the top bar's Ask button's icon, on every page, and stand on a stage above the palette's conversation. Supersedes D2 and D11–D12 there. | Ruben, 23 Sep, on main: the desktop placement was not a nice place; bring the queue up. The one element on a desktop that is for asking is the Ask button, so the face goes there: one AI, one face, one door. Section 4.7. |
| D15 | Ask has one mood, said by whoever runs a turn (the palette) and followed by every face (`mascot/mood.ts`). | Two faces showing one AI must never disagree: a turn left running in the palette still moves the button. |
| D16 | On a phone the band is always the full face, and the field comes in only when it is woken. Supersedes the compact rest of D11 there. | Ruben, 23 Sep: "on mobile I prefer it expanded always but without the chat type-in bar unless it is activated". |
| D17 | The phone's ✦ is the three too, on its coral, in the button's own foreground; the band on Today says Ask's one mood and follows it like every face. | Ruben, 23 Sep: continue with the ✦. One face everywhere; the ✦ and the band on one screen must never disagree. Section 4.8. |

## 3. Principles the band holds

- **The work stays first, under one band.** Nothing sits above the queue except the standing line and this band. The band adds no words of its own at rest: no greeting, no count, no caption. It moves the queue's head down by about 300px on a phone (section 4.5). That number is the cost of D2 and may not grow.
- **Coral means live.** The three are ink at rest and turn coral the moment they are addressed; they keep it through the nod and cool afterwards. A healthy page shows no coral in the band.
- **Every sentence in the band is someone else's.** The captions are `askText(lang)`'s (`ask-text.jsx:126`); the trace lines are the stream's (`SendEvent.trace`, `api.ts:14-19`); the answer is Ask's. The page writes no sentence and no number of its own.
- **A borrowed read that fails says so.** A failed turn arrives as a `final` whose message says why (`route.ts:149-165`); a transport failure arrives as an `error` event (`api.ts:103-155`). Both are shown as the answer, in `--ink-dim`, with the palette's "Try again". The three shake once and rest.
- **Motion is a morph, never a cut**, and it is quiet enough to leave open all day: a breath, a lean toward the pointer, one small move every 7 to 14 seconds.
- **Reduced motion gets a still pose per state.** The band is still meaningful without motion: stair, huddle, row, and the colour.
- **Nothing runs while nobody looks.** The loop stops when the tab is hidden or the band is off screen, and is torn down when Today unmounts.
- **The mockup draws the same band.** The standalone harness has no `__ask` (`fixture-src.ts:46`); there the field seeds the palette through `askAbout` and the three still live.

## 4. The band on Today

### 4.1 Where

(Now: between the standing line and the queue, on a phone only; section 4.7.) `dashboard-a.jsx:13-26` is the page. The band was the first child of `.dash-a-v2-core`, placed by the grid in the queue's column (Ruben, 23 Sep, on seeing it full width: "it should be on the left column not full width"); the day keeps its column beside both:

```
[ standing line ]
[ the three: a 232px band, the character  ][ The day ]
[ centred, the exchange, the field        ][         ]
[ Your queue                              ][         ]
[ Today ]
[ Worth a look                 ][ While you were away ]
```

Below 1180px the core is one column, in source order: the three, the queue, the day.

The page's flex column and its 12px gap (`dashboard-a-v2.css:6-13`) are unchanged. The composition test that pins the children of `.dash-a-v2-core` and `.dash-a-v2-foot` (`today-page.test.mjs:1285-1294`) is untouched; a new pin covers the new child.

### 4.2 What is in it

`<section class="today-face" data-testid="today-face">` holds three things, in this order:

1. **The stage.** A `<button type="button" class="tf-stage" aria-label={t.talk}>` wrapping a `<canvas aria-hidden="true">`. It is the whole width of the column and 232px tall on every screen; the squares are sized as if it were 200px (one square is 200/3.8 = 52.6px), so the leap has 16px above and below at full size. Pressing and holding the stage listens (section 6.2); a tap with no speech support flashes `t.noVoice`, the way the palette's mic button does (`ask-real.jsx:318`).
2. **The exchange.** Empty at rest, so it takes no height. During and after a turn: the question in `--ink-dim` at 12.5px, then the answer at 16px, `text-wrap: balance`, at most 36ch wide, centred. A caption in `--ink-dim` takes the answer's place while it listens (`t.listening`) and while it reads (the stream's trace text, or `t.thinking` before the first trace). After the answer: the follow-up chips and the doors (section 6.4). The answer text is live-announced the way the palette's is (`aria-live="polite"`, `ask-turn.jsx:188`).
3. **The field.** One input, `placeholder={t.placeholder}` at rest and `t.follow` once a thread is open, `maxLength={1000}` (`ASK_MAX_CHARS`, contracts `ask.ts:20`), with the palette's mic control at its right (`.ask-talk`, press-and-hold, `ask-real.jsx:304-320`) and no submit button: Enter sends. While a turn is in flight the input is disabled with `t.thinking` as its placeholder, as the palette's is (`ask-real.jsx:296`, `.ask-real .cmd-input:disabled`).

The band draws whether or not `TODAY_DATA` has arrived: it needs no data. (The page itself waits for the `today` surface before it draws at all, `app-shell.jsx:742-759`, so in practice the band and the standing line land together.)

### 4.3 Desktop

The column is `--measure-wide` (1480px). The stage spans it; the three sit at its centre at the one size; the exchange and the field are centred at `min(620px, 100%)`. The gap to the queue is the page's 12px.

### 4.4 Phone (720px and below)

The stage is the page's width inside its 16px padding (`mobile.css:114-116`). The field sits under it; the tab bar and the ✦ stay where they are (`mobile.css:455-469`, `ask.css:87-99`): the ✦ opens the palette, the stage's hold talks to the face. The band stays 232px tall. Nothing in the band scrolls sideways.

### 4.5 The cost, measured

On a desktop nothing: the queue is back under the standing line (12px). On a phone the band is the stage (232px)
and the gap under it (12px) at rest, about 244px, and the field (40px) and the exchange add their height only while
the owner is asking. On the prototype at 390px the queue's head sat 423px from the phone frame's top with a 200px
stage; that is the cost of D16 and it is Ruben's.

### 4.6 Compact at rest, open on activation (23 Sep, D11–D13; superseded on a desktop by 4.7, on a phone by D16)

Seen on main, the open band left the queue's column mostly empty (52px squares in a 940px column, a permanent field
under them). So the band has two states, `data-open` on its section:

- **Closed (rest).** The stage alone: 84×64px at the column's left (4px in), squares of 18px, the mark. It breathes,
  fidgets and perks as before. No exchange, no field, no caption. The queue sits 12px under it: on a phone the queue's
  head is about 250px higher than with the open band.
- **Open.** The stage grows to `min(100%, 620px)` centred in the column and 232px tall over 260ms, and the driver
  eases the squares from 18px to 52.6px with it (`Mounted.setSide`, τ 0.1 s). The exchange and the field come in
  under it (220ms, from 6px above). The field takes focus inside the click's own task (a layout effect), so a phone
  shows its keyboard.
- **Waking it.** A press on the stage shorter than 320ms is a click: open, or bring the field back into focus. A
  press held 320ms is a hold: open and listen at once; release stops. Enter or Space on the focused stage is a click.
  A long press never opens the context menu.
- **Folding it.** Escape (when the palette is not open over the page), a press anywhere outside the band, or Clear.
  Escape and an outside press keep the turn: the small mark shows a question still reading or answering, and
  opening again shows where it got to. Clear forgets it and closes.
- **The microphone.** Before the recogniser starts, `useAskTalk.start` asks the Permissions API whether the
  microphone is `denied` for the site (Chrome, Android; Safari and Firefox have no such answer and prompt on their
  own). Denied: no recogniser, and the toast says where to allow it (`micBlocked`, en/es). Otherwise the browser's
  own prompt comes with the start. A browser told No once does not ask again; the site cannot make it.

### 4.7 The face in the header on a desktop, the full face on a phone (23 Sep, D14–D16)

Seen on main, a small mark at the top of the queue's column still sat in the way of the work, and the page's one
element for asking was elsewhere. So the face goes where asking already lives:

- **Desktop and tablet (721px and up).** Today draws nothing between the standing line and the queue: the band is
  `display: none` there (`.today-face`), and the core grid is the queue with the day beside it again. The top bar's
  Ask button (`topbar.jsx`, `tb-ask`) has the three as its icon in place of the sparkle: a 28 by 24px canvas whose
  height holds the whole leap, so the squares are about 6px (`components/ask-face.jsx` AskFace, `components.css`).
  At rest they are the app's ink and breathe; they perk as the pointer comes near; while Ask listens, reads or
  answers they turn coral and act it out, on every page.
- **The palette.** A click on the button, or ⌘K, opens the palette as before. Above the conversation (the first child
  of its main column) is a stage, 80px tall on a desktop and 64px on a phone, with the three on it
  (`ask-stage`, `ask.css`). They grow from the button's size as it opens (`Mounted.setSide`) and act out the turn:
  the huddle while the talk button is held, the leapfrog while it reads, the row with a lift per word while it
  answers, the nod as it lands, a shake on a failure. The input bar's sparkle goes: the stage is the mark.
- **One mood.** `mascot/mood.ts` holds Ask's state (`idle`, `listening`, `thinking`, `speaking`) and passes
  reactions, beats and words heard to every face that follows it (`follow(face, mood)`); a face that starts late
  starts in the state it missed. The palette says it (`ask-real.jsx`): listening while held, thinking until the first
  words (or while an openings answer is read), speaking while they stream or are read aloud, idle otherwise; a beat
  per streamed piece; a nod for a quick answer or an answer that never streamed; a shake for a failure. It says it
  while closed too, so a turn left running still moves the button.
- **Phone (720px and below).** The band stays on Today, between the standing line and the queue, always at the full
  face (232px, squares for 200). The top bar's Ask button is not drawn on a phone; the ✦ opens the palette, whose
  stage is 64px. A tap on the three slides the field in under them, focused; a press held listens; Escape, a tap
  outside or Clear folds the field away (4.6's waking and folding, without the compact size). The click opens it,
  not the pointer's release: after a tap a phone sends its mouse events, and their mousedown would take the focus
  back to the stage from a field focused on the release. A hold's release swallows the click that follows it.

### 4.8 The ✦ is the three (23 Sep, D17)

- **The door on a phone.** The floating ✦ (`app-shell.jsx`, `phone-ask`, 44px, coral, in the tab bar's row) keeps its
  place, size and coral, and draws the three in place of the sparkle (`AskFace tone="accent"`, a 30 by 24px canvas,
  squares about 6px). On a coral button the colour cannot say the state, so the three are the button's own
  foreground (`--accent-fg`: near white in light, near black in dark), fading toward the coral step by step as the
  mark fades and a little brighter at work (`colour.ts` `Tone`, `palette(theme, tokens, "accent")`); the state shows
  as motion: the huddle, the leapfrog, the row, the nod, the shake.
- **One mood on a phone.** The band no longer drives its own character: its phase says the mood (a state only when it
  changes, so a band drawn at rest never interrupts the palette; a nod or a shake as its turn ends; a beat per word;
  a word heard), and its three follow the mood like the ✦ and the palette's stage. A band left mid-question says Ask
  is at rest again. The palette says a word heard too, so its stage leans in while the talk button is held.
- **The page's own tokens, at last.** The app's build writes every `oklch()` token as `lab()`, and the browser reads
  them back that way; the parser read only hex, rgb and oklch, so since #896 the three drew from `colour.ts`'s copies
  of the tokens (right only while the copies match). `parseColor` now reads CSS `lab()` (CIE Lab, D50, to OKLab per
  CSS Color 4), proved on the six strings the running app returned.

## 5. The character

**Superseded 25 Sep 2026** by `2026-09-25-the-three-in-motion-design.md`: the three are drawn as the agency mark and move in depth, turn at rest, and orbit while they read (Ruben: "all approved in app color mode liquid style"). What follows is the character as first built.

The prototype's `Character` is the specification of the motion. The port keeps every constant. This section names them so the port can be checked against them, and the tests pin the ones that matter.

### 5.1 The stair

Three squares, one unit of side, on a diagonal step of `[1.08, 0.64]` units (a hairline gap, unlike the favicon's abutting squares, so they read as three). Corner radius 0.24 of the side at rest. Colours by step: the first darkest, the last lightest, the way the mark fades.

### 5.2 Formations, one per state, all at one size

| State | Formation | The numbers |
|---|---|---|
| Rest | The stair. | Steps `(k − 1) · [1.08, 0.64]`; a breath of 0.035 up and 1.8% larger, running down the stair with a 0.6 rad lag; a lean toward the pointer of up to 0.1 units and 0.07 rad; one fidget every 7 to 14 s (a glance, the last square's hop, a stretch, a tumble, a nod). Corner 0.24. |
| Listening | The huddle. | The middle square at `(0, −0.42 − 0.06·level)`, size `1 + 0.2·level`, in front. The others at `(±(0.72 − 0.08·level), 0.4 − 0.05·level)`, size `0.86 + 0.04·level`, leaning in by 0.16 rad. A sway of 0.03 units at 1.6 rad/s. Corner 0.28. A nod (amplitude 0.55) 0.3 s after the level falls under 0.08 having been over 0.26. |
| Reading | The stair, one step lower and to the left, leaping. | Spread 0.97, centre 1.6, size 0.98, `dy` 0.3, corner 0.22. The leap is section 5.3. |
| Answering | The row. | `x = (k − 1)·1.24`, `y = 0.1 − 0.2·(k − 1)²` (a shallow smile), lean `(k − 1)·0.06`, corner 0.26. Each word lifts the next square in turn (section 5.4). |

Every square follows its formation through a spring: stiffness 15, 13 and 11.5 by step (the first leads), damping ratio 0.62, and a second spring for size (ω 16, ζ 0.5), a third for lean (ω 12, ζ 0.7) and a fourth for squash (ω 24, ζ 0.3). Squash is anchored at the bottom edge; a square stretches along the way it moves, up to 20%.

### 5.3 The leap (frozen)

Every 0.64 s while reading, with a 0.2 s pause between leaps and a 0.55 s breath after every third: the top square crouches (0 to 20% of the leap: squash 0.2, dip 0.05), then flies to 3.25 steps down the stair (one step past the last square) on an arc 1.4 units high, rising before it moves across (its horizontal progress is a smoothstep between 10% and 85% of the flight) and dropping straight onto its step; it turns a quarter turn on the way; the two it passes over duck 0.08 and squash 0.14 as it is above them; it lands at 88% with a squash impulse of 4.2, the others 0.8. The stair's steps then shift by one and the springs slide everyone home. The order of the three cycles `012 → 201 → 120`. Over 13 leaps the leaping square never overlaps another (a separating-axis check in the prototype's scratch tests; the closest pass is 0.005 units).

### 5.4 The other moves

- **A word (`beat(v)`).** In the row: the next square along lifts 0.3·v, tips outward 0.22·v rad, grows 8%, lands with a squash impulse of 2.2·v, over 0.34 s. Anywhere else: a small wave of hops down the stair.
- **Perk (entering listening).** A wave of hops, 0.16 high, 0.06 s apart.
- **Nod.** A dip of 0.12 and a bow of 0.12 rad, 0.07 s apart down the stair, 0.4 s each. On settling after an answer, and after each phrase heard.
- **Shake.** 0.1 units and 0.1 rad at 5 Hz, dying over 0.9 s. On a failed answer.
- **The rhythm of its own.** Answering with no words to follow (a read-aloud, or a stream that stalls for over 1 s): beats at 0.2 to 0.4 s in phrases of 1.4 to 2.4 s with 0.45 s breaths.

### 5.5 Colour

- At rest: `--ink` mixed toward `--bg` by 0.16, 0.44 and 0.66 in the light theme; 0.1, 0.34 and 0.54 in the dark (`tokens.css:163-241`).
- At work: `--accent` mixed toward `--bg` by 0, 0.24 and 0.44 in the light theme; 0, 0.13 and 0.25 in the dark (coral faded far on a dark page turns to brick).
- The change runs down the stair. Addressed, each square lights up at once (0.05 s apart, τ 0.08 s). Done, each keeps its colour for 0.5 s plus 0.09 s per step, through the nod, then cools with τ 0.45 s. Between the two the colour gives up its saturation before its lightness (chroma follows `live³`), so coral cools through grey, not brown.
- All mixing is in OKLab. The three tokens are read from the app root (`--bg`, `--ink`, `--accent`) and re-read when `data-theme` changes on `<html>` (`layout.tsx:61-63`).

## 6. The wiring

### 6.1 The turn, as a reducer

A pure reducer, `turnReducer(state, event)`, owns what the band knows about a question. It is the liftable logic; the component only dispatches to it.

| State | Character | Caption / exchange |
|---|---|---|
| `rest` | idle | The last exchange stays until the next question or "Clear". |
| `listening` | listening, fed `level` | `t.listening`; the interim words appear as the question, in `--ink-dim`. |
| `reading` | thinking | The question; `t.thinking`, replaced by each `trace` text as it arrives. |
| `answering` | speaking, a `beat` per `delta` | The question; the answer so far, with the palette's cursor. |
| `settled` | idle, with a nod | The question; the answer; follow-ups and doors. |
| `failed` | idle, with a shake | The question; the failure sentence in `--ink-dim`; "Try again". |

The character nods on its own when it goes to idle from speaking (`set('idle')`); settling from anywhere else (a fast answer, a read-aloud that ends) the component calls `react('nod')`. A failure always calls `react('shake')` after `set('idle')`.

Events: `pressed`, `heard(words, final)`, `mic-failed(error)`, `asked(text)`, `thread(id, title)`, `trace(text)`, `delta(text)`, `final(message)`, `error(text)`, `cut-off`, `follow(text)`, `cleared`, `left`. The reducer also records `threadId` (from the first `thread` event; reused for follow-ups and every later question on this page visit) and `language` (`A.language(text)` per question, as the palette does, `ask-real.jsx:213`).

Two rules the reducer holds:

- **One turn at a time.** `asked` while `reading` or `answering` is ignored; the field is disabled then (section 4.2).
- **Late events are dropped.** After `left` (Today unmounts) or a newer `asked`, events from the older turn do nothing. There is no way to cancel a turn: `send` has no signal and only the client's 300 s timeout ends it (`api.ts:58-59`, `client/api.ts:133`). The palette has the same property (`ask-real.jsx:120, 164`).

### 6.2 Listening

Press-and-hold on the stage or the field's mic uses `window.AskHooks.useAskTalk({ lang, disabled, onWords, onHeard })` exactly as the palette does (`ask-real.jsx:82-91, 304-320`): `pointerdown` starts, `pointerup`, `pointerleave` and `pointercancel` stop. `onWords(words)` puts the interim words in the exchange and drives the level: each time the words grow, the level is pushed to 0.8 and decays at 5 per second, so the huddle leans in while you are talking and settles when you pause (D9). `onHeard(words)` sends them; `onHeard(null, error)` returns to rest and flashes `t.micDenied` or `t.micFailed` through `usePPToast` (`ask-real.jsx:95-104`).

### 6.3 Asking

`send({ text, threadId, scope: null, surface: "today" }, on)` on `window.__ask` (`api.ts:103-126`; `surfaceFor("today")` is `"today"`, `scopeFor("today", null)` is `null`, `palette.ts:53-72`). Before sending, `A.fast(text)` is tried (`palette.ts:136-174`): a quick answer (who needs me, the calls, an opening) is settled at once with no model turn, the way the palette does it (`ask-real.jsx:194-207`); the three nod and the answer is shown whole. An opening (`kind: "openings"`) reads the calendar route first and shows `t.thinking` while it does.

The stream's events map one to one onto the reducer's: `thread`, `trace`, `delta`, `final`, `error`. A `final` whose `message.failed` is true is `failed` with `message.text`; one with proposals is `settled` with a "Review in Ask" door in place of the cards (D7). If `send` resolves with no `final`, the turn is `failed` with `t.cutOff` (`ask-real.jsx:239`).

When `window.__ask` is absent (the harness, the standalone mockup): `asked(text)` calls `window.askAbout({ prompt: text })` (`dashboard-a-ask.jsx:358-363`) and the band returns to rest; the palette answers.

### 6.4 After the answer

- **Follow-ups**: `A.shape(message, lang).followups` as `.ask-follow-chip`s (the palette's, `ask.css:33-36`, unscoped); pressing one is `asked` on the same thread.
- **The open door**: `shape.open` as an `.ask-link-chip` that navigates (`CHANLY.nav`), the way `AskLinks` does (`ask-turn.jsx`).
- **Continue in Ask**: opens the palette on this thread. This needs one small addition to the palette: `askAbout({ thread: id })` is consumed by `AskReal`'s seed effect (`ask-real.jsx:138-152`) as `openThread({ id })`, next to `fresh` and `prompt`. Today's thread is an ordinary thread and already lists under Recent.
- **Clear**: `cleared` empties the exchange and forgets the thread for this visit.
- **Read aloud**: the palette's tool, `speech.toggle("face", message.text, lang)` from `useAskSpeech` (`ask-hooks.jsx:91-102`). While `speech.speakingId === "face"` the three answer in their own rhythm (section 5.4) and nod when it ends.

### 6.5 What the band does not do

It does not draw proposal cards, does not gate anything (asking is open to every role: `route.ts:37-41`), does not keep threads across visits (the palette does), and does not take the "Ask why" doors from Worth a look (they still seed the palette, `dashboard-a-week.jsx:81`; routing them to the face is a separate decision).

## 7. The code

### 7.1 Modules and what each owns

```
apps/dashboard/src/legacy-bridge/mascot/
  character.ts   the character: states, springs, moves, formations, colour slots. Pure. No DOM, no clock.
                 createCharacter({ seed, calm, fidgets, autoRhythm }) → { set, hear, beat, react, look, away,
                 tick(dt), frame(), still(), events(), state }
  colour.ts      OKLab parse / mix / css; palette(theme, tokens) → { rest[3], live[3] }; colourOf(pal, step, live)
  draw.ts        drawCharacter(ctx, w, h, frame, palette, side): canvas 2D, three rounded squares, the front one last
  driver.ts      mountCharacter(canvas, { tokens, reduced, raf, now, observe }) → { set, hear, beat, react, destroy }:
                 the loop (stops hidden or off screen), DPR sizing, the pointer's gaze, the tokens and their re-read
                 on a theme change, still frames under reduced motion. Every browser API is an injected default.
  turn.ts        turnReducer(state, event), initialTurn(): the band's state machine (section 6.1). Pure.
  index.ts       MASCOT = { mount: mountCharacter, turn: { reduce, initial }, UNITS }; installMascot() → window.__mascot
apps/dashboard/src/legacy/pages/today-face.jsx
                 TodayFace: the band. Hooks with the tf* aliases; useAskTalk, useAskSpeech and usePPToast from
                 window; the reducer through useReducer; the driver mounted in an effect and destroyed on unmount.
                 Object.assign(window, { TodayFace }).
apps/dashboard/src/legacy/styles/dashboard-a-v2.css
                 a "the face" section: .today-face, .tf-stage, .tf-exchange, .tf-field, phone rules at 720px.
```

Boundaries:

- `legacy-bridge/mascot/*.ts` imports nothing but its siblings and types from `@chanlytics/contracts`; the browser rule (`eslint.config.mjs:63-82`) already forbids the rest. It is typechecked (`apps/dashboard/tsconfig.json` includes the bridge and excludes `src/legacy`).
- The page reads the bridge only through `window.__mascot`, `window.__ask`, `window.AskHooks`, `window.askText`, `window.usePPToast`, `window.CHANLY`, the way every Today file does (`today.ts:18-37`, `LegacyApp.tsx:88-125`). `installMascot()` is called in `LegacyApp.tsx` beside `installToday()`.
- No package changes, so no `dist` rebuild (`dist-freshness.test.mjs:41-60`).
- The trade-neutral scan covers both folders (`trade-neutral.test.mjs:19-29`): the words are "the three", "square", "step", never a customer's trade.

### 7.2 Registration

- `today-face.jsx` goes into `manifest.ts` and `Chanlytics.html` in the same place: after `ask-real.jsx`, before `dashboard-a.jsx` (`manifest.ts:49-62`, `Chanlytics.html:92-106`), with `?v=1`. `legacy-harness.test.mjs:71-97` holds the two lists equal.
- `dashboard-a.jsx` gains `<TodayFace />` between `<HeroBrief />` and `.dash-a-v2-core`; `?v=10 → 11`. `ask-real.jsx` gains the `thread` seed; `?v=1 → 2`.
- `legacy/CLAUDE.md`'s Today paragraph becomes four bands.

### 7.3 The stub React's rules, kept

- `TodayFace` holds the same hooks on every render and is drawn on every render (it never returns early); the exchange's variable parts (chips, doors, the cursor) hold no hooks. The hooks-order rule is `business-tab-gestures.jsx:16-21`.
- The driver is mounted in an effect that returns early when `canvasRef.current` is null or has no `getContext`; on the stub, effects run before refs attach (`_legacy-react.mjs:6-8`), so the page test never touches a canvas and the driver is tested on its own with a fake one.
- `requestAnimationFrame`, `ResizeObserver`, `IntersectionObserver` and `matchMedia` are read through the driver's injected defaults and guarded; the stub defines none of the first three.

## 8. Proof

### 8.1 Node tests, `tooling/scripts/tests/` (root `pnpm test`)

- `mascot-character.test.mjs`: ports the prototype's scratch checks: every state for 12 s with no NaN; the leap cycles `012 → 201 → 120`; over 13 leaps no square overlaps another (the separating-axis check); every corner stays inside a 358×232 band with squares sized for 200 through a whole question and 30 s of fidgets; a nod follows a phrase heard; a shake, a nod and a perk each appear in `events()`; `calm` draws still poses and ignores reactions; the colours at rest and at work in both themes, as `rgb()` strings.
- `mascot-turn.test.mjs`: the reducer through a question (`pressed → heard → asked → thread → trace → delta → final`), a fast answer, a failed final, a transport error, a cut-off, a follow-up on the same thread, a late event after `left`, and `asked` while busy.
- `mascot-driver.test.mjs`: a fake canvas with a recording 2D context and injected `raf`/`now`: mount draws, `set` changes what is drawn, `destroy` cancels the frame and removes listeners, hidden stops the loop, reduced motion draws once per change.
- `today-face.test.mjs` on `_legacy-react.mjs`, next to `today-page.test.mjs:34-63`: the band draws with no data; the field sends through a recorded `__ask.send` and the exchange shows each event's words; a failed final shows its sentence and "Try again"; follow-ups send on the thread; "Continue in Ask" calls `askAbout({ thread })`; with no `__ask` the field calls `askAbout({ prompt })`; the composition pin: `.dash-a-v2`'s children are `HeroBrief, TodayFace, div, TodayCard, div` in that order.
- `today-page.test.mjs`: the new child pinned; nothing else changes. No `readCode`/`readRaw` pin anywhere (`source-scan-ratchet.test.mjs:79-91`).
- `ask.test.mjs`: the `thread` seed, next to the `fresh` and `prompt` cases.

### 8.2 Typecheck, lint, format

`pnpm -r typecheck` for the bridge modules; `pnpm lint` for the browser-import rule and the hooks rules on the page; `pnpm format:check` (the pre-commit hook does the same, `project_chanlytics_hygiene_gates`).

### 8.3 E2E, `e2e/today.spec.ts`

- Desktop: the band is present (`today-face`); asking one of the questions `A.fast` answers without the model (contracts `ask.ts:875-879`, the `needs` kind) settles at once and the exchange shows it; "Continue in Ask" opens `ask-real`.
- Phone (390×844, touch): the band, the field and the tab bar are all visible; no sideways scroll.
- A model turn from the band runs only under `E2E_PAID_MODEL=1`, like `e2e/ask.spec.ts:13-19`.

### 8.4 The harness and the mockup

`pnpm e2e:local` runs the spec on the harness, which has no `__ask` (`fixture-src.ts:46`): the band draws and the field seeds the palette, and the fast-path test is skipped there. The standalone mockup draws the band from `today-sample` as it draws the rest.

### 8.5 Seen on the live site

Before the PR merges: Today at 390px and 1280px in Ruben's signed-in pane, light and dark, asking one real question, reading the console, and a DOM probe for sideways scroll, gradients and a second typeface in the band (the probe `project_chanlytics_business_tab` used).

### 8.6 The prototype, kept

`Claude Video/chanlytics-mascot-prototype/` is committed as `tooling/prototypes/the-three/` on the throwaway branch `prototype/the-three` (069223a3, pushed 23 Sep), never on main; the app runs it with `node tooling/prototypes/the-three/serve.mjs`. The question it answered: yes, the three work as the face; the read move is the one Ruben loves; App colours; no docking; one size.

## 9. Risks and what is out of scope

- **A turn cannot be cancelled.** Leaving Today mid-turn drops the answer on the floor (the reducer ignores late events) while the server finishes and saves it; the thread still holds it for the palette. The same is true of the palette today. A cancel signal in `send` is a separate change.
- **The listening level is words, not sound.** If the recogniser is slow to deliver interim results the huddle leans in late. A real level needs audio capture, which the app has never done; it is a refinement to decide on after the band is live.
- **Desktop size.** The one size was judged on a 200px band; on a 1480px column it is a small figure in a wide band. Growing it on wide screens is a later call, not part of this.
- **Not in scope:** a name for the three; docking; a voice of its own; routing "Ask why" to the band; proposal cards on Today; any change to the Ask route or model.

## 10. Delivery

One PR from the `cm-face` worktree, branch `design/the-three-on-today`, in this order: the bridge modules with their tests; the page component, its CSS and the two registrations; the palette's `thread` seed; the e2e; the docs. Each step green on `pnpm test`, `pnpm -r typecheck` and `pnpm lint` before the next. Main merged in before the PR opens and again if it moves. The plan file breaks this into tasks once the spec is approved.
