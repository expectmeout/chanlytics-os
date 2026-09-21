/**
 * What the Business tab says, as view models.
 *
 * Named apart from `business-page.ts` (the public /b/<slug> page) and
 * `business-record.ts` (the carrier record). This one is the operator's own tab.
 *
 * Every sentence with a number or a judgement in it is composed here rather
 * than in the page, for the reason Today and Reports already hold to: a
 * sentence written in JSX cannot be tested, and the same sentence written
 * twice is one that will be edited once.
 */

import { isBaselinePrompt, ownWordsOf } from "./config";

/** The guardrail keys the profile stores. The editor writes exactly these. */
export const GUARDRAIL_KEYS = ["never_quote_prices", "never_confirm_booking", "disclose_ai", "no_health_advice"] as const;
export type GuardrailKey = (typeof GUARDRAIL_KEYS)[number];

/**
 * How far a rule actually goes.
 *
 * The page drew four identical switches over three different guarantees, which
 * is the quietest dishonesty it had. One of these the product cannot break at
 * all; one has a detector on both channels; two are lines in a prompt, and
 * `policy.ts` says in its own header that an instruction is not an enforcement.
 */
export type RuleStrength = "structural" | "checked" | "instructed";

export interface RuleStrengthVM {
  strength: RuleStrength;
  /** The chip beside the rule's name. */
  chip: string;
  /** What actually happens, in the owner's words. */
  sentence: string;
  /** For a checked rule, what happens per channel. Null otherwise. */
  checkedOn: { channel: "whatsapp" | "voice"; words: string }[] | null;
}

const STRENGTHS: Record<GuardrailKey, RuleStrengthVM> = {
  never_confirm_booking: {
    strength: "structural",
    chip: "It cannot anyway",
    sentence:
      "There is no appointments table in this product; nothing in it can create, move or cancel one. Switching this off would not let it book — it would only stop it being told not to claim it had.",
    checkedOn: null,
  },
  never_quote_prices: {
    strength: "checked",
    chip: "Checked, not just told",
    // The sentence says the rule. `checkedOn` says how it lands per channel, and the
    // page draws both -- so the sentence must not say the channels too, or an owner
    // reads the same fact twice, once in prose and once in the two boxes under it.
    sentence: "A detector reads every reply for a currency figure. It offers a consult or the booking link instead.",
    checkedOn: [
      { channel: "whatsapp", words: "The words are swapped before the customer sees them. A draft sits in between." },
      { channel: "voice", words: "It has already been heard. A correction goes into the live call, and you are told while it is still up." },
    ],
  },
  disclose_ai: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence:
      "A line in what it reads, and it follows it reliably — but nothing checks the answer afterwards. There is no clean signal to check against: the phrase that would catch a denial also catches the correct disclosure.",
    checkedOn: null,
  },
  no_health_advice: {
    strength: "instructed",
    chip: "Told, and trusted",
    sentence: "Skin reactions, allergies, pregnancy, medication — a professional advises at the appointment.",
    checkedOn: null,
  },
};

export function ruleStrength(key: GuardrailKey): RuleStrengthVM {
  return STRENGTHS[key];
}

/** The subset of the brain the standing line reads. */
export interface StandingInputs {
  business_name?: string | null;
  booking_link?: string | null;
  profile?: {
    address?: string | null;
    tone?: string | null;
    hours?: Record<string, unknown> | null;
    services?: unknown[] | null;
    guardrails?: Partial<Record<GuardrailKey, boolean>> | null;
  } | null;
}

export interface StandingVM {
  /** What it can answer, in one clause. */
  can: string;
  /** What it deliberately will not do, by a rule the owner set. Null when there is none. */
  wont: string | null;
  /** The single most useful gap, and the row that fixes it. Null when there is none. */
  missing: { sentence: string; row: string } | null;
}

const has = (v: unknown): boolean =>
  typeof v === "string" ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : !!v && Object.keys(v as object).length > 0;

/**
 * Three clauses, worst last.
 *
 * The gaps are ordered by what a customer notices: a receptionist with no name
 * cannot introduce itself, one with no hours cannot answer the commonest
 * question, and one with no voice answers correctly in nobody's words. Only
 * the first gap is named — a list of six is a list nobody starts.
 */
