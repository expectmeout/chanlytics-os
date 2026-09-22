import { STARTER_TEMPLATES, templateSentWords, templateUnused, templateUseNote, templateUseWords, type PersonRowDto, type TemplateSentWords } from "@chanlytics/contracts";
import type { PromptPreviewDto } from "../server/prompt-preview";
/**
 * The SurfaceData seam (Blueprint v3.0, Slice 0 exit criterion).
 *
 * Contract: every mockup surface reads seeded window globals by default. A
 * slice flips ONE surface to real data by registering an override that
 * (1) fetches from /api/v1, (2) maps rows into the surface's viewmodel and
 * writes the SAME window globals the surface already reads, (3) dispatches the
 * mockup's own window events so mounted components re-render. Sibling surfaces
 * keep their seeds untouched. Overrides live HERE and in contracts viewmodels —
 * never inside legacy page files (the modularity rule).
 */

import { clearSurfaceCache, resnapshotSurface } from "./surface-cache";
import { ApiError } from "../client/api";
import { api, read } from "./api";
import { getActiveWorkspace, rememberWorkspace, workspaceHref } from "./workspace";
import { knownZone, pageClock, workspaceZone } from "./zone";
import { heldViews } from "./held-views";
export { getActiveWorkspace } from "./workspace";
import { DEFAULT_REFRESH_TABLES, type RealtimeChange } from "./surface-realtime";
import type { NotificationsDto, PendingWorkspace, ResolvedFacts, FactConflict } from "@chanlytics/contracts";
import type { PoliciesSurface } from "./policy-store";

export interface SurfaceOverride {
  /** Surface key, matching the slice that owns it (e.g. "conversations"). */
  key: string;
  /**
   * The window globals this override owns. The runner snapshots them after a
   * successful apply so the next boot can paint real data before first render
   * instead of flashing the mockup's seeds. Declaring them here (rather than
   * hardcoding a list in the cache) keeps flipping a surface a one-file change.
   */
  globals?: string[];
  /** What of its globals the cache holds, when not all of them: given the snapshot, answers the one to keep. */
  trimSnapshot?: (snap: Record<string, unknown>) => Record<string, unknown>;
  /** Fetch real data and write it into the surface's window globals. */
  apply: () => Promise<void>;
  /** Mockup events to dispatch after apply so mounted components re-render. */
  events?: string[];
  /** Re-apply when a realtime message INSERT arrives (the runner owns the one shared subscription). */
  refreshOnMessageInserts?: boolean;
  /** Re-apply on events from THESE tables instead — an explicit list wins
   *  over the flag (see surface-realtime.ts). */
  refreshOnTables?: string[];
  /** A finer rule per event on top of the table list — see surface-realtime. */
  refreshWhen?: (change: RealtimeChange) => boolean;
  /** Debounce for realtime-triggered re-applies (default 400ms). */
  debounceMs?: number;
}


