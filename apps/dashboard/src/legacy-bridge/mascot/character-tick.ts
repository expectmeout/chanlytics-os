/**
 * The frame: tick(dt) over the record, as phases in the order they have always run: attention, the voice, the beats
 * and the fidgets, the gaze, the moves, the springs, the breath, the fuse, the colour, the orbit, and where every
 * tile is now. Each phase applies dt to the record in place, and a later phase reads only what an earlier one left in
 * the record, so the order here is the contract. With them, the still frame under reduced motion.
 */
import { TAU, clamp, ease } from "./math";
import {
  CORNER,
  FOLLOW,
  LAYER_PER_LIFT,
  LIFT,
  ORBIT,
  RING_LIFT,
  SIZE,
  STATES,
  TURN,
  Z_POS,
  gain,
  levelAt,
  move,
  note,
  pose,
  ring,
  roll,
  sweep,
  type Core,
} from "./character-core";
import { runMoves } from "./character-moves";
import { join, rhythm, schedule } from "./character-states";

// attention: at rest and unattended for quietAfter seconds it stops breathing, with a stretch as it settles
function attention(st: Core, dt: number): void {
  if (st.state !== "idle" || st.attention > 0.5) {
    st.unattended = 0;
    st.settleArmed = true;
  } else st.unattended += dt;
  if (
    st.settleArmed &&
    !st.calm &&
    Number.isFinite(st.quietAfter) &&
    st.unattended > st.quietAfter - 1.25 &&
    !st.moves.length
  ) {
    st.settleArmed = false;
    move(st, "stretch");
    note(st, "settle");
  }
  const wantAwake = st.unattended < st.quietAfter ? 1 : 0;
  if (st.awake < 0.2) st.wasQuiet = true;
  st.awake = ease(st.awake, wantAwake, dt, wantAwake > st.awake ? 0.2 : 1.1);
  if (st.wasQuiet && st.awake > 0.6 && !st.calm) {
    // woken: the stack rises toward you and a light runs down it
    st.wasQuiet = false;
    move(st, "wave", { amp: 0.7, dur: 0.42 });
    sweep(st, 0.45);
    note(st, "wake");
    st.nextFidgetAt = st.clock + 2.5 + roll(st) * 2;
  }
}

// the voice: yours while it listens, its own while it answers, kept a moment so a wave can run down the stack
function voice(st: Core, dt: number): void {
  const raw = st.state === "listening" ? st.heard : st.state === "speaking" && st.voiceLive ? st.voiced : 0;
  st.level = ease(st.level, raw, dt, raw > st.level ? 0.035 : 0.14);
  st.hist.push({ t: st.clock, v: st.level });
  if (st.hist.length > 120) st.hist.shift();
}

// where it looks: at you, when you are near, or wherever a glance takes it; and the perk and the press
function gazeAt(st: Core, dt: number): void {
  st.pointerAge += dt;
  const seen = st.pointer !== null && st.pointerAge < 2.5;
  const gt = seen && st.pointer ? st.pointer.g : st.fidgetGaze;
  for (let c = 0; c < 2; c++) {
    st.gazeV[c] += (36 * (gt[c] - st.gaze[c]) - 12 * st.gazeV[c]) * dt;
    st.gaze[c] += st.gazeV[c] * dt;
  }
  st.perk = ease(st.perk, seen && st.pointer?.near ? 1 : 0, dt, 0.15);
  st.pressed = ease(st.pressed, st.pressDown ? 1 : 0, dt, st.pressDown ? 0.05 : 0.12);
}

// springs toward where the state wants each tile
function springs(st: Core, dt: number): void {
  const spread = 1 + st.spreadAdd + (0.04 * st.perk - 0.06 * st.pressed) * st.blend.idle;
  const steps = Math.max(1, Math.ceil(dt * 240));
  const h = dt / steps;
  for (const b of st.bodies) {
    const want = pose(st.state, b.step, st.level, spread);
    const tl = want.lift + (0.25 * st.perk - 0.4 * st.pressed) * st.blend.idle;
    const w = FOLLOW[clamp(b.step, 0, 2)];
    for (let k = 0; k < steps && h > 0; k++) {
      b.vx += (w * w * (want.x - b.x) - 2 * Z_POS * w * b.vx) * h;
      b.x += b.vx * h;
      b.vy += (w * w * (want.y - b.y) - 2 * Z_POS * w * b.vy) * h;
      b.y += b.vy * h;
      b.vscale += (SIZE.w * SIZE.w * (want.scale - b.scale) - 2 * SIZE.z * SIZE.w * b.vscale) * h;
      b.scale += b.vscale * h;
      b.vrot += (TURN.w * TURN.w * (want.rot - b.rot) - 2 * TURN.z * TURN.w * b.vrot) * h;
      b.rot += b.vrot * h;
      b.vlift += (LIFT.w * LIFT.w * (tl - b.lift) - 2 * LIFT.z * LIFT.w * b.vlift) * h;
      b.lift += b.vlift * h;
    }
  }
}

