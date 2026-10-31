/**
 * The Inbox's override: the open escalations and the threads that need a person, bucketed as the page draws them, and the
 * approved templates a reply can use, which are the settings read's, the one read of the templates (moved from
 * legacy-bridge/surfaces/inbox.ts, decision 0015). Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the page
 * reads what it publishes through `useSurface("inbox")`.
 */
import { api, read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { LEFT_THE_QUEUE, deliveryTicksOnly } from "@/legacy-bridge/surface-realtime";
import type { Output } from "@/client/api";
import { declareReads, routeGateOpen, routePartsOf } from "@/legacy-bridge/surface-registry";
import { firstDrawWaitsFor, surfaceSettles } from "@/legacy-bridge/surface-status";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import {
  heldThreadIds,
  inboxThreadClock,
  OPEN_HOLDS_READ_MAX,
  waitsOnAPerson,
  type ConversationDto,
  type EscalationDto,
} from "@chanlytics/contracts";
import { followSettings, heldBackOf, offeredWhatsApp } from "../offered-templates";
import { carriedReading, carriesMark } from "../seen-carry";
import {
  declareSurfaceValue,
  revivesFromCache,
  setSurfaceValue,
  shareUnchanged,
  surfaceValue,
} from "../surface-values";
import { waitingRunsNow } from "../needs-you";
import { peopleHold, threadPersonSaid } from "../people/want-person";
import { namedByRoute } from "./address";
import { ixPlace } from "./place";
import { ixOnPhone, ixOpeningThread } from "./rules";
import { inboxThreadsOf, readHeldThreads, readThreadWhole, revivedThread } from "./read-apart";
import { inboxData, REAL_BUCKETS, REAL_CHANNEL_LABELS } from "./store";
import type { Thread } from "./types";

// The pages that have not moved (the sidebar, the bell, Ask, Today) still read this under its old name.
declareSurfaceValue("inbox", "INBOX_DATA");

// A refresh paints the Inbox from the tab's cache before anything is read (legacy-bridge/surface-cache.ts): each real
// thread's times are said again by the clock that paints them, from the moments it keeps, in the zone the read said them
// in (contracts inboxThreadClock). The cache's words were the read's: "9:00 AM" on yesterday's thread and "waiting 2h" on a
// wait of 22, until the next read landed a beat later and moved the rows (Ruben, 21 Oct 2026). A snapshot that keeps no
// zone is painted as it was kept, since a zone guessed would move them the other way. A thread read whole before the
// refresh is partial again, as the first read will make it (read-apart.ts revivedThread).
revivesFromCache("inbox", (held) => {
  const zone = held.zone;
  const now = Date.now();
  return {
    ...held,
    THREADS: held.THREADS.map((t) => {
      const revived = revivedThread(t);
      return revived.real && zone ? { ...revived, ...inboxThreadClock(revived, zone, now) } : revived;
    }),
  };
});

/**
 * Slice 2: the Inbox flips to the real escalations queue. Open escalations + needs_human conversations land in the
 * "escalated" bucket (the mockup's built-in take-over/hand-back UX), snoozed in "snoozed", the rest in "done".
 * Approval cards/confidence/$ stay hidden — v1.1 material, never fabricated.
 */
interface EscalationRow extends EscalationDto {
  conversation_id: string;
}

/**
 * The approved templates a reply can use are the settings read's (offered-templates.ts), not a read of the Inbox's own. It
 * read GET templates on every message, receipt and flag the feed brought, then kept the answer for five minutes so that it
 * would not (the 2 Oct 2026 audit, B12), and an approval Meta made came to the reply box when the five minutes were out. The
 * settings read is the one read of them, told of a template's change by the feed (templates, 0047) and by this tab's own writes
 * (refresh-map.ts), so the Inbox keeps no copy of its own and is made of it again each time it is published.
 */
followSettings("inbox", (held, settings) => {
  const templates = shareUnchanged(held.templates, offeredWhatsApp(settings));
  const templatesHeld = shareUnchanged(held.templatesHeld, heldBackOf(settings));
  return templates === held.templates && templatesHeld === held.templatesHeld
    ? held
    : { ...held, templates, templatesHeld };
});

/** The open holds as the last read answered them: what a read the receipts alone asked for keeps (S10-2). */
let lastHolds: Output<"GET escalations"> | null = null;

/** Whether the opening thread's waits were said: once a tab (openingThreadWaits). */
let openingSaid = false;

/**
 * What the thread the Inbox's first draw opens on waits for beside the threads (surface-status firstDrawWaitsFor, held no
 * longer than the route's wait), said by the Inbox's own read the first time it lands, before it is published, so the gate
 * opens on the thread whole: who they are (their own read, or People's book: people/want-person.ts), and its reply box's
 * reads, the settings read's templates and the drafts Ask kept. Each landed after the thread on a cold load: the box 0.3 to
 * 1.5 s after it, pushing the conversation 145 to 162 px up, the head's deal and visit chips with People's book (the Inbox
 * load review, 28 Oct 2026). A thread's, not the page's: a phone opens on its list alone, which draws none of it and waits for
 * none of it. Only where the tab opened on the Inbox with a thread beside its list: the one its address names, else on a desk
 * the first of the bucket it opens on (rules.ts ixOpeningThread). And only while the gate is shut: a page the tab's cache drew
 * before this read landed is drawn already, and a wait said now would shut its gate again over it.
 */
function openingThreadWaits(threads: Thread[]): void {
  if (openingSaid) return;
  openingSaid = true;
  if (typeof window === "undefined" || typeof window.location?.pathname !== "string") return;
  const { page, param } = routePartsOf(routeOnScreen());
  if (page !== "inbox") return;
  // The address's thread (`th-<conversation>`), or none: an address naming something else (To send, a new conversation)
  // opens on what the page works out, which this does not guess.
  const named = param && /^th-[^/]+$/.test(param) ? param : null;
  if ((param && !named) || (!named && ixOnPhone()) || routeGateOpen(page, param)) return;
  const thread = ixOpeningThread(threads, named, { had: ixPlace().bucket, runsWaiting: waitingRunsNow().length > 0 });
  if (!thread || !thread.real) return;
  firstDrawWaitsFor("inbox", surfaceSettles("settings"));
  firstDrawWaitsFor("inbox", surfaceSettles("reply_drafts"));
  if (thread.clientId && !peopleHold(thread.clientId))
    firstDrawWaitsFor("inbox", threadPersonSaid(thread.conversationId, thread.clientId));
  // And its conversation, where the read holds only its newest (read-apart.ts).
  if (thread.partial) firstDrawWaitsFor("inbox", readThreadWhole(thread.conversationId));
}

export const inboxOverride: SurfaceOverride = {
  key: "inbox",
  value: "inbox",
  // The badge, the tab, the title and the phone count from the threads this publishes (needs-you.ts): nothing is sent for them.
  events: ["surface:inbox"],
  refreshOnMessageInserts: true,
  // A send's ticks, and a failure written late, repaint the thread without a reload (00327): a message's update, by the
  // status it leaves the row in. Not an inbound row's meta stamped after its arrival.
  refreshOnMessageStatuses: LEFT_THE_QUEUE,
  // And the one record a thread head draws that no message moves (0047): the person (contacts: a teammate's rename, their
  // address, a yes or a stop, a merge). A few a day, so heard on every page, as the messages are. The templates the composer
  // offers are the settings read's, which hears them (offered-templates.ts).
  ...declareReads("inbox", { reads: ["conversation", "hold", "person"], fresh: "live" }),
  apply: async (heard) => {
    // When this read was ASKED, or the oldest read it may share (a head's prefetch, one in flight: api sharesFrom): the bell
    // judges a hold's kept notice only by a read that began after it was kept (a hold kept while the read was in flight
    // would otherwise be judged by a read that never saw it), on the servers' clock (notifications.ts whatWaits).
    const readAt = api().sharesFrom();
    // A delivery's receipts move the threads' ticks alone: the holds are the last read's (deliveryTicksOnly, S10-2).
    const holdsHeld = deliveryTicksOnly(heard) ? lastHolds : null;
    const [convData, escData, tz] = await Promise.all([
      read("GET conversations"),
      holdsHeld ?? read("GET escalations", { query: { state: "open" } }),
      // Every time on a thread is said by the business's clock (zone.ts).
      workspaceZone(),
    ]);
    lastHolds = escData;
    const byConv = new Map<string, EscalationRow>();
    for (const e of escData.escalations) byConv.set(e.conversation_id, e);

    // A thread that escalated but has since gone quiet can fall outside the
    // newest-100 conversations page — fetch those by id rather than letting a
    // waiting customer be invisible: the holds that wait on a person first, one
    // rule with Today's read (contracts heldThreadIds), so the two are one read.
    const listed = new Set(convData.conversations.map((c) => c.id));
    const missing = heldThreadIds(listed, escData.escalations);
    // The thread the address names (a bell row from last week, an Activity line, a person's "Open the thread", an Ask citation,
    // a tapped push) is read by its id when neither the newest hundred nor the waiting hold it: a link is a read of one record,
    // never a look in the window the page holds (finding A2c). The workspace scopes the read, so another's thread answers
    // nothing and the page still says it is not here, and no other thread opens in its place.
    const wanted = typeof window !== "undefined" && window.location ? namedByRoute(routeOnScreen()).chat : null;
    const askedByAddress = wanted !== null && !listed.has(wanted) && !missing.includes(wanted) ? wanted : null;
    // One read for all of them, by id: one read per thread, the first twenty only, left the twenty-first waiting
    // customer out of the Inbox with nothing said (I5). The escalations read holds a hundred at most.
    const [extraRead, byAddress] = await Promise.all([
      readHeldThreads(missing),
      // One that cannot be read is no waiting customer: the page says the thread is not here, as it did.
      askedByAddress
        ? read("GET conversations", { query: { ids: askedByAddress } }).then(
            (d): ConversationDto[] => d.conversations,
            (): ConversationDto[] => [],
          )
        : Promise.resolve<ConversationDto[]>([]),
    ]);
    const extra = extraRead ?? [];
    // One that could not be read is a waiting customer nobody can see: the
    // list says how many, rather than listing fewer.
    const unreadEscalated = missing.length - extra.length;
    if (unreadEscalated) console.error("inbox_escalated_fetch_failed", unreadEscalated);
    // Of those, the holds that wait on a person, and any past the read's hundred: each a customer who may be waiting,
    // which the badge counts (a customer's STOP is not one).
    const readIds = new Set(extra.map((c) => c.id));
    const unreadHolds = new Set(
      escData.escalations
        .filter((e) => e.state === "open" && waitsOnAPerson(e.reason) && !listed.has(e.conversation_id))
        .map((e) => e.conversation_id)
        .filter((id) => !readIds.has(id)),
    ).size;
    // Whether every hold that waits on a person was read, threads and all: a bell row about a hold is judged by the
    // threads only then (a hold past the read's hundred would read as no longer waiting).
    const waitingRead = escData.escalations.filter((e) => waitsOnAPerson(e.reason)).length;
    const holdsWhole = waitingRead < OPEN_HOLDS_READ_MAX && unreadHolds === 0;

    // The one a link named stands last, among the oldest, where its own time puts it.
    const all = [...extra, ...convData.conversations, ...byAddress];
    // Each from what the read carries, and a thread opened before from what was kept of it as well (read-apart.ts).
    const threads = inboxThreadsOf(all, (id) => byConv.get(id) ?? null, tz);
    const prev = inboxData();
    // The templates are the settings read's, as it stands now: absent while that is still being read, null where its templates
    // read failed (the composer says it could not read them, with a way to try again; [] is the other answer, none approved),
    // else the ones that may go. The Inbox asks for none, so a templates read that failed cannot blank it.
    const settings = surfaceValue("settings");
    // The thread the first draw opens on waits for what it draws: once a tab, before this is published and the gate opens.
    openingThreadWaits(threads);
    setSurfaceValue("inbox", {
      ...prev,
      // A thread the read gave as it was keeps its object, so its row is not drawn again (shareUnchanged): a new message
      // read the hundred threads again and drew every row for one (the strips review, 18 Oct 2026).
      THREADS: shareUnchanged(prev.THREADS, threads),
      INBOX_BUCKETS: REAL_BUCKETS,
      INBOX_VIEWS: [], // saved views are all structurally zero on real data
      // The wires a real thread travels: the demo's labels are never laid under them (X6-1).
      CHANNEL_LABELS: REAL_CHANNEL_LABELS,
      INBOX_BASELINE: { doneThisWeek: 0 },
      // The zone every time on the threads was said in: a refresh says them again in it (revivesFromCache, above).
      zone: tz,
      UNREAD_ESCALATED: unreadEscalated,
      UNREAD_HOLDS: unreadHolds,
      readAt,
      holdsWhole,
      templates: shareUnchanged(prev.templates, offeredWhatsApp(settings)),
      templatesHeld: shareUnchanged(prev.templatesHeld, heldBackOf(settings)),
    });
  },
};

// The reader's mark on a person, carried into their threads' rows as the door answers it (surfaces/seen.ts carriesMark): the
// rows the next load paints say they are read, or put back, as this tab shows them. A thread that carries the mark, or a
// later one, is the object it was.
carriesMark(inboxOverride, (personId, mark) => {
  const held = surfaceValue("inbox");
  if (!held) return false;
  let moved = false;
  const threads = held.THREADS.map((t) => {
    if (!t.real || t.clientId !== personId) return t;
    const reading = carriedReading(t, mark);
    if (!reading) return t;
    moved = true;
    return { ...t, unread: reading.unseen, markAtMs: reading.markAtMs };
  });
  if (!moved) return false;
  setSurfaceValue("inbox", { ...held, THREADS: threads });
  return true;
});
