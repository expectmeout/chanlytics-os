/**
 * The Inbox's override: the open escalations and the threads that need a person, bucketed as the page draws them, and the
 * approved templates a reply can use, which are the settings read's, the one read of the templates (moved from
 * legacy-bridge/surfaces/inbox.ts, decision 0015). Part of the SurfaceData seam (legacy-bridge/surface-data.ts); the page
 * reads what it publishes through `useSurface("inbox")`.
 */
import { read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import { LEFT_THE_QUEUE } from "@/legacy-bridge/surface-realtime";
import { declareReads } from "@/legacy-bridge/surface-registry";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { routeOnScreen } from "@/legacy-bridge/workspace";
import { toInboxThreadVM, type ConversationDto, type EscalationDto } from "@chanlytics/contracts";
import { followSettings, heldBackOf, offeredWhatsApp } from "../offered-templates";
import { declareSurfaceValue, setSurfaceValue, shareUnchanged, surfaceValue } from "../surface-values";
import { namedByRoute } from "./address";
import { inboxData } from "./store";
import type { InboxBucket } from "./types";

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

/** The only buckets real threads can reach (Blueprint honesty rule). */
const REAL_BUCKETS: InboxBucket[] = [
  {
    id: "escalated",
    label: "Needs you",
    hint: "The receptionist stopped and asked for a human",
    icon: "flag",
    accent: true,
  },
  {
    id: "done",
    label: "Handled",
    hint: "Answered by the receptionist, or a teammate has it — nothing for you to do",
    icon: "check",
  },
  { id: "snoozed", label: "Snoozed", hint: "Hidden until they wake", icon: "clock" },
];

/** The most escalations one read by id holds: the escalations read holds a hundred at most. */
const ESCALATIONS_BY_ID = 100;

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
  apply: async () => {
    const [convData, escData, tz] = await Promise.all([
      read("GET conversations"),
      read("GET escalations", { query: { state: "open" } }),
      // Every time on a thread is said by the business's clock (zone.ts).
      workspaceZone(),
    ]);
    const byConv = new Map<string, EscalationRow>();
    for (const e of escData.escalations) byConv.set(e.conversation_id, e);

    // A thread that escalated but has since gone quiet can fall outside the
    // newest-100 conversations page — fetch those individually rather than
    // letting a waiting customer be invisible.
    const listed = new Set(convData.conversations.map((c) => c.id));
    const missing = [...byConv.keys()].filter((id) => !listed.has(id));
    // The thread the address names (a bell row from last week, an Activity line, a person's "Open the thread", an Ask citation,
    // a tapped push) is read by its id when neither the newest hundred nor the waiting hold it: a link is a read of one record,
    // never a look in the window the page holds (finding A2c). The workspace scopes the read, so another's thread answers
    // nothing and the page still says it is not here, and no other thread opens in its place.
    const wanted = typeof window !== "undefined" && window.location ? namedByRoute(routeOnScreen()).chat : null;
    const askedByAddress = wanted !== null && !listed.has(wanted) && !missing.includes(wanted) ? wanted : null;
    // One read for all of them, by id: one read per thread, the first twenty only, left the twenty-first waiting
    // customer out of the Inbox with nothing said (I5). The escalations read holds a hundred at most.
    const [extraRead, byAddress] = await Promise.all([
      missing.length
        ? read("GET conversations", { query: { ids: missing.slice(0, ESCALATIONS_BY_ID).join(",") } }).then(
            (d): ConversationDto[] | null => d.conversations,
            () => null,
          )
        : Promise.resolve<ConversationDto[] | null>([]),
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
      THREADS: threads,
      INBOX_BUCKETS: REAL_BUCKETS,
      INBOX_VIEWS: [], // saved views are all structurally zero on real data
      CHANNEL_LABELS: {
        ...prev.CHANNEL_LABELS,
        whatsapp: "WhatsApp",
        phone: "Phone",
        sms: "Text",
        email: "Email",
      },
      INBOX_BASELINE: { ...prev.INBOX_BASELINE, doneThisWeek: 0 },
      UNREAD_ESCALATED: unreadEscalated,
      templates: shareUnchanged(prev.templates, offeredWhatsApp(settings)),
      templatesHeld: shareUnchanged(prev.templatesHeld, heldBackOf(settings)),
    });
  },
};
