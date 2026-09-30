/**
 * The Playbooks override: each playbook's card, its words and its totals, and
 * the triggers a new one can start from. Part of the SurfaceData seam
 * (../surface-data.ts).
 */

import { read } from "../api";
import {
  PEOPLE_LISTS,
  REPLY_WINDOW_WORDS,
  numberHealth,
  purposeOfTemplate,
  type NumberHealth,
  FOLLOW_UP_NEEDS_DEALS,
  PLAYBOOK_TRIGGERS,
  nextRunLabel,
  scheduleLine,
  triggerOf,
  triggerOffered,
  type PlaybookDto,
} from "@chanlytics/contracts";
import type { SurfaceOverride } from "../surface-data";
import { DEFAULT_REFRESH_TABLES } from "../surface-realtime";
import { onlyOnItsPage } from "../surface-registry";
import type { TemplateDto } from "@/surfaces/inbox/types";

/* ------------------------------- Playbooks ------------------------------- */

export interface PlaybookTotalsVM {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  lastRun: { id: string; state: string; run_for: string | null; recipient_count: number } | null;
  /** A run waiting for a person: the broadcast to approve or skip. */
  waiting: { id: string; recipient_count: number; name: string } | null;
  /** The most recent runs, newest first; the totals above are over every run. */
  history: {
    id: string;
    run_for: string | null;
    state: string;
    scheduled_for: string;
    recipient_count: number;
    sent: number;
    held: number;
    delivered: number;
    replied: number;
  }[];
}

export interface PlaybookCardVM extends PlaybookDto {
  totals: PlaybookTotalsVM;
  /** The trigger's words: "Win-back", "Nothing heard in 30 days". */
  triggerLabel: string;
  triggerHint: string;
  /** "Daily 10:00 · up to 25 · once per person, again after 90 days". */
  schedule: string;
  /** "today 10:00", "tomorrow 10:00" or "paused", by the business's clock. */
  next: string;
  /** How many on the trigger's list a run reaches right now -- a recorded yes and
   *  a number to send to -- clear of the week's breath, before the gap, which
   *  only the run applies; a follow-up's, clear of the proposals already
   *  followed up. Null when the server could not count the moment. */
  candidates: number | null;
  /** How many more it would reach but heard from a broadcast of any kind this week, and wait. Null with `candidates`. */
  held: number | null;
  /** Everyone its moment names, and who of them no run reaches whatever the week: the card's grey. Null when not read. */
  named: PlaybookNamed | null;
  /** Why it runs nothing here, where its moment is not offered (a proposal follow-up where deals are off, 0006). */
  off: string | null;
}

/**
 * Everyone a moment names -- the trigger's list, everyone, or the day's visits --
 * and who of them no run reaches whatever the week: never said yes to what the
 * playbook sends, asked to stop, no number. Counted on the server with the
 * runner's own rules (contracts playbookRunReach), beside `candidates` and `held`.
 */
export interface PlaybookNamed {
  pool: number;
  noYes: number;
  stopped: number;
  noNumber: number;
  /** How many of them said the yes the playbook needs, a number or not: a yes with no number is not no yes. */
  saidYes: number;
}

export interface PlaybookTriggerOption {
  id: string;
  label: string;
  hint: string;
  cls: string;
  list: string | null;
  /** list, cadence, visit, saved or deal — a visit trigger needs the calendar and has no gap; a deal's, once per proposal. */
  kind: string;
  /** Null, with `held` and `named`: the server could not count this moment -- never a zero it did not count. */
  candidates: number | null;
  held: number | null;
  named: PlaybookNamed | null;
}

export interface PlaybooksSurface {
  rows: PlaybookCardVM[];
  timezone: string;
  /** False when the server could not count some moment: the page says so once, over the cards. */
  countsRead: boolean;
  /** Whether a visit trigger can run: the workspace's calendar state. */
  calendar: "ok" | "unavailable" | "none";
  triggers: PlaybookTriggerOption[];
  /**
   * Every list a playbook may run on (decision 0009), each by its token (`seg:<id>` for People's, `list:<id>` for the
   * workspace's own) with its own count: People's first, then the workspace's. Empty when none could be read.
   */
  lists: {
    /** The list's token: what the composer picks and the card links by. */
    id: string;
    name: string;
    smart: boolean;
    /** One of People's lists, not the workspace's own. */
    builtin: boolean;
    candidates: number | null;
    held: number | null;
    named: PlaybookNamed | null;
  }[];
  /** The approved WhatsApp templates, with their variables. */
  /** Null: the templates read failed -- its own state, never "no template yet". */
  templates: TemplateDto[] | null;
  number: { present: boolean; health: NumberHealth };
  businessName: string;
  bookingLink: boolean;
  /** The reply window in words, for the tips that say what a reply is (contracts REPLY_WINDOW_WORDS). */
  replyWindow: string;
  fetchedAt: number;
}

/** Count the whole pool, not one run's cap. */

/**
 * Playbooks: the rows with what their runs earned, the triggers with the
 * count of people a run would pick now and how many wait for the week's
 * breath -- counted on the server over everyone, by the runner's own
 * predicate, so the number on the chip is the number a run starts from --
 * and the approved templates a playbook may send.
 */
