import { PROMPT_OPENINGS as O } from "./workspace-config/compose.js";
import { NO_FIELDS_COMPOSED_WORDS, whoseWords } from "./workspace-config/resolve.js";
const PLATFORM_LABEL = "Chanlytics' own instructions";
const PLATFORM_NOTE = "The same for every business";
const BLOCK_MARKS = /* @__PURE__ */ (() => [
  { row: "hours", label: "When you're open", startsWith: O.hours },
  { row: "closures", label: "Days you're closed", startsWith: O.closures },
  { row: "services", label: "Services", startsWith: O.services },
  { row: "notes", label: "Things it should know", startsWith: O.notes },
  { row: "booking_rules", label: "Booking rules", startsWith: O.bookingRules },
  // One row on both channels. Each channel has its own heading, and the owner's
  // reasons compose under either. The block is sent whether or not there are any,
  // so each note says why it is there.
  {
    row: "handoff",
    label: "Hand-off",
    startsWith: O.handoffChat,
    channel: "whatsapp",
    note: "Always sent, reasons or not: it's how anything it shouldn't decide reaches you."
  },
  {
    row: "handoff",
    label: "Hand-off",
    startsWith: O.handoffCall,
    channel: "voice",
    note: "Always sent, reasons or not: it's how a caller who needs a person reaches one, or leaves a message."
  },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.callTools, channel: "voice", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.callMedium, channel: "voice", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.chatMedium, channel: "whatsapp", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.openTimes, note: PLATFORM_NOTE },
  // The lines about offers and news are chat's alone (compose.ts rulesSection): a call has no message to find them in.
  {
    row: "guardrails",
    label: "Rules it always keeps",
    startsWith: O.rules,
    channel: "whatsapp",
    note: "Also here: Chanlytics' own lines about offers and news, and any rule from Autonomy."
  },
  {
    row: "guardrails",
    label: "Rules it always keeps",
    startsWith: O.rules,
    channel: "voice",
    note: "Also here: any rule from Autonomy."
  }
])();
const IDENTITY = { row: "identity", label: "Who you are", startsWith: "" };
const OWN_WORDS = { row: "extra_instructions", label: "In your own words", startsWith: "" };
const CARRIED = {
  row: "extra_instructions",
  label: "In your own words",
  startsWith: "",
  note: "Its earlier instructions, read until you write your own."
};
const PROMPT = {
  row: "extra_instructions",
  label: "In your own words",
  startsWith: "",
  // The second sentence is the rules fold's own, word for word (config.ts NO_FIELDS_COMPOSED_WORDS): the two notes
  // are on one page, and an owner who reads both should read the same thing twice, not two near-misses.
  //
  // Marked pure for the reason rule-strengths.ts gives beside STRENGTHS: a substitution makes this an expression
  // the bundler keeps at the top level, and the prompt view is drawn on one tab of the dashboard and nowhere else.
  note: /* @__PURE__ */ (() => `Its own instructions, as they stand. ${NO_FIELDS_COMPOSED_WORDS}`)()
};
const BASELINE = { row: "platform", label: PLATFORM_LABEL, startsWith: "", note: PLATFORM_NOTE };
const AUTONOMY = {
  row: "autonomy",
  label: "Autonomy's rules",
  startsWith: "",
  note: "Set on Autonomy"
};
const MARK_OF = {
  own: OWN_WORDS,
  carried: CARRIED,
  prompt: PROMPT,
  baseline: BASELINE
};
function ownWordsSpan(lines, ownWords) {
  const want = (ownWords ?? "").trim().split("\n");
  if (!want[0]) return null;
  for (let i = lines.length - want.length; i >= 0; i--) {
    if (!want.every((w, k) => lines[i + k] === w)) continue;
    const framed = i > 0 && [O.ownWordsUnderDetails, O.ownWordsOnACall].some((f) => lines[i - 1].startsWith(f));
    return { from: framed ? i - 1 : i, to: i + want.length };
  }
  return null;
}
export function promptBlocks(text, channel, from) {
  if (from === void 0 || typeof from !== "object") {
    throw new TypeError(
      "promptBlocks needs what the prompt was composed from: the stored brain, { profile } for a draft, or null."
    );
  }
  const lines = text.split("\n");
  const whose = whoseWords(from);
  const own = ownWordsSpan(lines, whose.text);
  const insideOwn = (n) => !!own && n >= own.from && n < own.to;
  const marks = BLOCK_MARKS.filter((m) => !m.channel || m.channel === channel);
  const found = [];
  let passed = -1;
  lines.forEach((line, n) => {
    if (insideOwn(n) || n === 0 || lines[n - 1].trim() !== "") return;
    const at = marks.findIndex((m) => line.trim().startsWith(m.startsWith));
    if (at <= passed) return;
    passed = at;
    found.push({ at: n, mark: marks[at] });
  });
  let starts;
  let head;
  if (found.some((s) => s.mark.row === "platform")) {
    starts = own && whose.kind !== "none" ? [...found, { at: own.from, mark: MARK_OF[whose.kind] }] : found;
    head = IDENTITY;
  } else {
    const rules = found.find((s) => s.mark.row === "guardrails");
    starts = rules ? [{ at: rules.at, mark: AUTONOMY }] : [];
    head = whose.kind === "none" ? PROMPT : MARK_OF[whose.kind];
  }
  starts.sort((a, b) => a.at - b.at);
  const segments = [];
  const first = starts[0]?.at ?? lines.length;
  if (first > 0) segments.push({ from: 0, to: first, mark: head });
  starts.forEach((s, n) => segments.push({ from: s.at, to: starts[n + 1]?.at ?? lines.length, mark: s.mark }));
  const ranges = segments.filter((s) => s.from < s.to);
  const out = [];
  let carry = 0;
  ranges.forEach((seg, n) => {
    const body = lines.slice(seg.from, seg.to).join("\n");
    const chars = body.length + (n < ranges.length - 1 ? 1 : 0);
    const prev = out[out.length - 1];
    if (!body.trim()) {
      if (prev) prev.chars += chars;
      else carry += chars;
      return;
    }
    if (prev && prev.row === seg.mark.row) {
      prev.to = seg.to;
      prev.chars += chars;
      return;
    }
    out.push({
      row: seg.mark.row,
      label: seg.mark.label,
      chars: chars + carry,
      ...seg.mark.note ? { note: seg.mark.note } : {},
      from: seg.from,
      to: seg.to
    });
    carry = 0;
  });
  const times = /* @__PURE__ */ new Map();
  return out.map(({ from: a, to: b, ...block }) => {
    const n = (times.get(block.row) ?? 0) + 1;
    times.set(block.row, n);
    return {
      id: n === 1 ? block.row : `${block.row}-${n}`,
      ...block,
      share: block.chars / text.length,
      text: lines.slice(a, b).join("\n").trim()
    };
  });
}
