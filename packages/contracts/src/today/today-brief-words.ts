/**
 * The brief's words (canvas E3, Glass): what the day says in a few sentences, composed from what Today already holds
 * and nothing read twice -- who needs you and how long the oldest has waited, the calendar's day, what came in, and
 * the playbook runs waiting for a word. A name is set in bold, as the canvas sets it; the same words are read aloud
 * (brief-pane.tsx). It said "Nothing has come in yet today" over two conversations waiting since the 18th and a day
 * of appointments (Ruben, 1 Oct 2026): the brief is everything that needs a person now, then the day, then the rest.
 */
import { appointmentWords } from "../journey/appointment-word";
import { RUN_WAITING_WORDS } from "../shell/campaign-rooms";
import { todayAlsoWaiting } from "./today-bands";
import type { TodayDayItemVM, TodayDayVM } from "./today-day";
import { isHoldRow } from "./today-queue";
import type { TodayVM } from "./today-vm";

/** A run of words, in bold where the canvas sets a name so (read through TodayBriefWords; not exported on its own). */
interface TodayBriefSegment {
  text: string;
  strong?: true;
}
/**
 * A playbook run waiting for a word, as the queue says it: its name, and todayRunWords(r).brief: what it waits for
 * (absent: for your approval) and its sentence.
 */
export interface TodayBriefRun {
  label: string;
  sentence: string;
  waits?: string;
  /** "are" for a label that is many ("Your reach-outs are waiting for you"); "is" where absent. */
  verb?: "is" | "are";
  /** What the label does, in place of its verb and its wait: several runs folded ("4 runs" "wait for your OK"). */
  says?: string;
}
export interface TodayBriefWords {
  /** Each sentence as its runs of words; drawn in order, a space between sentences. */
  sentences: TodayBriefSegment[][];
  /** The same, as one string: what a voice reads and what Ask is handed. */
  text: string;
}

// `plain`, not `say`: a helper declared in three files is a copy the build counts (copies.json), and two files said it.
const plain = (text: string): TodayBriefSegment => ({ text });
// `bold`, not `name`: a top-level `name` in contracts makes the bundler rename every other `name` in every dist that
// bundles it (core, jobs, channels, db), which is churn in four committed files for one word.
const bold = (text: string): TodayBriefSegment => ({ text, strong: true });

/** Up to three names in bold, the rest counted: "Ana Reyes, Kenia Duarte and 2 more". `rest` are the ones not named. */
function names(who: readonly string[], rest: number): TodayBriefSegment[] {
  const said = who.slice(0, 3);
  const left = who.length - said.length + rest;
  const out: TodayBriefSegment[] = [];
  said.forEach((w, i) => {
    if (i > 0) out.push(plain(i === said.length - 1 && !left ? " and " : ", "));
    out.push(bold(w));
  });
  if (left) out.push(plain(` and ${left} more`));
  return out;
}

/**
 * Who needs you, with the oldest wait as the headline's detail says it; then the closing windows, the calls worth a
 * listen and the searches. Who needs you is the holds (isHoldRow) and the count's own number (needsYou.count: the holds
 * and the replies counting down, which have no row), never a closing window, which is said as a window (the wiring's
 * second audit, S7-8).
 */
function needsSentences(vm: TodayVM): TodayBriefSegment[][] {
  const rows = vm.queue.rows;
  const people = [...new Set(rows.filter(isHoldRow).map((r) => r.who))];
  // The calls worth a listen and the searches waiting, all of them: counting the drawn rows alone said nothing of four
  // calls the queue's head had counted, because they sort after everyone waiting (the 2 Oct 2026 audit).
  const { calls, searches, windows } = vm.queue;
  const total = vm.needsYou?.count ?? people.length;
  // The ones not named: the holds past the six and the replies counting down.
  const rest = Math.max(0, total - people.length);
  const out: TodayBriefSegment[][] = [];
  if (!people.length && total > 0)
    out.push([plain(total === 1 ? "One conversation needs you." : `${total} conversations need you.`)]);
  if (people.length) {
    const one = people.length === 1 && rest === 0;
    const detail = vm.standing.detail;
    // One person: the headline's detail names them again ("Ana Reyes has been waiting since 2:20 PM."), so the two
    // sentences are one: "Ana Reyes needs you, waiting since 2:20 PM."
    const [first = ""] = people;
    const lead = `${first} has been `;
    if (one && detail && detail.startsWith(lead))
      out.push([bold(first), plain(` needs you, ${detail.slice(lead.length)}`)]);
    else {
      // The people not named, never the calls and the searches past the six: "and 20 more" over sixteen people.
      out.push([...names(people, rest), plain(one ? " needs you." : " need you.")]);
      if (detail) out.push([plain(detail)]);
    }
  }
  for (const sentence of todayAlsoWaiting({ windows, calls, searches })) out.push([plain(sentence)]);
  return out;
}