export const playbooksOverride: SurfaceOverride = {
  key: "playbooks",
  globals: ["__PLAYBOOKS"],
  events: ["surface:playbooks"],
  refreshOnMessageInserts: true,
  // A message moves a playbook's replies: read again only while its page is on screen, and once when it comes back
  // (surface-registry.ts).
  refreshWhen: onlyOnItsPage("playbooks", DEFAULT_REFRESH_TABLES),
  apply: async () => {
    const [pb, tpl, ch, cfg] = await Promise.all([
      read("GET playbooks"),
      read("GET templates").catch((e: unknown) => e as Error),
      read("GET channels").catch((e: unknown) => e as Error),
      read("GET settings").catch((e: unknown) => e as Error),
    ]);
    const now = new Date();
    // The pools are the route's: who a run would pick NOW, and who waits for
    // the week's breath, over everyone in People with their visits. A moment
    // the route could not count is null here too, never a zero it did not count.
    const pool = (trigger: string) => pb.pools?.[trigger]?.candidates ?? null;
    const held = (trigger: string) => pb.pools?.[trigger]?.held ?? null;
    // And everyone each moment names, with who of them no run reaches whatever the week.
    const named = (trigger: string): PlaybookNamed | null => {
      const x = pb.pools?.[trigger];
      return x && typeof x.pool === "number"
        ? {
            pool: x.pool,
            noYes: x.noYes ?? 0,
            stopped: x.stopped ?? 0,
            noNumber: x.noNumber ?? 0,
            saidYes: x.saidYes ?? 0,
          }
        : null;
    };
    const wa =
      ch instanceof Error
        ? null
        : ((ch.channels ?? []).find((c) => c.kind === "whatsapp" && c.status === "active") ?? null);
    const brain = cfg instanceof Error ? null : (cfg.config?.brain ?? null);
    if (tpl instanceof Error) console.error("playbooks_templates_fetch_failed", tpl.message);
    if (ch instanceof Error) console.error("playbooks_channels_fetch_failed", ch.message);
    const tz = pb.timezone || "America/New_York";
    // A playbook on a list is counted by its list's token (`seg:<id>` or `list:<id>`, decision 0009), and named for it.
    const listsKept = pb.lists ?? [];
    const peopleLists = pb.people_lists ?? [];
    const keyOf = (p: { trigger: string; list_id?: string | null; list_key?: string | null }) =>
      p.trigger !== "saved_list" ? p.trigger : p.list_key ? `seg:${p.list_key}` : `list:${p.list_id ?? ""}`;
    // A built-in is named by contracts when the route's People read failed: it is never deleted. One of the
    // workspace's own is named by the lists read; unread, it is a list that could not be read, never a deleted one.
    const listNameOf = (p: { list_id?: string | null; list_key?: string | null }) =>
      p.list_key
        ? (peopleLists.find((l) => l.key === p.list_key)?.label ??
          PEOPLE_LISTS.find((l) => l.id === p.list_key)?.label ??
          null)
        : (listsKept.find((l) => l.id === p.list_id)?.name ?? null);
    const unnamed = pb.lists === null ? "A list that could not be read" : "A list that was deleted";
    // The moments offered here (0006): a proposal's only where deals are on, as the route counts them.
    const offered = PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t, !!pb.deals_on));
    (window as unknown as { __PLAYBOOKS?: PlaybooksSurface }).__PLAYBOOKS = {
      rows: pb.playbooks.map((p) => {
        const t = triggerOf(p.trigger);
        const onArchived = p.trigger === "saved_list" && !!listsKept.find((l) => l.id === p.list_id)?.archived;
        return {
          ...p,
          // Its list was archived (00169): paused until the list is restored or the playbook moved to another.
          listArchived: onArchived,
          triggerLabel: p.trigger === "saved_list" ? (listNameOf(p) ?? unnamed) : (t?.label ?? p.trigger),
          triggerHint: t?.hint ?? "",
          schedule: scheduleLine(p),
          next: nextRunLabel(p, tz, now),
          candidates: pool(keyOf(p)),
          held: held(keyOf(p)),
          named: named(keyOf(p)),
          // A follow-up made while deals were on runs nothing once they are off: the card says why (0006).
          off: t && !triggerOffered(t, !!pb.deals_on) ? FOLLOW_UP_NEEDS_DEALS : null,
        };
      }),
      timezone: tz,
      countsRead: offered.every((t) => t.kind === "saved" || !!pb.pools?.[t.id]),
      lists: [
        ...peopleLists.map((l) => ({ id: `seg:${l.key}`, name: l.label, smart: true, builtin: true })),
        // An archived list is offered to no new playbook (00169); the ones on it say so on their card.
        ...listsKept
          .filter((l) => !l.archived && !l.viewer)
          .map((l) => ({ id: `list:${l.id}`, name: l.name, smart: l.smart, builtin: false })),
      ].map((l) => ({ ...l, candidates: pool(l.id), held: held(l.id), named: named(l.id) })),
      calendar: pb.calendar ?? "none",
      triggers: offered.map((t) => ({
        id: t.id,
        label: t.label,
        hint: t.hint,
        cls: t.cls,
        list: t.list,
        kind: t.kind,
        candidates: pool(t.id),
        held: held(t.id),
        named: named(t.id),
      })),
      templates:
        tpl instanceof Error
          ? null
          : (tpl.templates ?? [])
              .filter((t) => t.channel === "whatsapp" && t.meta_status === "approved")
              .map((t) => ({ ...t, purpose: purposeOfTemplate(t.category) })),
      number: {
        present: !!wa,
        health: numberHealth({
          quality: wa?.quality ?? null,
          event: wa?.quality_event ?? null,
          limit: wa?.messaging_limit ?? null,
        }),
      },
      businessName: brain?.business_name || "the business",
      bookingLink: !!brain?.booking_link,
      replyWindow: REPLY_WINDOW_WORDS,
      fetchedAt: now.getTime(),
    };
  },
};
