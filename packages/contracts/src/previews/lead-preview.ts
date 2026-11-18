/**
 * A lead's preview's PAGE (decision 0079, L2): its chat (previewTurnsOf), three questions to start from
 * (previewStartersOf), what it knows and where each fact was read (previewKnowsOf), and all of it (previewPageOf); and
 * what its use counts for once it is someone's own (previewFirstRunMarks). Its states, its limits and which page it is
 * now are previews/standing.ts's, which everything but the page reads. The page's words are previews/words.ts's, apart,
 * so the page that draws them carries none of this.
 */
import { dayIntervals } from "../calendar/availability";
import { calendarHoursLines } from "../calendar/words/labels";
import type { BusinessProfile } from "../config/workspace-config/business-profile";
import { DAY_NAMES, DAYS } from "../config/workspace-config/config-rules";
import { RECEPTIONIST_MET, REHEARSE_SKIPPED } from "../setup/put-off";
import { SECOND_MS } from "../shared/time";
import { phoneVoiceShown } from "../voice/phone-voices";
import { PREVIEW_LIMITS, PREVIEW_NEAR, previewStateOf, type PreviewPageState } from "./standing";
import { PREVIEW_STARTERS_MOST, previewStartersWrittenOf } from "./starters";
import { previewTheirsOf } from "./theirs";
import { TRIED_JOIN, previewTriedParts } from "./tried";
import { LEAD_PREVIEW_WORDS } from "./words";

/* ---- its page ---- */

/** One turn of the chat as the page draws it: who said it, the words, and for an answer what a live chat would do. */
export interface PreviewTurnVM {
  role: "user" | "assistant";
  text: string;
  /**
   * `taught`: the answer says a thing they told it (the message door's rule, server/previews), kept with the turn;
   * `spans`: where it says it, each from one character of the answer up to another, for the page to light.
   */
  then: { words: string; tone: "sends" | "waits" | "yours"; taught?: boolean; spans?: [number, number][] } | null;
}

/** A call the preview ended, as a line of its conversation on a visit after it: which one, and how long it ran. */
interface PreviewCallVM {
  id: string;
  seconds: number;
}

/**
 * A fact it knows, and where it was read from, so a fix can name it; or one the listing and the site never had
 * (`missing`: its value is what its absence costs, its `from` where it was looked for), which the business can add.
 * `fix` says how it is put right: its value typed again, or, for a list no sentence replaces (its services), a
 * sentence said beside it. `short` is a long value said briefly, where a capsule or a row's name has no room for the
 * whole of it: a list of services as how many there are ("17 services").
 */
export interface PreviewKnowsRowVM {
  key: keyof typeof LEAD_PREVIEW_WORDS.rows;
  label: string;
  value: string;
  short: string | null;
  from: string;
  missing: boolean;
  fix: "value" | "say";
}

export interface PreviewPageVM {
  state: PreviewPageState;
  business: string;
  logo_url: string | null;
  /** Their Google photo, only from Google's own host. */
  photo: string | null;
  turns: PreviewTurnVM[];
  /** The calls it ended, oldest first, so a visit after one still shows it and its words: none on a page not open. */
  calls: PreviewCallVM[];
  /** Messages it will still answer. */
  left: number;
  /** What its calls may still speak, by the seconds its ended calls were counted. */
  call_left_ms: number;
  /** Three questions to start from, on a chat with nothing in it yet. */
  starters: string[];
  /** What it says first in the chat, as their business: shown, never stored or counted. */
  greeting: string;
  /** The phone voice it speaks with (voice/phone-voices.ts), heard on the page in the provider's own recording of it. */
  voice: string;
  knows: PreviewKnowsRowVM[];
  /** What they told it, in the order they did (previews/theirs.ts): none on a page that is not open. */
  taught: string[];
  /** Whether Make it mine leads: they have called it, told it something, or sent it a few messages. */
  leads: boolean;
  /** What they did with it, as one line for its sender's look ("3 messages · a call of a minute"), or none. */
  did: string;
  /** The same, part by part, as that look draws it: its messages, then its calls. */
  tried: string[];
}

/** What the page is drawn from: the row as its door keeps it, and the preview workspace's name, look and record. */
export interface PreviewPageFacts {
  state: string;
  ends_at: string;
  asked_count: number;
  turns: unknown;
  business: string;
  logo_url: string | null;
  /** With its notes: what the business told it and put right are notes of the record (previews/theirs.ts). */
  profile: Pick<
    BusinessProfile,
    "hours" | "address" | "website" | "services" | "assistant_name" | "notes" | "phone_voice"
  > | null;
  phone_display: string | null;
  /** The seconds its ended calls spoke (lead_previews.call_seconds). */
  call_seconds: number;
  /** The calls it ended (lead_previews.call_count); absent where its reader does not carry it. */
  call_count?: number;
  /** Its newest ended calls, oldest first (the preview workspace's rehearsals); absent where its reader carries none. */
  calls?: PreviewCallVM[];
  /** The lead's Google photo (leads.image_url), or none. */
  photo_url: string | null;
  /**
   * The questions written for this business as its preview was built (previews/starters.ts), as its workspace keeps
   * them: read here for what each is. Absent where its reader carries none, and where none were written.
   */
  starters?: unknown;
}

