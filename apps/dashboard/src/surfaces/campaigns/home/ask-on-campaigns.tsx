/**
 * Ask on Campaigns' home (the moment spec §4.9, A2): what Ask is told the ledger shows. The rows go with the page's
 * context (legacy-bridge/ask/context.ts), whose ids the server reads again under the person's RLS; their names stay in
 * the tab, where the words that name a row are matched.
 */
import { useEffect } from "react";
import { ASK_CONTEXT_MAX_ROWS, isLedgerCampaign } from "@chanlytics/contracts";
import type { LifecycleRow } from "@chanlytics/contracts";
import { askOnScreenKey, setAskOnScreen, type AskOnScreen } from "../../legacy-verbs";
import type { LedgerView } from "./ledger/use-ledger-view";

/**
 * What the ledger shows, as far as Ask is told it: useLedgerView's own fields (its status, group, search and rows, each
 * as the screen is under it), never a second reading of the view.
 */
type LedgerForAsk = Pick<LedgerView, "status" | "group" | "query" | "visibleRows">;

/**
 * A row Ask's context can name: a campaign as the ledger counts one (contracts isLedgerCampaign: not the receptionist,
 * the call's text or an offer not made), but a reach-out, which no campaigns read holds and which opens its own sheet.
 */
const forAsk = (r: LifecycleRow): boolean => isLedgerCampaign(r) && r.kind !== "chain";

/**
 * What Ask is told is on screen: the ledger's rows in its order, forty at most, a one-off send's run spelled `run:<id>`,
 * each with the name it shows, and the view they are under, `playbooks:<status>[:in:<group>][:search]`, on which Ask's
 * kept context is keyed. Module-private: the hook below is what the page calls.
 */
function ledgerOnScreen(view: LedgerForAsk): AskOnScreen {
  const rows = view.visibleRows.filter(forAsk).slice(0, ASK_CONTEXT_MAX_ROWS);
  return {
    key: "campaigns",
    ids: rows.map((r) => (r.kind === "sent_once" ? `run:${r.id}` : r.id)),
    labels: rows.map((r) => r.name),
    view: ["playbooks", view.status, view.group ? `in:${view.group}` : "", view.query.trim() ? "search" : ""]
      .filter(Boolean)
      .join(":"),
  };
}

/** Says it as the ledger draws, and takes it back when the ledger goes, as People's list does (people/page/cells-hook.ts). */
export function useLedgerOnScreen(view: LedgerForAsk): void {
  useEffect(() => {
    setAskOnScreen(ledgerOnScreen(view));
    return () => {
      if (askOnScreenKey() === "campaigns") setAskOnScreen(null);
    };
  });
}
