# The Ask button on a phone: design spec

**Date:** 25 Sep 2026 · **Owner:** Ruben · **Status:** approved (Ruben, 25 Sep: "z3 is the one lets go with that one")
**Lab:** the review page "The Ask button on a phone" (https://claude.ai/artifact/C1kD88D9y9sB5H4rqtE8AB, versions 1 to 16), every option live on the real engine in both themes over a slice of Today.

## 1. Why

The phone's ✦ was a coral disc with the three on it, always on. In this design system the primary act is ink (`.btn-primary`: ink on the page) and the coral accent is a state, kept for live, now and needs-you (Today's tab, an open reply, a set-up nudge, the needs-you line, the next visit's time). A coral ✦ said "live" about something that was not, and was the loudest object on every screen at rest. Ruben, 25 Sep: "it just feels redundant we have enough coral accents already". The top bar's face already had the right rule, ink at rest and coral while Ask works.

Ruben's other asks on the way: the three too small inside the disc; the "AI" cues people know (a shimmer, a breath) so the button reads as the AI's; the usage from the plan (`2026-09-25-usage-system-design.md`, "The face's halo") as part of the same object; then, once the beam carried the usage's colour, no arc over it; the under-80% colour not the ink but the mainstream AI families; the rim closer to the three.

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| B1 | The ✦ is the cards' own surface (`--bg-raised`, a hairline of `--line-strong`, `--shadow-md`), 40px inside a 44px tap, with the three on it in ink at rest and coral while Ask works, exactly the top bar's rule. | The system's colours, kept: ink primary, coral as a state. |
| B2 | The three fill the disc: the face canvas 36 by 30, so the mark at rest is about 26px across (it was about 20 in 30 by 24). | Ruben: "the three logo is too small inside". |
| B3 | A beam travels the rim (`.ask-beam`): a short arc, one lap in 8 s, the ink at 42% at rest. While Ask works it goes to full, laps in 2.5 s, and its light spills onto the inside of the rim (a blurred inner ring, 18% at rest, 68% at work); nothing glows outside. | The AI cue, without a colour at rest; Ruben: "too much glow effect … make the glow display more on the inside and more subtle on the outside". |
| B4 | While Ask works the beam's colour is the usage's standing: under 80% the AI's own three, a blue head (`oklch(0.72 0.14 250)`) through violet (`0.68 0.18 320`) to a gold tail (`0.8 0.15 70`), the Apple Intelligence family, short; from 80% `--warn`; at 100% `--danger`. At rest the same beam in grey, whatever the usage. | Ruben: the usage's colours "so that users see their usage via the beam colors when it is active"; the under-80% "should be more of the mainstream ai vibe colors"; of the four families shown, Z3. |
| B5 | No halo arc on the ✦. The beam is the usage there; the number lives in the Stage's standing line and Ask's usage card, as the usage spec has them. | Ruben: "remove the overlapping usage color that begins to cover the circle". Consequence, said and accepted: at rest the ✦ says nothing about usage, and the band, not the share. |
| B6 | The standing comes from the usage surface, `window.__USAGE` `{ standing: ok \| warned \| over }`, repainted on `surface:usage`. The surface does not exist yet (the usage spec is on #1039); until it does the beam keeps the AI's colours, and the mockup's stub says 89%, amber. | Nothing in the UI states a fact the database cannot support; the seam is named so the surface lands into it. |
| B7 | Reduced motion: the beam does not turn (both pseudo-elements' animations off); the disc, the three's still frame and the colours stay. | The app's rule for every motion. |
| B8 | **The read on arrival, and the notice (added 25 Sep).** On a phone, a page arriving (the ✦'s first face, since the shell's files compile in the browser for seconds after the app boots; or the address changing to another page) is read: the three, where they stand, take the AI's colour and turn once or twice (the mood's `glow`: the mark at rest in coral, a turn now and another within two seconds; never the orbit, which is Ask reading) for 2.2 s, or as long as the boot takes up to 4 s, then the ink again, unless something needs you (Ask's own standing: people, runs or searches waiting, `rightNowParts`; or a notification not read yet, the bell's `unread`): then the three stay lit at rest until nothing does. What needs you is asked each time the light is decided (a surface either is built from landing, the bell moving, Ask closing, the phone coming back), never remembered: a remembered yes kept the three lit after Ask said nobody waits and the bell was all read (26 Sep). The light goes as Ask opens and comes back as it closes. The same page again within 20 s is not read again; a walk within a page (a lead's peek, a view's flags) is the same page. The needs-you count rising (`inbox:counts`) makes the three hop once. Never while Ask is open (the Line owns the mood), never over a mood already busy, never on a desk. `legacy-bridge/mascot/arrival.ts` (pure), `legacy-bridge/arrival.ts` (the wiring), `mascot-arrival.test.mjs`. | Ruben: the ✦ "just appears as the monotone gray idle so users never get to see the colour states… on page reload the first few seconds it looks active, like it is turned on reading the site with me, and after a while it goes back to idle unless I navigate to a different page"; "a couple seconds is enough, it must be very very subtle and sophisticated, not performative; scope to mobile for now." A read that rides the real boot, and a notice that rides a real count, so neither is decoration. |
| B9 | **The dot (added 25 Sep; supersedes B3, B4 and B5).** No hairline and no beam: the disc is the cards' surface lifted by their shadow alone, and the state is the app's own word for one, a 7px dot on the rim at the top right with the surface's ring around it, the usage's standing and nothing else: nothing under 80%; from 80% the amber dot "needs you" wears everywhere here, breathing (2.6 s); at 100% red (`.ask-disc`, `AskDisc`, `data-usage`; reduced motion stills the breath). What needs you on the page is the three's own colour: lit where they stand as a page arrives and kept lit while something waits (B8); the states while Ask works. Ruben, after the first cut: "the dot only if it is past 80%, amber then red; before 80% let's not display it; and if there is something needing attention on the page it will stay in colour idle instead of going back to grey." | Ruben, of four asks on the canvas's v10 (the beam alone; the beam alone in coral; the three in the AI's colours; the dot, the one that was mine): "let's go with 4." It adds no vocabulary: a person who has learnt the badges reads it; the ✦ is the quietest thing on the screen until the AI does something. |

## 3. The code

- `components/ask-face.jsx`: `AskFace` takes `ground="raised"` (the fades down the stack toward `--bg-raised` instead of `--bg`, read through the driver's `env.tokens`); `AskDisc` draws the disc and reads the standing and the mood (`data-usage`, `data-work`).
- `styles/ask.css`, the phone section: the button transparent and 44px; `.ask-disc` the 40px disc (the cards' surface, their shadow, no hairline) with its dot (`::before`, `--dot` and `--dot-on` from the attributes, `ask-dot-breathe`); the beam of B3 to B5 is gone (B9).
- `pages/app-shell.jsx`: the button holds `AskDisc` under the face, the face on the raised ground.
- `data/bridge-stubs.jsx`: `__USAGE` for the mockup only.

## 4. Proof

- `ask-palette.test.mjs`: the beam's `data-usage` follows the usage surface (`ok` with none, `ok`, `warned`, `over`) and `data-work` the mood.
- `e2e/phone.spec.ts` keeps its pins: the ✦ visible with its face, in the tab bar's row, clear of the tabs, opening the takeover.
- The app on a phone viewport (dev server): the disc at rest with the grey beam, and with Ask reading the blue-violet-gold beam; the mockup at 89% shows amber.

## 5. Out of scope

- The top bar's face and the Stage: unchanged. The usage spec's halo on them is that spec's, not built here.
- The usage surface itself.
