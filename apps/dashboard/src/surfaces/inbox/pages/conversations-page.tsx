/**
 * Chanlytics — Conversations (moved from pages/conversations.jsx, decision 0015, step 3).
 * The raw communication layer: every call, chat, and email, newest first. A row opens the one thread (thread-pane.tsx)
 * -- a call opens its thread at the call -- and a call no thread holds opens alone, in the thread's own frame.
 * The rules of which tab a row is in and of the address are cv-rules.ts. Rows are picked for an act over several as
 * the Inbox's are, by the same parts (pick.tsx): the box over the face, the select-all, the bar, the keys.
 */
import { heldPill, mmss } from "@chanlytics/contracts";
import { useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { Face } from "../../kit/face/face";
import { Icon } from "../../kit/icon/icon";
import { Menu } from "../../kit/menu/menu";
import { useSwapMotion } from "../../kit/motion/use-swap-motion";
import { Search } from "../../kit/search/search";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { StatePill } from "../../kit/pill/state-pill";
import { StoppedMark } from "../../kit/pill/stopped-mark";
import { holderName } from "../../holder-names";
import { useSurface } from "../../use-surface";
import { ROUTES, TICK_MS } from "../constants";
import {
  CV_ICON,
  cvAddress,
  cvCallsWords,
  cvFind,
  cvLeadOf,
  cvOnePerPerson,
  cvSeenOf,
  cvStopped,
  cvWhoseRow,
  inChannel,
} from "../cv-rules";
import { useCvPick, type CvPick } from "./conversations-pick";
import { pickAll, pickBox, pickKeys } from "./pick";
import { seePerson, unreadHere, useSeeOpen, useSeen } from "../../seen";
import {
  appNavigate,
  canNavigate,
  currentRoute,
  demoSession,
  navigate,
  tabMemory,
  useToast,
  type Flash,
} from "../shell";
import { conversationsData, inboxData, IX_STORE } from "../store";
import { ThreadCall } from "../thread/call";
import { ixSwipeBack } from "../thread/thread";
import { IxWho } from "../thread/who";
import { businessTrailFor } from "../thread/shell-thread";
import { ThreadPane } from "../thread/thread-pane";
import type { ConversationRow, ConversationsSurface } from "../types";
import { Button } from "../../kit/button/button";

/** The business a named person works at, dim after their name on a row (0052), giving way before the name does. */
function cvTrail(personId: string | null | undefined) {
  const trail = businessTrailFor(personId);
  return trail ? (
    <span className="ix-thread-trail" data-testid="cv-row-business">
      · {trail}
    </span>
  ) : null;
}

// The box's words, kept per tab in the tab's storage (the loading standard's F, legacy-bridge/tab-memory.ts): a
// search typed on Phone is there again after a trip to People or a refresh; none on the standalone harness.
const cvPlace = (channel: string): Record<string, unknown> => {
  const memory = tabMemory();
  return (memory && memory.place("conversations", channel || "all")) || {};
};
/** The words the tab kept for a tab of the list: none where it kept none. */
const cvKept = (channel: string): string => {
  const q = cvPlace(channel).q;
  return typeof q === "string" ? q : "";
};
const cvKeepPlace = (channel: string, patch: Record<string, unknown>): void => {
  const memory = tabMemory();
  if (memory) memory.keepPlace("conversations", channel || "all", { ...cvPlace(channel), ...patch });
};

// The row's outcome as the one pill draws it. The words a page knows better
// stay here (which channel answered, what you chose); the tones are the map's,
// so "Needs you" is amber here as it is in the Inbox and on a playbook.
// Who answered a handled chat, in the pill's words; a call keeps its own.
const CV_ANSWERED: Record<string, string> = {
  team: "Your team replied",
  broadcast: "Broadcast sent",
  playbook: "Campaign sent",
};

export const OutcomePill = ({
  outcome,
  standing = null,
  holderId = null,
  decidedAction,
  channel,
  answeredBy = null,
}: {
  outcome: string;
  /** Who has the thread (contracts standingOf), read before the outcome: the Inbox's own word for the same row. */
  standing?: string | null;
  /** The teammate who has it, by user id, where `standing` is `theirs`: named as the Inbox's row names them (heldPill). */
  holderId?: string | null;
  decidedAction?: string | null;
  channel: string;
  answeredBy?: string | null;
}) => {
  if (decidedAction)
    return (
      <StatePill
        kind="thread"
        value="decided"
        label={
          <>
            <Icon name="check" size={9} />
            Handled · you chose {decidedAction}
          </>
        }
      />
    );
  if (outcome === "live") return <StatePill kind="call" value="live" />;
  // Who has the person's thread is the Inbox's rule, said in the Inbox's words, and a call stands as its thread does
  // (cv-rules.ts cvCallsStandAsTheirThread). "Needs you" here read "Receptionist replied" over an open escalation, and
  // "Needs you" over a thread you had taken over (the 2 Oct 2026 audit); a call after it read "Hung up early".
  if (standing === "needs_you") return <StatePill kind="thread" value="escalated" />;
  if (standing === "yours") return <StatePill kind="thread" value="yours" />;
  if (standing === "theirs")
    return <StatePill kind="thread" value="theirs" label={heldPill("theirs", holderName(holderId))} />;
  if (standing === "snoozed") return <StatePill kind="thread" value="snoozed" />;
  if (outcome === "missed") return <StatePill kind="call" value="missed" />;
  // A call's own story beats "handled": the caller who asked for a call back, the one who hung up in seconds, the
  // one who reached the voicemail, and the dial the provider could not place (contracts toCallVM decides each).
  if (outcome === "callback" || outcome === "abandoned" || outcome === "voicemail" || outcome === "failed")
    return <StatePill kind="call" value={outcome} />;
  if (outcome === "booked") return <StatePill kind="thread" value="booked" />;
  if (outcome === "escalated") return <StatePill kind="thread" value="escalated" />;
  // A call that was simply handled says what Live and the thread's call card say of it: the call's own word.
  if (outcome === "handled" && channel === "phone") return <StatePill kind="call" value="handled" />;
  if (outcome === "handled")
    return (
      <StatePill
        kind="thread"
        value="handled"
        label={(answeredBy && CV_ANSWERED[answeredBy]) || "Receptionist replied"}
      />
    );
  // The customer had the last word — it is your turn, not theirs; this read "Customer's turn" for a year.
  return <StatePill kind="thread" value="open" />;
};

// Session-decision overlay — approval convos reflect IX_STORE state
const cvDecision = (c: ConversationRow | null | undefined) => {
  if (!c || !c.threadId) return null;
  const rec = IX_STORE.get(c.threadId);
  return rec && rec.kind === "decided" ? rec : null;
};

// ---------- List row ----------
// A person's one row (cv-rules.ts cvOnePerPerson), in the shape of the Inbox's beside it (list-rows.tsx): the face
// wearing the wire of the words shown as a badge, then who it is, how it stands and when on the first line, the words
// on the second, and under them how many calls the row holds, where it holds more than its one. The row said the wire
// three times (a glyph before the name, the receptionist's name in the foot -- a receptionist is its wire's, and the
// thread's by-lines name who answered -- and the tab), the time in the foot, where the Inbox's row says it at the first
// line's end, and a call's length in the foot under words that say it ("Inbound call · 1:35 — …"). The newest row says
// the time, the words and the wire; the pill is its lead's (cvLeadOf), so a thread that needs you still says so under
// the call that came after it. And a person new to the reader reads heavier, as the Inbox's row does (cvUnread): every
// row drew at one weight, read or not (Ruben, 7 Oct 2026).
/** Whether a person's row is new to the reader now: the last read's word, over what this tab did since (surfaces/seen.ts). */
const cvUnread = (c: ConversationRow): boolean => unreadHere(cvWhoseRow(c), cvSeenOf(c));

/**
 * What the list hands a row beside the row itself. The rows are a listbox, as the Inbox's are (list-rows.tsx): one
 * tab stop, Enter opens, Space picks. `pick` is null for a row nothing a pick does applies to, which wears no box.
 */
interface CvRowProps {
  c: ConversationRow;
  active: boolean;
  onSelect: (id: string) => void;
  /** Whether it is picked, and the press that picks it or lets it go. */
  pick: { picked: boolean; onToggle: () => void } | null;
  tabStop: boolean;
  onKey: (e: KeyboardEvent<HTMLDivElement>) => void;
}

const CvRow = ({ c, active, onSelect, pick, tabStop, onKey }: CvRowProps) => {
  const lead = cvLeadOf(c);
  const dec = cvDecision(lead);
  const calls = cvCallsWords(c);
  const picked = !!pick?.picked;
  return (
    <div
      className={`cv-row ${active ? "active" : ""} ${c.live ? "is-live" : ""} ${cvUnread(c) ? "unread" : ""} ${pick ? "can-pick" : ""} ${picked ? "selected" : ""}`}
      role="option"
      // Selected is a word for a row that can be: one nothing a pick does applies to says neither.
      aria-selected={pick ? picked : undefined}
      aria-current={active ? "true" : undefined}
      tabIndex={tabStop ? 0 : -1}
      data-row-id={c.id}
      onClick={() => onSelect(c.id)}
      onKeyDown={onKey}
    >
      <span className="cv-row-lead">
        <Face person={{ name: c.who, initials: c.initials.slice(0, 2) }} className="cv-row-pic" />
        <span className="cv-row-wire" role="img" aria-label={inboxData().CHANNEL_LABELS[c.channel] || c.channel}>
          <Icon name={CV_ICON[c.channel]} size={9} />
        </span>
      </span>
      <span className="cv-row-body">
        <span className="cv-row-line1">
          <span className="cv-row-who">{c.who}</span>
          {cvTrail(c.clientId)}
          <OutcomePill
            outcome={lead.outcome}
            standing={lead.standing ?? null}
            holderId={lead.holderId ?? null}
            decidedAction={dec ? dec.action : null}
            channel={lead.channel}
            answeredBy={lead.answeredBy}
          />
          {/* They asked to stop: said beside the name, as the Inbox's row says it (D1-stop-unseen). */}
          {cvStopped(c) && <StoppedMark testid="cv-row-stopped" />}
          <span className="cv-row-at tabular">{c.at}</span>
        </span>
        <span className="cv-row-snippet">{c.snippet}</span>
        {calls && (
          <span className="cv-row-foot">
            <span className="cv-row-agent">{calls}</span>
          </span>
        )}
      </span>
      {/* The mouse's box, over the face (inbox.css): last, so the face stays the row's first part. */}
      {pick && pickBox(pick)}
    </div>
  );
};

// ---------- A call no thread holds ----------
// In the thread's own frame: its header, and the call as a thread draws it (ThreadCall). A caller who withheld their
// number, a call older than the threads the Inbox shows, a call still going. One still going is a line that says so and
// opens Live, where it can be heard and steered; its clock is the wall clock since it started, never a seed's.
const cvClock = (sec: number) => mmss(sec * 1000);

/** The call's header: back, who it was with (a door to their page), and the one act. */
function callHead(c: ConversationRow, onBack: (() => void) | null) {
  const clientId = c.clientId;
  return (
    <header className="ix-th-head capsule">
      <div className="ix-th-head-main">
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
        {/* Who the call was with opens their page, as the thread's header does (inbox-thread.jsx IxWho). */}
        <IxWho to={clientId ? `clients/${clientId}` : null} who={c.who} avatar={c.initials.slice(0, 2)}>
          <div className="ix-th-name">
            <span className="ix-th-name-words">{c.who}</span>
            {businessTrailFor(clientId) ? (
              <span className="ix-th-trail" data-testid="cv-head-business">
                · {businessTrailFor(clientId)}
              </span>
            ) : null}
            {cvStopped(c) && <StoppedMark testid="cv-head-stopped" />}
            {clientId && (
              <span className="ix-th-go" aria-hidden="true">
                <Icon name="chevron" size={10} />
              </span>
            )}
          </div>
          <div className="ix-th-meta">Phone</div>
        </IxWho>
      </div>
      {clientId && (
        <div className="ix-th-actions">
          <Menu
            trigger={
              <Button variant="quiet" size="sm" className="ix-th-more" title="Actions">
                Actions <Icon name="chevron-down" size={10} />
              </Button>
            }
            groups={[
              {
                items: [
                  {
                    label: "Open profile",
                    glyph: <Icon name="users" size={13} />,
                    onSelect: () => navigate(ROUTES.client(clientId)),
                  },
                ],
              },
            ]}
          />
        </div>
      )}
    </header>
  );
}

/** A call still going: a line that says so, and the door to Live. */
function callLive(secs: number | null) {
  return (
    <div className="tl-call inbound live" data-testid="cv-call-live">
      <div className="tl-call-mark">
        <span className="live-dot" aria-hidden="true" />
        <span className="tl-call-words">
          <span className="tl-call-what">
            <span className="tl-call-kind">On the phone now</span>
            {secs != null && <span className="tl-call-length tabular">{cvClock(secs)}</span>}
          </span>
        </span>
      </div>
      <div className="tl-call-live-acts">
        <Button type="button" size="sm" className="ix-state-go" onClick={() => navigate("live")}>
          <Icon name="phone" size={12} /> Open Live
        </Button>
      </div>
    </div>
  );
}

const CallPane = ({ c, onBack = null }: { c: ConversationRow; onBack?: (() => void) | null }) => {
  const live = !!c.live;
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!live) return undefined;
    const iv = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(iv);
  }, [live, c.id]);
  const started = c.ts ?? 0;
  const secs = live && started > 0 ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : null;
  return (
    <div className="ix-thread-pane cv-call-pane" data-testid="cv-call-pane" {...ixSwipeBack(onBack)}>
      {callHead(c, onBack)}
      <div className="ix-th-scroll">
        <div className="ix-timeline">{live ? callLive(secs) : <ThreadCall call={c} at={c.at} open />}</div>
      </div>
    </div>
  );
};