/**
 * Who an appointment is with, in bold, and what for; or what it is where nobody is named. A visit a member said became
 * something carries that word beside it, in the board's own: "Ana Reyes (Trim, kept)".
 */
const withWhom = (b: TodayDayItemVM): TodayBriefSegment[] => {
  const said = b.said ? b.said.word.toLowerCase() : "";
  const what = [b.person ? b.service : "", said].filter(Boolean).join(", ");
  return b.person
    ? [bold(b.person.name), ...(what ? [plain(` (${what})`)] : [])]
    : [plain(`${b.service || b.title}${said ? ` (${said})` : ""}`)];
};

/**
 * The calendar's day: how many (a cancelled visit is none, and one said missed is counted and said), the one under way,
 * the next, and how many after; or that the day is closed or empty, or over. A day that is over is past, never "done":
 * the record never infers that they came (decision 0002).
 */
function daySentence(day: TodayDayVM | null): TodayBriefSegment[] | null {
  const today = day?.feed === "ok" ? day.frames.find((f) => f.today) : undefined;
  if (!today) return null;
  if (today.closed.yes) return [plain(`Closed today${today.closed.note ? ` (${today.closed.note})` : ""}.`)];
  const items = today.items;
  const total = items.length + today.more;
  if (!total) return [plain("Nothing on the calendar today.")];
  const now = items.find((b) => b.phase === "now");
  const next = items.find((b) => b.phase === "next");
  const after = items.filter((b) => b.phase === "later").length + today.more;
  // In the workspace's word for an appointment, as Campaigns says it (decision 0041): "3 meetings today".
  const out: TodayBriefSegment[] = [plain(appointmentWords(day?.word ?? "appointment").today(total))];
  if (today.missed) out.push(plain(`, ${today.missed} missed`));
  if (now) out.push(plain(": "), ...withWhom(now), plain(` is in now${now.dur ? ` (${now.dur})` : ""}`));
  if (next)
    out.push(
      plain(now ? ", then " : ": next is "),
      ...withWhom(next),
      plain(next.allDay ? ", all day" : ` at ${next.start}`),
    );
  if (!now && !next) out.push(plain(items.length && items.every((b) => b.phase === "past") ? ", all past" : ""));
  else if (after) out.push(plain(`, ${after} more after`));
  out.push(plain("."));
  return out;
}

/**
 * What came in: the recap's line, and the proof the lines are listening on a quiet day and on a day with nothing
 * counted while someone waits (the day's tile stands as four zeros then, zero_figures, and the proof has no other seat).
 */
function cameIn(vm: TodayVM): TodayBriefSegment[][] {
  const line = vm.recap?.line;
  if (!line) return [];
  return vm.quiet || vm.zero_figures ? [[plain(line)], [plain(vm.proof)]] : [[plain(line)]];
}

/** A run waiting for a word: its name in bold, then the queue's own sentence about it. */
const runSentence = (r: TodayBriefRun): TodayBriefSegment[] => [
  bold(r.label),
  plain(` ${r.says ?? `${r.verb ?? "is"} ${r.waits ?? RUN_WAITING_WORDS.toLowerCase()}`}: ${r.sentence}`),
];

/**
 * The brief, composed: who needs you first, then the day, then what came in, then the runs. `day` is the day's own
 * view model (todayDay), null where the page has no calendar; `runs` the playbook runs the queue holds for a word.
 */
export function todayBriefWords(vm: TodayVM, day: TodayDayVM | null, runs: readonly TodayBriefRun[]): TodayBriefWords {
  const dayWords = daySentence(day);
  const needs = needsSentences(vm);
  // Nobody and nothing waits, and the receptionist is answering (the queue's own good news, todayQueueEmpty's "ok"):
  // said first and once, as a sentence. A link under the brief used to say it ("Nothing waiting. 5 earlier
  // conversations"), in a third size of type; the brief is one summary (Ruben, 7 Oct 2026).
  const caught = !needs.length && !runs.length && vm.queue.empty.tone === "ok";
  const sentences = [
    ...needs,
    ...(caught ? [[plain("You're all caught up.")]] : []),
    ...(dayWords ? [dayWords] : []),
    ...cameIn(vm),
    ...runs.map(runSentence),
  ];
  // What a voice reads and Ask is handed says, too, what the figures do not carry and the page draws as a line of its
  // own under the summary, with its door: a reply that failed to deliver. A brief that was read aloud left it out.
  const also = (vm.recap ? vm.recap.sentences : []).filter((s) => !s.traffic).map((s) => s.text);
  return { sentences, text: [...sentences.map((s) => s.map((x) => x.text).join("")), ...also].join(" ") };
}
