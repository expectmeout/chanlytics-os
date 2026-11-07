/** Prompt: prompt. */

import "server-only";
import { createHash } from "node:crypto";
import {
  clockStamp,
  ASK_ANSWER_CAPS,
  answerFromV1,
  clip as answerClip,
  defang,
  describeNow,
  fencedInline,
  promptSafeName,
  isAskAdsView,
} from "@chanlytics/contracts";
import type { MembershipRole } from "@chanlytics/contracts";
import type { AskColumn, AskMessageVM, AskProposal, AskProposalOutcome, AskScope } from "@chanlytics/contracts";
import { oneLine } from "../context/rows";
import { AD_SCOPE_LINE, adsLine } from "../prompt-rules";
import { type WorkspaceFacts } from "./stable-system";

/**
 * The turn's system blocks: the rules and facts every turn in the workspace shares, and the workspace's shape, each ending
 * a cache breakpoint (the loop says why there are two).
 */
export function systemBlocks(
  rules: string,
  shape: string | null,
): Array<{ type: "text"; text: string; cache_control: { type: "ephemeral" } }> {
  const block = (text: string) => ({ type: "text" as const, text, cache_control: { type: "ephemeral" as const } });
  return [block(rules), ...(shape ? [block(shape)] : [])];
}

/** The first 16 hex of the sha256 of the system blocks: what a turn's answer was written from (AskTurnShape.prompt_hash). */
export function systemHash(blocks: Array<{ text: string }>): string {
  return createHash("sha256")
    .update(blocks.map((b) => b.text).join("\n"))
    .digest("hex")
    .slice(0, 16);
}

/** A card from earlier in the thread, and what the person did with it and when it was recorded (the Phase 5 plan, D8). */
export type CardOutcome = Pick<AskProposal, "id" | "title"> & Pick<AskProposalOutcome, "state" | "receipt" | "atMs">;

/** What a person's doing with a card is called, in the Line's words: a card done was approved. */
const DID: Record<AskProposalOutcome["state"], string> = {
  done: "was approved",
  dismissed: "was dismissed",
  failed: "failed",
  undone: "was undone",
};

export interface TurnFacts {
  role: MembershipRole;
  personLabel: string;
  scope: AskScope | null;
  surface: string | null;
  timezone: string;
  closures: WorkspaceFacts["closures"];
  now?: Date;
  /** The view the page says it is set to (PageContext.view): a word of the tab's, which picks a line and is believed for nothing else. */
  pageView?: string | null;
  /** The page's data rode in before these words (context.ts). */
  context?: boolean;
  /** Reads made for this question, of another page, rode in before these words (cross-page.ts). */
  crossPage?: boolean;
  /** The scope's row was read for this question and rode in before these words (cross-page.ts scopedRead). */
  scopeRead?: boolean;
  /**
   * The scope is the page they are on, at its address (a reach-out's drawer, contracts scopeFromRoute): no read names
   * it, and the page's data, where it rode in (`context`), holds its row.
   */
  scopeOnPage?: boolean;
  /**
   * On a live turn, what the person did with the chain's cards that no turn of it told yet (memory.ts, D8): said after
   * the clock, in this question's words, never by an edit of an earlier message.
   */
  since?: CardOutcome[];
  /**
   * On a live turn, when each earlier turn it replays was asked (memory.ts Chain.readAt): their reads are said as history,
   * with their times, so the model reads again what may have moved since (R13 X5-4).
   */
  replayedAt?: readonly number[];
  /**
   * The row their words point at, as the tab read them (PageContext.focus, the Phase 5 plan, D7): an earlier answer's
   * item by its place in an open thread, or the page's row by its place or its name; said when it is not the scope.
   */
  focus?: AskScope | null;
  /**
   * Whether this turn's read set holds the focus's row before the model is asked (loop.ts): only then may it be opened
   * or named without a read. A page's rows can be cut by its caps, or its build fail, and the words can point past them.
   */
  focusRead?: boolean;
  /**
   * The person is listening, not reading (the voice door, spec 2026-10-03 §3.4): SPOKEN_LINE is said last, after the
   * language, so the say is written for the ear and the figures still go to show.
   */
  spoken?: boolean;
  /** The column the Line draws the answer in (contracts AskColumn): columnLine, unless they are listening. */
  column?: AskColumn | null;
  /** What is above their role, so no tool of the turn's proposes it (tools/offer.ts aboveRoleWords); null for none. */
  above?: string | null;
  /** How they like answers, in their own note (Settings › Profile, contracts answerStyleOf); "" for none. */
  style?: string;
  /** What the mornings offered lately, a morning's alone (decision 0087, contracts latelySaid); "" for none. */
  lately?: string;
}

