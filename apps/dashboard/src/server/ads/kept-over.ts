import "server-only";
import { keepAdDraft } from "@chanlytics/db/ads";
import { logAndGoOn } from "@chanlytics/log";
import { stableJson, type ReaderContext } from "../shared/reader";
import { adDraftAnswer, keptStateOf, sameDraft } from "./draft";
import { readKeptDraft, type AdDraftFacts } from "./draft-facts";
import type { AdDraftState, AdWordsAnswer } from "./draft-shape";

/**
 * What the ad writer made, kept into the draft as it now stands (the Ads plan's 4.6, 6.2 and G18; 00669). The words
 * route reads the kept draft, and the writer takes ten to twenty seconds: in them another device or another member may
 * keep a change of their own, and the owner may turn the draft on. So the writer's answer is kept naming the draft it
 * was made from (ad_draft_keep's p_read_at), and where another was kept since, what the writer made is put into that
 * one part by part: a part set there stands, and the words go in only where the draft is still the one they were
 * written for, its service and its picture. A draft gone since (turned on) is not brought back.
 */

/** How many times an answer is put into a draft kept meanwhile before it is left unkept: no one types three keeps into one answer's moment. */
const KEEP_TRIES = 3;

type Part = readonly (keyof AdDraftState)[];

/** What the words are written for, the words themselves, and the parts an owner sets one by one. */
const DRAFT_FOR: Part = ["service", "picture"];
const DRAFT_WORDS: Part = ["versions", "label"];
const DRAFT_AREA: Part = ["miles", "area"];
const DRAFT_AMOUNT: Part = ["total_minor"];
const DRAFT_END: Part = ["end_day"];
const DRAFT_ANSWERS: Part = ["answers"];

/** What a change of AI's changes, by its kind. */
const CHANGED_PARTS = {
  words: ["versions"],
  service: DRAFT_FOR,
  picture: DRAFT_FOR,
  area: DRAFT_AREA,
  amount: DRAFT_AMOUNT,
  end: DRAFT_END,
} as const;

/** Whether two drafts hold the same in these parts. */
const sameIn = (first: AdDraftState, second: AdDraftState, part: Part): boolean =>
  stableJson(part.map((key) => first[key] ?? null)) === stableJson(part.map((key) => second[key] ?? null));

/** Whose part a draft takes: the writer's (`ours`) where it changed it from the draft it read, and nothing kept since did. */
const partTakenFrom = (base: AdDraftState, ours: AdDraftState, theirs: AdDraftState, part: Part): AdDraftState =>
  !sameIn(ours, base, part) && sameIn(theirs, base, part) ? ours : theirs;

/**
 * What the writer made of the draft it read (`base`), put into the draft kept since (`theirs`). Each part takes the
 * writer's where the writer changed it and the draft kept since did not; else the part kept since stands. The words are
 * the writer's where the draft is now the one they were written for; a service of the writer's brings its own answers
 * to Meta's question (none yet), never the last service's.
 */
function keptOver(base: AdDraftState, ours: AdDraftState, theirs: AdDraftState): AdDraftState {
  const forFrom = partTakenFrom(base, ours, theirs, DRAFT_FOR);
  const wordsFrom =
    sameIn(forFrom, ours, DRAFT_FOR) && (forFrom === ours || !sameIn(ours, base, DRAFT_WORDS)) ? ours : theirs;
  const areaFrom = partTakenFrom(base, ours, theirs, DRAFT_AREA);
  const answersFrom =
    forFrom === ours && ours.service !== theirs.service ? ours : partTakenFrom(base, ours, theirs, DRAFT_ANSWERS);
  return {
    service: forFrom.service,
    picture: forFrom.picture,
    miles: areaFrom.miles,
    ...(areaFrom.area ? { area: areaFrom.area } : {}),
    total_minor: partTakenFrom(base, ours, theirs, DRAFT_AMOUNT).total_minor,
    end_day: partTakenFrom(base, ours, theirs, DRAFT_END).end_day,
    versions: wordsFrom.versions,
    answers: answersFrom.answers,
    ...(wordsFrom.label ? { label: wordsFrom.label } : {}),
  };
}

/**
 * The writer's draft (`ours`, written from `sent`) kept as the workspace's, naming the draft it read; where another was
 * kept since, that one with what the writer made put in, kept in its turn; in place of one kept for another account,
 * or no longer read as a draft, the writer's own, as before. The draft as it now stands; null where the draft is gone
 * since (turned on), which nothing brings back. A keep or a read that fails costs the answer nothing: it is drawn, and
 * the next change keeps it.
 */
async function keepWritten(
  rc: ReaderContext,
  facts: AdDraftFacts,
  sent: AdDraftState,
  ours: AdDraftState,
): Promise<AdDraftState | null> {
  if (facts.account === null) return ours;
  const base = facts.kept?.draft ?? sent;
  // The draft kept as it was last read, and its updated_at: none read where none was kept.
  let read: { draft: AdDraftState | null; at: string | null } = facts.kept ?? { draft: null, at: null };
  let draft = ours;
  for (let tried = 0; tried < KEEP_TRIES; tried += 1) {
    // An answer that changed nothing of the draft keeps nothing: it stays whoever's it was.
    if (read.draft !== null && sameDraft(draft, read.draft)) return draft;
    const kept = await keepAdDraft(rc.ctx.supabase, rc.tenantId, {
      accountId: facts.account.id,
      draft,
      readAt: read.at,
    }).catch(logAndGoOn("an ad's words kept", null));
    if (kept === null || !kept.newer) return draft;
    const now = await readKeptDraft(rc, facts.account.id).catch(logAndGoOn("an ad's draft read again", undefined));
    if (now === undefined) return draft;
    if (now === null) return null;
    read = now;
    draft = now.draft ? keptOver(base, ours, now.draft) : ours;
  }
  return draft;
}

/** What the writer came to, said of the draft as it now stands: words or a change that did not go in were not made. */
function cameTo(
  answer: AdWordsAnswer,
  ours: AdDraftState,
  kept: AdDraftState,
): Pick<AdWordsAnswer, "wrote" | "changed"> {
  if (answer.wrote)
    return { wrote: answer.wrote.ok && kept.versions.length === 0 ? { ok: false, why: "other" } : answer.wrote };
  const { changed } = answer;
  if (!changed) return {};
  if (changed.kind === "none") return { changed };
  return { changed: sameIn(kept, ours, CHANGED_PARTS[changed.kind]) ? changed : { kind: "none", fault: null } };
}

/**
 * POST ads/words' answer kept as the workspace's draft (the route's last step). Where nothing was kept while the writer
 * wrote, the answer as it came; else the draft as it now stands with what the writer made put in, judged, and what the
 * writer came to said of it.
 */
export async function keepWrittenAnswer(
  rc: ReaderContext,
  facts: AdDraftFacts,
  sent: AdDraftState,
  answer: AdWordsAnswer,
): Promise<AdWordsAnswer> {
  if (!answer.can) return answer;
  const ours = keptStateOf(answer);
  const kept = await keepWritten(rc, facts, sent, ours);
  if (kept === null || sameDraft(kept, ours)) return answer;
  return { ...adDraftAnswer(facts, kept), ...cameTo(answer, ours, kept) };
}
