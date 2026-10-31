/**
 * What a mailbox brings in (decision 0086), drawn where it is chosen and where it is changed. Under Connect: one quiet
 * line of what connecting brings, and Change, which opens the two ways in place, each with its sentence (the kit's
 * Segmented); a reconnect never asks. On a mailbox's row: the one act its history offers (contracts
 * mailboxHistoryLine), Stop, Resume, Try again or Bring in the last 6 months, an owner's alone. A refusal is said in a
 * toast; Setup's re-read repaints the row (refresh-map.ts).
 */
import { useState } from "react";
import { MAILBOX_HISTORY_WORDS, type MailboxHistory, type MailboxHistoryAct } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { Segmented } from "../../kit/segmented/segmented";
import { refusalToast, type LegacyFlash } from "../../legacy-verbs";
import { connectedMailboxes } from "./connected-mailboxes";

const W = MAILBOX_HISTORY_WORDS;
const WAYS = ["six_months", "from_now"] as const satisfies readonly MailboxHistory[];

interface HistoryChoiceProps {
  value: MailboxHistory;
  onChange: (history: MailboxHistory) => void;
  /** The quiet line's class, the page's own: the card it sits in says how its small print looks. */
  lineClass?: string;
}

/** Under Connect: the line, until Change opens the two ways; once open they stay, as the owner chose. */
export function HistoryChoice({ value, onChange, lineClass }: HistoryChoiceProps) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <p className={lineClass} data-testid="mailbox-history-line">
        {`${W.line[value]} `}
        <LinkButton onClick={() => setOpen(true)} data-testid="mailbox-history-change">
          {W.change}
        </LinkButton>
      </p>
    );
  return (
    <div data-testid="mailbox-history-ways">
      <Segmented
        label={W.choose}
        value={value}
        onValueChange={onChange}
        options={WAYS.map((v) => ({
          value: v,
          label: W.ways[v].label,
          hint: W.ways[v].says,
          testid: `mailbox-history-${v}`,
        }))}
      />
    </div>
  );
}

interface HistoryActProps {
  id: string;
  address: string;
  act: MailboxHistoryAct;
  flash: (f: LegacyFlash) => void;
}

/** A mailbox's history act on its row: pressed once, said in a toast where the door refused it. */
export function HistoryAct({ id, address, act, flash }: HistoryActProps) {
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
