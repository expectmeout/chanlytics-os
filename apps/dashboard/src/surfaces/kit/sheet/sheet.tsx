/**
 * The kit's sheet (kit.css, "Sheet"; docs/plans/2026-09-28-the-interface-kit-and-its-looks.md, §3.4 and step 2.5):
 * a side pane on a desk, and from the bottom edge under the kit's 900px, over the page's wash, holding the record
 * sheet's composer: a head with its title, the line under it and its Close; the tools, where a list has them; the
 * rows, which scroll; and a foot that holds still. What it lists and what its foot acts on are the page's.
 *
 * Its behaviour is Base UI's Dialog (`@base-ui/react/dialog`, the plan's decision 15): modal, so focus is held inside
 * it and the page behind is inert to a pointer and a screen reader and does not scroll; Escape and a press on the
 * wash ask the page to close it (`onClose`), as its Close does; as it closes, focus goes back to what held it when
 * it opened. It opens with the sheet itself focused, so a screen reader names it (kit.css draws no ring there), or
 * the element `initialFocus` names. It stays drawn while it leaves: Base UI's closing state is the kit's
 * `data-leaving`, which plays the sheet's and its wash's leaving (kit.css), and Base UI lets it go when that ends.
 * The kit writes none of this by hand.
 *
 * Open is the page's (`open`), and so is closed: `onClose` asks, and the page answers by setting `open`, so a page
 * that asks first about what was typed, or holds a save that is out, keeps it open. It is drawn in a portal on the
 * document's body, where no pane's blur or transform can hold it.
 *
 * It draws what the gallery's Sheet family draws (tooling/scripts/e2e-harness/kit-gallery.mjs), which
 * e2e/kit/kit-behaves.spec.ts holds to it in a browser, entry for entry. `className` is for the page's layout (a
 * wider sheet), and comes last; the ref reaches the sheet.
 */
import { Dialog } from "@base-ui/react/dialog";
import type { ReactElement, ReactNode, Ref, RefObject } from "react";
import { useCallback, useRef } from "react";
import { cx } from "../variants";

/** A sheet: whether it is open, what asks it to close, its head, what it holds, and its foot. */
export type SheetProps = {
  open: boolean;
  /** Asked by Escape, a press on the wash and the head's Close; the page closes the sheet by setting `open`. */
  onClose: () => void;
  /** Its title, which names it to a screen reader. */
  title: ReactNode;
  /** The line under the title, which describes it to a screen reader. */
  sub?: ReactNode;
  /** The head's Close: its name, and its glyph (the Icon's `x`, at 13px, as the record sheet draws it). */
  close: { label: string; glyph: ReactElement };
  /** A strip of tools over the rows: a search, an Add. */
  tools?: ReactNode;
  /** The foot, which holds still under the rows: the page's acts. */
  foot?: ReactNode;
  /** The rows. */
  children?: ReactNode;
  /** What is focused as it opens, where it is not the sheet itself: a field the page wants typed in at once. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
  ref?: Ref<HTMLElement>;
};

/** Base UI's closing state, in the kit's word for it: a sheet on its way out (kit.css, `[data-leaving]`). */
const leaving = (state: { transitionStatus: "starting" | "ending" | "idle" | undefined }) =>
  state.transitionStatus === "ending" ? "true" : undefined;

/** A modal sheet, over the page's wash, drawn on the document's body. */
export function Sheet({
  open,
  onClose,
  title,
  sub,
  close,
  tools,
  foot,
  children,
  initialFocus,
  className,
  ref,
}: SheetProps) {
  const self = useRef<HTMLElement | null>(null);
  // The sheet as it is on the page, for its own focus, and for the page's ref.
  const place = useCallback(
    (el: HTMLElement | null) => {
      self.current = el;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className="sheet-backdrop"
          render={(props, state) => <div {...props} data-leaving={leaving(state)} />}
        />
        <Dialog.Popup
          ref={place}
          initialFocus={initialFocus ?? self}
          className={cx("sheet", className)}
          render={(props, state) => <section {...props} data-leaving={leaving(state)} />}
        >
          <div className="sheet-handle" aria-hidden="true" />
          <header className="rec-sheet-head">
            <div className="rec-sheet-heading">
              <Dialog.Title className="rec-sheet-title">{title}</Dialog.Title>
              {sub ? <Dialog.Description className="rec-sheet-sub">{sub}</Dialog.Description> : null}
            </div>
            <Dialog.Close className="rec-sheet-close" aria-label={close.label}>
              {close.glyph}
            </Dialog.Close>
          </header>
          {tools ? <div className="rec-sheet-tools">{tools}</div> : null}
          <div className="rec-sheet-body">{children}</div>
          {foot ? <footer className="rec-sheet-foot">{foot}</footer> : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