/**
 * The spoken register, one line in the turn's words (spec 2026-10-03 §3.4, verbatim, and a list's clause since the list
 * part): the agent starts speaking at
 * the first comma, so the opening clause is short and punctuated; the normaliser reads digits, so a time or a count
 * stays as the page shows it; an id, a route, a symbol or a tag would be read aloud as nonsense.
 */
const SPOKEN_LINE =
  "They are listening, not reading. Open with a short clause and a comma, then what matters first in one breath, in say.headline; say.detail may run to three short sentences when they asked for a summary, a reason or detail, and is empty otherwise. Say a name as a name and a time or a count as the page shows it; never an id, a route, a symbol, a bracketed tag or formatting: no headings, bold or tables, plain sentences only. Every figure and row goes in show, where the screen draws it; a list goes in show.list, whose entries are read after the say, one by one, so keep each short.";

/**
 * Where the answer is read (18 Oct 2026, after Anthropic's prompting guidance: say the surface and why it matters, and let
 * the model choose the shape): the column the Line draws it in, as the tab measured it, and about as many characters as
 * a line of the detail holds there (Mona Sans at the detail's 15px, about 7px a character; measured 18 Oct 2026). A table wider than the
 * column scrolls sideways, which a reader in a narrow panel or on a phone seldom does. Said in the turn's words, beside
 * the page; a spoken turn draws nothing, so it says none.
 */
const DETAIL_PX_PER_CHAR = 7;

function columnLine(c: AskColumn): string {
  const chars = Math.round(c.px / DETAIL_PX_PER_CHAR / 5) * 5;
  return `They read your answer in a column about ${c.px}px wide on ${c.phone ? "a phone" : "a desk"}, about ${chars} characters to a line. Lists and short paragraphs fit it well; a table wider than three short columns scrolls sideways there, so a wider comparison reads better as a list or a narrower table, unless they ask for a table.`;
}

/**
 * A row as the turn's words name it: by the label the page gave it, which is often someone else's (a customer's name,
 * a caller's, a lead's listing), set in a sentence the model is told. So it is a name as a prompt may show one and
 * fenced as a record's words (contracts ai/fence.ts); a label with nothing left names the row by its kind.
 */
function rowName(r: AskScope): string {
  const name = promptSafeName(r.label);
  return name ? fencedInline("record", name) : `this ${r.kind}`;
}

/**
 * The Campaigns line (the moment spec §4.9 A2), in the turn's words and never in system, so the cached rules stay the
 * same bytes on every page: what a sentence on Campaigns is. It names no tool (the answer canvas, A3): which tool and
 * action carry each change is the tools' own words, found by search with the page's tools first.
 */
const CAMPAIGNS_LINE =
  "They are on Campaigns, which lists what goes out on its own as a customer reaches each moment of their journey (campaigns that run by themselves) and what they send themselves. Words that describe an offer, a promotion, a setup, or a message at a moment or to a list are sequences to propose, as the rule \"Setting up sequences is a few cards\" says. Pausing, resuming, renaming, or a new hour, cap, gap or cadence, new words, a step, a last day or its mode (how its batches are decided) of one that exists is a change to that sequence, by the id the page's rows carry, and cold email to leads is a sequence too. A question about results is answered from the page's rows: a campaign's numbers are its last 30 days, and a one-off send's are that send's own, however long ago it went.";

/** Said once a card of the thread was approved since the last answer (A4): the shape is minutes old; campaigns are read. */
const AFTER_APPROVAL_LINE =
  "Cards were approved since the workspace's shape above was read: for what runs now, read the sequences again, never the shape.";

/**
 * This turn's words, in the user's message after the page's data and before
 * the question: the clock, on a live turn what happened since, who is asking,
 * where they are and the row their words point at, and that the data before
 * them needs no second read. The language is the model's to follow from the
 * person's words (the rules say so), never a guess said here. They sit after the page's breakpoint (bp3), so words that change every
 * turn never cost the page its cache; a request's last block carries the fourth
 * (bp4), so the turn's later rounds read them from the cache with the rest.
 */
