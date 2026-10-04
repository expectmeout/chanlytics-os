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
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { Panel } from "../../kit/panel/panel";
import { useRecSheetEscape } from "../../kit/record/focus";
import { cx } from "../../kit/variants";

/** The kit's one breakpoint: under it the open thing is the screen, over it a pane beside the list. */
const CM_PHONE_QUERY = "(max-width: 900px)";

const cmPhoneQuery = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(CM_PHONE_QUERY) : null;

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

interface CmSplitProps {
  /** The tab's list: its head (the filters, the search), its rows and its foot. */
  list: ReactNode;
  /** What is open, as a CmPane, or nothing. */
  open: ReactNode;
  /** The page's own class and test id, on the root the frame's .main-scroll holds. */
  className?: string;
  testid?: string;
}

/**
 * The page: the list's pane and, while something is open, its pane. The root is the page's (the direct child of the
 * frame's .main-scroll), so it is what says the screen is taken over.
 */
export function CmSplit({ list, open, className, testid }: CmSplitProps) {
  const opened = open !== null && open !== undefined && open !== false;
  return (
    <div
      className={cx("cm-split", className)}
      data-open={opened ? "true" : undefined}
      data-takeover={opened ? "true" : undefined}
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
}

/**
 * The open thing's pane: its head (back on a phone, its mark, name, state and line, its acts, and Close on a desk), its
 * body, which scrolls, and its foot, which stays. Escape closes it, from anywhere on the page, as the sheet it replaced
 * did (the record kit's one rule, useRecSheetEscape): a list or a menu open in it takes its own Escape first and says so,
 * and a composer's close asks first about what was written.
 */
export function CmPane(p: CmPaneProps) {
  const { title, badge, sub, mark, tools, onClose, closeLabel = "Close", foot, children, testid, className } = p;
  const { id, closeTestid = "cm-pane-close" } = p;
  const phone = useCmPhone();
  useRecSheetEscape(true, onClose);
  return (
    <Panel as="section" size="flush" className={cx("cm-pane", className)} id={id} data-testid={testid}>
      <header className="cm-pane-head capsule">
        {phone ? (
          <Button
            iconOnly
            variant="quiet"
            size="sm"
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
