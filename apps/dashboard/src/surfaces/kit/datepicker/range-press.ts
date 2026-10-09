/**
 * What a press does to a range being picked on the month (day-range-picker.tsx), decided here and nowhere else, so
 * every way a person presses is one rule (Ruben, 10 Oct 2026: "sometimes it doesn't select the range I selected on
 * first try and have to click around"). The month used to act on a day button's click, which a browser fires only when
 * the press and the release are on the one 36px button: a pointer that slid a few pixels on before the release chose
 * nothing, a drag from the first day to the last chose nothing, and the room between two buttons was dead.
 *
 * - A mouse or a pen acts as it presses: the first press is the first day, a press with a first day pressed ends the
 *   range. Let go where you like after a press; only a drag past the slop (`RANGE_SLOP_PX`) to another day ends the
 *   range there, so a drag from the first day to the last chooses them, and a slip onto the next day does not.
 * - A finger acts as it lifts, and only if it did not travel past the slop: a touch that moved, or that the browser
 *   took for a scroll (`cancel`), was not a press.
 * - A key (Enter or Space on a day) acts as a press does.
 * - A day that cannot be chosen (one to come, or too far to be the other end) chooses nothing, and the press says why
 *   (`refused`) for the month's words. The next press that acts lets go of them.
 * - A press is of one range (`of`, the range shown, by its first day and its last). Once the range changes from beside
 *   the month (a shortcut, a period, Back), a first day pressed before is let go: one more press is a first day, never
 *   the end of a range begun for another.
 *
 * Days are the page's "YYYY-MM-DD"; nothing here reads a clock or the document.
 */
import { daysApart } from "./days";

/** How far a pointer may travel between its press and its release and still be one press, not a drag or a scroll. */
export const RANGE_SLOP_PX = 8;

/** A range of days: its first and its last, "YYYY-MM-DD". */
export type PressRange = { from: string; to: string };

/** What presses: a mouse and a pen act as they press, a finger as it lifts. */
export type PressKind = "mouse" | "pen" | "touch";

/** Why a day chose nothing. */
export type PressRefusal = { day: string; why: "to-come" | "too-far" };

/** A pointer that is down: where it went down, and on which day. */
type Held = {
  day: string;
  kind: PressKind;
  x: number;
  y: number;
  /** It travelled past the slop since it went down. */
  far: boolean;
  /** Its press pressed the first day (a mouse's or a pen's), so a drag from it may end the range. */
  anchored: boolean;
};

/** A range being picked: the range shown, the first day pressed, where the band reaches, and the pointer that is down. */
export type RangePress = {
  /** The range shown, "from~to": what this press is of. */
  of: string;
  /** The first day pressed, while the last is still to be; null while nothing is pressed. */
  anchor: string | null;
  /** Where the band is drawn to while the last day is still to be: the pointer's day, or the keys'. */
  reach: string | null;
  held: Held | null;
  /** The last day that chose nothing, and why, until a press acts. */
  refused: PressRefusal | null;
};

export type PressEvent =
  | { type: "down"; day: string; kind: PressKind; x: number; y: number }
  | { type: "move"; x: number; y: number }
  | { type: "up"; day: string | null; x: number; y: number }
  | { type: "cancel" }
  | { type: "enter"; day: string }
  | { type: "leave" }
  | { type: "key"; day: string }
  | { type: "escape" };

/** The rules a range is held to: today (nothing after it), and the most days a range may hold. */
export type PressRules = { today: string; most: number };

/** What a press did: the state after it, the range it chose (or null), and whether it was the month's (Escape). */
export type PressStep = { state: RangePress; chose: PressRange | null; handled: boolean };

/** Nothing pressed, over the range shown. */
export const restingPress = (of: string): RangePress => ({ of, anchor: null, reach: null, held: null, refused: null });

/** Two days in their order. */
const ordered = (a: string, b: string): PressRange => (a <= b ? { from: a, to: b } : { from: b, to: a });

