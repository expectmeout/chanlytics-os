/**
 * The frame's one flash (moved from legacy/components/data-bits.jsx, the one-system plan's step 2): usePPToast, the ONE
 * toast implementation, portalled to <body> so no scroll container clips it. A queue, not a slot: up to 3, each with its
 * own clock, the oldest dropped first. Its tone (good news, a note, a warning, a failure) sets its icon and colour, so
 * "saved" is told from "not saved" across the room, and how long it stays: a failure longer than a confirmation, a toast
 * with something to press long enough to reach it, or the exact `ms` a caller knows (the reply's cancel window, from its
 * receipt). The shape is contracts' (toastShape), through the chrome bridge; the standalone mockup has no bridge and keeps
 * one tone. A mouse resting on a toast, or focus in it, holds its clock; a finger never does (a tap on its words froze it
 * until the next tap elsewhere).
 *
 * GOING (Ruben, 18 Oct 2026: on a phone toasts stood far too long). A press anywhere besides it, or on its words, takes it
 * (the press does what it does as well), and so do Escape inside it, its Undo or act, and under a finger a pull down or a
 * flick across (touchSwipe); no × (a tap besides is one). A send's Undo `stays` through a tap besides. A phone shows the
 * newest alone, as one snackbar (three stood over its foot), and a send's Undo beside it, never pushed out.
 *
 * Usage: const [toastNode, flash] = usePPToast();
 *   flash({ msg, tone?: "ok"|"info"|"warn"|"danger", undo?, action?: {label,onClick}, links?: [{label,to}], ms?, icon?, once?, stays? })
 * `once`: a name for what the toast says; a second flash with the same name refreshes that toast in place of stacking a
 * twin under it (a mic pressed twice says "blocked" once).
 *
 * The kit's toast (kit/toast) is a second toast already; folding the two is a design change, after this move (decision
 * 0015: no redesign inside a move). Drawn as the JSX drew it, raw buttons and all, until the frame's kit step (eslint
 * KIT_PENDING). What it reads of the shell is read when it draws, as the JSX read it: the toast's shape and the frame's move
 * off the window, the portal and the glyph by their global names.
 */
import { useEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Icon } from "../kit/icon/icon";
import { touchSwipe } from "../kit/motion/swipe";
import type { LegacyFlash } from "../legacy-verbs";

/** A toast's shape, as contracts' toastShape says it from the flash it was asked for. */
interface ToastShape {
  tone: string;
  icon: string;
  role: string;
  ms: number;
  stays: boolean;
}

type Toast = LegacyFlash & ToastShape & { id: number };

interface Timer {
  handle: number | null;
  endsAt: number;
  left: number | null;
}

type FlashWindow = Window & {
  __chrome?: { toast?: (p: LegacyFlash) => ToastShape };
  CHANLY?: { nav?: (route: string) => void };
};
const flashWindow = () => window as FlashWindow;
/** The page's portal and glyph, by the global names the JSX reached them by (bare `ReactDOM` and `Icon`). */
type FlashGlobals = typeof globalThis & {
  ReactDOM?: { createPortal?: (node: ReactNode, into: Element) => ReactNode };
  Icon?: ComponentType<{ name: string; size?: number }>;
};
const flashGlobals = () => globalThis as FlashGlobals;

const FALLBACK_MS = 4000;
const TOAST_PHONE_QUERY = "(max-width: 900px)";
/** The least a held clock keeps once let go. */
const HELD_LEAST_MS = 1000;

const toastShapeOf = (p: LegacyFlash): ToastShape => {
  const chrome = flashWindow().__chrome;
  return chrome && chrome.toast
    ? chrome.toast(p)
    : { tone: p.tone || "ok", icon: p.icon || "check", role: "status", ms: p.ms || FALLBACK_MS, stays: false };
};
// A press on one of these inside a toast is that control's, never a press on the toast's words.
const TOAST_OWN_PRESS = "button, a, input, select, textarea, [role='button']";
const toastCap = () => (window.matchMedia && window.matchMedia(TOAST_PHONE_QUERY).matches ? 1 : 3);
let seq = 0;

/** What one toast's parts do, from the hook that holds the stack. */
interface ToastActs {
  close: (id: number) => void;
  hold: (id: number) => void;
  release: (id: number) => void;
  pressed: (toast: Toast) => (e: { target: EventTarget | null }) => void;
  keyed: (toast: Toast) => (e: { key: string; stopPropagation: () => void }) => void;
  byMouse: (fn: (id: number) => void, id: number) => (e: { pointerType?: string }) => void;
}

