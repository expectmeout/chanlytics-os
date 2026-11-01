/**
 * What the conversation says, entry by entry (moved from pages/inbox-thread.jsx, decision 0015): a message as a bubble,
 * a thing that happened, a seeded agent's reasoning, and the disclosures a bubble carries (quoted text, why it was said).
 *
 * A bubble is a function per part, called by the entry and not drawn as a component of its own, so the tree is the tree
 * it was.
 */
import { useState, type ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { TlMedia } from "../../kit/media/tl-media";
import type { AgentEntry, MsgEntry, Thread, TimelineEntry as TlEntry } from "../types";
import { THREAD_PANE_WORDS, type ReplyWhyVM } from "@chanlytics/contracts";
import { ThreadCall, tlCallFor } from "./call";
import { Button } from "../../kit/button/button";
import { gate } from "../shell";

// =============== TIMELINE ENTRY ===============
// A link in a message is a link. The body is plain text — the customer's words or the
// receptionist's — so it is split on the address and rendered as nodes, never as HTML. The
// address is clipped by CSS (.tl-msg-link), so the whole of it stays selectable and copyable:
// a booking URL took five lines of a bubble and could not be tapped.
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>()[\]{}"']+[^\s<>()[\]{}"'.,;:!?]/gi;
const Linked = ({ text }: { text?: string | null }) => {
  const s = text == null ? "" : String(text);
  if (!s) return null;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(URL_IN_TEXT)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(
      <a
        key={m.index}
        className="tl-msg-link"
        href={m[0]}
        target="_blank"
        rel="noopener noreferrer nofollow"
        title={m[0]}
      >
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return <>{out}</>;
};

// What an email quoted back at us is kept, not shown: "Got it, thanks!" arrived as six lines of
// "On Thu, Sep 17, 2026 at 10:44 PM … wrote: >". It waits behind three dots, as a mail client keeps it. The split is
// the viewmodel's (emailPartsOf), so Conversations draws the same messages the same way.
const TlMsgQuote = ({ quoted }: { quoted: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="tl-msg-quote-toggle"
        aria-expanded={open}
        aria-label={open ? "Hide quoted text" : "Show quoted text"}
        title={open ? "Hide quoted text" : "Show quoted text"}
        onClick={() => setOpen((v) => !v)}
        data-testid="tl-msg-quote-toggle"
      >
        ···
      </button>
      {open && (
        <div className="tl-msg-quote" data-testid="tl-msg-quote">
          <Linked text={quoted} />
        </div>
      )}
    </>
  );
};

// Their signature: one quiet line under their words, the whole of it on a tap. Drawn as words it read as the email
// ("needs you test Ruben Segura Founder, RJ Capital [image: RJ Capital] …").
const TlMsgSig = ({ signature }: { signature: { line: string; full: string } }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`tl-msg-sig${open ? " open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="tl-msg-sig"
      >
        <span className="tl-msg-sig-line">{signature.line}</span>
        <Icon name="chevron-down" size={11} className="tl-msg-sig-turn" />
      </button>
      {open && (
        <div className="tl-msg-sig-full" data-testid="tl-msg-sig-full">
          <Linked text={signature.full} />
        </div>
      )}
    </>
  );
};

/**
 * What an email carried that is not its words, folded under them as its signature is: a list's foot and the chain it
 * quoted, each a line of its own that opens on a press (the thread canvas, 1 Nov 2026: "548 Market Street … stop
 * receiving these emails" read as the sender's words). `testid` names the opened words, and `<testid>-toggle` the press.
 */
const TlFold = ({ label, text, testid }: { label: string; text: string; testid: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={`tl-msg-sig${open ? " open" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid={`${testid}-toggle`}
      >
        <span className="tl-msg-sig-line">{label}</span>
        <Icon name="chevron-down" size={11} className="tl-msg-sig-turn" />
      </button>
      {open && (
        <div className="tl-msg-sig-full" data-testid={testid}>
          <Linked text={text} />
        </div>
      )}
    </>
  );
};

const TlMsgBody = ({
  text,
  quoted,
  signature,
}: {
  text?: string | null;
  quoted?: string;
  signature?: { line: string; full: string };
}) => (
  <>
    {/* Trimmed: the bubble keeps its lines now, so a message that ended on a line break would end on a blank one. */}
    <Linked text={text == null ? text : String(text).trim()} />
    {quoted && <TlMsgQuote quoted={quoted} />}
    {signature && <TlMsgSig signature={signature} />}
  </>
);

// Why it said that: the intent and how sure it was. It rode the meta line as two more spans,
// which is what wrapped that line into columns on a phone — and its reason sat in a title
// attribute no touch screen can open. A tap now, with the facts it used. The button belongs to
// the meta line; the panel is that line's sibling, because the line does not wrap.
const TlWhyButton = ({ why, open, onToggle }: { why: ReplyWhyVM; open: boolean; onToggle: () => void }) => (
  <button
    type="button"
    className="tl-msg-why"
    aria-expanded={open}
    aria-label={`Why the receptionist said this — ${why.summary}`}
    onClick={onToggle}
    data-testid="tl-msg-why"
  >
    <span className="tl-msg-why-full">· {why.summary}</span>
    <span className="tl-msg-why-short">Why</span>
  </button>
);

const TlWhyPanel = ({ why }: { why: ReplyWhyVM }) => {
  const facts = why.facts && why.facts.length ? why.facts : null;
  return (
    <div className="tl-msg-why-panel" data-testid="tl-msg-why-panel">
      <div className="tl-msg-why-sum">{why.summary}</div>
      {why.reason && <div className="tl-msg-why-reason">{why.reason}</div>}
      {facts && <div className="tl-msg-why-facts">Used: {facts.join(" · ")}</div>}
    </div>
  );
};

/** The glyph a wire is drawn with. */
export const channelIconOf = (c: string) =>
  c === "phone" ? "phone" : c === "instagram" ? "instagram" : c === "mail" || c === "email" ? "mail" : "chat";

/**
 * How a bubble draws itself in a real thread: whether it continues a run of one side's bubbles (drawn close), and, on a
 * seeded thread, the time over a run and who sent it under it as they always were.
 */
interface TlLines {
  meta: boolean;
  by: boolean;
  run?: boolean;
}

/** Our words that did not send: sent again as they were, or put in the reply box. None where words cannot go. */
interface TlAgain {
  send: (text: string) => unknown;
  edit: (text: string) => void;
}

interface TimelineEntryProps {
  entry: TlEntry;
  thread: Thread;
  channelLabels: Record<string, string>;
  /** The thread's subject, given to its first email, which it heads (contracts' emailSubjectsOf). */
  topic?: string | null;
  lines?: TlLines | null;
  again?: TlAgain | null;
  focus?: boolean;
  newest?: boolean;
  arrived?: boolean;
}

/** A seeded agent's reasoning, thinking or deciding. */
const isAgentEntry = (entry: TlEntry): entry is AgentEntry =>
  entry.type === "agent-thinking" || entry.type === "agent-decision";

export const TimelineEntry = ({
  entry,
  thread,
  channelLabels,
  topic = null,
  lines = null,
  again = null,
  focus = false,
  newest = false,
  arrived = false,
}: TimelineEntryProps) => {
  const channelIcon = channelIconOf;

  if (isAgentEntry(entry)) {
    const isDecision = entry.type === "agent-decision";
    return (
      <div className={`tl-agent ${isDecision ? "decision" : "thinking"}`}>
        <span className="tl-agent-glyph">
          <span className="agent-avatar" style={{ width: 18, height: 18, fontSize: 9 }}>
            {thread.agent.glyph}
          </span>
        </span>
        <div className="tl-agent-body">
          <div className="tl-agent-head">
            <span className="tl-agent-name">{entry.agent}</span>
            <span className="tl-agent-verb">{isDecision ? "decided" : "thinking"}</span>
            <span className="tl-agent-time tabular">{entry.at}</span>
          </div>
          <div className="tl-agent-text">{entry.body}</div>
        </div>
      </div>
    );
  }

  // Where a real thread was held for a person: a quiet mark between the words, its spark and its time, the reason a clause
  // (contracts' "Held for you — wrote by email"). The dock under the conversation says what is owed; the mark said it too,
  // with a dot and the reason's details quoted, printed under the dock's glass on a phone (the thread canvas, 1 Nov 2026).
  if (entry.type === "event" && thread.real && entry.kind === "flag") {
    return (
      <div className="tl-event tl-held" data-testid="tl-held">
        <Icon name="sparkle" size={11} className="tl-held-spark" />
        <span className="tl-event-text">{entry.body}</span>
        <span className="tl-event-time tabular">{entry.at}</span>
      </div>
    );
  }

  if (entry.type === "event") {
    return (
      <div className="tl-event">
        <span className="tl-event-spine" />
        <span className="tl-event-text">{entry.body}</span>
        <span className="tl-event-time tabular">{entry.at}</span>
      </div>
    );
  }

  return (
    <TlMsgEntry
      entry={entry}
      thread={thread}
      channelLabels={channelLabels}
      topic={topic}
      lines={lines}
      again={again}
      channelIcon={channelIcon}
      focus={focus}
      newest={newest}
      arrived={arrived}
    />
  );
};

interface TlMsgEntryProps {
  entry: MsgEntry;
  thread: Thread;
  channelLabels: Record<string, string>;
  topic?: string | null;
  lines: TlLines | null;
  again: TlAgain | null;
  channelIcon: (c: string) => string;
  focus?: boolean;
  newest?: boolean;
  arrived?: boolean;
}

/** Who sent a message ours, in the words the thread says it: a person, a playbook, a broadcast, or you. */
function sentBy(entry: MsgEntry): string {
  return (
    entry.byWords ||
    (entry.via
      ? entry.via.kind === "playbook"
        ? `the ${entry.via.name} campaign`
        : `a one-off send (${entry.via.name})`
      : "you")
  );
}

/** What became of one of your team's words, and who sent them. */
function byYouLine(entry: MsgEntry) {
  return (
    <>
      {/* The time is over the bubble already (.tl-msg-meta); it was printed twice
                    within forty pixels. What gives way when the line is short is the author —
                    never what became of the message. */}
      <span className="tl-msg-author">by {sentBy(entry)}</span>
      {/* One vocabulary, computed in the viewmodel. This ternary was
                    the only place these words existed, so the Conversations
                    pane — which shows the same messages — said nothing at all
                    and rendered a canceled reply as a delivered one. */}
      {entry.statusLabel ? <span> · {entry.statusLabel}</span> : null}
    </>
  );
}

/** What became of the receptionist's words, and why it said them: its name, a tap for the reasoning, then the state. */
function byReceptionistLine(p: {
  entry: MsgEntry;
  thread: Thread;
  held: boolean;
  whyOpen: boolean;
  toggleWhy: () => void;
}) {
  const { entry, thread, held, whyOpen, toggleWhy } = p;
  return (
    <>
      {/* Per-bubble when the viewmodel supplies it: a phone call
                    summary is the Phone Receptionist's work, not the WhatsApp
                    one's. Seeded threads carry no per-entry agent and keep the
                    thread-level identity they have always used. */}
      <span className="tl-msg-author">by {entry.agentName || thread.agent.name}</span>
      {/* Why it said that, when the row remembers: a tap, not a hover. */}
      {entry.why && <TlWhyButton why={entry.why} open={whyOpen} onToggle={toggleWhy} />}
      {/* What became of it, as the team's bubbles say: "Didn't send", "Canceled before sending", "Read". */}
      {!held && entry.statusLabel ? <span> · {entry.statusLabel}</span> : null}
      {held && <span className="tl-held-tag">Not sent yet</span>}
    </>
  );
}

/** The bubble's meta line: the wire's icon and name where it is said, and the time. */
function metaLine(p: TlMsgEntryProps, named: boolean) {
  const { entry, lines, channelLabels, channelIcon } = p;
  if (lines && !lines.meta) return false;
  return (
    <div className="tl-msg-meta">
      {named && <Icon name={channelIcon(entry.channel)} size={10} />}
      {named && <span>{channelLabels[entry.channel]}</span>}
      <span className="tl-msg-time tabular">{entry.at}</span>
    </div>
  );
}

/** What became of words of ours, as a glyph in the bubble's corner: sent, delivered, read, failed, waiting to go. */
function statusGlyph(entry: MsgEntry) {
  const said = entry.statusLabel || undefined;
  switch (entry.status) {
    case "read":
    case "delivered":
      return (
        <span className={`tl-ticks${entry.status === "read" ? " read" : ""}`} role="img" aria-label={said} title={said}>
          <Icon name="check" size={11} />
          <Icon name="check" size={11} />
        </span>
      );
    case "sent":
      return (
        <span className="tl-ticks" role="img" aria-label="Sent" title="Sent">
          <Icon name="check" size={11} />
        </span>
      );
    case "queued":
      return (
        <span role="img" aria-label={said} title={said}>
          <Icon name="clock" size={11} />
        </span>
      );
    case "failed":
      return (
        <span className="tl-stamp-failed" role="img" aria-label={said} title={said}>
          <Icon name="alert" size={11} />
        </span>
      );
    case "canceled":
      return <span className="tl-stamp-words">{said}</span>;
    default:
      return null;
  }
}

/**
 * A real bubble's corner: who sent words of ours where it was not the receptionist (a teammate, a campaign), the wire
 * where the thread has used several, the time alone, and what became of them. The receptionist's words wear its spark,
 * and the spark and the time are one press to why it said them, where the row remembers (the phone canvas, D1): the line
 * under every reply said "by WhatsApp Receptionist · Why · Delivered".
 */
function bubbleCorner(
  p: TlMsgEntryProps,
  named: boolean,
  why: { open: boolean; toggle: () => void },
  signedAbove = false,
) {
  const { entry, thread, channelLabels, channelIcon } = p;
  // The wire said only where a bubble came another way than the thread's own: every bubble of a WhatsApp and email
  // thread wore the chat's glyph.
  const wire = named && entry.channel !== thread.primaryChannel;
  const ours = entry.from !== "client";
  const receptionist = ours && !entry.byYou && !entry.via;
  // Words of ours a person or a run sent are signed (A9, A23): "Your team", or the campaign's name.
  const signed = entry.via ? entry.via.name : entry.byWords || "your team";
  const author = !ours || receptionist || signedAbove ? null : signed.charAt(0).toUpperCase() + signed.slice(1);
  const time = entry.time || entry.at;
  const inner = (
    <>
      {receptionist && <Icon name="sparkle" size={11} className="tl-stamp-spark" />}
      {author && <span className="tl-stamp-words">{author}</span>}
      {wire && (
        <span role="img" aria-label={channelLabels[entry.channel]} title={channelLabels[entry.channel]}>
          <Icon name={channelIcon(entry.channel)} size={10} />
        </span>
      )}
      <span className="tabular">{time}</span>
      {ours && !entry.pending ? statusGlyph(entry) : null}
    </>
  );
  if (receptionist && entry.why)
    return (
      <button
        type="button"
        className="tl-stamp"
        aria-expanded={why.open}
        aria-label={`Sent by ${entry.agentName || thread.agent.name} at ${time}${entry.statusLabel ? `, ${entry.statusLabel}` : ""}. Why it said this: ${entry.why.summary}`}
        onClick={why.toggle}
        data-testid="tl-msg-why"
      >
        {inner}
      </button>
    );
  return (
    <span
      className="tl-stamp"
      title={
        receptionist ? `Sent by ${entry.agentName || thread.agent.name}` : author ? `Sent by ${signed}` : undefined
      }
    >
      {inner}
    </span>
  );
}

/** Our words that never left: put them in the reply box, or send them again as they were. */
function againActs(again: TlAgain, text: string) {
  return (
    <div className="tl-again" data-testid="tl-again">
      <Button variant="quiet" size="sm" onClick={() => again.edit(text)} data-testid="tl-again-edit">
        <Icon name="edit" size={12} /> {THREAD_PANE_WORDS.edit}
      </Button>
      <Button size="sm" onClick={() => void again.send(text)} data-testid="tl-again-send" {...gate("approve")}>
        <Icon name="refresh" size={12} /> {THREAD_PANE_WORDS.sendAgain}
      </Button>
    </div>
  );
}

/** A bubble's classes: whose words, held, never delivered, just arrived, or one more of a run. */
function bubbleClass(entry: MsgEntry, lines: TlLines | null, arrived: boolean): string {
  const isClient = entry.from === "client";
  const held = !!entry.pending;
  const undelivered = !isClient && !held && entry.reachedCustomer === false;
  return [
    "tl-msg",
    isClient ? "client" : "agent",
    held ? "held" : "",
    undelivered ? "undelivered" : "",
    arrived ? "tl-arrived" : "",
    lines && lines.run ? "tl-run" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * What a bubble says under its words: on a seeded thread who sent ours and what became of it, as it always did; on a
 * real one only a held draft's tag, and, under our words that did not send, the way to send them again or put them in
 * the box (againActs). A real bubble's time and what became of it are its corner's (bubbleCorner).
 */
function bubbleFoot(p: TlMsgEntryProps, why: { open: boolean; toggle: () => void }) {
  const { entry, thread, lines, again } = p;
  const isClient = entry.from === "client";
  const held = !!entry.pending;
  const undelivered = !isClient && !held && entry.reachedCustomer === false;
  if (!thread.real) {
    // What became of words that did not reach them is said on their own bubble, whatever follows.
    return !isClient && (!lines || lines.by || held || undelivered) ? (
      <div className="tl-msg-by">
        {entry.byYou
          ? byYouLine(entry)
          : byReceptionistLine({ entry, thread, held, whyOpen: why.open, toggleWhy: why.toggle })}
      </div>
    ) : null;
  }
  if (held)
    return (
      <div className="tl-msg-by">
        <span className="tl-held-tag">Not sent yet</span>
      </div>
    );
  return undelivered && entry.status === "failed" && again && entry.body ? againActs(again, entry.body) : null;
}

/**
 * An email long enough to fold to its first six lines (inbox.css .tl-email): more than about ten lines of a phone, so a
 * fold never hides one or two.
 */
const LONG_EMAIL_CHARS = 420;
const LONG_EMAIL_LINES = 8;
const longEmail = (words: string): boolean =>
  words.length > LONG_EMAIL_CHARS || words.split("\n").length > LONG_EMAIL_LINES;

/** Who an email in the conversation is from, as its head says it: them, a campaign, a teammate, or the receptionist. */
function emailFrom(entry: MsgEntry, thread: Thread): string {
  if (entry.from === "client") return thread.who;
  if (entry.via) return entry.via.name;
  if (entry.byYou) {
    const by = entry.byWords || "your team";
    return by.charAt(0).toUpperCase() + by.slice(1);
  }
  return entry.agentName || thread.agent.name;
}

/** What an email carried under its words, each folded: its signature, a list's foot, the chain it quoted. */
function emailFolds(entry: MsgEntry) {
  const W = THREAD_PANE_WORDS;
  if (!entry.signature && !entry.footer && !entry.quoted) return null;
  return (
    <div className="tl-email-folds" data-testid="tl-email-folds">
      {entry.signature && <TlMsgSig signature={entry.signature} />}
      {entry.footer && <TlFold label={W.emailFooter} text={entry.footer} testid="tl-msg-footer" />}
      {entry.quoted && <TlFold label={W.emailEarlier} text={entry.quoted} testid="tl-msg-quote" />}
    </div>
  );
}

/**
 * An email in a real thread, drawn as one (the thread canvas, 1 Nov 2026): the width of the conversation, who it is from
 * and when at its head, the thread's subject over the first and a changed one over the email that changed it, its words
 * folded to their first lines where they run long, and what is not its words folded under them. Drawn as a chat bubble it
 * was a column three-quarters wide whose sender's card, street address and unsubscribe link read as the message.
 */
function emailEntry(
  p: TlMsgEntryProps,
  why: { open: boolean; toggle: () => void },
  whole: [boolean, (v: boolean) => void],
) {
  const { entry, thread, lines, arrived = false, topic } = p;
  const W = THREAD_PANE_WORDS;
  const named = (thread.channels || []).filter((c) => c !== "phone").length > 1;
  const subject = entry.subject || topic || null;
  const words = entry.body == null ? "" : String(entry.body).trim();
  const long = longEmail(words);
  const [shown, show] = whole;
  return (
    <div className={`${bubbleClass(entry, lines, arrived)} tl-email`} data-mid={entry.messageId}>
      <div className="tl-msg-bubble">
        <div className="tl-email-head">
          <span className="tl-email-from" data-testid="tl-email-from">
            {emailFrom(entry, thread)}
          </span>
          {bubbleCorner(p, named, why, true)}
        </div>
        {subject && (
          <div className="tl-msg-subject" data-testid="tl-msg-subject">
            {subject}
          </div>
        )}
        <div className="tl-msg-body" data-folded={long && !shown ? "" : undefined}>
          <Linked text={words} />
        </div>
        {long && (
          <Button
            variant="quiet"
            size="text"
            className="tl-email-whole"
            aria-expanded={shown}
            onClick={() => show(!shown)}
            data-testid="tl-email-whole"
          >
            {shown ? W.emailLess : W.emailWhole}
            <Icon name={shown ? "chevron-up" : "chevron-down"} size={11} />
          </Button>
        )}
        {emailFolds(entry)}
        {entry.media && <TlMedia media={entry.media} />}
        {entry.leftOut && (
          <div className="tl-msg-note" data-testid="tl-msg-left-out">
            <Icon name="info" size={11} /> {entry.leftOut}
          </div>
        )}
        {entry.failedWhy && (
          <div className="tl-msg-note" data-testid="tl-msg-failed-why">
            <Icon name="alert" size={11} /> {entry.failedWhy}
          </div>
        )}
        {bubbleFoot(p, why)}
        {entry.why && why.open && <TlWhyPanel why={entry.why} />}
      </div>
    </div>
  );
}

// The message branch, with the hooks its two disclosures need. It is its own component so those
// hooks are not behind the event and agent-thinking returns above.
const TlMsgEntry = (props: TlMsgEntryProps) => {
  const { entry, thread, lines, focus = false, newest = false, arrived = false } = props;
  const [whyOpen, setWhyOpen] = useState(false);
  // An email folded to its first lines, opened whole (emailEntry).
  const [whole, setWhole] = useState(false);
  // A call is part of the conversation, where it happened: its note was a dashed bubble of words nobody said. Its lines
  // are shown when it is the newest thing said, or the call Conversations opened the thread at.
  if (thread.real && entry.channel === "phone")
    return (
      <ThreadCall
        call={tlCallFor(entry.messageId)}
        note={entry.body}
        at={entry.at}
        mid={entry.messageId}
        focus={focus}
        open={focus || newest}
      />
    );
  if (thread.real && entry.channel === "email")
    return emailEntry(props, { open: whyOpen, toggle: () => setWhyOpen((v) => !v) }, [whole, setWhole]);
  // A held draft is a message the customer has NOT seen, and words that never left are dashed (bubbleClass): drawn as an
  // ordinary agent bubble, a held draft reads as already sent, and the receptionist's failed reply did (I1).
  // A real thread whose words travelled one wire says the time alone: the wire is in the header, and it was over every
  // bubble. A call is drawn as a call, so it is not a second wire for the words.
  const named = !thread.real || (thread.channels || []).filter((c) => c !== "phone").length > 1;
  // A real thread's bubble says its time and what became of it in its corner (bubbleCorner); a seeded one keeps its lines.
  const real = !!thread.real;
  const why = { open: whyOpen, toggle: () => setWhyOpen((v) => !v) };
  return (
    <div className={bubbleClass(entry, lines, arrived)} data-mid={entry.messageId}>
      <div className="tl-msg-bubble">
        {!real && metaLine(props, named)}
        {/* An email says what it is about before it says it. */}
        {entry.subject && (
          <div className="tl-msg-subject" data-testid="tl-msg-subject">
            {entry.subject}
          </div>
        )}
        <div className="tl-msg-body">
          <TlMsgBody text={entry.body} quoted={entry.quoted} signature={entry.signature} />
          {real && bubbleCorner(props, named, why)}
        </div>
        {entry.media && <TlMedia media={entry.media} />}
        {/* An email's files are not kept, and its words only up to a bound: the bubble says so, or "see attached" reads as the whole of it. */}
        {entry.leftOut && (
          <div className="tl-msg-note" data-testid="tl-msg-left-out">
            <Icon name="info" size={11} /> {entry.leftOut}
          </div>
        )}
        {/* Why a send failed, in the provider's own terms made plain (contracts sendFailureWords): for the owner, under the words that never left. */}
        {entry.failedWhy && (
          <div className="tl-msg-note" data-testid="tl-msg-failed-why">
            <Icon name="alert" size={11} /> {entry.failedWhy}
          </div>
        )}
        {bubbleFoot(props, why)}
        {entry.why && whyOpen && <TlWhyPanel why={entry.why} />}
      </div>
    </div>
  );
};
