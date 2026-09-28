/**
 * The peek beside the Pipeline's rows (0008): what it says of a row before the person is read (pipelinePeekOf),
 * and how to reach them and their deals' last moves once they are (pipelinePeekDetail). Every word is the person
 * page's or pipeline-words.ts's.
 */
import { dealIsOpen } from "../deal-vm";
import { repliesWords } from "../../people/people";
import type { PersonVM } from "../../people/person-profile";
import type { PipelineGroupKey, PipelineRowVM } from "./pipeline-vm";
import { GROUP_WORDS, PIPELINE_WORDS } from "./pipeline-words";

/** One quiet fact under the peek's deal: when they were last heard, their words, or what is coming up. */
export interface PipelinePeekFact {
  id: "heard" | "quote" | "next" | "step";
  words: string;
}

/** The peek beside the rows: who, where they stand, and the facts People already says of them. */
export interface PipelinePeekVM {
  id: string;
  name: string;
  initials: string;
  /** Whether the name is a number or an address, drawn in figures. */
  numeric: boolean;
  /** The group and the deal's service: "Proposal out · Bridal package", "Consultations". */
  sub: string;
  facts: PipelinePeekFact[];
  /** Their thread's id ("th-…"), for the door to it; null for someone with no conversation. */
  thread: string | null;
}

/**
 * What the peek says of a row before the person is read: the head from the row alone, and the facts People's row
 * already carries, so the peek stands the moment it opens and the deal card fills in as the person lands. `deals`
 * are the person's own once they are read, which say which step a deal card of theirs carries.
 */
export function pipelinePeekOf(
  row: PipelineRowVM,
  group: PipelineGroupKey,
  deals: readonly { id: string; stage: string }[] | null = null,
): PipelinePeekVM {
  const p = row.person;
  const facts: PipelinePeekFact[] = [];
  if (p.lastContact.label) facts.push({ id: "heard", words: p.lastContact.label });
  if (p.quote) facts.push({ id: "quote", words: `“${p.quote}”` });
  if (p.nextVisit) facts.push({ id: "next", words: `Coming up · ${p.nextVisit}` });
  // Their next step, said once. One that names an open deal of theirs is that deal's card's: the peek draws a card
  // for each open deal (dealCardsOf), which says its earliest open step (dealStepOf), and this is theirs. A step
  // about the person, or about a deal that has closed, has no card to say it, so it is said here. Until the person
  // is read, the row's own deal is the one known.
  const n = row.next;
  const known = deals ?? (p.deal ? [p.deal] : []);
  const onCard = !!n?.dealId && known.some((d) => d.id === n.dealId && dealIsOpen(d));
  if (n && !onCard) facts.push({ id: "step", words: `${PIPELINE_WORDS.columns.next} · ${n.words} · ${n.when}` });
  return {
    id: row.id,
    name: row.name,
    initials: p.initials,
    numeric: /^[+\d(]/.test(row.name) || row.name.includes("@"),
    sub: row.service ? `${GROUP_WORDS[group]} · ${row.service}` : GROUP_WORDS[group],
    facts,
    thread: p.threadId,
  };
}

/** One way to reach them in the peek: what it is, the thing itself, and what can be done with it. */
export interface PipelinePeekReachVM {
  id: "phone" | "email" | "replies";
  label: string;
  words: string;
  /** A call's address (tel:), for the number only. */
  call: string | null;
  /** What a copy puts on the clipboard; null where there is nothing to copy. */
  copy: string | null;
}

export interface PipelinePeekDetailVM {
  reach: PipelinePeekReachVM[];
  /** Their deals' moves, newest first, three at most, in the person page's own words: "Proposal out · SEO · $800". */
  history: { id: string; words: string; when: string }[];
}

/**
 * What the peek says once the person is read (0008, "the row carries the deal"): how to reach them -- the number, the
 * address, and what a reply may be now (repliesWords, the person page's own sentence) -- and the last moves of their
 * deals from their timeline. Nothing here is the peek's own: each word is the person page's.
 */
export function pipelinePeekDetail(p: PersonVM): PipelinePeekDetailVM {
  const W = PIPELINE_WORDS.peek.reach;
  const reach: PipelinePeekReachVM[] = [];
  // Not for someone on do-not-contact: the person page's own menu offers neither the call nor the copy (personActs).
  if (p.phone && !(p.consent && p.consent.dnc)) {
    const dial = p.phone.replace(/[^\d+]/g, "");
    reach.push({ id: "phone", label: W.phone, words: p.phone, call: dial ? `tel:${dial}` : null, copy: p.phone });
  }
  if (p.email) reach.push({ id: "email", label: W.email, words: p.email, call: null, copy: p.email });
  const replies = p.hasChat ? repliesWords(p.replyVia, p.replyWindow) : null;
  if (replies) reach.push({ id: "replies", label: W.replies, words: replies, call: null, copy: null });
  const history = p.timeline
    .filter((t) => t.kind === "deal" && !t.ahead)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 3)
    .map((t) => ({ id: t.id, words: t.text, when: t.day }));
  return { reach, history };
}
