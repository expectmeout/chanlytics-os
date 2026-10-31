/**
 * The thread's header (moved from pages/inbox-thread.jsx, decision 0015): who the conversation is with, the wires it is
 * on, their deal or their visit in one chip, the Actions menu, and the step due under the head.
 *
 * The header is a function per part, called by `ThreadHeader` and not drawn as a component of its own, so the tree is
 * the tree it was; its hooks stay in `ThreadHeader`, in the order they were.
 */
import {
  NOTE_WORDS,
  WORKS_AT_WORDS,
  adRoute,
  appointmentWords,
  businessTrailOf,
  fromAdWords,
  linkHost,
  proposalLinkOf,
  proposalMessage,
} from "@chanlytics/contracts";
import { PERSON_ACT_WORDS } from "@chanlytics/contracts";
import type { DealVM, PersonNextStepVM, PersonRowVM, VisitLineVM } from "@chanlytics/contracts";
import { useState, type ReactNode } from "react";
import { Icon } from "../../kit/icon/icon";
import { Menu, type MenuGroup, type MenuItem } from "../../kit/menu/menu";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import { askAbout, refreshSurface, routeDoor } from "../../legacy-verbs";
import { ROUTES } from "../constants";
import { carryNotAPerson } from "../carried-reply";
import {
  clockZone,
  demoSession,
  gate,
  hasDealSheet,
  navigate,
  openDealSheet,
  seededLeads,
  useToast,
  type Flash,
} from "../shell";
import { dealKit, hasHref, hrefOf, personNotes, usePeopleMoved } from "./shell-thread";
import type { Thread } from "../types";
import { ixBandCallBack } from "./band";
import { channelIconOf } from "./timeline";
import { IxWho } from "./who";
import { NameOffer } from "../../people/person/name-offer";
import { mayAtLeast } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { LinkButton } from "../../kit/link-button/link-button";
import { completeStep } from "../../step-done";
import { personOnThread, useThreadPersonMoved, wantPerson, wantThreadPerson } from "../../people/want-person";
import { visitWordHere } from "../../workspace-word";
import { codeOnce } from "@/lib/code-once";
import { useCode } from "@/lib/use-code";

// A step due under the head (0007, amended): their next step once its day has come, with Done, so whoever answers
// them ticks it where they are. People's row carries it, judged as every page judges a step: at the moment People's
// rows were published (contracts dueStepDay, through __personNotes). One ahead is not said -- the head says who they
// are, and a step waits for its day. Done is an owner's or an operator's (the door's rule; the gate says so to anyone
// else) and is said as every page says it (step-done.tsx): "Step done · its words", with an Undo that brings the line
// back. The line goes with the step once People is read again, and the header's toast outlives it.
const IxThreadStep = ({
  personId,
  step,
  at,
  flash,
}: {
  personId: string;
  step: PersonNextStepVM;
  /** When the person's row was read: the step's day is said at that clock (People's, or the thread's own read). */
  at: number;
  flash: (flash: Flash) => void;
}) => {
  const [gone, setGone] = useState<string | null>(null);
  const N = personNotes();
  const tz = clockZone();
  const day = N ? N.dueDay(step, tz, at) : null;
  if (!N || !day || gone === step.id) return null;
  const done = () =>
    completeStep({
      personId,
      noteId: step.id,
      words: step.words,
      done: N.done,
      say: flash,
      onDone: () => setGone(step.id),
      onUndone: () => setGone(null),
      // Refused: nothing was written, so nothing is read again on its own, and the step the header holds may be the one that
      // moved. The step is People's row, so People is read again (S9-10): the event alone repainted the same rows.
      onRefused: () => void refreshSurface("people"),
    });
  return (
    <div className="ix-th-step" data-due={day.due} data-testid="ix-th-step">
      <span className="ix-th-step-label">{NOTE_WORDS.next}</span>
      <span className="ix-th-step-words" data-testid="ix-th-step-words">
        {step.words}
      </span>
      <span className="ix-th-step-when" data-testid="ix-th-step-when">
        {day.words}
      </span>
      {step.forWho ? (
        <span className="ix-th-step-for" data-testid="ix-th-step-for">
          {step.forWho}
        </span>
      ) : null}
      <button
        type="button"
        className="ix-th-step-done"
        onClick={done}
        aria-label={NOTE_WORDS.markDone(step.words)}
        data-testid="ix-th-step-done"
        {...gate("approve", "mark a step done")}
      >
        {NOTE_WORDS.done}
      </button>
    </div>
  );
};

