/**
 * The Business tab's prompt view: the composed prompt, cut into the blocks that
 * wrote it.
 *
 * Apart from `business-tab.ts`, which holds the tab's sentence tables, because
 * this is a different kind of code: it reads what `config.ts` writes, and has to
 * keep reading it the way the composer writes it.
 */

import { NO_FIELDS_COMPOSED_WORDS, PROMPT_OPENINGS as O, whoseWords, type WhoseWords } from "./config";

/**
 * The composed prompt, cut into the blocks that wrote it.
 *
 * The preview was one 4,000-character <pre> behind a Show toggle. Every block
 * in it came from somewhere, and naming where turns a dump into a map back into
 * the page — which is also the only way an owner can see that services and
 * their own words are more than half of everything it reads.
 *
 * Four kinds of text, and each has to land in the right place:
 *
 *   - Text a row wrote, under a heading the composer emits: hours, services,
 *     the hand-off. Cut on those headings, read off `composeSystemPrompt`, so a
 *     heading it stops emitting simply stops appearing here.
 *   - The owner's own words, which have no reliable heading -- the composer
 *     frames them only when there is something above to disagree with. Found by
 *     their literal text instead, as `whoseWords` names them (the resolver's own
 *     rule, `ownWordsOf`, and whose they are), so a prompt the resolver carried
 *     in their place is found too. Fenced off FIRST: they are
 *     often a prompt written before the form existed, restating the hours and
 *     services under headings of their own, and a cut on headings would count
 *     that old prose as the Hours and Services rows.
 *   - Text Chanlytics writes for every workspace: the call's tool mechanics, the
 *     medium line, the open-times line, and the opening lines every new
 *     workspace is given as its prompt. Named as the platform's wherever it is a
 *     block of its own. Two kinds of platform line are not: the composer writes
 *     them under the rules heading, among the rules the owner switches -- the
 *     line for a customer who replies YES OFFERS, on every workspace, and under
 *     "ask" the Autonomy tab's rules. That block stays the rules row's, and its
 *     note says which of its lines are not the owner's.
 *   - The Autonomy tab's rules, where they are the only rules: a workspace with
 *     no fields is handed its own prompt back as it stands, and nothing is
 *     composed around it but those.
 */
export interface PromptBlockVM {
  /** This block among the others, unique in one cut, so it can key a list and name a test id. */
  id: string;
  /**
   * Who wrote it: a row on the page ("hours", "handoff", "extra_instructions" and
   * the rest), "platform" for what Chanlytics writes, or "autonomy" for the
   * Autonomy tab's rules. The platform speaks on both sides of the owner's words
   * on a call, so a row can recur; `id` tells the two apart.
   */
  row: string;
  label: string;
  /** For display: the block's text, trimmed. */
  text: string;
  /** Its exact share of the prompt, separators included, so the blocks sum to the whole. */
  chars: number;
  /**
   * The same share as a fraction of the prompt it was cut from (`chars` over the prompt's length), so the shares add up
   * to one. The prompt sheet draws a block's cost as this share and never as a count (the owner's rule, 22 Sep: a
   * character count is technical data), and divides nothing itself.
   */
  share: number;
  /** A caveat worth saying beside the block. */
  note?: string;
}

/**
 * What a prompt was composed from, which decides whose words are looked for in
 * it. The stored brain, for the prompt `resolveSystemPrompt` returned: a blank
 * box carries the old prompt in, and that IS what the receptionist reads.
 * `{ profile }`, for a draft run through `composeSystemPrompt`, which never
 * carries. Null when there is nothing to look for.
 */
export type PromptSource = {
  system_prompt?: string | null;
  profile?: { extra_instructions?: string | null } | null;
} | null;

type BlockMark = { row: string; label: string; startsWith: string; channel?: "whatsapp" | "voice"; note?: string };

// Plain literals, never a spread: a top-level spread is a side effect to the bundler,
// and every package that bundles contracts would then carry these tables unused.
const PLATFORM_LABEL = "Chanlytics' own instructions";
const PLATFORM_NOTE = "Written by Chanlytics for every workspace, not by you.";

/**
 * The openings `composeSystemPrompt` writes, from the one place it writes them
 * from (`PROMPT_OPENINGS`), never copied. A mark with a channel matches only on
 * that channel's prompt, so a coincidence on the other one cannot split a block.
 *
 * Built inside a call marked pure: each `startsWith` reads a property, which the
 * bundler counts as a side effect, and a bare literal would keep this table in
 * every package that bundles contracts.
 */