/** Their photo as the page may draw it: Google's own host, over https, else none (the CSP allows that host alone). */
const GOOGLE_PHOTO = /^https:\/\/[a-z0-9-]+\.googleusercontent\.com\//;
const photoOf = (url: string | null): string | null => (url && GOOGLE_PHOTO.test(url) ? url : null);

const TURN_TONES: ReadonlySet<string> = new Set(["sends", "waits", "yours"]);
type Tone = NonNullable<PreviewTurnVM["then"]>["tone"];

/** The stretches lit in one answer, at most: what its door keeps (server/previews/taught-answer.ts). */
const SPANS_MOST = 8;

/** An answer's lit stretches as its turn keeps them, read for what each is: whole numbers, in order, inside the answer. */
function turnSpansOf(raw: unknown, length: number): [number, number][] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((span: unknown): [number, number][] => {
      const from: unknown = Array.isArray(span) ? span[0] : null;
      const to: unknown = Array.isArray(span) ? span[1] : null;
      if (typeof from !== "number" || typeof to !== "number") return [];
      return Number.isInteger(from) && Number.isInteger(to) && from >= 0 && from < to && to <= length
        ? [[from, to]]
        : [];
    })
    .slice(0, SPANS_MOST);
}

/** The chat as the row keeps it (00497 preview_said: {role, content, then?}), read for what each turn is. */
export function previewTurnsOf(raw: unknown): PreviewTurnVM[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((kept: unknown): PreviewTurnVM[] => {
    const row = kept && typeof kept === "object" ? (kept as Record<string, unknown>) : null;
    if (!row || (row.role !== "user" && row.role !== "assistant") || typeof row.content !== "string") return [];
    const then = row.then && typeof row.then === "object" ? (row.then as Record<string, unknown>) : null;
    const spans = then?.taught === true ? turnSpansOf(then.spans, row.content.length) : [];
    const turn =
      row.role === "assistant" && then && typeof then.words === "string" && TURN_TONES.has(String(then.tone))
        ? {
            words: then.words,
            tone: then.tone as Tone,
            ...(then.taught === true ? { taught: true } : {}),
            ...(spans.length ? { spans } : {}),
          }
        : null;
    return [{ role: row.role, text: row.content, then: turn }];
  });
}

/** A service as a question names it: "the fade", "the Swedish massage" (a name that opens on a word in capitals keeps it). */
const serviceAsAsked = (name: string): string =>
  /^[A-Z][a-z]/.test(name) && !/^[A-Z][a-z]+ [A-Z]/.test(name) ? `${name[0]?.toLowerCase()}${name.slice(1)}` : name;

/**
 * The questions a customer would ask that it can answer from what it knows, said the way a caller says them: a service
 * it lists, a day it is closed (or its hours), where it is; and the one every business handles. Never a price (it
 * refuses one it was not given) and never a visit time (many businesses come to the customer). The page offers the
 * ones not yet asked.
 */
export function previewStartersOf(profile: PreviewPageFacts["profile"]): string[] {
  const service = profile?.services?.find((s) => s.name.trim())?.name.trim();
  const hours = profile?.hours;
  const open = DAYS.filter((d) => dayIntervals(hours?.[d]).length > 0);
  const closed = open.length ? DAYS.find((d) => !open.includes(d)) : undefined;
  const starters = [
    service ? `Can you tell me about the ${serviceAsAsked(service)}?` : null,
    closed ? `Are you open on ${DAY_NAMES[closed]}?` : open.length ? "What are your hours?" : null,
    profile?.address?.trim() ? "Where are you located?" : null,
    "Can someone call me back?",
  ];
  return starters.filter((s): s is string => !!s);
}

/**
 * The questions the page offers: the ones written for this business as its preview was built, in a customer's own
 * words; where fewer than three were kept, the record's own after them; and where none were, the record's own, as
 * every preview offered before any were written.
 */
function startersShownOf(previewPageFacts: Pick<PreviewPageFacts, "starters" | "profile">): string[] {
  const written = previewStartersWrittenOf(previewPageFacts.starters);
  const fromRecord = previewStartersOf(previewPageFacts.profile);
  if (written.length === 0) return fromRecord;
  const offered = new Set(written.map((question) => question.toLowerCase()));
  return [...written, ...fromRecord.filter((question) => !offered.has(question.toLowerCase()))].slice(
    0,
    PREVIEW_STARTERS_MOST,
  );
}

/** The services as a line: the first six, and how many more. */
function servicesLine(services: readonly { name: string }[]): string {
  const names = services.map((s) => s.name.trim()).filter(Boolean);
  const shown = names.slice(0, 6).join(", ");
  return names.length > 6 ? `${shown} and ${names.length - 6} more` : shown;
}