export async function activateOverride(o: SurfaceOverride): Promise<boolean> {
  try {
    await o.apply();
    for (const e of o.events ?? []) window.dispatchEvent(new CustomEvent(e));
    return true;
  } catch (err) {
    if (err instanceof ApiError && err.code === "unauthorized") throw err;
    // A failed override NEVER breaks the surface — it just stays seeded.
    console.error("surface_override_failed", o.key, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * First consumer: the real workspace (RLS-scoped tenants via /api/v1/workspaces).
 * Stashes the result for the bridge pill; Slice 1's conversations override
 * follows this exact fetch→map→dispatch pattern against CONVERSATIONS_DATA.
 */
export interface Workspace { id: string; slug: string; name: string; status: string; timezone: string }

export interface Me {
  id: string;
  email: string | null;
  role?: "owner" | "operator" | "viewer" | null;
  display_name?: string | null;
  /** Whether the Chanlytics back office exists for this person. Never the authorization -- every platform route asks the database. */
  platform_admin?: boolean;
}

export const workspaceOverride: SurfaceOverride & { current: () => Workspace | null } = {
  key: "workspace",
  globals: ["__WORKSPACES", "__ME", "__ACTIVE_WORKSPACE", "__PENDING_WORKSPACE", "__SIGNUP_POSTURE"],
  // The workspace actually being VIEWED, as resolved by the server — not
  // `[0]`, which was whichever tenant happened to sort first and could differ
  // from the one the data below it came from.
  current: () => {
    const w = window as unknown as { __WORKSPACES?: Workspace[]; __ACTIVE_WORKSPACE?: string };
    return w.__WORKSPACES?.find((t) => t.id === w.__ACTIVE_WORKSPACE) ?? null;
  },
  apply: async () => {
    const data = await read("GET workspaces");
    const w = window as unknown as {
      __WORKSPACES?: Workspace[];
      __ME?: Me;
      __ACTIVE_WORKSPACE?: string;
      __PENDING_WORKSPACE?: PendingWorkspace | null;
      __SIGNUP_POSTURE?: "open" | "waitlist" | "invite";
    };
    w.__WORKSPACES = data.workspaces;
    w.__PENDING_WORKSPACE = "pending" in data ? data.pending ?? null : null;
    // The door a first workspace meets (the invite code, or the list), from the
    // same read: the create screen asks nothing of its own.
    w.__SIGNUP_POSTURE = "posture" in data ? data.posture ?? "open" : "open";
    // The server had the last word on which workspace this is — it validated
    // membership and may have overridden a stale stored preference. Record what
    // it decided, so every later request agrees with the data already rendered.
    if (data.activeWorkspaceId) {
      w.__ACTIVE_WORKSPACE = data.activeWorkspaceId;
      const active = data.workspaces.find((t) => t.id === data.activeWorkspaceId);
      const slug = active?.slug ?? data.activeWorkspaceId;
      rememberWorkspace(slug);
      // The address says what the server decided. A path that names a
      // workspace this account may not use here (a membership gone, another
      // account's preference), or names it by id where the slug belongs, is
      // corrected before the other surfaces paint under it: a navigation, so
      // everything boots again under the right name.
      const here = getActiveWorkspace();
      if (here && here !== slug) {
        clearSurfaceCache();
        window.location.replace(workspaceHref(slug, window.location.hash));
        return;
      }
    }
    // The sidebar renders whoever this says — replacing the mockup's
    // hardcoded operator, who was a fabricated person shown as "you".
    if (data.user) w.__ME = data.user;
  },
};

/**
 * Switch workspace: forget the previous one's rows, then go to its address.
 *
 * A navigation rather than a refetch, deliberately. The mockup seeds React
 * state from globals at mount, so the surfaces would need bespoke re-seeding to
 * swap tenant underneath them — and getting that wrong shows one business's
 * threads under another's name, which is the single worst thing this app can
 * do. Clearing the cache first is what makes the reload cold.
 *
 * `knownSlug` when the caller has it and the page's own list may not. A
 * workspace created a moment ago is not in __WORKSPACES yet; addressed by its
 * id, the app booted twice -- under the id, then again when the workspaces
 * read corrected the address -- and Setup's once-a-session landing could fire
 * on the first boot and be lost with it (the nightly's workspace-create spec,
 * 13 Sep 2026).
 */
export function switchWorkspace(id: string, knownSlug?: string): void {
  const target = (window as unknown as { __WORKSPACES?: Workspace[] }).__WORKSPACES?.find((t) => t.id === id);
  const slug = target?.slug ?? knownSlug ?? id;
  const here = getActiveWorkspace();
  if (here === slug || here === id) return;
  clearSurfaceCache();
  rememberWorkspace(slug);
  window.location.assign(workspaceHref(slug));
}

/**
 * Slice 1: the Conversations surface flips to real data. Fetch → map through
 * the contracts viewmodel → swap the SAME global the surface reads → dispatch
 * its refresh event. Siblings keep their seeds. Realtime message inserts
 * re-run this apply (debounced in the bridge).
 */
import {
  toConversationVM,
  toInboxThreadVM,
  toCallVM,
  toLiveVM,
  type LiveVM,
  threadStanding,
  toTodayVM,
  type ConversationDto,
  type EscalationDto,
  type CallDto,
  type TodayVM,
  toPersonRowVM,
  peopleAggregates,
  PEOPLE_LISTS,
  PEOPLE_LIST_GROUPS,
  peopleListAction,
  savedListAction,
  type PersonRowVM,
  type PeopleAggregates,
  attentionRow,
  type AttentionRowVM,
  toChannelVM,
  type ChannelVM,
  toReportVM,
  reportFacts,
  type ReportFactVM,
  REPORT_RANGES,
  type ReportVM,
  toCampaignReportVM,
  type CampaignReportVM,
  toCalendarVM,
  windowFor,
  zoneDayKey,
  toBookingReportVM,
  type BookingReportVM,
  type CalendarVM,
} from "@chanlytics/contracts";
import { BROADCAST_CHUNK, BROADCAST_SCHEDULE_MAX_DAYS, EVERYONE_LABEL, GET_YES_ROUTE, HELD_REASONS, OFFERS_BY_WHATSAPP_NOTE, REPLY_WINDOW_WORDS, OFFERS_OPT_IN_PHRASES, audiencePreview, formatPhoneDisplay, numberHealth, optInLink, toBroadcastVM, purposeOfTemplate, type AudienceKind, type AudiencePreview, type BroadcastVM, type NumberHealth, type SendPurpose } from "@chanlytics/contracts";
import { PLAYBOOK_TRIGGERS, nextRunLabel, scheduleLine, triggerOf, type PlaybookDto } from "@chanlytics/contracts";

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
  { id: "escalated", label: "Needs you", hint: "The receptionist stopped and asked for a human", icon: "flag", accent: true },
  { id: "done", label: "Handled", hint: "Answered by the receptionist — nothing owed", icon: "check" },
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
      read("GET templates").catch(
        (e: unknown) => e as Error,
      ),
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
      ? await read("GET conversations", { query: { ids: missing.slice(0, 100).join(",") } }).then((d) => d.conversations, () => null)
      : [];
    const extra = extraRead ?? [];
    // One that could not be read is a waiting customer nobody can see: the
    // list says how many, rather than listing fewer.
    const unreadEscalated = missing.length - extra.length;
    if (unreadEscalated) console.error("inbox_escalated_fetch_failed", unreadEscalated);

    const all = [...extra, ...convData.conversations];
    const threads = all.map((c) => toInboxThreadVM(c, byConv.get(c.id) ?? null, tz));
    const w = window as unknown as {
      INBOX_DATA?: Record<string, unknown> & { CHANNEL_LABELS?: Record<string, string>; INBOX_BASELINE?: Record<string, unknown> };
    };
    const prev = w.INBOX_DATA ?? {};
    w.INBOX_DATA = {
      ...prev,
      THREADS: threads,
      INBOX_BUCKETS: REAL_BUCKETS,
      INBOX_VIEWS: [], // saved views are all structurally zero on real data
      CHANNEL_LABELS: { ...(prev.CHANNEL_LABELS ?? {}), whatsapp: "WhatsApp", phone: "Phone", sms: "Text", email: "Email" },
      INBOX_BASELINE: { ...(prev.INBOX_BASELINE ?? {}), doneThisWeek: 0 },
      UNREAD_ESCALATED: unreadEscalated,
    };
  },
};

/**
 * Slice 4: Today. Unlike every other surface, this one has NO seed to fall back
 * to — TODAY_DATA does not exist until a fetch succeeds. That is deliberate:
 * the seeded Today rendered "$1,840 revenue · 12 appointments · on pace to
 * clear $4,200", so a failed fetch falling back to seeds would show fabricated
 * revenue at the exact moment the app knows nothing. Undefined makes the page
 * say "can't reach your workspace" instead.
 *
 * A DEGRADED refresh (was live, refresh failed) keeps the last real payload,
 * which is correct — the data is true but stale, and the bridge pill says so.
 */
export const todayOverride: SurfaceOverride = {
  key: "today",
  globals: ["TODAY_DATA"],
  events: ["surface:today"],
  refreshOnMessageInserts: true,
  // Calls too: the brief now shows who is on the line, and a call that ends
  // must leave it. The default trio never included the calls table — and the
  // transcript turn every few seconds (an UPDATE that keeps the status
  // ongoing) must NOT re-run three plpgsql aggregates; a start or an end does.
  refreshOnTables: [...DEFAULT_REFRESH_TABLES, "calls"],
  refreshWhen: (c) => c.table !== "calls" || c.event !== "UPDATE" || c.row.status !== "ongoing",
  debounceMs: 800, // the recap is aggregate, not per-thread — no need to be twitchy
  apply: async () => {
    // Calls are additive context, not a precondition — a voice outage must not
    // blank the brief — but they are fetched WITH the others rather than
    // waterfalled behind them, so the slowest request sets the wall clock.
    const [metricsRes, convData, escData, callsRes] = await Promise.all([
      read("GET metrics", { query: { days: "1" } }),
      read("GET conversations"),
      read("GET escalations", { query: { state: "open" } }),
      read("GET calls").catch((e: unknown) => e as Error),
    ]);
    // Null, not []: a calls read that failed is its own state, and the brief
    // says so rather than counting none.
    let calls: CallDto[] | null = null;
    try {
      if (callsRes instanceof Error) throw callsRes;
      calls = callsRes.calls;
    } catch (e) {
      console.error("today_calls_fetch_failed", e instanceof Error ? e.message : e);
    }
    (window as unknown as { TODAY_DATA?: TodayVM }).TODAY_DATA = toTodayVM(
      metricsRes.metrics,
      convData.conversations,
      escData.escalations,
      calls,
    );

    // The sidebar badge is seeded until the Inbox itself mounts, so a fresh
    // load put a fabricated "6" one inch from Today's honest "0 need you".
    // Today already holds the real rows — publish the count. Detail is
    // REQUIRED: a detail-less inbox:counts zeroes the badge instead of
    // correcting it.
    //
    // Counted with threadStanding, the same rule the Inbox itself uses. This
    // used to publish metrics.now.escalations_open, which is a DIFFERENT
    // number — it counts open escalations including ones a teammate has already
    // claimed, so it read high exactly when someone was doing the work, and
    // then overwrote the Inbox's correct count on every Today refresh.
    const openByConv = new Map(escData.escalations.map((e) => [e.conversation_id, e]));
    const needs = convData.conversations.filter(
      (c) => threadStanding(c, openByConv.get(c.id) ?? null).needsYou,
    ).length;
    window.dispatchEvent(new CustomEvent("inbox:counts", { detail: { needs } }));
  },
};

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
export function conversationTabs(hasCalls: boolean, channels: ReadonlyArray<string>): Array<{ id: string; label: string }> {
  const present = new Set(channels);
  return [
    { id: "all", label: "All" },
    ...(hasCalls ? [{ id: "phone", label: "Calls" }] : []),
    ...WRITTEN_TABS.filter((t) => present.has(t.id)).map((t) => ({ id: t.id, label: t.label })),
  ];
}

export const conversationsOverride: SurfaceOverride = {
  key: "conversations",
  globals: ["CONVERSATIONS_DATA"],
  events: ["surface:conversations"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [data, callsRes, tz] = await Promise.all([
      read("GET conversations"),
      read("GET calls").catch((e: unknown) => e as Error),
      workspaceZone(),
    ]);
    const w = window as unknown as {
      CONVERSATIONS_DATA?: { CONVERSATIONS: unknown[]; CV_CHANNELS: unknown[]; CALLS_READ: boolean };
    };
    // Calls get their OWN rows: a thread answers "am I on the hook to reply",
    // a call answers "is my AI saying the right things on the phone" — the
    // second is a transcript plus audio that cannot live in a chat bubble.
    // The call row carries no decision affordance; the Inbox owns "needs you".
    let callRows: unknown[] = [];
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
    // display strings ("Aug 26" vs "3:22 AM"), which is not an ordering at
    // all — a message sent this morning listed below yesterday's calls.
    const merged = [...threads, ...callRows].sort(
      (a, b) => ((b as { ts?: number }).ts ?? 0) - ((a as { ts?: number }).ts ?? 0),
    );
    w.CONVERSATIONS_DATA = {
      CONVERSATIONS: merged,
      // A calls read that failed is its own state: the page says so instead
      // of listing no calls (the audit's D9 family).
      CALLS_READ: !(callsRes instanceof Error),
      CV_CHANNELS: conversationTabs(callRows.length > 0, threads.map((t) => t.channel)),
    };
  },
};

/**
 * Settings · Workspace — the business's own facts, and who is on the team.
 *
 * The pane rendered "Serenity Spa · +1 (415) 555-0100 · Lena Park, Jay Rivera"
 * — a fabricated business with fabricated staff, shown to a real owner as their
 * own settings. Both APIs behind it have existed since Session B with nothing
 * calling them.
 *
 * Team is fetched even though the card is small: leaving it seeded would mean
 * flipping this pane to "real" while half of it was still invented, which is
 * exactly the thing the surface registry exists to prevent.
 */
export interface WorkspaceSettings {
  brain?: {
    business_name?: string;
    phone_display?: string;
    booking_link?: string;
    profile?: Record<string, unknown>;
  };
}

export const settingsOverride: SurfaceOverride = {
  key: "settings",
  globals: ["__SETTINGS", "__FACTS", "__TEAM", "__TEAM_INVITES", "__POLICIES", "__CHANNELS", "__TEMPLATES_ALL", "__TEMPLATE_USE", "__TEMPLATE_SENT"],
  events: ["surface:settings"],
  apply: async () => {
    const [cfg, team, pol, ch, tpl, zone] = await Promise.all([
      read("GET settings"),
      // A team read that fails must not blank the business card beside it.
      read("GET team").catch((e: unknown) => e as Error),
      // The autonomy matrix. Same rule: a failed read is its own state (null),
      // never the mockup's charter.
      read("GET policies").catch((e: unknown) => e as Error),
      // The numbers the business is reachable on, for Integrations.
      read("GET channels").catch((e: unknown) => e as Error),
      // Every template with its status, for the Integrations pane's card.
      read("GET templates", { query: { all: "1" } }).catch((e: unknown) => e as Error),
      // When a template last went out is a date past a week, on the business's
      // calendar (zone.ts). A zone that cannot be read is the page clock's, and
      // never a reason to lose the page.
      workspaceZone().catch(() => pageClock().zone()),
    ]);
    const w = window as unknown as {
      __SETTINGS?: { config: WorkspaceSettings | null; version: number; role: string; broken: { issues: string[] } | null; prompt: PromptPreviewDto | null; updatedBy: string | null; updatedAt: string | null };
      __FACTS?: { facts: ResolvedFacts; conflicts: FactConflict[] } | null;
      __TEAM?: unknown[] | null;
      __TEAM_INVITES?: unknown[] | null;
      __POLICIES?: PoliciesSurface | null;
      __CHANNELS?: ChannelVM[] | null;
      __TEMPLATES_ALL?: TemplateDto[] | null;
      __TEMPLATE_USE?: Record<string, { words: string; note: string | null; unused: boolean; playbook: string | null; running: boolean }> | null;
      __TEMPLATE_SENT?: Record<string, TemplateSentWords> | null;
    };
    // `broken` is its own state, not an empty config: the pane closes its
    // forms on it, because a save from a form that read {} would replace the
    // broken row with the form's few fields.
    // The prompt rides with the config: composed on the server from inputs the
    // browser cannot see, null when there is no receptionist to compose for.
    w.__SETTINGS = cfg.configBroken
      ? { config: null, version: cfg.version, role: cfg.role, broken: { issues: cfg.issues ?? [] }, prompt: null, updatedBy: null, updatedAt: null }
      : { config: cfg.config ?? {}, version: cfg.version, role: cfg.role, broken: null, prompt: cfg.prompt ?? null, updatedBy: cfg.updatedBy ?? null, updatedAt: cfg.updatedAt ?? null };
    // Resolved on the server, where the channel rows and the listing are. Null
    // on a broken config for the same reason the forms close: there is nothing
    // trustworthy to resolve against.
    w.__FACTS = cfg.configBroken ? null : { facts: cfg.facts, conflicts: cfg.conflicts };
    if (ch instanceof Error) {
      w.__CHANNELS = null;
      console.error("settings_channels_fetch_failed", ch.message);
    } else {
      const now = new Date();
      w.__CHANNELS = (ch.channels ?? []).map((c) => toChannelVM(c, now));
    }
    if (tpl instanceof Error) {
      w.__TEMPLATES_ALL = null;
      w.__TEMPLATE_USE = null;
      w.__TEMPLATE_SENT = null;
      console.error("settings_templates_fetch_failed", tpl.message);
    } else {
      w.__TEMPLATES_ALL = (tpl.templates ?? []).filter((t) => t.channel === "whatsapp");
      const names = [...new Set(w.__TEMPLATES_ALL.map((t) => t.name))];
      // The usage covers every starter too, added or not: a starter nobody added
      // is still a row on the page, and "nothing sends it" is a reading about it,
      // not a gap in the map.
      const useNames = [...new Set([...names, ...STARTER_TEMPLATES.map((st) => st.name)])];
      // What sends each of them, as the sentence the card draws. Keyed by NAME:
      // a template is one message in several languages, and the thing that sends
      // it names the message. Every name gets an entry, so a name MISSING from
      // the map means the usage was not read -- never "nothing sends it".
      const used = tpl.usedBy ?? {};
      w.__TEMPLATE_USE = Object.fromEntries(
        useNames.map((name) => {
          const u = used[name] ?? { playbooks: [], broadcasts: 0, recent: [], booking: false };
          return [name, { words: templateUseWords(u), note: templateUseNote(u), unused: templateUnused(u), playbook: u.playbooks.length === 1 ? u.playbooks[0]!.id : null, running: u.playbooks.some((p) => !p.paused) }];
        }),
      );
      // How many of each went out and when the latest did, as the Sent column
      // says it, one entry per name on file. An answer without the roll-up is a
      // read that did not happen: null, and the column says nothing -- never a
      // column of "Never sent".
      const sends = tpl.sends;
      const now = Date.now();
      w.__TEMPLATE_SENT = sends ? Object.fromEntries(names.map((name) => [name, templateSentWords(sends[name], zone, now)])) : null;
    }
    if (pol instanceof Error) {
      w.__POLICIES = null;
      console.error("settings_policies_fetch_failed", pol.message);
    } else {
      w.__POLICIES = {
        // `limits` is a JSON column: an object when set, and anything else reads as none.
        rows: (pol.policies ?? []).map((r) => ({ class: r.class, mode: r.mode, limits: r.limits && typeof r.limits === "object" && !Array.isArray(r.limits) ? (r.limits as Record<string, unknown>) : {} })),
        role: pol.role ?? null,
      };
    }
    if (team instanceof Error) {
      // null, not [] — "we could not read the team" and "there is nobody" are
      // different facts, and only one of them should render as an empty list.
      w.__TEAM = null;
      w.__TEAM_INVITES = null;
      console.error("settings_team_fetch_failed", team.message);
    } else {
      w.__TEAM = team.members ?? [];
      // The API has always returned open invitations and nothing rendered
      // them, so an invitation that was sent, accepted or revoked was
      // invisible on the one card whose job is saying who has access.
      w.__TEAM_INVITES = team.invites ?? [];
    }
  },
};

/* ------------------------------- People ---------------------------------- */

/** What the People surface reads: rows already mapped, the rail's list
 *  counts, and the header totals — all from one fetch. */
export interface PeopleSurface {
  rows: PersonRowVM[];
  /** The rail's smart lists with their members — the predicates stay in
   *  contracts; the mockup only needs the ids. Each carries its group and,
   *  when it has one, the obvious next step. */
  lists: { id: string; label: string; group: string; count: number; ids: string[]; action: { text: string; cta: string; to: string; enabled: boolean } | null }[];
  groups: { id: string; label: string }[];
  /** The lists kept by hand (segments), counted over the rows on the page so
   *  an erased person never counts; `members` is every id the server keeps on
   *  the list, so an Undo can tell who an add really added. */
  saved: { id: string; name: string; count: number; ids: string[]; members: string[]; action: { text: string; cta: string; to: string; enabled: boolean } }[];
  /** Whether the saved lists were read: false leaves People standing without them, and the rail and the profile say so. */
  savedRead: boolean;
  aggregates: PeopleAggregates;

  /** One row of the attention strip per person: the sentence, the state line, the one button. */
  attention: Record<string, AttentionRowVM>;
  /** The workspace's calendar: the outcome lists and the Booked cell exist only when it is "ok". */
  calendar: { state: "ok" | "unavailable" | "none"; source: string };
  /** The booking link on file, so a row can offer to text it. */
  bookingLink: string | null;
  /** The page the rows came from: how many there are in all, and whether more follow (00112). */
  page: { q: string | null; offset: number; limit: number; total: number; has_more: boolean } | null;
  /** What this member's pages remember in this workspace (memberships.views). */
  views: Record<string, unknown>;
  fetchedAt: number;
}

/** What the People surface holds between reads: the rows loaded so far, and the rest it derives from. */
let peopleLoaded: {
  /** The workspace's zone: every day and time on a row is said in it. */
  tz: string;
  people: PersonRowDto[];
  page: PeopleSurface["page"];
  /** Null when the read of them failed. */
  saved: { id: string; name: string; ids: string[] }[] | null;
  calendar: PeopleSurface["calendar"];
  bookingLink: string | null;
  views: Record<string, unknown>;
} | null = null;

/** The surface from what is loaded: every list, count and cell derived the same way, whether after the first read or a later page. */
function publishPeople(): void {
  if (!peopleLoaded) return;
  const { tz } = peopleLoaded;
  const now = new Date();
  const rows = peopleLoaded.people.map((r) => toPersonRowVM(r, tz, now));
  const calendar = peopleLoaded.calendar;
  (window as unknown as { __PEOPLE?: PeopleSurface }).__PEOPLE = {
    rows,
    // The outcome lists only when there is a calendar to read them from.
    lists: PEOPLE_LISTS.filter((l) => !l.needsCalendar || calendar.state === "ok").map((l) => {
      const members = rows.filter(l.test);
      return { id: l.id, label: l.label, group: l.group, count: members.length, ids: members.map((r) => r.id), action: peopleListAction(l.id, members) };
    }),
    groups: PEOPLE_LIST_GROUPS.map((g) => ({ id: g.id, label: g.label })),
    calendar,
    bookingLink: peopleLoaded.bookingLink,
    saved: (peopleLoaded.saved ?? []).map((l) => {
      const idSet = new Set(l.ids);
      const members = rows.filter((r) => idSet.has(r.id));
      const ids = members.map((r) => r.id);
      // The list's own step, the way a smart list carries its: a broadcast to those on it who said yes.
      return { id: l.id, name: l.name, count: ids.length, ids, members: l.ids, action: savedListAction(l.id, members) };
    }),
    savedRead: peopleLoaded.saved !== null,
    // The total is the server's: past the first page the rows here are not everyone.
    aggregates: { ...peopleAggregates(rows, now.getTime()), total: peopleLoaded.page?.total ?? rows.length },

    attention: Object.fromEntries(rows.map((r) => [r.id, attentionRow(r, tz, now.getTime())])),
    page: peopleLoaded.page,
    views: peopleLoaded.views,
    fetchedAt: now.getTime(),
  };
}

/** The views this tab has saved (the latest by page), how many saves it has made, and how many still wait on their reply. */
const keptViews = { views: {} as Record<string, Record<string, unknown>>, made: 0, waiting: 0 };

// A save reads nothing back, and People mounted again (Back) reads the view from this copy, so the copy takes each save.
// Until the first read of People lands (straight after F5) the copy is the one the tab's cache painted. What it returns
// is called when the save's reply lands.
export function keepSavedView(page: string, view: Record<string, unknown>): () => void {
  keptViews.views[page] = view;
  keptViews.made += 1;
  keptViews.waiting += 1;
  let waiting = true;
  const landed = () => { if (waiting) { waiting = false; keptViews.waiting -= 1; } };
  const views = peopleLoaded ? peopleLoaded.views : (window as unknown as { __PEOPLE?: PeopleSurface }).__PEOPLE?.views;
  if (!views) return landed;
  views[page] = view;
  // A reload paints the tab's cached People before anything is read again, so the cached copy takes the save too.
  resnapshotSurface(peopleOverride.key, peopleOverride.globals ?? [], (window as unknown as { __ACTIVE_WORKSPACE?: string }).__ACTIVE_WORKSPACE ?? null);
  return landed;
}

/**
 * The next thousand, appended under the same order, and the surface told:
 * `window.__peopleMore()`. The page shows the button only while the server
 * says more follow.
 */
async function peopleMore(): Promise<void> {
  if (!peopleLoaded?.page?.has_more) return;
  const next = await read("GET contacts", { query: { offset: peopleLoaded.people.length } });
  const seen = new Set(peopleLoaded.people.map((p) => p.id));
  peopleLoaded.people = [...peopleLoaded.people, ...next.people.filter((p) => !seen.has(p.id))];
  peopleLoaded.page = next.page;
  publishPeople();
  window.dispatchEvent(new CustomEvent("surface:clients"));
}

/**
 * Who matches, from the server, when the page does not hold everyone:
 * `window.__peopleSearch(q)`. The server matches names and numbers, a page at a
 * time, so the answer says whether more matches follow the ones it sent.
 */
async function peopleSearch(q: string): Promise<{ rows: PersonRowVM[]; more: boolean }> {
  const [r, tz] = await Promise.all([read("GET contacts", { query: { q } }), workspaceZone()]);
  const now = new Date();
  return { rows: r.people.map((p) => toPersonRowVM(p, tz, now)), more: !!r.page?.has_more };
}

/**
 * Every page of people, not the first: whatever counts people counts everyone.
 * Broadcasts learned it first -- an audience counted over one page promised
 * fewer people than the send enrols. People counted its lists, its header and
 * its search over the first page too, and every refresh put the rows back to
 * that page, dropping the ones Show more had added. Bounded, so a chain of
 * pages that never ends cannot hang a surface; past the bound the page still
 * says more follow.
 */
const PEOPLE_PAGES_BOUND = 50;
async function everyPerson(first: { people: PersonRowDto[]; page?: PeopleSurface["page"] }): Promise<{ people: PersonRowDto[]; page: PeopleSurface["page"] }> {
  const people = [...first.people];
  let page = first.page ?? null;
  for (let pages = 1; page?.has_more && pages < PEOPLE_PAGES_BOUND; pages++) {
    const next = await read("GET contacts", { query: { offset: people.length } });
    if (!next.people.length) break;
    people.push(...next.people);
    page = next.page ?? page;
  }
  return { people, page };
}

/**
 * People · Clients — everyone who has written to or phoned the business.
 *
 * The mockup drew sixty invented clients with health scores, packages and
 * therapists. The real surface renders what the schema holds: who they are,
 * which channels, who spoke last and when, what the receptionist is doing
 * for them, and whether they need a person. The state a row is in comes from
 * the tested rule in contracts, never from this file.
 *
 * Realtime message inserts re-apply, so a customer who writes moves rows the
 * way they move threads in the Inbox.
 */
export const peopleOverride: SurfaceOverride = {
  key: "people",
  globals: ["__PEOPLE"],
  events: ["surface:clients"],
  refreshOnMessageInserts: true,
  apply: async () => {
    // A view saved while this read is out, or before it with its reply still to come, may be missing from what the read
    // brings back, so the tab's own saves are laid over it. A read that overlapped no save takes the server's views as
    // they are: another device's change shows.
    const savesBefore = keptViews.made;
    const overlapped = keptViews.waiting > 0;
    const [data, savedData, viewsData, tz] = await Promise.all([
      read("GET contacts"),
      // The saved lists failing is their own state (savedRead): one failed read of
      // them took the whole surface down, and with it People, every profile and Lists.
      read("GET segments").catch((e: unknown) => e as Error),
      // A member's own views; a route that is not there yet reads as none.
      read("GET views").catch(() => ({ views: {} as Record<string, unknown> })),
      workspaceZone(),
    ]);
    if (savedData instanceof Error) console.error("people_lists_fetch_failed", savedData.message);
    // Every page, so a list, a count and a search cover everyone, and a refresh keeps them.
    const everyone = await everyPerson(data);
    peopleLoaded = {
      tz,
      people: everyone.people,
      page: everyone.page,
      saved: savedData instanceof Error ? null : savedData.lists,
      calendar: data.calendar ?? { state: "none" as const, source: "your calendar" },
      bookingLink: data.booking_link ?? null,
      views: overlapped || keptViews.made !== savesBefore ? { ...(viewsData.views ?? {}), ...keptViews.views } : viewsData.views ?? {},
    };
    const w = window as unknown as { __peopleMore?: () => Promise<void>; __peopleSearch?: (q: string) => Promise<{ rows: PersonRowVM[]; more: boolean }> };
    w.__peopleMore = peopleMore;
    w.__peopleSearch = peopleSearch;
    publishPeople();
  },
};

/* ------------------------------ Broadcasts ------------------------------- */

export interface AudienceOption {
  kind: AudienceKind;
  id: string | null;
  label: string;
  /**
   * How many of them this audience reaches, PER PURPOSE, because there is no one
   * number any more: a `utility` template needs their yes to messages, a
   * marketing one needs their separate yes to offers, and the same list has two
   * different sizes depending on which is picked.
   *
   * This used to be a single `count` computed once per surface load, with a
   * comment promising it was "the number the route will find". The route reads
   * the chosen template's category; the chip could not, so the promise held only
   * while both were wrong in the same direction. The page now indexes by the
   * purpose of the template actually selected.
   */
  counts: Record<SendPurpose, number>;
  /**
   * A handful of the people the count is a length of, per purpose, so the
   * composer can show one of them at a time beside the message.
   *
   * The chip said `23` and nothing else, so the last thing an owner saw before
   * an irreversible send was a number -- not that three of the twenty-three have
   * no first name on file and open with "Hi there", and not which two are in the
   * list but held back. The rows are already in hand here; this is the same
   * pass, keeping a few of them instead of only counting.
   *
   * It says how many on the list said yes, too (`saidYes`), a number or not: a
   * count of 0 is "nobody said yes" only when that is 0 as well.
   */
  preview: Record<SendPurpose, AudiencePreview>;
  hint: string;
}

/**
 * An approved template with the one thing the composer cannot work out for
 * itself: WHICH consent sending it needs.
 *
 * Stamped here rather than derived in the page, so the composer, the enrolment
 * route and the send job all read `purposeOfTemplate` of the same column and no
 * third rule can appear in a `.jsx` file where the compiler cannot see it.
 */
export type BroadcastTemplate = TemplateDto & { purpose: SendPurpose };

export interface BroadcastsSurface {
  rows: BroadcastVM[];
  /** The approved WhatsApp templates, with their variables and their purpose. */
  /** Null: the templates read failed -- its own state, never "no template yet". */
  templates: BroadcastTemplate[] | null;
  /** Whether the saved lists were read; false leaves the audiences without them, and the page says so. */
  listsRead: boolean;
  audiences: AudienceOption[];
  /** The WhatsApp number a broadcast goes out on, and what WhatsApp has said about it. */
  number: { present: boolean; display: string | null; health: NumberHealth };
  /** The words for a held-back reason, for the detail view. */
  heldReasons: Record<string, string>;
  /** How many go out at a time (contracts BROADCAST_CHUNK), for the words that say so. */
  chunk: number;
  /** The reply window in words, for the tips that say what a reply is (contracts REPLY_WINDOW_WORDS). */
  replyWindow: string;
  /** How a customer says yes in their own words: the phrase, the link that
   *  opens WhatsApp with it ready, and the QR of that link. Null link without
   *  a number. */
  optIn: { phrase: string; phraseEs: string; link: string | null; qrPath: string | null; pageUrl: string | null };
  /** Where that yes is got in this product (contracts GET_YES_ROUTE): the ledger's card, which the send screen's
   *  "nobody has said yes" is a door to. */
  getYes: string;
  /** The business's own words for the slots that name it, and whether a booking link is on file. */
  businessName: string;
  bookingLink: boolean;
  /** Why offers go by WhatsApp only, said once on the page (contracts OFFERS_BY_WHATSAPP_NOTE). */
  offersNote: string;
  /** Older broadcasts exist beyond the rows: the history's numbers are the latest fifty, and the page says so. */
  more: boolean;
  /** How far ahead a send may be scheduled, in days: the schedule box stops where the route does. */
  scheduleMaxDays: number;
  fetchedAt: number;
}

/**
 * Broadcasts: the rows with the numbers their messages earned, the approved
 * templates, and every audience with the count of people who may receive an
 * offer — computed here by the same contracts predicate the route enrols
 * with, so the number on the chip is the number the route will find.
 */
export const broadcastsOverride: SurfaceOverride = {
  key: "broadcasts",
  globals: ["__BROADCASTS"],
  events: ["surface:broadcasts"],
  refreshOnMessageInserts: true,
  apply: async () => {
    const [bc, people, saved, tpl, ch, cfg, tz] = await Promise.all([
      read("GET broadcasts"),
      read("GET contacts"),
      read("GET segments").catch((e: unknown) => e as Error),
      read("GET templates").catch((e: unknown) => e as Error),
      read("GET channels").catch((e: unknown) => e as Error),
      // The business's name and whether a booking link is on file, for the slots that name them.
      read("GET settings").catch((e: unknown) => e as Error),
      // When a broadcast went or goes, by the business's clock (zone.ts).
      workspaceZone(),
    ]);
    const wa = ch instanceof Error ? null : (ch.channels ?? []).find((c) => c.kind === "whatsapp" && c.status === "active") ?? null;
    const brain = cfg instanceof Error ? null : cfg.config?.brain ?? null;
    if (ch instanceof Error) console.error("broadcasts_channels_fetch_failed", ch.message);
    const now = new Date();
    // Every page of people, not the first: the send enrols everyone, so an
    // audience counted over one page promised fewer people than the send reaches.
    const { people: everyone } = await everyPerson(people);
    const rows = everyone.map((r) => toPersonRowVM(r, tz, now));
    // Both purposes, for every audience, so picking a template re-reads a number
    // rather than recomputing a list. Two passes over the people already in hand.
    const previewFor = (kind: AudienceKind, id: string | null, ids: Set<string> | null): Record<SendPurpose, AudiencePreview> => ({
      conversational: audiencePreview(rows, kind, id, ids, "conversational"),
      marketing: audiencePreview(rows, kind, id, ids, "marketing"),
    });
    const optionFor = (kind: AudienceKind, id: string | null, ids: Set<string> | null) => {
      const preview = previewFor(kind, id, ids);
      return { counts: { conversational: preview.conversational.sending, marketing: preview.marketing.sending }, preview };
    };
    const audiences: AudienceOption[] = [
      { kind: "everyone", id: null, label: EVERYONE_LABEL, ...optionFor("everyone", null, null), hint: "Everyone with a number whose yes covers the message you pick" },
      // The calendar lists are audiences only when there is a calendar to read them
      // from. The three consent lists are never audiences: each is a restatement of
      // the eligibility filter this list is already crossed with, so picking one
      // would read as narrowing while changing nothing.
      ...PEOPLE_LISTS.filter((l) => l.id !== "opted_in" && l.id !== "offers_ok" && l.id !== "opted_out" && (!l.needsCalendar || people.calendar?.state === "ok")).map((l) => ({
        kind: "list" as const, id: l.id, label: l.label, ...optionFor("list", l.id, null), hint: `${l.label} — of those whose yes covers this message`,
      })),
      ...(saved instanceof Error ? [] : saved.lists.map((s) => ({
        kind: "saved" as const, id: s.id, label: s.name, ...optionFor("saved", null, new Set(s.ids)), hint: "A list kept by hand — of those whose yes covers this message",
      }))),
    ];
    if (saved instanceof Error) console.error("broadcasts_lists_fetch_failed", saved.message);
    if (tpl instanceof Error) console.error("broadcasts_templates_fetch_failed", tpl.message);
    // The workspace being VIEWED, for the public page's address.
    const slug = workspaceOverride.current()?.slug ?? null;
    (window as unknown as { __BROADCASTS?: BroadcastsSurface }).__BROADCASTS = {
      rows: bc.broadcasts.map((b) => toBroadcastVM(b, tz, now)),
      scheduleMaxDays: BROADCAST_SCHEDULE_MAX_DAYS,
      more: bc.more === true,
      listsRead: !(saved instanceof Error),
      templates: tpl instanceof Error
        ? null
        : (tpl.templates ?? [])
            .filter((t) => t.channel === "whatsapp" && t.meta_status === "approved")
            .map((t) => ({ ...t, purpose: purposeOfTemplate(t.category) })),
      audiences,
      number: {
        present: !!wa,
        display: wa?.number_e164 ? formatPhoneDisplay(wa.number_e164) : null,
        health: numberHealth({ quality: wa?.quality ?? null, event: wa?.quality_event ?? null, limit: wa?.messaging_limit ?? null }),
      },
      heldReasons: HELD_REASONS,
      chunk: BROADCAST_CHUNK,
      replyWindow: REPLY_WINDOW_WORDS,
      businessName: brain?.business_name || "the business",
      bookingLink: !!brain?.booking_link,
      offersNote: OFFERS_BY_WHATSAPP_NOTE,
      optIn: {
        phrase: OFFERS_OPT_IN_PHRASES.en,
        phraseEs: OFFERS_OPT_IN_PHRASES.es,
        link: optInLink(wa?.number_e164),
        qrPath: optInLink(wa?.number_e164) ? api().url("GET consent/qr") : null,
        // The public page the same yes lives on: what a carrier is shown when
        // they ask how this business gets permission to text.
        pageUrl: slug ? `${window.location.origin}/yes/${slug}` : null,
      },
      getYes: GET_YES_ROUTE,
      fetchedAt: now.getTime(),
    };
  },
};

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
  history: { id: string; run_for: string | null; state: string; scheduled_for: string; recipient_count: number; sent: number; held: number; delivered: number; replied: number }[];
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
   *  only the run applies. Null when the server could not count the moment. */
  candidates: number | null;
  /** How many more it would reach but heard from a broadcast of any kind this week, and wait. Null with `candidates`. */
  held: number | null;
  /** Everyone its moment names, and who of them no run reaches whatever the week: the card's grey. Null when not read. */
  named: PlaybookNamed | null;
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
  /** list, cadence or visit — a visit trigger needs the calendar and has no gap. */
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
      return x && typeof x.pool === "number" ? { pool: x.pool, noYes: x.noYes ?? 0, stopped: x.stopped ?? 0, noNumber: x.noNumber ?? 0, saidYes: x.saidYes ?? 0 } : null;
    };
    const wa = ch instanceof Error ? null : (ch.channels ?? []).find((c) => c.kind === "whatsapp" && c.status === "active") ?? null;
    const brain = cfg instanceof Error ? null : cfg.config?.brain ?? null;
    if (tpl instanceof Error) console.error("playbooks_templates_fetch_failed", tpl.message);
    if (ch instanceof Error) console.error("playbooks_channels_fetch_failed", ch.message);
    const tz = pb.timezone || "America/New_York";
    (window as unknown as { __PLAYBOOKS?: PlaybooksSurface }).__PLAYBOOKS = {
      rows: pb.playbooks.map((p) => {
        const t = triggerOf(p.trigger);
        return {
          ...p,
          triggerLabel: t?.label ?? p.trigger,
          triggerHint: t?.hint ?? "",
          schedule: scheduleLine(p),
          next: nextRunLabel(p, tz, now),
          candidates: pool(p.trigger),
          held: held(p.trigger),
          named: named(p.trigger),
        };
      }),
      timezone: tz,
      countsRead: PLAYBOOK_TRIGGERS.every((t) => !!pb.pools?.[t.id]),
      calendar: pb.calendar ?? "none",
      triggers: PLAYBOOK_TRIGGERS.map((t) => ({ id: t.id, label: t.label, hint: t.hint, cls: t.cls, list: t.list, kind: t.kind, candidates: pool(t.id), held: held(t.id), named: named(t.id) })),
      templates: tpl instanceof Error
        ? null
        : (tpl.templates ?? [])
            .filter((t) => t.channel === "whatsapp" && t.meta_status === "approved")
            .map((t) => ({ ...t, purpose: purposeOfTemplate(t.category) })),
      number: {
        present: !!wa,
        health: numberHealth({ quality: wa?.quality ?? null, event: wa?.quality_event ?? null, limit: wa?.messaging_limit ?? null }),
      },
      businessName: brain?.business_name || "the business",
      bookingLink: !!brain?.booking_link,
      replyWindow: REPLY_WINDOW_WORDS,
      fetchedAt: now.getTime(),
    };
  },
};

