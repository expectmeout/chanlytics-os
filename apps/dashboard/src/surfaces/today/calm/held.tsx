/**
 * Hold a line (Working for you, W11, 21 Nov 2026): a press held on a line (a finger kept still for half a second), or a right
 * click on a desk, opens its acts without opening it: Done, Not now, and Ask AI about this. Done gives the conversation back
 * to AI, or finishes the to-do; Not now puts it off to a time on the business's clock; Ask AI opens AI's field already about
 * this line, with nothing written in it (W24: the question carries who and what, never preset words). Each act says what it
 * did, with its Undo. No swipe: on a phone a swipe moves between pages.
 *
 * While a line is held, or a sheet is open over Today, nothing moves under your hands (W23, need-you.tsx useHeldArrivals).
 */
import {
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { AskScope } from "@chanlytics/contracts";
import { askAbout } from "../../frame-doors";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { afterSheetCloses } from "../../kit/sheet/back";
import { Sheet } from "../../kit/sheet/sheet";
import { useSeeOver } from "../../see/see-mount";
import { useAiSheetOpen } from "../ai/open";
import { TODAY_LINE_WORDS } from "../model/lines";

/** What a held line offers: its name, and each act it has (null where it has none). */
export interface HeldActs {
  name: string;
  done: (() => void) | null;
  notNow: { choices: ReadonlyArray<{ key: string; label: string }>; choose: (key: string) => void } | null;
  about: AskScope | null;
}

const WORDS = TODAY_LINE_WORDS.held;

/** How long a finger stays still on a line before it is held, and how far it may wander and still be holding. */
const HOLD_MS = 480;
const STILL_PX = 8;

let held: HeldActs | null = null;
const hearers = new Set<() => void>();

function told(next: HeldActs | null): void {
  held = next;
  for (const fn of [...hearers]) fn();
}

/** Let the held line go: its sheet shuts. */
export const letGo = (): void => told(null);

function hear(fn: () => void): () => void {
  hearers.add(fn);
  return () => void hearers.delete(fn);
}
const heldNow = (): HeldActs | null => held;
const noneOnTheServer = (): HeldActs | null => null;

/** The line held now, if any. */
const useHeldLine = (): HeldActs | null => useSyncExternalStore(hear, heldNow, noneOnTheServer);

/** Whether a hand is busy on Today: a line held, AI's sheet open, or a thing open over Today. */
export function useHandsBusy(): boolean {
  const line = useHeldLine();
  const ai = useAiSheetOpen();
  const over = useSeeOver();
  return line !== null || ai || over !== null;
}

/** The one finger holding: where it went down, its timer, and whether the hold fired (the click after it is no press). */
let finger: { x: number; y: number; timer: ReturnType<typeof setTimeout> } | null = null;
let fired = false;

function release(): void {
  if (finger) clearTimeout(finger.timer);
  finger = null;
}

/** What a line carries to be held: a held press on a touch screen, a right click with a mouse, and the click a hold leaves. */
export interface HoldProps {
  onPointerDown: (e: PointerEvent) => void;
  onPointerMove: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: MouseEvent) => void;
  onClickCapture: (e: MouseEvent) => void;
  /** On a desk, a line in focus answers its acts' keys (W12, keys.tsx): E Done, N Not now, / Ask AI about this. */
  onKeyDown: (e: KeyboardEvent) => void;
}

/** Whether a key came with a modifier, or from somewhere words are typed: the page's keys never take it then. */
export function typing(e: {
  target: EventTarget | null;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey) return true;
  const el = e.target instanceof HTMLElement ? e.target : null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

/** A held line's act by its key, where the line has it: E Done, N its Not now (the sheet, at its times), / Ask AI. */
function keyAct(acts: HeldActs, key: string): (() => void) | null {
  if (key === "e") return acts.done;
  if (key === "n") return acts.notNow ? () => told(acts) : null;
  const about = acts.about;
  if (key === "/") return about ? () => askAbout({ mode: "compose", prompt: "", about, fresh: true }) : null;
  return null;
}

/** The hold of a line with these acts, spread on the line (lines.tsx CalmRow `hold`). */
export function holdOf(acts: HeldActs): HoldProps {
  return {
    onPointerDown: (e) => {
      if (e.pointerType === "mouse") return;
      release();
      fired = false;
      const timer = setTimeout(() => {
        fired = true;
        finger = null;
        told(acts);
      }, HOLD_MS);
      finger = { x: e.clientX, y: e.clientY, timer };
    },
    onPointerMove: (e) => {
      if (finger && Math.hypot(e.clientX - finger.x, e.clientY - finger.y) > STILL_PX) release();
    },
    onPointerUp: release,
    onPointerCancel: release,
    onContextMenu: (e) => {
      e.preventDefault();
      release();
      told(acts);
    },
    onClickCapture: (e) => {
      if (!fired) return;
      fired = false;
      e.preventDefault();
      e.stopPropagation();
    },
    onKeyDown: (e) => {
      if (typing(e)) return;
      const press = keyAct(acts, e.key.toLowerCase());
      if (!press) return;
      e.preventDefault();
      press();
    },
  };
}

/** One act of the sheet: its glyph and its words, the whole row a press. */
function act(key: string, glyph: ReactNode, words: string, onPress: () => void) {
  return (
    <Button
      key={key}
      variant="quiet"
      size="lg"
      className="calm-held-act"
      onClick={onPress}
      data-testid={`today-held-${key}`}
    >
      {glyph}
      <span>{words}</span>
    </Button>
  );
}

/** Each act lets the line go first: its sheet shuts as the act is done. */
const then = (fn: () => void) => () => {
  letGo();
  fn();
};

/** A held line's acts: Done, Not now (pressed, its times in its place), Ask AI about this. */
function HeldActsOf({ line }: { line: HeldActs }) {
  const [later, setLater] = useState(false);
  const notNow = line.notNow;
  const about = line.about;
  return (
    <div className="calm-held-acts">
      {line.done ? act("done", <Icon name="check" size={16} />, WORDS.done, then(line.done)) : null}
      {notNow && !later ? act("later", <Icon name="clock" size={16} />, WORDS.later, () => setLater(true)) : null}
      {notNow && later
        ? notNow.choices.map((c) =>
            act(
              `later-${c.key}`,
              <Icon name="clock" size={16} />,
              c.label,
              then(() => notNow.choose(c.key)),
            ),
          )
        : null}
      {about
        ? act("ask", <Icon name="three" size={16} />, WORDS.ask, () =>
            // AI's field opens once the sheet's Back has settled: opened at once, that Back shut it again.
            afterSheetCloses(letGo, () => askAbout({ mode: "compose", prompt: "", about, fresh: true })),
          )
        : null}
    </div>
  );
}

/** The held line's acts, over Today. */
export function HeldSheet() {
  const line = useHeldLine();
  return (
    <Sheet
      open={line !== null}
      onClose={letGo}
      title={line?.name ?? ""}
      close={{ label: WORDS.close, glyph: <Icon name="x" size={13} /> }}
      kicker
      fit
      backCloses
      className="over-page calm-held-over"
      testid="today-held-sheet"
    >
      {line ? <HeldActsOf key={line.name} line={line} /> : null}
    </Sheet>
  );
}