/** What it knows, each with where it was read from: the listing's hours, address, number and site; the site's services. */
export function previewKnowsOf(profile: PreviewPageFacts["profile"], phoneDisplay: string | null): PreviewKnowsRowVM[] {
  const words = LEAD_PREVIEW_WORDS;
  const rows: PreviewKnowsRowVM[] = [];
  const servicesCount = (profile?.services ?? []).filter((service) => service.name.trim()).length;
  // A fact they put right is theirs, in their words, whatever the listing said (previews/theirs.ts).
  const { fixed } = previewTheirsOf(profile);
  const add = (key: PreviewKnowsRowVM["key"], listed: string | null | undefined, from: string) => {
    const theirs = fixed[key];
    const value = theirs ?? listed;
    if (!value?.trim()) return;
    const fix = key === "services" ? "say" : "value";
    rows.push({
      key,
      label: words.rows[key],
      value: value.trim(),
      // A couple of services are their own names; more are how many there are.
      short: key === "services" && !theirs && servicesCount > 2 ? words.signup.comesRead.services(servicesCount) : null,
      from: theirs ? words.from.you : from,
      missing: false,
      fix,
    });
  };
  add("hours", calendarHoursLines(profile?.hours ?? null).join(" · "), words.from.google);
  add("address", profile?.address, words.from.google);
  add("phone", phoneDisplay, words.from.google);
  add("website", profile?.website?.replace(/^https?:\/\//, "").replace(/\/$/, ""), words.from.google);
  add("services", servicesLine(profile?.services ?? []), words.from.site);
  // What the listing and the site never had, and a business can add: its hours first, then what it does.
  const known = new Set(rows.map((row) => row.key));
  const lacks = (key: "hours" | "services", from: string) => {
    if (!known.has(key))
      rows.push({
        key,
        label: words.rows[key],
        value: words.missingWhy[key],
        short: null,
        from,
        missing: true,
        fix: "value",
      });
  };
  // A record that could not be read says nothing about what it lacks.
  if (profile) {
    lacks("hours", words.missing.google);
    lacks("services", words.missing.site);
  }
  return rows;
}

/** Make it mine's address (L4): the preview's own sign-up, read on the server, under the preview's public prefix. */
export function previewMinePath(token: string): string {
  return `/preview/${encodeURIComponent(token)}/mine`;
}

/**
 * What a preview's use counts for in its first run once it is someone's own (L4), as the member's own Setup marks: talked
 * to or called, its receptionist met; called, its rehearsal heard, so Rehearse waits on no review of it.
 */
export function previewFirstRunMarks(fields: { asked_count: number; call_count: number }): string[] {
  return [
    ...(fields.asked_count > 0 || fields.call_count > 0 ? [RECEPTIONIST_MET] : []),
    ...(fields.call_count > 0 ? [REHEARSE_SKIPPED] : []),
  ];
}

/** The page, from its facts and the clock. */
export function previewPageOf(previewPageFacts: PreviewPageFacts, now: Date): PreviewPageVM {
  const state = previewStateOf(previewPageFacts, now);
  const turns = state === "ended" || state === "taken" ? [] : previewTurnsOf(previewPageFacts.turns);
  const open = state === "ready" || state === "spent";
  const taught = previewTheirsOf(previewPageFacts.profile).taught;
  const tried = previewTriedParts({
    asked_count: previewPageFacts.asked_count,
    call_count: previewPageFacts.call_count ?? (previewPageFacts.call_seconds > 0 ? 1 : 0),
    call_seconds: previewPageFacts.call_seconds,
  });
  return {
    state,
    business: previewPageFacts.business,
    logo_url: previewPageFacts.logo_url,
    photo: state === "ended" || state === "taken" ? null : photoOf(previewPageFacts.photo_url),
    turns,
    calls: open ? (previewPageFacts.calls ?? []) : [],
    left: Math.max(0, PREVIEW_LIMITS.messages - previewPageFacts.asked_count),
    call_left_ms: Math.max(0, PREVIEW_LIMITS.callMs - previewPageFacts.call_seconds * SECOND_MS),
    starters: state === "ready" ? startersShownOf(previewPageFacts) : [],
    greeting: LEAD_PREVIEW_WORDS.textGreeting(
      previewPageFacts.business,
      previewPageFacts.profile?.assistant_name ?? null,
    ),
    voice: phoneVoiceShown(previewPageFacts.profile?.phone_voice).id,
    knows:
      state === "ready" || state === "spent"
        ? previewKnowsOf(previewPageFacts.profile, previewPageFacts.phone_display)
        : [],
    taught: open ? taught : [],
    leads:
      previewPageFacts.asked_count >= PREVIEW_NEAR.triedMessages ||
      previewPageFacts.call_seconds > 0 ||
      taught.length > 0,
    did: tried.join(TRIED_JOIN),
    tried,
  };
}
