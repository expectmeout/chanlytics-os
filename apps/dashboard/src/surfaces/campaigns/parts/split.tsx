/**
 * Campaigns' one layout, the Inbox's (Claude Video/docs/2026-10-02-campaigns-on-the-kit.md §3.1): a tab's list in a
 * pane and, while something of it is open -- a playbook, a run, a template, or a composer writing one -- that thing in
 * a second pane beside it. On a desk the list narrows to the Inbox's column (--rail-list) and its rows fold their
 * columns under the name; on a phone the open thing takes the screen over (data-takeover on the page's root, mobile.css),
 * its head the capsule a thread's is, its foot docked at the screen's edge.
 *
 * It replaces five ways the tabs opened a thing: a sheet over the page (a playbook's composer, a reach-out's), a page
 * swapped for the list (a broadcast's composer, a run), a card over the list (a template's composer), a row that opened
 * under itself (a playbook, a reach-out, a template, an email) and an inline sheet of its own (a run's approval).
 */
import type { HTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { showHeld } from "../../kit/motion/held-list";
import { Panel } from "../../kit/panel/panel";
import { useRecSheetEscape } from "../../kit/record/focus";
import { cx } from "../../kit/variants";
import type { ScopeView } from "../../people/scope-view";

/** The kit's one breakpoint: under it the open thing is the screen, over it a pane beside the list. */
const CM_PHONE_QUERY = "(max-width: 900px)";

const cmPhoneQuery = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(CM_PHONE_QUERY) : null;

/** The split each pane a thumb is carrying was grabbed in (cmGoing). */
const goingHosts = new WeakMap<Element, Element>();

/**
 * While a thumb carries an open pane back to its list, or the pane is pushed in over it, the list is drawn under it
 * (campaigns.css, data-going on the split), so what shows behind the pane is what it goes back to, as an open thread's list
 * does in the Inbox: where the list was held as the pane opened (a sequence's record on a phone, sequences-page.tsx), at
 * the rows it was left on, with the frame's chrome over it as it stood (kit/motion/held-list.ts showHeld).
 */
export const cmGoing = (el: Element, on: boolean) => {
  // The pane is let go of after it has left (kit/motion/swipe.ts swipeLeave closes it first), when it has no parent: the split it
  // was grabbed in is kept from the grab, so the mark always comes off.
  const host = el.parentElement ?? goingHosts.get(el) ?? null;
  if (!host) return;
  if (on) goingHosts.set(el, host);
  else goingHosts.delete(el);
  host.toggleAttribute("data-going", on);
  showHeld(on);
};

/** Whether the window is a phone's, kept current as it changes size. */
export function useCmPhone(): boolean {
  const [phone, setPhone] = useState(() => !!cmPhoneQuery()?.matches);
  useEffect(() => {
    const q = cmPhoneQuery();
    if (!q || typeof q.addEventListener !== "function") return undefined;
    const on = (e: MediaQueryListEvent) => setPhone(e.matches);
    q.addEventListener("change", on);
    return () => q.removeEventListener("change", on);
  }, []);
  return phone;
}

/**
 * A page of Campaigns as one of its kept views (Sequences, Messages: home/route.tsx): the deck's seat and the side it comes
 * in from (people/scope-view.ts), and whether it is the view shown. A view kept hidden never says it takes the screen over:
 * the frame reads `data-takeover` anywhere under it (mobile.css: the strip and the phone's tab bar step down), and a record
 * left open in Sequences hidden behind Messages took both away from Messages.
 */
export interface CmView extends ScopeView {
  shown?: boolean;
}

interface CmSplitProps {
  /** The tab's list: its head (the filters, the search), its rows and its foot. */
  list: ReactNode;
  /** What is open, as a CmPane, or nothing. */
  open: ReactNode;
  /** The page's own class and test id, on the root the frame's .main-scroll holds. */
  className?: string;
  testid?: string;
  /**
   * Where the page is a view of Campaigns kept beside another (Sequences, Messages: home/route.tsx), the deck's seat and the
   * side it comes in from (people/scope-view.ts), on the root, which is the view the deck moves.
   */
  view?: CmView;
}

/**
 * The page: the list's pane and, while something is open, its pane. The root is the page's (the direct child of the
 * frame's .main-scroll), so it is what says the screen is taken over.
 */
export function CmSplit({ list, open, className, testid, view }: CmSplitProps) {
  const opened = open !== null && open !== undefined && open !== false;
  return (
    <div
      ref={view?.ref}
      data-slide={view?.slide}
      className={cx("cm-split", className)}
      data-open={opened ? "true" : undefined}
      data-takeover={opened && view?.shown !== false ? "true" : undefined}
      data-testid={testid}
    >
      <Panel as="section" size="flush" className="cm-list">
        {list}
      </Panel>
      {opened ? open : null}
    </div>
  );
}

interface CmPaneProps {
  /** What is open, by its name: words, or the composer's name field. */
  title: ReactNode;
  /** Its state beside the name (a StatePill), where it has one. */
  badge?: ReactNode;
  /** One line under the name. */
  sub?: ReactNode;
  /** Its mark before the name (a Face), where it has one. */
  mark?: ReactNode;
  /** The head's acts at its right: the Menu of what can be done to it. */
  tools?: ReactNode;
  onClose: () => void;
  /** Close's name: "Close", or "Cancel" for a composer, whose close asks first when something was written. */
  closeLabel?: string;
  /** The foot: its line, then its acts, the one filled last. */
  foot?: ReactNode;
  children: ReactNode;
  testid?: string;
  /** Close's test id on a desk, where a page's tests already name it. */
  closeTestid?: string;
  /** The pane's id, where a link lands on it (`bc-run-<id>`). */
  id?: string;
  className?: string;
  /**
   * A phone's swipe (kit/motion/swipe.ts touchSwipe's handlers, its onGrab cmGoing): on the pane's root, so the head, the body and
   * the foot go back to the list together under the thumb.
   */
  swipe?: HTMLAttributes<HTMLElement>;
  /**
   * Opened over the list it was opened from (kit/motion/held-list.ts), where the pane was not there yet to be pushed in
   * over it (still being read): it comes in over the list as it arrives (`data-over`, sequences.css).
   */
  over?: boolean;
}

/**
 * The open thing's pane: its head (back on a phone, its mark, name, state and line, its acts, and Close on a desk), its
 * body, which scrolls, and its foot, which stays. Escape closes it, from anywhere on the page, as the sheet it replaced
 * did (the record kit's one rule, useRecSheetEscape): a list or a menu open in it takes its own Escape first and says so,
 * and a composer's close asks first about what was written.
 */
export function CmPane(p: CmPaneProps) {
  const { title, badge, sub, mark, tools, onClose, closeLabel = "Close", foot, children, testid, className } = p;
  const { id, closeTestid = "cm-pane-close", swipe, over } = p;
  const phone = useCmPhone();
  useRecSheetEscape(true, onClose);
  return (
    <Panel
      {...swipe}
      as="section"
      size="flush"
      className={cx("cm-pane", className)}
      id={id}
      data-testid={testid}
      data-over={over || undefined}
    >
      <header className="cm-pane-head capsule">
        {/* Back is a thumb's circle, as More beside the name is: the head's only two glyphs. */}
        {phone ? (
          <Button
            iconOnly
            variant="quiet"
            size="touch"
            className="cm-pane-back"
            onClick={onClose}
            aria-label={closeLabel === "Close" ? "Back to the list" : closeLabel}
            data-testid="cm-pane-back"
          >
            <span aria-hidden="true">&larr;</span>
          </Button>
        ) : null}
        {mark}
        <div className="cm-pane-titles">
          <h2 className="cm-pane-title">
            <span className="cm-pane-name">{title}</span>
            {badge}
          </h2>
          {sub ? <p className="cm-pane-sub">{sub}</p> : null}
        </div>
        {tools ? <div className="cm-pane-acts">{tools}</div> : null}
        {phone ? null : (
          <Button
            iconOnly
            variant="quiet"
            size="sm"
            className="cm-pane-close"
            onClick={onClose}
            aria-label={closeLabel}
            data-testid={closeTestid}
          >
            <Icon name="x" size={14} />
          </Button>
        )}
      </header>
      <div className="cm-pane-body">{children}</div>
      {foot ? <footer className="cm-pane-foot capsule">{foot}</footer> : null}
    </Panel>
  );
}
