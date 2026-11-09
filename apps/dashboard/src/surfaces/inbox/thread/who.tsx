/**
 * Who a conversation is with (moved from pages/inbox-thread.jsx, decision 0015): their face beside their name and the
 * line under it (`children`). Where they have a page (`to`), the three are one link to it, as a messaging app's header
 * opens the contact: the whole block is the press, a thumb tall on a phone, and the name underlines under a pointer. The
 * call's own header (conversations-page.tsx) and Live's name are the same door.
 *
 * The face is the kit's Face at its header size, the one avatar a person wears wherever a thread or a call names them
 * (the thread's header, the call's header, Live's panel), told who it is for (`person`: contracts decides a number's glyph
 * from an address's from a name's initials). Its picture slot (`photo`) is where an uploaded photo of a
 * customer, or a company's logo, goes once members can add one: it covers the initials, which show again if the picture
 * does not load. Nothing draws a picture yet; when something does, it passes `photo` here and every place that names a
 * person has it.
 *
 * What the thread's head draws in and on it is here too (the thread canvas, 1 Nov 2026): the wire's badge on the face's
 * edge, and the line under the name, where the conversation stands and the one fact People's row says of them.
 */
import type { ReactElement, ReactNode } from "react";
import { countdownClock, heldPill, personFaceOf, THREAD_PANE_WORDS, threadHeadFactOf } from "@chanlytics/contracts";
import type { PersonRowVM } from "@chanlytics/contracts";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { StatePill } from "../../kit/pill/state-pill";
import { holderName } from "../../holder-names";
import { ixMoveOf, ixMoveWaited, ixWaitSaid } from "../rules";
import { hasRouteDoor, routeDoor } from "../shell";
import type { RealThread, Thread } from "../types";
import { channelIconOf } from "./timeline";
import { visitWordHere } from "../../workspace-word";

interface IxWhoProps {
  to?: string | null;
  go?: ((to: string) => void) | null;
  who: string;
  avatar: string;
  photo?: string | null;
  priority?: string | null;
  /** The face at the thread head's 40px (inbox.css), where a call's head keeps the kit's 36. */
  large?: boolean;
  /** What stands on the face's edge: the wire the conversation is on (header.tsx wireBadge). */
  badge?: ReactNode;
  children?: ReactNode;
}

/** The face, with the wire's badge on its edge where it has one. Called, not drawn. */
function whoFace({
  who,
  avatar,
  photo = null,
  priority = null,
  large = false,
  badge = null,
}: IxWhoProps): ReactElement {
  const drawn = (
    <Face
      person={{ name: who, initials: avatar }}
      size="lg"
      photo={photo ?? undefined}
      priority={priority}
      {...(large ? { className: "ix-th-who-round" } : {})}
    />
  );
  // A badge stands on the face's edge, outside the circle that clips its picture: the two in a box of their own.
  return badge ? (
    <span className="ix-th-pic">
      {drawn}
      {badge}
    </span>
  ) : (
    drawn
  );
}

export const IxWho = (p: IxWhoProps) => {
  const { to = null, go = null, who, children } = p;
  const face = whoFace(p);
  if (!to || !hasRouteDoor())
    return (
      <div className="ix-th-who">
        {face}
        <div className="ix-th-id">{children}</div>
      </div>
    );
  return (
    <a className="ix-th-who" {...routeDoor(to, go)} title={`Open ${who} in People`} data-testid="ix-th-person">
      {face}
      <div className="ix-th-id">{children}</div>
    </a>
  );
};

// =============== WHERE IT STANDS — the header's second line ===============
// What the thread's row in the list wears (StatePill -- one vocabulary for both) and how long they have waited, said
// under the name in the header (header.tsx), where the wires were (the thread canvas, 1 Nov 2026). It was a bar of its
// own under the header, a row of the phone's height for one pill, over the dock that said the reason again. WhatsApp's
// window, shut, is the template box's to say (ChatClosed, template-box.tsx): the line under the name is the person's
// link, and a press inside a link is not one. Nothing when there is nothing to say: the header says the wires instead.

/** Where a thread stands: the pill its row wears, lit on its tone, with how long they have waited in the mono face. */
interface Standing {
  pill: ReactElement;
  meta?: string | null;
  /** What the bare wait means, on a hover ("waiting 40m"). */
  title?: string;
  /** Who gave the last word, in words: not a figure, so not in the figures' face. */
  words?: boolean;
}

/** A draft counting down to send, as the head's state says it: the seconds left (none once held) and whether you are away. */
export interface Countdown {
  remaining: number | null;
  paused: boolean;
}

/**
 * Where a thread stands, lit: whose move it is (contracts thread-move.ts), in the tone map's colour and word, with how long
 * it has stood beside it in the quiet mono ink (the thread canvas's "2h": the pill is the one signal, and the number says
 * how long). A reply counting down says its clock; a thread that was answered wears the green with its tick, and who gave
 * the last word beside it. A thread with nothing on it says its wires.
 */