// what never stops while it is awake: a breath of elevation, the voice, the glance
function breathe(st: Core): void {
  const { blend, clock, light } = st;
  const glance = (blend.idle + 0.4 * blend.listening + 0.2 * blend.speaking) * (0.55 + 0.3 * st.sizeGain);
  for (const b of st.bodies) {
    const k = clamp(b.step, 0, 2);
    // the shadows rise and settle down the stack; the tiles themselves stay put
    const br = 0.5 + 0.5 * (0.65 * Math.sin(clock * 1.43 - k * 0.7) + 0.35 * Math.sin(clock * 0.83 + k * 1.1));
    b.obreath += blend.idle * st.awake * 0.16 * br;
    if (light) {
      // the standby light: every 6.5 s a little charge runs down the stack
      const p = (((clock / 6.5 - k * 0.1) % 1) + 1) % 1;
      b.ch += blend.idle * st.awake * 0.22 * (p < 0.34 ? Math.sin((Math.PI * p) / 0.34) ** 2 : 0);
    }
    const Ld = levelAt(st, clock - k * 0.085);
    b.oy -= blend.speaking * Ld * 0.1 * gain(st);
    b.olift += blend.speaking * Ld * 0.3;
    if (light) b.ch += blend.speaking * Ld * 0.3 + blend.listening * st.level * (k === 1 ? 0.6 : 0.25);
    const sway = 0.65 * Math.sin(clock * 1.6) + 0.35 * Math.sin(clock * 0.97 + 2);
    b.ox += blend.listening * (k - 1) * 0.02 * sway;
    // parallax: the top of the stack moves most toward where it looks
    b.ox += st.gaze[0] * [0.03, 0.05, 0.07][k] * glance;
    b.oy += st.gaze[1] * [0.025, 0.04, 0.055][k] * glance;
    b.orot += st.gaze[0] * 0.03 * glance;
  }
}

// the corners round while it listens, and the tiles may fuse while it listens, reads or answers
function fuse(st: Core, dt: number): void {
  st.corner = ease(st.corner, st.state === "listening" ? 0.28 : CORNER, dt, 0.25);
  st.liquid = ease(
    st.liquid,
    clamp(st.blend.listening * 0.75 + st.blend.thinking + st.blend.speaking * 0.2, 0, 1),
    dt,
    0.2,
  );
}

// colour: its step, and whether it is at work. Addressed, it lights at once; done, it keeps its colour through
// its bow and cools slowly, down the stack
function shade(st: Core, dt: number): void {
  // the light comes and goes quickly: coloured within 0.3 s, and grey about 0.4 s after it ends (it lingered 1.65 s,
  // which read as performed; Ruben, 26 Sep)
  st.lit = ease(st.lit, st.litTarget, dt, st.litTarget > st.lit ? 0.12 : 0.08);
  const liveNow = st.state === "idle" ? st.lit : 1;
  const warming = liveNow > st.prevLive;
  for (const b of st.bodies) {
    const k = clamp(b.step, 0, 2);
    const hold = warming ? k * 0.05 : 0.5 + k * 0.09;
    const target = st.clock - st.stateAt >= hold ? liveNow : st.prevLive;
    b.live = ease(b.live, target, dt, target > b.live ? 0.08 : st.glowOut ? 0.12 : 0.45);
    b.shade = ease(b.shade, k, dt, 0.16);
  }
}

// the orbit: joined over a quarter second and spinning up as the tiles arrive, then a lap in ORBIT.period, the
// pace breathing and surging
function orbit(st: Core, dt: number): void {
  if (st.state === "thinking" && !st.calm) st.orb = ease(st.orb, 1, dt, 0.26);
  if (st.orb > 0) {
    st.orbBoost = ease(st.orbBoost, 0, dt, 0.4);
    st.orbPhase += dt * (TAU / ORBIT.period) * (1 + 0.12 * Math.sin(st.clock * 0.9)) * (1 + st.orbBoost) * st.orb;
  }
}