/** One toast: its glyph, its words, its doors, its act and its Undo; a pull down or a flick across takes it. */
function toastOf(toast: Toast, acts: ToastActs): ReactNode {
  const { close, hold, release, pressed, keyed, byMouse } = acts;
  const Glyph = flashGlobals().Icon ?? Icon;
  return (
    <div
      key={toast.id}
      className={`pp-toast pp-toast-${toast.tone}`}
      data-tone={toast.tone}
      role={toast.role}
      onPointerEnter={byMouse(hold, toast.id)}
      onPointerLeave={byMouse(release, toast.id)}
      onFocus={() => hold(toast.id)}
      onBlur={() => release(toast.id)}
      onClick={pressed(toast)}
      onKeyDown={keyed(toast)}
      {...touchSwipe({ onDown: () => close(toast.id), onAway: () => close(toast.id), onBack: () => close(toast.id) })}
    >
      <Glyph name={toast.icon} size={13} />
      <span className="pp-toast-msg">{toast.msg}</span>
      {(toast.links || []).map((l, i) => (
        <button
          key={i}
          className="pp-toast-cta"
          onClick={() => {
            close(toast.id);
            flashWindow().CHANLY?.nav?.(l.to);
          }}
        >
          {l.label}
        </button>
      ))}
      {toast.action && (
        <button
          className="pp-toast-cta"
          onClick={() => {
            close(toast.id);
            void toast.action?.onClick();
          }}
        >
          {toast.action.label}
        </button>
      )}
      {toast.undo && (
        <button
          className="pp-toast-cta"
          onClick={() => {
            void toast.undo?.();
            close(toast.id);
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}

/** The toast's node, for the page to draw, and the flash that raises one. `place`: a class of the caller's own on the stack. */
export const usePPToast = (place?: string): [ReactNode, (flash: LegacyFlash) => void] => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Record<number, Timer>>({});
  const shown = useRef<Toast[]>([]);
  shown.current = toasts;
  const stack = useRef<HTMLDivElement | null>(null);
  useEffect(
    () => () => {
      Object.values(timers.current).forEach((t) => {
        if (t.handle !== null) window.clearTimeout(t.handle);
      });
    },
    [],
  );
  const stop = (id: number) => {
    const t = timers.current[id];
    if (t && t.handle !== null) window.clearTimeout(t.handle);
    delete timers.current[id];
  };
  const close = (id: number) => {
    stop(id);
    setToasts((ts) => ts.filter((x) => x.id !== id));
  };
  // One listener for the hook's life, reading what is shown: a press begun anywhere but the stack takes every toast
  // that does not stay, before what the press opens or raises.
  useEffect(() => {
    const away = (e: Event) => {
      const box = stack.current;
      if (box && box.contains && e && e.target && box.contains(e.target as Node)) return;
      const going = shown.current.filter((x) => !x.stays).map((x) => x.id);
      going.forEach((id) => {
        const t = timers.current[id];
        if (t && t.handle !== null) window.clearTimeout(t.handle);
        delete timers.current[id];
      });
      if (going.length) setToasts((ts) => ts.filter((x) => !going.includes(x.id)));
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, []);
  const pressed = (toast: Toast) => (e: { target: EventTarget | null }) => {
    const on = e && (e.target as Element | null);
    if (!toast.stays && !(on && on.closest && on.closest(TOAST_OWN_PRESS))) close(toast.id);
  };
  const keyed = (toast: Toast) => (e: { key: string; stopPropagation: () => void }) => {
    if (e && e.key === "Escape") {
      e.stopPropagation();
      close(toast.id);
    }
  };
  const arm = (id: number, ms: number) => {
    timers.current[id] = { handle: window.setTimeout(() => close(id), ms), endsAt: Date.now() + ms, left: null };
  };
  const hold = (id: number) => {
    const t = timers.current[id];
    if (t && t.handle !== null) {
      window.clearTimeout(t.handle);
      t.handle = null;
      t.left = Math.max(HELD_LEAST_MS, t.endsAt - Date.now());
    }
  };
  const release = (id: number) => {
    const t = timers.current[id];
    if (t && t.handle === null) arm(id, t.left ?? HELD_LEAST_MS);
  };
  const byMouse = (fn: (id: number) => void, id: number) => (e: { pointerType?: string }) => {
    if (e && e.pointerType === "mouse") fn(id);
  };
  const flash = (payload: LegacyFlash) => {
    const shape = toastShapeOf(payload);
    const id = ++seq;
    setToasts((ts) => {
      const twin = payload.once ? ts.find((x) => x.once === payload.once) : null;
      if (twin) stop(twin.id);
      const next = [...ts.filter((x) => x !== twin), { ...payload, ...shape, id }];
      while (next.filter((x) => !x.stays).length > toastCap()) {
        const out = next.splice(
          next.findIndex((x) => !x.stays),
          1,
        )[0];
        if (out) stop(out.id);
      }
      return next;
    });
    arm(id, shape.ms);
  };
  const portal = flashGlobals().ReactDOM?.createPortal;
  const acts: ToastActs = { close, hold, release, pressed, keyed, byMouse };
  const node =
    toasts.length && portal
      ? portal(
          // stopPropagation: portal events bubble through the REACT tree, so a toast rendered inside an overlay (Ask modal,
          // dialogs) would otherwise trigger the overlay's close-on-click and kill the undo.
          <div
            ref={stack}
            className={`pp-toast-stack${place ? ` ${place}` : ""}`}
            role="presentation"
            onClick={(e) => e.stopPropagation()}
          >
            {toasts.map((toast) => toastOf(toast, acts))}
          </div>,
          document.body,
        )
      : null;
  return [node, flash];
};

/** What a refusal says, for `refusalToast`: contracts' refusalOf, a title for the kind of no and the owner's sentence. */
interface Refusal {
  title?: string | null;
  message?: string | null;
}

/**
 * A refusal, as a toast. The client names every refusal (contracts refusalOf): a title for the kind of no, and the
 * sentence in the owner's words. The page says what did not happen ("Not stopped") and the refusal says why; with no
 * words of the page's own, the refusal's title leads. Always the danger tone: nothing happened.
 *   flash(res.ok ? { msg: <>Stopped</> } : refusalToast(res, "Not stopped"))
 */
export const refusalToast = (r: Refusal | null | undefined, what: string | null = null): LegacyFlash => {
  const lead = what || (r && r.title) || null;
  const why = (r && r.message) || "That didn't go through.";
  return {
    tone: "danger",
    msg: lead ? (
      <>
        <b>{lead}</b> — {why}
      </>
    ) : (
      <>{why}</>
    ),
  };
};