// Where a row opens. A conversation is the one thread. A call is its thread too, opened at the call, when the thread
// the Inbox read holds the call's note; else the call alone (CallPane). The mockup's seeded threads act only inside
// the Inbox page's demo state, so a seeded chat says where it acts, and a seeded call is drawn alone.
const cvThreadHolds = (c: ConversationRow): boolean => {
  const t = (inboxData().THREADS || []).find((x) => x.id === c.threadId);
  return !!t && (t.timeline || []).some((e) => ("messageId" in e ? e.messageId : undefined) === c.messageId);
};
const cvOpens = (c: ConversationRow): "thread" | "call" | "inbox" => {
  if (c.callId || c.channel === "phone") {
    return !demoSession() && !c.live && c.threadId && c.messageId && cvThreadHolds(c) ? "thread" : "call";
  }
  return demoSession() || !c.threadId ? "inbox" : "thread";
};

// ---------- Page ----------
// The phone's layout, where the list and the viewer take turns: mobile.css's breakpoint, the Inbox's (inbox-state.tsx ixOnPhone).
const cvOnPhone = () => !!(window.matchMedia && window.matchMedia("(max-width: 720px)").matches);

/**
 * The page's door to the address (inbox-state.tsx useInboxAddress's twin). A row opened is the address's: a refresh opens it
 * again. On a desktop it is said more exactly (replaced), and Back leaves the page. On a phone it is the screen, an
 * entry of its own: Back -- the browser's, Android's, the viewer's own -- closes it to its list, where it used to leave
 * Conversations with the row still open. One the address brought (a link, a cold boot) closes to its list in place.
 */
