/**
 * The Inbox's override: the open escalations and the threads that need a person,
 * bucketed as the page draws them, and the approved templates a reply can use.
 * Part of the SurfaceData seam (../surface-data.ts); its sibling surfaces are the
 * other modules in this folder.
 */

import { read } from "../api";
import { workspaceZone } from "../zone";
import { toInboxThreadVM, type ConversationDto, type EscalationDto } from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";

/**
 * Slice 2: the Inbox flips to the real escalations queue. Open escalations +
 * needs_human conversations land in the "escalated" bucket (the mockup's
 * built-in take-over/hand-back UX), snoozed in "snoozed", the rest in "done".
 * Approval cards/confidence/$ stay hidden — v1.1 material, never fabricated.
 */
interface EscalationRow extends EscalationDto {
  conversation_id: string;
}

/** The only buckets real threads can reach (Blueprint honesty rule). */
const REAL_BUCKETS = [
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

/** One approved template, as the composer needs to know it. */
export interface ApprovedTemplate {
  id: string;
  channel: string;
  name: string;
  language: string;
  body_preview: string | null;
  variables: unknown;
  /**
   * The line under the words, as Meta holds it. The route reads it out of the
   * row's `components` (00045) so the pages get a string rather than Meta's
   * array; null when the template has no footer, or when a row written before
   * the sync kept components has none on file -- `templateFooter` then falls
   * back to the starter library, which knows its own five.
   */
  footer?: string | null;
  /** A text heading above the words; null when there is none, or it is a picture. */
  header?: string | null;
  /** The buttons under the message, as the customer sees them. */
  buttons?: { text: string; kind: "url" | "reply" | "call" }[];
  /**
   * Why this product cannot send it, in the owner's words; null when it can.
   * `sendTemplate` puts one component on the wire -- the body -- so a template
   * needing a value anywhere else is refused BY META for every recipient.
   */
  blocked?: string | null;
}

/** Every template with its status, for Settings; the composer keeps ApprovedTemplate. */
export interface TemplateDto extends ApprovedTemplate {
  category: string | null;
  meta_status: string;
  quality: string | null;
  rejected_reason: string | null;
  synced_at: string | null;
  /** meta: written in WhatsApp Manager. chanlytics: written here. */
  source?: string | null;
  /** Hidden from the composers by the workspace; Settings still lists it. */
  hidden_at?: string | null;
  /** The workspace's own words for it; null means its name, made words. */
  title?: string | null;
}

export const inboxOverride: SurfaceOverride = {
  key: "inbox",
  globals: ["INBOX_DATA", "__TEMPLATES"],
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
    const w0 = window as unknown as { __TEMPLATES?: ApprovedTemplate[] | null };
    if (tplRes instanceof Error) {
      w0.__TEMPLATES = null;
      console.error("templates_fetch_failed", tplRes.message);
    } else {
      w0.__TEMPLATES = (tplRes.templates ?? []).filter((t) => t.channel === "whatsapp");
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
      ? await read("GET conversations", { query: { ids: missing.slice(0, 100).join(",") } }).then(
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
    const w = window as unknown as {
      INBOX_DATA?: Record<string, unknown> & {
        CHANNEL_LABELS?: Record<string, string>;
        INBOX_BASELINE?: Record<string, unknown>;
      };
    };
    const prev = w.INBOX_DATA ?? {};
    w.INBOX_DATA = {
      ...prev,
      THREADS: threads,
      INBOX_BUCKETS: REAL_BUCKETS,
      INBOX_VIEWS: [], // saved views are all structurally zero on real data
      CHANNEL_LABELS: {
        ...(prev.CHANNEL_LABELS ?? {}),
        whatsapp: "WhatsApp",
        phone: "Phone",
        sms: "Text",
        email: "Email",
      },
      INBOX_BASELINE: { ...(prev.INBOX_BASELINE ?? {}), doneThisWeek: 0 },
      UNREAD_ESCALATED: unreadEscalated,
    };
  },
};