/* ------------------------------- Calendar -------------------------------- */

/** The window loaded: a day key and a length in days; null is the window around today. Not persisted — a reload opens on today. */
let calendarFrom: string | null = null;
let calendarDays = 63;
/** The next read asks the calendar itself, not the route's few minutes' cache: the board's Refresh (C2). Taken by that read. */
let calendarFresh = false;
/** Whether the surface has made its first read, which alone takes its window from the address. */
let calendarBooted = false;

export function setCalendarFresh(on: boolean): void {
  calendarFresh = on;
}

export function getCalendarSpan(): { from: string | null; days: number } {
  return { from: calendarFrom, days: calendarDays };
}

export function setCalendarSpan(from: string | null, days = 63): void {
  calendarFrom = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
  calendarDays = Math.min(63, Math.max(1, Math.round(days) || 63));
}

export interface CalendarSurface {
  vm: CalendarVM;
  fetchedAt: number;
}

/**
 * The windows this tab has read (the loading standard's held views): going back to one paints at once, and the read
 * behind it keeps it current. Measured on the salon's workspace: the board held one window, so back to this week and
 * back to December were 390-500ms of "Reading those days…" each. Keyed by the span a window covers, so the weeks
 * around today and the same weeks reached by their date are one.
 */
const calendarHeld = heldViews<CalendarSurface>(6);
const calendarSpanKey = (w: { from: string; days: number }) => `${w.from}|${w.days}`;
/** The span a window asked for covers: its own, or the weeks around the business's today (unknown before the zone is). */
function calendarSpanOf(from: string | null, days: number): { from: string; days: number } | null {
  if (from) return { from, days };
  const zone = knownZone();
  return zone ? windowFor(zoneDayKey(Date.now(), zone)) : null;
}
/** Paint a window this tab holds for the span now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldCalendar(): boolean {
  const w = calendarSpanOf(calendarFrom, calendarDays);
  const have = w ? calendarHeld.get(calendarSpanKey(w)) : undefined;
  if (!have) return false;
  (window as unknown as { __CALENDAR?: CalendarSurface }).__CALENDAR = have;
  window.dispatchEvent(new CustomEvent("surface:calendar"));
  return true;
}

/**
 * Calendar: the owner's calendar as the receptionist reads it — what the
 * feed says is taken, the hours and closures, and the windows a caller
 * would be offered — one span of days by the business's clock. The feed's
 * address never reaches the browser; the route reads it.
 */
