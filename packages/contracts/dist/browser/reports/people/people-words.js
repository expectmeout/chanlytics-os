import { PERSON_CAME_FROM_WORDS, PERSON_CHANNEL_WORDS } from "../../people/person-words.js";
import { capitalize, plural } from "../../shared/words.js";
import { ownWord, rankedEntries } from "../report-mix.js";
import { REPORT_MIN_N, beforeWords } from "../report-tiles.js";
import { rangeLabelOf } from "../reports.js";
export const PEOPLE_RHYTHM_UNIT = "messages and calls";
export const PEOPLE_RHYTHM_EMPTY = "Nobody wrote or called in this period.";
export const listDoor = (id) => `clients/seg:${id}`;
const HEAD_NOBODY = "Nobody reached you in this period";
function newBeforeWords(before, days, priorHad) {
  if (!priorHad) return "";
  return ` (${before.new === 0 ? "none" : before.new} ${beforeWords(rangeLabelOf(days))})`;
}
function bookYesWords(book) {
  return book !== null && book.people >= REPORT_MIN_N ? `; ${book.lists.opted_in} of ${book.people} have said yes to messages` : "";
}
export function headWords(reached, days, book, priorHad) {
  const { now, before } = reached;
  const reachedWords = now.people === 0 ? HEAD_NOBODY : `${plural(now.people, "person", "people")} reached you, ${now.new} new${newBeforeWords(before, days, priorHad)}`;
  return `${reachedWords}${bookYesWords(book)}.`;
}
const happened = (parts) => parts.filter(([n]) => n > 0).map(([n, words]) => `${n} ${words}`).join(" \xB7 ");
export const reachedMeta = (people, fresh) => people === 0 ? "nobody wrote or called in this period" : `${fresh} new \xB7 ${people - fresh} you knew already`;
export const newMeta = (people, fresh) => fresh === 0 ? "nobody new" : `of the ${people} who reached you`;
export const yesesMeta = (by) => happened([
  [by.messages, "to messages"],
  [by.offers, "to offers"],
  [by.email_offers, "to email offers"]
]) || "nobody said yes in this period";
export const stopsMeta = (by) => happened([
  [by.messages, "stopped all messages"],
  [by.offers, "stopped offers"],
  [by.email_offers, "stopped email offers"]
]) || "nobody asked to stop in this period";
const keptAsWords = (key) => capitalize(key.replace(/_/g, " "));
function ranked(counts, words) {
  const order = Object.keys(words);
  const place = (key) => {
    const at = order.indexOf(key);
    return at === -1 ? order.length : at;
  };
  return rankedEntries(counts, (key) => ownWord(words, key) ?? keptAsWords(key)).sort(
    (a, b) => b[2] - a[2] || place(a[0]) - place(b[0])
  );
}
const lastOf = (entries, id) => [
  ...entries.filter(([key]) => key !== id),
  ...entries.filter(([key]) => key === id)
];
export const channelEntries = (byChannel) => ranked(byChannel, PERSON_CHANNEL_WORDS);
export const CHANNELS_LINE = "A person who reached you more than one way is counted in each.";
export const CHANNELS_EMPTY = "Nobody reached you in this period.";
const UNRECORDED = "unknown";
const FIRST_CAME_WORDS = { ...PERSON_CAME_FROM_WORDS, ad: "An ad", [UNRECORDED]: "Not recorded" };
export const firstCameEntries = (byVia) => lastOf(ranked(byVia, FIRST_CAME_WORDS), UNRECORDED);
export const firstCameKnown = (entries) => entries.filter(([id]) => id !== UNRECORDED).reduce((n, [, , value]) => n + value, 0);
export const firstCameLine = (known, fresh) => `${known} of ${fresh} new people have a recorded way in.`;
export const FIRST_CAME_NOBODY = "Nobody new reached you in this period.";
export const firstCameNone = (fresh) => `No way in is recorded for the ${plural(fresh, "new person", "new people")}.`;
const OTHER = "other";
const MEMBER = "member";
const YES_ROWS = {
  customer_message: "Their own message",
  form: "A form",
  in_person: "In person",
  phone: "By phone",
  [OTHER]: "Another way"
};
const STOP_ROWS = {
  customer_message: "Their own STOP",
  carrier: "The carrier",
  unsubscribe: "An unsubscribe",
  complaint: "A complaint",
  reply: "A reply",
  whatsapp: "WhatsApp's offers stop",
  [MEMBER]: "Recorded by a member",
  [OTHER]: "Another way"
};
const MEMBER_SOURCES = ["in_person", "phone", "form", "operator"];
function answerEntries(bySource, rowWords, rowOf) {
  const rows = {};
  for (const [source, n] of Object.entries(bySource)) {
    const row = rowOf(source);
    rows[row] = (rows[row] ?? 0) + n;
  }
  return lastOf(ranked(rows, rowWords), OTHER);
}
const rowIn = (rowWords, source) => Object.hasOwn(rowWords, source) ? source : OTHER;
export const yesEntries = (bySource) => answerEntries(bySource, YES_ROWS, (source) => rowIn(YES_ROWS, source));
export const stopEntries = (bySource) => answerEntries(bySource, STOP_ROWS, (source) => MEMBER_SOURCES.includes(source) ? MEMBER : rowIn(STOP_ROWS, source));
export const YESES_LINE = "Each person is counted once for each kind of message they said yes to.";
export const YESES_EMPTY = "Nobody said yes in this period.";
export const STOPS_LINE = "Each person is counted once for each kind of message they stopped.";
export const STOPS_EMPTY = "Nobody asked to stop in this period.";
export function stepsDoneEntries(steps) {
  const rows = [
    ["on_time", "Done on or before their day", steps.on_time],
    ["late", "Done after their day", Math.max(0, steps.done - steps.on_time)]
  ];
  return rows.filter(([, , n]) => n > 0);
}
export const stepsDoneLine = (steps) => steps.done >= REPORT_MIN_N ? `${steps.on_time} of ${steps.done} were done on or before their day.` : `${plural(steps.done, "step was", "steps were")} done in this period.`;
export const STEPS_DONE_EMPTY = "No step was done in this period.";
const EMAIL_STOP_WORDS = {
  hard_bounce: "Bounced for good",
  complaint: "Marked as spam",
  provider: "Stopped by the email provider",
  [UNRECORDED]: "Reason not recorded"
};
export const emailStoppedEntries = (byReason) => lastOf(ranked(byReason, EMAIL_STOP_WORDS), UNRECORDED);
export const emailStoppedLine = (total) => `${plural(total, "address", "addresses")} stopped working in this period.`;
export const EMAIL_STOPPED_EMPTY = "No address stopped working in this period.";
export const BOOK_EMPTY = "Nobody is in your book yet.";
const WIRE_ROWS = [
  ["whatsapp_only", `${PERSON_CHANNEL_WORDS.whatsapp} only`],
  ["sms_only", `${PERSON_CHANNEL_WORDS.sms} only`],
  ["phone_only", `${PERSON_CHANNEL_WORDS.voice} only`],
  ["email_only", `${PERSON_CHANNEL_WORDS.email} only`],
  ["several", "More than one way"],
  ["none", "None yet"]
];
export const wireEntries = (wires) => WIRE_ROWS.map(([key, label]) => [key, label, wires[key]]).filter(([, , n]) => n > 0);
export const wiresLine = (several, people) => `${several} of ${people} have reached you more than one way, as of today.`;
const FRESH_ROWS = [
  ["under_7", "Under 7 days"],
  ["d7_30", "7 to 30 days"],
  ["d31_60", "31 to 60 days"],
  ["d61_90", "61 to 90 days"],
  ["d91_up", "91 days or more"],
  ["never", "Never heard from"]
];
export const freshEntries = (fresh) => FRESH_ROWS.map(([key, label]) => [key, label, fresh[key]]);
export const freshLine = (people) => `Of ${plural(people, "person", "people")} as of today: the days since they last wrote or called. Your own messages do not count.`;
export function quietDoor(quiet) {
  if (quiet === 0) return null;
  return {
    line: `${plural(quiet, "person has", "people have")} been quiet for more than 30 days.`,
    door: listDoor("quiet"),
    label: "Quiet 30+ days"
  };
}
export const stepsOverdueMeta = (overdue) => overdue === 0 ? "no next step is past its day" : "people whose next step is past its day";
export const stepsDueTodayMeta = (due) => due === 0 ? "no next step is due today" : "people whose next step is due today";
export const emailStoppedNowMeta = (stopped) => stopped === 0 ? "every address works" : "people whose address no longer receives your email";
export const standMeta = (people) => people === 0 ? "nobody is in your book yet" : `of ${plural(people, "person", "people")}`;
