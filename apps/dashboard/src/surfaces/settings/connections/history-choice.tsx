/**
 * What a mailbox brings in (decision 0086), drawn wherever one is connected: one quiet line of what connecting brings, and
 * Change, which opens the two ways in place, each with its sentence (the kit's Segmented); a reconnect never asks. What a
 * connected mailbox's row offers is history-act.tsx's.
 */
import { useState } from "react";
import { MAILBOX_HISTORY_WORDS, type MailboxHistory } from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { keepTabDraft, tabDraft } from "../../kit/record/work";
import { Segmented } from "../../kit/segmented/segmented";

const WAYS = ["six_months", "from_now"] as const satisfies readonly MailboxHistory[];

/** Where the tab keeps the choice made before Google's consent, so a sheet after it opens on the same one. */
const KEPT_HISTORY = "mailbox_history";

/** The choice made before the last connect in this tab, else six months, the way in that brings the most. */
export function historyKept(): MailboxHistory {
  const kept = tabDraft(KEPT_HISTORY);
  return WAYS.find((w) => w === kept) ?? "six_months";
}

/** Kept as a connect leaves for Google: a personal address's sheet, after it, asks again with the same choice. */
export const keepHistory = (history: MailboxHistory): void => keepTabDraft(KEPT_HISTORY, history);

interface HistoryChoiceProps {
  value: MailboxHistory;
  onChange: (history: MailboxHistory) => void;
  /** The quiet line's class, the page's own: the card it sits in says how its small print looks. */
  lineClass?: string;
}

/** Under Connect: the line, until Change opens the two ways; once open they stay, as the owner chose. */
export function HistoryChoice({ value, onChange, lineClass }: HistoryChoiceProps) {
  const W = MAILBOX_HISTORY_WORDS;
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
