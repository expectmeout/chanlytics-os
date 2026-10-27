/**
 * What was brought in (decision 0073, R23): one row per workspace and source in the imports ledger, written by the jobs
 * that bring a connection's history in (Google's reviews, the calendar, the clients' file, the mailbox, the contacts,
 * WhatsApp's contacts and chats) and read by the first run's "Bringing it in", Today's "Brought in" and Connections'
 * sentences. Everything brought is "before Chanlytics": shown, never counted as today's, never answered, never a yes
 * (decision 0073, D15 and D16). Every sentence is here; the pages compose.
 */
import { dayWords } from "../workspace/billing";
import { groupedPlural } from "../shared/words";
import { DAY_MS } from "../shared/time";
import { viaWords } from "./csv";

export const IMPORT_SOURCES = [
  "google_reviews",
  "calendar",
  "clients_file",
  "mailbox",
  "contacts",
  "whatsapp_contacts",
  "whatsapp_history",
] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** How far back a connection's history reaches: six months (decision 0073, R19 to R21). */
export const HISTORY_BACK_DAYS = 180;

/**
 * Why a source stopped, said on its row (ImportRowDto.last_error) with Try again beside it: the mailbox signed out, it
 * was removed, or the owner left the part unticked on the provider's screen.
 */
export const IMPORT_STOPPED_WORDS = {
  signedOut: "Your mailbox signed out. Connect it again in Connections, then Try again.",
  removed: "That mailbox was removed, so nothing more comes from it.",
  notTicked: (what: string) => `${what} weren't ticked when you connected. Connect it again and leave them ticked.`,
  failed: "It stopped part way. What came in is kept.",
  /** The clients' file is read in the browser: Try again is adding it again. */
  clientsAgain: "Add the file again from People › Add people.",
  /** The kept WhatsApp app's history, declined in the app's own prompt (Meta's 2593109). */
  notShared: "Your chat history wasn't shared in the app, so older chats stay there. Every chat from now on comes in.",
  /** Meta offers the kept app's contacts and chats once, while the number connects (decision 0073, R21). */
  offeredOnce: "Meta offers it once, while the number connects. To bring it, connect WhatsApp again from Settings.",
  numberGone: "That WhatsApp number is no longer connected, so nothing more comes from it.",
} as const;

/** What comes once, as a connection is made: a stop there is no Try again for (Meta's coexistence sync, R21). */
const ONCE_ONLY: ReadonlySet<ImportSource> = new Set<ImportSource>(["whatsapp_contacts", "whatsapp_history"]);

/** Where a source's run stands: waiting to start, bringing it in, done, or stopped with its error. */
export const IMPORT_STATES = ["queued", "running", "done", "failed"] as const;
export type ImportState = (typeof IMPORT_STATES)[number];

/** What a run brought, each count where the source has it: people, messages (email or chats), visits, reviews. */
export interface ImportCounts {
  people?: number;
  messages?: number;
  /** Mail read and dropped: newsletters, receipts and the rest (decision 0073, D9). */
  dropped?: number;
  /** Visits before today, and those coming up. */
  past?: number;
  coming?: number;
  reviews?: number;
  /** Reviews that wait for a reply. */
  unanswered?: number;
  /** Rows of a file that had neither a number nor an address; emails the mailbox refused to hand over. */
  unreadable?: number;
}

/** One source's row in the ledger, as the page reads it. */
export interface ImportRowDto {
  source: ImportSource;
  state: ImportState;
  counts: ImportCounts;
  /** Parts done of the parts there are, where the source runs in parts (Meta's three, the mailbox's pages). */
  parts_done: number;
  parts_total: number | null;
  /** How far back it reached, ISO; null before anything came. */
  oldest: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_error: string | null;
  /** The tool or provider it came from: "vagaro", "google", "microsoft", "link" (a calendar link). */
  via: string | null;
}

/** One line of "Bringing it in" or "Brought in": what it is, what came, and where it stands. */
export interface ImportLineVM {
  source: ImportSource;
  title: string;
  says: string;
  /** "In", "61%", "2 of 3", "At Go live", "Stopped". */
  stand: string;
  state: ImportState | "waiting";
  /** Retry, for a run that stopped. */
  retry: boolean;
  /** How far a run has come, 0 to 1, where the row can say it (shareOf); null where nothing does, and once it is in. */
  share: number | null;
  /** What the mailbox read and set aside, said apart under the line: "195 newsletters and notices set aside". */
  aside: string | null;
}

