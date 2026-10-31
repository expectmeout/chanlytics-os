/**
 * A lead's own receptionist before they sign up (decision 0079, 00497 lead_previews): its states and its limits, which
 * the database's checks and doors hold too (schema-sets.ts holds the states to the column).
 *
 *   building   its workspace made, its receptionist being written from the lead and its website
 *   ready      open to try: texted and called, up to its limits, until its thirty days are up
 *   failed     it could not be made (its why kept); the email that would have carried it is skipped
 *   claimed    made theirs: an active workspace with its claimer as owner
 *   ended      its thirty days are up, or its lead was erased: its workspace and its words gone, its counts kept
 *
 * And its page (L2): which page a preview is now (previewStateOf), its chat (previewTurnsOf), three questions to start
 * from (previewStartersOf), what it knows and where each fact was read (previewKnowsOf), and all of it (previewPageOf).
 * The page's words are preview-words.ts's, apart, so the page that draws them carries none of this.
 */
import { dayIntervals } from "../calendar/availability";
import { hoursLines } from "../calendar/calendar-words";
import type { BusinessProfile } from "../config/workspace-config/business-profile";
import { DAY_NAMES, DAYS } from "../config/workspace-config/config-rules";
import { REHEARSAL_LIMITS } from "../rehearsal/rehearsal";
import { RECEPTIONIST_MET, REHEARSE_SKIPPED } from "../setup/setup-put-off";
import { SECOND_MS } from "../shared/time";
import { LEAD_PREVIEW_WORDS } from "./preview-words";

export const PREVIEW_STATES = ["building", "ready", "failed", "claimed", "ended"] as const;
export type PreviewState = (typeof PREVIEW_STATES)[number];

/** What a preview answers and keeps, as its doors hold it (00497). */
export const PREVIEW_LIMITS = {
  /** Messages a preview answers (preview_said). */
  messages: 20,
  /** Days a preview lasts from the first email that carried it, or from its build. */
  days: 30,
  /** Lines of "not right" a preview keeps (preview_not_right). */
  notRight: 10,
  /** The longest message a preview takes, in characters: Try it's case. */
  messageChars: 500,
  /** What its calls may speak in all: the rehearsal's own preview window, three minutes at most a call (L3). */
  callMs: REHEARSAL_LIMITS.previewMs,
} as const;

/** Why a preview could not be made, as its row keeps it (lead_previews.failed_why). */
export const PREVIEW_FAILURES = ["no_name", "build_failed"] as const;
export type PreviewFailure = (typeof PREVIEW_FAILURES)[number];

/* ---- its page ---- */

/**
 * What the page draws: open to try; open, its twenty messages said; being set up; ended (its thirty days up, its lead
 * erased, or it could not be made); or someone's own now.
 */
export type PreviewPageState = "building" | "ready" | "spent" | "ended" | "taken";

/** One turn of the chat as the page draws it: who said it, the words, and for an answer what a live chat would do. */
export interface PreviewTurnVM {
  role: "user" | "assistant";
  text: string;
  then: { words: string; tone: "sends" | "waits" | "yours" } | null;
}

/** A fact it knows, and where it was read from, so "Not right" can name it. */
export interface PreviewKnowsRowVM {
  key: keyof typeof LEAD_PREVIEW_WORDS.rows;
  label: string;
  value: string;
  from: string;
}

export interface PreviewPageVM {
  state: PreviewPageState;
  business: string;
  logo_url: string | null;
  turns: PreviewTurnVM[];
  /** Messages it will still answer. */
  left: number;
  /** What its calls may still speak, by the seconds its ended calls were counted. */
  call_left_ms: number;
  /** Three questions to start from, on a chat with nothing in it yet. */
  starters: string[];
  knows: PreviewKnowsRowVM[];
}

/** What the page is drawn from: the row as its door keeps it, and the preview workspace's name, look and record. */
export interface PreviewPageFacts {
  state: string;
  ends_at: string;
  asked_count: number;
  turns: unknown;
  business: string;
  logo_url: string | null;
  profile: Pick<BusinessProfile, "hours" | "address" | "website" | "services"> | null;
  phone_display: string | null;
  /** The seconds its ended calls spoke (lead_previews.call_seconds). */
  call_seconds: number;
}

const TONES: ReadonlySet<string> = new Set(["sends", "waits", "yours"]);
type Tone = NonNullable<PreviewTurnVM["then"]>["tone"];

/** The chat as the row keeps it (00497 preview_said: {role, content, then?}), read for what each turn is. */
export function previewTurnsOf(raw: unknown): PreviewTurnVM[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t: unknown): PreviewTurnVM[] => {
    const o = t && typeof t === "object" ? (t as Record<string, unknown>) : null;
    if (!o || (o.role !== "user" && o.role !== "assistant") || typeof o.content !== "string") return [];
    const then = o.then && typeof o.then === "object" ? (o.then as Record<string, unknown>) : null;
    const said =
      o.role === "assistant" && then && typeof then.words === "string" && TONES.has(String(then.tone))
        ? { words: then.words, tone: then.tone as Tone }
        : null;
    return [{ role: o.role, text: o.content, then: said }];
  });
}

/** A service as a question names it: "the fade", "the Swedish massage" (a name that opens on a word in capitals keeps it). */
const serviceAsAsked = (name: string): string =>
  /^[A-Z][a-z]/.test(name) && !/^[A-Z][a-z]+ [A-Z]/.test(name) ? `${name[0]?.toLowerCase()}${name.slice(1)}` : name;

