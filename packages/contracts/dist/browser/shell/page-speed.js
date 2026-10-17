import { PAGE_VITAL_BANDS, vitalValueWords } from "./vitals.js";
export const PAGE_SPEED_READ = { days: 7, most: 5e4 };
export const PAGE_SPEED_MIN = 20;
const SPOT_MIN = 10;
const PAGE_SPEED_BANDS = {
  load: [1500, 3e3],
  move: [500, 1200],
  within: PAGE_VITAL_BANDS.INP
};
const PAGE_LABELS = {
  today: "Today",
  inbox: "Inbox",
  conversations: "Conversations",
  live: "Live",
  people: "People",
  leads: "Leads",
  pipeline: "Pipeline",
  person: "A person's page",
  lists: "Lists",
  calendar: "Calendar",
  reports: "Reports",
  campaigns: "Campaigns",
  broadcasts: "Sent",
  playbooks: "Playbooks",
  templates: "Templates",
  settings: "Settings",
  start: "Getting started",
  other: "Other pages"
};
const PART_LABELS = {
  queue: "the queue",
  setup: "what is left to set up",
  strip: "the strip",
  card: "the day's card",
  look: "Worth a look",
  list: "the list",
  thread: "a thread opened",
  call: "a call opened",
  table: "the table",
  board: "the board",
  hero: "the person"
};
function pageSpeedLabel(page) {
  return PAGE_LABELS[page] ?? page.charAt(0).toUpperCase() + page.slice(1);
}
function partLabel(part) {
  return PART_LABELS[part] ?? part;
}
const VERDICT_TONES = { good: "ok", "needs work": "warn", poor: "danger" };
function speedVerdict(how, p75) {
  const [good, poor] = PAGE_SPEED_BANDS[how];
  if (p75 <= good) return "good";
  return p75 <= poor ? "needs work" : "poor";
}
const msWords = (v) => vitalValueWords("LCP", v);
const countWords = (n, one, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const DEFERRED_STEPS = [
  {
    key: "people-projection",
    label: "Step 3, People without everyone",
    page: "people",
    line: 500,
    also: "or when a workspace passes 500 people (decision 0053)"
  }
];
const DEFERRED_SAID = "A speed step put off until its number passes its line: each number against its line.";
function deferredLines(at) {
  return DEFERRED_STEPS.map((s) => {
    const move = at("READY", s.page, "", "move");
    const taken = `Taken when ${pageSpeedLabel(s.page)}'s moves pass ${msWords(s.line)}, three in four, ${s.also}`;
    if (!move)
      return {
        key: s.key,
        label: s.label,
        value: "too few moves",
        tone: "ok",
        hint: `${taken}. Too few moves to say yet.`
      };
    const past = move.p75 > s.line;
    return {
      key: s.key,
      label: s.label,
      value: `${msWords(move.p75)} of ${msWords(s.line)}`,
      tone: past ? "warn" : "ok",
      hint: past ? `${taken}. Past its line: take it.` : `${taken}.`
    };
  });
}
function indexOf(rows) {
  const by = /* @__PURE__ */ new Map();
  for (const r of rows) by.set(`${r.metric}|${r.page ?? "*"}|${r.part}|${r.how}|${r.device}|${r.warm}`, r);
  return (metric, page, part, how, device = "all", warm = "all") => {
    const r = by.get(`${metric}|${page ?? "*"}|${part}|${how}|${device}|${warm}`);
    return r && r.samples >= PAGE_SPEED_MIN ? r : null;
  };
}
function share(part, whole) {
  return `${Math.round(part / whole * 10)} in 10`;
}
function pageLine(at, page) {
  const load = at("READY", page, "", "load");
  const move = at("READY", page, "", "move");
  const lead = move ?? load;
  if (!lead) return null;
  const how = move ? "move" : "load";
  const held = at("READY", page, "", "move", "all", "held");
  const read = at("READY", page, "", "move", "all", "read");
  const settled = at("SETTLED", page, "", "load");
  const phone = at("READY", page, "", how, "phone");
  const waits = read?.waits_on ?? load?.waits_on ?? null;
  const said = [
    load ? `opened ${msWords(load.p75)}` : null,
    move ? `moved to ${msWords(move.p75)}${held ? `, ${share(held.samples, move.samples)} from held rows` : ""}` : null,
    read ? `${msWords(read.p75)} when it had to read` : null,
    settled ? `all in ${msWords(settled.p75)}` : null,
    waits ? `waits on ${waits}` : null,
    phone ? `on a phone ${msWords(phone.p75)}` : null
  ].filter(Boolean);
  const text = said.join(" \xB7 ");
  const verdict = speedVerdict(how, lead.p75);
  return {
    page,
    label: pageSpeedLabel(page),
    value: msWords(lead.p75),
    tone: VERDICT_TONES[verdict],
    hint: `${text.charAt(0).toUpperCase()}${text.slice(1)} \xB7 ${countWords(lead.samples, how === "move" ? "move" : "load")}`
  };
}
function partLines(rows, shown) {
  return rows.filter(
    (r) => r.metric === "READY" && r.page !== null && r.part !== "" && r.how === "all" && r.device === "all" && r.warm === "all" && r.samples >= PAGE_SPEED_MIN
  ).sort((a, b) => b.p75 - a.p75 || `${a.page}.${a.part}`.localeCompare(`${b.page}.${b.part}`)).slice(0, shown).map((r) => {
    const page = r.page ?? "";
    const verdict = speedVerdict(r.part === "thread" || r.part === "call" ? "within" : "move", r.p75);
    return {
      key: `${page}.${r.part}`,
      label: `${pageSpeedLabel(page)} \xB7 ${partLabel(r.part)}`,
      value: msWords(r.p75),
      tone: VERDICT_TONES[verdict],
      hint: `${msWords(r.p75)} \xB7 ${countWords(r.samples, "time")} drawn${r.waits_on ? ` \xB7 waits on ${r.waits_on}` : ""}`
    };
  });
}
const PHASE_WORDS = {
  input: "waiting for the page to be free",
  processing: "in the page's own handlers",
  presentation: "drawing what changed",
  ttfb: "waiting for the server",
  load_delay: "before its file was asked for",
  load: "loading its file",
  render_delay: "waiting to be drawn"
};
function spotLines(spots, metric, shown, noun) {
  const band = PAGE_VITAL_BANDS[metric];
  return spots.filter((s) => s.metric === metric && s.samples >= SPOT_MIN && (metric !== "CLS" || s.p75 > band[0] / 2)).sort((a, b) => b.p75 - a.p75 || `${a.page}.${a.el}`.localeCompare(`${b.page}.${b.el}`)).slice(0, shown).map((s) => {
    const value = vitalValueWords(metric, s.p75);
    const verdict = s.p75 <= band[0] ? "good" : s.p75 <= band[1] ? "needs work" : "poor";
    const phase = s.phase ? PHASE_WORDS[s.phase] : void 0;
    return {
      key: `${metric}.${s.page}.${s.el}`,
      label: `${s.el} on ${pageSpeedLabel(s.page)}`,
      value,
      tone: VERDICT_TONES[verdict],
      hint: `${value} \xB7 ${countWords(s.samples, noun)}${phase ? ` \xB7 mostly ${phase}` : ""}`
    };
  });
}
function speedSentence(at) {
  const move = at("READY", null, "", "move");
  const load = at("READY", null, "", "load");
  const days = PAGE_SPEED_READ.days;
  if (move && load)
    return `Of ${countWords(move.samples, "move")} in the last ${days} days, three in four drew their page within ${msWords(move.p75)}; of ${countWords(load.samples, "page load")}, within ${msWords(load.p75)}.`;
  if (move)
    return `Of ${countWords(move.samples, "move")} in the last ${days} days, three in four drew their page within ${msWords(move.p75)}.`;
  if (load)
    return `Of ${countWords(load.samples, "page load")} in the last ${days} days, three in four drew their page within ${msWords(load.p75)}.`;
  return `Not enough pages have said where their time went in the last ${days} days.`;
}
const PARTS_SAID = "The parts of a page drawn last, three in four times, from the page's start or from the press that opened them.";
const SPOTS_SAID = "The taps that waited longest, the paints drawn last and what moved under a person's eye, each by the element's test id.";
const PAGES_SHOWN = 12;
const PARTS_SHOWN = 10;
export function pageSpeedWords(speed) {
  const none = {
    pages: [],
    parts: [],
    taps: [],
    paints: [],
    shifts: [],
    partsSentence: PARTS_SAID,
    spotsSentence: SPOTS_SAID,
    deferredSentence: DEFERRED_SAID,
    deferred: []
  };
  if (speed === null) return { sentence: "Where the pages' time goes could not be read just now.", ...none };
  const at = indexOf(speed.rows);
  const named = [...new Set(speed.rows.map((r) => r.page).filter((p) => p !== null))];
  const pages = named.map((p) => pageLine(at, p)).filter((p) => p !== null).sort((a, b) => {
    const pa = at("READY", a.page, "", "move") ?? at("READY", a.page, "", "load");
    const pb = at("READY", b.page, "", "move") ?? at("READY", b.page, "", "load");
    return (pb?.p75 ?? 0) - (pa?.p75 ?? 0) || a.page.localeCompare(b.page);
  }).slice(0, PAGES_SHOWN);
  return {
    sentence: speedSentence(at),
    pages,
    partsSentence: PARTS_SAID,
    spotsSentence: SPOTS_SAID,
    parts: partLines(speed.rows, PARTS_SHOWN),
    taps: spotLines(speed.spots, "INP", 6, "tap"),
    paints: spotLines(speed.spots, "LCP", 4, "paint"),
    shifts: spotLines(speed.spots, "CLS", 4, "shift"),
    deferredSentence: DEFERRED_SAID,
    deferred: deferredLines(at)
  };
}
