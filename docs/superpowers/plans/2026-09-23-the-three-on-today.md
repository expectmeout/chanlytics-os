# The three, on Today: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the mark's three squares on Today, above the queue, alive, and let the owner ask them a question through the Ask that already exists.

**Architecture:** A pure character module (springs, moves, formations, colour steps), a pure colour module, a canvas drawing, a driver whose browser APIs are all injected defaults, and a pure turn reducer live in `apps/dashboard/src/legacy-bridge/mascot/` and are published on `window.__mascot` by `installMascot()`. One legacy page file, `pages/today-face.jsx`, draws the band, wires the palette's talk and speech hooks and `window.__ask.send` to the reducer and the driver, and is placed between the standing line and the queue. The spec is `docs/superpowers/specs/2026-09-23-the-three-on-today-design.md`; the motion's numbers come from the prototype at `Claude Video/chanlytics-mascot-prototype/index.html` (its `Character` script).

**Tech Stack:** TypeScript in the bridge (strict, typechecked by `pnpm -r typecheck`), classic-script JSX for the page, node:test on `tooling/scripts/tests/_legacy-react.mjs` (root `pnpm test`), Playwright for the e2e, no new dependencies.

**Worktree and branch:** `Claude Video/cm-face`, branch `design/the-three-on-today`, off `origin/main` at `a4005880`. One PR at the end. Never `cd` into the shared checkout.

> **As built (23 Sep):** executed inline in `cm-face`, one commit per task. Where the code differs from the blocks
> below: test imports are `../../../apps/...` (three levels up from `tooling/scripts/tests/`); the turn's
> `mic-failed` became `released` with a `before` phase, dispatched from an effect on the talk hook's `listening`
> flag, because the hook says nothing when a press ends with no words; the band's doors row is `.tf-doors`, since the
> palette's `.ask-msg-links` is scoped to `.ask-real`; the driver's first test counts frames by `clearRect`, because
> the three grow in from nothing at birth; the character test keeps a size as a number, because `frame()` hands back
> live objects; the band's test helper draws over the cells as they are (`start()` forgets them first); the harness
> server (`e2e-harness/server.mjs`) got its own `/data/mascot.js` route beside the mockup's; and a commit chain never
> ends in `| grep -v`, which exits 1 when it filters every line and stops the chain. On seeing it, Ruben moved the
> band from full width into the queue's column: `<TodayFace />` is the first child of `.dash-a-v2-core`, placed by
> three grid rules (band column 1 row 1, `.tq` column 1 row 2, `.td-day` column 2 over both rows; one column below
> 1180px in source order), and the composition pins and the e2e read that order.

---

### Task 0: The worktree can run the gates

**Files:** none changed.

- [ ] **Step 1: Install**

Run, in `cm-face`: `corepack pnpm install --frozen-lockfile`
Expected: ends with `Done in …s`; `.husky/_` now exists, so the pre-commit hook (Prettier over staged files) runs on every commit below.

- [ ] **Step 2: Baseline**

Run: `corepack pnpm test 2>&1 | tail -5`
Expected: the last lines read `# pass N`, `# fail 0`. Write N down: every later run must be at least N plus the tests this plan adds.

Run: `corepack pnpm -r typecheck` and `corepack pnpm lint`
Expected: both exit 0.

---

### Task 1: Colour, in OKLab

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/mascot/colour.ts`
- Test: `tooling/scripts/tests/mascot-colour.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
/**
 * The three's colour: the app's tokens parsed as tokens.css writes them, mixed in OKLab, and the step
 * from rest to work that gives up saturation before lightness, so coral cools through grey, not brown.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseColor, labToCss, palette, colourOf, mixLab } from "../../apps/dashboard/src/legacy-bridge/mascot/colour.ts";

const rgb = (css) => css.match(/\d+/g).map(Number);

test("parses hex, rgb and oklch, and white comes back white", () => {
  assert.deepEqual(rgb(labToCss(parseColor("#ffffff"))), [255, 255, 255]);
  assert.deepEqual(rgb(labToCss(parseColor("#000"))), [0, 0, 0]);
  assert.deepEqual(rgb(labToCss(parseColor("rgb(226, 73, 71)"))), [226, 73, 71]);
  const coral = rgb(labToCss(parseColor("oklch(0.62 0.19 25)")));
  assert.ok(coral[0] > 200 && coral[1] < 110 && coral[2] < 110, `coral, got ${coral}`);
  assert.equal(parseColor("var(--accent)"), null);
  assert.equal(parseColor(""), null);
});

test("the app palette: ink at rest, the accent at work, three steps each, light and dark", () => {
  const light = palette("light");
  const dark = palette("dark");
  for (const p of [light, dark]) {
    assert.equal(p.rest.length, 3);
    assert.equal(p.live.length, 3);
  }
  // rest fades from ink toward the page: the first step darkest on a light page, lightest on a dark one
  const L = (lab) => lab[0];
  assert.ok(L(light.rest[0]) < L(light.rest[1]) && L(light.rest[1]) < L(light.rest[2]));
  assert.ok(L(dark.rest[0]) > L(dark.rest[1]) && L(dark.rest[1]) > L(dark.rest[2]));
  // the first live step is the accent itself
  assert.equal(labToCss(light.live[0]), labToCss(parseColor("oklch(0.62 0.19 25)")));
  // the page's own tokens win over the defaults
  const own = palette("light", { accent: "#0000ff" });
  assert.deepEqual(rgb(labToCss(own.live[0])), [0, 0, 255]);
});

test("between rest and work the colour loses saturation before lightness", () => {
  const p = palette("light");
  const mid = rgb(colourOf(p, 0, 0.5));
  const chroma = (c) => Math.max(...c) - Math.min(...c);
  const restC = chroma(rgb(colourOf(p, 0, 0)));
  const liveC = chroma(rgb(colourOf(p, 0, 1)));
  assert.ok(chroma(mid) < (restC + liveC) / 2, `halfway is greyer than a straight mix: ${mid}`);
});

test("the shade between two steps mixes their colours", () => {
  const p = palette("light");
  const a = rgb(colourOf(p, 0, 1)), b = rgb(colourOf(p, 1, 1)), m = rgb(colourOf(p, 0.5, 1));
  for (let i = 0; i < 3; i++) assert.ok(m[i] >= Math.min(a[i], b[i]) - 1 && m[i] <= Math.max(a[i], b[i]) + 1);
  // past the last step is the last step
  assert.deepEqual(rgb(colourOf(p, 2.7, 1)), rgb(colourOf(p, 2, 1)));
});

test("mixLab is linear in OKLab", () => {
  const a = parseColor("#000000"), b = parseColor("#ffffff");
  const m = mixLab(a, b, 0.5);
  assert.ok(Math.abs(m[0] - 0.5) < 0.01);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-colour.test.mjs`
Expected: FAIL, `Cannot find module … mascot/colour.ts`.

- [ ] **Step 3: Write the module**

```ts
/**
 * Colour for the three, in OKLab, so a change of mood blends the way the eye expects. It parses the app's
 * tokens as tokens.css writes them (oklch), plus hex and rgb, and holds the one rule about mood: between rest
 * and work a colour gives up its saturation before its lightness, so coral cools through grey, not brown.
 */
