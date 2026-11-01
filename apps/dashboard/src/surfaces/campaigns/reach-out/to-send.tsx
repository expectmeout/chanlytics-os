/**
 * Every To send's rows (00429): a reach-out's run in Sent (approval.tsx), To send in Needs you (waits/to-send-part.tsx) and a
 * sequence's People (sequences/needs.tsx) lay out the same row. Each email handed to its owner, oldest first: its business
 * (its lead's door), its subject, its address and when it was handed over; then on one line their mail app, the door a
 * phone and a desk both send from, with Gmail, Outlook, Copy and its words to read under its More, and the owner's word on
 * it at the line's end, Sent or Skip (the parity review of 15 Oct 2026: seven presses on a line a phone wrapped three
 * times). Opening or copying one asks "Did it go?" at its Sent, as the lead's own draft asks; a link too long to carry the
 * words copies them as it opens. A step after the first answers an email the business may have answered in the owner's
 * own inbox, which nothing here reads: its Sent asks first whether they did, and They wrote back… stands under its More
 * (the peek's, read as a reply is). Each word is the `sequence_send_said` verb, said at the list's head, or at its row
 * when refused, and the run is read again behind it. To send in Needs you draws a run's list `bare`, a part of it under
 * the run's name, and says each word at its head instead. Every sentence is contracts' (toSendRowOf,
 * toSendSaidWords); never a fetch here.
 */
import { useState } from "react";
import {
  REACH_OUT_SHEET_WORDS,
  REACH_OUT_TO_SEND_LABELS,
  TO_SEND_ALL_WORDS,
  TO_SEND_ROUTE,
  toSendEveryOf,
  type BroadcastDetailDto,
  type OwnerSaidIntent,
  type ReachOutSaidOutcome,
  type ToSendRowVM,
} from "@chanlytics/contracts";
import { commitVerb } from "@/legacy-bridge/verbs/commit";
import { canDo, gateTitle, navigate, onAPhone } from "../../legacy-verbs";
import { surfaceValue } from "../../surface-values";
import { Button } from "../../kit/button/button";
import { CopiedWords, useCopied } from "../../kit/copy-button/copy-button";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { Menu, type MenuItem } from "../../kit/menu/menu";
import { leadOverDoor } from "../../leads/sheet/lead-over";
import { RoSaidAsk, type SaidMore } from "./said-ask";
import { reachOuts } from "./surface";

type Labels = typeof REACH_OUT_TO_SEND_LABELS;

interface RowProps {
  row: ToSendRowVM;
  L: Labels;
  may: boolean;
  busy: boolean;
  said: string | null;
  onSay: (row: ToSendRowVM, outcome: ReachOutSaidOutcome) => void;
  /** They wrote back…, on a step after the first: what the business said, read as a reply is. */
  onTell: (row: ToSendRowVM, intent: OwnerSaidIntent, more: SaidMore) => void;
  /** In a dock under the email: its acts alone, their mail app the primary until it was opened. */
  dock?: boolean;
}

/** The owner's word on an email: Sent (the act, once its mail app was opened) and Skip, a quiet word beside it. */
function SentOrSkip(p: {
  row: ToSendRowVM;
  L: Labels;
  busy: boolean;
  asked: boolean;
  onSay: (row: ToSendRowVM, outcome: ReachOutSaidOutcome) => void;
  onCheck: () => void;
}) {
  const { row, L, busy, asked, onSay, onCheck } = p;
  return (
    <>
      <Button
        variant={asked ? "primary" : "secondary"}
        className={asked ? "ro-ans ro-ans-go" : "ro-ans"}
        disabled={busy}
        onClick={() => (row.followUp ? onCheck() : onSay(row, "sent"))}
        data-testid="ro-to-send-sent"
      >
        {busy ? L.saying : L.sent}
      </Button>
      <Button
        variant="quiet"
        className="ro-ans ro-ans-word"
        disabled={busy}
        onClick={() => onSay(row, "not_sent")}
        data-testid="ro-to-send-skip"
      >
        {L.skip}
      </Button>
    </>
  );
}

/**
 * Its mail app and the other ways to open it, one pill: the mail app at once, the caret for Gmail, Outlook, Copy and the
 * words themselves (Ruben, 20 Oct 2026: a door of their own, not three dots beside it).
 */
