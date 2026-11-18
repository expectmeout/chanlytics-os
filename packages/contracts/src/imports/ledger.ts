/**
 * What was brought in (decision 0073, R23; 0086): one row a workspace and source in the imports ledger, and one a mailbox
 * for what a mailbox brings (PER_MAILBOX_SOURCES), each source said once (sourceRowsOf), written by the jobs
 * that bring a connection's history in (Google's reviews, the calendar, the clients' file, the mailbox, the contacts,
 * WhatsApp's contacts and chats) and read by the first run's "Bringing it in", Today's setting-up card and Connections'
 * sentences. Everything brought is "before Chanlytics": shown, never counted as today's, never answered, never a yes
 * (decision 0073, D15 and D16). Every sentence is here; the pages compose.
 */
import { billingDayWords } from "../workspace/billing/plans";
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
  "google_photos",
  // What a business's own website shows and plays, and its Instagram's posts and reels (Content's empty state, 14 Nov 2026).
  "website_media",
  "instagram",
] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** What a mailbox brings, each mailbox its own row (00499): its six months, its contacts. Every other source is the workspace's. */
export const PER_MAILBOX_SOURCES: readonly ImportSource[] = ["mailbox", "contacts"];

/** How far back a connection's history reaches: six months (decision 0073, R19 to R21). */
export const HISTORY_BACK_DAYS = 180;

/**
 * Why a source stopped, said on its row (ImportRowDto.last_error) with Try again beside it: the mailbox signed out, it
 * was removed, or the owner left the part unticked on the provider's screen.
 */
export const IMPORT_STOPPED_WORDS = {
  signedOut: "Your mailbox signed out. Connect it again in Connections, then Try again.",
  removed: "That mailbox was removed, so nothing more comes from it.",
  notTicked: (text: string) => `${text} weren't ticked when you connected. Connect it again and leave them ticked.`,
  failed: "It stopped part way. What came in is kept.",
  /** The clients' file is read in the browser: Try again is adding it again. */
  clientsAgain: "Add the file again from People › Add people.",
  /** The kept WhatsApp app's history, declined in the app's own prompt (Meta's 2593109). */
  notShared: "Your chat history wasn't shared in the app, so older chats stay there. Every chat from now on comes in.",
  /** Meta offers the kept app's contacts and chats once, while the number connects (decision 0073, R21). */
  offeredOnce: "Meta offers it once, while the number connects. To bring it, connect WhatsApp again from Settings.",
  numberGone: "That WhatsApp number is no longer connected, so nothing more comes from it.",
  googleSignedOut: "Your Google profile signed out. Connect it again in Connections, then Try again.",
  /** Files holds as many as it can: what came in is kept, and room makes Try again worth pressing. */
  filesFull: "Your Files are full. Remove some, then Try again.",
  googleGone: "That Google profile is no longer connected, so nothing more comes from it.",
  /** Stopped on Connections by someone who may change the settings (0086): Resume picks it up where it stopped. */
  byYou: "Stopped. What came in is kept.",
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
  /**
   * Strangers the mailbox's six months found asking about the business's services (decision 0080): each read as an
   * inquiry, and each someone the owner never wrote to, so never answered by email.
   */
  asked?: number;
  /** Visits before today, and those coming up. */
  past?: number;
  coming?: number;
  reviews?: number;
  /** Photos brought in from the business's own Google profile, its website or its Instagram. */
  photos?: number;
  /** Videos brought in from its website or its Instagram. */
  videos?: number;
  /** Reviews that wait for a reply. */
  unanswered?: number;
  /** Rows of a file that had neither a number nor an address; emails the mailbox refused to hand over. */
  unreadable?: number;
}

/** One row of the ledger, as the page reads it: a source's, or one mailbox's of a source it brings. */
export interface ImportRowDto {
  source: ImportSource;
  /** The mailbox it came through (PER_MAILBOX_SOURCES); null for the workspace's own source. */
  connection_id: string | null;
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

/** One line of "Bringing it in": what it is, what came, and where it stands. */
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
  /** What the mailbox read and set aside, said apart under the line: "195 newsletters, notices and pitches set aside". */
  aside: string | null;
  /** The count `says` opens with ("414" of "414 emails · since Jun 7"), which a page may let glide as it grows. */
  count: number | null;
}

/** The row of Connections a mailbox's "Left in your mailbox" is, as Settings' address names it (settings/frame/tabs.ts). */
export const MAILBOX_LEFT_ROW = "left";