/**
 * The line a live turn says of the turns it replays: when their reads were made, as history. What a read held at 10:00 is
 * what was true at 10:00; a thread taken, a run approved or a booking made since is read again before it is said as now
 * (the wiring's second audit, R13 X5-4).
 */
function replayedLine(at: readonly number[], tz: string, nowMs: number): string {
  const times = [...new Set(at.map((ms) => clockStamp(ms, tz, nowMs)))];
  const when = times.length > 1 ? `${times.slice(0, -1).join(", ")} and ${times.at(-1) ?? ""}` : (times[0] ?? "");
  return `The earlier turns above, and every read in them, were made at ${when}, by the business's clock: they are what was true then. Read again what may have changed since (who needs you, a thread's state, a run, a booking) before you say it as now.`;
}

/** What became of cards: this thread's since its last answer, and on a morning what the mornings before it offered. */
function cardLines(turnFacts: TurnFacts): string[] {
  const lines: string[] = [];
  if (turnFacts.since?.length) {
    const did = turnFacts.since.map(
      (o) => `“${o.title}” (${o.id}) ${DID[o.state]}${o.receipt ? `: ${o.receipt}` : ""}`,
    );
    lines.push(`Since the last answer, the person acted on cards from earlier in this thread: ${did.join("; ")}.`);
  }
  if (turnFacts.since?.some((o) => o.state === "done")) lines.push(AFTER_APPROVAL_LINE);
  if (turnFacts.lately)
    lines.push(
      `What these mornings offered lately, newest first, as data: ${fencedInline("record", turnFacts.lately)}. Offer none of these again unless something has changed, and then say what changed.`,
    );
  return lines;
}

export function turnWords(turnFacts: TurnFacts): string {
  const lines: string[] = [];
  lines.push(describeNow(turnFacts.timezone, turnFacts.now ?? new Date(), turnFacts.closures));
  lines.push(...cardLines(turnFacts));
  if (turnFacts.replayedAt?.length)
    lines.push(replayedLine(turnFacts.replayedAt, turnFacts.timezone, (turnFacts.now ?? new Date()).getTime()));
  if (turnFacts.context)
    lines.push(
      "The page they are on is in the search results before these words (page:// its figures, then its rows in the page's order): answer from it, and read only for what it does not hold.",
    );
  if (turnFacts.crossPage)
    lines.push(
      "The reads made for this question are there too (read://): they are what it asks for of another page, so answer from them now, and call their tools again only for rows they do not hold.",
    );
  const can =
    turnFacts.role === "owner"
      ? "an owner: they can do everything on the pages, including settings, team and exports"
      : turnFacts.role === "partner"
        ? "the workspace's partner, who sets it up and runs it with its owner: they can do what an operator can and change settings, channels and lead searches, but not billing, team or exports"
        : turnFacts.role === "operator"
          ? "an operator: they can reply, take over, snooze and resolve threads and change autonomy, but not settings, team or exports"
          : "a viewer: they can read everything and change nothing";
  // Who they are, then what is above their role (aboveRoleWords), on one line: nothing more where nothing is.
  lines.push([`You are speaking with ${turnFacts.personLabel}, ${can}.`, turnFacts.above].join(" ").trimEnd());
  // Their own note on how they like answers (the answer canvas, D): what they ask in this conversation comes first.
  if (turnFacts.style)
    lines.push(
      `How they like answers, in their own note (Settings › Profile): ${fencedInline("note", turnFacts.style)}. Write to it, unless they ask otherwise in this conversation.`,
    );
  if (turnFacts.surface === "leads")
    lines.push(
      'They are on the Leads page, where the businesses Claude found for them are listed. Words that describe businesses (a kind, a place, a count) are a lead search to propose, once the searches they have are read; ask only when the kind or the place is missing. If a search on this page is waiting for an answer, words that answer its question amend it, and "this search" is the one the scope names.',
    );
  else if (turnFacts.surface === "campaigns")
    lines.push(isAskAdsView(turnFacts.pageView) ? adsLine(turnFacts.pageView) : CAMPAIGNS_LINE);
  else if (turnFacts.surface) lines.push(`They are on the ${turnFacts.surface} page.`);
  // Every row a scope names is read by its id (cross-page.ts scopedRead) and rides in with the question; one whose read
  // failed, like a page, is read by the model. The page they are on, at its own address, rode in as the page.
  const read =
    turnFacts.scope?.kind === "ad"
      ? AD_SCOPE_LINE
      : turnFacts.scopeRead
        ? "It was read for this question and is in the search results before these words (read://): answer from it, and read again only for what it does not hold."
        : turnFacts.scopeOnPage && turnFacts.context
          ? "It is the page they are on, in the search results before these words (page://): answer from its rows, and read only for what they do not hold."
          : "Read it before answering about it.";
  if (turnFacts.scope)
    lines.push(
      `They are looking at ${rowName(turnFacts.scope)} (${turnFacts.scope.kind} ${turnFacts.scope.id}); "this", "them", "here" mean that unless they say otherwise. ${read}`,
    );
  // The row their words point at, when it is not the scope: an earlier answer's item (in the read set, D5) or the page's
  // -- opened or named without a read only when the read set holds it (focusRead), else read first.
  const focus = turnFacts.focus;
  const then = turnFacts.focusRead
    ? "open or name it without a read; read it for anything about it"
    : "read it first, to open or name it and for anything about it";
  if (focus && (focus.kind !== turnFacts.scope?.kind || focus.id !== turnFacts.scope?.id))
    lines.push(`Their words point at ${rowName(focus)} (${focus.kind} ${focus.id}): ${then}.`);
  if (turnFacts.spoken) lines.push(SPOKEN_LINE);
  else if (turnFacts.column) lines.push(columnLine(turnFacts.column));
  return lines.join("\n");
}