export const calendarOverride: SurfaceOverride = {
  key: "calendar",
  globals: ["__CALENDAR"],
  events: ["surface:calendar"],
  apply: async () => {
    // A cold boot on a day the address names (calendar/<day>) reads the weeks around that day: the page's own read.
    // It read today's weeks first, and the page read the day's after them. Only the first read looks at the address.
    if (!calendarBooted) {
      calendarBooted = true;
      const named = /^#\/?calendar\/(\d{4}-\d{2}-\d{2})$/.exec((typeof window !== "undefined" && window.location && window.location.hash) || "");
      if (named && calendarFrom === null) {
        const w = windowFor(named[1]);
        setCalendarSpan(w.from, w.days);
      }
    }
    const from = calendarFrom;
    const days = calendarDays;
    // A Refresh asks once: the flag goes with the read that takes it.
    const fresh = calendarFresh;
    calendarFresh = false;
    // The window around the business's today, not the browser's (zone.ts).
    const w = from ? { from, days } : windowFor(zoneDayKey(Date.now(), await workspaceZone()));
    const data = await read("GET calendar", { query: { from: w.from, days: String(w.days), ...(fresh ? { fresh: "1" as const } : {}) } });
    // Two moves in a row: the earlier read may land after the later one. A
    // read for a span the page has since left is dropped, never painted.
    if (from !== calendarFrom || days !== calendarDays) return;
    const surface: CalendarSurface = { vm: toCalendarVM(data.calendar, new Date()), fetchedAt: Date.now() };
    calendarHeld.hold(calendarSpanKey(w), surface);
    (window as unknown as { __CALENDAR?: CalendarSurface }).__CALENDAR = surface;
  },
};

