/**
 * docs/capacity.md: how much each clock can do, read from the code that holds it (decision 0115). Each row names a clock, the
 * job pg_cron runs it by and the constant that bounds it; the schedule is the migrations' last word and the number is the
 * constant's own literal, so a change to either changes the page, and tests/docs/capacity.test.mjs fails a stale one and a
 * clock with no row. What a row says of a full platform is a person's reading of the numbers beside it, written here, and
 * every number in that reading is worked out from the constants, so the sentence moves with them.
 *
 * A NUMBER IS READ AS WHAT IT IS (the review of 11 November 2026). The page once multiplied every number by its clock's
 * ticks, and two rows were wrong for it: outreach was judged by the cap on drafts an owner sends, which is not what holds
 * the emails a mailbox sends, and the ledger by how many jobs run side by side, which is not how many a tick runs. So a
 * row says what KIND its limit is (`KINDS`), and what may be made of the number follows from the kind:
 *
 *   each_tick   the most a tick takes: the hour's most is the number times the ticks.
 *   in_turn     a tick works one after another until a moment: the hour holds that many seconds of work, and how many
 *               items that is depends on how long one takes, which only a timed run says.
 *   at_once     how many a tick runs side by side while it claims: the hour holds seconds of work again, never a count.
 *
 * Three checks keep a row to its kind, each run by `generate` so a wrong table writes no page:
 *   1. a name says its kind: a count a tick is named for one (`_PER_TICK`, `MAX_DUE`), slots for slots, a moment in ms;
 *   2. every limit a file holds is on the page: a file a row reads has no limit-shaped constant no row names, so a
 *      second lane in a clock (the mailboxes beside the drafts) cannot go unsaid;
 *   3. where one file feeds two rows, each says which call its number is handed to (`limits`), and it is.
 *
 *   corepack pnpm gen:capacity
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const OUT = "docs/capacity.md";
const MIGRATIONS = "supabase/migrations";

/** The figure a full platform is judged against (decision 0115). */
export const WORKING_FIGURE = 1_000;

/**
 * The weekdays of a month, for spreading a month's allowance over the days it is spent on: a business closed at the
 * weekend is written to on none of it (contracts reach-out/timetable.ts plans inside a lead's own open hours), so a
 * month's emails fall on its weekdays, and a day is judged as one of those.
 */
export const WEEKDAYS_A_MONTH = 21;

const SENDER_LANES = "apps/edge/lib/campaigns/reach-out/sender/lanes.ts";
const SENDER = "apps/edge/lib/campaigns/reach-out/sender/sender.ts";
const CHECK = "apps/edge/lib/campaigns/reach-out/check.ts";
const CHECK_ONE = "apps/edge/lib/campaigns/reach-out/check-one.ts";
const LEDGER = "packages/jobs/src/runner/ledger.ts";
const RULES = "packages/contracts/src/campaigns/reach-out/rules.ts";
const TIMETABLE = "packages/contracts/src/campaigns/reach-out/timetable.ts";

/** What a row's limit is. Each kind names the field that holds its constant, and the shape that constant's name has. */
export const KINDS = {
  each_tick: { field: "cap", named: /(_PER_TICK|_A_TICK)$|^MAX_DUE$/, says: "a count a tick takes" },
  in_turn: { field: "until", named: /_MS$/, says: "the moment a tick stops starting work, in ms" },
  at_once: { field: "cap", named: /_SLOTS$|(^|_)AT_ONCE$/, says: "how many run side by side" },
};

/**
 * A constant that limits a tick, by its name: a count a tick takes, slots, a page and how many pages, a chunk, a limit, or
 * the moment it stops. A file a row reads may hold none the page does not name (check 2 above).
 */
export const LIMIT_SHAPED =
  /(_PER_TICK|_A_TICK|_SLOTS|_PAGES?|_IN_CHUNK|_LIMIT)$|(^|_)AT_ONCE$|^MAX_DUE$|(^|_)YIELD_AT_MS$|(_UNTIL_MS|_DEADLINE_MS|_DONE_BY_MS)$|^CLAIM_FOR_MS$/;