export type Lab = readonly [number, number, number];
export type ThemeName = "light" | "dark";
export interface ThemeTokens {
  bg?: string | null;
  ink?: string | null;
  accent?: string | null;
}
export interface Palette {
  rest: [Lab, Lab, Lab];
  live: [Lab, Lab, Lab];
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function rgbToLab(r: number, g: number, b: number): Lab {
  const R = lin(r), G = lin(g), B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function labToCss([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const to = (v: number) => Math.round(gam(clamp01(v)) * 255);
  const r = to(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = to(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = to(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return `rgb(${r},${g},${b})`;
}

/** '#rrggbb', '#rgb', 'rgb(r, g, b)' or 'oklch(L C H)': the forms the app's tokens take. Anything else is null. */
export function parseColor(value: string | Lab | null | undefined): Lab | null {
  if (Array.isArray(value)) return value as Lab;
  const str = String(value ?? "").trim().toLowerCase();
  let m: RegExpExecArray | null;
  if ((m = /^#([0-9a-f]{6})$/.exec(str))) {
    const n = parseInt(m[1], 16);
    return rgbToLab(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  if ((m = /^#([0-9a-f]{3})$/.exec(str))) {
    const [r, g, b] = [...m[1]].map((c) => parseInt(c + c, 16) / 255);
    return rgbToLab(r, g, b);
  }
  if ((m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(str))) {
    const L = parseFloat(m[1]) / (m[2] ? 100 : 1);
    const C = parseFloat(m[3]);
    const h = (parseFloat(m[4]) * Math.PI) / 180;
    return [L, C * Math.cos(h), C * Math.sin(h)];
  }
  if ((m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(str))) {
    return rgbToLab(+m[1] / 255, +m[2] / 255, +m[3] / 255);
  }
  return null;
}

export const mixLab = (p: Lab, q: Lab, t: number): Lab => [
  p[0] + (q[0] - p[0]) * t,
  p[1] + (q[1] - p[1]) * t,
  p[2] + (q[2] - p[2]) * t,
];

/** The app's tokens (tokens.css), for when the page gives none. */
const TOKENS: Record<ThemeName, Required<ThemeTokens>> = {
  light: { bg: "oklch(0.985 0.003 80)", ink: "oklch(0.18 0.01 260)", accent: "oklch(0.62 0.19 25)" },
  dark: { bg: "oklch(0.16 0.005 260)", ink: "oklch(0.96 0.004 80)", accent: "oklch(0.7 0.18 28)" },
};
/** How far each square fades toward the page, first to last, the way the mark fades. On a dark page coral
 * faded far turns to brick, so there it fades less. */
const FADES: Record<ThemeName, { rest: [number, number, number]; live: [number, number, number] }> = {
  light: { rest: [0.16, 0.44, 0.66], live: [0, 0.24, 0.44] },
  dark: { rest: [0.1, 0.34, 0.54], live: [0, 0.13, 0.25] },
};

/** Three colours at rest (the ink) and three at work (the accent), first square to last. */
export function palette(theme: ThemeName, tokens: ThemeTokens = {}): Palette {
  const base = TOKENS[theme];
  const bg = parseColor(tokens.bg) ?? parseColor(base.bg)!;
  const ink = parseColor(tokens.ink) ?? parseColor(base.ink)!;
  const accent = parseColor(tokens.accent) ?? parseColor(base.accent)!;
  const f = FADES[theme];
  return {
    rest: [mixLab(ink, bg, f.rest[0]), mixLab(ink, bg, f.rest[1]), mixLab(ink, bg, f.rest[2])],
    live: [mixLab(accent, bg, f.live[0]), mixLab(accent, bg, f.live[1]), mixLab(accent, bg, f.live[2])],
  };
}

export const clonePalette = (p: Palette): Palette => ({
  rest: [p.rest[0], p.rest[1], p.rest[2]],
  live: [p.live[0], p.live[1], p.live[2]],
});

const ease = (cur: number, tgt: number, dt: number, tau: number) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
const easeLab = (cur: Lab, tgt: Lab, dt: number): Lab => [
  ease(cur[0], tgt[0], dt, 0.3),
  ease(cur[1], tgt[1], dt, 0.3),
  ease(cur[2], tgt[2], dt, 0.3),
];
/** Moves `cur` toward `tgt` by one frame, so a theme change is a blend, and returns `cur`. */
export function easePalette(cur: Palette, tgt: Palette, dt: number): Palette {
  for (let k = 0; k < 3; k++) {
    cur.rest[k] = easeLab(cur.rest[k], tgt.rest[k], dt);
    cur.live[k] = easeLab(cur.live[k], tgt.live[k], dt);
  }
  return cur;
}

/**
 * The colour of a square: `shade` is which step it stands on (0 to 2, continuous while it moves between
 * steps), `live` how far it is from rest (0) to work (1). Saturation follows live³, lightness follows live.
 */
export function colourOf(pal: Palette, shade: number, live: number): string {
  const c = clamp01(shade / 2) * 2;
  const i = Math.min(1, Math.floor(c));
  const f = c - i;
  const r = mixLab(pal.rest[i], pal.rest[i + 1], f);
  const w = mixLab(pal.live[i], pal.live[i + 1], f);
  const s = live * live * live;
  return labToCss([r[0] + (w[0] - r[0]) * live, r[1] + (w[1] - r[1]) * s, r[2] + (w[2] - r[2]) * s]);
}
```

- [ ] **Step 4: Run the test**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-colour.test.mjs`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/legacy-bridge/mascot/colour.ts tooling/scripts/tests/mascot-colour.test.mjs
git commit -m "The three: colour in OKLab, the app's tokens, coral cools through grey"
```

---

### Task 2: The character

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/mascot/character.ts`
- Test: `tooling/scripts/tests/mascot-character.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
/**
 * The three, run on node: every state for seconds with no NaN; the leapfrog cycles the three through every
 * order and never passes one square through another; a nod follows a phrase heard; the moves leave events;
 * calm draws still poses; and every corner stays inside the band on Today at the one size.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCharacter, UNITS, STATES } from "../../apps/dashboard/src/legacy-bridge/mascot/character.ts";

const DT = 1 / 120;
const run = (ch, seconds, each) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    ch.tick(DT);
    if (each) each(ch.frame());
  }
};
const finite = (f) => f.squares.every((s) => ["x", "y", "size", "squash", "rot", "stretch", "shade", "live"].every((k) => Number.isFinite(s[k])));

test("every state and every reaction for seconds, no NaN anywhere", () => {
  const ch = createCharacter({ seed: 7 });
  run(ch, 2, (f) => assert.ok(finite(f)));
  for (const s of STATES) {
    ch.set(s);
    ch.hear(0.7);
    run(ch, 3, (f) => assert.ok(finite(f), s));
  }
  ch.set("idle");
  for (const k of ["nod", "hop", "shake", "flip", "yawn", "look"]) {
    assert.equal(ch.react(k), true);
    run(ch, 3, (f) => assert.ok(finite(f), k));
  }
});

test("at rest it is the mark: three steps down a diagonal, first to last", () => {
  const ch = createCharacter({ seed: 1, enter: false, fidgets: false });
  run(ch, 2);
  const [a, b, c] = ch.frame().squares;
  assert.ok(a.x < b.x && b.x < c.x);
  assert.ok(a.y < b.y && b.y < c.y);
  assert.deepEqual([a.step, b.step, c.step], [0, 1, 2]);
  assert.ok(a.live < 0.01 && c.live < 0.01);
});

test("reading is the leapfrog: the order cycles, every square leads once, and none passes through another", () => {
  const ch = createCharacter({ seed: 3, enter: false, fidgets: false });
  ch.set("thinking");
  const orders = new Set();
  let flights = 0, overlaps = 0;
  const corners = (s) => {
    const h = s.size / 2, c = Math.cos(s.rot), sn = Math.sin(s.rot);
    return [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [s.x + x * c - y * sn, s.y + x * sn + y * c]);
  };
  const apart = (A, B) => {
    const pa = corners(A), pb = corners(B);
    for (const poly of [pa, pb]) for (let i = 0; i < 4; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % 4];
      const nx = -(y2 - y1), ny = x2 - x1, len = Math.hypot(nx, ny);
      const pr = (p) => p.map(([x, y]) => (x * nx + y * ny) / len);
      const a = pr(pa), b = pr(pb);
      if (Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b)) <= 0) return true;
    }
    return false;
  };
  run(ch, 12, (f) => {
    orders.add(f.squares.map((s) => s.step).join(""));
    const j = f.squares.find((s) => s.front === 1);
    if (!j) return;
    flights++;
    for (const s of f.squares) if (s !== j && !apart(j, s)) overlaps++;
  });
  assert.equal(overlaps, 0, `${overlaps} overlapping frames of ${flights} in flight`);
  assert.ok(flights > 100, `it flew for ${flights} frames`);
  assert.deepEqual([...orders].sort(), ["012", "120", "201"]);
  assert.ok(ch.events().filter((e) => e.kind === "leap").length >= 10);
});

test("listening: the middle square comes forward and grows with the voice; a nod follows a phrase", () => {
  const ch = createCharacter({ seed: 5, enter: false, fidgets: false });
  ch.set("listening");
  run(ch, 1.5);
  const quiet = ch.frame().squares[1];
  ch.hear(0.9);
  run(ch, 1.5);
  const loud = ch.frame().squares[1];
  assert.ok(loud.size > quiet.size + 0.1, `${loud.size} > ${quiet.size}`);
  assert.equal(loud.front, 1);
  ch.hear(0);
  run(ch, 1.5);
  assert.ok(ch.events().some((e) => e.kind === "nod"), ch.events().map((e) => e.kind).join(","));
});

test("answering: the row, and a beat lifts one square", () => {
  const ch = createCharacter({ seed: 9, enter: false, fidgets: false, ownRhythm: false });
  ch.set("speaking");
  run(ch, 2);
  const before = ch.frame().squares.map((s) => s.y);
  assert.ok(Math.abs(before[0] - before[2]) < 0.05, "the row is level");
  ch.beat(0.9);
  let lifted = 0;
  run(ch, 0.2, (f) => { lifted = Math.max(lifted, before[0] - f.squares[0].y); });
  assert.ok(lifted > 0.15, `lifted ${lifted}`);
});

test("done: idle after speaking nods on its own; a failure's shake is a reaction", () => {
  const ch = createCharacter({ seed: 2, enter: false, fidgets: false });
  ch.set("speaking");
  run(ch, 1);
  ch.set("idle");
  assert.equal(ch.events().at(-1).kind, "nod");
  ch.react("shake");
  assert.equal(ch.events().at(-1).kind, "shake");
});

test("left alone it fidgets, rarely", () => {
  const ch = createCharacter({ seed: 11, enter: false });
  run(ch, 40);
  const fidgets = ch.events().map((e) => e.kind);
  assert.ok(fidgets.length >= 2 && fidgets.length <= 6, fidgets.join(","));
});

test("calm: one still pose per state, the reactions ignored", () => {
  const ch = createCharacter({ calm: true });
  ch.set("listening");
  ch.still();
  const f = ch.frame();
  assert.equal(f.squares[1].front, 1);
  assert.ok(f.squares.every((s) => s.live === 1));
  assert.equal(ch.react("hop"), false);
  ch.set("idle");
  ch.still();
  assert.ok(ch.frame().squares.every((s) => s.live === 0));
});

test("everything stays inside the band on Today: 358 by 232, squares sized for 200", () => {
  const ch = createCharacter({ seed: 5, enter: false, fidgets: true });
  const halfW = 358 / (200 / UNITS) / 2, halfH = 232 / (200 / UNITS) / 2;
  let worstX = 0, worstY = 0;
  const watch = (f) => {
    for (const s of f.squares) {
      const h = (s.size / 2) * (1 + s.stretch);
      const e = h * (Math.abs(Math.cos(s.rot)) + Math.abs(Math.sin(s.rot)));
      worstX = Math.max(worstX, Math.abs(s.x) + e);
      worstY = Math.max(worstY, Math.abs(s.y) + e);
    }
  };
  run(ch, 12, watch);
  ch.set("listening"); ch.hear(0.9); run(ch, 3, watch);
  ch.set("thinking"); run(ch, 8, watch);
  ch.set("speaking"); run(ch, 4, watch);
  ch.set("idle"); run(ch, 30, watch);
  assert.ok(worstX <= halfW, `${worstX} across of ${halfW}`);
  assert.ok(worstY <= halfH, `${worstY} up or down of ${halfH}`);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-character.test.mjs`
Expected: FAIL, `Cannot find module … mascot/character.ts`.

- [ ] **Step 3: Write the module**

This is the prototype's `Character` script, typed. Every number is the prototype's.

```ts
/**
 * The three: the Chanlytics mark as a character. Pure: no DOM, no clock of its own.
 *
 * Three rounded squares step down a diagonal, as they do in the logo. Feed the character what happens (a
 * state, a voice level, a word, a reaction, where the pointer is), step it with tick(dt), and frame() says
 * where each square is, in squares, from the centre. Each square follows a spring toward where the state
 * wants it, so a change of state is a morph with follow-through, never a cut; hops, nods, leaps and tumbles
 * are keyframed on top of the springs.
 *
 * Spec: docs/superpowers/specs/2026-09-23-the-three-on-today-design.md, section 5.
 */
export type CharacterState = "idle" | "listening" | "thinking" | "speaking";
export type Reaction = "nod" | "hop" | "shake" | "flip" | "yawn" | "look";
export interface ReactionParams {
  amp?: number;
  h?: number;
  dur?: number;
  only?: number;
}
export interface SquareFrame {
  /** which step of the stair it stands on: 0 first, 2 last */
  step: number;
  /** its colour step, continuous while it moves between steps */
  shade: number;
  /** 0 at rest, 1 at work */
  live: number;
  x: number;
  y: number;
  size: number;
  squash: number;
  rot: number;
  stretch: number;
  angle: number;
  /** 1 while it is drawn over the others */
  front: 0 | 1;
}
export interface CharacterFrame {
  corner: number;
  squares: SquareFrame[];
}
export interface CharacterEvent {
  kind: string;
  at: number;
}
export interface CharacterOptions {
  seed?: number;
  /** drop in from above at birth */
  enter?: boolean;
  /** a small move every 7 to 14 seconds at rest */
  fidgets?: boolean;
  /** a rhythm of its own while speaking with no beats */
  ownRhythm?: boolean;
  /** reduced motion: still poses, no moves, no rhythm */
  calm?: boolean;
}
export interface Character {
  readonly state: CharacterState;
  readonly clock: number;
  set(next: CharacterState): boolean;
  hear(level: number): void;
  voice(level: number, live?: boolean): void;
  beat(strength?: number): void;
  react(kind: Reaction, params?: ReactionParams): boolean;
  look(gx: number, gy: number, near: boolean): void;
  away(): void;
  tick(dt: number): void;
  frame(): CharacterFrame;
  still(): void;
  events(): CharacterEvent[];
}

export const STATES: readonly CharacterState[] = ["idle", "listening", "thinking", "speaking"];
/** A band of height H holds UNITS squares: one square is H / UNITS. The stair needs 2.3 squares of height, the
 * leap 3.6 up and down and 4.3 across, so the canvas is wider than tall and a little taller than the band that
 * sets the size (232px for squares sized to 200). */
export const UNITS = 3.8;

const TAU = Math.PI * 2;
const STEP: readonly [number, number] = [1.08, 0.64];
interface Layout {
  corner: number;
  spread: number;
  centre: number;
  dy: number;
  scale: number;
}
const LAYOUT: Record<CharacterState, Layout> = {
  idle: { corner: 0.24, spread: 1, centre: 1, dy: 0, scale: 1 },
  listening: { corner: 0.28, spread: 1, centre: 1, dy: 0, scale: 1 },
  thinking: { corner: 0.22, spread: 0.97, centre: 1.6, dy: 0.3, scale: 0.98 },
  speaking: { corner: 0.26, spread: 1, centre: 1, dy: 0, scale: 1 },
};
const FOLLOW = [15, 13, 11.5] as const;
const LEAP = { dur: 0.64, crouch: 0.2, land: 0.88, height: 1.4, reach: 3.25, across: [0.1, 0.85] as const };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (cur: number, tgt: number, dt: number, tau: number) => cur + (tgt - cur) * (1 - Math.exp(-dt / tau));
const inOut = (u: number) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);

function slotPos(state: CharacterState, k: number, extra: number): [number, number] {
  const L = LAYOUT[state];
  const f = (k - L.centre) * L.spread * extra;
  return [STEP[0] * f, STEP[1] * f + L.dy];
}
interface Pose {
  x: number;
  y: number;
  rot: number;
  scale: number;
  front: 0 | 1;
}
/** Where square k wants to be in a state: position, lean, size, and whether it is in front. */
function pose(state: CharacterState, k: number, level: number, extra: number): Pose {
  if (state === "listening") {
    // the huddle: the middle square comes forward and grows with your voice; the other two tuck in behind
    // it, tilted toward it, and draw in closer the louder you are
    if (k === 1) return { x: 0, y: -0.42 - 0.06 * level, rot: 0, scale: 1 + 0.2 * level, front: 1 };
    const side = k - 1;
    return { x: side * (0.72 - 0.08 * level), y: 0.4 - 0.05 * level, rot: -side * 0.16, scale: 0.86 + 0.04 * level, front: 0 };
  }
  if (state === "speaking") {
    // the row: side by side, a shallow smile, each word lifting one of them in turn
    return { x: (k - 1) * 1.24, y: 0.1 - 0.2 * (k - 1) * (k - 1), rot: (k - 1) * 0.06, scale: 1, front: 0 };
  }
  const [x, y] = slotPos(state, k, extra);
  return { x, y, rot: 0, scale: LAYOUT[state].scale, front: 0 };
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Body {
  i: number;
  step: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  sc: number;
  vsc: number;
  q: number;
  vq: number;
  rot: number;
  vrot: number;
  shade: number;
  shadeO: number | null;
  live: number;
  ox: number;
  oy: number;
  osc: number;
  oq: number;
  orot: number;
  z: 0 | 1;
  front: 0 | 1;
  abs: [number, number] | null;
  px: number | null;
  py: number | null;
  svx: number;
  svy: number;
  out: SquareFrame;
}
type MoveKind = "leap" | "hop" | "push" | "nod" | "shake" | "flip" | "yawn" | "look";
interface Move {
  kind: MoveKind;
  t0: number;
  h: number;
  dur: number;
  delay: number;
  falloff: number;
  crouch: number;
  only: number | null;
  amp: number;
  v: number;
  spin: number;
  dir: [number, number];
  jumper: Body | null;
  who: Body | null;
  from: [number, number] | null;
  landed: boolean;
  landedSet: Set<number>;
  order: Map<number, number> | null;
  group: Body[] | null;
  glance: number;
}

export function createCharacter(options: CharacterOptions = {}): Character {
  const { seed = 7, enter = true, fidgets = true, ownRhythm = true, calm = false } = options;
  const rand = seeded(seed);
  let state: CharacterState = "idle";
  let stateAt = 0;
  let prevLive = 0;
  let clock = 0;
  const W: Record<CharacterState, number> = { idle: 1, listening: 0, thinking: 0, speaking: 0 };
  let heard = 0;
  let voiced = 0;
  let voiceLive = false;
  let level = 0;
  const hist: { t: number; v: number }[] = [];
  let corner = LAYOUT.idle.corner;
  let spreadAdd = 0;
  let perk = 0;
  const gaze = [0, 0];
  const gazeV = [0, 0];
  let fidgetGaze: [number, number] = [0, 0];
  let pointer: { g: [number, number]; near: boolean } | null = null;
  let pointerAge = 1e9;
  let nextLeapAt = 0;
  let leaps = 0;
  let nextFidgetAt = 6 + rand() * 3;
  let autoNextAt = 0;
  let autoPhraseEnd = 0;
  let onsetArmed = true;
  let loud = false;
  let quietFor = 0;
  let lastWordAt = -1e9;
  let wordAt = 0;
  const moves: Move[] = [];
  const events: CharacterEvent[] = [];
  const entering = enter && !calm;

  const bodies: Body[] = [0, 1, 2].map((i) => {
    const [x, y] = slotPos("idle", i, 1);
    return {
      i, step: i, x, y: entering ? y - 0.45 : y, vx: 0, vy: 0, sc: entering ? 0 : 1, vsc: 0, q: 0, vq: 0, rot: 0, vrot: 0,
      shade: i, shadeO: null, live: 0, ox: 0, oy: 0, osc: 0, oq: 0, orot: 0, z: 0, front: 0, abs: null,
      px: null, py: null, svx: 0, svy: 0,
      out: { step: i, shade: i, live: 0, x, y, size: entering ? 0 : 1, squash: 0, rot: 0, stretch: 0, angle: 0, front: 0 },
    };
  });

  const note = (kind: string) => {
    events.push({ kind, at: clock });
    if (events.length > 20) events.shift();
  };
  const move = (kind: MoveKind, over: Partial<Move> = {}): void => {
    moves.push({
      kind, t0: clock, h: 0.3, dur: 0.42, delay: 0.075, falloff: 1, crouch: 0.22, only: null, amp: 1, v: 1, spin: 0,
      dir: [0, -1], jumper: null, who: null, from: null, landed: false, landedSet: new Set(), order: null, group: null, glance: 0,
      ...over,
    });
  };
  const byStep = () => new Map(bodies.map((b) => [b.i, b.step]));
  const atStep = (k: number) => bodies.find((b) => b.step === k) ?? null;
  /** A word: in the row, the next square along lifts and tips outward; anywhere else, a small wave of hops. */
  function beatWave(v: number): void {
    if (state === "speaking") {
      const k = wordAt++ % 3;
      move("push", { who: atStep(k), v: 0.5 + 0.5 * v, dir: [0, -1], spin: (k - 1) * 0.7 });
    } else move("hop", { h: 0.08 + 0.2 * v, dur: 0.3, delay: 0.065, falloff: 0.82, crouch: 0.16 });
  }
  function levelAt(t: number): number {
    for (let n = hist.length - 1; n >= 0; n--) {
      const a = hist[n];
      if (a.t <= t) {
        const b = hist[n + 1];
        return b && b.t > a.t ? a.v + (b.v - a.v) * ((t - a.t) / (b.t - a.t)) : a.v;
      }
    }
    return hist.length ? hist[0].v : 0;
  }

  // Each move adds to the squares' offsets for this frame, and says when it is finished.
  const MOVES: Record<MoveKind, (a: Move, t: number) => boolean> = {
    // the first square tumbles over the other two to the far end of the stair
    leap(a, t) {
      const j = a.jumper;
      if (!j) return true;
      const p = t / LEAP.dur;
      if (p < LEAP.crouch) {
        const c = Math.sin((Math.PI * p) / LEAP.crouch);
        j.oy += 0.05 * c;
        j.oq += 0.2 * c;
        return false;
      }
      if (!a.from) a.from = [j.x, j.y];
      // it rises before it moves across and drops straight onto the step, a little past the next one, so it
      // never grazes the square it leaves or the one it lands beside
      const to = slotPos("thinking", LEAP.reach, 1 + spreadAdd);
      const u = Math.min(1, (p - LEAP.crouch) / (LEAP.land - LEAP.crouch));
      const k = clamp((u - LEAP.across[0]) / (LEAP.across[1] - LEAP.across[0]), 0, 1);
      const across = k * k * (3 - 2 * k);
      j.abs = [a.from[0] + (to[0] - a.from[0]) * across, a.from[1] + (to[1] - a.from[1]) * u - LEAP.height * 4 * u * (1 - u)];
      j.orot += (Math.PI / 2) * inOut(u);
      j.z = 1;
      j.shadeO = Math.min(2, 3 * across);
      if (u < 1) {
        for (const b of bodies) {
          if (b === j) continue;
          const d = Math.exp(-(((j.abs[0] - b.x) / 0.6) ** 2)); // the other two duck as it passes over them
          b.oy += 0.08 * d;
          b.oq += 0.14 * d;
        }
      } else if (!a.landed) {
        a.landed = true;
        j.vq += 4.2;
        for (const b of bodies) if (b !== j) b.vq += 0.8;
      }
      if (p < 1) return false;
      // it stays where it landed, one step past the end; the stair shifts, and the springs bring it back
      j.x = to[0];
      j.y = to[1];
      j.vx = 0;
      j.vy = 0;
      j.shade = 2;
      for (const b of bodies) b.step = b === j ? 2 : b.step - 1;
      return true;
    },
    // a hop in place; with a delay per step, a wave of hops down the stair
    hop(a, t) {
      a.order ??= byStep();
      a.group ??= a.only != null ? bodies.filter((b) => b.step === a.only) : bodies.slice();
      let busy = false;
      for (const b of a.group) {
        const k = a.only != null ? 0 : (a.order.get(b.i) ?? 0);
        const amp = Math.pow(a.falloff, k);
        const p = (t - k * a.delay) / a.dur;
        if (p >= 1) {
          if (!a.landedSet.has(b.i)) {
            a.landedSet.add(b.i);
            b.vq += 3 * (a.h / 0.3) * amp;
          }
          continue;
        }
        busy = true;
        if (p < 0) continue;
        if (p < a.crouch) {
          const c = Math.sin((Math.PI * p) / a.crouch);
          b.oy += 0.035 * c * amp;
          b.oq += 0.16 * c * amp;
        } else {
          const u = (p - a.crouch) / (1 - a.crouch);
          b.oy -= a.h * amp * 4 * u * (1 - u);
        }
      }
      return !busy;
    },
    // a word: one square lifts, tips a little, and lands with a squash
    push(a, t) {
      const b = a.who;
      if (!b) return true;
      const dur = 0.34;
      const p = t / dur;
      if (p >= 1) {
        if (!a.landed) {
          a.landed = true;
          b.vq += 2.2 * a.v;
        }
        return true;
      }
      const s = Math.sin(Math.PI * p);
      b.ox += a.dir[0] * 0.3 * a.v * s;
      b.oy += a.dir[1] * 0.3 * a.v * s;
      b.orot += a.spin * 0.22 * a.v * s;
      b.osc += 0.08 * a.v * s;
      b.z = 1;
      return false;
    },
    // a dip and a small bow, running down the stair
    nod(a, t) {
      a.order ??= byStep();
      let busy = false;
      for (const b of bodies) {
        const k = a.order.get(b.i) ?? 0;
        const p = (t - k * 0.07) / 0.4;
        if (p >= 1) continue;
        busy = true;
        if (p < 0) continue;
        const s = Math.sin(Math.PI * p);
        b.oy += 0.12 * a.amp * s * (1 - 0.15 * k);
        b.oq += 0.1 * a.amp * s;
        b.orot += 0.12 * a.amp * s;
      }
      return !busy;
    },
    // no: a quick shake that dies away
    shake(a, t) {
      a.order ??= byStep();
      if (t > 0.9) return true;
      for (const b of bodies) {
        const tt = t - (a.order.get(b.i) ?? 0) * 0.045;
        if (tt < 0) continue;
        const e = Math.exp(-tt * 5) * Math.sin(tt * TAU * 5);
        b.ox += 0.1 * e;
        b.orot += 0.1 * e;
      }
      return false;
    },
    // the first square tumbles backwards, in place
    flip(a, t) {
      a.who ??= atStep(0);
      const b = a.who;
      if (!b) return true;
      const dur = 0.62, crouch = 0.22;
      const p = t / dur;
      if (p >= 1) {
        if (!a.landed) {
          a.landed = true;
          b.vq += 3.4;
        }
        return true;
      }
      if (p < crouch) {
        const c = Math.sin((Math.PI * p) / crouch);
        b.oy += 0.04 * c;
        b.oq += 0.2 * c;
        return false;
      }
      const u = (p - crouch) / (1 - crouch);
      b.oy -= 0.5 * 4 * u * (1 - u);
      b.orot -= (Math.PI / 2) * inOut(u);
      b.z = 1;
      return false;
    },
    // a stretch: the stair opens out and springs back
    yawn(a, t) {
      const dur = 1.1;
      if (t >= dur) return true;
      const s = Math.sin((Math.PI * t) / dur);
      spreadAdd += 0.22 * s;
      for (const b of bodies) b.oq -= 0.07 * s;
      return false;
    },
    // a glance one way, then the other
    look(a, t) {
      if (!a.glance) a.glance = rand() < 0.5 ? -1 : 1;
      if (t >= 2.8) {
        fidgetGaze = [0, 0];
        return true;
      }
      fidgetGaze = t < 1.2 ? [0.85 * a.glance, -0.2] : t < 2.2 ? [-0.55 * a.glance, 0.12] : [0, 0];
      return false;
    },
  };

  // At rest it is never frozen: every so often, one small thing.
  function fidget(): void {
    const r = rand();
    if (r < 0.3) {
      move("look");
      note("look");
    } else if (r < 0.55) {
      move("hop", { only: 2, h: 0.24, dur: 0.4 });
      note("hop");
    } else if (r < 0.75) {
      move("yawn");
      note("yawn");
    } else if (r < 0.9) {
      move("flip");
      note("flip");
    } else {
      move("nod", { amp: 0.6 });
      note("nod");
    }
  }

  // The beats: a hop at each onset of a real voice, a rhythm of its own when there is none, and a small nod
  // each time you stop talking.
  function rhythm(dt: number): void {
    if (state === "speaking") {
      if (voiceLive) {
        if (level < 0.16) onsetArmed = true;
        else if (onsetArmed && level > 0.3) {
          beatWave(Math.min(1, level * 1.2));
          onsetArmed = false;
        }
      } else if (ownRhythm && clock - lastWordAt > 1 && clock - stateAt > 0.12 && clock >= autoNextAt) {
        if (clock < autoPhraseEnd) {
          beatWave(0.35 + rand() * 0.45);
          autoNextAt = clock + 0.2 + rand() * 0.2;
        } else {
          autoPhraseEnd = clock + 0.45 + 1.4 + rand();
          autoNextAt = clock + 0.45;
        }
      }
    }
    if (state === "listening") {
      if (level > 0.26) {
        loud = true;
        quietFor = 0;
      } else if (level < 0.08) {
        quietFor += dt;
        if (loud && quietFor > 0.3) {
          move("nod", { amp: 0.55 });
          note("nod");
          loud = false;
        }
      }
    }
  }

  function schedule(): void {
    if (state === "thinking" && clock >= nextLeapAt && !moves.some((a) => a.kind === "leap")) {
      move("leap", { jumper: atStep(0) });
      note("leap");
      leaps += 1;
      nextLeapAt = clock + LEAP.dur + (leaps % 3 === 0 ? 0.55 : 0.2); // a breath after every third leap
    }
    if (fidgets && state === "idle" && clock >= nextFidgetAt && !moves.length && W.idle > 0.95) {
      fidget();
      nextFidgetAt = clock + 7 + rand() * 7;
    }
  }

  function tick(dtIn: number): void {
    const dt = dtIn > 0 ? dtIn : 0;
    clock += dt;
    for (const s of STATES) W[s] = ease(W[s], s === state ? 1 : 0, dt, 0.16);

    // the voice: yours while it listens, its own while it answers, kept for a moment so a wave can run down the stair
    const raw = state === "listening" ? heard : state === "speaking" && voiceLive ? voiced : 0;
    level = ease(level, raw, dt, raw > level ? 0.035 : 0.14);
    hist.push({ t: clock, v: level });
    if (hist.length > 120) hist.shift();

    if (!calm) {
      rhythm(dt);
      schedule();
    }

    // where it looks: at you, or wherever a glance takes it
    pointerAge += dt;
    const seen = pointer !== null && pointerAge < 2.5;
    const gt = seen && pointer ? pointer.g : fidgetGaze;
    for (let c = 0; c < 2; c++) {
      gazeV[c] += (25 * (gt[c] - gaze[c]) - 9 * gazeV[c]) * dt;
      gaze[c] += gazeV[c] * dt;
    }
    perk = ease(perk, seen && pointer?.near ? 1 : 0, dt, 0.15);

    // what the moves add this frame
    for (const b of bodies) {
      b.ox = 0; b.oy = 0; b.osc = 0; b.oq = 0; b.orot = 0; b.z = 0; b.abs = null; b.shadeO = null;
    }
    spreadAdd = 0;
    for (let n = moves.length - 1; n >= 0; n--) {
      const a = moves[n];
      if (MOVES[a.kind](a, clock - a.t0)) moves.splice(n, 1);
    }

    // springs toward where the state wants each square
    const spread = 1 + spreadAdd + 0.05 * perk * W.idle;
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (const b of bodies) {
      const want = pose(state, b.step, level, spread);
      const ts = want.scale * (1 + 0.05 * perk * W.idle);
      const w = FOLLOW[b.step];
      b.front = want.front;
      for (let k = 0; k < steps && h > 0; k++) {
        b.vx += (w * w * (want.x - b.x) - 2 * 0.62 * w * b.vx) * h; b.x += b.vx * h;
        b.vy += (w * w * (want.y - b.y) - 2 * 0.62 * w * b.vy) * h; b.y += b.vy * h;
        b.vsc += (256 * (ts - b.sc) - 16 * b.vsc) * h; b.sc += b.vsc * h;
        b.vq += (576 * (0 - b.q) - 14.4 * b.vq) * h; b.q += b.vq * h;
        b.vrot += (144 * (want.rot - b.rot) - 16.8 * b.vrot) * h; b.rot += b.vrot * h;
      }
    }

    // what never stops: a breath at rest, the voice, the glance
    if (!calm) {
      const glance = W.idle + 0.4 * W.listening + 0.2 * W.speaking;
      for (const b of bodies) {
        const k = b.step;
        const br = 0.5 + 0.5 * Math.sin(clock * (TAU / 4.2) - k * 0.6);
        b.oy -= W.idle * 0.035 * br;
        b.osc += W.idle * 0.018 * br;
        const Ld = levelAt(clock - k * 0.085);
        b.oy -= W.speaking * Ld * 0.16;
        b.osc += W.speaking * Ld * 0.04;
        // the huddle sways a little, so listening never looks held
        b.ox += W.listening * (k - 1) * 0.03 * Math.sin(clock * 1.6);
        b.oy += W.listening * (k === 1 ? 0.02 : -0.015) * Math.sin(clock * 1.6 + 1);
        b.ox += gaze[0] * [0.1, 0.075, 0.05][k] * glance;
        b.oy += gaze[1] * [0.07, 0.05, 0.035][k] * glance;
        b.orot += gaze[0] * 0.07 * glance;
      }
    }
    corner = ease(corner, LAYOUT[state].corner, dt, 0.25);

    // colour: which step it stands on, and whether it is at work. Addressed, it lights up at once; done, it
    // keeps its colour through its nod and cools slowly, down the stair
    const liveNow = state === "idle" ? 0 : 1;
    const warming = liveNow > prevLive;
    for (const b of bodies) {
      const hold = warming ? b.step * 0.05 : 0.5 + b.step * 0.09;
      const target = clock - stateAt >= hold ? liveNow : prevLive;
      b.live = ease(b.live, target, dt, target > b.live ? 0.08 : 0.45);
      b.shade = b.shadeO != null ? b.shadeO : ease(b.shade, b.step, dt, 0.16);
    }

    // where each square is drawn, and how fast it is going: it stretches the way it moves
    for (const b of bodies) {
      const x = (b.abs ? b.abs[0] : b.x) + b.ox;
      const y = (b.abs ? b.abs[1] : b.y) + b.oy;
      if (b.px != null && b.py != null && dt > 0) {
        const f = 1 - Math.exp(-dt / 0.035);
        b.svx += ((x - b.px) / dt - b.svx) * f;
        b.svy += ((y - b.py) / dt - b.svy) * f;
      }
      b.px = x;
      b.py = y;
      const o = b.out;
      o.step = b.step;
      o.x = x;
      o.y = y;
      o.size = Math.max(0, b.sc + b.osc);
      o.squash = clamp(b.q + b.oq, -0.3, 0.45);
      o.rot = b.rot + b.orot;
      o.stretch = Math.min(0.2, Math.hypot(b.svx, b.svy) * 0.018);
      o.angle = Math.atan2(b.svy, b.svx);
      o.front = b.z || b.front;
      o.shade = b.shade;
      o.live = b.live;
    }
  }

  function set(next: CharacterState): boolean {
    if (!STATES.includes(next) || next === state) return false;
    const prev = state;
    prevLive = state === "idle" ? 0 : 1;
    state = next;
    stateAt = clock;
    if (!calm) {
      if (next === "listening") {
        move("hop", { h: 0.16, dur: 0.36, delay: 0.06 });
        note("perk");
        loud = false;
        quietFor = 0;
      }
      if (next === "thinking") {
        nextLeapAt = clock + 0.34;
        leaps = 0;
      }
      if (next === "speaking") {
        autoNextAt = clock + 0.2;
        autoPhraseEnd = clock + 1.6 + rand() * 0.8;
        onsetArmed = true;
        wordAt = 0;
      }
      if (next === "idle") {
        nextFidgetAt = clock + 5 + rand() * 4;
        if (prev === "speaking") {
          move("nod");
          note("nod");
        }
      }
    }
    return true;
  }

  // Reduced motion: the state's resting pose, drawn once, nothing moving.
  function still(): void {
    moves.length = 0;
    hist.length = 0;
    spreadAdd = 0;
    perk = 0;
    level = 0;
    fidgetGaze = [0, 0];
    gaze[0] = gaze[1] = gazeV[0] = gazeV[1] = 0;
    for (const s of STATES) W[s] = s === state ? 1 : 0;
    corner = LAYOUT[state].corner;
    for (const b of bodies) {
      const want = pose(state, b.step, 0, 1);
      Object.assign(b, {
        x: want.x, y: want.y, vx: 0, vy: 0, sc: want.scale, vsc: 0, q: 0, vq: 0, rot: want.rot, vrot: 0, front: want.front,
        shade: b.step, live: state === "idle" ? 0 : 1, px: null, py: null, svx: 0, svy: 0,
      });
    }
    prevLive = state === "idle" ? 0 : 1;
    stateAt = clock - 1;
    tick(0);
  }

  return {
    get state() {
      return state;
    },
    get clock() {
      return clock;
    },
    set,
    tick,
    still,
    hear(v) {
      heard = clamp(Number(v) || 0, 0, 1);
    },
    voice(v, live = true) {
      voiced = clamp(Number(v) || 0, 0, 1);
      voiceLive = !!live;
    },
    beat(v = 0.6) {
      if (calm) return;
      lastWordAt = clock;
      beatWave(clamp(Number(v) || 0, 0, 1));
    },
    react(kind, params = {}) {
      if (calm || !(kind in MOVES) || kind === ("leap" as string)) return false;
      move(kind, params as Partial<Move>);
      note(kind);
      return true;
    },
    look(gx, gy, near) {
      if (calm) return;
      pointer = { g: [clamp(gx, -1, 1), clamp(gy, -1, 1)], near: !!near };
      pointerAge = 0;
    },
    away() {
      pointer = null;
    },
    frame() {
      return { corner, squares: bodies.map((b) => b.out) };
    },
    events() {
      return events.slice();
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-character.test.mjs`
Expected: `# pass 9`, `# fail 0`. If "everything stays inside the band" fails by a few hundredths, the port drifted from the prototype: diff the numbers against `chanlytics-mascot-prototype/index.html` rather than loosening the band.

- [ ] **Step 5: Typecheck and commit**

Run: `corepack pnpm -r typecheck` → exit 0.

```bash
git add apps/dashboard/src/legacy-bridge/mascot/character.ts tooling/scripts/tests/mascot-character.test.mjs
git commit -m "The three: the character, pure, with the leapfrog frozen from the prototype"
```

---

### Task 3: The drawing and the driver

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/mascot/draw.ts`
- Create: `apps/dashboard/src/legacy-bridge/mascot/driver.ts`
- Test: `tooling/scripts/tests/mascot-driver.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
/**
 * The driver on a fake canvas with a recording 2D context and an injected frame clock: mounting draws three
 * squares, a state changes what is drawn, hidden stops the loop, destroy lets go of everything, reduced motion
 * draws once per change, and a word heard pushes the level up and lets it fall.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mountCharacter } from "../../apps/dashboard/src/legacy-bridge/mascot/driver.ts";

function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_, name) => (name === "fillStyle" ? undefined : (...args) => { calls.push([name, ...args]); }),
    set: (_, name, value) => { calls.push(["set", name, value]); return true; },
  });
  const canvas = {
    width: 0, height: 0, clientWidth: 358, clientHeight: 232,
    getContext: (kind) => (kind === "2d" ? ctx : null),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 358, height: 232 }),
    closest: () => null,
  };
  return { canvas, calls, fills: () => calls.filter((c) => c[0] === "fill").length };
}
function fakeEnv() {
  const frames = new Map();
  let nextId = 1, t = 0, hidden = false;
  const listeners = { vis: [], theme: [], pointer: [] };
  return {
    env: {
      raf: (cb) => { const id = nextId++; frames.set(id, cb); return id; },
      caf: (id) => { frames.delete(id); },
      now: () => t,
      dpr: () => 2,
      reduced: false,
      hidden: () => hidden,
      onVisibility: (fn) => { listeners.vis.push(fn); return () => listeners.vis.splice(listeners.vis.indexOf(fn), 1); },
      onScreen: (_el, fn) => { fn(true); return () => {}; },
      onResize: () => () => {},
      onPointer: (fn) => { listeners.pointer.push(fn); return () => {}; },
      theme: () => "light",
      tokens: () => ({}),
      onTheme: (fn) => { listeners.theme.push(fn); return () => {}; },
    },
    /** run the oldest queued frame at time t */
    frame(ms) { t = ms; const next = frames.entries().next().value; if (!next) return; frames.delete(next[0]); next[1](ms); },
    hide(v) { hidden = v; for (const fn of listeners.vis) fn(); },
    pending: () => frames.size,
    listeners,
  };
}

test("mounting draws three squares at the band's size, and every frame draws them again", () => {
  const { canvas, fills } = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  assert.ok(m);
  assert.equal(canvas.width, 716);   // 358 * dpr 2
  assert.equal(fills(), 3, "drawn once at mount");
  F.frame(16);
  assert.equal(fills(), 6);
  F.frame(32);
  assert.equal(fills(), 9);
  m.destroy();
});

test("a state changes what is drawn; hidden stops the loop; destroy stops it for good", () => {
  const { canvas, calls } = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  for (let i = 1; i <= 60; i++) F.frame(i * 16);
  const restFill = calls.filter((c) => c[0] === "set" && c[1] === "fillStyle").at(-1)[2];
  m.set("listening");
  for (let i = 61; i <= 120; i++) F.frame(i * 16);
  const liveFill = calls.filter((c) => c[0] === "set" && c[1] === "fillStyle").at(-1)[2];
  assert.notEqual(liveFill, restFill, "coral once addressed");
  assert.equal(m.state, "listening");
  F.hide(true);
  assert.equal(F.pending(), 0, "no frame queued while hidden");
  F.hide(false);
  assert.equal(F.pending(), 1);
  m.destroy();
  F.frame(2000);
  assert.equal(F.pending(), 0);
});

test("reduced motion: no loop, one drawing per change", () => {
  const { canvas, fills } = fakeCanvas();
  const F = fakeEnv();
  F.env.reduced = true;
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  assert.equal(F.pending(), 0);
  assert.equal(fills(), 3);
  m.set("thinking");
  assert.equal(fills(), 6);
  m.react("shake");
  assert.equal(fills(), 6, "a reaction draws nothing when calm");
  m.destroy();
});

test("a word heard lifts the level, and it falls on its own", () => {
  const { canvas } = fakeCanvas();
  const F = fakeEnv();
  const m = mountCharacter(canvas, { side: 200 / 3.8, env: F.env });
  m.set("listening");
  m.hear(0.8);
  assert.ok(m.level() >= 0.8);
  for (let i = 1; i <= 30; i++) F.frame(i * 16);
  assert.ok(m.level() < 0.8 && m.level() > 0);
  for (let i = 31; i <= 120; i++) F.frame(i * 16);
  assert.equal(m.level(), 0);
  m.destroy();
});

test("no 2D context, no driver", () => {
  const F = fakeEnv();
  assert.equal(mountCharacter({ getContext: () => null, clientWidth: 10, clientHeight: 10 }, { env: F.env }), null);
  assert.equal(mountCharacter({ clientWidth: 10, clientHeight: 10 }, { env: F.env }), null);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-driver.test.mjs`
Expected: FAIL, `Cannot find module … mascot/driver.ts`.

- [ ] **Step 3: Write the drawing**

```ts
/**
 * The three on a canvas: three rounded squares, the front one last. `side` is one square in canvas pixels.
 */
import type { CharacterFrame } from "./character";
import { colourOf, type Palette } from "./colour";

export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  frame: CharacterFrame,
  pal: Palette,
  side: number,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const list = frame.squares.slice().sort((a, b) => a.front - b.front || b.step - a.step);
  for (const s of list) {
    const px = side * s.size;
    if (px < 0.5) continue;
    ctx.save();
    ctx.translate(cx + s.x * side, cy + s.y * side);
    if (s.stretch > 0.002) {
      ctx.rotate(s.angle);
      ctx.scale(1 + s.stretch, 1 / (1 + s.stretch));
      ctx.rotate(-s.angle);
    }
    const k = 1 / (1 + s.squash); // squashed against the ground: the bottom edge stays put
    ctx.translate(0, ((1 - k) * px) / 2);
    ctx.scale(1 + s.squash, k);
    ctx.rotate(s.rot);
    const r = Math.min(px / 2, frame.corner * px);
    const x = -px / 2;
    const y = -px / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + px, y, x + px, y + px, r);
    ctx.arcTo(x + px, y + px, x, y + px, r);
    ctx.arcTo(x, y + px, x, y, r);
    ctx.arcTo(x, y, x + px, y, r);
    ctx.closePath();
    ctx.fillStyle = colourOf(pal, s.shade, s.live);
    ctx.fill();
    ctx.restore();
  }
}
```

- [ ] **Step 4: Write the driver**

```ts
/**
 * The driver: puts the character on a canvas and keeps it moving. It owns the frame loop (stopped while the
 * tab is hidden or the canvas is off screen), the canvas's size at the device's pixel ratio, the pointer's
 * gaze, the theme's tokens and their re-read when the theme changes, the level a word heard pushes up, and
 * still frames under reduced motion. Every browser API comes in through `env`, with defaults read from
 * window and document, so the tests run it on node with a fake canvas and a fake clock.
 */
import { createCharacter, UNITS, type Character, type CharacterState, type Reaction } from "./character";
import { clonePalette, easePalette, palette, type Palette, type ThemeName, type ThemeTokens } from "./colour";
import { drawCharacter } from "./draw";

export interface DriverEnv {
  raf: (cb: (ms: number) => void) => number;
  caf: (id: number) => void;
  now: () => number;
  dpr: () => number;
  reduced: boolean;
  hidden: () => boolean;
  onVisibility: (fn: () => void) => () => void;
  onScreen: (el: Element, fn: (visible: boolean) => void) => () => void;
  onResize: (el: Element, fn: () => void) => () => void;
  onPointer: (fn: (e: { clientX: number; clientY: number } | null) => void) => () => void;
  theme: () => ThemeName;
  tokens: () => ThemeTokens;
  onTheme: (fn: () => void) => () => void;
}
export interface MountOptions {
  /** one square, in CSS pixels; by default the canvas's shorter side holds UNITS squares */
  side?: number;
  seed?: number;
  env?: Partial<DriverEnv>;
}
export interface Mounted {
  readonly state: CharacterState;
  set(next: CharacterState): void;
  /** a word heard: the level jumps to `v` and falls on its own */
  hear(v: number): void;
  level(): number;
  beat(strength?: number): void;
  react(kind: Reaction): void;
  /** advance by hand and draw: captures and tests */
  step(dt?: number, frames?: number): void;
  destroy(): void;
}
/** The canvas as the driver needs it: what a real HTMLCanvasElement has, without asking for one. */
export interface CanvasLike {
  width?: number;
  height?: number;
  clientWidth: number;
  clientHeight: number;
  getContext?: (kind: "2d") => CanvasRenderingContext2D | null;
  getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
}

const noop = () => () => {};
function browserEnv(): DriverEnv {
  const w = typeof window !== "undefined" ? window : null;
  const d = typeof document !== "undefined" ? document : null;
  const media = (q: string) => !!(w && typeof w.matchMedia === "function" && w.matchMedia(q).matches);
  return {
    raf: (cb) => (w && typeof w.requestAnimationFrame === "function" ? w.requestAnimationFrame(cb) : 0),
    caf: (id) => { if (w && typeof w.cancelAnimationFrame === "function") w.cancelAnimationFrame(id); },
    now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    dpr: () => Math.min(2, (w && w.devicePixelRatio) || 1),
    reduced: media("(prefers-reduced-motion: reduce)"),
    hidden: () => !!(d && d.hidden),
    onVisibility: (fn) => {
      if (!d) return () => {};
      d.addEventListener("visibilitychange", fn);
      return () => d.removeEventListener("visibilitychange", fn);
    },
    onScreen: (el, fn) => {
      if (!w || typeof w.IntersectionObserver !== "function") return () => {};
      const io = new w.IntersectionObserver((es) => fn(es.some((e) => e.isIntersecting)));
      io.observe(el);
      return () => io.disconnect();
    },
    onResize: (el, fn) => {
      if (!w || typeof w.ResizeObserver !== "function") return () => {};
      const ro = new w.ResizeObserver(() => fn());
      ro.observe(el);
      return () => ro.disconnect();
    },
    onPointer: (fn) => {
      if (!w) return () => {};
      const move = (e: PointerEvent) => fn(e);
      const gone = () => fn(null);
      w.addEventListener("pointermove", move, { passive: true });
      d?.documentElement.addEventListener("pointerleave", gone);
      return () => {
        w.removeEventListener("pointermove", move);
        d?.documentElement.removeEventListener("pointerleave", gone);
      };
    },
    theme: () => (d?.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    tokens: () => {
      if (!w || !d) return {};
      const cs = w.getComputedStyle(d.documentElement);
      const v = (n: string) => cs.getPropertyValue(n).trim() || null;
      return { bg: v("--bg"), ink: v("--ink"), accent: v("--accent") };
    },
    onTheme: (fn) => {
      if (!w || !d || typeof w.MutationObserver !== "function") return () => {};
      const mo = new w.MutationObserver(fn);
      mo.observe(d.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => mo.disconnect();
    },
  };
}

export function mountCharacter(canvas: CanvasLike, opts: MountOptions = {}): Mounted | null {
  const ctx = typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  if (!ctx) return null;
  const env: DriverEnv = { ...browserEnv(), ...(opts.env ?? {}) };
  const character: Character = createCharacter({ seed: opts.seed ?? 7, calm: env.reduced, enter: !env.reduced });
  let palTarget = palette(env.theme(), env.tokens());
  const pal: Palette = clonePalette(palTarget);
  let w = 0;
  let h = 0;
  let heardLevel = 0;
  let raf = 0;
  let last = 0;
  let visible = !env.hidden();
  let onScreen = true;
  let dead = false;
  const undo: (() => void)[] = [];

  function fit(): boolean {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return false;
    const dpr = env.dpr();
    const nw = Math.round(cw * dpr);
    const nh = Math.round(ch * dpr);
    if (nw !== w || nh !== h) {
      w = nw;
      h = nh;
      canvas.width = w;
      canvas.height = h;
    }
    return true;
  }
  function frame(dt: number): void {
    // a word heard lifts the level to 0.8; it falls to nothing in about half a second of silence
    heardLevel = Math.max(0, heardLevel - dt * 1.5);
    character.hear(heardLevel);
    if (!env.reduced) character.tick(dt);
    easePalette(pal, palTarget, env.reduced ? 1e6 : dt);
    if (!fit()) return;
    const side = (opts.side != null ? opts.side * env.dpr() : Math.min(w, h) / UNITS);
    drawCharacter(ctx as CanvasRenderingContext2D, w, h, character.frame(), pal, side);
  }
  function loop(ms: number): void {
    raf = env.raf(loop);
    const dt = Math.min(0.05, (ms - (last || ms)) / 1000);
    last = ms;
    frame(dt);
  }
  function run(): void {
    if (dead) return;
    const go = visible && onScreen && !env.reduced;
    if (go && !raf) {
      last = 0;
      raf = env.raf(loop);
    }
    if (!go && raf) {
      env.caf(raf);
      raf = 0;
    }
  }
  function stillFrame(): void {
    if (!env.reduced) return;
    character.still();
    frame(0);
  }
  function gaze(e: { clientX: number; clientY: number } | null): void {
    if (env.reduced) return;
    if (!e) {
      character.away();
      return;
    }
    const r = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
    if (!r || !r.width) return;
    const unit = (opts.side ?? Math.min(r.width, r.height) / UNITS);
    const dx = (e.clientX - (r.left + r.width / 2)) / unit;
    const dy = (e.clientY - (r.top + r.height / 2)) / unit;
    character.look(dx / 4, dy / 4, Math.hypot(dx, dy) < 2.3);
  }

  undo.push(env.onVisibility(() => { visible = !env.hidden(); run(); }));
  undo.push(env.onScreen(canvas as unknown as Element, (v) => { onScreen = v; run(); }));
  undo.push(env.onResize(canvas as unknown as Element, () => { if (!raf) frame(0); }));
  undo.push(env.onPointer(gaze));
  undo.push(env.onTheme(() => { palTarget = palette(env.theme(), env.tokens()); stillFrame(); if (!raf) frame(0); }));
  run();
  if (env.reduced) stillFrame();
  else frame(0);

  return {
    get state() {
      return character.state;
    },
    set(next) {
      character.set(next);
      stillFrame();
    },
    hear(v) {
      heardLevel = Math.max(heardLevel, Math.min(1, Math.max(0, v)));
    },
    level: () => heardLevel,
    beat(v) {
      character.beat(v);
    },
    react(kind) {
      // calm ignores every reaction, so under reduced motion nothing is redrawn
      character.react(kind);
    },
    step(dt = 1 / 60, frames = 1) {
      for (let i = 0; i < frames; i++) frame(dt);
    },
    destroy() {
      dead = true;
      if (raf) env.caf(raf);
      raf = 0;
      for (const u of undo.splice(0)) u();
    },
  };
}
```

- [ ] **Step 5: Run the test**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-driver.test.mjs`
Expected: `# pass 5`, `# fail 0`.

- [ ] **Step 6: Typecheck and commit**

Run: `corepack pnpm -r typecheck` → exit 0.

```bash
git add apps/dashboard/src/legacy-bridge/mascot/draw.ts apps/dashboard/src/legacy-bridge/mascot/driver.ts tooling/scripts/tests/mascot-driver.test.mjs
git commit -m "The three: the drawing, and a driver whose browser is injected"
```

---

### Task 4: The turn, as a reducer

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/mascot/turn.ts`
- Test: `tooling/scripts/tests/mascot-turn.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
/**
 * The band's state machine: a question from the first word to the nod, a quick answer, a failed turn, a
 * transport error, a cut-off, a follow-up on the same thread, a question while busy, and a late event after
 * the page was left.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { initialTurn, turnReducer as R } from "../../apps/dashboard/src/legacy-bridge/mascot/turn.ts";

const msg = (over = {}) => ({ id: "m1", role: "assistant", text: "Nora has waited longest.", failed: false, proposals: [], followups: [], citations: [], ...over });
const asked = (turn, text) => R(turn, { t: "asked", text, language: "en", seq: turn.seq + 1 });

test("a question, end to end", () => {
  let s = initialTurn();
  s = R(s, { t: "pressed" });
  assert.equal(s.phase, "listening");
  s = R(s, { t: "heard", words: "who's waited" });
  assert.equal(s.heard, "who's waited");
  s = asked(s, "who's waited longest?");
  assert.equal(R(s, { t: "released" }).phase, "reading", "the release that follows the words changes nothing");
  assert.equal(s.phase, "reading");
  assert.equal(s.question, "who's waited longest?");
  assert.equal(s.text, "");
  const seq = s.seq;
  s = R(s, { t: "thread", id: "th1", seq });
  assert.equal(s.threadId, "th1");
  s = R(s, { t: "trace", text: "Reading the inbox…", seq });
  assert.equal(s.trace, "Reading the inbox…");
  s = R(s, { t: "delta", text: "Nora has ", seq });
  assert.equal(s.phase, "answering");
  assert.equal(s.trace, null);
  s = R(s, { t: "delta", text: "waited longest.", seq });
  assert.equal(s.text, "Nora has waited longest.");
  s = R(s, { t: "final", message: msg(), seq });
  assert.equal(s.phase, "settled");
  assert.equal(s.message.id, "m1");
  assert.equal(s.text, "Nora has waited longest.");
});

test("a quick answer settles at once, with no thread", () => {
  let s = asked(initialTurn(), "who needs me?");
  s = R(s, { t: "fast", text: "Two people need you.", links: [{ label: "Open Inbox", to: "inbox" }], seq: s.seq });
  assert.equal(s.phase, "settled");
  assert.equal(s.text, "Two people need you.");
  assert.equal(s.threadId, null);
  assert.deepEqual(s.links, [{ label: "Open Inbox", to: "inbox" }]);
});

test("a failed final, a transport error and a cut-off all fail with their sentence", () => {
  let s = asked(initialTurn(), "x");
  s = R(s, { t: "final", message: msg({ failed: true, text: "Ask is not connected to a model yet." }), seq: s.seq });
  assert.equal(s.phase, "failed");
  assert.equal(s.text, "Ask is not connected to a model yet.");
  s = asked(s, "y");
  s = R(s, { t: "error", text: "Network error — nothing was asked.", seq: s.seq });
  assert.equal(s.phase, "failed");
  assert.equal(s.text, "Network error — nothing was asked.");
  s = asked(s, "z");
  s = R(s, { t: "cut-off", text: "The answer was cut off. Try again.", seq: s.seq });
  assert.equal(s.phase, "failed");
});

test("a follow-up keeps the thread; clearing forgets it", () => {
  let s = asked(initialTurn(), "a");
  s = R(s, { t: "thread", id: "th9", seq: s.seq });
  s = R(s, { t: "final", message: msg(), seq: s.seq });
  s = asked(s, "and then?");
  assert.equal(s.threadId, "th9");
  assert.equal(s.phase, "reading");
  s = R(s, { t: "final", message: msg(), seq: s.seq });
  s = R(s, { t: "cleared" });
  assert.equal(s.phase, "rest");
  assert.equal(s.threadId, null);
  assert.equal(s.question, "");
});

test("one turn at a time: a question while reading or answering is ignored", () => {
  let s = asked(initialTurn(), "first");
  const seq = s.seq;
  const again = asked(s, "second");
  assert.equal(again.question, "first");
  assert.equal(again.seq, seq);
  s = R(s, { t: "delta", text: "…", seq });
  assert.equal(asked(s, "third").question, "first");
});

test("late events are dropped: an older turn's, and anything after the page was left", () => {
  let s = asked(initialTurn(), "a");
  const old = s.seq;
  s = R(s, { t: "final", message: msg(), seq: old });
  s = asked(s, "b");
  s = R(s, { t: "delta", text: "late", seq: old });
  assert.equal(s.text, "");
  s = R(s, { t: "left" });
  assert.equal(s.phase, "rest");
  const after = R(s, { t: "final", message: msg(), seq: s.seq - 1 });
  assert.equal(after.phase, "rest");
});

test("a press that ends with no words goes back to where it was: rest, or the answer it was a follow-up to", () => {
  let s = R(initialTurn(), { t: "pressed" });
  s = R(s, { t: "released" });
  assert.equal(s.phase, "rest");
  s = asked(s, "a");
  s = R(s, { t: "fast", text: "Nobody is waiting.", seq: s.seq });
  s = R(s, { t: "pressed" });
  assert.equal(s.phase, "listening");
  s = R(s, { t: "released" });
  assert.equal(s.phase, "settled");
  assert.equal(s.text, "Nobody is waiting.");
  assert.equal(R(s, { t: "released" }), s, "a release at rest is nothing");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-turn.test.mjs`
Expected: FAIL, `Cannot find module … mascot/turn.ts`.

- [ ] **Step 3: Write the reducer**

```ts
/**
 * The band's turn: what the three know about a question, as a pure reducer. The page dispatches what the
 * palette's hooks and stream hand it; this decides the phase, the words on screen, and the thread.
 *
 * Every event from a stream carries the `seq` of the question that started it, so an answer to an older
 * question, or one that arrives after the page was left, changes nothing.
 */
import type { AskLanguage, AskMessageVM } from "@chanlytics/contracts";

export type TurnPhase = "rest" | "listening" | "reading" | "answering" | "settled" | "failed";
export interface TurnLink {
  label: string;
  to: string;
}
export interface Turn {
  phase: TurnPhase;
  /** the question as sent */
  question: string;
  /** the words heard so far, while listening */
  heard: string;
  /** the stream's latest trace while reading, or null */
  trace: string | null;
  /** the answer so far, or the failure's sentence */
  text: string;
  message: AskMessageVM | null;
  /** a quick answer's doors */
  links: TurnLink[];
  threadId: string | null;
  language: AskLanguage;
  /** the question in flight; every stream event names the one it belongs to */
  seq: number;
  /** the phase a press interrupted, for a press that ends with no words */
  before: TurnPhase;
}
export type TurnEvent =
  | { t: "pressed" }
  | { t: "heard"; words: string }
  /** the press ended with no words, or the microphone failed */
  | { t: "released" }
  | { t: "asked"; text: string; language: AskLanguage; seq: number }
  | { t: "thread"; id: string; seq: number }
  | { t: "trace"; text: string; seq: number }
  | { t: "delta"; text: string; seq: number }
  | { t: "final"; message: AskMessageVM; seq: number }
  | { t: "fast"; text: string; links?: TurnLink[]; seq: number }
  | { t: "error"; text: string; seq: number }
  | { t: "cut-off"; text: string; seq: number }
  | { t: "cleared" }
  | { t: "left" };

export const initialTurn = (): Turn => ({
  phase: "rest",
  question: "",
  heard: "",
  trace: null,
  text: "",
  message: null,
  links: [],
  threadId: null,
  language: "en",
  seq: 0,
  before: "rest",
});

const busy = (p: TurnPhase) => p === "reading" || p === "answering";

export function turnReducer(turn: Turn, ev: TurnEvent): Turn {
  switch (ev.t) {
    case "pressed":
      return busy(turn.phase) || turn.phase === "listening"
        ? turn
        : { ...turn, phase: "listening", before: turn.phase, heard: "" };
    case "heard":
      return turn.phase === "listening" ? { ...turn, heard: ev.words } : turn;
    case "released":
      return turn.phase === "listening" ? { ...turn, phase: turn.before, heard: "" } : turn;
    case "asked":
      if (busy(turn.phase)) return turn;
      return {
        ...turn,
        phase: "reading",
        question: ev.text,
        heard: "",
        trace: null,
        text: "",
        message: null,
        links: [],
        language: ev.language,
        seq: ev.seq,
      };
    case "cleared":
      return { ...initialTurn(), language: turn.language, seq: turn.seq };
    case "left":
      return { ...turn, phase: "rest", heard: "", trace: null, seq: turn.seq + 1 };
    default:
      break;
  }
  // everything below belongs to one question
  if (ev.seq !== turn.seq || !busy(turn.phase)) return turn;
  switch (ev.t) {
    case "thread":
      return { ...turn, threadId: ev.id };
    case "trace":
      return turn.phase === "reading" ? { ...turn, trace: ev.text } : turn;
    case "delta":
      return { ...turn, phase: "answering", trace: null, text: turn.text + ev.text };
    case "final":
      return ev.message.failed
        ? { ...turn, phase: "failed", trace: null, text: ev.message.text, message: ev.message }
        : { ...turn, phase: "settled", trace: null, text: ev.message.text, message: ev.message };
    case "fast":
      return { ...turn, phase: "settled", trace: null, text: ev.text, message: null, links: ev.links ?? [] };
    case "error":
    case "cut-off":
      return { ...turn, phase: "failed", trace: null, text: ev.text, message: null };
    default:
      return turn;
  }
}
```

- [ ] **Step 4: Run the test**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/mascot-turn.test.mjs`
Expected: `# pass 7`, `# fail 0`. (`AskMessageVM.failed` and `.text` exist in contracts `ask.ts:535-555`.)

- [ ] **Step 5: Typecheck and commit**

Run: `corepack pnpm -r typecheck` → exit 0.

```bash
git add apps/dashboard/src/legacy-bridge/mascot/turn.ts tooling/scripts/tests/mascot-turn.test.mjs
git commit -m "The three: the turn as a reducer, one question at a time, late events dropped"
```

---

### Task 5: Published to the pages

**Files:**
- Create: `apps/dashboard/src/legacy-bridge/mascot/index.ts`
- Modify: `apps/dashboard/src/legacy-bridge/LegacyApp.tsx` (the install list, after `installToday();`)

- [ ] **Step 1: The module**

```ts
/**
 * The three, published to the legacy pages the way Today's helpers are (today.ts): one object on window,
 * installed at boot by LegacyApp.tsx. The page draws the band and calls these; it never reaches into the
 * bridge's modules.
 */
import { createCharacter, STATES, UNITS } from "./character";
import { mountCharacter } from "./driver";
import { initialTurn, turnReducer } from "./turn";

export const MASCOT = {
  mount: mountCharacter,
  create: createCharacter,
  turn: { initial: initialTurn, reduce: turnReducer },
  UNITS,
  STATES,
} as const;
export type Mascot = typeof MASCOT;

declare global {
  interface Window {
    __mascot?: Mascot;
  }
}

export function installMascot(): void {
  window.__mascot = MASCOT;
}
```

- [ ] **Step 2: Install it**

In `LegacyApp.tsx`, add the import beside the other `install*` imports and, in the install list, the line after `installToday();`:

```ts
import { installMascot } from "./mascot";
```
```ts
installToday();
// The three, Today's face: the character, its driver and the turn reducer (mascot/index.ts).
installMascot();
```

- [ ] **Step 3: Typecheck and commit**

Run: `corepack pnpm -r typecheck` → exit 0. Run: `corepack pnpm lint` → exit 0.

```bash
git add apps/dashboard/src/legacy-bridge/mascot/index.ts apps/dashboard/src/legacy-bridge/LegacyApp.tsx
git commit -m "The three: published on window.__mascot at boot"
```

---

### Task 6: The band on Today

**Files:**
- Create: `apps/dashboard/src/legacy/pages/today-face.jsx`
- Modify: `apps/dashboard/src/legacy/pages/ask-text.jsx` (four keys, both languages)
- Modify: `apps/dashboard/src/legacy/pages/dashboard-a.jsx:13-26` and its `?v=`
- Modify: `apps/dashboard/src/legacy-bridge/manifest.ts:61-62` and `apps/dashboard/src/legacy/Chanlytics.html:105-106`
- Modify: `apps/dashboard/src/legacy/styles/dashboard-a-v2.css` (a section after line 35)
- Test: `tooling/scripts/tests/today-face.test.mjs`; `tooling/scripts/tests/today-page.test.mjs` (one pin)

- [ ] **Step 1: The words**

In `ask-text.jsx`, add to the `en` object after `noVoice`:
```js
    todayPlaceholder: "Ask about today…",
    continueInAsk: "Continue in Ask",
    reviewInAsk: "Review in Ask",
    clear: "Clear",
```
and to the `es` object after its `noVoice`:
```js
    todayPlaceholder: "Pregunta sobre hoy…",
    continueInAsk: "Seguir en Ask",
    reviewInAsk: "Revisar en Ask",
    clear: "Borrar",
```
Bump `ask-text.jsx?v=2` to `?v=3` in `Chanlytics.html`.

- [ ] **Step 2: Write the failing test**

```js
/**
 * The band above the queue, EXECUTED on the stub React: it draws with no data; the field sends through the
 * palette's client and the exchange shows what the stream says; a failed turn shows its sentence and Try again;
 * a follow-up goes on the same thread; Continue in Ask opens the thread in the palette; with no client the field
 * seeds the palette; and Today draws it between the standing line and the queue.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact, fresh, again, all, find, byTestId, textOf, classes, press, settle } from "./_legacy-react.mjs";

const asked = [];
const flashes = [];
installLegacyReact({ __DEMO_MODE: false, __surfaceState: () => "live", __surfaceFailed: () => false });
const W = globalThis.window;
const L = "../../../apps/dashboard/src/legacy";
const { MASCOT } = await import("../../../apps/dashboard/src/legacy-bridge/mascot/index.ts");
Object.assign(W, {
  __mascot: MASCOT,
  askAbout: (a) => asked.push(a),
  appNavigate: (to) => asked.push({ nav: to }),
  usePPToast: () => [null, (m) => flashes.push(m)],
});
await import(`${L}/pages/ask-text.jsx`);
await import(`${L}/pages/ask-hooks.jsx`);
await import(`${L}/pages/today-face.jsx`);

const msg = (over = {}) => ({ id: "m1", role: "assistant", text: "Nora has waited longest.", atMs: 0, failed: false, proposals: [], followups: [], citations: [], ...over });
/** A client whose send plays a script of events, and remembers what it was asked. */
const client = (script) => {
  const sent = [];
  return {
    sent,
    language: () => "en",
    fast: () => null,
    shape: (m) => ({ open: null, citations: [], followups: m.followups || [] }),
    canSpeak: () => false,
    speak: () => false,
    stopSpeaking() {},
    send: async (input, on) => {
      sent.push(input);
      for (const ev of typeof script === "function" ? script(input) : script) on(ev);
    },
  };
};
const draw = () => { fresh(); return W.React.createElement(W.TodayFace); };
const type = (tree, words) => byTestId(tree, "today-face-input").props.onChange({ target: { value: words } });
const submit = (tree) => byTestId(tree, "today-face-form").props.onSubmit({ preventDefault() {} });

test("the band draws with no data, at rest, with an empty exchange and the field", () => {
  const tree = draw();
  assert.ok(byTestId(tree, "today-face"));
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "rest");
  assert.equal(textOf(byTestId(tree, "today-face-exchange")), "");
  assert.equal(byTestId(tree, "today-face-input").props.placeholder, "Ask about today…");
});

test("a question: it reads, the trace shows, the answer streams, then the follow-ups and the doors", async () => {
  const A = client([
    { t: "thread", id: "th1", title: "who's waited longest?" },
    { t: "trace", text: "Reading the inbox…" },
    { t: "delta", text: "Nora has " },
    { t: "delta", text: "waited longest." },
    { t: "final", message: msg({ followups: ["Who else is waiting?"] }) },
  ]);
  W.__ask = A;
  let tree = draw();
  type(tree, "who's waited longest?");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(A.sent[0].surface, "today");
  assert.equal(A.sent[0].threadId, null);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "settled");
  const ex = textOf(byTestId(tree, "today-face-exchange"));
  assert.ok(ex.includes("who's waited longest?"));
  assert.ok(ex.includes("Nora has waited longest."));
  const follow = find(tree, (n) => classes(n).includes("ask-follow-chip"));
  assert.equal(textOf(follow), "Who else is waiting?");
  press(follow);
  await settle();
  assert.equal(A.sent[1].text, "Who else is waiting?");
  assert.equal(A.sent[1].threadId, "th1");
  tree = again(draw);
  press(byTestId(tree, "today-face-continue"));
  assert.deepEqual(asked.at(-1), { thread: "th1" });
  delete W.__ask;
});

test("a failed turn shows its sentence and Try again asks the same question", async () => {
  let n = 0;
  const A = client(() => (n++ === 0
    ? [{ t: "thread", id: "th2", title: "x" }, { t: "final", message: msg({ failed: true, text: "Ask is not connected to a model yet." }) }]
    : [{ t: "thread", id: "th2", title: "x" }, { t: "final", message: msg() }]));
  W.__ask = A;
  let tree = draw();
  type(tree, "x");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "failed");
  assert.ok(textOf(byTestId(tree, "today-face-exchange")).includes("Ask is not connected to a model yet."));
  press(byTestId(tree, "today-face-retry"));
  await settle();
  assert.equal(A.sent.length, 2);
  assert.equal(A.sent[1].text, "x");
  delete W.__ask;
});

test("an answer that carries a proposal hands off to the palette", async () => {
  const A = client([{ t: "thread", id: "th3", title: "send" }, { t: "final", message: msg({ proposals: [{ id: "p1", kind: "broadcast" }] }) }]);
  W.__ask = A;
  let tree = draw();
  type(tree, "send everyone a note");
  tree = again(draw);
  submit(tree);
  await settle();
  tree = again(draw);
  assert.equal(textOf(byTestId(tree, "today-face-continue")), "Review in Ask");
  delete W.__ask;
});

test("with no client the field seeds the palette and the band rests", () => {
  delete W.__ask;
  asked.length = 0;
  let tree = draw();
  type(tree, "who needs me?");
  tree = again(draw);
  submit(tree);
  assert.deepEqual(asked.at(-1), { prompt: "who needs me?" });
  tree = again(draw);
  assert.equal(byTestId(tree, "today-face").props["data-phase"], "rest");
});
```

(Today's composition, with the band in it, is pinned where the rest of Today's composition is: `today-page.test.mjs`, Step 7.)

- [ ] **Step 3: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-face.test.mjs`
Expected: FAIL, `Cannot find module … pages/today-face.jsx`.

- [ ] **Step 4: Write the band**

```jsx
/* global React, Icon */
// The three, above the queue: the mark's squares as the face of the app, asking through the Ask that exists.
// The character, its canvas driver and the turn reducer live in the bridge (window.__mascot, mascot/index.ts);
// this file draws the band and wires the palette's hooks (window.AskHooks) and its client (window.__ask) to
// them. Every word here is the palette's (window.askText) or the stream's. With no client (the mockup, the
// harness) the field seeds the palette through askAbout and the band rests.
// Spec: docs/superpowers/specs/2026-09-23-the-three-on-today-design.md.
const useTfState = React.useState;
const useTfReducer = React.useReducer;
const useTfRef = React.useRef;
const useTfEffect = React.useEffect;

// One square, in CSS px: the squares are sized for a 200px band; the stage is 232px so the leap has room.
const TF_SIDE = 200 / 3.8;
const TF_STATE = { rest: "idle", listening: "listening", reading: "thinking", answering: "speaking", settled: "idle", failed: "idle" };
const tfNav = (to) => window.appNavigate && window.appNavigate(to);
const tfNoTurn = { phase: "rest", question: "", heard: "", trace: null, text: "", message: null, links: [], threadId: null, language: "en", seq: 0, before: "rest" };
const tfReduce = (turn, ev) => (window.__mascot ? window.__mascot.turn.reduce(turn, ev) : turn);
const tfInitial = () => (window.__mascot ? window.__mascot.turn.initial() : tfNoTurn);

const TodayFace = () => {
  const A = window.__ask || null;
  const M = window.__mascot || null;
  const H = window.AskHooks;
  const [turn, dispatch] = useTfReducer(tfReduce, tfInitial());
  const [query, setQuery] = useTfState("");
  const [toastNode, flash] = window.usePPToast();
  const speech = H.useAskSpeech(A);
  const canvasRef = useTfRef(null);
  const mounted = useTfRef(null);
  const turnRef = useTfRef(turn);
  const phaseRef = useTfRef("rest");
  const heardLen = useTfRef(0);
  const alive = useTfRef(true);
  turnRef.current = turn;
  const t = window.askText(turn.language);
  const busy = turn.phase === "reading" || turn.phase === "answering";

  // The character on its canvas, for the band's life. On the tests' stub React the ref is never attached
  // (an effect runs before any ref is), so the driver is tested on its own.
  useTfEffect(() => {
    alive.current = true;
    const canvas = canvasRef.current;
    if (M && canvas) mounted.current = M.mount(canvas, { side: TF_SIDE });
    return () => {
      alive.current = false;
      if (mounted.current) mounted.current.destroy();
      mounted.current = null;
    };
  }, [M]);

  // The phase drives the character: read aloud counts as answering; a settle nods, a failure shakes.
  useTfEffect(() => {
    const m = mounted.current;
    const was = phaseRef.current;
    phaseRef.current = turn.phase;
    if (!m) return;
    m.set(speech.speakingId === "face" ? "speaking" : TF_STATE[turn.phase]);
    if (turn.phase === "settled" && was !== "answering") m.react("nod");
    if (turn.phase === "failed") m.react("shake");
  }, [turn.phase, turn.seq, speech.speakingId]);

  const ask = async (raw) => {
    const q = String(raw || "").trim();
    const cur = turnRef.current;
    if (!q || cur.phase === "reading" || cur.phase === "answering") return;
    if (!A) {
      if (window.askAbout) window.askAbout({ prompt: q });
      return;
    }
    const language = A.language(q);
    const seq = cur.seq + 1;
    dispatch({ t: "asked", text: q, language, seq });
    const fp = A.fast(q);
    if (fp) {
      if (fp.kind !== "openings") {
        dispatch({ t: "fast", text: fp.answer, links: fp.links || [], seq });
        return;
      }
      const words = window.askText(language);
      const o = await A.openings(fp.day, fp.service);
      if (!alive.current) return;
      const text = o.state === "no_calendar" ? words.noCalendar : o.state === "unavailable" ? words.unavailable : o.text;
      dispatch({ t: "fast", text, links: o.state === "ok" ? [] : [{ label: words.openings, to: "admin/integrations" }], seq });
      return;
    }
    let ended = false;
    try {
      await A.send({ text: q, threadId: cur.threadId, scope: null, surface: "today" }, (ev) => {
        if (!alive.current) return;
        if (ev.t === "thread") dispatch({ t: "thread", id: ev.id, seq });
        else if (ev.t === "trace") dispatch({ t: "trace", text: ev.text, seq });
        else if (ev.t === "delta") {
          dispatch({ t: "delta", text: ev.text, seq });
          if (mounted.current) mounted.current.beat(Math.min(1, ev.text.length / 6));
        } else if (ev.t === "final") {
          ended = true;
          dispatch({ t: "final", message: ev.message, seq });
        } else if (ev.t === "error") {
          ended = true;
          dispatch({ t: "error", text: ev.text, seq });
        }
      });
    } catch {
      /* a broken stream ends as a cut-off, below */
    }
    if (!ended && alive.current) dispatch({ t: "cut-off", text: window.askText(language).cutOff, seq });
  };

  // The hook says nothing when a press ends with no words, so the turn follows its `listening` flag: pressed as
  // it turns on, released as it turns off (a release after the words were asked changes nothing).
  const talk = H.useAskTalk({
    lang: turn.language,
    disabled: busy,
    onWords: (words) => {
      dispatch({ t: "heard", words });
      if (words.length > heardLen.current && mounted.current) mounted.current.hear(0.8);
      heardLen.current = words.length;
    },
    onHeard: (heard, error) => {
      heardLen.current = 0;
      if (heard) {
        ask(heard);
        return;
      }
      if (error === "not-allowed") flash({ msg: <>{t.micDenied}</> });
      else if (error && error !== "aborted" && error !== "no-speech") flash({ msg: <>{t.micFailed}</> });
    },
  });
  useTfEffect(() => {
    dispatch({ t: talk.listening ? "pressed" : "released" });
  }, [talk.listening]);

  const submit = (e) => {
    e.preventDefault();
    const q = query;
    setQuery("");
    ask(q);
  };
  const shape = turn.message && A && !turn.message.failed ? A.shape(turn.message, turn.language) : { open: null, followups: [] };
  const caption = turn.phase === "listening" ? t.listening : turn.phase === "reading" ? turn.trace || t.thinking : null;
  const handsOff = turn.phase === "settled" && turn.message && turn.message.proposals && turn.message.proposals.length > 0;
  const holdProps = talk.canTalk
    ? { onPointerDown: talk.start, onPointerUp: talk.stop, onPointerLeave: talk.stop, onPointerCancel: talk.stop, onContextMenu: (e) => e.preventDefault() }
    : { onClick: () => flash({ msg: <>{t.noVoice}</> }) };

  return (
    <section className="today-face" data-testid="today-face" data-phase={turn.phase}>
      <button type="button" className={`tf-stage${talk.listening ? " listening" : ""}`} aria-label={t.talk} title={t.talk} data-testid="today-face-stage" {...holdProps}>
        <canvas ref={canvasRef} aria-hidden="true" />
      </button>
      <div className="tf-exchange" data-testid="today-face-exchange" aria-live="polite">
        {turn.phase === "listening" && turn.heard ? <p className="tf-question">{turn.heard}</p> : null}
        {turn.phase !== "listening" && turn.question ? <p className="tf-question">{turn.question}</p> : null}
        {caption ? <p className="tf-caption">{caption}</p> : null}
        {turn.text ? (
          <p className={`tf-answer${turn.phase === "failed" ? " failed" : ""}`}>
            {turn.text}
            {turn.phase === "answering" ? <span className="ask-cursor" /> : null}
          </p>
        ) : null}
        {turn.phase === "settled" && shape.followups.length ? (
          <div className="ask-follow">
            <span className="ask-follow-label">{t.next}</span>
            {shape.followups.map((f) => (
              <button key={f} type="button" className="ask-follow-chip" onClick={() => ask(f)}>{f}</button>
            ))}
          </div>
        ) : null}
        {turn.phase === "settled" || turn.phase === "failed" ? (
          <div className="ask-msg-links">
            {turn.phase === "failed" ? (
              <button type="button" className="ask-action-chip" onClick={() => ask(turn.question)} data-testid="today-face-retry"><Icon name="refresh" size={11} /> {t.tryAgain}</button>
            ) : null}
            {shape.open ? (
              <button type="button" className="ask-link-chip" onClick={() => tfNav(shape.open.to)}>{shape.open.label} <Icon name="arrow-right" size={10} /></button>
            ) : null}
            {turn.links.map((l) => (
              <button key={l.to} type="button" className="ask-link-chip" onClick={() => tfNav(l.to)}>{l.label} <Icon name="arrow-right" size={10} /></button>
            ))}
            {turn.threadId ? (
              <button type="button" className="ask-link-chip" onClick={() => window.askAbout && window.askAbout({ thread: turn.threadId })} data-testid="today-face-continue">{handsOff ? t.reviewInAsk : t.continueInAsk}</button>
            ) : null}
            {turn.phase === "settled" && turn.text && !turn.message?.failed && speech.canSpeak ? (
              <button type="button" className={`ask-tool${speech.speakingId === "face" ? " on" : ""}`} onClick={() => speech.toggle("face", turn.text, turn.language)} title={speech.speakingId === "face" ? t.stop : t.read} aria-label={t.read}><Icon name={speech.speakingId === "face" ? "pause" : "headphones"} size={12} /></button>
            ) : null}
            <button type="button" className="ask-link-chip" onClick={() => dispatch({ t: "cleared" })} data-testid="today-face-clear">{t.clear}</button>
          </div>
        ) : null}
      </div>
      <form className="tf-field" onSubmit={submit} data-testid="today-face-form">
        <input
          className="tf-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={busy ? t.thinking : turn.threadId ? t.follow : t.todayPlaceholder}
          disabled={busy}
          maxLength={1000}
          aria-label={t.todayPlaceholder}
          data-testid="today-face-input"
        />
        {talk.canTalk ? (
          <button type="button" className={`ask-talk${talk.listening ? " on" : ""}`} aria-pressed={talk.listening} aria-label={t.talk} title={t.talk} disabled={busy} onPointerDown={talk.start} onPointerUp={talk.stop} onPointerLeave={talk.stop} onPointerCancel={talk.stop} onContextMenu={(e) => e.preventDefault()} data-testid="today-face-talk">
            <Icon name="wave" size={14} />
          </button>
        ) : (
          <button type="button" className="ask-talk off" aria-label={t.noVoice} title={t.noVoice} onClick={() => flash({ msg: <>{t.noVoice}</> })}>
            <Icon name="wave" size={14} />
          </button>
        )}
      </form>
      {toastNode}
    </section>
  );
};

Object.assign(window, { TodayFace });
```

Notes for the implementer: `useAskSpeech` holds one `useState`, `useAskTalk` one `useState` and two `useRef`; both are called on every render, in this order, so the stub React's cells never move. `t.noCalendar`, `t.unavailable` and `t.openings` exist in `ask-text.jsx` (the palette's fast openings use them, `ask-real.jsx:194-207`). `Icon` names `wave`, `refresh`, `arrow-right`, `headphones`, `pause` exist (`ask-real.jsx`, `ask-turn.jsx`, `ask-home.jsx`).

- [ ] **Step 5: The CSS**

In `dashboard-a-v2.css`, after the `@keyframes today-ring` line (line 35), add:

```css
/* ---- The three: the face above the queue (spec 2026-09-23-the-three-on-today) ---------------------------
   One band: the stage the character is drawn on, the exchange (empty at rest, so it takes no height), the
   field. The squares themselves are the bridge's (legacy-bridge/mascot); here only the box they stand in: a
   232px stage whose squares are sized for a 200px band, so the leap has 16px of room above and below. */
.today-face { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.tf-stage { position: relative; width: 100%; height: 232px; padding: 0; border: 0; border-radius: var(--radius-lg); background: transparent; cursor: pointer; touch-action: pan-y; user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.tf-stage:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.tf-stage canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.tf-exchange { display: flex; flex-direction: column; align-items: center; gap: 6px; width: min(620px, 100%); text-align: center; }
.tf-exchange:empty { display: none; }
.tf-question, .tf-caption { margin: 0; font-size: 12.5px; color: var(--ink-dim); }
.tf-answer { margin: 0; max-width: 36ch; font-size: 16px; line-height: 1.45; color: var(--ink); text-wrap: balance; white-space: pre-wrap; word-break: break-word; }
.tf-answer.failed { color: var(--ink-dim); }
.tf-exchange .ask-follow, .tf-exchange .ask-msg-links { justify-content: center; margin-top: 4px; }
.tf-field { display: flex; align-items: center; gap: 6px; width: min(620px, 100%); height: 40px; padding: 0 5px 0 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--bg-raised); }
.tf-field:focus-within { border-color: var(--line-strong); }
.tf-input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); }
.tf-input::placeholder { color: var(--ink-faint); }
.tf-input:disabled { opacity: 0.6; }
@media (max-width: 720px) {
  .tf-input { font-size: 16px; }
}
```

- [ ] **Step 6: Place it and register it**

`dashboard-a.jsx`: add `<TodayFace />` on the line after `<HeroBrief />`, and `TodayFace` to the `/* global … */` header. In `Chanlytics.html`, `pages/dashboard-a.jsx?v=10` becomes `?v=11`.

`manifest.ts`: after `import "@/legacy/pages/ask-real.jsx";` add `import "@/legacy/pages/today-face.jsx";`.
`Chanlytics.html`: after the `ask-real.jsx?v=1` tag add `<script type="text/babel" src="pages/today-face.jsx?v=1"></script>`.

- [ ] **Step 7: The composition pin in `today-page.test.mjs`**

The composition test (line 1265 on) pins `.dash-a-v2-core` and `.dash-a-v2-foot`. Before the `const core = find(...)` line, add the page's own order:

```js
  // The band between the standing line and the queue: the three (today-face.jsx).
  const page = find(tree, (n) => classes(n).includes("dash-a-v2"));
  assert.deepEqual(
    page.props.children.map((c) => (typeof c.type === "function" ? c.type.name : String(c.props.className))),
    ["HeroBrief", "TodayFace", "dash-a-v2-core", "TodayCard", "dash-a-v2-foot"],
  );
```
The band reads `window.AskHooks` and `window.askText`, so with the page imports at the top (line 58 on) add, before `dashboard-a.jsx`:

```js
await import(`${L}/pages/ask-text.jsx`);
await import(`${L}/pages/ask-hooks.jsx`);
await import(`${L}/pages/today-face.jsx`);
```
(`usePPToast`, `askAbout` and `appNavigate` are already seeded there; `Icon` is the stub's.)

- [ ] **Step 8: Run the tests**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/today-face.test.mjs tooling/scripts/tests/today-page.test.mjs tooling/scripts/tests/legacy-harness.test.mjs tooling/scripts/tests/ask.test.mjs`
Expected: all pass. `legacy-harness` proves the two lists agree; `ask.test` proves `ask.css` still comes last and the `.ask-card` rule is not in `dashboard-a-v2.css`.

- [ ] **Step 9: Lint, format, commit**

Run: `corepack pnpm lint` and `corepack pnpm format:check` → exit 0.

```bash
git add apps/dashboard/src/legacy/pages/today-face.jsx apps/dashboard/src/legacy/pages/ask-text.jsx apps/dashboard/src/legacy/pages/dashboard-a.jsx apps/dashboard/src/legacy-bridge/manifest.ts apps/dashboard/src/legacy/Chanlytics.html apps/dashboard/src/legacy/styles/dashboard-a-v2.css tooling/scripts/tests/today-face.test.mjs tooling/scripts/tests/today-page.test.mjs
git commit -m "The three, on Today: the band above the queue, asking through Ask"
```

---

### Task 7: The palette opens a thread it is handed

**Files:**
- Modify: `apps/dashboard/src/legacy/pages/ask-real.jsx:141-150` and its `?v=`
- Test: `tooling/scripts/tests/ask-palette.test.mjs` (next to the `ask:seed` cases at lines 349-358)

- [ ] **Step 1: Write the failing test**

The file's helpers: `ask(threads)` installs the real palette over a recorded stand-in whose `thread(id)` pushes to `calls.opened`; `render(Palette, CLOSED)`, `sent(type, detail)`, `opens()`, `closes()`, `byClass(tree, cls)`, `TH(n)` (a thread `th-n`, read its shape at line 292). After the N3 test add:

```js
test("a seed that names a thread opens that thread, the way a prompt is asked and New chat is taken", async () => {
  const calls = ask([TH(1), TH(2)]);
  render(Palette, CLOSED);
  // Today's band hands its conversation over as the palette opens.
  sent("ask:seed", { thread: TH(2).id });
  const tree = await opens();
  assert.deepEqual(calls.opened, [TH(2).id], "the thread was read");
  assert.equal(byClass(tree, "ask-msgs").length, 1, "and its conversation is open");
  assert.deepEqual(calls.sent, [], "nothing was asked");
  await closes();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-palette.test.mjs`
Expected: the new case FAILs (nothing read).

- [ ] **Step 3: Take the seed**

In `ask-real.jsx`, the seed effect's `else` branch becomes:

```js
      else {
        if (d.about) setScope(typeof d.about === "object" ? d.about : null);
        // Today's band hands its thread over: the same conversation, continued here.
        if (d.thread) openThread({ id: d.thread });
        else if (d.mode === "compose" || !d.prompt) { setActive(null); setQuery(d.prompt || ""); }
        else submit(d.prompt);
      }
```
Update the comment over `window.askAbout` in `dashboard-a-ask.jsx:358` to name the field: `askAbout({ prompt, title?, answer?, links?, mode: "thread" | "compose", thread?: id })`. Bump `ask-real.jsx?v=1` to `?v=2` and `dashboard-a-ask.jsx?v=29` to `?v=30`.

- [ ] **Step 4: Run the tests, commit**

Run: `node --conditions=react-server --import tsx --test tooling/scripts/tests/ask-palette.test.mjs tooling/scripts/tests/ask.test.mjs` → pass.

```bash
git add apps/dashboard/src/legacy/pages/ask-real.jsx apps/dashboard/src/legacy/pages/dashboard-a-ask.jsx apps/dashboard/src/legacy/Chanlytics.html tooling/scripts/tests/ask-palette.test.mjs
git commit -m "Ask: a seed can name a thread to open"
```

---

### Task 8: The mockup and the harness draw the band

**Files:**
- Modify: `tooling/scripts/serve-legacy.mjs` (the SAMPLES map, beside `/data/today-sample.js`)
- Modify: `apps/dashboard/src/legacy/Chanlytics.html` (one script tag beside the `data/today-sample.js` one)

- [ ] **Step 1: Bundle the bridge module for the mockup**

`serve-legacy.mjs` builds three bridge modules with esbuild for the mockup (`SAMPLES`, line 54: `today-sample`, `reports-sample`, `business-tab`; the route handler serves any key in the map). Add the mascot beside `business-tab`:

```js
  // Not a sample either: the three (legacy-bridge/mascot), so the mockup's Today has its face.
  "/data/mascot.js": {
    entry: path.join(REPO, "apps/dashboard/src/legacy-bridge/mascot/index.ts"),
    globalName: "__MS",
    footer: "__MS.installMascot();",
  },
```
and after line 52 of `Chanlytics.html` (`data/business-tab.js`) add `<script src="data/mascot.js?v=1"></script>` (a plain script, not `text/babel`: the bundle is JS). The harness (`tooling/scripts/e2e-harness/server.mjs`) serves the same map if it imports `serve-legacy.mjs`; check with `grep -n "serve-legacy\|SAMPLES" tooling/scripts/e2e-harness/server.mjs` and, if it lists bundles by name, add this one.

- [ ] **Step 2: See it in the mockup**

Run the mockup (`node tooling/scripts/serve-legacy.mjs 3210 apps/dashboard/src/legacy`, the `chanlytics-mockup` launch entry) and open `#/today`: the band draws under the standing line with the three at rest; the field seeds the palette. `today-sample.test.mjs` still passes.

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/serve-legacy.mjs apps/dashboard/src/legacy/Chanlytics.html
git commit -m "The three in the mockup: the bridge module bundled for it"
```

---

### Task 9: E2E

**Files:**
- Modify: `e2e/today.spec.ts` (two tests: one in the desktop describe, one line in the phone test)

- [ ] **Step 1: Write the tests**

In the desktop `test.describe("Today on a real workspace")`, after the "worth a look" test:

```ts
  test("the three: the band above the queue takes a question; a quick one settles without a model turn; Continue in Ask opens the thread", async ({
    page,
  }) => {
    const band = page.getByTestId("today-face");
    await expect(band).toBeVisible();
    const bandBox = await band.boundingBox();
    const queueBox = await page.getByTestId("today-queue").boundingBox();
    expect(bandBox!.y).toBeLessThan(queueBox!.y);
    await expect(band).toHaveAttribute("data-phase", "rest");
    // The palette's own quick question (contracts fastPath, kind "needs"): no model, no cost.
    await band.getByTestId("today-face-input").fill("who needs me?");
    await band.getByTestId("today-face-input").press("Enter");
    await expect(band).toHaveAttribute("data-phase", "settled", { timeout: 10_000 });
    expect((await band.getByTestId("today-face-exchange").innerText()).trim().length).toBeGreaterThan(0);
  });
```
(If `A.fast("who needs me?")` is not a match, read contracts' `fastPath` for a question it answers and use that; a model turn stays behind `E2E_PAID_MODEL`, as in `ask.spec.ts`.)

In the phone test, after `await expect(queue).toBeVisible();`:
```ts
    await expect(page.getByTestId("today-face")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
```

- [ ] **Step 2: Run them on the local harness**

Run: `corepack pnpm e2e:local -- e2e/today.spec.ts`
Expected: the band is visible and above the queue; the quick-question step is skipped or fails only for the missing `__ask` on the harness, in which case guard it: `test.skip(await page.evaluate(() => !window.__ask), "no Ask on this harness")` as the first line after the visibility checks.

- [ ] **Step 3: Commit**

```bash
git add e2e/today.spec.ts
git commit -m "E2E: the three on Today, a quick question, the phone"
```

---

### Task 10: Docs and the spec's status

**Files:**
- Modify: `apps/dashboard/src/legacy/CLAUDE.md:67`
- Modify: `docs/superpowers/specs/2026-09-23-the-three-on-today-design.md` (the Status line)

- [ ] **Step 1: The Today paragraph**

Line 67 begins `- **Today** is three bands in this order`. It becomes four: after the standing line, insert `the three (`today-face.jsx` TodayFace: the mark's squares alive on a canvas the bridge drives, `legacy-bridge/mascot`, asking through `window.__ask` on a thread of its own; spec 2026-09-23),` and change "three bands" to "four bands".

- [ ] **Step 2: The spec's status**

`**Status:** draft for Ruben's review` becomes `**Status:** approved (Ruben, 23 Sep)`.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/legacy/CLAUDE.md docs/superpowers/specs/2026-09-23-the-three-on-today-design.md
git commit -m "Docs: Today is four bands; the spec is approved"
```

---

### Task 11: The prototype, kept out of main

- [ ] **Step 1:** From the shared repo (not this worktree): `git worktree add ../cm-proto -b prototype/the-three origin/main`, copy `Claude Video/chanlytics-mascot-prototype/` to `cm-proto/tooling/prototypes/the-three/` (without `shots/`), commit "The three: the prototype that settled the design (22 Sep)", push the branch, remove the worktree.
- [ ] **Step 2:** Add one line to the spec's Prototype header: `Kept on branch prototype/the-three at tooling/prototypes/the-three/.` Commit on this branch.

---

### Task 12: The whole, then the PR

- [ ] **Step 1: Everything green**

Run: `corepack pnpm test 2>&1 | tail -3`, `corepack pnpm -r typecheck`, `corepack pnpm lint`, `corepack pnpm format:check`, `corepack pnpm check:dist` (nothing in packages changed, so it must report clean).
Expected: pass count = the Task 0 baseline plus 4 + 9 + 5 + 7 + 6 + 1 (the new tests), fail 0.

- [ ] **Step 2: Seen in the browser**

Start the dashboard (`corepack pnpm --filter dashboard dev`) and open `/w/<slug>/#/today` signed in, at 390px and 1280px, light and dark: the three at rest under the standing line; hold the stage, talk, release; a typed question; the answer; Continue in Ask opening the palette on the thread; no console errors; `document.documentElement.scrollWidth <= innerWidth` at 390px.

- [ ] **Step 3: Main, then the PR**

```bash
git fetch origin main
git merge origin/main            # resolve as the stacked-merge recipe in the memory notes says
corepack pnpm test && corepack pnpm -r typecheck && corepack pnpm lint
git push -u origin design/the-three-on-today
gh pr create --title "The three, on Today" --body-file <(cat <<'EOF'
The mark's three squares as the face of the app, above the queue, asking through the Ask that exists.

- `legacy-bridge/mascot/`: the character (pure), colour in OKLab, the drawing, a driver with its browser injected, the turn reducer; published as `window.__mascot`.
- `pages/today-face.jsx`: the band; the palette's talk and speech hooks; `__ask.send` on Today's own thread; quick answers first; proposals hand off to the palette.
- `ask-real.jsx`: a seed can name a thread to open.
- Tests: the character (no NaN, the leapfrog never overlaps, the band's envelope), the reducer, the driver on a fake canvas, the band on the stub React, Today's composition; e2e on the quick question and the phone.

Spec: docs/superpowers/specs/2026-09-23-the-three-on-today-design.md. Prototype: branch prototype/the-three.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```
Then the CI monitor; on green, squash-merge and delete the branch; then read the live Today in Ruben's signed-in pane at 390px and 1280px and note what was seen.

---

## Part 2: compact at rest, opens on activation (23 Sep, after #896 on main)

Ruben, on main: "too much dead space left and right due to the left column being so wide", "the type in chat looks
ugly, I'd rather like it open or appear or slide appear when users click to activate the agent", and the microphone
block "should prompt the browser to allow". Spec D11–D13 and section 4.6. One PR from `cm-face`, branch
`design/the-three-compact` off main `e3dc2aa2`. Executed inline; the code is the commits'.

### Task 13: The driver follows a new size

**Files:** `legacy-bridge/mascot/driver.ts`, `tooling/scripts/tests/mascot-driver.test.mjs`.

- [x] `Mounted.setSide(px)` / `side()`: a target the drawn size eases toward (τ 0.1 s) in `frame()`; under reduced
  motion it jumps and draws once. The gaze uses the eased size as its unit. Tests: followed over frames, not jumped;
  reduced motion draws at once.

### Task 14: The microphone block is named

**Files:** `pages/ask-hooks.jsx`, `pages/ask-text.jsx` (`micBlocked`, en/es), `pages/ask-real.jsx`, the band.

- [x] `useAskTalk.start` is async: `ahMicBlocked()` asks `navigator.permissions.query({ name: "microphone" })`
  (false where the API is missing or throws); `denied` → `onHeard(null, "blocked")` and no recogniser. A press
  released before the answer starts nothing (`wantRef`). Both callers show `t.micBlocked` for "blocked".

### Task 15: The band, compact and open

**Files:** `pages/today-face.jsx`, `styles/dashboard-a-v2.css`, `tooling/scripts/tests/today-face.test.mjs`,
`e2e/today.spec.ts`, `Chanlytics.html` (ask-hooks v2, ask-text v4, ask-real v3, today-face v3, dashboard-a-v2.css v34).

- [x] `open` state, `data-open` on the section. Closed: the stage alone (84×64, squares of 18px, `margin-left` 4px,
  left of the column). Open: `min(100%, 620px)` centred, 232px, squares of 52.6px (the driver eases them), the
  exchange and the field under it with a 220ms entrance; the queue moves as the stage's height transitions.
- [x] The stage's pointer sequence: a press shorter than 320ms is a click (open + focus the field in a layout
  effect, inside the click's task, so a phone shows its keyboard); a press held 320ms opens and starts listening;
  release stops. `onClick` takes only the keyboard (`detail === 0`). Escape (not the palette's) and a pointerdown
  outside the band close it; Clear clears and closes.
- [x] Tests: compact by default with no field; a click opens with the field; Escape closes and the answer is kept
  for the next opening; Clear closes; a hold flashes `noVoice` where the browser has no recogniser; the earlier
  flows open the band first. E2E: click the stage, then the quick question; Clear folds it; phone: compact at rest.

### Task 16: Docs, gates, PR

- [x] Spec 4.6 + D11–D13; CLAUDE.md Today paragraph; `pnpm test`, typecheck, lint, format:check; PR; merge on green;
  a look at production.

---

## Part 3: the face in the header on a desktop, the full face on a phone (23 Sep, after #899 and #901 on main)

Ruben, on main: the desktop placement was not a nice place, bring the queue up, perhaps a tiny icon or the header;
on a phone, the full face always, the field only when activated. Approved option A. Spec 4.7 and D14–D16. One PR
from `cm-face`, branch `design/the-three-in-the-header` off main `c50a856b`. Executed inline.

### Task 17: One mood

**Files:** `legacy-bridge/mascot/mood.ts`, `mascot/index.ts` (`mood`, `follow`), `tooling/scripts/tests/mascot-mood.test.mjs`.

- [x] `createMood()`: a state (a new one reaches every face; the same one, or no state, none), reactions, beats and
  words heard; `follow(face, mood)` sets the face to the state now and passes every event after; the bridge
  publishes one mood.

### Task 18: The three as the Ask button and the palette's stage

**Files:** `components/ask-face.jsx` (new; manifest + Chanlytics.html before `topbar.jsx`), `components/topbar.jsx`,
`styles/components.css`, `pages/ask-real.jsx`, `styles/ask.css`, `tooling/scripts/tests/ask-palette.test.mjs`.

- [x] `AskFace({ className, grow, testId })`: mounts the driver on its canvas and follows the mood; `grow` starts at
  the button's square (6px) and eases to the stage's (`clientHeight / UNITS`).
- [x] The top bar's button takes its icon from `window.AskFace` (the sparkle where it is not loaded); the palette
  draws a stage (`ask-stage`) as its main column's first child and drops the input bar's sparkle; both take the
  component from `window`, as the palette takes `AskTurn`, because a test's window is not the global object.
- [x] The palette says the mood (an effect on the computed state) and its events (a beat per delta; idle, then a shake
  for a failure or a nod for an answer that never streamed; a nod for a quick answer). Tests: the stage is drawn; a
  streamed turn says thinking, speaking, idle with two beats; a quick answer nods; a failure shakes.

### Task 19: Today: the band on a phone only, always full

**Files:** `pages/dashboard-a.jsx` (the band back between the standing line and the core), `pages/today-face.jsx`
(no compact size), `styles/dashboard-a-v2.css` (the band `display: none` at 721px and up; the core grid as before
#896), `tooling/scripts/tests/today-page.test.mjs`, `e2e/today.spec.ts`, `e2e/ask.spec.ts`.

- [x] Composition pins back to `["HeroBrief", "TodayFace", "dash-a-v2-core", …]` and `["AgentCommand", "TodayDay"]`.
  E2E: on a desktop the band is hidden, the button has its face, the queue is under the standing line and the
  palette has its stage; on a phone the stage is full and fieldless, a tap brings the field, a quick question
  settles and Clear folds it.

### Task 20: Docs, gates, PR

- [x] Spec 4.7, D14–D16; CLAUDE.md Today paragraph; gates; PR; merge on green; production.

---

## Part 4: the ✦ is the three, and the band says the mood (23 Sep, after #903 on main)

Ruben: continue with the ✦. Spec 4.8 and D17. One PR from `cm-face`, branch `design/the-three-on-the-phone-door`
off main `6037c804`. Executed inline.

### Task 21: A tone for a coral button

**Files:** `mascot/colour.ts` (`Tone`, `accentFg`, `palette(theme, tokens, tone)`), `mascot/driver.ts` (`tone`,
`--accent-fg` read), `tooling/scripts/tests/mascot-colour.test.mjs`.

- [x] On the accent the three are the glyph colour at the first step, each step nearer the coral, the last still
  readable, in both themes; the page's tokens reach it.

### Task 22: The ✦ draws the three; the band says the mood

**Files:** `components/ask-face.jsx` (`tone`), `pages/app-shell.jsx` (the ✦ takes `window.AskFace`), `styles/ask.css`
(`.phone-ask-face`), `pages/today-face.jsx` (says the mood, follows it), `pages/ask-real.jsx` (a word heard),
`tooling/scripts/tests/today-face.test.mjs`, `e2e/phone.spec.ts`, `Chanlytics.html`.

- [x] The band's case: drawn at rest it says nothing; a stepped turn says thinking, speaking, idle with a beat.
  E2E: the ✦ has its face.

### Task 23: Docs, gates, PR

- [x] Spec 4.8, D17; CLAUDE.md; gates; PR; merge on green; production.
