import { PLATFORM_NUMBERS, pastTarget } from "../workspace/platform-days.js";
import { DAY_MS, HOUR_MS, MIN_MS } from "../shared/time.js";
import { inScope } from "./health-scope.js";
const PROMISE_WORDS = {
  brain_p95_ms: { title: "The receptionist answers within 10 s", small: "95th percentile", short: "the receptionist" },
  job_lag_ms: {
    title: "A job is claimed on time",
    small: "a reply 10 s, a waiting person 30 s, bulk 5 min",
    short: "jobs"
  },
  first_answer_ms: {
    title: "A customer's first answer comes fast",
    small: "30 s by text, 15 min by email \xB7 shown, not paged",
    short: "first answer"
  },
  duplicate_sends: {
    title: "Nobody gets the same words twice",
    small: "sends of one text within a minute",
    short: "duplicates"
  },
  dead_letters: { title: "No job dies", small: "jobs that failed for good", short: "dead jobs" },
  relay_lag_ms: {
    title: "An event reaches its deliveries within 15 s",
    small: "95th percentile",
    short: "event relay"
  },
  intake_lag_ms: {
    title: "A provider's delivery is kept within a minute",
    small: "95th percentile",
    short: "intake"
  }
};
const PROMISES = Object.keys(PROMISE_WORDS);
const MS_PER_SECOND = 1e3;
function promiseFigureWords(name, v) {
  if (PLATFORM_NUMBERS[name].unit === "count") return String(v);
  if (v >= 2 * HOUR_MS) return `${Math.round(v / HOUR_MS)} h`;
  if (v >= MIN_MS) return `${(v / MIN_MS).toFixed(1)} min`;
  return `${(v / MS_PER_SECOND).toFixed(1)} s`;
}
function holds(row, name) {
  const v = row[name];
  if (typeof v === "number") return true;
  return !!v && typeof v === "object" && Object.keys(v).length > 0;
}
function windowDays(rows, days) {
  const newest = rows.reduce((m, r) => r.day > m ? r.day : m, "");
  if (!newest) return [];
  const end = Date.parse(`${newest}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));
}
export function promiseDaysOf(rows, ours, scope, days) {
  const inView = (rows ?? []).filter((r) => inScope(ours.has(r.tenant_id), scope));
  const span = windowDays(rows ?? [], days);
  const byDay = /* @__PURE__ */ new Map();
  for (const r of inView) byDay.set(r.day, [...byDay.get(r.day) ?? [], r]);
  const out = PROMISES.map((name) => {
    const target = PLATFORM_NUMBERS[name];
    let worst = null;
    const missedBy = /* @__PURE__ */ new Set();
    let lastMissMs = null;
    const cells = span.map((day) => {
      const dayRows = byDay.get(day) ?? [];
      if (!dayRows.some((r) => holds(r, name))) return { day, state: "none", words: null };
      let dayWorst = null;
      for (const r of dayRows)
        for (const b of pastTarget(r, { all: true }).filter((x) => x.number === name)) {
          missedBy.add(r.name);
          if (!dayWorst || b.value > dayWorst.v) dayWorst = { v: b.value, most: b.most, key: b.key };
          if (!worst || b.value > worst.v) worst = { v: b.value, most: b.most, key: b.key, name: r.name, day };
        }
      if (!dayWorst) return { day, state: "kept", words: null };
      lastMissMs = Date.parse(`${day}T23:59:59Z`);
      return {
        day,
        state: "missed",
        words: `${dayWorst.key ? `${dayWorst.key} ` : ""}${promiseFigureWords(name, dayWorst.v)}, target ${promiseFigureWords(name, dayWorst.most)}`
      };
    });
    const missedDays = cells.filter((c) => c.state === "missed").length;
    const judged = cells.some((c) => c.state !== "none");
    const w = worst;
    return {
      key: name,
      ...PROMISE_WORDS[name],
      alarm: target.alarm,
      state: missedDays ? "missed" : judged ? "kept" : "unjudged",
      missedDays,
      cells,
      last: w ? `${w.key ? `${w.key} ` : ""}${promiseFigureWords(name, w.v)}` : judged ? "kept" : "not judged",
      worst: w ? `${w.name}: ${w.key ? `${w.key} ` : ""}${promiseFigureWords(name, w.v)} on ${w.day}, target ${promiseFigureWords(name, w.most)}` : null,
      lastMissMs,
      where: [...missedBy].join(", ") || "Every workspace"
    };
  });
  return { days: span, rows: out };
}
