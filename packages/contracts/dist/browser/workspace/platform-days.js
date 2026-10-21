import { DAY_MS, HOUR_MS, MIN_MS } from "../shared/time.js";
export const PLATFORM_DAYS_READ = { days: 7 };
const sum = (m) => Object.values(m).reduce((a, n) => a + n, 0);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const FAILURE_WORDS = {
  refused: "refused",
  retryable: "not taken",
  unknown: "may have gone"
};
function failuresOf(m) {
  const n = sum(m);
  if (n === 0) return "";
  const parts = Object.entries(m).filter(([, c]) => c > 0).sort(([a], [b]) => a.localeCompare(b)).map(([outcome, c]) => `${c} ${FAILURE_WORDS[outcome] ?? outcome}`);
  return `${plural(n, "send", "sends")} failed (${parts.join(", ")})`;
}
const LANE_WORDS = { "0": "replies", "1": "the waiting", "2": "bulk", none: "the rest" };
const SECONDS_UP_TO_MS = 100 * 1e3;
const seconds = (ms) => ms < SECONDS_UP_TO_MS ? `${(ms / 1e3).toFixed(1)} s` : ms < HOUR_MS ? `${Math.round(ms / MIN_MS)} min` : ms < 2 * DAY_MS ? `${Math.round(ms / HOUR_MS)} h` : `${Math.round(ms / DAY_MS)} days`;
function spineLine(r) {
  const parts = [];
  const lanes = Object.entries(r.job_lag_ms).sort(([a], [b]) => a.localeCompare(b));
  const [first, ...rest] = lanes;
  if (first) {
    const [lane0, ms0] = first;
    parts.push(
      [`${LANE_WORDS[lane0] ?? `lane ${lane0}`} claimed within ${seconds(ms0)}`].concat(rest.map(([lane, ms]) => `${LANE_WORDS[lane] ?? `lane ${lane}`} within ${seconds(ms)}`)).join(", ")
    );
  }
  const channels = Object.keys(r.first_answer_ms).sort();
  if (channels.length) {
    const worst = Math.max(...Object.values(r.first_answer_ms));
    parts.push(`first answer within ${seconds(worst)} (${channels.join(", ")})`);
  }
  if (r.duplicate_sends !== null) parts.push(plural(r.duplicate_sends, "duplicate send", "duplicate sends"));
  const died = sum(r.dead_letters);
  if (died > 0) {
    const kinds = Object.entries(r.dead_letters).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([kind, n]) => `${kind} ${n}`);
    parts.push(`${plural(died, "job", "jobs")} died (${kinds.join(", ")})`);
  }
  if (r.relay_lag_ms !== null) parts.push(`events relayed within ${seconds(r.relay_lag_ms)}`);
  const providers = Object.keys(r.intake_lag_ms).sort();
  if (providers.length) {
    const worst = Math.max(...Object.values(r.intake_lag_ms));
    parts.push(`deliveries taken in within ${seconds(worst)} (${providers.join(", ")})`);
  }
  return parts.join("; ");
}
function receptionistLine(r) {
  const replies = r.replies_answered + r.replies_held + r.replies_handed_off;
  if (replies === 0) return "the receptionist did not reply";
  const parts = [
    `${r.replies_answered} answered at once`,
    ...r.replies_held ? [`${r.replies_held} held`] : [],
    ...r.replies_handed_off ? [`${r.replies_handed_off} handed over`] : []
  ];
  const pace = r.brain_p95_ms === null ? "" : ` \xB7 95% within ${(r.brain_p95_ms / 1e3).toFixed(1)} s`;
  return `${parts.join(", ")}${pace}`;
}
export function platformDaysWords(rows) {
  if (!rows) return { day: null, sentence: "Could not be read just now.", lines: [] };
  const day = rows.reduce((d, r) => d === null || r.day > d ? r.day : d, null);
  if (day === null) return { day: null, sentence: "No day has been counted yet.", lines: [] };
  const lines = rows.filter((r) => r.day === day).map((r) => ({
    tenantId: r.tenant_id,
    name: r.name,
    day: r.day,
    answers: `${r.asks} asked, ${r.answered} answered`,
    receptionist: receptionistLine(r),
    failures: failuresOf(r.provider_failures),
    spine: spineLine(r),
    silent: r.asks > 0 && r.answered === 0,
    tone: r.asks > 0 && r.answered === 0 ? "danger" : "plain",
    asks: r.asks
  })).sort((a, b) => Number(b.silent) - Number(a.silent) || b.asks - a.asks || a.name.localeCompare(b.name)).map(({ asks: _asks, ...line }) => line);
  const silent = lines.filter((l) => l.silent).length;
  const sentence = `${plural(lines.length, "workspace", "workspaces")} worked on ${day}` + (silent ? `; ${silent} answered nobody.` : "; every one written to answered.");
  return { day, sentence, lines };
}
const heldToNothing = (why) => ({ promise: false, why });
export const PLATFORM_NUMBERS = {
  messages_in: heldToNothing("what customers sent, by channel"),
  messages_out: heldToNothing("what left, by channel"),
  asks: heldToNothing("the customers' messages; with answered, the answer rate, whose alarm is answer_rate_zero"),
  answered: heldToNothing("the customers' messages anyone answered"),
  replies_answered: heldToNothing("the receptionist's replies sent at once"),
  replies_held: heldToNothing("the receptionist's replies held for a person: the hold rate, invariant 11's"),
  replies_handed_off: heldToNothing("the receptionist's replies that handed the thread to a person"),
  brain_p95_ms: {
    promise: true,
    most: 1e4,
    unit: "ms",
    alarm: true,
    why: "the receptionist's model answers within ten seconds, at the 95th percentile"
  },
  provider_failures: heldToNothing(
    "a provider's verdict on a send, by what it came to: a number's, read beside what left"
  ),
  tokens: heldToNothing("the model's tokens"),
  handled: heldToNothing("how the customers' messages ended"),
  topics: heldToNothing("what the customers asked about"),
  ai_tokens: heldToNothing("the model's tokens by purpose"),
  ai_usd: heldToNothing("the model's cost by purpose, at list price"),
  voice_usd: heldToNothing("the calls' cost"),
  job_lag_ms: {
    promise: true,
    most: { "0": 1e4, "1": 3e4, "2": 5 * MIN_MS },
    otherwise: 5 * MIN_MS,
    unit: "ms",
    alarm: true,
    why: "a reply's job is claimed within ten seconds of its time, a waiting person's within thirty, bulk within five minutes, at the 95th percentile"
  },
  first_answer_ms: {
    promise: true,
    most: { email: 15 * MIN_MS },
    otherwise: 3e4,
    unit: "ms",
    alarm: false,
    why: "a customer has a first answer within thirty seconds on a text channel and fifteen minutes by email, at the 95th percentile, whoever answers: the workspace's wait, a person's answer in it, so shown and not paged"
  },
  duplicate_sends: {
    promise: true,
    most: 0,
    unit: "count",
    alarm: true,
    why: "nobody is sent the same words twice (invariant 4)"
  },
  dead_letters: { promise: true, most: {}, otherwise: 0, unit: "count", alarm: true, why: "no job dies" },
  relay_lag_ms: {
    promise: true,
    most: 15e3,
    unit: "ms",
    alarm: true,
    why: "an event reaches its subscribers' deliveries within fifteen seconds, at the 95th percentile"
  },
  intake_lag_ms: {
    promise: true,
    most: {},
    otherwise: MIN_MS,
    unit: "ms",
    alarm: true,
    why: "a provider's delivery is kept within a minute of the provider's own clock, at the 95th percentile"
  }
};
function mostFor(t, key) {
  if (typeof t.most === "number") return t.most;
  return (key !== null && Object.hasOwn(t.most, key) ? t.most[key] : void 0) ?? t.otherwise ?? Number.POSITIVE_INFINITY;
}
function breachesOf(name, t, v) {
  if (typeof v === "number") {
    const most = mostFor(t, null);
    return v > most ? [{ number: name, key: null, value: v, most }] : [];
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return [];
  return Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, x]) => {
    const most = mostFor(t, key);
    return typeof x === "number" && x > most ? [{ number: name, key, value: x, most }] : [];
  });
}
export function pastTarget(row, { all = false } = {}) {
  const values = row;
  return Object.entries(PLATFORM_NUMBERS).flatMap(
    ([name, n]) => n.promise && (all || n.alarm) ? breachesOf(name, n, values[name]) : []
  );
}
function figure(name, v) {
  const n = PLATFORM_NUMBERS[name];
  return n.promise && n.unit === "ms" ? seconds(v) : String(v);
}
export function pastTargetPage(day, workspaces) {
  const lines = workspaces.map(
    (w) => `  ${w.name} (${w.tenantId}): ` + w.breaches.map(
      (b) => `${b.number}${b.key === null ? "" : ` ${b.key}`} ${figure(b.number, b.value)}, target ${figure(b.number, b.most)}`
    ).join("; ")
  );
  return {
    subject: `${plural(workspaces.length, "workspace", "workspaces")} past a target on ${day}`,
    body: `On ${day} (UTC) these numbers went past the targets the platform answers for (decision 0031, invariant 12; contracts PLATFORM_NUMBERS):

${lines.join("\n")}

The day's counts are in platform_metrics (the back office's day by workspace).
`
  };
}
