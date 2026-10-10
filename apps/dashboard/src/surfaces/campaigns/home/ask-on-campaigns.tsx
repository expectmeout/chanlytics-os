/**
 * Ask on Campaigns' home (the moment spec §4.9): what Ask is told the ledger shows (A2), and Ask's doors on the page (A1).
 * The rows go with the page's context (legacy-bridge/ask/context.ts), whose ids the server reads again under the
 * person's RLS; their names stay in the tab, where the words that name a row are matched. The rail and the phone's list
 * take the first day's door as a slot and never import Ask.
 */
import { useEffect } from "react";
import { ASK_CONTEXT_MAX_ROWS, LIFECYCLE_WORDS, isLedgerCampaign } from "@chanlytics/contracts";
import type { LifecycleRow } from "@chanlytics/contracts";
import { afterMove, askAbout, askOnScreenKey, gate, setAskOnScreen, type AskOnScreen } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import type { MenuItem } from "../../kit/menu/menu";
import type { LedgerView } from "./ledger/use-ledger-view";

/**
 * What the ledger shows, as far as Ask is told it: useLedgerView's own fields (its status, group, search and rows, each
 * as the screen is under it), never a second reading of the view.
 */
type LedgerForAsk = Pick<LedgerView, "status" | "group" | "query" | "visibleRows">;

/**
 * What Ask is told is on screen: the ledger's rows in its order that are campaigns as it counts them (contracts
 * isLedgerCampaign: not the receptionist, the call's text or an offer not made), forty at most, a one-off send's run
 * spelled `run:<id>` and a reach-out, which no campaigns read holds, `reach_out:<id>`, each with the name it shows, and
 * the view they are under, `playbooks:<status>[:in:<group>][:search]`, on which Ask's kept context is keyed.
 * Module-private: the hook below is what the page calls.
 */
function ledgerOnScreen(view: LedgerForAsk): AskOnScreen {
  const rows = view.visibleRows.filter(isLedgerCampaign).slice(0, ASK_CONTEXT_MAX_ROWS);
  const spelled = (r: LifecycleRow) =>
    r.kind === "sent_once" ? `run:${r.id}` : r.kind === "chain" ? `reach_out:${r.id}` : r.id;
  return {
    key: "campaigns",
    ids: rows.map(spelled),
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

/**
 * The head's door to Ask (A1): a quiet button wearing the three, between the Library and New message, from 721px up
 * (campaigns.css `.cmh-ask`); under it the shell's ✦ is the door. Ask opens on the page, its scope the address's.
 */
export function AskDoor() {
  return (
    <Button variant="quiet" size="sm" className="cmh-ask" onClick={() => askAbout({})} data-testid="cmh-ask">
      <Icon name="three" size={13} /> {LIFECYCLE_WORDS.ask.door}
    </Button>
  );
}

/**
 * The first day's sentence (D21): beside the hinted Turn on, "Set up my campaigns", which Ask turns into a few cards, each
 * its own press, nothing sending at Approve. It sends the sentence as it opens Ask, so no field takes the focus and no
 * keyboard rises on a touch screen. A proposal is the role's to approve, so it is gated as Turn on is.
 */
export function SetUpAsk() {
  return (
    <Button
      variant="quiet"
      size="sm"
      className="cmh-first-ask"
      onClick={() => askAbout({ prompt: LIFECYCLE_WORDS.ask.setUp })}
      data-testid="cmh-setup-ask"
      {...gate("approve", "set up campaigns")}
    >
      <Icon name="three" size={13} /> {LIFECYCLE_WORDS.ask.setUp}
    </Button>
  );
}

/**
 * The drawer's More (A1): "Ask about this campaign". The drawer closes first, the way it closes (`close`: Back where the
 * page opened it, the home's address where a link did), since on a phone it is a modal sheet Ask would open under; then
 * Ask opens over the home on that campaign, by its id and its name, so its chip names it. Ask waits for the address to
 * have left the drawer (afterMove), so a Back lands before a phone's Back entry of Ask's own is made, and is never
 * taken for Ask's.
 */
export const askAboutItem = (p: { id: string; name: string }, close: () => void): MenuItem => ({
  label: LIFECYCLE_WORDS.ask.about,
  glyph: <Icon name="three" size={13} />,
  onSelect: () => afterMove(close, () => askAbout({ about: { kind: "playbook", id: p.id, label: p.name } })),
});
