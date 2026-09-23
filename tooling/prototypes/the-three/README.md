# The three: prototype

**PROTOTYPE. Throwaway.** It answers one question: does the Chanlytics mark, three rounded squares
stepping down a diagonal, work as the app's living face? It should be calm enough to sit above the
queue all day, and clear when it listens, reads and answers.

## Run it

    node tooling/prototypes/the-three/serve.mjs

Then open http://127.0.0.1:3230. Opening `index.html` directly works too. The
`chanlytics-mascot-prototype` entry in `.claude/launch.json` starts the same server in the app's
browser pane.

Add `?view=today` to open above a still copy of the phone's Today page, `?palette=logo` for the
logo's colours, `?quiet` to start with reading aloud off, and `?still` to see the still frames
that reduced motion gets.

## What it does

| When | The three |
|---|---|
| At rest | They hold the logo's stair, large enough to own the band, and breathe one after another. They lean toward the pointer. Every 7 to 14 seconds one small thing happens: a glance, a hop, a stretch, a tumble or a nod. |
| Listening | They perk up and huddle: the middle square comes forward to you and grows with your voice; the other two tuck in behind it, tilted toward it, and draw closer the louder you talk. The huddle sways a little. When you stop, they nod. |
| Reading | They return to the stair and leapfrog down it. The top square crouches, rises, tumbles over the other two (which duck) and drops onto the far step with a squash, and the stair slides home. They take a breath after every third leap. |
| Answering | They line up in a row with a shallow smile, and each word lifts one of them in turn, tipping outward and landing with a squash. With no words to follow, they keep a rhythm of their own. |
| Done | A nod runs through them, then they fold back into the stair and cool to rest. |
| Can't answer | One shake of the head, then rest. |

**App colours** use the app's ink at rest and its coral only while the agent works, the rule
`tokens.css` sets for the accent. The colour comes on at once when you address it, and cools
slowly after its nod, through grey rather than brown. **Logo colours** are the mark's own blue
to teal.

## The page

- **Stage** shows the character alone. **On Today** shows it above a still copy of the phone's
  Today page, with a working ask field: a band 232px tall whose squares are sized for 200px, so the
  leap has room without the squares changing size.
- **Try it** has the four states, four reactions, a voice slider, the real microphone, "Say a word",
  and reading answers aloud with the browser's own voice (a hop on each word it reaches).
- **Walk through** has four scenarios as steps: a question, can't answer, talk over it, left alone.
- Press the character to talk to it through the microphone.

## What's worth keeping

`index.html` holds three scripts.

1. **Character**, the character itself. Pure: no DOM and no clock of its own. Feed it a state, a
   voice level, a word, a reaction or where the pointer is, step it with `tick(dt)`, and `frame()`
   says where each square is. Springs carry every change of state; the moves are keyframed on top.
2. **drawCharacter**, canvas 2D, three rounded squares, given the size of one square in pixels.
3. The page, which is throwaway.

## Into Chanlytics OS

When it's approved:

- `Character` becomes `legacy-bridge/mascot/character.ts`, testable in node on its own.
- `drawCharacter` and a small driver sit beside it. The driver owns the loop, the pointer and the
  audio level, and pauses when the page is hidden or the canvas is off screen.
- A Today component places it above the queue and maps Ask's stream onto it:
  - `listening` while the press-and-hold microphone is down, fed its level;
  - `thinking` from the question until the first `delta`;
  - `speaking` from the first `delta`, with `beat()` on each delta and on each word read aloud;
  - `idle` on `final`, where it nods, and `react('shake')` on `error`.
- Per the prototype skill, this folder goes onto a throwaway branch when the real code lands.

`attic/orb.js` is the first direction, a cloud sphere, set aside on 22 Sep 2026. `shots/` holds
motion strips captured while building this.