/**
 * A thread's title: its first question, in the person's words, never a summary and never renamed by what the answer
 * did (D9). Two threads that asked the same thing keep the same title; the rail shows when.
 */
export function titleFromQuestion(query: string): string {
  const s = query.replace(/\s+/g, " ").trim();
  return s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s;
}

/**
 * What an answer to a search's question is about: which search, what it asked, what the owner first asked for and
 * what it leaves out, read from the search when the answer was sent (the Leads answer row sends only the search's
 * id and the owner's words). It is stored beside the owner's words on their turn, never in them: the thread shows
 * what they said, and the model is told the rest on that turn and every later one (askTurnText).
 */
export interface SearchAnswering {
  search_id: string;
  name: string;
  question: string;
  asked: string;
  leaving_out: string[];
}

const clip = (s: unknown, n: number): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "";

/** The stored shape read back, or null for a turn that answered nothing. */
export function answeringOf(value: unknown): SearchAnswering | null {
  const searchAnswering = value as Partial<SearchAnswering> | null;
  if (
    !searchAnswering ||
    typeof searchAnswering !== "object" ||
    typeof searchAnswering.search_id !== "string" ||
    !searchAnswering.search_id
  )
    return null;
  return {
    search_id: searchAnswering.search_id,
    name: clip(searchAnswering.name, 80),
    question: clip(searchAnswering.question, 300),
    asked: clip(searchAnswering.asked, 200),
    leaving_out: (Array.isArray(searchAnswering.leaving_out) ? searchAnswering.leaving_out : [])
      .slice(0, 8)
      .map((x) => clip(x, 80))
      .filter(Boolean),
  };
}

/**
 * A person's turn as the model reads it: their words, or, for an answer to a search's question, their words inside
 * what they answer -- which search, by id so the model can name it in `amends`, what it asked, and what to propose.
 * The same text on the turn itself and when the turn is replayed later in the thread, so a later turn still knows
 * what that answer was about.
 */
export function askTurnText(words: string, answering: SearchAnswering | null): string {
  if (!answering) return words;
  const first = answering;
  const request = first.question ? `stopped to ask: “${first.question}”` : "stopped to ask a question";
  const leaving = first.leaving_out.length ? `, leaving out ${first.leaving_out.join(", ")}` : "";
  return (
    `On People › Leads, my search for ${first.name} (search id ${first.search_id}) ${request} ` +
    `I had asked for: “${first.asked}”${leaving}. My answer: ${words}. ` +
    "Propose the same search with my answer applied (propose_lead_search with action find and amends set to that id), and keep everything I did not change."
  );
}