const ixStanding = (thread: RealThread, countdown: Countdown): Standing | null => {
  const move = ixMoveOf(thread);
  if (move.move === "nothing") return null;
  if (move.move === "snoozed")
    return {
      pill: <StatePill kind="thread" value="snoozed" lit />,
      meta: `back ${thread.wake || "tomorrow 10:00"}`,
    };
  if (move.move === "sending")
    return countdown.remaining == null
      ? null
      : {
          pill: (
            <StatePill
              kind="thread"
              value="sending"
              lit
              glyph={<Icon name="clock" size={11} />}
              label={
                <>
                  {THREAD_PANE_WORDS.sendsIn} <span className="tabular">{countdownClock(countdown.remaining)}</span>
                </>
              }
            />
          ),
        };
  if (move.move === "answered" || move.move === "call")
    return {
      pill: <StatePill kind="thread" value={move.move} lit glyph={<Icon name="check" size={11} />} />,
      meta: move.by ? `by ${move.by}` : null,
      words: true,
    };
  const waited = ixMoveWaited(thread, move);
  // The words that didn't send say when they were written, by the business's clock ("10:49 AM"), where the read said it.
  if (move.move === "failed")
    return { pill: <StatePill kind="thread" value="failed" lit />, meta: thread.lastWord?.at || waited };
  // Who has it, named from the team where the roster knows them.
  const label = move.move === "theirs" ? heldPill("theirs", holderName(thread.assigneeUserId)) : undefined;
  return {
    pill: <StatePill kind="thread" value={move.move} lit {...(label ? { label } : {})} />,
    meta: waited,
    title: waited ? ixWaitSaid(move, waited) : undefined,
  };
};

/** Where a real thread stands, as the header's second line says it; null where it stands nowhere worth a word. */
function whereItStands(
  thread: RealThread,
  countdown: Countdown = { remaining: null, paused: false },
): ReactElement | null {
  const standing = ixStanding(thread, countdown);
  if (!standing) return null;
  return (
    <span className="ix-th-standing" data-testid="ix-th-standing">
      {standing.pill}
      {standing.meta && (
        <span
          className={standing.words ? "ix-th-standing-meta ix-th-standing-words" : "ix-th-standing-meta tabular"}
          title={standing.title}
          aria-hidden={standing.title ? true : undefined}
        >
          {standing.meta}
        </span>
      )}
      {/* The bare wait, said whole to a screen reader ("Waiting 2h"), where the eye has the pill beside the figure. */}
      {standing.meta && standing.title && <span className="ix-wait-said">{standing.title}</span>}
    </span>
  );
}

// The line under the name says the wires the conversation is on, once: "WhatsApp", "Phone · WhatsApp". It spent itself
// on "+1 (917) 555-0114" and "no name saved" -- the number is on their profile, one tap away in the menu.
const ixWires = (thread: Thread, labels: Record<string, string>) => {
  const ws = (thread.channels && thread.channels.length ? thread.channels : [thread.primaryChannel]).filter(Boolean);
  return [...new Set(ws.map((c) => labels[c] || c))].join(" · ");
};

/**
 * The wire the conversation is on, as a glyph on the face's edge (the thread canvas, 1 Nov 2026: a round of the raised
 * ground at its corner), its words for a pointer and a screen reader: every wire the thread has used ("Phone · WhatsApp"),
 * the newest one's glyph. It stood as glyphs after the name, and the line under the name says where the thread stands.
 */
export function wireBadge(thread: Thread, labels: Record<string, string>) {
  const ws = (thread.channels && thread.channels.length ? thread.channels : [thread.primaryChannel]).filter(Boolean);
  const glyph = thread.primaryChannel ? channelIconOf(thread.primaryChannel) : ws[0] ? channelIconOf(ws[0]) : null;
  // Someone known by their address alone wears the mail glyph as their face: a mail badge on it said it twice.
  if (!glyph || personFaceOf(thread.who).glyph === glyph) return null;
  const said = ixWires(thread, labels);
  return (
    <span className="ix-th-wire" role="img" aria-label={said} title={said} data-testid="ix-th-wire">
      <Icon name={glyph} size={11} />
    </span>
  );
}

/**
 * The line under the name (the thread canvas, 1 Nov 2026): where it stands, as the row's pill lit on its tone with the
 * wait beside it, then one fact about them (contracts threadHeadFactOf: their deal, a visit, where they work, where they
 * came from). A desk with the person's rail beside the thread says the wire there instead, in a glyph and its word: the
 * rail says who they are. A thread that stands nowhere says its wires.
 */
export function headerSub(
  thread: Thread,
  channelLabels: Record<string, string>,
  person: PersonRowVM | null | undefined,
  countdown: Countdown,
) {
  const standing = thread.real ? whereItStands(thread, countdown) : null;
  const fact = thread.real && person ? threadHeadFactOf(person, visitWordHere()) : null;
  const wires = thread.real ? ixWires(thread, channelLabels || {}) : thread.whoMeta;
  const wire = thread.real && thread.primaryChannel ? channelIconOf(thread.primaryChannel) : null;
  return (
    <div className="ix-th-sub" data-testid="ix-th-sub">
      {standing ?? <span className="ix-th-meta">{wires}</span>}
      {fact && (
        <span className="ix-th-fact" data-of={fact.of} data-testid="ix-th-fact">
          <span className="ix-th-sep" aria-hidden="true">
            ·
          </span>
          <span className="ix-th-fact-words">{fact.words}</span>
        </span>
      )}
      {standing && wire && (
        <span className="ix-th-on" data-testid="ix-th-on">
          <span className="ix-th-sep" aria-hidden="true">
            ·
          </span>
          <Icon name={wire} size={12} />
          <span className="ix-th-fact-words">{wires}</span>
        </span>
      )}
    </div>
  );
}