/* ------------------------------- Reports --------------------------------- */

const REPORT_DAYS_KEY = "chanlytics.report.days";
let reportDays = 30;
try {
  if (typeof window !== "undefined") {
    const saved = Number(window.localStorage.getItem(REPORT_DAYS_KEY));
    if (REPORT_RANGES.some((r) => r.days === saved)) reportDays = saved;
  }
} catch {
  /* storage unavailable: the default range stands */
}

export function getReportDays(): number {
  return reportDays;
}

/** The one period every chart on Reports is scoped to. Only the presets. */
export function setReportDays(days: number): void {
  if (!REPORT_RANGES.some((r) => r.days === days)) return;
  reportDays = days;
  try {
    window.localStorage.setItem(REPORT_DAYS_KEY, String(days));
  } catch {
    /* a preference, not a fact */
  }
}

export interface ReportsSurface {
  vm: ReportVM;
  /** What the broadcasts and playbooks sent over the same period; null when that read failed and the receptionist's own numbers still stand (D9). */
  campaigns: CampaignReportVM | null;
  /** Asked, then booked: the one conversion line, from the calendar. */
  booking: BookingReportVM;
  /** Worth knowing: at most three facts from these same numbers (contracts' reportFacts). */
  facts: ReportFactVM[];
  days: number;
  fetchedAt: number;
}

