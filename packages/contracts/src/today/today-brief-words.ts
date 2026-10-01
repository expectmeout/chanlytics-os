/**
 * The brief's words (canvas E3, Glass): what the day says in a few sentences, composed from what Today already holds
 * and nothing read twice -- who needs you and how long the oldest has waited, the calendar's day, what came in, and
 * the playbook runs waiting for a word. A name is set in bold, as the canvas sets it; the same words are read aloud
 * (brief-pane.tsx). It said "Nothing has come in yet today" over two conversations waiting since the 18th and a day
 * of appointments (Ruben, 1 Oct 2026): the brief is everything that needs a person now, then the day, then the rest.
 */
import type { TodayDayItemVM, TodayDayVM } from "./today-day";
import type { TodayVM } from "./today-vm";

/** A run of words, in bold where the canvas sets a name so (read through TodayBriefWords; not exported on its own). */
interface TodayBriefSegment {
  text: string;
  strong?: true;
}
/** A playbook run waiting for a word, as the queue says it: its name, and todayRunWords(r).waiting.sentence. */
export interface TodayBriefRun {
  label: string;
  sentence: string;
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

/** The rows that are a person waiting on one (a search and a call worth a listen are said apart). */
const PEOPLE_KINDS: ReadonlySet<TodayVM["queue"]["rows"][number]["kind"]> = new Set([
  "handoff",
  "callback",
  "window",
  "reply",
]);

/** Who needs you, with the oldest wait as the headline's detail says it; then the calls worth a listen and the searches. */
function needsSentences(vm: TodayVM): TodayBriefSegment[][] {
  const rows = vm.queue.rows;
  const people = [...new Set(rows.filter((r) => PEOPLE_KINDS.has(r.kind)).map((r) => r.who))];
  const calls = rows.filter((r) => r.kind === "call").length;
  const searches = rows.filter((r) => r.kind === "search").length;
  const out: TodayBriefSegment[][] = [];
  if (people.length) {
    const one = people.length === 1 && vm.queue.more === 0;
    const detail = vm.standing.detail;
    // One person: the headline's detail names them again ("Ana Reyes has been waiting since 2:20 PM."), so the two
    // sentences are one: "Ana Reyes needs you, waiting since 2:20 PM."
    const lead = `${people[0]} has been `;
    if (one && detail && detail.startsWith(lead))
      out.push([bold(people[0]), plain(` needs you, ${detail.slice(lead.length)}`)]);
    else {
      out.push([...names(people, vm.queue.more), plain(one ? " needs you." : " need you.")]);
      if (detail) out.push([plain(detail)]);
    }
  }
  if (calls) out.push([plain(calls === 1 ? "One call is worth a listen." : `${calls} calls are worth a listen.`)]);
  if (searches)
    out.push([
      plain(
        searches === 1 ? "A search is waiting on your answer." : `${searches} searches are waiting on your answer.`,
      ),
    ]);
  return out;
}

/** Who an appointment is with, in bold, and what for; or what it is where nobody is named. */
const withWhom = (b: TodayDayItemVM): TodayBriefSegment[] =>
  b.person ? [bold(b.person.name), ...(b.service ? [plain(` (${b.service})`)] : [])] : [plain(b.service || b.title)];

/** The calendar's day: how many, the one under way, the next, and how many after; or that the day is closed or empty. */
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
  const out: TodayBriefSegment[] = [plain(`${total} appointment${total === 1 ? "" : "s"} today`)];
  if (now) out.push(plain(": "), ...withWhom(now), plain(` is in now${now.dur ? ` (${now.dur})` : ""}`));
  if (next)
    out.push(
      plain(now ? ", then " : ": next is "),
      ...withWhom(next),
      plain(next.allDay ? ", all day" : ` at ${next.start}`),
    );
  if (!now && !next) out.push(plain(items.length && items.every((b) => b.phase === "past") ? ", all done" : ""));
  else if (after) out.push(plain(`, ${after} more after`));
  out.push(plain("."));
  return out;
}

/** What came in: the recap's line, and on a quiet day the proof the lines are listening. */
function cameIn(vm: TodayVM): TodayBriefSegment[][] {
  const line = vm.recap?.line;
  if (!line) return [];
  return vm.quiet ? [[plain(line)], [plain(vm.proof)]] : [[plain(line)]];
}

/** A run waiting for a word: its name in bold, then the queue's own sentence about it. */
const runSentence = (r: TodayBriefRun): TodayBriefSegment[] => [
  bold(r.label),
  plain(` is waiting for your word: ${r.sentence}`),
];

/**
 * The brief, composed: who needs you first, then the day, then what came in, then the runs. `day` is the day's own
 * view model (todayDay), null where the page has no calendar; `runs` the playbook runs the queue holds for a word.
 */
export function todayBriefWords(vm: TodayVM, day: TodayDayVM | null, runs: readonly TodayBriefRun[]): TodayBriefWords {
  const dayWords = daySentence(day);
  const sentences = [...needsSentences(vm), ...(dayWords ? [dayWords] : []), ...cameIn(vm), ...runs.map(runSentence)];
  return { sentences, text: sentences.map((s) => s.map((x) => x.text).join("")).join(" ") };
}
