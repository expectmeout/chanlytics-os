# One ground on a phone

**Asked by Ruben, 22 October 2026:** "when i open a page like a thread etc the page opens without the aurora background
then quickly flickers in delayed, but when i swipe back it works perfectly … also on iphone safari the toolbar on the
bottom of the page below the mobile menu has like a solid background instead of glassy over the page background on
these thread pages … analyze end to end to pinpoint the total refactor or change needed to truly permanently fix this
the actual right way." Written against `dd483523a`, after six changes to the ground in one day (#1796 to #1804).

## What was measured

Production at an iPhone 15 Pro's size in WebKit, the e2e owner, dark theme, the push's motion paused and stepped
(`push-frames.cjs` in the session's notes):

**The flicker.** A thread pushed in over Conversations wears its own copy of the page's ground while it slides, so
the list held under it does not show through, and places the copy by how far down the screen the page stood as it
was taken up (`--going-at`, `kit/motion/held-list.ts goingAt`). That measure is read one microtask before the frame's
top is measured again for the thread: `--going-at: 134px` (the list's head) and, in the same millisecond,
`--frame-top: 134px -> 0px`. For the whole 420 ms the pane stands at the window's top with its ground at
`background-position: 0 -134px`; as it lands the copy goes and the window's own light shows 134 px lower. The pool at
the top left, the one strong pool of the dark theme, is off the screen while the page slides and appears as it lands.
The right edge's ground column of the frame at 90% matches the landed frame at a shift of 133 px. A person's page:
130 px read, 44 px stood, 86 px of shift. A thumb carrying a page back reads a settled layout, so it is right, as he says.

**The toolbar.** Safari 26 draws only the document's flow under its toolbar, never a fixed or sticky box
(`reference_safari26_bottom_strip_rules`), and the window's layer of light is fixed and ends at the layout viewport
anyway. What the glass blurs is what the document paints in its next 93 px under the window's foot (852 − 759 on an
iPhone 15 Pro): on Today, the Calendar, a person's page and his long lists, rows and words; on a thread, and on the thin
e2e workspace's lists, nothing but the canvas, which is the flat paper. "Glassy" today means "there is content under the
toolbar", never the light.

**The pattern that fails.** The light is painted by six painters, each aligned to the window by its own means: the
window's layer (fixed), the frame's top (`::before`/`::after`, an inset of `-frame-top-at`), the Calendar's bar
(`::before`/`::after`, an offset of `-(frame-top-at + frame-top)` and `--cal-bar-h`), a carried page (four copies,
`--going-at` from JavaScript), the band over the frame's top while a page is carried (`.held-band`, fixed), and the page
name's letters (a text clip iOS cannot fix). Each of the day's fixes moved one copy and left the others to drift.

## The rule

**Every painter of the ground is the same picture at the same place, and nothing measures.** The picture is the
paper, the three pools and the list's ground, a screen wide and the largest screen tall (`100vw 100lvh`), laid from the
window's top; a painter may clip it or stand it on a box, never offset it by a measure of a page.

## What changes

### 1. One shared rule (mobile.css, 720px and under; tokens.css)

- tokens.css declares the picture once: `--surface-page-ground: var(--surface-page-top), var(--surface-page-light),
  var(--surface-page-under)`. The phone's values of `--surface-page-top` (the paper over the list's wash) and
  `--surface-page-under` (the list's ground) move from mobile.css's `.app-root[data-theme], .held-band` into the
  tokens' own theme block under the phone's width, so the document (`html`, which carries `data-theme` from the boot
  script) and anything drawn on the body resolve them as the app's root does.
- mobile.css paints the ground in one rule whose subjects are every painter: `html:has(.app-root)`, `.pg-light`,
  `.frame-top::before`, `.frame-top::after`, `.carry-ground`, the Calendar's `.cal-head::before` and `::after`. The rule
  says the paper as the colour, `--surface-page-ground` as the image, `no-repeat`, and `100vw 100vh` then `100vw 100lvh`
  as the size. Each painter's own rule keeps its geometry only (position, inset, clip, mask, opacity, and the Calendar
  bar's `::after` offset).
- The wash and the ground's stops that mark the foot (`calc(100% - 300px)`, `calc(100% - 120px)`, `100%`) read
  `100dvh` instead of `100%`, so the glow by the tab bar follows the bar as the toolbar comes and goes, as it does today;
  the pools, placed by percentages of the picture, stand still. The picture's last 93 px, under the toolbar while it is
  up, hold the lowest pool and the glow's tail over the paper.

### 2. The carry sheet (kit/motion/held-list.ts; components.css, clients.css, live.css, campaigns.css)

- A carried page paints no ground of its own. `[data-going]` keeps what places it over the list (the grid area, the
  z-index, the list drawn again under it) and loses its background and its shadow.
- `bandOver` becomes `groundOver`: one `div.carry-ground`, fixed to the window (`inset: 0`), `z-index: 201` (over the
  frame's top at 200, under the page at 202 and the page's own still copies at 204), `pointer-events: none`, drawn on
  the body as the band was (the page's ancestors make no stacking context of their own, so the sheet and the page
  interleave by their z-index alone). It is cut `--foot-clear` short of the window's foot
  (`clip-path: inset(0 0 var(--foot-clear, 0px) -64px)`; the left reach keeps its shadow), so it never stands on the
  point Safari reads for its bottom band. It carries the page's shadow on its leading edge. It is moved with the page
  by the swipe's `along`, as the band was, and removed as the carry ends. `.held-band` goes.
- `goingAt` and `--going-at` are deleted: `carriedOver`, the thread's `ixGoing` and the campaigns' `cmGoing` toggle
  `data-going` and show the held list, nothing more.

### 3. The light under Safari's toolbar

The document itself (`html:has(.app-root)`) is a painter of the picture, in flow, at the document's top. On the screen
the window's fixed layer covers it exactly (the two are one picture at one place); under the toolbar, where Safari
draws the document alone, the canvas's copy shows, so the toolbar is glass over the light on every page. The canvas's
colour stays the paper (the tokens alone declare it), so Safari's bar over the clock reads as it does today. A long page
scrolled past its first screen shows its rows over the paper there, as it does today.

## What stays

- The frame's top is an opaque box of the paper with its ground under it; its edge fades once the page has gone under.
- The held list, its still picture, the cut at the frame's top's end and at the foot, the row kept where it stood,
  the frame's top held while a page is carried: all as they are.
- `--list-wash-line` (#1804): the wash begins at one line, 134 px under the window's top, on every page.
- The desk and the 721 to 900 px widths: untouched.

## Tests

- `tests/styles/page-light/paper-at-the-edges.test.mjs`: the foot's stops read `100dvh`; every rule that paints the
  stack with `--surface-page-under` is the one shared rule, laid `100vw 100lvh`, and `html` is among its subjects;
  `.carry-ground` carries the paper (in place of `.held-band`); no stylesheet reads `--going-at`.
- `tests/shell/views/held-list.test.mjs`: the sheet goes first among what goes with the page (`carry-ground`), fixed
  to the window, and nothing is written to the page's style as it is grabbed.
- Seen on a local server at an iPhone's size: a thread's and a person's ground column at 90% of the push matches the
  landed frame at a shift of 0 (133 and 86 today); the canvas paints the picture; nothing fixed stands on Safari's
  bottom point at rest, during the push or as it lands.

## What only a phone can confirm

That Safari draws the canvas's copy under its toolbar (its own rules say so), and that the sheet's cut keeps its band
away. The pull request goes up without merging itself, for his look at its preview on an iPhone.

## Out of scope

The alternative of painting the light in flow alone with a blurred glass head (iOS's look: the pools scroll away with
the page), and any retuning of the pools' tints or the glow.