const useCvAddress = (
  channel: string,
  setSelectedId: (id: string | null) => void,
  setPhoneOpen: (v: boolean) => void,
) => {
  // The entry a tap pushed on a phone, while it is the address: the viewer's own Back steps back through it.
  const phoneEntryRef = useRef<string | null>(null);
  const openRow = (id: string) => {
    setSelectedId(id);
    setPhoneOpen(true);
    if (!canNavigate()) return;
    if (!cvOnPhone()) return appNavigate(cvAddress(channel, id), { replace: true });
    phoneEntryRef.current = cvAddress(channel, id);
    appNavigate(cvAddress(channel, id));
  };
  const closeRow = () => {
    if (phoneEntryRef.current && phoneEntryRef.current === currentRoute()) return window.history.back();
    setPhoneOpen(false);
  };
  return { openRow, closeRow };
};

/** The list: the search, the tabs with their counts, and the rows (or what there is instead). */
function listPane(p: {
  data: ConversationsSurface;
  rows: ConversationRow[];
  query: string;
  setQuery: (v: string) => void;
  channel: string;
  counts: Record<string, number>;
  /** The person's row open, which the part open is one of. */
  selectedRow: ConversationRow | undefined;
  openRow: (id: string) => void;
  /** The rows' ref: they swap in with a rise as the channel changes (kit/motion). */
  swap: ReturnType<typeof useSwapMotion<HTMLDivElement>>;
  /** The pick (pick.tsx): the rows chosen for an act over several, the bar over them, and the question an archive asks. */
  pick: CvPick;
}) {
  const { data, rows, query, setQuery, channel, counts, selectedRow, openRow, swap, pick } = p;
  const { CONVERSATIONS, CV_CHANNELS, CALLS_READ } = data;
  // Each row on screen as a pick reads it, worked out once and kept by the row's id: null for one that wears no box.
  const picks = new Map(rows.map((c) => [c.id, pick.of(c)]));
  const canPick = [...picks.values()].flatMap((x) => x?.id ?? []);
  // One tab stop: the open row's, or the first when none of these is open.
  const tabStopId = selectedRow && rows.some((c) => c.id === selectedRow.id) ? selectedRow.id : rows[0]?.id;
  const onKey = pickKeys({
    rows,
    onOpen: openRow,
    // Space on a row picks it by the name its pick is held under, where it can be picked.
    onToggle: (rowId) => {
      const picked = picks.get(rowId);
      if (picked) pick.toggle(picked.id);
    },
    attr: "data-row-id",
  });
  return (
    <aside className={`cv-list ${pick.selected.length > 0 ? "picking" : ""}`}>
      <div className="cv-list-head">
        {canPick.length > 0 &&
          pickAll({ ids: canPick, selected: pick.selected, onToggle: pick.toggle, onClear: pick.clear })}
        {/* The kit's search, Needs you's and People's capsule (it was People's old desk box, a second look on one page). */}
        <Search
          className="cv-lookup"
          label="Search names, transcripts, messages"
          value={query}
          onChange={setQuery}
          testid="cv-search"
        />
      </div>
      {CALLS_READ === false && (
        <FailedRead
          kind="line"
          what="the calls"
          body="The chats below are current; the phone's rows are missing until it reads."
          surface="conversations"
          testid="cv-calls-failed"
        />
      )}
      <div className="cv-filters">
        <SubTabs
          label="Conversations by channel"
          dense
          value={channel}
          onSelect={(id) => navigate(cvAddress(id, null))}
          tabs={CV_CHANNELS.map((ch) => ({
            id: ch.id,
            label: ch.label,
            count: counts[ch.id],
            testid: `cv-tab-${ch.id}`,
          }))}
        />
      </div>
      {pick.bar && <div className="ix-list-head">{pick.bar}</div>}
      {pick.ask}
      {/* A listbox while it holds rows, as the Inbox's is; with none, what it says instead is no option of one. */}
      <div
        className="cv-rows"
        ref={swap}
        role={rows.length > 0 ? "listbox" : undefined}
        aria-label={rows.length > 0 ? "Conversations" : undefined}
        aria-multiselectable={rows.length > 0 || undefined}
      >
        {rows.map((c, i) => {
          const picked = picks.get(c.id) ?? null;
          return (
            <CvRow
              key={c.id}
              c={c}
              active={selectedRow?.id === c.id}
              onSelect={openRow}
              pick={picked && { picked: pick.selected.includes(picked.id), onToggle: () => pick.toggle(picked.id) }}
              tabStop={c.id === tabStopId}
              onKey={(e) => onKey(e, i)}
            />
          );
        })}
        {rows.length === 0 &&
          (CONVERSATIONS.length === 0 ? (
            // A workspace with none yet is not a filter with no match. On a phone the list is the screen and no reading pane
            // stands beside it, so it says what that pane says, as the Inbox says it has nothing: centred, with its glyph.
            cvOnPhone() ? (
              noneYet("cv-none")
            ) : (
              <EmptyState
                kind="line"
                className="empty-center"
                title="No conversations yet."
                body="They show up here as customers write and call."
                testid="cv-none"
              />
            )
          ) : (
            <EmptyState
              kind="line"
              className="empty-center"
              title={`No conversations match${query.trim() ? ` “${query.trim()}”` : " this channel"}.`}
              body="Search spans names, transcripts and messages."
              action={query.trim() ? { label: "Clear search", onClick: () => setQuery("") } : null}
            />
          ))}
      </div>
    </aside>
  );
}

