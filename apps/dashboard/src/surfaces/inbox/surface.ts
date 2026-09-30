/**
 * The Inbox's override: the open escalations and the threads that need a person, bucketed as the page draws them, and the
 * approved templates a reply can use (moved from legacy-bridge/surfaces/inbox.ts, decision 0015). Part of the SurfaceData
 * seam (legacy-bridge/surface-data.ts); the page reads what it publishes through `useSurface("inbox")`.
 */
import { read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { toInboxThreadVM, type ConversationDto, type EscalationDto } from "@chanlytics/contracts";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";
import { inboxData } from "./store";
import type { ApprovedTemplate, InboxBucket } from "./types";

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

export const inboxOverride: SurfaceOverride = {
  key: "inbox",
  value: "inbox",
  // inbox:counts is NOT dispatched here — a detail-less event zeroes the
  // sidebar badge; the reseeded Inbox emits the real count itself.
  events: ["surface:inbox"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [convData, escData, tplRes, tz] = await Promise.all([
      read("GET conversations"),
      read("GET escalations", { query: { state: "open" } }),
      // The one send that works outside the 24-hour window. The composer named
      // a template by a hardcoded literal and this endpoint had no caller at
      // all, so a workspace whose approved template is registered under any
      // other name — or which has none yet, which is every new workspace —
      // showed a working-looking button that failed on click with a message
      // the operator could do nothing about.
      //
      // Additive, like calls: a template read that fails must not blank the
      // Inbox. It leaves null -- "could not read" -- which the composer says,
      // with a way to read it again; [] is the other answer, "none approved".
      read("GET templates").catch((e: unknown) => e as Error),
      // Every time on a thread is said by the business's clock (zone.ts).
      workspaceZone(),
    ]);
    let templates: ApprovedTemplate[] | null;
    if (tplRes instanceof Error) {
      templates = null;
      console.error("templates_fetch_failed", tplRes.message);
    } else {
      templates = (tplRes.templates ?? []).filter((t) => t.channel === "whatsapp");
    }
    const byConv = new Map<string, EscalationRow>();
    for (const e of escData.escalations) byConv.set(e.conversation_id, e);

    // A thread that escalated but has since gone quiet can fall outside the
    // newest-100 conversations page — fetch those individually rather than
    // letting a waiting customer be invisible.
    const listed = new Set(convData.conversations.map((c) => c.id));
    const missing = [...byConv.keys()].filter((id) => !listed.has(id));
    // One read for all of them, by id: one read per thread, the first twenty only, left the twenty-first waiting
    // customer out of the Inbox with nothing said (I5). The escalations read holds a hundred at most.
    const extraRead: ConversationDto[] | null = missing.length
      ? await read("GET conversations", { query: { ids: missing.slice(0, ESCALATIONS_BY_ID).join(",") } }).then(
          (d) => d.conversations,
          () => null,
        )
      : [];
    const extra = extraRead ?? [];
    // One that could not be read is a waiting customer nobody can see: the
    // list says how many, rather than listing fewer.
    const unreadEscalated = missing.length - extra.length;
    if (unreadEscalated) console.error("inbox_escalated_fetch_failed", unreadEscalated);

    const all = [...extra, ...convData.conversations];
    const threads = all.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, tz));
    const prev = inboxData();
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
      templates,
    });
  },
};