const count = (n) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1));
const seconds = (ms) => count(ms / 1000);

/**
 * What a full platform asks of outreach, from the product's own limits (decision 0115, 1: "assume everything may be maxed
 * out"): every workspace spending its month's emails (REACH_OUT_MONTH_EMAILS) over the month's weekdays, inside the part
 * of a day a cold email may arrive in (SEND_DAY_FRAME, the lead's own time; read as one zone, the busiest reading).
 */
export function outreachAtFull(root = ROOT) {
  const month = constantOf(RULES, "REACH_OUT_MONTH_EMAILS", root);
  const frame = /SEND_DAY_FRAME[^=]*=\s*\{\s*from:\s*(\d+)\s*\*\s*60,\s*to:\s*(\d+)\s*\*\s*60\s*\}/.exec(
    fs.readFileSync(path.join(root, TIMETABLE), "utf8"),
  );
  if (!frame) throw new Error(`${TIMETABLE} declares no SEND_DAY_FRAME in whole hours`);
  const hours = Number(frame[2]) - Number(frame[1]);
  const aDay = (WORKING_FIGURE * month) / WEEKDAYS_A_MONTH;
  return {
    month,
    from: Number(frame[1]),
    to: Number(frame[2]),
    hours,
    aDay,
    anHour: aDay / hours,
    aMinute: aDay / hours / 60,
  };
}

/**
 * Every clock that does work, by the register's name (sweep_status.sweep). A clock is one row, or `lanes` of them where a
 * tick does two kinds of work under two limits. A row has `bound` (words, where no number bounds it) or a `kind` with its
 * constant (`cap`, or `until` for in_turn), `also` the other limits its file holds (a name, or [file, name] for one kept
 * elsewhere), `limits` the call its number is handed to ([file, function, constant?]: the constant is the cap's unless
 * named), and `atFull`, what that comes to at the working figure: words, or a function of `{ root, ticks }` that works
 * its numbers out.
 */
