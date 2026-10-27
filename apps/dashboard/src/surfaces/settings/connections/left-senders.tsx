/**
 * Chanlytics — Connections › Your mailbox › Left in your mailbox (00483): who the connected mailbox left mail from, and
 * why, newest first; and the senders the workspace said are not people. Read on a press: the list is written as mail
 * arrives, and nothing on the page's first load waits for it. "It's a person" brings a sender in (their mail from now on,
 * and their last six months with it); Undo takes back what was said of a sender. Its words are contracts'
 * (email/mailbox-senders.ts); who may change it is the block's own gate (the settings permission).
 */
import { useState, type ReactNode } from "react";
import {
  MAILBOX_LEFT_WHY_WORDS,
  MAILBOX_SENDERS_WORDS as W,
  type MailboxSenderVerdict,
  type MailboxSendersDto,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { LinkButton } from "../../kit/link-button/link-button";
import { refusalToast, type LegacyFlash } from "../../legacy-verbs";

/** How many senders the list draws before it says how many more there are. */
const SENDERS_DRAWN = 20;

/** One row of the block's grammar: what it says, and its presses. */
function senderRow(key: string, says: string, sub: string, acts: ReactNode, testid: string) {
  return (
    <div key={key} className="set-dom set-dom-note" data-testid={testid}>
      <span />
      <span className="t">
        <span>{says}</span>
        <span className="dim">{sub}</span>
      </span>
      <span />
      <span />
      <span className="set-int-actions">{acts}</span>
    </div>
  );
}

export function LeftSenders({ owner, flash }: { owner: boolean; flash: (f: LegacyFlash) => void }) {
  const [list, setList] = useState<MailboxSendersDto | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    const r = await api()("GET mailbox-senders", {});
    if (r.ok) setList(r.data as MailboxSendersDto);
    else flash(refusalToast(r, W.failed));
  };
  const sort = async (sender: string, verdict: MailboxSenderVerdict | null) => {
    setBusy(sender);
    const r = await api()("POST mailbox-senders", { body: { sender, verdict } });
    setBusy(null);
    if (!r.ok) return flash(refusalToast(r, W.failed));
    flash({ msg: <>{verdict === "person" ? W.broughtIn(sender) : W.undone(sender)}</> });
    await load();
  };
  if (!list)
    return senderRow(
      "left",
      W.title,
      W.lead,
      <LinkButton onClick={() => void load()} data-testid="mailbox-left-show">
        {W.show}
      </LinkButton>,
      "mailbox-left",
    );
  const said = list.said.filter((s) => s.verdict === "automated");
  return (
    <>
      {senderRow("left", W.title, list.left.length ? W.lead : W.empty, null, "mailbox-left")}
      {list.left.slice(0, SENDERS_DRAWN).map((l) =>
        senderRow(
          l.address,
          l.name ? `${l.name} · ${l.address}` : l.address,
          `${MAILBOX_LEFT_WHY_WORDS[l.why]} · ${W.emails(l.count)}`,
          owner ? (
            <LinkButton
              onClick={() => void sort(l.address, "person")}
              disabled={busy !== null}
              data-testid="mailbox-left-bring-in"
            >
              {W.bringIn}
            </LinkButton>
          ) : null,
          "mailbox-left-row",
        ),
      )}
      {list.left.length > SENDERS_DRAWN
        ? senderRow("more", W.more(list.left.length - SENDERS_DRAWN), "", null, "mailbox-left-more")
        : null}
      {said.length ? senderRow("said", W.saidTitle, "", null, "mailbox-said") : null}
      {said.map((s) =>
        senderRow(
          `said-${s.sender}`,
          s.sender,
          MAILBOX_LEFT_WHY_WORDS.said,
          owner ? (
            <LinkButton
              onClick={() => void sort(s.sender, null)}
              disabled={busy !== null}
              data-testid="mailbox-said-undo"
            >
              {W.undo}
            </LinkButton>
          ) : null,
          "mailbox-said-row",
        ),
      )}
    </>
  );
}
