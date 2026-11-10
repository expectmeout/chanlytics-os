/**
 * docs/capacity.md: how much each clock can do, read from the code that holds it (decision 0115). Each row names a clock, the
 * job pg_cron runs it by and the constant that bounds it; the schedule is the migrations' last word and the number is the
 * constant's own literal, so a change to either changes the page, and tests/docs/capacity.test.mjs fails a stale one and a
 * clock with no row. What a row says of a full platform is a person's reading of the numbers beside it, written here.
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
 * Every clock that does work, by the register's name (sweep_status.sweep). `cap` is the constant that bounds a tick, where one
 * does; `bound` says what bounds it where no number does; `atFull` is what that comes to at the working figure.
 */
export const CAPACITY = {
  calendar: {
    job: "calendar-people-sweep",
    bound: "None: it hands each workspace with a calendar due one `calendar_read`.",
    atFull: "One job a workspace an hour. The ledger's row is the limit.",
  },
  calls: {
    job: "call-reconcile",
    cap: ["apps/edge/lib/voice/calls-sweep.ts", "CALLS_PER_TICK"],
    atFull: "Only calls ended without a result. Holds: a provider's webhook does most of them.",
  },
  channel_quality: {
    job: "channel-quality-sweep",
    cap: ["apps/edge/lib/whatsapp/number-quality.ts", "MAX_DUE"],
    atFull: "A thousand numbers are each read within twelve hours. Holds: Health expects a read every nineteen.",
  },
  deadman: {
    job: "deadman-sweep",
    bound: "Time: it stops starting work inside the budgets at the top of its sweep.",
    atFull: "Only what a crash left. Holds while crashes are rare, and it says what it left.",
  },
  drafts: {
    job: "drafts-sweep",
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
    cap: ["packages/jobs/src/runner/ledger.ts", "CLAIM_SLOTS"],
    atFull:
      "The limit under every handed-out row. Each tick runs this many side by side, and claims for its first twenty seconds. A claim beside 50,000 waiting jobs costs 33 ms and a ceiling test holds it (`jobs-lanes.db.test.mjs`); `jobs_backlog` pages first if work outruns it.",
  },
  jobs_canary: {
    job: "jobs-canary",
    bound: "One job in our own workspace.",
    atFull: "Does not grow with workspaces.",
  },
  leads: {
    job: "leads-sweep",
    cap: ["apps/edge/lib/leads/sweep.ts", "RECONCILE_PER_TICK"],
    atFull: "Only runs whose start or lease was lost. Holds.",
  },
  lines: {
    job: "lines-sweep",
    cap: ["apps/edge/lib/lines/sweep.ts", "LINES_PER_TICK"],
    atFull: "Only lines being set up and stuck. Holds, unless a thousand sign up in one day.",
  },
  mailboxes: {
    job: "mailboxes-sweep",
    cap: ["apps/edge/lib/email/mailbox/sweep.ts", "MAX_DUE"],
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
    cap: ["apps/edge/lib/previews/sweep.ts", "PREVIEWS_PER_TICK"],
    atFull: "Only previews past their thirty days. Holds.",
  },
  reach_out: {
    job: "reach-out-sweep",
    cap: ["apps/edge/lib/campaigns/reach-out/sender/lanes.ts", "DRAFTS_PER_TICK"],
    atFull:
      "TIGHT: 28,800 emails in an eight-hour day, against 30,000 if a thousand mailboxes each send thirty. The next clock to hand out if outreach is used that widely.",
  },
  reach_out_check: {
    job: "reach-out-check-sweep",
    cap: ["apps/edge/lib/campaigns/reach-out/check.ts", "CHECK_PER_TICK"],
    atFull: "2,400 emails checked an hour. Holds beside the sender's row.",
  },
  registration: {
    job: "registration-sweep",
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
    bound:
      "Time: lines in order, oldest first, until forty seconds have gone (`TEXTS_YIELD_AT_MS`), one Twilio read each.",
    atFull:
      "TIGHT: about a hundred lines a tick at a few hundred milliseconds a read, so past that the newest lines are never read. The next clock to hand out a job a workspace.",
  },
};

/** The schedule pg_cron holds for each job after every migration, in order. */
export function schedulesOf(root = ROOT) {
  const jobs = new Map();
  const dir = path.join(root, MIGRATIONS);
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const text = fs.readFileSync(path.join(dir, f), "utf8").replace(/--[^\n]*/g, "");
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

/** A number constant's own literal, where it is declared. */
export function constantOf(file, name, root = ROOT) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  const m = new RegExp(`^(?:export )?const ${name}\\s*(?::[^=]+)?=\\s*([0-9_]+)\\s*;`, "m").exec(text);
  if (!m) throw new Error(`${file} declares no number ${name}`);
  return Number(m[1].replaceAll("_", ""));
}

/** How many times an hour a schedule runs, on average: a minute field, or pg_cron's `N seconds`. */
export function ticksAnHour(schedule) {
  const seconds = /^(\d+) seconds?$/.exec(schedule);
  if (seconds) return 3600 / Number(seconds[1]);
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

const count = (n) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toFixed(1));

function row(clock, { job, cap, bound, atFull }, schedules, root) {
  const schedule = schedules.get(job);
  if (!schedule) throw new Error(`${clock}: pg_cron holds no job ${job}`);
  const ticks = ticksAnHour(schedule);
  const number = cap ? constantOf(cap[0], cap[1], root) : null;
  const limit = cap ? `\`${cap[1]}\` = ${count(number)}` : bound;
  const hourly = cap ? count(number * ticks) : "No ceiling";
  return `| ${clock} | \`${schedule}\` | ${limit} | ${hourly} | ${atFull} |`;
}

/** The page. */
export function generate(root = ROOT) {
  const schedules = schedulesOf(root);
  return [
    "# What each clock can do",
    "",
    `Generated by \`corepack pnpm gen:capacity\`; do not edit by hand. The schedule is the migrations' last word and each limit is its constant's own value. "At ${count(WORKING_FIGURE)} workspaces", the working figure a full platform is judged against (decision 0115), is a person's reading of those numbers, kept in the script.`,
    "",
    "A clock's hourly work once ran inside its own sixty-second function, so it had a ceiling no rotation could lift. The clocks with no ceiling below hand each workspace a job, and the ledger runs it. The retention and daily-count clocks (`tests/clocks/_clocks.mjs`, kinds `keep` and `roll`) are not listed: they do not grow with what a customer waits for.",
    "",
    `| Clock | Runs | What bounds a tick | Most in an hour | At ${count(WORKING_FIGURE)} workspaces |`,
    "| --- | --- | --- | --- | --- |",
    ...Object.entries(CAPACITY)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([clock, entry]) => row(clock, entry, schedules, root)),
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const page = generate();
  fs.writeFileSync(path.join(ROOT, OUT), page);
  console.log(`wrote ${OUT} (${Object.keys(CAPACITY).length} clocks)`);
}