// A file the server writes, fetched the way a link marked `download` fetches it: the menu's items are buttons.
const ixDownload = (href: string) => {
  const a = document.createElement("a");
  a.href = href;
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
};

// The line under the name says the wires the conversation is on, once: "WhatsApp", "Phone · WhatsApp". It spent itself
// on "+1 (917) 555-0114" and "no name saved" -- the number is on their profile, one tap away in the menu.
const ixWires = (thread: Thread, labels: Record<string, string>) => {
  const ws = (thread.channels && thread.channels.length ? thread.channels : [thread.primaryChannel]).filter(Boolean);
  return [...new Set(ws.map((c) => labels[c] || c))].join(" · ");
};

// A menu's groups: the kit's menu draws a line between each two, so a group with nothing in it is not one.
const ixMenu = (groups: MenuItem[][]): MenuGroup[] => groups.filter((g) => g.length).map((items) => ({ items }));

// An item's glyph, at the size the menu draws it.
const ixGlyph = (name: string) => <Icon name={name} size={13} />;

/** Who this is, and what is known of them in People: their deal or a visit, and the deal's link. */
interface HeaderFacts {
  person: PersonRowVM | null | undefined;
  /** When their row was read (People's, or the thread's own read of them); now, where nothing is read yet. */
  readAt: number;
  deal: DealVM | null;
  proposalUrl: string | null;
  /** Their next visit (else their last) as the one visit line, and whether it is ahead. */
  visit: { ahead: boolean; line: VisitLineVM } | null;
}

/**
 * Who this is, in one chip beside the wires: their deal when it says more than a visit (0004) -- a client, a
 * proposal waiting -- else a visit ahead on the calendar (People's own day and time), else the last one behind
 * them; nothing when People has none of these, or is not read yet. One chip. Not the band's words: the band says
 * where the conversation stands, this says who they are, which was a page away. Their row is People's once People holds
 * them, and the thread's own read of them until then, which the first draw waits for (want-person.ts): People's book came
 * 0.3 to 0.5 s after the thread on a cold load, and the chip landed on a head already drawn.
 */
function headerFacts(thread: Thread): HeaderFacts {
  const conversationId = thread.real ? thread.conversationId : null;
  const known = personOnThread(conversationId, thread.clientId);
  const person = known?.row ?? null;
  // A person People does not hold yet (made since its last read): People is asked for once (want-person.ts; R10). A
  // thread opened before anything said who they are reads them itself.
  wantPerson(thread.clientId);
  if (!known) wantThreadPerson(conversationId);
  const deal = person && person.deal && person.deal.brief ? person.deal : null;
  // Their proposal's link (0008): contracts' proposalLinkOf over People's row -- the deal's while it is a proposal out,
  // none for a client or someone who passed, the thread's own (the person's) only with no deal, or no row to read.
  // Nothing before their row is read: their deal may hold another.
  const proposalUrl = known ? proposalLinkOf(person ? person.deal : null, thread.proposalUrl) : null;
  const visit =
    deal || !person
      ? null
      : person.nextVisitLine
        ? { ahead: true, line: person.nextVisitLine }
        : person.lastVisitLine
          ? { ahead: false, line: person.lastVisitLine }
          : null;
  return { person, readAt: known?.at ?? Date.now(), deal, proposalUrl, visit };
}

// Any act's glyph by its id, and the send's always: the menu's send is drawn whether or not the kit lists it.
const DEAL_ICON: Readonly<Record<string, string> & { send: string }> = {
  propose: "deal",
  send: "send",
  won: "check",
  lost: "x",
  edit: "edit",
  ended: "stop",
  again: "repeat",
};

/**
 * The deal's group (0008): its proposal into the box, and the moves for the stage of the deal People's row carries,
 * each opening the one deal sheet (components/deal-sheet.jsx), which reads them in full. The words are contracts'
 * (deal-sheet.ts dealMenuActs, through window.__deal). The send needs the link above and a wire free text can go on;
 * the moves need a person People has read, on a real workspace.
 */
