import { dayWords } from "../workspace/billing.js";
import { groupedPlural } from "../shared/words.js";
import { DAY_MS } from "../shared/time.js";
import { viaWords } from "./csv.js";
export const IMPORT_SOURCES = [
  "google_reviews",
  "calendar",
  "clients_file",
  "mailbox",
  "contacts",
  "whatsapp_contacts",
  "whatsapp_history"
];
export const HISTORY_BACK_DAYS = 180;
export const IMPORT_STOPPED_WORDS = {
  signedOut: "Your mailbox signed out. Connect it again in Connections, then Try again.",
  removed: "That mailbox was removed, so nothing more comes from it.",
  notTicked: (what) => `${what} weren't ticked when you connected. Connect it again and leave them ticked.`,
  failed: "It stopped part way. What came in is kept.",
  /** The clients' file is read in the browser: Try again is adding it again. */
  clientsAgain: "Add the file again from People \u203A Add people.",
  /** The kept WhatsApp app's history, declined in the app's own prompt (Meta's 2593109). */
  notShared: "Your chat history wasn't shared in the app, so older chats stay there. Every chat from now on comes in.",
  /** Meta offers the kept app's contacts and chats once, while the number connects (decision 0073, R21). */
  offeredOnce: "Meta offers it once, while the number connects. To bring it, connect WhatsApp again from Settings.",
  numberGone: "That WhatsApp number is no longer connected, so nothing more comes from it."
};
const ONCE_ONLY = /* @__PURE__ */ new Set(["whatsapp_contacts", "whatsapp_history"]);
export const IMPORT_STATES = ["queued", "running", "done", "failed"];
export const IMPORT_WORDS = {
  titles: {
    google_reviews: "Reviews",
    calendar: "Your calendar",
    clients_file: "Your clients",
    mailbox: "Your inbox",
    contacts: "Your contacts",
    whatsapp_contacts: "WhatsApp contacts",
    whatsapp_history: "WhatsApp chats"
  },
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
  bringing: (done, of) => `Bringing it in \xB7 ${done} of ${of}`,
  allIn: "All in",
  stoppedCount: (n) => `${n} stopped`,
  /** A run that stopped part way (IMPORT_STOPPED_WORDS.failed), said on its line with what it kept. */
  stoppedPartWay: "Stopped part way",
  setAside: (n) => `${n.toLocaleString("en-US")} newsletters and notices set aside`,
  card: "Brought in",
  whatsappLater: "Contacts and chats, once you approve"
};
const since = (oldest) => oldest ? `since ${dayWords(oldest)}` : null;
const joined = (...parts) => parts.filter(Boolean).join(" \xB7 ");
const countOfPeople = (n) => groupedPlural(n, "person", "people");
function mailSaysOf(r) {
  const c = r.counts;
  const n = c.messages ?? 0;
  const read = n ? `${groupedPlural(n, "email")}${r.state === "done" ? "" : " so far"}` : null;
  return joined(
    read ?? (r.state === "done" ? "No email from people" : "Reading your inbox"),
    since(r.oldest),
    c.unreadable ? `${c.unreadable.toLocaleString("en-US")} couldn't be read` : null
  );
}
function saysOf(r) {
  const c = r.counts;
  const via = viaWords(r.via);
  switch (r.source) {
    case "google_reviews":
      return c.reviews ? joined(
        groupedPlural(c.reviews, "review"),
        since(r.oldest),
        c.unanswered ? `${c.unanswered} wait for a reply` : null
      ) : "Reading them";
    case "calendar":
      return c.past === void 0 ? "Reading your calendar" : joined(
        c.past ? groupedPlural(c.past, "past appointment") : "No past appointments",
        c.coming ? `${c.coming} coming up` : null
      );
    case "clients_file":
      return c.people === void 0 ? "Reading your file" : joined(countOfPeople(c.people), via ? `from ${via}'s file` : "from your file");
    case "contacts":
      return c.people === void 0 ? "Reading them" : joined(countOfPeople(c.people), via);
    case "mailbox":
      return mailSaysOf(r);
    case "whatsapp_contacts":
      return c.people === void 0 ? "Reading them" : countOfPeople(c.people);
    case "whatsapp_history":
      return r.oldest ? `Back to ${dayWords(r.oldest)} so far` : "Chats from the last six months";
  }
}
function stoppedKept(r) {
  const c = r.counts;
  if (r.source === "mailbox") return c.messages ? groupedPlural(c.messages, "email") : null;
  if (c.people) return countOfPeople(c.people);
  if (c.reviews) return groupedPlural(c.reviews, "review");
  return c.past ? groupedPlural(c.past, "past appointment") : null;
}
function stoppedSaysOf(r) {
  if (r.last_error && r.last_error !== IMPORT_STOPPED_WORDS.failed) return r.last_error;
  const kept = stoppedKept(r);
  return joined(IMPORT_WORDS.stoppedPartWay, kept ? `${kept} kept` : null);
}
function shareOf(r) {
  if (r.state !== "running") return null;
  if (r.parts_total && r.parts_total > 1) return Math.min(0.99, r.parts_done / r.parts_total);
  if (r.source !== "mailbox" || !r.oldest || !r.started_at) return null;
  const read = (Date.parse(r.started_at) - Date.parse(r.oldest)) / (HISTORY_BACK_DAYS * DAY_MS);
  return Number.isFinite(read) ? Math.min(0.99, Math.max(0, read)) : null;
}
function standOf(r, share) {
  const W = IMPORT_WORDS;
  if (r.state === "done") return W.in;
  if (r.state === "failed") return W.stopped;
  if (r.state === "queued") return W.queued;
  if (r.source === "whatsapp_history" && r.parts_total && r.parts_total > 1)
    return `${r.parts_done} of ${r.parts_total}`;
  return share === null ? "\u2026" : `${Math.round(share * 100)}%`;
}
export function importLineOf(r) {
  const share = shareOf(r);
  return {
    source: r.source,
    title: IMPORT_WORDS.titles[r.source],
    says: r.state === "failed" ? stoppedSaysOf(r) : saysOf(r),
    stand: standOf(r, share),
    state: r.state,
    retry: r.state === "failed" && !ONCE_ONLY.has(r.source),
    share,
    aside: r.source === "mailbox" && r.state !== "failed" && r.counts.dropped ? IMPORT_WORDS.setAside(r.counts.dropped) : null
  };
}
export const WHATSAPP_PART_WORDS = {
  parts: [
    { key: "day", label: "The last day", back: 1 },
    { key: "quarter", label: "The last 90 days", back: 90 },
    { key: "half", label: "The last 6 months", back: HISTORY_BACK_DAYS }
  ],
  lastDay: "Chats from the last 24 hours",
  in: "In",
  coming: "Coming in",
  next: "Next",
  note: (assistant) => `Older chats show in each person's thread as before Chanlytics. ${assistant ?? "Your receptionist"} answers only what comes in from now.`
};
export function whatsappPartsOf(r) {
  if (!r || r.source !== "whatsapp_history" || r.state === "failed") return [];
  const W = WHATSAPP_PART_WORDS;
  const from = r.started_at ? Date.parse(r.started_at) : NaN;
  return W.parts.map((p, i) => {
    const state = r.state === "done" || r.parts_done > i ? "done" : r.parts_done === i && r.state === "running" ? "running" : "next";
    const back = Number.isFinite(from) ? `Back to ${dayWords(new Date(from - p.back * DAY_MS).toISOString())}` : "";
    return {
      key: p.key,
      label: p.label,
      says: p.key === "day" ? W.lastDay : back,
      stand: state === "done" ? W.in : state === "running" ? W.coming : W.next,
      state
    };
  });
}
export function importNotesOf(sources, rows) {
  if (!sources || !rows) return [];
  return rows.filter((r) => sources.includes(r.source)).map((r) => {
    const l = importLineOf(r);
    return { text: `${l.title}: ${l.says}${l.state === "done" ? "" : ` \xB7 ${l.stand}`}`, live: true };
  });
}
const SAID_ORDER = [
  "google_reviews",
  "calendar",
  "clients_file",
  "contacts",
  "mailbox",
  "whatsapp_contacts",
  "whatsapp_history"
];
export function importLinesOf(rows, o = { whatsappWaiting: false }) {
  const got = [...rows ?? []].sort((a, b) => SAID_ORDER.indexOf(a.source) - SAID_ORDER.indexOf(b.source));
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
      aside: null
    });
  const done = lines.filter((l) => l.state === "done").length;
  return { lines, done, of: lines.length, running: lines.some((l) => l.state === "running" || l.state === "queued") };
}
export function broughtInCardOf(rows, count) {
  const got = rows ?? [];
  if (!got.length) return null;
  const by = (s) => got.find((r) => r.source === s) ?? null;
  const reviews = by("google_reviews");
  const mail = by("mailbox");
  const cal = by("calendar");
  const first = joined(
    count ? countOfPeople(count) : null,
    reviews?.counts.reviews ? groupedPlural(reviews.counts.reviews, "review") : null
  );
  const facts = [];
  if (first) facts.push({ key: "people", text: first });
  if (mail?.oldest) facts.push({ key: "mail", text: `Email ${since(mail.oldest)}` });
  if (cal && cal.counts.past !== void 0) facts.push({ key: "calendar", text: saysOf(cal) });
  const stopped = got.filter((r) => r.state === "failed").length;
  const { done, of, running } = importLinesOf(got);
  const W = IMPORT_WORDS;
  const state = stopped ? { tone: "stopped", words: W.stoppedCount(stopped) } : running ? { tone: "live", words: W.bringing(done, of) } : { tone: "ok", words: W.allIn };
  return { title: W.card, state, facts };
}
const BROUGHT_IN_SHOWN_MS = 7 * DAY_MS;
export function broughtInShown(rows, nowMs) {
  const got = rows ?? [];
  if (!got.length) return false;
  if (got.some((r) => r.state !== "done")) return true;
  const last = Math.max(...got.map((r) => r.finished_at ? Date.parse(r.finished_at) : 0));
  return Number.isFinite(last) && nowMs - last < BROUGHT_IN_SHOWN_MS;
}