/** The row open: its thread, the call alone, or where it is answered. */
function openedRow(p: { selected: ConversationRow; closeRow: () => void; flash: (flash: Flash) => void }) {
  const { selected, closeRow, flash } = p;
  const opens = cvOpens(selected);
  if (opens === "thread") {
    return (
      <ThreadPane
        key={selected.id}
        threadId={selected.threadId}
        focusMessageId={selected.callId ? selected.messageId : null}
        onBack={closeRow}
        onOpenClient={(id) => navigate(ROUTES.client(String(id)))}
        // One stack of toasts on the page: the thread's own acts and the pick's say theirs in it.
        flash={flash}
      />
    );
  }
  if (opens === "call") return <CallPane key={selected.id} c={selected} onBack={closeRow} />;
  return (
    <EmptyState
      kind="page"
      glyph="inbox"
      title="This conversation is answered in the Inbox"
      body="Its thread is there, with the reply box and everything it needs from you."
      action={{
        label: "Open it in the Inbox",
        to: selected.threadId ? ROUTES.thread(selected.threadId) : "inbox",
      }}
      testid="cv-in-inbox"
    />
  );
}

/** The reading pane: a link's notice, the row open, or what there is when nothing is. */
/** A workspace with no conversation yet: the reading pane's page on a desk, and the list's on a phone. */
function noneYet(testid: string) {
  return (
    <EmptyState
      kind="page"
      glyph="chat"
      title="Nothing to read yet"
      body="Every WhatsApp chat and phone call with a customer lands here, with what was said."
      action={{ label: "Finish setting up", to: "start" }}
      testid={testid}
    />
  );
}