/** Why a day cannot be pressed now, or null where it can: none to come, and none too far from a first day pressed. */
function refusalOf(state: RangePress, day: string, rules: PressRules): PressRefusal | null {
  if (day > rules.today) return { day, why: "to-come" };
  if (state.anchor !== null && daysApart(state.anchor, day) >= rules.most) return { day, why: "too-far" };
  return null;
}

/** Whether a day can be pressed now: what the month draws as open, and what a press there does. */
export const dayIsOpen = (state: RangePress, day: string, rules: PressRules): boolean =>
  refusalOf(state, day, rules) === null;

/** A press on a day that acts: the first day, or the last, which chooses the range. */
function pressDay(state: RangePress, day: string, rules: PressRules): { state: RangePress; chose: PressRange | null } {
  const refused = refusalOf(state, day, rules);
  if (refused) return { state: { ...state, refused }, chose: null };
  if (state.anchor === null) return { state: { ...state, anchor: day, reach: day, refused: null }, chose: null };
  return { state: { ...restingPress(state.of) }, chose: ordered(state.anchor, day) };
}

const travelled = (held: Held, x: number, y: number): boolean =>
  held.far || Math.abs(x - held.x) > RANGE_SLOP_PX || Math.abs(y - held.y) > RANGE_SLOP_PX;

/** A pointer let go: a finger's tap presses its day, a drag from the first day ends the range where it is let go. */
function release(
  now: RangePress,
  event: { day: string | null; x: number; y: number },
  rules: PressRules,
): { state: RangePress; chose: PressRange | null } {
  const held = now.held;
  if (!held) return { state: now, chose: null };
  const far = travelled(held, event.x, event.y);
  const rest = { ...now, held: null };
  if (held.kind === "touch") return far ? { state: rest, chose: null } : pressDay(rest, held.day, rules);
  // A drag from the first day pressed, let go on another day: the range is chosen there.
  if (held.anchored && far && event.day !== null && event.day !== held.day && rest.anchor !== null) {
    return pressDay(rest, event.day, rules);
  }
  // A click, a slip, or a drag let go off the month or on its own day: the first day stays pressed.
  return { state: { ...rest, reach: rest.anchor }, chose: null };
}

/**
 * One press event over the state, against the rules; `of` is the range shown now, and a state of another range is
 * let go of before the event is read.
 */
export function rangePress(state: RangePress, event: PressEvent, rules: PressRules, of: string = state.of): PressStep {
  const now = state.of === of ? state : restingPress(of);
  const step = (next: RangePress, chose: PressRange | null = null, handled = true): PressStep => ({
    state: next,
    chose,
    handled,
  });
  switch (event.type) {
    case "down": {
      if (event.kind === "touch") {
        const held: Held = { day: event.day, kind: "touch", x: event.x, y: event.y, far: false, anchored: false };
        return step({ ...now, held });
      }
      const anchoring = now.anchor === null;
      const pressed = pressDay(now, event.day, rules);
      const anchored = anchoring && pressed.state.anchor !== null;
      const held: Held = { day: event.day, kind: event.kind, x: event.x, y: event.y, far: false, anchored };
      return step({ ...pressed.state, held }, pressed.chose);
    }
    case "move": {
      if (!now.held || now.held.far || !travelled(now.held, event.x, event.y)) return step(now);
      return step({ ...now, held: { ...now.held, far: true } });
    }
    case "up": {
      const lifted = release(now, event, rules);
      return step(lifted.state, lifted.chose);
    }
    case "cancel":
      return step({ ...now, held: null });
    case "enter": {
      if (now.anchor === null || now.held?.kind === "touch") return step(now);
      return step(dayIsOpen(now, event.day, rules) ? { ...now, reach: event.day } : now);
    }
    case "leave":
      return step(now.anchor !== null && !now.held ? { ...now, reach: now.anchor } : now);
    case "key": {
      const pressed = pressDay(now, event.day, rules);
      return step(pressed.state, pressed.chose);
    }
    case "escape":
      return now.anchor === null ? step(now, null, false) : step(restingPress(now.of));
  }
}
