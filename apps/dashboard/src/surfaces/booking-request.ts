/**
 * A booking the receptionist asked for, answered (decision 0061): Booked it or Can't, committed through its verb
 * (contracts PROPOSAL_SPECS booking_request), whichever page pressed it: Today's row, the Inbox's thread and the Calendar's
 * visit make the same call and say the same receipt. Booked it answers with the reply it drafts for the member to send;
 * the page carries it into the thread's box.
 *
 * And the other times to offer in its place: the business's real open times (GET ask/openings), which Today's Another
 * time lists to pick from and the thread's Can't do it writes into the reply (Ruben's call, 18 Nov 2026).
 */
import { dayPlusInZone, otherTimeWords } from "@chanlytics/contracts";
import { api } from "@/bridge/api";
import { commitVerb } from "@/bridge/verbs/commit";
import { workspaceZone } from "@/bridge/zone";

/** What the door answered: the reply Booked it drafts (null for Can't) and the receipt, or its refusal in a sentence. */
type RequestAnswered = { ok: true; reply: string | null; receipt: string } | { ok: false; message: string };

export async function answerRequest(conversationId: string, booked: boolean, who: string): Promise<RequestAnswered> {
  const r = await commitVerb("booking_request", { conversation_id: conversationId, booked, who });
  if (!r.ok) return { ok: false, message: r.message };
  const reply: unknown = r.data && typeof r.data === "object" ? Reflect.get(r.data, "reply") : null;
  return { ok: true, reply: typeof reply === "string" ? reply : null, receipt: r.receipt };
}

/** One open time to offer: its words, its day's, and a word for the two together. */
export interface OpenTime {
  key: string;
  time: string;
  day: string;
}

/** How many open times Can't do it's reply offers: the two a person can weigh in one sentence. */
const TIMES_IN_A_REPLY = 2;

/** A day of the open times as a press and a sentence say it: "Today", "Tomorrow", "Wed, Nov 11". */
function openDayWord(key: string, tz: string, nowMs: number): string {
  if (key === dayPlusInZone(tz, nowMs, 0).key) return "Today";
  if (key === dayPlusInZone(tz, nowMs, 1).key) return "Tomorrow";
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(
    Date.UTC(y, m - 1, d),
  );
}

/** The first time of a window: "2:30 – 4 PM" is "2:30 PM", "9 AM – 12 PM" is "9 AM". */
function windowStart(span: string): string {
  const [from = "", to = ""] = span.split(/\s*[–-]\s*/);
  if (/[ap]m/i.test(from)) return from.trim();
  const half = /[ap]m/i.exec(to)?.[0] ?? "";
  return `${from.trim()} ${half}`.trim();
}

/**
 * The open times to offer in a time's place: the receptionist's own windows over the days ahead, each a time they could
 * have, from the first of each window, up to `max`. None where the calendar has none to say or could not be read (`state`
 * says which).
 */
export async function readOpenTimes(
  service: string | null,
  max: number,
  tz: string,
): Promise<{ times: readonly OpenTime[]; state: string }> {
  const answer = await api()("GET ask/openings", { query: { service: service ?? undefined } }).catch(() => null);
  if (!answer?.ok) return { times: [], state: "unavailable" };
  const { openings } = answer.data;
  const times: OpenTime[] = [];
  for (const day of openings.days)
    for (const span of day.windows)
      if (times.length < max)
        times.push({ key: `${day.key}-${span}`, time: windowStart(span), day: openDayWord(day.key, tz, Date.now()) });
  return { times, state: openings.state };
}

/** An open time as a sentence offers it: "4:30 PM tomorrow", "10:00 AM on Wed, Nov 11". */
export const offerWords = (open: OpenTime): string =>
  /^(today|tomorrow)$/i.test(open.day) ? `${open.time} ${open.day.toLowerCase()}` : `${open.time} on ${open.day}`;

/**
 * The reply Can't do it leaves in the thread's box: that the time they asked for has gone, and the next two the business
 * has open, in Another time's own words (contracts otherTimeWords); with none open or none read, it asks what other time
 * suits them. Read while the request still holds its time, so the time it turns down is never one it offers.
 */
export async function offerOtherTimes(request: { near: string; service: string | null }): Promise<string> {
  const open = await readOpenTimes(request.service, TIMES_IN_A_REPLY, await workspaceZone());
  return otherTimeWords(request.near, open.times.map(offerWords));
}