/** The most a rebuilt line says of an answer (the Phase 5 plan, D4): its cards and rows past these are "and N more". */
const LINE_CAPS = {
  cards: 3,
  title: ASK_ANSWER_CAPS.title,
  receipt: 80,
  rows: ASK_ANSWER_CAPS.items,
  label: ASK_ANSWER_CAPS.label,
  entries: 3,
  entry: 60,
} as const;

/**
 * A part of a rebuilt line, cut as an answer's own parts are (contracts clip): one line of words, never a new line, at
 * most `n` characters, a longer one ending on a whole word with an ellipsis.
 */
const linePart = (s: string | null | undefined, n: number): string => answerClip(s, n);

/**
 * A card's title as history replays it. A title is the product's own words around a name someone else chose ("Reply
 * to Rosa"), so it keeps its length; only a title the fence would act on is made a safe name, as a row's label is.
 */
const historyName = (title: string): string | null => (defang(title) === title ? title : promptSafeName(title));

/** What the person did with a card, as a rebuilt line says it: theirs, and never "done". */
const DID_WORD: Record<AskProposalOutcome["state"], string> = {
  done: "approved",
  dismissed: "dismissed",
  failed: "failed",
  undone: "undone",
};

function outcomeWords(o: AskProposalOutcome | null | undefined): string {
  if (!o) return "not pressed yet";
  const receipt = o.state === "done" || o.state === "failed" ? linePart(o.receipt, LINE_CAPS.receipt) : "";
  return receipt ? `${DID_WORD[o.state]}: ${receipt}` : DID_WORD[o.state];
}

/** A list in a rebuilt line: `<name>: a; b; and N more.`, or nothing for none. */
const listed = (name: string, parts: string[], more: number): string =>
  parts.length || more > 0 ? `${name}: ${[...parts, ...(more > 0 ? [`and ${more} more`] : [])].join("; ")}.` : "";

/**
 * An earlier answer as a cold turn's history says it (the Phase 5 plan, D4): one line, never a new line -- its headline
 * (a prose answer's first words), then its list's first entries as `List (<style>): a; b; and N more.`, so "the second
 * one" is answerable, then each card it made as `<id> · <kind> · <title> · <what the person did>`, then the
 * rows it named in the answer's order as `<n>. <kind> <id> <label>`, each part only when there is one; a turn that
 * failed says so first, and keeps its cards. At most `max` characters, the history's cut for a turn: a row the line has
 * no room for goes whole into "and N more", so an id is never cut. An answer of words alone, one line of 160 characters
 * at most, is the words as they were.
 */
export function answerLine(askMessage: AskMessageVM, max: number): string {
  const answer = askMessage.answer ?? answerFromV1(askMessage);
  const cards = askMessage.proposals
    .slice(0, LINE_CAPS.cards)
    .map((p) =>
      [oneLine(p.id), p.kind, linePart(historyName(p.title), LINE_CAPS.title), outcomeWords(p.outcome)].join(" · "),
    );
  const entries = answer.show.list.entries;
  const head = [
    askMessage.failed ? "(This turn failed.)" : "",
    linePart(answer.say.headline || answer.say.detail, ASK_ANSWER_CAPS.headline),
    listed(
      `List (${answer.show.list.style})`,
      entries.slice(0, LINE_CAPS.entries).map((e) => linePart(e, LINE_CAPS.entry)),
      entries.length - LINE_CAPS.entries,
    ),
    listed("Cards", cards, askMessage.proposals.length - cards.length),
  ];
  const rows = answer.show.items
    .slice(0, LINE_CAPS.rows)
    .map((it, i) =>
      [`${i + 1}.`, it.source.kind, oneLine(it.source.id), linePart(promptSafeName(it.source.label), LINE_CAPS.label)]
        .filter(Boolean)
        .join(" "),
    );
  const lineWith = (n: number) =>
    [...head, listed("Rows, in order", rows.slice(0, n), rows.length - n)].filter(Boolean).join(" ");
  let length = rows.length;
  while (length > 0 && lineWith(length).length > max) length--;
  return lineWith(length);
}

/**
 * The title of a thread an answer starts, when the search keeps no thread of the asker's: the search's name, as the
 * Leads rail names it. An answer's words ("Yes, include them") say nothing on their own in Ask's list; the search's
 * name is what the owner will look for there, and it is theirs, never the machine's sentence.
 */
export function titleFromSearch(name: string): string {
  return titleFromQuestion(name) || "A search's question";
}