export function standingLine(i: StandingInputs): StandingVM {
  const p = i.profile ?? {};
  const gaps: { sentence: string; row: string }[] = [];
  if (!has(i.business_name)) gaps.push({ sentence: "It has no name to introduce itself with.", row: "name" });
  if (!has(i.booking_link)) gaps.push({ sentence: "It has no booking link to send anyone.", row: "booking_link" });
  if (!has(p.hours)) gaps.push({ sentence: "It cannot say when you are open.", row: "hours" });
  if (!has(p.services)) gaps.push({ sentence: "It cannot say what you offer.", row: "services" });
  if (!has(p.address)) gaps.push({ sentence: "It cannot say where you are.", row: "address" });
  if (!has(p.tone)) gaps.push({ sentence: "It has no voice of its own yet — it answers correctly, in nobody in particular's words.", row: "tone" });

  const answers: string[] = [];
  if (has(p.address)) answers.push("where you are");
  if (has(p.hours)) answers.push("when you're open");
  if (has(p.services)) answers.push("what you offer");
  if (has(i.booking_link)) answers.push("how to book");

  const can = answers.length
    ? `It can say ${answers.length === 1 ? answers[0] : `${answers.slice(0, -1).join(", ")} and ${answers.at(-1)}`}.`
    : "It cannot answer anyone yet.";

  const quiet = p.guardrails?.never_quote_prices !== false && has(p.services);
  const wont = quiet ? "It offers a consult instead of a price, by your rule." : null;

  return { can, wont, missing: gaps[0] ?? null };
}

/**
 * What the receptionist can do, and what it cannot.
 *
 * The tab sets the inputs to three of the phone agent's four tools
 * (`check_availability`, `send_booking_link`, `transfer_to_staff`) and has
 * never said a tool exists. An owner could not know their phone agent texts
 * the booking link to the number a caller rang from.
 *
 * Computed from what the records show, never typed: an ability is ready only
 * when its channel is live and its input is filled.
 */
export interface AbilityInputs {
  voiceLive: boolean;
  whatsappLive: boolean;
  hasCalendarFeed: boolean;
  hasBookingLink: boolean;
  hasHandoffNumber: boolean;
  hasEscalateWhen: boolean;
  visionOn: boolean;
}

export interface AbilityRowVM {
  id: "answer" | "open_times" | "booking_link" | "transfer" | "handoff" | "vision";
  title: string;
  detail: string;
  channels: { voice: boolean; whatsapp: boolean };
  /** The row on this page that supplies it. Null when nothing does. */
  runsOn: { label: string; row: string } | null;
  ready: boolean;
  /** Only the opt-in ability carries this. */
  on?: boolean;
}

export function abilityRows(i: AbilityInputs): AbilityRowVM[] {
  const both = { voice: i.voiceLive, whatsapp: i.whatsappLive };
  // Nothing is ready on a channel that is not answering. An input filled against a
  // dead line is a setting, not an ability, and drawing it ready would tell an owner
  // the booking link goes out when there is nothing to send it.
  const answering = i.voiceLive || i.whatsappLive;
  return [
    {
      id: "answer",
      title: "Answer from your facts",
      detail: "Hours, address, services, your notes — and it records which facts it leaned on.",
      channels: both,
      runsOn: { label: "Name and hours", row: "name" },
      ready: i.voiceLive || i.whatsappLive,
    },
    {
      id: "open_times",
      title: "Say which times are open",
      detail: i.hasCalendarFeed
        ? "On a call it asks the calendar at that moment. In chat it is handed the day's openings with each message. Up to three that fit, then the link."
        : "No calendar to read, so it does not guess at open times — it sends the link instead.",
      channels: both,
      runsOn: { label: "The calendar it reads", row: "calendar" },
      ready: answering && i.hasCalendarFeed,
    },
    {
      id: "booking_link",
      title: "Send the booking link",
      detail: "On a call it texts it to the number they rang from and says so. In chat it sends it in the thread.",
      channels: both,
      runsOn: { label: "The booking link", row: "booking_link" },
      ready: answering && i.hasBookingLink,
    },
    {
      id: "transfer",
      title: "Put a caller through",
      detail: i.hasHandoffNumber
        ? "Dials the number you gave and steps out."
        : "No number yet, so it takes a message instead — which is better than a number nobody picks up.",
      channels: { voice: i.voiceLive, whatsapp: false },
      runsOn: { label: "The transfer number", row: "handoff_number" },
      ready: i.voiceLive && i.hasHandoffNumber,
    },
    {
      id: "handoff",
      title: "Hand the thread to you",
      detail:
        "It stops answering, the thread turns Needs you in the Inbox, and your staff are emailed. It will not pick the thread back up on its own.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Your reasons", row: "escalate_when" },
      ready: i.whatsappLive && i.hasEscalateWhen,
    },
    {
      id: "vision",
      title: "Look at a photo",
      detail: i.visionOn
        ? "It says what it sees and suggests the next step, under the rules above."
        : "Off. A photo is acknowledged and passed to a person.",
      channels: { voice: false, whatsapp: i.whatsappLive },
      runsOn: { label: "Turn it on", row: "vision" },
      ready: i.whatsappLive && i.visionOn,
      on: i.visionOn,
    },
  ];
}