/**
 * Three questions a customer would ask, from what it knows: a day it is closed (or its hours, where it knows none), a
 * time tomorrow, and the price of a service it lists, where the price rule shows itself holding.
 */
export function previewStartersOf(profile: PreviewPageFacts["profile"]): string[] {
  const hours = profile?.hours;
  const open = DAYS.filter((d) => dayIntervals(hours?.[d]).length > 0);
  const closed = open.length ? DAYS.find((d) => !open.includes(d)) : undefined;
  const service = profile?.services?.find((s) => s.name.trim())?.name.trim();
  const starters = [
    closed ? `Are you open on ${DAY_NAMES[closed]}?` : "What are your hours?",
    "Can I come in tomorrow at 2?",
    service ? `How much is the ${serviceAsAsked(service)}?` : open.length ? "What are your hours?" : null,
  ];
  return [...new Set(starters.filter((s): s is string => !!s))].slice(0, 3);
}

/** The services as a line: the first six, and how many more. */
function servicesLine(services: readonly { name: string }[]): string {
  const names = services.map((s) => s.name.trim()).filter(Boolean);
  const shown = names.slice(0, 6).join(", ");
  return names.length > 6 ? `${shown} and ${names.length - 6} more` : shown;
}

/** What it knows, each with where it was read from: the listing's hours, address, number and site; the site's services. */
export function previewKnowsOf(profile: PreviewPageFacts["profile"], phoneDisplay: string | null): PreviewKnowsRowVM[] {
  const W = LEAD_PREVIEW_WORDS;
  const rows: PreviewKnowsRowVM[] = [];
  const add = (key: PreviewKnowsRowVM["key"], value: string | null | undefined, from: string) => {
    if (value?.trim()) rows.push({ key, label: W.rows[key], value: value.trim(), from });
  };
  add("hours", hoursLines(profile?.hours ?? null).join(" · "), W.from.google);
  add("address", profile?.address, W.from.google);
  add("phone", phoneDisplay, W.from.google);
  add("website", profile?.website?.replace(/^https?:\/\//, "").replace(/\/$/, ""), W.from.google);
  add("services", servicesLine(profile?.services ?? []), W.from.site);
  return rows;
}

/** Which page a preview is now: its door's state, read against its clock and its limit. */
export function previewStateOf(
  f: Pick<PreviewPageFacts, "state" | "ends_at" | "asked_count">,
  now: Date,
): PreviewPageState {
  if (f.state === "claimed") return "taken";
  if (f.state === "ended" || f.state === "failed" || Date.parse(f.ends_at) <= now.getTime()) return "ended";
  if (f.state === "building") return "building";
  return f.asked_count >= PREVIEW_LIMITS.messages ? "spent" : "ready";
}

/**
 * A lead's preview as {{their preview}} reads it (L5): open, with its link; being made (or not made yet, which the first
 * send that names it asks for); or gone, failed, ended or someone's own, which no email may carry.
 */
export type LeadPreviewSlot = { state: "open"; url: string } | { state: "building" } | { state: "gone" };

/** The slot's standing for a lead's preview row, or none, read against the clock; `origin` is the dashboard's. */
export function previewSlotOf(
  row: (Pick<PreviewPageFacts, "state" | "ends_at" | "asked_count"> & { token: string }) | null,
  now: Date,
  origin: string,
): LeadPreviewSlot {
  if (!row || row.state === "building") return { state: "building" };
  return previewClaimable(previewStateOf(row, now))
    ? { state: "open", url: `${origin}/preview/${encodeURIComponent(row.token)}` }
    : { state: "gone" };
}

/** Make it mine's address (L4): the preview's own sign-up, read on the server, under the preview's public prefix. */
export function previewMinePath(token: string): string {
  return `/preview/${encodeURIComponent(token)}/mine`;
}

/** Whether a preview can be made someone's own now: open, with its twenty messages said or not (Make it mine, L4). */
export function previewClaimable(state: PreviewPageState): boolean {
  return state === "ready" || state === "spent";
}

/**
 * What a preview's use counts for in its first run once it is someone's own (L4), as the member's own Setup marks: talked
 * to or called, its receptionist met; called, its rehearsal heard, so Rehearse waits on no review of it.
 */
export function previewFirstRunMarks(f: { asked_count: number; call_count: number }): string[] {
  return [
    ...(f.asked_count > 0 || f.call_count > 0 ? [RECEPTIONIST_MET] : []),
    ...(f.call_count > 0 ? [REHEARSE_SKIPPED] : []),
  ];
}

/** The page, from its facts and the clock. */
export function previewPageOf(f: PreviewPageFacts, now: Date): PreviewPageVM {
  const state = previewStateOf(f, now);
  const turns = state === "ended" || state === "taken" ? [] : previewTurnsOf(f.turns);
  return {
    state,
    business: f.business,
    logo_url: f.logo_url,
    turns,
    left: Math.max(0, PREVIEW_LIMITS.messages - f.asked_count),
    call_left_ms: Math.max(0, PREVIEW_LIMITS.callMs - f.call_seconds * SECOND_MS),
    starters: state === "ready" && !turns.length ? previewStartersOf(f.profile) : [],
    knows: state === "ready" || state === "spent" ? previewKnowsOf(f.profile, f.phone_display) : [],
  };
}