export const CAPACITY = {
  calendar: {
    job: "calendar-people-sweep",
    bound: "None: it hands each workspace with a calendar due one `calendar_read`.",
    atFull: "One job a workspace an hour. The ledger's row is the limit.",
  },
  calls: {
    job: "call-reconcile",
    kind: "each_tick",
    cap: ["apps/edge/lib/voice/calls-sweep.ts", "CALLS_PER_TICK"],
    also: [
      "MAX_NOTES_PER_TICK",
      "MAX_NOTICES_PER_TICK",
      "MAX_SETTLES_PER_TICK",
      "MAX_RECORDINGS_PER_TICK",
      "MAX_PURGE_PER_TICK",
    ],
    atFull: "Only calls ended without a result. Holds: a provider's webhook does most of them.",
  },
  channel_quality: {
    job: "channel-quality-sweep",
    kind: "each_tick",
    cap: ["apps/edge/lib/whatsapp/number-quality.ts", "MAX_DUE"],
    also: ["AT_ONCE"],
    atFull: "A thousand numbers are each read within twelve hours. Holds: Health expects a read every nineteen.",
  },
  deadman: {
    job: "deadman-sweep",
    bound: "Time: it stops starting work inside the budgets at the top of its sweep.",
    atFull: "Only what a crash left. Holds while crashes are rare, and it says what it left.",
  },
  drafts: {
    job: "drafts-sweep",
    kind: "each_tick",
    cap: ["apps/edge/lib/drafts/sweep.ts", "DRAFTS_A_TICK"],
    atFull: "Only replies whose event was dropped; a hold's own events write the rest. Holds.",
  },
  google: {
    job: "google-listings-sweep",
    bound: "None a customer meets: it hands each workspace with a listing or profile due one `google_read`.",
    atFull: "A listing is read once in twenty hours, so about fifty jobs an hour.",
  },
  health: {
    job: "sweep-health",
    bound: "None: it reads the register once and judges every clock.",
    atFull: "Does not grow with workspaces.",
  },
  instagram_tokens: {
    job: "instagram-token-sweep",
    bound: "Time: it stops starting refreshes at its yield.",
    atFull: "A token is refreshed once it is a week old, so about 150 a day. Holds.",
  },
  jobs: {
    job: "jobs-tick",
    kind: "at_once",
    cap: [LEDGER, "CLAIM_SLOTS"],
    claimsFor: [LEDGER, "CLAIM_FOR_MS"],
    // pg_cron looks every two seconds, and a look is not a tick: a backlog is asked for at the poll's pace.
    startsEverySeconds: backlogPollSeconds,
    also: ["YIELD_AT_MS", "LEAD_YIELD_AT_MS", "RELAY_LIMIT"],
    atFull: ({ root }) => {
      const slots = constantOf(LEDGER, "CLAIM_SLOTS", root);
      const claimFor = constantOf(LEDGER, "CLAIM_FOR_MS", root) / 1000;
      const poll = backlogPollSeconds(root);
      const work = (3600 / poll) * slots * claimFor;
      const sends = outreachAtFull(root).anHour;
      return (
        `The limit under every handed-out row, and it is time, not a count. On a backlog a tick starts every ${count(poll)} seconds ` +
        `and its ${count(slots)} runners each claim one job after another for ${count(claimFor)} seconds: ${count((claimFor / poll) * slots)} run at once, ` +
        `so ${count(work)} jobs an hour at a second a job, and half that at two. A row newly due asks for a tick of its own, at most one a second. ` +
        `NOT TIMED at this size: outreach at full is ${count(Math.round(sends))} sends an hour, each one job, which is ${(work / sends).toFixed(1)} s a send ` +
        "if the backlog's runners did nothing else. A claim beside 50,000 waiting jobs costs 33 ms and a ceiling test holds it " +
        "(`jobs-lanes.db.test.mjs`); `jobs_backlog` pages first if work outruns it."
      );
    },
  },
  jobs_canary: {
    job: "jobs-canary",
    bound: "One job in our own workspace.",
    atFull: "Does not grow with workspaces.",
  },
  leads: {
    job: "leads-sweep",
    kind: "each_tick",
    cap: ["apps/edge/lib/leads/sweep.ts", "RECONCILE_PER_TICK"],
    also: ["RUNS_IN_CHUNK", "SWEEP_DEADLINE_MS"],
    atFull: "Only runs whose start or lease was lost. Holds.",
  },
  lines: {
    job: "lines-sweep",
    kind: "each_tick",
    cap: ["apps/edge/lib/lines/sweep.ts", "LINES_PER_TICK"],
    atFull: "Only lines being set up and stuck. Holds, unless a thousand sign up in one day.",
  },
  mailboxes: {
    job: "mailboxes-sweep",
    kind: "each_tick",
    cap: ["apps/edge/lib/email/mailbox/sweep.ts", "MAX_DUE"],
    also: ["AT_ONCE", "READS_UNTIL_MS"],
    atFull: "A thousand mailboxes are each looked at within twenty-five minutes. Holds: a push does the live work.",
  },
  notes: {
    job: "notes-sweep",
    bound: "Time: it stops at its ceiling inside the function's minute.",
    atFull: "Grows with quiet conversations. The first to read if Health says it runs long.",
  },
  pauses: {
    job: "expire-stale-pauses",
    bound: "None: one statement in the database, over rows whose time has come.",
    atFull: "Holds on its index.",
  },
  playbooks: {
    job: "playbooks-sweep",
    bound: "None: it hands each workspace with a moment or step due one job, each running up to a hundred.",
    atFull: "Two jobs a workspace at its hour, spread over five minutes. The ledger's row is the limit.",
  },
  previews: {
    job: "previews-sweep",
    kind: "each_tick",
    cap: ["apps/edge/lib/previews/sweep.ts", "PREVIEWS_PER_TICK"],
    also: ["PREVIEWS_YIELD_AT_MS"],
    atFull: "Only previews past their thirty days. Holds.",
  },
  // One tick, one window, three kinds of work (sender.ts claimAndWrite): what an earlier tick left half-written
  // (REWRITE_PAGE), then the drafts of reach-outs their owners send and the mailboxes' own emails, whichever's turn it is
  // first (draftsGoFirst: the drafts on an even minute). Each is written one at a time and all stop at
  // CLAIM_YIELD_AT_MS, so the lane that goes second has what the first left of the window, and a whole one the minute after.
  reach_out: {
    job: "reach-out-sweep",
    lanes: {
      "drafts an owner sends": {
        kind: "each_tick",
        cap: [SENDER_LANES, "DRAFTS_PER_TICK"],
        limits: [SENDER, "claimDrafts"],
        atFull: ({ root, ticks }) => {
          const each = constantOf(RULES, "REACH_OUT_DRAFTS_PER_DAY", root);
          const due = WORKING_FIGURE * each;
          const anHour = constantOf(SENDER_LANES, "DRAFTS_PER_TICK", root) * ticks;
          return (
            `TIGHT: only reach-outs whose owner sends each email by hand. A thousand of them are handed ${count(due)} drafts a day ` +
            `(\`REACH_OUT_DRAFTS_PER_DAY\` = ${count(each)} each), all due at once, so the last is written ${(due / anHour).toFixed(1)} hours ` +
            "after the first. They share each tick's window with the mailboxes' emails and take turns at going first, so neither keeps the other waiting."
          );
        },
      },
      "emails a mailbox sends": {
        kind: "in_turn",
        until: [SENDER_LANES, "CLAIM_YIELD_AT_MS"],
        also: ["DUE_PAGES", "DUE_MAILBOXES_PAGE", "CLAIM_PER_MAILBOX_PER_TICK", "REWRITE_PAGE"],
        limits: [SENDER, "claimSends", "CLAIM_PER_MAILBOX_PER_TICK"],
        atFull: ({ root }) => {
          const full = outreachAtFull(root);
          const window = constantOf(SENDER_LANES, "CLAIM_YIELD_AT_MS", root) / 1000;
          const claims = ["DUE_PAGES", "DUE_MAILBOXES_PAGE", "CLAIM_PER_MAILBOX_PER_TICK"]
            .map((name) => constantOf(SENDER_LANES, name, root))
            .reduce((a, b) => a * b, 1);
          return (
            `NOT TIMED, and the next clock to hand out. Every workspace spending its month (\`REACH_OUT_MONTH_EMAILS\` = ${count(full.month)}, ` +
            `over ${WEEKDAYS_A_MONTH} weekdays, between ${full.from} and ${full.to} in a lead's own time) is ${count(Math.round(full.aDay))} emails a day, ` +
            `${count(Math.round(full.aMinute))} a minute. A tick writes one at a time for ${count(window)} seconds, a window it shares with the drafts, so it keeps up only if ` +
            `an email is written in ${(window / full.aMinute).toFixed(2)} s, and no run has been timed. Its counts do not bind first: ` +
            `they allow ${count(claims)} claims a tick. Handed out, each mailbox due is one job and the ledger writes them side by side ` +
            "(decision 0115)."
          );
        },
      },
    },
  },
  reach_out_check: {
    job: "reach-out-check-sweep",
    kind: "each_tick",
    cap: [CHECK, "CHECK_PER_TICK"],
    also: [
      "CHECK_PER_WORKSPACE_PER_TICK",
      "CHECK_AT_ONCE",
      [CHECK_ONE, "CHECK_CALLS_UNTIL_MS"],
      [CHECK_ONE, "CHECK_CALL_MS"],
    ],
    atFull: ({ root, ticks }) => {
      const full = outreachAtFull(root);
      const aTick = constantOf(CHECK, "CHECK_PER_TICK", root);
      const atOnce = constantOf(CHECK, "CHECK_AT_ONCE", root);
      const until = constantOf(CHECK_ONE, "CHECK_CALLS_UNTIL_MS", root) / 1000;
      return (
        `SHORT at full: it runs round the clock, so at most ${count(aTick * ticks * 24)} checks a day, against ${count(Math.round(full.aDay))} emails a day ` +
        "if every workspace spends its month, each checked before it goes. And a tick reaches its number only while a check " +
        `answers within ${count(until / (aTick / atOnce))} s: ${count(atOnce)} are asked at once, and none is started after ${count(until)} s. ` +
        "The clock to hand out with the sender."
      );
    },
  },
  registration: {
    job: "registration-sweep",
    kind: "each_tick",
    cap: ["apps/edge/lib/lines/registrations-sweep.ts", "REGISTRATIONS_PER_TICK"],
    atFull: "Only registrations in progress. Holds.",
  },
  snoozes: {
    job: "wake-stale-snoozes",
    bound: "None: one statement in the database, over rows whose time has come.",
    atFull: "Holds on its index.",
  },
  text_canary: {
    job: "text-canary",
    bound: "None needed: one text to the platform's own line, and one read of what became of it.",
    atFull: "The same two texts a day at any size. Holds.",
  },
  texts: {
    job: "texts-sweep",
    bound: "None: it hands each workspace with a line that texts one `texts_read`, every ten minutes.",
    atFull:
      "One job a workspace every ten minutes, spread over five, each reading its own lines fifty texts a page and five pages back. The ledger's row is the limit.",
  },
};