// where every tile is now, into its frame: the pose with the gestures on it, blended onto the ring by `orb`
function output(st: Core, dt: number): void {
  const { orb, light } = st;
  for (const b of st.bodies) {
    const o = b.out;
    // the pose's elevation (what the draw order follows), and with the gestures on it
    let held = b.lift;
    let lift = Math.max(-0.5, b.lift + b.olift);
    let x = b.x + b.ox;
    let y = b.y + b.oy;
    let size = b.scale + b.oscale + 0.05 * Math.max(0, lift);
    let shade = b.shade;
    let charge = b.ch + b.afterglow;
    if (orb > 0) {
      const [rx, ry, z] = ring(b.phase + st.orbPhase, st.clock);
      const near = RING_LIFT.far + RING_LIFT.near * z;
      x += (rx - x) * orb;
      y += (ry - y) * orb;
      size *= 1 + ORBIT.depth * z * orb;
      held += (near - held) * orb;
      lift += (near - lift) * orb;
      shade += (1 + z - shade) * orb;
      charge += orb * (0.12 + 0.35 * Math.max(0, z));
    }
    b.afterglow = ease(b.afterglow, 0, dt, 0.35);
    if (dt > 0) {
      const f = 1 - Math.exp(-dt / 0.03);
      b.vox += ((x - b.pox) / dt - b.vox) * f;
      b.voy += ((y - b.poy) / dt - b.voy) * f;
    }
    b.pox = x;
    b.poy = y;
    o.step = b.step;
    o.x = x;
    o.y = y;
    o.size = Math.max(0, size);
    o.rot = b.rot + b.orot;
    o.shade = clamp(shade, 0, 2);
    o.live = b.live;
    o.charge = light ? clamp(charge, 0, 1) : 0;
    o.lift = Math.max(-0.5, lift + b.obreath);
    o.layer = b.step + LAYER_PER_LIFT * held;
  }
}

/** One frame (tick): the record dt seconds on, every tile's frame filled in. */
export function advance(st: Core, dtIn: number): Core {
  const dt = dtIn > 0 ? dtIn : 0;
  st.clock += dt;
  for (const s of STATES) st.blend[s] = ease(st.blend[s], s === st.state ? 1 : 0, dt, 0.16);
  attention(st, dt);
  voice(st, dt);
  if (!st.calm) {
    rhythm(st, dt);
    schedule(st);
  }
  gazeAt(st, dt);
  runMoves(st);
  springs(st, dt);
  if (!st.calm) breathe(st);
  fuse(st, dt);
  shade(st, dt);
  orbit(st, dt);
  output(st, dt);
  return st;
}

/** Reduced motion (still): the state's pose, drawn once, nothing moving; reading's is the ring, still. */
export function stillPose(st: Core): Core {
  st.moves.length = 0;
  st.hist.length = 0;
  st.spreadAdd = 0;
  st.perk = 0;
  st.pressed = 0;
  st.level = 0;
  st.liquid = 0;
  st.fidgetGaze = [0, 0];
  st.gaze[0] = st.gaze[1] = st.gazeV[0] = st.gazeV[1] = 0;
  for (const s of STATES) st.blend[s] = s === st.state ? 1 : 0;
  st.corner = st.state === "listening" ? 0.28 : CORNER;
  st.orb = st.state === "thinking" ? 1 : 0;
  st.bodies
    .slice()
    .sort((a, b) => a.step - b.step)
    .forEach((b, k) => {
      b.step = k;
      b.afterglow = 0;
      const want = pose(st.state, k, 0, 1);
      Object.assign(b, {
        x: want.x,
        y: want.y,
        vx: 0,
        vy: 0,
        scale: want.scale,
        vscale: 0,
        rot: want.rot,
        vrot: 0,
        lift: want.lift,
        vlift: 0,
        shade: k,
        live: st.state === "idle" ? 0 : 1,
      });
    });
  join(st);
  st.prevLive = st.state === "idle" ? 0 : 1;
  st.stateAt = st.clock - 1;
  advance(st, 0);
  for (const b of st.bodies) {
    b.pox = b.out.x;
    b.poy = b.out.y;
    b.vox = 0;
    b.voy = 0;
  }
  return st;
}