export const IMPORT_WORDS = {
  titles: {
    google_reviews: "Reviews",
    calendar: "Your calendar",
    clients_file: "Your clients",
    mailbox: "Your inbox",
    contacts: "Your contacts",
    whatsapp_contacts: "WhatsApp contacts",
    whatsapp_history: "WhatsApp chats",
  } as Record<ImportSource, string>,
  in: "In",
  stopped: "Stopped",
  queued: "Starting",
  atGoLive: "At Go live",
  retry: "Try again",
  /** Try again, pressed, until the run is heard starting. */
  starting: "Starting",
  heading: "Coming in while you go on",
  /** Under the sources, once: what came in is history on each person, never answered (decision 0073, D15 and D16). */
  foot: "Shown on each person as history, never answered.",
  /** Said only while something is still coming in. */
  keepsGoing: "Keeps going if you leave.",
  bringing: (done: number, of: number) => `Bringing it in · ${done} of ${of}`,
  allIn: "All in",
  stoppedCount: (n: number) => `${n} stopped`,
  /** A run that stopped part way (IMPORT_STOPPED_WORDS.failed), said on its line with what it kept. */
  stoppedPartWay: "Stopped part way",
  setAside: (n: number) => `${n.toLocaleString("en-US")} newsletters and notices set aside`,
  card: "Brought in",
  whatsappLater: "Contacts and chats, once you approve",
} as const;