/** The schedule pg_cron holds for each job after every migration, in order. */
export function schedulesOf(root = ROOT) {
  const jobs = new Map();
  for (const [, text] of migrations(root)) {
    const events = [];
    for (const m of text.matchAll(/cron\.schedule\s*\(\s*'([^']+)'\s*,\s*'([^']*)'/g))
      events.push([m.index, m[1], m[2]]);
    for (const m of text.matchAll(/cron\.unschedule\s*\(\s*'([^']+)'/g)) events.push([m.index, m[1], null]);
    for (const [, name, schedule] of events.sort((a, b) => a[0] - b[0])) {
      if (schedule === null) jobs.delete(name);
      else jobs.set(name, schedule);
    }
  }
  return jobs;
}

/** Every migration in order, its comments taken out. */
function migrations(root) {
  const dir = path.join(root, MIGRATIONS);
  return fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()
    .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8").replace(/--[^\n]*/g, "")]);
}

/**
 * How often a backlog is asked for, in seconds: the pace trigger_jobs_tick's last definition keeps for "the rest of the
 * ledger" (00526: pg_cron looks every two seconds, and asks for a tick at this pace unless a row came due in the last three).
 * A definition that keeps no such pace throws: the ledger's row is then read again by a person.
 */
export function backlogPollSeconds(root = ROOT) {
  let body = null;
  for (const [, text] of migrations(root))
    for (const m of text.matchAll(
      /create or replace function public\.trigger_jobs_tick\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$/g,
    ))
      body = m[1];
  const pace = body === null ? null : /v_woken < now\(\) - interval '(\d+) seconds'/.exec(body);
  if (!pace) throw new Error("trigger_jobs_tick's last definition names no pace for a backlog");
  return Number(pace[1]);
}

const DECLARED = /^(?:export )?const ([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*([^;]+);/gm;

/** Each constant a file declares at its top level, by name: its number where it is a plain literal, else null. */
export function constantsOf(file, root = ROOT) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  return new Map(
    [...text.matchAll(DECLARED)].map((m) => [
      m[1],
      /^[0-9_]+$/.test(m[2].trim()) ? Number(m[2].replaceAll("_", "")) : null,
    ]),
  );
}

/** A number constant's own literal, where it is declared. */
export function constantOf(file, name, root = ROOT) {
  const n = constantsOf(file, root).get(name);
  if (n === undefined || n === null) throw new Error(`${file} declares no number ${name}`);
  return n;
}

/** Whether `file` calls `fn` with `name` among what it hands it: the call a limit is the limit of. */
export function handedTo(file, fn, name, root = ROOT) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const named = new RegExp(`\\b${name}\\b`);
  for (const m of text.matchAll(new RegExp(`\\b${fn}\\(`, "g"))) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < text.length; i++) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")" && --depth === 0) {
        if (named.test(text.slice(open, i))) return true;
        break;
      }
    }
  }
  return false;
}