/**
 * Reports — the receptionist's own numbers over a period.
 *
 * The mockup drew revenue, bookings and eight agents. This publishes the
 * report view model built from one SQL function that already applies the
 * Today metrics' rules (tenant time zone, no undated imports, answered-by =
 * first reply). Realtime message inserts re-apply so today's column moves.
 */
/** The periods this tab has read (held views): going back to one paints at once, and the read behind it keeps it current. */
const reportsHeld = heldViews<ReportsSurface>(4);
/** Paint a period this tab holds for the period now asked for; whether it did. The read behind it is the caller's. */
export function paintHeldReports(): boolean {
  const have = reportsHeld.get(String(reportDays));
  if (!have) return false;
  (window as unknown as { __REPORTS?: ReportsSurface }).__REPORTS = have;
  window.dispatchEvent(new CustomEvent("surface:reports"));
  return true;
}

export const reportsOverride: SurfaceOverride = {
  key: "reports",
  globals: ["__REPORTS"],
  events: ["surface:reports"],
  refreshOnMessageInserts: true,
  debounceMs: 800,
  apply: async () => {
    const days = reportDays;
    const [data, campaigns] = await Promise.all([
      read("GET reports", { query: { days: String(days) } }),
      // The offers' numbers are their own read. A failure there used to fail
      // the whole surface -- the page went blank, and its own "could not be
      // read" line could never render (the audit's D9). Null is its state.
      read("GET reports/campaigns", { query: { days: String(days) } }).catch((e: unknown) => e as Error),
    ]);
    if (campaigns instanceof Error) console.error("reports_campaigns_fetch_failed", campaigns.message);
    // A pick of another period while this read was out: its answer is for a period left, and never lands on the new
    // one. A held period answers a pick at once and is read again behind it, so two reads can be out together.
    if (days !== reportDays) return;
    const surface: Omit<ReportsSurface, "facts"> = {
      vm: toReportVM(data.report),
      campaigns: campaigns instanceof Error ? null : toCampaignReportVM(campaigns.report),
      booking: toBookingReportVM(data.booking),
      days,
      fetchedAt: Date.now(),
    };
    // Worth knowing is derived here, once, from the same two view models the page draws: never in the page.
    const whole: ReportsSurface = { ...surface, facts: reportFacts(surface.vm, surface.campaigns) };
    reportsHeld.hold(String(days), whole);
    (window as unknown as { __REPORTS?: ReportsSurface }).__REPORTS = whole;
  },
};

