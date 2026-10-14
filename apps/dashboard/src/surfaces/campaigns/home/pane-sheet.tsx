/**
 * A pane of Campaigns' (parts/split.tsx CmPane: a playbook's detail, a reach-out's, the playbook composer, the send screen)
 * drawn in the kit's sheet from the side, over the home (canvas L2, L3). The pane is the page's own and draws itself as it
 * does beside a list: its head with its name, state and acts, its body, its foot. The sheet is the surface it stands on, and
 * holds what a modal holds (focus, Escape, the page behind still); its own head carries the home's name for what is open,
 * and its Close is the pane's own.
 *
 * The pane's Close asks first where a composer has words (useUnsavedWork), so the sheet's Close, its wash and its Escape
 * press that one control rather than close past the question (`askFirst`); a pane with nothing to ask is closed by the
 * page (`onClose`). The pane's own Close and Back are not drawn here (components.css, "Campaigns home"): the sheet's is the
 * one at the corner.
 *
 * One head (Ruben, 11 Oct 2026: the drawers too cluttered): the sheet's title is a kicker, a quiet line saying where it
 * was opened from ("Appointment tomorrow", "Turn on", "The call's text") with the Close at its end, and the pane's head
 * under it carries the name, its state and its acts. A composer's foot holds its Cancel, so on a phone the corner's Close
 * steps out of sight there (`footCloses`), as every phone sheet's does over its Cancel.
 *
 * On a phone it is as tall as what the pane holds, up to the sheet's cap, and past it the pane's body scrolls under its
 * head and foot (campaigns.css): a pinned height stood a three-line message on a screen of blank (Ruben, 14 Oct 2026).
 */
import { useRef } from "react";
import type { ReactNode } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import { Icon } from "../../kit/icon/icon";
import { Sheet } from "../../kit/sheet/sheet";
import { cx } from "../../kit/variants";

/** The control CmPane draws to close itself, on a desk and on a phone: the one that asks first where a composer has words. */
const PANE_CLOSE = ".cm-pane-close, .cm-pane-back";

interface PaneSheetProps {
  open: boolean;
  /** What the home calls what is open: the moment's place on the rail, or "New message". */
  title: ReactNode;
  /** A strip over the pane: the composer's choice between its two kinds. */
  tools?: ReactNode;
  /** Close it, as the page does: the address goes back to the home. */
  onClose: () => void;
  /** Press the pane's own Close instead, which asks before a composer's words are thrown away. */
  askFirst?: boolean;
  /** A composer is wider than a playbook's detail. */
  wide?: boolean;
  /** The pane's foot holds the act that closes it (a composer's Cancel): the corner's Close steps aside on a phone. */
  footCloses?: boolean;
  testid?: string;
  children: ReactNode;
}

export function PaneSheet({
  open,
  title,
  tools,
  onClose,
  askFirst = false,
  wide = false,
  footCloses = false,
  testid,
  children,
}: PaneSheetProps) {
  const body = useRef<HTMLDivElement | null>(null);
  const close = () => {
    const press = askFirst && body.current ? body.current.querySelector<HTMLElement>(PANE_CLOSE) : null;
    if (press) press.click();
    else onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title={title}
      close={{ label: LIFECYCLE_WORDS.close, glyph: <Icon name="x" size={13} /> }}
      tools={tools}
      kicker
      footCloses={footCloses}
      className={cx("cmh-host", wide && "cmh-host-wide")}
    >
      <div ref={body} className="cmh-host-body" data-testid={testid}>
        {children}
      </div>
    </Sheet>
  );
}