/** How many times an hour a schedule runs, on average: a minute field, or pg_cron's `N seconds`. */
export function ticksAnHour(schedule) {
  const everySeconds = /^(\d+) seconds?$/.exec(schedule);
  if (everySeconds) return 3600 / Number(everySeconds[1]);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = schedule.split(" ");
  const inAnHour = minute.split(",").reduce((sum, part) => {
    const [range, step = "1"] = part.split("/");
    if (range === "*") return sum + Math.ceil(60 / Number(step));
    const [from, to = from] = range.split("-").map(Number);
    return sum + Math.floor((to - from) / Number(step)) + 1;
  }, 0);
  if ([dayOfMonth, month, dayOfWeek].some((f) => f !== "*")) throw new Error(`a schedule by the day: ${schedule}`);
  const hours = /^\*\/(\d+)$/.exec(hour);
  return hours ? inAnHour / Number(hours[1]) : hour === "*" ? inAnHour : inAnHour / 24;
}

/** A clock's rows: itself, or one for each of its lanes, each under the name the page prints. */
export function rowsOf(capacity = CAPACITY) {
  return Object.entries(capacity).flatMap(([clock, entry]) =>
    entry.lanes
      ? Object.entries(entry.lanes).map(([lane, row]) => ({ ...row, clock, job: entry.job, name: `${clock}: ${lane}` }))
      : [{ ...entry, clock, name: clock }],
  );
}