const BLOCK_MARKS: readonly BlockMark[] = /* @__PURE__ */ (() => [
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
    note: "Always sent, whether or not you give reasons — it is how anything it should not decide reaches you. On WhatsApp it hands you the thread.",
  },
  {
    row: "handoff",
    label: "Hand-off",
    startsWith: O.handoffCall,
    channel: "voice",
    note: "Always sent, whether or not you give reasons — it is how a caller who needs a person reaches one. On a call it transfers to your number in opening hours if you gave one, and takes a message otherwise.",
  },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.callTools, channel: "voice", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.callMedium, channel: "voice", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.chatMedium, channel: "whatsapp", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: O.openTimes, note: PLATFORM_NOTE },
  {
    row: "guardrails",
    label: "Rules it always keeps",
    startsWith: O.rules,
    note: "Beside the rules on this row: a line Chanlytics writes for every workspace, for a customer who replies YES OFFERS, and any rule your Autonomy tab adds.",
  },
])();

// Named by where a block sits, not by its heading: what comes before the first
// heading, the owner's words, and the rules after a prompt nothing composed.
const IDENTITY: BlockMark = { row: "identity", label: "Who you are", startsWith: "" };
const OWN_WORDS: BlockMark = { row: "extra_instructions", label: "In your own words", startsWith: "" };
const CARRIED: BlockMark = {
  row: "extra_instructions",
  label: "In your own words",
  startsWith: "",
  note: "The prompt this workspace had before it had fields. It is read until you write your own.",
};
// A workspace whose fields compose nothing: the resolver hands its prompt back as
// stored, and none of the page's details are in it. It never "had fields", so the
// carried note would not be true of it.
const PROMPT: BlockMark = {
  row: "extra_instructions",
  label: "In your own words",
  startsWith: "",
  // The second sentence is the rules fold's own, word for word (config.ts NO_FIELDS_COMPOSED_WORDS): the two notes
  // are on one page, and an owner who reads both should read the same thing twice, not two near-misses.
  //
  // Marked pure for the reason business-tab.ts gives beside GUARDRAIL_KEYS: a substitution makes this an expression
  // the bundler keeps at the top level, and the prompt view is drawn on one tab of the dashboard and nowhere else.
  note: /* @__PURE__ */ (() => `This workspace's own prompt, read as it stands. ${NO_FIELDS_COMPOSED_WORDS}`)(),
};
const BASELINE: BlockMark = { row: "platform", label: PLATFORM_LABEL, startsWith: "", note: PLATFORM_NOTE };
const AUTONOMY: BlockMark = {
  row: "autonomy",
  label: "Autonomy's rules",
  startsWith: "",
  note: "Set on the Autonomy tab, not on this page.",
};

/** Whose words these are, as whoseWords decides it for the form's box too, and the mark that says so. */
const MARK_OF: Record<Exclude<WhoseWords["kind"], "none">, BlockMark> = {
  own: OWN_WORDS,
  carried: CARRIED,
  prompt: PROMPT,
  baseline: BASELINE,
};

/**
 * Where the owner's own words sit, as a line range, or null.
 *
 * Found line-aligned: the composer pushes the trimmed text on lines of its own,
 * so a match must start and end on a line boundary. That is what stops a short
 * phrase matching inside a rule. Searched from the end, because the owner's
 * words follow every row's block and only the platform's fixed text and the
 * rules come after them.
 */
function ownWordsSpan(
  lines: readonly string[],
  ownWords: string | null | undefined,
): { from: number; to: number } | null {
  const want = (ownWords ?? "").trim().split("\n");
  if (!want[0]) return null;
  for (let i = lines.length - want.length; i >= 0; i--) {
    if (!want.every((w, k) => lines[i + k] === w)) continue;
    // The composer's framing line comes with them when it sits directly above: the
    // one under the details, or the call's, which follows it or stands alone.
    const framed = i > 0 && [O.ownWordsUnderDetails, O.ownWordsOnACall].some((f) => lines[i - 1].startsWith(f));
    return { from: framed ? i - 1 : i, to: i + want.length };
  }
  return null;
}