function MailAppPill(p: {
  row: ToSendRowVM;
  L: RowProps["L"];
  items: MenuItem[];
  /** It is the next thing to press: the primary. */
  go: boolean;
  onOpen: () => void;
}) {
  const { row, L, items, go, onOpen } = p;
  const variant = go ? "primary" : undefined;
  return (
    <span className="ro-send-open">
      <Button
        className="ro-ans ro-send-app"
        variant={variant}
        href={row.links.mailto}
        onClick={onOpen}
        data-testid="ro-to-send-app"
      >
        <Icon name="mail" size={14} /> {L.app}
      </Button>
      <Menu
        label={L.more(row.name)}
        trigger={
          <Button
            className="ro-ans ro-send-caret"
            variant={variant}
            iconOnly
            aria-label={L.more(row.name)}
            data-testid="ro-to-send-more"
          >
            <Icon name="chevron-down" size={14} />
          </Button>
        }
        // A phone draws the menu as a sheet, headed by whose email it is (as a sequence's menu is).
        groups={[{ header: onAPhone() ? row.name : undefined, items }]}
      />
    </span>
  );
}

/** One email handed over: who, what, its mail app with the rest under More, and the owner's word on it at the end. */
function RoToSendRow({ row, L, may, busy, said, onSay, onTell, dock = false }: RowProps) {
  const [copied, copy] = useCopied();
  const [asked, setAsked] = useState(false);
  const [reading, setReading] = useState(false);
  // A step after the first: its Sent asks first whether the business answered the email before; and what they said.
  const [checking, setChecking] = useState(false);
  const [telling, setTelling] = useState(false);
  const SW = reachOuts.words.REACH_OUT_SAID_WORDS;
  // A link too long to carry the words leaves them to the clipboard, copied as it opens.
  const opening = () => {
    if (!row.links.bodyInLinks) copy(row.text);
    setAsked(true);
  };
  // Gmail's and Outlook's compose pages, in a tab of their own.
  const onWeb = (url: string) => () => {
    opening();
    window.open(url, "_blank", "noopener,noreferrer");
  };
  const more: MenuItem[] = [
    { label: L.gmail, glyph: <Icon name="external" size={13} />, onSelect: onWeb(row.links.gmail) },
    { label: L.outlook, glyph: <Icon name="external" size={13} />, onSelect: onWeb(row.links.outlook) },
    {
      label: L.copy,
      glyph: <Icon name="copy" size={13} />,
      onSelect: () => {
        copy(row.text);
        setAsked(true);
      },
    },
    { label: reading ? L.hide : L.read, glyph: <Icon name="mail" size={13} />, onSelect: () => setReading((v) => !v) },
    ...(may && row.followUp
      ? [{ label: SW.door, glyph: <Icon name="chat" size={13} />, onSelect: () => setTelling(true) }]
      : []),
  ];
  return (
    <div className="ro-send" data-dock={dock || undefined} data-testid="ro-to-send-row">
      {dock ? null : (
        <>
          <div className="ro-send-who">
            <LinkButton
              size="inherit"
              className="ro-name"
              title={REACH_OUT_SHEET_WORDS.openLead}
              {...leadOverDoor(row.leadId)}
              data-testid="ro-to-send-lead"
            >
              {row.name}
            </LinkButton>
            <small>{row.since}</small>
          </div>
          <p className="ro-send-subj" data-testid="ro-to-send-what">
            {row.subject} · {row.address}
          </p>
        </>
      )}
      <div className="ro-send-acts">
        <MailAppPill row={row} L={L} items={more} go={dock && !asked} onOpen={opening} />
        {copied ? <CopiedWords said={L.copied} /> : null}
        <span className="ro-send-sp" />
        {/* Its word at the line's end; once the mail app was opened, asked on a line of its own (the canvas's board 6). */}
        {may && !checking && !telling && !asked ? (
          <SentOrSkip row={row} L={L} busy={busy} asked={false} onSay={onSay} onCheck={() => setChecking(true)} />
        ) : null}
      </div>
      {may && !checking && !telling && asked ? (
        <div className="ro-send-acts ro-send-ask">
          <span className="ro-send-asked">{L.asked}</span>
          <SentOrSkip row={row} L={L} busy={busy} asked onSay={onSay} onCheck={() => setChecking(true)} />
        </div>
      ) : null}
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
      {may && checking && !telling && (
        <div className="ro-send-acts" role="group" aria-label={L.noReply} data-testid="ro-to-send-no-reply">
          <span className="bc-person-words">{L.noReply}</span>
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => onSay(row, "sent")}
            data-testid="ro-to-send-sent-yes"
          >
            {busy ? L.saying : L.noReplyYes}
          </Button>
          <LinkButton disabled={busy} onClick={() => setTelling(true)} data-testid="ro-to-send-wrote">
            {SW.door}
          </LinkButton>
          <LinkButton disabled={busy} onClick={() => setChecking(false)} data-testid="ro-to-send-back">
            {SW.back}
          </LinkButton>
        </div>
      )}
      {may && telling && (
        <RoSaidAsk
          business={row.name}
          busy={busy}
          onSay={(i, more) => onTell(row, i, more)}
          onBack={() => {
            setTelling(false);
            setChecking(false);
          }}
          testid="ro-to-send-said"
        />
      )}
      {said && (
        <span className="pb-warn" role="alert" data-testid="ro-to-send-said">
          {said}
        </span>
      )}
    </div>
  );
}