/** A row's own limit: [file, name] of the constant its kind reads, or null for a row of words. */
const ownLimit = (row) => (row.kind ? row[KINDS[row.kind].field] : null);

/** Every constant a row names, as [file, name]: its own, the moment it claims for, and the others its file holds. */
function namedBy(row) {
  const own = ownLimit(row);
  if (!own) return [];
  const others = (row.also ?? []).map((a) => (Array.isArray(a) ? a : [own[0], a]));
  return [own, ...(row.claimsFor ? [row.claimsFor] : []), ...others];
}

/**
 * The three checks (the header). Throws on the first row that fails one, saying what to do; `generate` runs it, so a table
 * that reads a number as what it is not writes no page.
 */
export function assertReadsRight(capacity = CAPACITY, root = ROOT) {
  const rows = rowsOf(capacity);
  const readers = new Map();
  for (const row of rows) {
    if (Boolean(row.kind) === Boolean(row.bound))
      throw new Error(`${row.name}: a kind with its constant, or words, one of them`);
    if (!row.kind) continue;
    const kind = KINDS[row.kind];
    if (!kind) throw new Error(`${row.name}: ${row.kind} is no kind of limit (${Object.keys(KINDS).join(", ")})`);
    const own = row[kind.field];
    if (!own) throw new Error(`${row.name}: ${row.kind} reads its \`${kind.field}\``);
    // 1. The name says the kind.
    if (!kind.named.test(own[1]))
      throw new Error(`${row.name}: ${own[1]} is read as ${kind.says}, and is not named as one; say the kind it is`);
    if (row.kind === "at_once" && !row.claimsFor)
      throw new Error(`${row.name}: slots say how long they claim for (claimsFor)`);
    for (const [file, name] of namedBy(row))
      if (!constantsOf(file, root).has(name)) throw new Error(`${row.name}: ${file} declares no ${name}`);
    readers.set(own[0], [...(readers.get(own[0]) ?? []), row]);
  }
  for (const [file, of] of readers) {
    // 2. Every limit the file holds is on the page.
    const named = new Set(
      of.flatMap((row) =>
        namedBy(row)
          .filter(([f]) => f === file)
          .map(([, name]) => name),
      ),
    );
    const unsaid = [...constantsOf(file, root).keys()].filter((name) => LIMIT_SHAPED.test(name) && !named.has(name));
    if (unsaid.length)
      throw new Error(
        `${of.map((r) => r.name).join(", ")}: ${file} also holds ${unsaid.join(", ")}; name each in a row's \`also\`, or give its work a lane`,
      );
    // 3. Two rows on one file each say which call their number is handed to.
    for (const row of of) {
      if (of.length < 2 && !row.limits) continue;
      if (!row.limits)
        throw new Error(`${row.name}: ${file} feeds ${of.length} rows, so each says the call its number limits`);
      const [where, fn, name = ownLimit(row)[1]] = row.limits;
      if (!namedBy(row).some(([, n]) => n === name))
        throw new Error(`${row.name}: ${name} is not a constant this row names`);
      if (!handedTo(where, fn, name, root))
        throw new Error(`${row.name}: ${where} hands ${name} to no call of ${fn}; that number limits something else`);
    }
  }
}