function dealGroup(thread: Thread, facts: HeaderFacts): MenuItem[] {
  const { person, proposalUrl } = facts;
  const kit = dealKit();
  // The sheet gives focus back to whatever held it as it opened, and a menu's item is gone by then: the Actions button
  // holds it first, so closing the sheet lands there.
  const toActions = () => {
    const b =
      typeof document !== "undefined" && "querySelector" in document
        ? document.querySelector<HTMLElement>(".ix-th-head .ix-th-more")
        : null;
    if (b && b.focus) b.focus();
  };
  const sendItem: MenuItem | null =
    kit && thread.real && proposalUrl && thread.windowOpen && !thread.optedOut
      ? {
          label: kit.actWords.send,
          hint: linkHost(proposalUrl),
          glyph: ixGlyph(DEAL_ICON.send ?? "send"),
          onSelect: () =>
            window.dispatchEvent(
              new CustomEvent("inbox:compose", { detail: { text: proposalMessage(proposalUrl), link: proposalUrl } }),
            ),
          gate: gate("approve", "put the proposal link in the reply"),
        }
      : null;
  const clientId = thread.clientId;
  const dealItems: MenuItem[] =
    kit && !demoSession() && clientId && person && hasDealSheet()
      ? kit
          .menu(person.deal)
          .filter((a) => a.mode)
          .map((a) => ({
            label: a.label,
            glyph: ixGlyph(DEAL_ICON[a.id] || "deal"),
            onSelect: () => {
              toActions();
              openDealSheet({
                personId: clientId,
                mode: a.mode ?? "",
                dealId: a.mode === "propose" || !person.deal ? null : person.deal.id,
              });
            },
            gate: gate("approve", "record a deal"),
          }))
      : [];
  return [...(sendItem ? [sendItem] : []), ...dealItems];
}

/**
 * Where an ad brought them, as a line under the head: a door to the ad (the demo's threads alone carry one; a real thread has
 * none). It stands under the head and beside the person's link, never inside it: a link inside a link is neither valid nor
 * reachable, and the name's link opens the person.
 */
function fromAdLine(ad: NonNullable<Thread["fromAd"]>) {
  return (
    <div className="ix-th-ad" data-testid="ix-th-ad">
      <LinkButton size="inherit" className="ix-th-ad-door" {...routeDoor(adRoute(ad.id))}>
        {fromAdWords(ad.name)} <Icon name="chevron" size={10} />
      </LinkButton>
    </div>
  );
}

/** The seeded "Also in Leads" chip, a button of its own, so it stands beside the link, never inside it. */
function alsoInLeads(thread: Thread) {
  if (!thread.leadId) return null;
  const ld = seededLeads().find((l) => l.id === thread.leadId);
  const words: Record<string, string> = {
    ready: "Ready",
    qualifying: "Qualifying",
    new: "New",
    nurture: "Nurturing",
    converted: "Converted",
    archived: "Archived",
  };
  const label = ld ? words[ld.stage] || ld.stage : null;
  return (
    <button
      className="ix-xlink"
      title="This decision also sits in your Leads queue"
      onClick={() => navigate(ROUTES.lead())}
    >
      <Icon name="bolt" size={9} /> Also in Leads{label ? ` · ${label}` : ""}
    </button>
  );
}

/** The Actions menu: what to do with the conversation, then with the person, the deal, the file. */
interface HeaderActs {
  onSnooze: (threadId: string) => void;
  onMarkUnread: (threadId: string) => void;
  onOpenClient: (clientId: string | null | undefined) => void;
  onArchive: (() => void) | null;
}

