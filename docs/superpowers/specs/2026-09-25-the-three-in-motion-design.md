# The three, in motion: design spec

**Date:** 25 Sep 2026 · **Owner:** Ruben · **Status:** approved (Ruben, 25 Sep: "all approved in app color mode liquid style")
**Supersedes:** section 5 of `2026-09-23-the-three-on-today-design.md` (the character). Sections 6 onward (the wiring, the mood) stand.
**Lab:** the review page "The Three in Motion" (https://claude.ai/artifact/2xojqJX3up6bJjmCAHjAEP, versions 1 to 3), where the shipped character ran beside this one at the four sizes it lives at.

## 1. Why

Ruben, 25 Sep: "the idle state shakes too much but i do like the idle animations", and "smarter, next gen, futuristic, more complex, clean". Then, on the lab: make the leapfrog "better cleaner"; the random flip or turn "should happen a bit more across the others"; the agency site "had a better designed version of the three logo, get the exact svg"; "for reading state can you make it move in circular motion kind of like an orb".

The shipped character was tuned on 22 Sep for a 232px band on Today ("calm enough to sit above the queue all day"). Then D14 to D17 moved it into the top bar's 30×24 icon on every page (a square of 5.9px), the Stage (16.6px) and the phone's ✦, and the motion was never re-tuned for that size. Measured over five simulated minutes at rest with a pointer moving about the page:

| Cause | Shipped | Why it reads as shaking at 6px |
|---|---|---|
| The squash spring | ζ 0.3, ω 24 | about two wobbles at 3.6 Hz after every hop, tumble and landing |
| The moves | a tumble of 86°, landings squashed 20% | sized for a 200px band |
| The gaze | the pointer listener is on the window | every mouse move anywhere tilts the icon up to 8°; 0% of frames still |
| The fidgets | every 7 to 14 s, forever | something always moving in the corner of the eye |

## 2. Decisions

| # | Decision | Why |
|---|---|---|
| M1 | The three are drawn as the agency mark: three tiles on a 45° diagonal, a step of 0.52 of a side on both axes (each over the last by 48%), corners 0.26, the last tile on top, each casting the mark's shadow on the one beneath. | Ruben: the agency site's mark is the better designed one (`Chanlytics Agency/components/primitives.jsx` `Logo`: a tile 0.5 of the size, offset 0.26 of it per step, radius 0.13 of it, `box-shadow: 0 2px 6px -2px rgba(28,62,160,.4)`; `assets/favicon.svg`). The shipped stair came from the OS site's favicon (`chanlytics-site/app/icon.svg`). |
| M2 | App colours: the app's ink at rest, its coral at work (D3 stands), faded toward the page by step so the top tile is always the most lit. | Ruben chose "app color mode". A stack reads right only when its top tile catches the most light: lightest on a light page, brightest on a dark one. |
| M3 | The tiles move in depth: a tile lifts toward you (it grows 5% and its shadow falls lower and softer) and sets down. Nothing squashes. Springs at platform grade: movement ζ 0.86, size and turn ζ 0.9, elevation ζ 1. | Material 3 moves things at ζ 0.9 and changes colour at ζ 1.0; Apple's default spring has no bounce. |
| M4 | At rest: turns across all three. A tile turns a quarter in place, lifted a little as it turns; or a cascade down the stack (0.13 s apart), two neighbours turning opposite ways like gears, or the top tile half round. Also a glance, a rise, a stretch, a bow. One moment every 6 to 11 s. | Ruben likes the turn and wants more of it, across the tiles. |
| M5 | Reading is an orbit: the three circle a ring tilted 65° toward you, its long axis 18° down to the right like the mark's own diagonal, axis and tilt swaying (±8°, ±6°) so the path traces a sphere; a lap every 2 s, the pace breathing ±12%. The nearest tile is drawn 14% larger, lifted and lightest, the farthest small and deep, and the layers follow the depth. A read that lands surges it. Leaving it, each tile keeps its position and speed and the springs take it into the next formation. | Ruben: "circular motion kind of like an orb". The leapfrog (D6) is retired. |
| M6 | Liquid: on WebGL2 the three are one field, joined by a smooth minimum whose radius is 0 at rest (the exact mark) and grows while they listen and read, so tiles that pass close fuse like mercury. Without WebGL2 the layered mark is drawn in 2D. | Ruben chose "liquid style". |
| M7 | Light: each tile carries a charge, drawn as colour toward its strongest (the full ink at rest, a hotter coral at work), never as motion: a standby wave down the stack every 6.5 s at rest, the voice in the middle tile, the nearest tile on the orbit, each word, each read that lands, a sweep when an answer is done. | The Liquid choice includes the light channel. |
| M8 | An icon (a face inside a button: the top bar's Ask, the ✦) is attended while the pointer is within 90px of its button or the button has focus. Alone for 18 s it gives one stretch and goes quiet: no breath, turns only, one every 14 to 24 s. It wakes when someone comes near. An open face (the Stage, the takeover) is always attended. | Calm while you work, alive when you look; the turns Ruben likes stay. |
| M9 | The three look at a pointer only while it is near: within 110px of an icon, 240px or 1.6 widths of an open face, fading to nothing at that radius. A press on an icon's button gathers the stack; the release lets it go. | The page-wide lean was the largest source of restlessness. |
| M10 | Gestures scale with the drawn size: 45% of a move at a 6px tile, the whole move from 36px. | A move sized for 60px is a twitch at 7px. |
| M11 | Ask's mood gains a pulse: the Line says one for each trace the stream sends (`ask-real.jsx`), and every face follows it. | The orbit shows the reads landing. |
| M12 | The static `three` icon (`icons.jsx`, the door to find leads) is the agency mark too: filled, the top tile whole, each tile beneath cut where the tile above it sits grown by 1, so a hairline gap tells them apart without a mask. | One face everywhere. |

## 3. The numbers

- **The box:** everything the tiles do, shadows included to one σ, fits 3.8 wide by 3.2 tall tiles (`FIT`), with the tiles drawn 0.225 of a tile above the canvas's middle (`CENTRE_Y`) because shadows fall. In the top bar's 30×24 canvas a tile is 7.5px (the shipped square was 5.9px); in the Stage's 84×68, 21px.
- **The shadow:** offset 0.154 of a side, blur σ 0.23, spread −0.154 at rest; lifted, the offset grows by 0.2, σ by 0.15 and the spread by 0.06, the alpha falls by 30%; pressed, tighter. It leans away from where the tiles look. Its colour: the page's ink at α 0.3 on a light page, black at 0.55 on a dark one, a deep coral at 0.38 on the ✦.
- **The fades, back to top:** light rest 0.16, 0.44, 0.66 and work 0, 0.24, 0.44; dark rest 0.54, 0.34, 0.1 and work 0.25, 0.13, 0; on the ✦ 0.46, 0.26, 0.06 toward the coral.
- **The formations:** rest, the stack; listening, the middle tile forward at (0, −0.3), 16% larger and lifted with the voice, the others at ±0.66 tucked behind; answering, a row 1.06 apart; reading, the ring of radius 1.05.
- **Measured at rest in the top bar, five simulated minutes:** alone, still 95% of the time with a quarter turn about every 16 s; near, still 90% with a moment about every 9 s; no squash anywhere; no lean from across the page.

## 4. The code

- `legacy-bridge/mascot/character.ts`: the character (pure). New: `detail(px)`, `attend(v)`, `press(down)`, `pulse(v)`; frames carry `charge`, `lift` and `layer`; `quietAfter`; `STEP`, `CORNER`, `FIT`, `CENTRE_Y`. `UNITS` (the Today band) is gone.
- `colour.ts`: the palette with the top tile the most lit, the strongest colours, the shadow per ground; `labOf`, `labRgb`, `labToCss(lab, alpha)`.
- `draw.ts`: the layered 2D drawing and `tilesOf`, the tile looks both drawings read. A shadow with a negative spread is drawn from a shape far off the canvas, its shadow brought back by its offset.
- `liquid.ts`: the WebGL2 drawing; `liquidSupported` tries once per page; a lost context is rebuilt on restore; a face that goes lets its context go (`WEBGL_lose_context`).
- `driver.ts`: an icon or an open face read from where the canvas sits; attention, near-only gaze, press, the gestures' scale; WebGL2 where it is supported; a frame that would draw what is already there is skipped, so a quiet icon costs nothing.
- `mood.ts`: `pulse`. `ask-real.jsx`: a pulse per trace. `icons.jsx`: the static mark.

## 5. Proof

- `mascot-character.test.mjs`: no NaN in any state; the rest pose is the mark; the orbit keeps the three on the ring, spread, lap after lap, the nearest largest, lifted, lightest and on top; a pulse surges it; leaving it never jumps; the turns come in all four kinds and stay in place; an icon goes quiet and wakes; gestures scale with size; calm draws a still ring for reading; everything fits the box, shadows included.
- `mascot-colour.test.mjs`, `mascot-driver.test.mjs`, `mascot-mood.test.mjs`, and `ask-palette.test.mjs` (a pulse for the read that lands).
- Eleven one-line mutants (the nearest no larger, a release that forgets, a breath that never stops, a turn that does not rotate, the page-wide gaze, every frame drawn, the draw order reversed, a context kept, the old dark order, a pulse that reaches no face, a trace that pulses nothing): every one fails a test.

## 6. Out of scope

- The logo's own blue colours in the app (the lab's "Logo" option): Ruben chose the app's.
- The lab's afterimage, voice ring and glow (the "Light" option's extras): not part of Liquid.