const said = ([file, name], root) => {
  const n = constantsOf(file, root).get(name);
  return n === null || n === undefined ? `\`${name}\`` : `\`${name}\` = ${count(n)}`;
};

/** What bounds a tick, as the page says it. */
function limitOf(row, root) {
  if (!row.kind) return row.bound;
  const others = namedBy(row)
    .slice(row.claimsFor ? 2 : 1)
    .map((ref) => said(ref, root));
  const beside = others.length ? `; beside it ${others.join(", ")}` : "";
  if (row.kind === "each_tick") return `${said(row.cap, root)}${beside}`;
  if (row.kind === "in_turn") return `Time: one at a time until ${said(row.until, root)} ms${beside}`;
  return `${said(row.cap, root)} side by side, each claiming for ${said(row.claimsFor, root)} ms${beside}`;
}

/** The most an hour holds, as the page says it: a count where the limit is one, else the seconds of work there are. */
function hourOf(row, ticks, root) {
  if (!row.kind) return "No ceiling";
  if (row.kind === "each_tick") return count(constantOf(...row.cap, root) * ticks);
  if (row.kind === "in_turn") return `${seconds(constantOf(...row.until, root) * ticks)} s of work, in turn`;
  const starts = row.startsEverySeconds ? 3600 / row.startsEverySeconds(root) : ticks;
  const work = starts * constantOf(...row.cap, root) * constantOf(...row.claimsFor, root);
  return `${seconds(work)} s of work on a backlog`;
}

function line(row, schedules, root) {
  const schedule = schedules.get(row.job);
  if (!schedule) throw new Error(`${row.name}: pg_cron holds no job ${row.job}`);
  const ticks = ticksAnHour(schedule);
  const atFull = typeof row.atFull === "function" ? row.atFull({ root, ticks }) : row.atFull;
  return `| ${row.name} | \`${schedule}\` | ${limitOf(row, root)} | ${hourOf(row, ticks, root)} | ${atFull} |`;
}

/** The page. */
export function generate(root = ROOT, capacity = CAPACITY) {
  assertReadsRight(capacity, root);
  const schedules = schedulesOf(root);
  return [
    "# What each clock can do",
    "",
    `Generated by \`corepack pnpm gen:capacity\`; do not edit by hand. The schedule is the migrations' last word and each limit is its constant's own value. "At ${count(WORKING_FIGURE)} workspaces", the working figure a full platform is judged against (decision 0115), is a person's reading of those numbers, kept in the script, with its own numbers worked out from the constants.`,
    "",
    "A clock's hourly work once ran inside its own sixty-second function, so it had a ceiling no rotation could lift. The clocks with no ceiling below hand each workspace a job, and the ledger runs it. The retention and daily-count clocks (`tests/clocks/_clocks.mjs`, kinds `keep` and `roll`) are not listed: they do not grow with what a customer waits for.",
    "",
    'A limit is read as what it is. A count a tick takes gives the hour a count. A tick that works in turn until a moment, or runs a few side by side, gives the hour seconds of work: how many items that is depends on how long one takes, and a row says NOT TIMED until a run has measured it. A clock whose tick does two kinds of work has a row for each, named "clock: work".',
    "",
    `| Clock | Runs | What bounds a tick | Most in an hour | At ${count(WORKING_FIGURE)} workspaces |`,
    "| --- | --- | --- | --- | --- |",
    ...rowsOf(capacity)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((row) => line(row, schedules, root)),
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const page = generate();
  fs.writeFileSync(path.join(ROOT, OUT), page);
  console.log(`wrote ${OUT} (${Object.keys(CAPACITY).length} clocks, ${rowsOf().length} rows)`);
}