function actionsMenu(thread: Thread, dealActs: MenuItem[], acts: HeaderActs) {
  const { onSnooze, onMarkUnread, onOpenClient, onArchive } = acts;
  const snoozed = thread.state === "snoozed";
  const conversation: MenuItem[] = [
    // A snoozed thread wakes from its status line ("Wake now"); the header's Snooze button read "Wakes …", disabled.
    ...(snoozed
      ? []
      : [
          {
            label: "Snooze",
            hint: "until tomorrow 10:00",
            glyph: ixGlyph("clock"),
            onSelect: () => onSnooze(thread.id),
            gate: gate("approve", "snooze a conversation"),
          },
        ]),
    // Archive, for the thread in front of you: it lived only in the bulk bar, behind a checkbox a phone never shows.
    ...(onArchive && !thread.archived
      ? [
          {
            label: "Archive",
            glyph: ixGlyph("check"),
            onSelect: onArchive,
            gate: gate("approve", "archive a conversation"),
          },
        ]
      : []),
    // Mark as unread is the reader's own mark on the person now (00349, surfaces/seen.ts), kept: on a real thread it
    // flipped a local flag the next realtime reseed wiped, and was taken out of the menu for promising what did not
    // happen. A thread with nobody behind it (a caller who withheld their number) has no one to mark. "Block sender"
    // opened the Ask overlay, a no-op outside a demo: the real way to stop the receptionist for one person is the
    // mode on their profile, so that is where a real session goes.
    ...(demoSession() || (thread.real && thread.clientId)
      ? [{ label: "Mark as unread", glyph: ixGlyph("inbox"), onSelect: () => onMarkUnread(thread.id) }]
      : []),
  ];
  const person: MenuItem[] = [
    // clientId is the contact behind the thread, so these only render
    // when there is actually somewhere to go (a phone-only caller has none).
    ...(thread.clientId
      ? [{ label: "Open profile", glyph: ixGlyph("users"), onSelect: () => onOpenClient(thread.clientId) }]
      : []),
    ...(!demoSession() && thread.clientId
      ? [{ label: "Receptionist settings", glyph: ixGlyph("shield"), onSelect: () => onOpenClient(thread.clientId) }]
      : []),
    // A program's mail taken for a person (decision 0080): where the owner sees it, on the thread, rather than three
    // screens away. It deletes, so it opens their page with Not a person asked, the typed name and all (00483).
    ...(thread.real && thread.clientId && thread.primaryChannel === "email" && mayAtLeast("owner")
      ? [
          {
            label: PERSON_ACT_WORDS.notAPerson,
            hint: PERSON_ACT_WORDS.notAPersonHint,
            glyph: ixGlyph("ban"),
            tone: "danger" as const,
            onSelect: () => {
              if (!thread.clientId) return;
              carryNotAPerson(thread.clientId);
              onOpenClient(thread.clientId);
            },
          },
        ]
      : []),
  ];
  const file: MenuItem[] = [
    // The transcript as a file, from the route that writes it. It was a button in Conversations' header only, so the
    // thread had it in one tab and not the other.
    ...(thread.real && thread.conversationId && hasHref()
      ? [
          {
            label: "Export transcript",
            glyph: ixGlyph("external"),
            onSelect: () => {
              const to = hrefOf("GET conversations/[id]/export", { id: thread.conversationId ?? "" });
              if (to) ixDownload(to);
            },
          },
        ]
      : []),
  ];
  return ixMenu([
    conversation,
    person,
    // The deal (0008): its proposal into the box -- the deal's link (above), only where free text can go, never to
    // someone who said stop, only on a real thread; the hint says where the link lives (contracts linkHost) -- and the
    // moves for its stage, each opening the sheet. Every workspace's (0008, amended 18 Oct 2026).
    dealActs,
    file,
    demoSession()
      ? [
          {
            label: "Block sender",
            glyph: ixGlyph("x"),
            tone: "danger" as const,
            onSelect: () => askAbout({ mode: "compose", prompt: "Block this sender because " }),
          },
        ]
      : [],
  ]);
}

/** The name, the pin, the human-contact mark and the door's chevron. */
function headerName(thread: Thread, personTo: string | null, facts: HeaderFacts) {
  // The business a named person works at, dim after their name (0052); a stand-in's name is the business's already.
  const trail = facts.person ? businessTrailOf(facts.person) : null;
  return (
    <div className="ix-th-name">
      <span className="ix-th-name-words">{thread.who}</span>
      {trail && (
        <span className="ix-th-trail" data-testid="ix-th-business">
          · {trail}
        </span>
      )}
      {/* They asked to stop: said beside the name, before the reply box turns into a banner (D1-stop-unseen). */}
      {thread.real && thread.optedOut && <StoppedMark testid="ix-th-stopped" />}
      {thread.pinned && <Icon name="pin" size={11} style={{ color: "var(--ink-faint)" }} />}
      {thread.hasHumanContact && (
        <span className="ix-th-relation" title="Has spoken with a human before">
          <Icon name="users" size={10} />
        </span>
      )}
      {personTo && (
        <span className="ix-th-go" aria-hidden="true">
          <Icon name="chevron" size={10} />
        </span>
      )}
    </div>
  );
}