function readingPane(p: {
  data: ConversationsSurface;
  requestedMissing: boolean;
  opening: boolean;
  selected: ConversationRow | undefined;
  closeRow: () => void;
  query: string;
  flash: (flash: Flash) => void;
}) {
  const { data, requestedMissing, opening, selected, closeRow, query, flash } = p;
  const { CONVERSATIONS } = data;
  // A link's notice sits in the reading pane: as a child of this
  // two-column grid it took the second cell and pushed the pane under
  // the list.
  if (requestedMissing && opening) {
    // The record the link names is being read by its id (use-named-record.ts): on its way, and nobody else's opens in its place.
    return (
      <EmptyState
        kind="page"
        glyph="chat"
        title="Opening this conversation…"
        body="It shows here as soon as it has been read."
        testid="cv-opening-thread"
      />
    );
  }
  if (requestedMissing) {
    // A link to a conversation not in view: said where it would have opened, and nobody else's opened in its
    // place. The first row used to open beside the notice -- read-only then; with the one thread it would be
    // another customer's reply box. The Inbox already says it this way.
    return (
      <EmptyState
        kind="page"
        glyph="chat"
        title="That conversation isn't among the newest shown here"
        body={`Conversations shows the newest ${CONVERSATIONS.length}. Open the person in People to find this one — no other conversation opens in its place.`}
        action={{ label: "Open People", to: "clients" }}
        testid="cv-missing-thread"
      />
    );
  }
  if (selected) return openedRow({ selected, closeRow, flash });
  if (CONVERSATIONS.length === 0) return noneYet("cv-none-pane");
  return (
    <EmptyState
      kind="page"
      glyph="search"
      title={query.trim() ? "Nothing matches your search" : "Nothing on this channel yet"}
      body={query.trim() ? "Clear the search to see every conversation." : "Choose All to see every conversation."}
    />
  );
}

