/**
 * The kit's toast (kit.css, "Toast (usePPToast)"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and
 * step 2.5): the one flash, in its four tones, each with its glyph (the Icon's, which the page hands it: `check`,
 * `info`, `alert`, `error`), its words, an Undo or one act, and its ×; stacked at the window's foot, newest nearest
 * it, three at most. How long each stays and how loudly it is announced are contracts' (`toastShape`): a failure
 * longer than a confirmation, a toast with an Undo as long as the undo, and a failure interrupting a screen reader.
 *
 *   const [toasts, flash] = useToast(glyphs);
 *   flash({ msg: <><b>Sam Ortega</b> is off Regulars</>, undo: () => putBack() });
 *   return <>{page}{toasts}</>;
 *
 * As usePPToast's, so a page's swap is its import (the plan's Phase 4): `flash` takes `msg`, `tone`, `undo`, `action`,
 * `ms` and `once`, a name that refreshes the toast already saying it in place of stacking a twin.
 *
 * Its behaviour is Base UI's Toast (`@base-ui/react/toast`, the plan's decision 15): the stack is a region a screen
 * reader hears each toast arrive in, and F6 takes the keyboard into; a toast's clock stops while the pointer rests
 * on the stack or focus is in it; a toast goes when its time is up, on its ×, or swiped away; a fourth waits behind
 * the three until one goes. The stack is drawn in a portal on the document's body, above every sheet. The kit writes
 * none of it.
 *
 * It draws what the gallery's Toast family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser.
 */
import { Toast as BaseToast } from "@base-ui/react/toast";
import { toastShape } from "@chanlytics/contracts";
import type { ToastTone } from "@chanlytics/contracts";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useState } from "react";
import { variants } from "../variants";

/** How many toasts stand at once, as the house's stack holds them. */
const TOAST_LIMIT = 3;

const toastClasses = variants({
  base: "pp-toast",
  variants: { tone: { ok: "pp-toast-ok", info: "pp-toast-info", warn: "pp-toast-warn", danger: "pp-toast-danger" } },
  defaults: { tone: "ok" },
});

/** The glyphs a toast draws: one for each tone, and its ×. */
export type ToastGlyphs = Readonly<Record<ToastTone, ReactElement>> & { dismiss: ReactElement };

/** What a toast says and offers: its words, its tone, an Undo or one act, how long it stays, and a name. */
export type ToastFlash = {
  msg: ReactNode;
  tone?: ToastTone;
  /** Takes back what was just done, and closes the toast. */
  undo?: () => void;
  /** One act of its own: "Try again", "Open it". */
  action?: { label: string; onPress: () => void };
  /** How long it stays, where the page knows its window exactly (a reply's cancel window). */
  ms?: number;
  /** What it says, as a name: a second flash with the same name refreshes this one in place. */
  once?: string;
};

/** What rides with a toast into Base UI's list, for its buttons. */
type ToastData = { tone: ToastTone; undo?: () => void; action?: ToastFlash["action"] };

/** One toast: its glyph, its words, its Undo or act, and its ×. */
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
  return (
    <BaseToast.Root toast={toast} className={toastClasses({ tone })} render={<div data-tone={tone} />}>
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
      <BaseToast.Close className="pp-toast-x" aria-label="Dismiss">
        {glyphs.dismiss}
      </BaseToast.Close>
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
  const flash = useCallback(
    ({ msg, tone, undo, action, ms, once }: ToastFlash) => {
      const shape = toastShape({ tone, undo, ms });
      manager.add({
        id: once,
        description: msg,
        timeout: shape.ms,
        priority: shape.role === "alert" ? "high" : "low",
        data: { tone: shape.tone, undo, action },
      });
    },
    [manager],
  );
  const node = (
    <BaseToast.Provider toastManager={manager} limit={TOAST_LIMIT}>
      <BaseToast.Portal>
        <BaseToast.Viewport className="pp-toast-stack">
          <Toasts glyphs={glyphs} />
        </BaseToast.Viewport>
      </BaseToast.Portal>
    </BaseToast.Provider>
  );
  return [node, flash];
}