export interface CannotRowVM {
  id: "book" | "outbound_call" | "sms";
  title: string;
  detail: string;
  /** True when it is a thing the product intends to sell later. */
  soon?: boolean;
}

/**
 * Said here so nobody has to find out from a customer.
 *
 * None of these is a setting that could be switched on, and saying so on the
 * page that holds the switches is the difference between a limit and a bug.
 */
export const CANNOT_ROWS: readonly CannotRowVM[] = [
  {
    id: "book",
    title: "Book, move or cancel an appointment",
    detail:
      "Not a setting you could switch on. There is no appointments table in this product — nothing in it can create, move or cancel one. Your booking link does that, whichever tool is behind it.",
  },
  {
    id: "outbound_call",
    title: "Ring a customer",
    detail:
      "It answers your line; it never dials out. A call back is a person's, and the receptionist tells you when one is wanted.",
  },
  {
    id: "sms",
    title: "Send a text message",
    detail:
      "Not part of what is sold yet. It arrives with a line the carriers have approved, and Connections will say when. The booking link a caller receives goes to their WhatsApp.",
    soon: true,
  },
];

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
 *     their literal text instead, as `ownWordsOf` names them, so a prompt the
 *     resolver carried in their place is found too. Fenced off FIRST: they are
 *     often a prompt written before the form existed, restating the hours and
 *     services under headings of their own, and a cut on headings would count
 *     that old prose as the Hours and Services rows.
 *   - Text Chanlytics writes for every workspace: the call's tool mechanics, the
 *     medium line, the open-times line, and the opening lines every new
 *     workspace is given as its prompt. Named as the platform's, so none of it is
 *     charged to a row the owner can edit.
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
 * Read off `composeSystemPrompt`, not guessed. Each `startsWith` is the exact
 * opening that function writes; a mark with a channel matches only on that
 * channel's prompt, so a coincidence on the other one cannot split a block.
 */
const BLOCK_MARKS: readonly BlockMark[] = [
  { row: "hours", label: "When you're open", startsWith: "Opening hours" },
  { row: "closures", label: "Days you're closed", startsWith: "Closed on these dates" },
  { row: "services", label: "Services", startsWith: "Services:" },
  { row: "notes", label: "Things it should know", startsWith: "Other things to know:" },
  { row: "booking_rules", label: "Booking rules", startsWith: "Booking rules:" },
  // One row on both channels. Each channel has its own heading, and the owner's
  // reasons compose under either. The block is sent whether or not there are any,
  // so each note says why it is there.
  {
    row: "handoff",
    label: "Hand-off",
    startsWith: "Handing the conversation to a person:",
    channel: "whatsapp",
    note: "Always sent, whether or not you give reasons — it is how anything it should not decide reaches you. On WhatsApp it hands you the thread.",
  },
  {
    row: "handoff",
    label: "Hand-off",
    startsWith: "Handing the caller to a person:",
    channel: "voice",
    note: "Always sent, whether or not you give reasons — it is how a caller who needs a person reaches one. On a call it transfers to your number in opening hours if you gave one, and takes a message otherwise.",
  },
  { row: "platform", label: PLATFORM_LABEL, startsWith: "Open times: use check_availability", channel: "voice", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: "You are speaking aloud.", channel: "voice", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: "Keep replies short enough to read on a phone.", channel: "whatsapp", note: PLATFORM_NOTE },
  { row: "platform", label: PLATFORM_LABEL, startsWith: "If open times are listed after these instructions", note: PLATFORM_NOTE },
  { row: "guardrails", label: "Rules it always keeps", startsWith: "Rules you must follow:" },
];