/** A visit as the chip says it: its day, its time when it is ahead, and how it stands (the one visit line's word). */
function visitWords(visit: NonNullable<HeaderFacts["visit"]>) {
  return (
    <>
      <Icon name="calendar" size={10} />
      <span className="ix-th-visit-words">
        {visit.ahead ? visit.line.day : `Last · ${visit.line.day}`}
        {visit.ahead && visit.line.time && <span className="ix-th-visit-time"> · {visit.line.time}</span>}
        {/* How it stands, in the one visit line's word: Kept or Missed once said, Past once it has ended and nobody has. */}
        {visit.line.state && (
          <span className="ix-th-visit-time" data-testid="ix-th-visit-state">
            {" "}
            · {visit.line.state.text}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * Their visit as a door of its own, beside the head on a desk (the wiring's second audit, S9-7): the chip under the name said
 * the visit and opened the person, since the head is one link to their page, and every other visit link opens the visit. A
 * phone keeps the chip as words inside the head, as it keeps the business (.ix-th-works, mobile.css). None for a visit the
 * line gives no address.
 */
function visitDoor(facts: HeaderFacts) {
  const visit = facts.visit;
  if (!visit || !visit.line.to) return null;
  return (
    <a
      className={`ix-th-visit ix-th-visit-door${visit.ahead ? " ahead" : ""}`}
      {...routeDoor(visit.line.to)}
      title={`Open their ${visit.ahead ? "" : "last "}${appointmentWords(visitWordHere()).one}`}
      data-testid="ix-th-visit-door"
    >
      {visitWords(visit)}
    </a>
  );
}

/** The line under the name: the wires, and the deal or the visit. */
function headerSub(thread: Thread, channelLabels: Record<string, string>, facts: HeaderFacts) {
  const { deal, visit, person } = facts;
  // Where they work, as words inside the head's door, when there is no deal or visit to say (0052): a phone's, whose head
  // has no room beside it for the door a desk draws (worksAtDoor), and a business removed since, which has no sheet.
  const works = !deal && !visit && person && person.worksAt && !person.standIn ? person.worksAt : null;
  // What the thread's emails are about, said once here: it was over every bubble, "Re:" and all.
  const subject = thread.real ? thread.emailSubject : undefined;
  return (
    <div className="ix-th-sub">
      <div className="ix-th-meta">{thread.real ? ixWires(thread, channelLabels || {}) : thread.whoMeta}</div>
      {subject && (
        <span className="ix-th-visit" title={subject} data-testid="ix-th-subject">
          <Icon name="mail" size={10} />
          <span className="ix-th-visit-words">{subject}</span>
        </span>
      )}
      {deal && (
        <span className={`ix-th-visit${deal.stage === "won" ? " ahead" : ""}`} data-testid="ix-th-deal">
          <Icon name="deal" size={10} />
          <span className="ix-th-visit-words">{deal.brief}</span>
        </span>
      )}
      {works && (
        <span className={`ix-th-visit${works.gone ? "" : " ix-th-works-said"}`} data-testid="ix-th-works-at">
          <Icon name="map" size={10} />
          <span className="ix-th-visit-words">
            {works.gone ? WORKS_AT_WORDS.gone : `${WORKS_AT_WORDS.title} ${works.name}`}
          </span>
        </span>
      )}
      {visit && (
        // Said here on a phone; a desk draws the visit as its door beside the head (visitDoor) where it has an address.
        <span
          className={`ix-th-visit${visit.ahead ? " ahead" : ""}${visit.line.to ? " ix-th-visit-said" : ""}`}
          data-testid="ix-th-visit"
        >
          {visitWords(visit)}
        </span>
      )}
    </div>
  );
}

interface ThreadHeaderProps {
  thread: Thread;
  channelLabels: Record<string, string>;
  onOpenClient?: (clientId: string | null | undefined) => void;
  onSnooze?: (threadId: string) => void;
  onMarkUnread?: (threadId: string) => void;
  onBack?: (() => void) | null;
  onArchive?: (() => void) | null;
}

/**
 * The business sheet's module (people/person/business.tsx), loaded once for the tab: a thread carries none of it until
 * asked, and a fetch that failed is asked for again by the next pointer or press. What it reads of the module is named,
 * so the dead-exports check (knip) sees the use.
 */
const businessDoorCode = codeOnce(() =>
  import("../../people/person/business").then(({ BusinessSheetFor }) => ({ BusinessSheetFor })),
);

/** Whose business the sheet over the thread shows: the person and the business's name, said while it is read. */
interface BusinessAsked {
  personId: string;
  name: string;
}

/**
 * Where they work, a door to the business's sheet beside the link to their page (0052): the "Also in Leads" chip of the
 * mockup, made real. A desk's: a phone says it as words in the head (headerSub). Its module is asked for as a pointer
 * reaches it, so the press opens the sheet at once. Nothing for a stand-in, whose name is the business's already, or a
 * business whose details were removed.
 */
function worksAtDoor(facts: HeaderFacts, open: (b: BusinessAsked) => void) {
  const person = facts.person;
  const w = person && !person.standIn ? person.worksAt : null;
  if (!person || !w || w.gone || !w.name) return null;
  const asked = { personId: person.id, name: w.name };
  return (
    <Button
      variant="quiet"
      size="sm"
      className="ix-th-works"
      onPointerEnter={businessDoorCode.warm}
      onClick={() => open(asked)}
      data-testid="ix-th-works-door"
    >
      <Icon name="map" size={11} />
      <span className="ix-th-works-name">
        {WORKS_AT_WORDS.title} {w.name}
      </span>
      <Icon name="chevron" size={10} />
    </Button>
  );
}

/** The business sheet over the thread, once its module is in (the door's press asks for it, if a pointer did not). */
function ThreadBusinessSheet({ asked, onClose }: { asked: BusinessAsked | null; onClose: () => void }) {
  const Door = useCode(businessDoorCode, !!asked).loaded?.BusinessSheetFor;
  return asked && Door ? <Door personId={asked.personId} name={asked.name} onClose={onClose} /> : null;
}

/** The face, the name and what is known of them, one link to their page, and the doors to their visit and business beside it. */
function headerMain(props: ThreadHeaderProps, facts: HeaderFacts, alsoLeads: ReactNode) {
  const { thread, channelLabels, onOpenClient = () => {}, onBack = null } = props;
  // Who this is opens their page: the face, the name and the line under it are one link (IxWho), as a messaging app's
  // header is. The page was a press away only through Actions › Open profile. A caller with no person has no page.
  const personTo = thread.clientId ? `clients/${thread.clientId}` : null;
  return (
    <div className="ix-th-head-main">
      {/* Phone only (mobile.css): the list and the thread take turns. The arrow alone: the top bar says Inbox over it,
            and "← Inbox" said it again. */}
      {onBack && (
        <Button
          type="button"
          variant="quiet"
          size="sm"
          className="ix-back"
          onClick={onBack}
          aria-label="Back to the list"
          data-testid="ix-back"
        >
          <span aria-hidden="true">&larr;</span>
        </Button>
      )}
      <IxWho
        to={personTo}
        go={() => onOpenClient(thread.clientId)}
        who={thread.who}
        avatar={thread.avatar}
        priority={thread.priority}
      >
        {headerName(thread, personTo, facts)}
        {headerSub(thread, channelLabels, facts)}
      </IxWho>
      {thread.real && !demoSession() ? visitDoor(facts) : null}
      {alsoLeads}
    </div>
  );
}

/** The seeded thread's wires, as chips: the primary one marked. */
function channelChips(thread: Thread, channelLabels: Record<string, string>) {
  return (
    <div className="ix-th-channels-meta">
      {thread.channels.map((c) => (
        <span key={c} className={`ix-channel-chip ${c === thread.primaryChannel ? "primary" : ""}`}>
          <Icon name={channelIconOf(c)} size={11} />
          {channelLabels[c]}
        </span>
      ))}
    </div>
  );
}

export const ThreadHeader = (props: ThreadHeaderProps) => {
  const {
    thread,
    channelLabels,
    onOpenClient = () => {},
    onSnooze = () => {},
    onMarkUnread = () => {},
    onArchive = null,
  } = props;
  // People lands last on a cold boot (its rows are the heaviest read): a thread opened before it draws the chip below
  // once it does, rather than at the next message.
  usePeopleMoved(); // drawn again when People's rows land (surface-status.ts)
  useThreadPersonMoved(); // and when the thread's own read of its person lands (want-person.ts)
  // The header's toast: what its step's Done says, which outlives the line as People is read again.
  const [toastNode, flash] = useToast();
  const facts = headerFacts(thread);
  const { person } = facts;
  // The business sheet over the thread (0052): whose, while it is open.
  const [business, setBusiness] = useState<BusinessAsked | null>(null);
  // The deal's group and the seeded chip are made before the markup, as they were: a role gate is asked for each in that order.
  const dealActs = dealGroup(thread, facts);
  const alsoLeads = alsoInLeads(thread) ?? (thread.real && !demoSession() ? worksAtDoor(facts, setBusiness) : null);
  // A line under the head's row (a reply's signer offered, a step due): on a phone the bar holds two rows, and is a card.
  const signer = person && person.signer && !demoSession() ? person.signer : null;
  const step = person && person.nextStep && !demoSession() ? person.nextStep : null;

  return (
    <header className="ix-th-head capsule" data-stacked={signer || step ? "" : undefined}>
      {headerMain(props, facts, alsoLeads)}
      <div className="ix-th-actions">
        {/* The header says each thing once. A real thread's line under the name names its channel ("WhatsApp · +1 …"),
            and a chip said it again; a seeded thread's line is about the client, so its chips stay. Snooze and the
            profile are in the menu, where they were already. A caller with no WhatsApp thread has Call back in the
            reply box, unless they opted out and the box offers nothing: then it is here. */}
        {!thread.real && channelChips(thread, channelLabels)}
        {thread.real &&
          thread.phone &&
          thread.primaryChannel === "phone" &&
          thread.optedOut &&
          !thread.dnc &&
          !ixBandCallBack(thread) && (
            <Button variant="quiet" size="sm" href={`tel:${thread.phone}`} data-testid="ix-call-back">
              <Icon name="phone" size={12} /> Call back
            </Button>
          )}
        {/* A ghost button with a word, lit only while its menu is open: a ⋯ alone in the dim ink was too faint to
            find on a phone. The menu says what to do with the conversation, then with the person, then the file --
            no eyebrow: the menu is the thread's. "Conversation" headed a list of five in capitals, and
            "Receptionist for this person…" broke onto two lines. */}
        <Menu
          trigger={
            <Button variant="quiet" size="sm" className="ix-th-more" title="Actions">
              Actions <Icon name="chevron-down" size={10} />
            </Button>
          }
          groups={actionsMenu(thread, dealActs, { onSnooze, onMarkUnread, onOpenClient, onArchive })}
        />
      </div>
      {thread.fromAd ? fromAdLine(thread.fromAd) : null}
      {/* A reply's signer offered as their name (0052): said here, where the owner is reading the reply, on one row, its
          acts beside the fact: stacked under it, the head stood 140px tall over the conversation on a phone. */}
      {person && signer ? (
        <div className="ix-th-offer">
          <NameOffer
            personId={person.id}
            messageId={signer.messageId}
            name={signer.name}
            fact={signer.fact}
            source={signer.day}
            canRecord={mayAtLeast("operator")}
            say={flash}
            onChanged={() => undefined}
            line
            testid="ix-th-name-offer"
          />
        </div>
      ) : null}
      {person && step ? (
        <IxThreadStep key={step.id} personId={person.id} step={step} at={facts.readAt} flash={flash} />
      ) : null}
      <ThreadBusinessSheet asked={business} onClose={() => setBusiness(null)} />
      {toastNode}
    </header>
  );
};
