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
import { declareReads } from "@/legacy-bridge/surface-registry";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import {
  heldThreadIds,
  OPEN_HOLDS_READ_MAX,
  toInboxThreadVM,
  waitsOnAPerson,
  type ConversationDto,
  type EscalationDto,
} from "@chanlytics/contracts";
import { followSettings, heldBackOf, offeredWhatsApp } from "../offered-templates";
import { carriedReading, carriesMark } from "../seen-carry";
import { declareSurfaceValue, setSurfaceValue, shareUnchanged, surfaceValue } from "../surface-values";
import { namedByRoute } from "./address";
import { readHeldThreads } from "./held-threads";
import { inboxData, REAL_BUCKETS, REAL_CHANNEL_LABELS } from "./store";

// The pages that have not moved (the sidebar, the bell, Ask, Today) still read this under its old name.
declareSurfaceValue("inbox", "INBOX_DATA");

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
    const threads = all.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, tz));
    const prev = inboxData();
    // The templates are the settings read's, as it stands now: absent while that is still being read, null where its templates
    // read failed (the composer says it could not read them, with a way to try again; [] is the other answer, none approved),
    // else the ones that may go. The Inbox asks for none, so a templates read that failed cannot blank it.
    const settings = surfaceValue("settings");
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