export function promptBlocks(text: string, channel: "whatsapp" | "voice", from: PromptSource): PromptBlockVM[] {
  // Required, and checked as it runs: the page that calls this is untyped JSX, and
  // a call that left it out got the owner's words folded into a neighbour, silently.
  // A bare string is the shape this replaced, and it cannot say whether the words
  // were carried.
  if (from === undefined || typeof from !== "object") {
    throw new TypeError(
      "promptBlocks needs what the prompt was composed from: the stored brain, { profile } for a draft, or null.",
    );
  }
  const lines = text.split("\n");
  const whose = whoseWords(from);
  const own = ownWordsSpan(lines, whose.text);
  const insideOwn = (n: number) => !!own && n >= own.from && n < own.to;
  const marks = BLOCK_MARKS.filter((m) => !m.channel || m.channel === channel);

  // Each opening the composer wrote, once each and never inside the owner's words. And only on a line after a blank
  // one, because the composer writes every opening as `\n${heading}` (and the resolver its rules after a blank line
  // too): a note's second line that reads "Services: ..." on a record with no services follows the note's first line,
  // and was cut into a Services block of its own, charged to a row the record does not fill (the plan's M-5).
  // And only in the composer's own order, which BLOCK_MARKS keeps: a note can hold a blank line of its own, and "Park
  // at the back.", a blank line, then "Services: ask us." passed the first rule; but it comes after the notes' opening,
  // and the composer writes Services before the notes, so an opening the cut has already gone past the place of cannot
  // be the composer's. Each is taken once, the first time it is met in order. What order cannot tell apart is a note's
  // line that reads like a LATER section the record does not have ("Booking rules:" after a blank line in a note, on a
  // record with none): nothing in the text says the composer did not write it.
  const found: { at: number; mark: BlockMark }[] = [];
  let passed = -1;
  lines.forEach((line, n) => {
    if (insideOwn(n) || n === 0 || lines[n - 1].trim() !== "") return;
    const at = marks.findIndex((m) => line.trim().startsWith(m.startsWith));
    if (at <= passed) return;
    passed = at;
    found.push({ at: n, mark: marks[at] });
  });

  // The composer always writes the platform's lines: the medium line and the
  // open-times line. A prompt without them is one the resolver handed back as it
  // stood, because the workspace has no fields -- the workspace's own prompt, then
  // only the Autonomy tab's rules. Its prose is one block, whatever headings it has.
  let starts: { at: number; mark: BlockMark }[];
  let head: BlockMark;
  if (found.some((s) => s.mark.row === "platform")) {
    // Found words are never "none": a span needs words to find.
    starts = own && whose.kind !== "none" ? [...found, { at: own.from, mark: MARK_OF[whose.kind] }] : found;
    // Everything before the first heading is who you are: the opening sentence,
    // the tone, the languages, the address, the phone and the link.
    head = IDENTITY;
  } else {
    const rules = found.find((s) => s.mark.row === "guardrails");
    starts = rules ? [{ at: rules.at, mark: AUTONOMY }] : [];
    // A caller that says there is nothing to look for still gets the one thing this
    // branch knows: whatever stands above the rules is a prompt handed back as stored.
    head = whose.kind === "none" ? PROMPT : MARK_OF[whose.kind];
  }
  starts.sort((a, b) => a.at - b.at);

  // Contiguous line ranges, in the order the receptionist reads them.
  const segments: { from: number; to: number; mark: BlockMark }[] = [];
  const first = starts[0]?.at ?? lines.length;
  if (first > 0) segments.push({ from: 0, to: first, mark: head });
  starts.forEach((s, n) => segments.push({ from: s.at, to: starts[n + 1]?.at ?? lines.length, mark: s.mark }));
  const ranges = segments.filter((s) => s.from < s.to);

  const out: (Omit<PromptBlockVM, "id" | "text" | "share"> & { from: number; to: number })[] = [];
  let carry = 0;
  ranges.forEach((seg, n) => {
    const body = lines.slice(seg.from, seg.to).join("\n");
    // The newline joining this range to the next is this range's, so the shares
    // sum to the prompt exactly and no bar quietly drops a character.
    const chars = body.length + (n < ranges.length - 1 ? 1 : 0);
    const prev = out[out.length - 1];
    if (!body.trim()) {
      // Blank lines give their characters to a neighbour rather than drawing an empty block.
      if (prev) prev.chars += chars;
      else carry += chars;
      return;
    }
    // A row that runs on across two ranges is one block: the platform's medium line
    // and its open-times line sit side by side.
    if (prev && prev.row === seg.mark.row) {
      prev.to = seg.to;
      prev.chars += chars;
      return;
    }
    out.push({
      row: seg.mark.row,
      label: seg.mark.label,
      chars: chars + carry,
      ...(seg.mark.note ? { note: seg.mark.note } : {}),
      from: seg.from,
      to: seg.to,
    });
    carry = 0;
  });

  const times = new Map<string, number>();
  return out.map(({ from: a, to: b, ...block }) => {
    const n = (times.get(block.row) ?? 0) + 1;
    times.set(block.row, n);
    return {
      id: n === 1 ? block.row : `${block.row}-${n}`,
      ...block,
      share: block.chars / text.length,
      text: lines.slice(a, b).join("\n").trim(),
    };
  });
}
