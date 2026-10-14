/**
 * Broadcasts: the To send list of a reach-out its owner sends (00428), in its run's block (approval.tsx). Each email
 * handed to them, oldest first: its business (its lead's door), its subject, its address and when it was handed over;
 * its doors into a mail client (Gmail, Outlook, their mail app), Copy, and its words to read; then the owner's word on
 * it, Sent or Skip. Opening or copying one asks "Did it go?" at its Sent, as the lead's own draft asks; a link too long
 * to carry the words copies them as it opens. Each word is said at the list's head, or at its row when refused, and the
 * run is read again behind it. Every sentence is contracts' (toSendWordsOf, toSendSaidWords); never a fetch here.
 */
import { useState } from "react";
import type { BroadcastDetailDto, ReachOutSaidOutcome, ToSendRowVM } from "@chanlytics/contracts";
import { canDo, gateTitle, navigate } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { CopiedWords, useCopied } from "../../kit/copy-button/copy-button";
import { LinkButton } from "../../kit/link-button/link-button";
import { reachOuts } from "./surface";

type ToSend = NonNullable<ReturnType<typeof reachOuts.toSend>>;

interface RowProps {
  row: ToSendRowVM;
  L: ToSend["labels"];
  may: boolean;
  busy: boolean;
  said: string | null;
  onSay: (row: ToSendRowVM, outcome: ReachOutSaidOutcome) => void;
}

/** One email handed over: who, what, its doors into a mail client, and the owner's word on it. */
function RoToSendRow({ row, L, may, busy, said, onSay }: RowProps) {
  const [copied, copy] = useCopied();
  const [asked, setAsked] = useState(false);
  const [reading, setReading] = useState(false);
  // A link too long to carry the words leaves them to the clipboard, copied as it opens.
  const opening = () => {
    if (!row.links.bodyInLinks) copy(row.text);
    setAsked(true);
  };
  const door = { size: "sm" as const, onClick: opening };
  return (
    <div className="ro-send" data-testid="ro-to-send-row">
      <div className="ro-send-line">
        {row.to ? (
          <LinkButton className="bc-person-name" onClick={() => navigate(row.to ?? "")} data-testid="ro-to-send-lead">
            {row.name}
          </LinkButton>
        ) : (
          <span className="bc-person-name">{row.name}</span>
        )}
        <span className="bc-person-words" data-testid="ro-to-send-what">
          {row.subject} · {row.address} · {row.since}
        </span>
      </div>
      <div className="ro-send-acts">
        <Button
          {...door}
          href={row.links.gmail}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="ro-to-send-gmail"
        >
          {L.gmail}
        </Button>
        <Button
          {...door}
          href={row.links.outlook}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="ro-to-send-outlook"
        >
          {L.outlook}
        </Button>
        <Button {...door} href={row.links.mailto} data-testid="ro-to-send-app">
          {L.app}
        </Button>
        <Button
          size="sm"
          variant="quiet"
          onClick={() => {
            copy(row.text);
            setAsked(true);
          }}
          data-testid="ro-to-send-copy"
        >
          {copied ? <CopiedWords said={L.copied} /> : L.copy}
        </Button>
        <LinkButton aria-expanded={reading} onClick={() => setReading((v) => !v)} data-testid="ro-to-send-read">
          {reading ? L.hide : L.read}
        </LinkButton>
      </div>
      {!row.links.bodyInLinks && (
        <span className="pb-note" data-testid="ro-to-send-paste">
          {L.pasteNote}
        </span>
      )}
      {reading && (
        <div className="em-frame" data-testid="ro-to-send-words">
          <p className="em-frame-body">{row.text}</p>
        </div>
      )}
      {may && (
        <div className="ro-send-acts">
          {asked && <span className="bc-person-words">{L.asked}</span>}
          <Button
            size="sm"
            variant={asked ? "primary" : "secondary"}
            disabled={busy}
            onClick={() => onSay(row, "sent")}
            data-testid="ro-to-send-sent"
          >
            {busy ? L.saying : L.sent}
          </Button>
          <LinkButton disabled={busy} onClick={() => onSay(row, "not_sent")} data-testid="ro-to-send-skip">
            {L.skip}
          </LinkButton>
        </div>
      )}
      {said && (
        <span className="pb-warn" role="alert" data-testid="ro-to-send-said">
          {said}
        </span>
      )}
    </div>
  );
}

/** The run's To send list; nothing where no email waits to be sent from the owner's inbox. */
export function RoToSend({ d, onSaid }: { d: BroadcastDetailDto; onSaid: () => void }) {
  const vm = reachOuts.toSend(d);
  const [busy, setBusy] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ id: string; text: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // The last word said stays said once the list empties behind it: the run is read again, and nothing is left to send.
  if (!vm)
    return done ? (
      <p className="pb-note" role="status" data-testid="ro-to-send-done">
        {done}
      </p>
    ) : null;
  const may = canDo("approve");
  const say = async (row: ToSendRowVM, outcome: ReachOutSaidOutcome) => {
    if (busy) return;
    setBusy(row.id);
    setRefused(null);
    const r = await reachOuts.say(row.id, outcome);
    setBusy(null);
    if (r && r.ok) {
      setDone(reachOuts.saidWords(row.name, outcome, r.data));
      onSaid();
    } else setRefused({ id: row.id, text: (r && r.message) || "" });
  };
  return (
    <section className="bc-touched bc-sheet-people bc-approval-people" data-testid="ro-to-send">
      <div className="bc-touched-head">
        <span className="bc-card-title">{vm.head}</span>
      </div>
      <p className="pb-note">{may ? vm.note : gateTitle("approve", vm.labels.gated)}</p>
      {done && (
        <p className="pb-note" role="status" data-testid="ro-to-send-done">
          {done}
        </p>
      )}
      {vm.rows.map((row) => (
        <RoToSendRow
          key={row.id}
          row={row}
          L={vm.labels}
          may={may}
          busy={busy === row.id}
          said={refused && refused.id === row.id ? refused.text : null}
          onSay={(x, o) => void say(x, o)}
        />
      ))}
    </section>
  );
}
