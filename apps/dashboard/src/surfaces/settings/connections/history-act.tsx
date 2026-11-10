/**
 * What a connected mailbox's row offers of its history (decision 0086; contracts mailboxHistoryLine): the one act that fits,
 * Stop, Resume, Try again or Bring in the last 6 months, an owner's alone. A refusal is said in a toast; Setup's re-read
 * repaints the row (refresh-map.ts).
 */
import { useState } from "react";
import { MAILBOX_HISTORY_WORDS, type MailboxHistoryAct } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { refusalToast, type FrameFlash } from "../../frame-verbs";
import { connectedMailboxes } from "./connected-mailboxes";

interface HistoryActProps {
  id: string;
  address: string;
  act: MailboxHistoryAct;
  flash: (f: FrameFlash) => void;
}

/** A mailbox's history act on its row: pressed once, said in a toast where the door refused it. */
export function HistoryAct({ id, address, act, flash }: HistoryActProps) {
  const W = MAILBOX_HISTORY_WORDS;
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = await connectedMailboxes.history(id, act === "again" ? "resume" : act);
    setBusy(false);
    if (!r.ok) flash(refusalToast(r, W.refused[act]));
  };
  return (
    <LinkButton onClick={() => void go()} disabled={busy} data-testid={`mailbox-history-${act}-${address}`}>
      {W[act]}
    </LinkButton>
  );
}