/** The line the composer puts above the owner's words, when it writes one. */
const OWN_WORDS_FRAMES = ["Further instructions from the business.", "Some of it was written for text conversations"];

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
const BASELINE: BlockMark = { row: "platform", label: PLATFORM_LABEL, startsWith: "", note: PLATFORM_NOTE };
const AUTONOMY: BlockMark = { row: "autonomy", label: "Autonomy's rules", startsWith: "", note: "Set on the Autonomy tab, not on this page." };

/**
 * Where the owner's own words sit, as a line range, or null.
 *
 * Found line-aligned: the composer pushes the trimmed text on lines of its own,
 * so a match must start and end on a line boundary. That is what stops a short
 * phrase matching inside a rule. Searched from the end, because the owner's
 * words follow every row's block and only the platform's fixed text and the
 * rules come after them.
 */
function ownWordsSpan(lines: readonly string[], ownWords: string | null | undefined): { from: number; to: number } | null {
  const want = (ownWords ?? "").trim().split("\n");
  if (!want[0]) return null;
  for (let i = lines.length - want.length; i >= 0; i--) {
    if (!want.every((w, k) => lines[i + k] === w)) continue;
    // The composer's framing line comes with them when it sits directly above.
    const framed = i > 0 && OWN_WORDS_FRAMES.some((f) => lines[i - 1].startsWith(f));
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
    throw new TypeError("promptBlocks needs what the prompt was composed from: the stored brain, { profile } for a draft, or null.");
  }
  const lines = text.split("\n");
  const words = ownWordsOf(from);
  const own = ownWordsSpan(lines, words);
  const insideOwn = (n: number) => !!own && n >= own.from && n < own.to;
  const marks = BLOCK_MARKS.filter((m) => !m.channel || m.channel === channel);

  // Each opening the composer wrote, once each and never inside the owner's words.
  const found: { at: number; mark: BlockMark }[] = [];
  const seen = new Set<string>();
  lines.forEach((line, n) => {
    if (insideOwn(n)) return;
    const mark = marks.find((m) => line.trim().startsWith(m.startsWith));
    if (!mark || seen.has(mark.startsWith)) return;
    seen.add(mark.startsWith);
    found.push({ at: n, mark });
  });

  // Whose words these are. A blank box means the resolver carried the stored prompt
  // in, and the block says so; the product's own opening lines are nobody's here.
  const carried = !from?.profile?.extra_instructions?.trim() && !!from?.system_prompt?.trim();
  const theirs = (body: string): BlockMark => (isBaselinePrompt(body.trim()) ? BASELINE : carried ? CARRIED : OWN_WORDS);

  // The composer always writes the platform's lines: the medium line and the
  // open-times line. A prompt without them is one the resolver handed back as it
  // stood, because the workspace has no fields -- the workspace's own prompt, then
  // only the Autonomy tab's rules. Its prose is one block, whatever headings it has.
  let starts: { at: number; mark: BlockMark }[];
  let head: BlockMark;
  if (found.some((s) => s.mark.row === "platform")) {
    starts = own ? [...found, { at: own.from, mark: theirs(words ?? "") }] : found;
    // Everything before the first heading is who you are: the opening sentence,
    // the tone, the languages, the address, the phone and the link.
    head = IDENTITY;
  } else {
    const rules = found.find((s) => s.mark.row === "guardrails");
    starts = rules ? [{ at: rules.at, mark: AUTONOMY }] : [];
    head = theirs(lines.slice(0, rules?.at ?? lines.length).join("\n"));
  }
  starts.sort((a, b) => a.at - b.at);

  // Contiguous line ranges, in the order the receptionist reads them.
  const segments: { from: number; to: number; mark: BlockMark }[] = [];
  const first = starts[0]?.at ?? lines.length;
  if (first > 0) segments.push({ from: 0, to: first, mark: head });
  starts.forEach((s, n) => segments.push({ from: s.at, to: starts[n + 1]?.at ?? lines.length, mark: s.mark }));
  const ranges = segments.filter((s) => s.from < s.to);

  const out: (Omit<PromptBlockVM, "id" | "text"> & { from: number; to: number })[] = [];
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
    return { id: n === 1 ? block.row : `${block.row}-${n}`, ...block, text: lines.slice(a, b).join("\n").trim() };
  });
}
