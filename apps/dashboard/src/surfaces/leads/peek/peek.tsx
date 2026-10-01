/**
 * The peek: one lead, beside the table (408px) or full height on a phone, and everything the owner does to it without
 * leaving the rows -- the stage, Not a fit, Keep and Exclude, Put back, a call from their own phone, a draft for their
 * own inbox, and, from its ⋯, Erase (the owner's alone). Moved from legacy/pages/leads-peek.jsx (decision 0015). Hookless, as
 * the page's rules ask: every piece of state here is LeadsReal's (peekId, peekMode, armed, draft), handed down, so the
 * page's one keyboard listener backs out of it on Esc.
 *
 * Nothing in this file writes a sentence of its own. The words are contracts' (LEAD_WORDS) and the view model is
 * contracts' (toLeadPeekVM), so a word the owner reads is spelled once; the toasts are the route's own sentences, because
 * the door decides what happened (a stage click never converts: PRD 9.6).
 */
import { touchSwipe, type SwipeHandlers } from "../../legacy-verbs";
import { LeadDraftPane } from "./draft-pane";
import { LeadPeekHead } from "./head";
import { LeadPeekInfo } from "./info";
import type { PeekActs, PeekState } from "./types";

/**
 * One lead, beside the rows. role="dialog" with .pl-peek, which PL_OVERLAY names apart (the page's own overlay), so
 * J and K keep walking the rows behind it and Esc reaches the page's one listener.
 */
export const LeadPeek = (props: PeekState & PeekActs) => {
  const { vm, mode = "info", armed = null, draft = null, busy = false, deck = null, phone = false, ...on } = props;
  if (!vm) return null;
  // Under a thumb (D5, data-bits touchSwipe): a swipe across is the deck's two buttons, and on a phone, where the
  // peek is the whole screen, a pull down from the top of what it shows is its Close -- one small X in a corner was
  // the only way out. 80px of travel along the axis it went further on, so a scroll is never a move; a pull down
  // through a scrolled body is a scroll. `phone` is the scope's reading (LeadsScope), not a second one here.
  const swipe: SwipeHandlers =
    deck || phone
      ? touchSwipe({
          onLeft: deck ? deck.onNext : null,
          onRight: deck ? deck.onPrev : null,
          onDown: phone ? on.onClose : null,
        })
      : {};
  return (
    <aside className="pk pl-peek" role="dialog" aria-label={vm.name} data-testid="lead-peek" {...swipe}>
      <LeadPeekHead vm={vm} onClose={on.onClose} onExpand={on.onExpand} deck={deck} />
      {mode === "draft" ? (
        <LeadDraftPane vm={vm} draft={draft} busy={busy} on={on} />
      ) : (
        <LeadPeekInfo vm={vm} mode={mode} armed={armed} busy={busy} on={on} deck={deck} />
      )}
    </aside>
  );
};