export const IMPORT_WORDS = {
  titles: {
    google_reviews: "Reviews",
    calendar: "Your calendar",
    clients_file: "Your clients",
    mailbox: "Your inbox",
    contacts: "Your contacts",
    whatsapp_contacts: "WhatsApp contacts",
    whatsapp_history: "WhatsApp chats",
    google_photos: "Your Google photos",
    website_media: "Your website's photos and videos",
    instagram: "Your Instagram",
  } satisfies Record<ImportSource, string>,
  in: "In",
  stopped: "Stopped",
  queued: "Starting",
  atGoLive: "At Go live",
  retry: "Try again",
  /** Try again, pressed, until the run is heard starting. */
  starting: "Starting",
  heading: "Coming in while you go on",
  /**
   * Under the sources, once: what came in is history on each person, never answered (decision 0073, D15 and D16). Said
   * of the people in it, plainly, so an owner who brought six months of mail in knows nobody in it is written to.
   */
  foot: "Shown on each person as history. Nobody in it is answered.",
  /** Said only while something is still coming in. */
  keepsGoing: "Keeps going if you leave.",
  bringing: (done: number, of: number) => `Bringing it in · ${done} of ${of}`,
  /** Today's line while the business's history is still coming in, and how far it has come ("2 of 3 in"). */
  historyComing: "Bringing in your history",
  /** Its dot's name, for a reader. */
  comingIn: "Coming in",
  inSoFar: (done: number, of: number) => `${done} of ${of} in`,
  /** Today's row for a source that stopped, Try again beside it: "Your inbox stopped coming in". */
  stoppedComing: (title: string) => `${title} stopped coming in`,
  /** Under it where the run kept nothing it can count. */
  keptSoFar: "What came in is kept.",
  /** A run that stopped part way (IMPORT_STOPPED_WORDS.failed), said on its line with what it kept. */
  stoppedPartWay: "Stopped part way",
  setAside: (n: number) => `${n.toLocaleString("en-US")} newsletters, notices and pitches set aside`,
  /** The strangers who asked about the business's services and were never answered by email (decision 0080). */
  asked: (n: number) => `${n.toLocaleString("en-US")} asked about your services and never got an answer`,
  whatsappLater: "Contacts and chats, once you approve",
} as const;

/** How far back a source reached, "since Apr 23" by the workspace's calendar (`tz`), or null before anything came. */
const since = (oldest: string | null, tz: string): string | null =>
  oldest ? `since ${billingDayWords(oldest, tz)}` : null;
/** The parts of a line that have something to say, one " · " apart. */
const joined = (...parts: (string | null | undefined)[]): string => parts.filter(Boolean).join(" · ");
const countOfPeople = (n: number): string => groupedPlural(n, "person", "people");

/** What the mailbox brought: the emails from people (so far, while it reads), since when, and any it could not read. */
function mailSaysOf(importRow: ImportRowDto, tz: string): string {
  const counts = importRow.counts;
  const messageCount = counts.messages ?? 0;
  const read = messageCount
    ? `${groupedPlural(messageCount, "email")}${importRow.state === "done" ? "" : " so far"}`
    : null;
  return joined(
    read ?? (importRow.state === "done" ? "No email from people" : "Reading your inbox"),
    counts.asked ? IMPORT_WORDS.asked(counts.asked) : null,
    since(importRow.oldest, tz),
    counts.unreadable ? `${counts.unreadable.toLocaleString("en-US")} couldn't be read` : null,
  );
}

/** What a website's or an Instagram's photos and videos brought: "12 photos · 3 videos", and whose, or that they are being read. */
function mediaSaysOf(counts: ImportCounts, via: string | null): string {
  if (counts.photos === undefined && counts.videos === undefined) return "Reading them";
  return joined(
    groupedPlural(counts.photos ?? 0, "photo"),
    counts.videos ? groupedPlural(counts.videos, "video") : null,
    via,
  );
}

