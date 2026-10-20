/**
 * The kit's toast (kit.css, "Toast (usePPToast)"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and
 * step 2.5): the one flash, in its four tones, each with its glyph (the Icon's, which the page hands it: `check`,
 * `info`, `alert`, `error`), its words, and an Undo or one act; stacked at the window's foot, newest nearest it, three
 * at most, and on a phone the newest alone. How long each stays and how loudly it is announced are contracts'
 * (`toastShape`): three seconds to four at most, and a failure interrupting a screen reader.
 *
 *   const [toasts, flash] = useToast(glyphs);
 *   flash({ msg: <><b>Sam Ortega</b> is off Regulars</>, undo: () => putBack() });
 *   return <>{page}{toasts}</>;
 *
 * As usePPToast's, so a page's swap is its import (the plan's Phase 4): `flash` takes `msg`, `tone`, `undo`, `action`,
 * `ms`, `once`, a name that refreshes the toast already saying it in place of stacking a twin, and `stays`, a send's
 * Undo, which a press besides it does not take.
 *
 * Its behaviour is Base UI's Toast (`@base-ui/react/toast`, the plan's decision 15): the stack is a region a screen
 * reader hears each toast arrive in, and F6 takes the keyboard into; a toast's clock stops while a mouse rests on the
 * stack or focus is in it; it goes when its time is up, or swiped away; a fourth waits behind the three until one goes.
 * The stack is drawn in a portal on the document's body, above every sheet. What the kit adds is the house's going
 * (frame/flash.tsx usePPToast, Ruben, 18 Oct 2026): no ×, since a press anywhere besides a toast, or on its words, takes it,
 * and a phone shows the newest alone, beside a send's Undo.
 *
 * It draws what the gallery's Toast family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser.
 */
import { Toast as BaseToast } from "@base-ui/react/toast";
import { toastShape } from "@chanlytics/contracts";
import type { ToastTone } from "@chanlytics/contracts";
import type { MouseEvent, ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { variants } from "../variants";

/** How many toasts stand at once, as the house's stack holds them. */
const TOAST_LIMIT = 3;

/** Where the house's phone begins (tokens.css `--bp-narrow`): one toast at a time there. */
const PHONE_QUERY = "(max-width: 900px)";

/** A press on one of these inside a toast is that control's, never a press on the toast's words. */
const OWN_PRESS = "button, a, input, select, textarea, [role='button']";

const toastClasses = variants({
  base: "pp-toast",
  variants: { tone: { ok: "pp-toast-ok", info: "pp-toast-info", warn: "pp-toast-warn", danger: "pp-toast-danger" } },
  defaults: { tone: "ok" },
});

/** The glyphs a toast draws: one for each tone. */
export type ToastGlyphs = Readonly<Record<ToastTone, ReactElement>>;

/** What a toast says and offers: its words, its tone, an Undo or one act, how long it stays, and a name. */
export type ToastFlash = {
  msg: ReactNode;
  tone?: ToastTone;
  /** Takes back what was just done, and closes the toast. */
  undo?: () => void;
  /** One act of its own: "Try again", "Open it". */
  action?: { label: string; onPress: () => void };
  /** How long it stays, where the page knows its window (a reply's cancel window), up to contracts' ceiling. */
  ms?: number;
  /** What it says, as a name: a second flash with the same name refreshes this one in place. */
  once?: string;
  /** A send's Undo: a press besides it, or a newer toast on a phone, does not take it. */
  stays?: boolean;
};

/** What rides with a toast into Base UI's list, for its buttons and its going. */
type ToastData = { tone: ToastTone; undo?: () => void; action?: ToastFlash["action"]; stays: boolean };

/** One toast: its glyph, its words, and its Undo or act. A press on its words takes it, unless it stays. */
function OneToast({
  toast,
  glyphs,
  close,
}: {
  toast: BaseToast.Root.ToastObject<ToastData>;
  glyphs: ToastGlyphs;
  close: (id: string) => void;
}) {
  const data = toast.data;
  const tone = data?.tone ?? "ok";
  const pressed = (e: MouseEvent<HTMLDivElement>) => {
    const on = e.target instanceof Element ? e.target : null;
    if (!data?.stays && !on?.closest(OWN_PRESS)) close(toast.id);
  };
  return (
    <BaseToast.Root
      toast={toast}
      className={toastClasses({ tone })}
      render={<div data-tone={tone} />}
      onClick={pressed}
    >
      {glyphs[tone]}
      <BaseToast.Description className="pp-toast-msg" render={<span />}>
        {toast.description}
      </BaseToast.Description>
      {data?.action ? (
        <BaseToast.Action
          className="pp-toast-cta"
          onClick={() => {
            close(toast.id);
            data.action?.onPress();
          }}
        >
          {data.action.label}
        </BaseToast.Action>
      ) : null}
      {data?.undo ? (
        <BaseToast.Action
          className="pp-toast-cta"
          onClick={() => {
            data.undo?.();
            close(toast.id);
          }}
        >
          Undo
        </BaseToast.Action>
      ) : null}
    </BaseToast.Root>
  );
}

/** The stack's toasts, oldest first, so the newest stands nearest the window's foot; one waiting behind is not drawn. */
function Toasts({ glyphs }: { glyphs: ToastGlyphs }) {
  const { toasts, close } = BaseToast.useToastManager<ToastData>();
  const standing = toasts.filter((toast) => !toast.limited).reverse();
  return (
    <>
      {standing.map((toast) => (
        <OneToast key={toast.id} toast={toast} glyphs={glyphs} close={close} />
      ))}
    </>
  );
}

/** The toasts a page raises: the stack to draw, and the flash that raises one. */
export function useToast(glyphs: ToastGlyphs): [ReactNode, (flash: ToastFlash) => void] {
  const [manager] = useState(() => BaseToast.createToastManager<ToastData>());
  // The toasts standing, by id, and whether each stays: what a press besides them, or a phone's newer toast, takes.
  const shown = useRef(new Map<string, boolean>());
  const stack = useRef<HTMLDivElement | null>(null);
  // One listener for the hook's life: a press begun anywhere but the stack takes every toast that does not stay,
  // before what the press opens or raises. Base UI's own only starts the clock again.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const box = stack.current;
      if (box && e.target instanceof Node && box.contains(e.target)) return;
      for (const [id, stays] of shown.current) if (!stays) manager.close(id);
    };
    document.addEventListener("pointerdown", away, true);
    return () => document.removeEventListener("pointerdown", away, true);
  }, [manager]);
  const flash = useCallback(
    ({ msg, tone, undo, action, ms, once, stays }: ToastFlash) => {
      const shape = toastShape({ tone, undo, action, ms, stays });
      if (window.matchMedia?.(PHONE_QUERY).matches)
        for (const [id, kept] of shown.current) if (!kept && id !== once) manager.close(id);
      const id: string = manager.add({
        id: once,
        description: msg,
        timeout: shape.ms,
        priority: shape.role === "alert" ? "high" : "low",
        data: { tone: shape.tone, undo, action, stays: shape.stays },
        onRemove: () => shown.current.delete(id),
      });
      shown.current.set(id, shape.stays);
    },
    [manager],
  );
  const node = (
    <BaseToast.Provider toastManager={manager} limit={TOAST_LIMIT}>
      <BaseToast.Portal>
        <BaseToast.Viewport ref={stack} className="pp-toast-stack">
          <Toasts glyphs={glyphs} />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
  return [node, flash];
}