/* ---------------------------- Notifications ------------------------------ */

export interface NotificationsSurface {
  dto: NotificationsDto;
  fetchedAt: number;
}

/**
 * Notifications: the month's kept rows and this person's seen moment. The
 * bell reads them beside what it derives from the surfaces around it, and
 * repaints as the edge writes a row.
 */
export const notificationsOverride: SurfaceOverride = {
  key: "notifications",
  globals: ["__NOTIFICATIONS"],
  events: ["surface:notifications"],
  refreshOnTables: ["notifications"],
  apply: async () => {
    const dto = await read("GET notifications");
    (window as unknown as { __NOTIFICATIONS?: NotificationsSurface }).__NOTIFICATIONS = { dto, fetchedAt: Date.now() };
  },
};

/**
 * Live — the phone line right now.
 *
 * Deliberately NOT cached: `globals` is empty, so the runner never snapshots
 * it and a reload cannot paint a call that ended while the tab was closed.
 * A cold load waits on the fetch like every other real surface. Realtime on
 * the calls table (a call starting, each live turn, its end, its analysis)
 * re-runs this apply; the page itself runs the clock and re-applies the
 * heartbeat rule between refreshes.
 */
export const liveOverride: SurfaceOverride = {
  key: "live",
  globals: [],
  events: ["surface:live"],
  // Calls only: a transcript turn is a calls UPDATE and nothing else needs
  // to repaint for it; the note a call leaves in the thread is a messages
  // INSERT the default surfaces already follow.
  refreshOnTables: ["calls"],
  debounceMs: 300,
  apply: async () => {
    const [callsRes, chRes, tz] = await Promise.all([
      read("GET calls"),
      // The line's number and switch are context, not a precondition.
      read("GET channels").catch((e: unknown) => e as Error),
      workspaceZone(),
    ]);
    if (chRes instanceof Error) console.error("live_channels_fetch_failed", chRes.message);
    (window as unknown as { __LIVE?: LiveVM }).__LIVE = toLiveVM(
      callsRes.calls,
      chRes instanceof Error ? null : chRes.channels,
      tz,
    );
  },
};