export const ConversationsPage = ({
  channel = "all",
  initialId = null,
  opening = false,
}: {
  channel?: string;
  initialId?: string | null;
  /** The row the link names is being read by its id (use-named-record.ts): say it is on its way, never that it is not here. */
  opening?: boolean;
}) => {
  const data = conversationsData();
  const { CONVERSATIONS, CV_CHANNELS } = data;
  // The box's words, per tab: typed here this visit, else what the tab kept. The page is one mount across its tabs
  // (its route row's `mount`, app-routes.jsx), so a tab pressed reads its own words at once, with no draw in between.
  const [typed, setTyped] = useState<Record<string, string>>({});
  const query = typed[channel] !== undefined ? typed[channel] : cvKept(channel);
  const setQuery = (v: string) => {
    setTyped((t) => ({ ...t, [channel]: v }));
    cvKeepPlace(channel, { q: v });
  };
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const swap = useSwapMotion(channel);
  // Phone: the list and the viewer take turns (mobile.css owns the breakpoint).
  const [phoneOpen, setPhoneOpen] = useState(!!initialId);
  // A decision is drawn at once (a row's pill), before any read: a draw, and nothing it is kept on. A call's end is a row of
  // the live feed, which the read above draws again.
  const [, setTick] = useState(0);
  // Its own rows, and where a call opens depends on the threads the Inbox read (cvOpens): drawn again when either lands.
  useSurface("conversations");
  useSurface("inbox");
  const { openRow, closeRow } = useCvAddress(channel, setSelectedId, setPhoneOpen);

  // Deep-link follows later navigations; decisions flip pills live. An address naming no row is the list: Back from a
  // row on a phone lands here, and the viewer closes.
  useEffect(() => {
    if (initialId) {
      setSelectedId(initialId);
      setPhoneOpen(true);
    } else setPhoneOpen(false);
  }, [initialId]);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    // A decision on a seeded thread is the demo's (IX_STORE sends this and nothing else does): a real workspace's decisions
    // are the server's, and its rows are drawn again when they are read.
    if (demoSession()) window.addEventListener("inbox:decisions", bump);
    // The reading pane is drawn only where it is on the screen (cvOnPhone, below): a phone turned sideways crosses the
    // breakpoint, and the pane it had no need of is drawn then.
    const phone = window.matchMedia ? window.matchMedia("(max-width: 720px)") : null;
    if (phone && phone.addEventListener) phone.addEventListener("change", bump);
    return () => {
      window.removeEventListener("inbox:decisions", bump);
      if (phone && phone.removeEventListener) phone.removeEventListener("change", bump);
    };
  }, []);

  const matchesChannel = (c: ConversationRow) => inChannel(c, channel);

  // Kept on the rows themselves: each read publishes new ones. Kept on a counter only a decision moved, the list and the
  // tabs' counts were the first read's for as long as the page was open (5 Oct 2026), and so was a call open beside them.
  // One row per person (cvOnePerPerson), folded from what the tab and the search kept.
  const visible = useMemo(() => {
    let list = CONVERSATIONS.filter((c) => inChannel(c, channel));
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (c) =>
          c.who.toLowerCase().includes(q) ||
          c.snippet.toLowerCase().includes(q) ||
          (c.summary && (c.summary.headline + " " + c.summary.bullets.join(" ")).toLowerCase().includes(q)) ||
          (c.transcript || []).some((l) => l.text.toLowerCase().includes(q)) ||
          (c.messages || []).some((m) => m.text.toLowerCase().includes(q)),
      );
    }
    return cvOnePerPerson(list);
  }, [CONVERSATIONS, channel, query]);

  // The conversation asked for stays open while the box's words hide its row (the Inbox keeps a moved thread the same
  // way): the pane fell to the first match, another customer's thread with its reply box, the moment a search stopped
  // matching the one open. Nothing asked for, or a tab's new list: its first row.
  // The id asked for may be any row a person's row stands for (a link to one call): it opens there, in its person's row.
  const asked = selectedId ? CONVERSATIONS.find((c) => c.id === selectedId && matchesChannel(c)) || null : null;
  const found = cvFind(visible, selectedId);
  const selected = found ? found.part : asked || visible[0];
  const selectedRow = found ? found.row : asked ? undefined : visible[0];
  // A deep link to a conversation that is not here must not open someone
  // else's transcript in silence: the first row still shows, with a notice.
  const requestedMissing = !!initialId && selectedId === initialId && visible.length > 0 && !asked;
  // A tab pressed is a new list, opened on its first row.
  useEffect(
    () => {
      if (!initialId) setSelectedId(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kept as the JSX drew it: keyed on the tab alone, so a new address does not clear the row
    [channel],
  );

  // The row on screen is read (surfaces/seen.ts): beside the list on a desk, and on a phone while it is the screen. A
  // link's notice is nobody's row. A row pressed is read too, the one already open among them: one put back as unread
  // stays so until it is opened again. And a row opened or put back, here or in the Inbox, draws the list again.
  const onScreen = selected && !requestedMissing && (!cvOnPhone() || phoneOpen) ? (selectedRow ?? selected) : null;
  useSeeOpen(onScreen ? cvWhoseRow(onScreen) : null, onScreen ? cvSeenOf(onScreen) : undefined);
  useSeen();
  const openByHand = (id: string) => {
    const hit = cvFind(visible, id);
    if (hit && cvUnread(hit.row)) seePerson(cvWhoseRow(hit.row), cvSeenOf(hit.row));
    openRow(id);
  };

  // Counted from the tabs THIS workspace has, by the same rule that filters
  // them: a tab that is drawn always carries the number of rows it will show.
  const counts = useMemo(
    () =>
      Object.fromEntries(
        CV_CHANNELS.map((t) => [t.id, cvOnePerPerson(CONVERSATIONS.filter((c) => inChannel(c, t.id))).length]),
      ),
    [CONVERSATIONS, CV_CHANNELS],
  );
  // The tab's people, whole: who a pick is held against, whatever the box's words show of them.
  const everyone = useMemo(
    () => cvOnePerPerson(CONVERSATIONS.filter((c) => inChannel(c, channel))),
    [CONVERSATIONS, channel],
  );
  const [toastNode, flash] = useToast();
  const pick = useCvPick({ everyone, channel, unread: cvUnread, flash });
  return (
    <div className="conversations" data-takeover={phoneOpen || undefined}>
      {listPane({
        data,
        rows: visible,
        query,
        setQuery,
        channel,
        counts,
        selectedRow,
        openRow: openByHand,
        swap,
        pick,
      })}
      {/* On a phone the reading pane is hidden until a row is opened (mobile.css), and it was mounted all the same, keyed
          by the first row: every channel pressed drew that person's whole thread again behind the list, 44 call cards
          in a workspace of one person's 44 calls, and the phone froze (8 Oct 2026). Nothing is drawn there until a tap
          opens a row; a link's notice comes with its row open. */}
      {cvOnPhone() && !phoneOpen
        ? null
        : readingPane({ data, requestedMissing, opening, selected, closeRow, query, flash })}
      {toastNode}
    </div>
  );
};