interface RowsProps {
  rows: readonly ToSendRowVM[];
  /** The run each email waits in: what the word's Open goes to. */
  runOf: (row: ToSendRowVM) => string | null;
  /** What was said, once it is: the page reads again behind it. */
  onSaid: (said: string) => void;
  /** In a dock under the email: each row's acts alone. */
  dock?: boolean;
}

/**
 * The rows of a To send, each with the owner's word on it through its verb (`sequence_send_said`) and what the business
 * wrote back as the peek says it; a refusal said at its row. A run's list (RoToSend) and a sequence's People draw them.
 */
export function RoToSendRows({ rows, runOf, onSaid, dock = false }: RowsProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ id: string; text: string } | null>(null);
  const may = canDo("approve");
  const say = async (row: ToSendRowVM, outcome: ReachOutSaidOutcome) => {
    if (busy) return;
    setBusy(row.id);
    setRefused(null);
    // Its receipt says what it did (contracts toSendSaidWords).
    const r = await commitVerb("sequence_send_said", { send_id: row.id, outcome, name: row.name, run_id: runOf(row) });
    setBusy(null);
    if (r.ok) onSaid(r.receipt);
    else setRefused({ id: row.id, text: r.message || "" });
  };
  // What the business wrote back to the email before, said as the peek says it: its drafts go with its waiting sends.
  const tell = async (row: ToSendRowVM, intent: OwnerSaidIntent, more: SaidMore) => {
    if (busy) return;
    setBusy(row.id);
    setRefused(null);
    const r = await reachOuts.sayReply(row.leadId, { intent, ...more });
    setBusy(null);
    if (r && r.ok)
      onSaid(
        r.data.already
          ? reachOuts.words.REACH_OUT_SAID_WORDS.already(row.name)
          : reachOuts.saidReplyWords(row.name, intent, r.data.resume_at, more.refer_to ?? null),
      );
    else setRefused({ id: row.id, text: (r && r.message) || "" });
  };
  return (
    <>
      {rows.map((row) => (
        <RoToSendRow
          key={row.id}
          row={row}
          L={REACH_OUT_TO_SEND_LABELS}
          may={may}
          busy={busy === row.id}
          said={refused && refused.id === row.id ? refused.text : null}
          onSay={(x, o) => void say(x, o)}
          onTell={(x, i, more) => void tell(x, i, more)}
          dock={dock}
        />
      ))}
    </>
  );
}

/**
 * The run's To send list; nothing where no email waits to be sent from the owner's inbox. `bare` draws its rows alone,
 * for a pane that says the head, the note and each word itself: what was said is handed to `onSaid`, which reads again.
 */
export function RoToSend({
  d,
  onSaid,
  bare = false,
}: {
  d: BroadcastDetailDto;
  onSaid: (said: string) => void;
  bare?: boolean;
}) {
  const vm = reachOuts.toSend(d);
  const [own, setDone] = useState<string | null>(null);
  const done = bare ? null : own;
  // The last word said stays said once the list empties behind it: the run is read again, and nothing is left to send.
  if (!vm)
    return done ? (
      <p className="pb-note" role="status" data-testid="ro-to-send-done">
        {done}
      </p>
    ) : null;
  const may = canDo("approve");
  const rows = (
    <RoToSendRows
      rows={vm.rows}
      runOf={() => d.broadcast.id}
      onSaid={(said) => {
        setDone(said);
        onSaid(said);
      }}
    />
  );
  if (bare) return rows;
  // Other runs hand emails over too: the door to all of them, the one list (To send, in Needs you).
  const every = toSendEveryOf(surfaceValue("broadcasts")?.rows ?? []);
  // The canvas's board 6: a caption with the count at its right, then one pane, its how on top and a row for each email.
  return (
    <section className="ro-sends" aria-label={vm.head} data-testid="ro-to-send">
      <p className="ro-cap">
        <span>{vm.title}</span>
        <span>{vm.count}</span>
      </p>
      <div className="ro-pane">
        <p className="ro-send-note">
          {may ? vm.note : gateTitle("approve", vm.labels.gated)}
          {every && " "}
          {every && (
            <LinkButton onClick={() => navigate(TO_SEND_ROUTE)} data-testid="ro-to-send-every">
              {TO_SEND_ALL_WORDS.everyRun(every.count, every.from)}
            </LinkButton>
          )}
        </p>
        {done && (
          <p className="ro-send-note" role="status" data-testid="ro-to-send-done">
            {done}
          </p>
        )}
        {rows}
      </div>
    </section>
  );
}
