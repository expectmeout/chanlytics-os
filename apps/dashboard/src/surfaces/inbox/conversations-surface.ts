/**
 * Slice 1: the Conversations surface flips to real data (moved from legacy-bridge/surfaces/conversations.ts, decision
 * 0015). Fetch → map through the contracts viewmodel → publish the surface's value → dispatch its refresh event.
 * Siblings keep their seeds. Realtime message inserts re-run this apply (debounced in the bridge).
 *
 * Also the tab strip Conversations draws, one tab per wire. Part of the SurfaceData seam (legacy-bridge/surface-data.ts);
 * the page reads what it publishes through `useSurface("conversations")`.
 */
import { read } from "@/legacy-bridge/api";
import { workspaceZone } from "@/legacy-bridge/zone";
import type { SurfaceOverride } from "@/legacy-bridge/surface-data";
import { toConversationVM, toCallVM } from "@chanlytics/contracts";
import { declareSurfaceValue, setSurfaceValue } from "../surface-values";
import type { ConversationRow } from "./types";

// The pages that have not moved (a person's profile, Ask) still read this under its old name.
declareSurfaceValue("conversations", "CONVERSATIONS_DATA");

/**
 * The written wires a conversation can be on, in the words the page already
 * uses for them (contracts THREAD_CHANNEL_WORDS), in a fixed order.
 */
const WRITTEN_TABS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "Text" },
  { id: "email", label: "Email" },
] as const;

/**
 * The tab strip Conversations draws: All, the calls when there are any, and
 * ONE TAB PER WIRE this workspace actually has threads on.
 *
 * It was a single tab labelled "WhatsApp" matching WhatsApp, SMS and Instagram
 * alike, so a text already sat under a tab naming the wrong app -- and email
 * matched no tab at all (the page filtered on the mockup's "mail" while the
 * view model says "email"), so an email conversation was reachable only under
 * All. A workspace with nothing but WhatsApp sees exactly the strip it saw.
 *
 * The order is fixed rather than first-seen, so the strip does not rearrange
 * itself between two reads of the same workspace.
 */
export function conversationTabs(
  hasCalls: boolean,
  channels: ReadonlyArray<string>,
): Array<{ id: string; label: string }> {
  const present = new Set(channels);
  return [
    { id: "all", label: "All" },
    ...(hasCalls ? [{ id: "phone", label: "Calls" }] : []),
    ...WRITTEN_TABS.filter((t) => present.has(t.id)).map((t) => ({ id: t.id, label: t.label })),
  ];
}

export const conversationsOverride: SurfaceOverride = {
  key: "conversations",
  value: "conversations",
  events: ["surface:conversations"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [data, callsRes, tz] = await Promise.all([
      read("GET conversations"),
      read("GET calls").catch((e: unknown) => e as Error),
      workspaceZone(),
    ]);
    // Calls get their OWN rows: a thread answers "am I on the hook to reply",
    // a call answers "is my AI saying the right things on the phone" — the
    // second is a transcript plus audio that cannot live in a chat bubble.
    // The call row carries no decision affordance; the Inbox owns "needs you".
    let callRows: ConversationRow[] = [];
    try {
      if (callsRes instanceof Error) throw callsRes;
      callRows = callsRes.calls.map((c) => toCallVM(c, tz));
    } catch (e) {
      console.error("calls_fetch_failed", e instanceof Error ? e.message : e);
    }
    // A customer who has only ever phoned is fully represented by their call
    // rows; a chat row for them would preview a call that is already on screen.
    const threads = data.conversations.map((c) => toConversationVM(c, tz)).filter((t) => t.hasChat);
    // Newest first by REAL timestamp. The previous sort localeCompare'd the
    // display strings ("Aug 26" vs "3:22 AM"), which is not an ordering at all
    // — a message sent this morning listed below yesterday's calls.
    const merged: ConversationRow[] = [...threads, ...callRows].sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    setSurfaceValue("conversations", {
      CONVERSATIONS: merged,
      // A calls read that failed is its own state: the page says so instead
      // of listing no calls (the audit's D9 family).
      CALLS_READ: !(callsRes instanceof Error),
      CV_CHANNELS: conversationTabs(
        callRows.length > 0,
        threads.map((t) => t.channel),
      ),
    });
  },
};