/** What one source brought, in words, its days by the workspace's calendar (`tz`). */
function saysOf(otherImport: ImportRowDto, tz: string): string {
  const counts = otherImport.counts;
  const via = viaWords(otherImport.via);
  switch (otherImport.source) {
    case "google_reviews":
      return counts.reviews
        ? joined(
            groupedPlural(counts.reviews, "review"),
            since(otherImport.oldest, tz),
            counts.unanswered ? `${counts.unanswered} wait for a reply` : null,
          )
        : "Reading them";
    case "calendar":
      return counts.past === undefined
        ? "Reading your calendar"
        : joined(
            counts.past ? groupedPlural(counts.past, "past appointment") : "No past appointments",
            counts.coming ? `${counts.coming} coming up` : null,
          );
    case "clients_file":
      return counts.people === undefined
        ? "Reading your file"
        : joined(countOfPeople(counts.people), via ? `from ${via}'s file` : "from your file");
    case "contacts":
      return counts.people === undefined ? "Reading them" : joined(countOfPeople(counts.people), via);
    case "mailbox":
      return mailSaysOf(otherImport, tz);
    case "google_photos":
      return counts.photos === undefined ? "Reading them" : groupedPlural(counts.photos, "photo");
    case "website_media":
    case "instagram":
      return mediaSaysOf(counts, via);
    case "whatsapp_contacts":
      return counts.people === undefined ? "Reading them" : countOfPeople(counts.people);
    case "whatsapp_history":
      return otherImport.oldest
        ? `Back to ${billingDayWords(otherImport.oldest, tz)} so far`
        : "Chats from the last six months";
  }
}

/** What a run that stopped kept, counted as its line counts it: "130 emails", or null where nothing came. */
function stoppedKept(r: ImportRowDto): string | null {
  const c = r.counts;
  if (r.source === "mailbox") return c.messages ? groupedPlural(c.messages, "email") : null;
  if (c.photos) return groupedPlural(c.photos, "photo");
  if (c.people) return countOfPeople(c.people);
  if (c.reviews) return groupedPlural(c.reviews, "review");
  return c.past ? groupedPlural(c.past, "past appointment") : null;
}

/**
 * A stopped line's words: why, where the run said a reason the owner acts on (signed out, removed, not ticked); and
 * otherwise that it stopped part way, with what it kept ("Stopped part way · 130 emails kept").
 */
function stoppedSaysOf(r: ImportRowDto): string {
  if (r.last_error && r.last_error !== IMPORT_STOPPED_WORDS.failed) return r.last_error;
  const kept = stoppedKept(r);
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
  const words = IMPORT_WORDS;
  if (r.state === "done") return words.in;
  if (r.state === "failed") return words.stopped;
  if (r.state === "queued") return words.queued;
  // Meta's history comes in three parts, said as parts; anything else that can say how far it has come, as a share.
  if (r.source === "whatsapp_history" && r.parts_total && r.parts_total > 1)
    return `${r.parts_done} of ${r.parts_total}`;
  return share === null ? "…" : `${Math.round(share * 100)}%`;
}

/** The count a line's words open with, where they open with one: never a stopped line's, nor the chats' "Back to". */
function leadCountOf(r: ImportRowDto): number | null {
  const c = r.counts;
  if (r.state === "failed") return null;
  if (r.source === "mailbox") return c.messages || null;
  if (r.source === "google_reviews") return c.reviews || null;
  if (r.source === "google_photos" || r.source === "website_media" || r.source === "instagram") return c.photos || null;
  if (r.source === "calendar") return c.past || null;
  return r.source === "whatsapp_history" ? null : (c.people ?? null);
}

