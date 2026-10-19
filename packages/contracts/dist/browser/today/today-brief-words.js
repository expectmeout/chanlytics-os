import { appointmentWords } from "../journey/appointment-word.js";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms.js";
import { todayAlsoWaiting } from "./today-bands.js";
import { isHoldRow } from "./today-queue.js";
const plain = (text) => ({ text });
const bold = (text) => ({ text, strong: true });
function names(who, rest) {
  const said = who.slice(0, 3);
  const left = who.length - said.length + rest;
  const out = [];
  said.forEach((w, i) => {
    if (i > 0) out.push(plain(i === said.length - 1 && !left ? " and " : ", "));
    out.push(bold(w));
  });
  if (left) out.push(plain(` and ${left} more`));
  return out;
}
function needsSentences(vm) {
  const rows = vm.queue.rows;
  const people = [...new Set(rows.filter(isHoldRow).map((r) => r.who))];
  const { calls, searches, windows } = vm.queue;
  const total = vm.needsYou?.count ?? people.length;
  const rest = Math.max(0, total - people.length);
  const out = [];
  if (!people.length && total > 0)
    out.push([plain(total === 1 ? "One conversation needs you." : `${total} conversations need you.`)]);
  if (people.length) {
    const one = people.length === 1 && rest === 0;
    const detail = vm.standing.detail;
    const [first = ""] = people;
    const lead = `${first} has been `;
    if (one && detail && detail.startsWith(lead))
      out.push([bold(first), plain(` needs you, ${detail.slice(lead.length)}`)]);
    else {
      out.push([...names(people, rest), plain(one ? " needs you." : " need you.")]);
      if (detail) out.push([plain(detail)]);
    }
  }
  for (const sentence of todayAlsoWaiting({ windows, calls, searches })) out.push([plain(sentence)]);
  return out;
}
const withWhom = (b) => {
  const said = b.said ? b.said.word.toLowerCase() : "";
  const what = [b.person ? b.service : "", said].filter(Boolean).join(", ");
  return b.person ? [bold(b.person.name), ...what ? [plain(` (${what})`)] : []] : [plain(`${b.service || b.title}${said ? ` (${said})` : ""}`)];
};
function daySentence(day) {
  const today = day?.feed === "ok" ? day.frames.find((f) => f.today) : void 0;
  if (!today) return null;
  if (today.closed.yes) return [plain(`Closed today${today.closed.note ? ` (${today.closed.note})` : ""}.`)];
  const items = today.items;
  const total = items.length + today.more;
  if (!total) return [plain("Nothing on the calendar today.")];
  const now = items.find((b) => b.phase === "now");
  const next = items.find((b) => b.phase === "next");
  const after = items.filter((b) => b.phase === "later").length + today.more;
  const out = [plain(appointmentWords(day?.word ?? "appointment").today(total))];
  if (today.missed) out.push(plain(`, ${today.missed} missed`));
  if (now) out.push(plain(": "), ...withWhom(now), plain(` is in now${now.dur ? ` (${now.dur})` : ""}`));
  if (next)
    out.push(
      plain(now ? ", then " : ": next is "),
      ...withWhom(next),
      plain(next.allDay ? ", all day" : ` at ${next.start}`)
    );
  if (!now && !next) out.push(plain(items.length && items.every((b) => b.phase === "past") ? ", all past" : ""));
  else if (after) out.push(plain(`, ${after} more after`));
  out.push(plain("."));
  return out;
}
function cameIn(vm) {
  const line = vm.recap?.line;
  if (!line) return [];
  return vm.quiet || vm.zero_figures ? [[plain(line)], [plain(vm.proof)]] : [[plain(line)]];
}
const runSentence = (r) => [
  bold(r.label),
  plain(` ${r.says ?? `${r.verb ?? "is"} ${r.waits ?? RUN_WAITING_WORDS.toLowerCase()}`}: ${r.sentence}`)
];
export function todayBriefWords(vm, day, runs) {
  const dayWords = daySentence(day);
  const needs = needsSentences(vm);
  const caught = !needs.length && !runs.length && vm.queue.empty.tone === "ok";
  const sentences = [
    ...needs,
    ...caught ? [[plain("You're all caught up.")]] : [],
    ...dayWords ? [dayWords] : [],
    ...cameIn(vm),
    ...runs.map(runSentence)
  ];
  const also = (vm.recap ? vm.recap.sentences : []).filter((s) => !s.traffic).map((s) => s.text);
  return { sentences, text: [...sentences.map((s) => s.map((x) => x.text).join("")), ...also].join(" ") };
}