/** How far back a source reached, "since Apr 23", or null before anything came. */
const since = (oldest: string | null): string | null => (oldest ? `since ${dayWords(oldest)}` : null);
/** The parts of a line that have something to say, one " · " apart. */
const joined = (...parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(" · ");
const people = (n: number): string => groupedPlural(n, "person", "people");

/** What the mailbox brought: the emails from people (so far, while it reads), since when, and any it could not read. */
function mailSaysOf(r: ImportRowDto): string {
  const c = r.counts;
  const n = c.messages ?? 0;
  const read = n ? `${groupedPlural(n, "email")}${r.state === "done" ? "" : " so far"}` : null;
  return joined(
    read ?? (r.state === "done" ? "No email from people" : "Reading your inbox"),
    since(r.oldest),
    c.unreadable ? `${c.unreadable.toLocaleString("en-US")} couldn't be read` : null,
  );
}

/** What one source brought, in words. */
function saysOf(r: ImportRowDto): string {
  const c = r.counts;
  const via = viaWords(r.via);
  switch (r.source) {
    case "google_reviews":
      return c.reviews
        ? joined(
            groupedPlural(c.reviews, "review"),
            since(r.oldest),
            c.unanswered ? `${c.unanswered} wait for a reply` : null,
          )
        : "Reading them";
    case "calendar":
      return c.past === undefined
        ? "Reading your calendar"
        : joined(
            c.past ? groupedPlural(c.past, "past appointment") : "No past appointments",
            c.coming ? `${c.coming} coming up` : null,
          );
    case "clients_file":
      return c.people === undefined
        ? "Reading your file"
        : joined(people(c.people), via ? `from ${via}'s file` : "from your file");
    case "contacts":
      return c.people === undefined ? "Reading them" : joined(people(c.people), via);
    case "mailbox":
      return mailSaysOf(r);
    case "whatsapp_contacts":
      return c.people === undefined ? "Reading them" : people(c.people);
    case "whatsapp_history":
      return r.oldest ? `Back to ${dayWords(r.oldest)} so far` : "Chats from the last six months";
  }
}

/** What a run that stopped kept, counted as its line counts it: "130 emails", or null where nothing came. */
function keptOf(r: ImportRowDto): string | null {
  const c = r.counts;
  if (r.source === "mailbox") return c.messages ? groupedPlural(c.messages, "email") : null;
  if (c.people) return people(c.people);
  if (c.reviews) return groupedPlural(c.reviews, "review");
  return c.past ? groupedPlural(c.past, "past appointment") : null;
}

/**
 * A stopped line's words: why, where the run said a reason the owner acts on (signed out, removed, not ticked); and
 * otherwise that it stopped part way, with what it kept ("Stopped part way · 130 emails kept").
 */
function stoppedSaysOf(r: ImportRowDto): string {
  if (r.last_error && r.last_error !== IMPORT_STOPPED_WORDS.failed) return r.last_error;
  const kept = keptOf(r);
  return joined(IMPORT_WORDS.stoppedPartWay, kept ? `${kept} kept` : null);
}

/**
 * How far a running source has come, 0 to 1, never 1 before it is in: Meta's parts, or the mailbox's pages, as a share
 * of the parts there are; else the mailbox by how far back it has read of the six months it reaches (from when the run
 * started to the oldest email kept so far), which the row holds. Null where the row says nothing of it.
 */
function shareOf(r: ImportRowDto): number | null {
  if (r.state !== "running") return null;
  if (r.parts_total && r.parts_total > 1) return Math.min(0.99, r.parts_done / r.parts_total);
  if (r.source !== "mailbox" || !r.oldest || !r.started_at) return null;
  const read = (Date.parse(r.started_at) - Date.parse(r.oldest)) / (HISTORY_BACK_DAYS * DAY_MS);
  return Number.isFinite(read) ? Math.min(0.99, Math.max(0, read)) : null;
}

/** Where a source's run stands, in the line's last word. */
function standOf(r: ImportRowDto, share: number | null): string {
  const W = IMPORT_WORDS;
  if (r.state === "done") return W.in;
  if (r.state === "failed") return W.stopped;
  if (r.state === "queued") return W.queued;
  // Meta's history comes in three parts, said as parts; anything else that can say how far it has come, as a share.
  if (r.source === "whatsapp_history" && r.parts_total && r.parts_total > 1)
    return `${r.parts_done} of ${r.parts_total}`;
  return share === null ? "…" : `${Math.round(share * 100)}%`;
}

/** One source's line. */
export function importLineOf(r: ImportRowDto): ImportLineVM {
  const share = shareOf(r);
  return {
    source: r.source,
    title: IMPORT_WORDS.titles[r.source],
    says: r.state === "failed" ? stoppedSaysOf(r) : saysOf(r),
    stand: standOf(r, share),
    state: r.state,
    retry: r.state === "failed" && !ONCE_ONLY.has(r.source),
    share,
    aside: r.source === "mailbox" && r.counts.dropped ? IMPORT_WORDS.setAside(r.counts.dropped) : null,
  };
}

/** One of Meta's three parts of the kept app's history (canvas 5B·i): which days, how far back, and where it stands. */
export interface WhatsappPartVM {
  key: "day" | "quarter" | "half";
  label: string;
  says: string;
  stand: string;
  state: "done" | "running" | "next";
}

/** The words of "Your chats, coming in" (canvas 5B·i): Meta's three parts, and what the chats are once in. */
export const WHATSAPP_PART_WORDS = {
  parts: [
    { key: "day", label: "The last day", back: 1 },
    { key: "quarter", label: "The last 90 days", back: 90 },
    { key: "half", label: "The last 6 months", back: HISTORY_BACK_DAYS },
  ] as const,
  lastDay: "Chats from the last 24 hours",
  in: "In",
  coming: "Coming in",
  next: "Next",
  note: (assistant: string | null) =>
    `Older chats show in each person's thread as before Chanlytics. ${assistant ?? "Your receptionist"} answers only what comes in from now.`,
} as const;

/**
 * The kept app's history in Meta's three parts (canvas 5B·i): the day before the number connected, back to 90 days,
 * back to 180, each in, coming in or next by the parts Meta has finished (the row's parts_done), and how far back each
 * reaches from when the run started. Nothing for a run that stopped: its row says why.
 */
export function whatsappPartsOf(r: ImportRowDto | null | undefined): WhatsappPartVM[] {
  if (!r || r.source !== "whatsapp_history" || r.state === "failed") return [];
  const W = WHATSAPP_PART_WORDS;
  const from = r.started_at ? Date.parse(r.started_at) : NaN;
  return W.parts.map((p, i) => {
    const state: WhatsappPartVM["state"] =
      r.state === "done" || r.parts_done > i
        ? "done"
        : r.parts_done === i && r.state === "running"
          ? "running"
          : "next";
    const back = Number.isFinite(from) ? `Back to ${dayWords(new Date(from - p.back * DAY_MS).toISOString())}` : "";
    return {
      key: p.key,
      label: p.label,
      says: p.key === "day" ? W.lastDay : back,
      stand: state === "done" ? W.in : state === "running" ? W.coming : W.next,
      state,
    };
  });
}

/**
 * What a connection brought in, a line a source on its row in Connections ("Reviews: All 312, back to Mar 4 · 4 wait
 * for a reply"), with where it stands while it is still coming; a source that stopped says why. Always said.
 */
export function importNotesOf(
  sources: readonly ImportSource[] | undefined,
  rows: readonly ImportRowDto[] | null | undefined,
): { text: string; live: true }[] {
  if (!sources || !rows) return [];
  return rows
    .filter((r) => sources.includes(r.source))
    .map((r) => {
      const l = importLineOf(r);
      return { text: `${l.title}: ${l.says}${l.state === "done" ? "" : ` · ${l.stand}`}`, live: true as const };
    });
}

/** Sources in the order they are said: what came first, then what is still coming. */
const SAID_ORDER: readonly ImportSource[] = [
  "google_reviews",
  "calendar",
  "clients_file",
  "contacts",
  "mailbox",
  "whatsapp_contacts",
  "whatsapp_history",
];

/**
 * "Bringing it in" (the first run's step 4, 4·k) and Today's "Brought in" (T·g): a line per source the ledger holds, in
 * order, and WhatsApp's own waiting line where it was chosen and has not started (it starts at Go live). `done` and
 * `of` are the count for "Bringing it in · 2 of 6".
 */
export function importLinesOf(
  rows: readonly ImportRowDto[] | null | undefined,
  o: { whatsappWaiting: boolean } = { whatsappWaiting: false },
): { lines: ImportLineVM[]; done: number; of: number; running: boolean } {
  const got = [...(rows ?? [])].sort((a, b) => SAID_ORDER.indexOf(a.source) - SAID_ORDER.indexOf(b.source));
  const lines = got.map(importLineOf);
  const hasWhatsapp = got.some((r) => r.source === "whatsapp_contacts" || r.source === "whatsapp_history");
  if (o.whatsappWaiting && !hasWhatsapp)
    lines.push({
      source: "whatsapp_history",
      title: "WhatsApp",
      says: IMPORT_WORDS.whatsappLater,
      stand: IMPORT_WORDS.atGoLive,
      state: "waiting",
      retry: false,
      share: null,
      aside: null,
    });
  const done = lines.filter((l) => l.state === "done").length;
  return { lines, done, of: lines.length, running: lines.some((l) => l.state === "running" || l.state === "queued") };
}

/** One of the Brought in card's facts, closed: what it counts (the page draws its glyph) and its words. */
export interface BroughtInFactVM {
  key: "people" | "mail" | "calendar";
  text: string;
}

/** Where everything brought in stands, said once in the card's head: still coming, all in, or some stopped. */
export interface BroughtInStateVM {
  tone: "live" | "ok" | "stopped";
  words: string;
}

/**
 * Today's "Brought in" card (T-today): its title; where it all stands ("Bringing it in · 2 of 3", "All in",
 * "1 stopped"); and, closed, the people and the reviews, how far back email reached and the calendar, a short fact
 * each. Opened, it is the sources' own lines (importLinesOf). Null while nothing came.
 */
export function broughtInCardOf(
  rows: readonly ImportRowDto[] | null | undefined,
  count: number | null,
): { title: string; state: BroughtInStateVM; facts: BroughtInFactVM[] } | null {
  const got = rows ?? [];
  if (!got.length) return null;
  const by = (s: ImportSource) => got.find((r) => r.source === s) ?? null;
  const reviews = by("google_reviews");
  const mail = by("mailbox");
  const cal = by("calendar");
  const first = joined(
    count ? people(count) : null,
    reviews?.counts.reviews ? groupedPlural(reviews.counts.reviews, "review") : null,
  );
  const facts: BroughtInFactVM[] = [];
  if (first) facts.push({ key: "people", text: first });
  if (mail?.oldest) facts.push({ key: "mail", text: `Email ${since(mail.oldest)}` });
  if (cal && cal.counts.past !== undefined) facts.push({ key: "calendar", text: saysOf(cal) });
  const stopped = got.filter((r) => r.state === "failed").length;
  const { done, of, running } = importLinesOf(got);
  const W = IMPORT_WORDS;
  const state: BroughtInStateVM = stopped
    ? { tone: "stopped", words: W.stoppedCount(stopped) }
    : running
      ? { tone: "live", words: W.bringing(done, of) }
      : { tone: "ok", words: W.allIn };
  return { title: W.card, state, facts };
}

/** How long Today keeps its Brought in card after the last source finished: the first week. */
const BROUGHT_IN_SHOWN_MS = 7 * DAY_MS;

/**
 * Whether Today draws its Brought in card (T-today): while anything is still coming in, a source stopped, or within a
 * week of the last one finishing. After that what came in is People's, the Inbox's and the Calendar's own.
 */
export function broughtInShown(rows: readonly ImportRowDto[] | null | undefined, nowMs: number): boolean {
  const got = rows ?? [];
  if (!got.length) return false;
  if (got.some((r) => r.state !== "done")) return true;
  const last = Math.max(...got.map((r) => (r.finished_at ? Date.parse(r.finished_at) : 0)));
  return Number.isFinite(last) && nowMs - last < BROUGHT_IN_SHOWN_MS;
}