/** One source's line. */
export function importLineOf(otherImport: ImportRowDto, tz: string): ImportLineVM {
  const share = shareOf(otherImport);
  const aside =
    otherImport.source === "mailbox" && otherImport.state !== "failed" && otherImport.counts.dropped
      ? IMPORT_WORDS.setAside(otherImport.counts.dropped)
      : null;
  return {
    source: otherImport.source,
    title: IMPORT_WORDS.titles[otherImport.source],
    says: otherImport.state === "failed" ? stoppedSaysOf(otherImport) : saysOf(otherImport, tz),
    stand: standOf(otherImport, share),
    state: otherImport.state,
    retry: otherImport.state === "failed" && !ONCE_ONLY.has(otherImport.source),
    share,
    aside,
    count: leadCountOf(otherImport),
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
    `Older chats show in each person's conversation as before Chanlytics. ${assistant ?? "AI"} answers only what comes in from now.`,
} as const;

/**
 * The kept app's history in Meta's three parts (canvas 5B·i): the day before the number connected, back to 90 days,
 * back to 180, each in, coming in or next by the parts Meta has finished (the row's parts_done), and how far back each
 * reaches from when the run started. Nothing for a run that stopped: its row says why.
 */
export function whatsappPartsOf(otherImport: ImportRowDto | null | undefined, tz: string): WhatsappPartVM[] {
  if (!otherImport || otherImport.source !== "whatsapp_history" || otherImport.state === "failed") return [];
  const words = WHATSAPP_PART_WORDS;
  const from = otherImport.started_at ? Date.parse(otherImport.started_at) : NaN;
  return words.parts.map((part, partIndex) => {
    const state: WhatsappPartVM["state"] =
      otherImport.state === "done" || otherImport.parts_done > partIndex
        ? "done"
        : otherImport.parts_done === partIndex && otherImport.state === "running"
          ? "running"
          : "next";
    const back = Number.isFinite(from)
      ? `Back to ${billingDayWords(new Date(from - part.back * DAY_MS).toISOString(), tz)}`
      : "";
    return {
      key: part.key,
      label: part.label,
      says: part.key === "day" ? words.lastDay : back,
      stand: state === "done" ? words.in : state === "running" ? words.coming : words.next,
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
  tz: string,
): { text: string; live: true }[] {
  if (!sources || !rows) return [];
  return sourceRowsOf(rows)
    .filter((r) => sources.includes(r.source))
    .map((r) => {
      const l = importLineOf(r, tz);
      return { text: `${l.title}: ${l.says}${l.state === "done" ? "" : ` · ${l.stand}`}`, live: true as const };
    });
}

/** A source's stands, the most pressing first: one still coming says it is coming, else one that stopped, else done. */
const STANDING: readonly ImportState[] = ["running", "queued", "failed", "done"];

/** The earliest, or the latest, of some moments; null where none is. */
const momentOf = (pick: "min" | "max", at: readonly (string | null)[]): string | null => {
  const ms = at.flatMap((a) => (a ? [Date.parse(a)] : [])).filter(Number.isFinite);
  return ms.length ? new Date(pick === "min" ? Math.min(...ms) : Math.max(...ms)).toISOString() : null;
};

/**
 * One row a source (0086): every mailbox's row of a source a mailbox brings, said as the one source the pages name
 * ("Your inbox · 414 emails"), its counts added, its stand the most pressing of theirs (a mailbox still bringing its mail
 * in says the inbox is), how far back the furthest reached. A source with one row is that row.
 */
export function sourceRowsOf(rows: readonly ImportRowDto[] | null | undefined): ImportRowDto[] {
  const by = new Map<ImportSource, ImportRowDto[]>();
  for (const r of rows ?? []) by.set(r.source, [...(by.get(r.source) ?? []), r]);
  return [...by.values()].map((group) => {
    const [only, ...more] = group;
    if (!more.length && only) return only;
    const state = STANDING.find((s) => group.some((r) => r.state === s)) ?? "done";
    const counts: Record<string, number> = {};
    for (const r of group)
      for (const [k, n] of Object.entries(r.counts)) if (typeof n === "number") counts[k] = (counts[k] ?? 0) + n;
    const totals = group.map((r) => r.parts_total);
    return {
      source: group[0]?.source ?? "mailbox",
      connection_id: null,
      state,
      counts,
      parts_done: group.reduce((n, r) => n + r.parts_done, 0),
      parts_total: totals.every((t) => t !== null) ? totals.reduce<number>((n, t) => n + (t ?? 0), 0) : null,
      oldest: momentOf(
        "min",
        group.map((r) => r.oldest),
      ),
      started_at: momentOf(
        "min",
        group.map((r) => r.started_at),
      ),
      finished_at:
        state === "done"
          ? momentOf(
              "max",
              group.map((r) => r.finished_at),
            )
          : null,
      last_error: state === "failed" ? (group.find((r) => r.state === "failed")?.last_error ?? null) : null,
      via: group.find((r) => r.via)?.via ?? null,
    };
  });
}

/** Sources in the order they are said: what came first, then what is still coming. */
const SAID_ORDER: readonly ImportSource[] = [
  "google_reviews",
  "google_photos",
  "website_media",
  "instagram",
  "calendar",
  "clients_file",
  "contacts",
  "mailbox",
  "whatsapp_contacts",
  "whatsapp_history",
];

/**
 * "Bringing it in" (the first run's step 4, 4·k): a line per source the ledger holds, in
 * order, and WhatsApp's own waiting line where it was chosen and has not started (it starts at Go live). `done` and
 * `of` are the count for "Bringing it in · 2 of 6".
 */
export function importLinesOf(
  rows: readonly ImportRowDto[] | null | undefined,
  tz: string,
  options: { whatsappWaiting: boolean } = { whatsappWaiting: false },
): { lines: ImportLineVM[]; done: number; of: number; running: boolean } {
  const sourceRows = sourceRowsOf(rows).sort((a, b) => SAID_ORDER.indexOf(a.source) - SAID_ORDER.indexOf(b.source));
  const lines = sourceRows.map((r) => importLineOf(r, tz));
  const hasWhatsapp = sourceRows.some((r) => r.source === "whatsapp_contacts" || r.source === "whatsapp_history");
  if (options.whatsappWaiting && !hasWhatsapp)
    lines.push({
      source: "whatsapp_history",
      title: "WhatsApp",
      says: IMPORT_WORDS.whatsappLater,
      stand: IMPORT_WORDS.atGoLive,
      state: "waiting",
      retry: false,
      share: null,
      aside: null,
      count: null,
    });
  const done = lines.filter((l) => l.state === "done").length;
  return { lines, done, of: lines.length, running: lines.some((l) => l.state === "running" || l.state === "queued") };
}

/**
 * What Content reads for itself: a profile's, a website's and an Instagram's photos and videos, read again as they
 * change and said on Content's own card. Never the business's history from before Chanlytics, so never Today's.
 */
const CONTENT_SOURCES: ReadonlySet<ImportSource> = new Set<ImportSource>([
  "google_photos",
  "website_media",
  "instagram",
]);

/**
 * A stop trying again does not mend: the owner stopped it themselves (Connections' Resume picks it up), or what it came
 * through is gone. Connections says each on its own row; Today asks for nothing it cannot give.
 */
const NOT_MENDED_BY_TRYING: ReadonlySet<string> = new Set<string>([
  IMPORT_STOPPED_WORDS.byYou,
  IMPORT_STOPPED_WORDS.removed,
  IMPORT_STOPPED_WORDS.numberGone,
  IMPORT_STOPPED_WORDS.googleGone,
]);

/** The stands of a run still coming in: waiting to start, or bringing it in. */
const STILL_COMING: ReadonlySet<ImportState> = new Set<ImportState>(["queued", "running"]);

/** A source that stopped where Try again can bring it in, as Today's setting-up card says it. */
export interface HistoryStoppedVM {
  source: ImportSource;
  /** What happened: "Your inbox stopped coming in". */
  name: string;
  /** Why, where the run said a reason the owner acts on; else what it kept. */
  says: string;
}

/** What Today says of the business's history while there is something to say. */
export interface HistoryOnTodayVM {
  /** While any of it is still coming in: one line, and how far it has come. */
  coming: { name: string; says: string } | null;
  stopped: HistoryStoppedVM[];
}

/** Whether Today offers Try again for a stopped source: one the press can start again (never the clients' file, added again from People). */
const triedAgainFromToday = (run: ImportRowDto): boolean =>
  run.state === "failed" &&
  !ONCE_ONLY.has(run.source) &&
  run.source !== "clients_file" &&
  !(run.last_error && NOT_MENDED_BY_TRYING.has(run.last_error));

/**
 * The business's history on Today (18 Nov 2026, Ruben: a card of its own, "Your history · All in", was a fact with
 * nothing to do beside the queue): rows in the setting-up card, and only while they help. One line while any of it is
 * still coming in, and a row for each source that stopped where Try again can bring it in. Null otherwise: once it is all
 * in, what came in is People's, the Inbox's, the Calendar's and Reviews' own, and Connections says each source on its row.
 * Content's own reads (CONTENT_SOURCES) are never counted: a website read again each month brought the card back.
 */
export function historyOnTodayOf(rows: readonly ImportRowDto[] | null | undefined): HistoryOnTodayVM | null {
  const history = sourceRowsOf(rows)
    .filter((run) => !CONTENT_SOURCES.has(run.source))
    .sort((first, next) => SAID_ORDER.indexOf(first.source) - SAID_ORDER.indexOf(next.source));
  const words = IMPORT_WORDS;
  const stopped = history.filter(triedAgainFromToday).map((run): HistoryStoppedVM => {
    const kept = stoppedKept(run);
    return {
      source: run.source,
      name: words.stoppedComing(words.titles[run.source]),
      says:
        run.last_error && run.last_error !== IMPORT_STOPPED_WORDS.failed
          ? run.last_error
          : kept
            ? `${kept} kept`
            : words.keptSoFar,
    };
  });
  const coming = history.some((run) => STILL_COMING.has(run.state));
  if (!coming && !stopped.length) return null;
  const done = history.filter((run) => run.state === "done").length;
  return {
    coming: coming
      ? { name: words.historyComing, says: joined(words.inSoFar(done, history.length), words.keepsGoing) }
      : null,
    stopped,
  };
}
