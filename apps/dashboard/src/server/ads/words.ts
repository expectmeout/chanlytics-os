import "server-only";
import { SECOND_MS, adChangeOf, minorPerUnit, type AdChange, type AdCraftAnswer } from "@chanlytics/contracts";
import { adWordIssues } from "../ask/skills/ad/brief";
import type { AdIssue, AdIssueCode } from "../ask/skills/ad/checks";
import type { CraftKept } from "../ask/skills/craft";
import { writeAd } from "../ask/skills/ad/write";
import { stableJson, type ReaderContext } from "../shared/reader";
import { adDraftAnswer, adDraftBrief, nextAdPicture, requireAdsOffered } from "./draft";
import { findAdPlace } from "./area";
import { readAdDraftFacts, type AdDraftFacts } from "./draft-facts";
import type { AdDraftState, AdNoWords, AdWordsAnswer, AdWordsFault } from "./draft-shape";
import { keepWrittenAnswer } from "./kept-over";
import { adWordsFor, holdAdWriter, letGoAdWriter, newAdWriting, waitForAdWriter } from "./writer";

/**
 * The ad writer, asked from New ad (POST ads/words; the Ads plan's 6.3 and 6.7): the words of a draft, three versions
 * of them, and "Tell AI what to change", which answers with one change from the plan's closed list (G8) and never
 * with free text. The one route of Ads that spends Chanlytics' own money, counted against the workspace's daily AI
 * limit. Every answer is the whole draft as it now stands, judged again, so a change of AI's meets the same checks as
 * one of the owner's, and kept as the workspace's draft with its words, so the writer is not asked for them again on
 * another device. Asked for words another ask is already out for (a reload, a second device), it waits for that one's
 * (writer.ts); kept after another device or member changed the draft meanwhile, what the writer made is put into the
 * draft as it now stands (kept-over.ts). Nothing here calls Meta, and AI turns nothing on.
 */

/** How long one request gives the writer: inside the route's own minute, with room left to answer. */
const WORDS_WAIT_MS = 50 * SECOND_MS;

/** Why there are no words, as the screen says it. */
const noWordsOf = (kept: CraftKept): AdNoWords =>
  kept === "budget" ? "limit" : kept === "paused" ? "paused" : kept === "checks" ? "checks" : "other";

/** The fault a line names for words that failed a check: Meta's rule by name where it is one, else the writer's own. */
const FAULT_OF: Partial<Record<AdIssueCode, AdWordsFault>> = {
  about_reader: "about_reader",
  feel_bad: "feel_bad",
  sure_result: "sure_result",
  before_after: "before_after",
  pressure: "pressure",
};
const faultOf = (issues: readonly AdIssue[]): AdWordsFault | null => {
  const [first] = issues;
  return first ? (FAULT_OF[first.code] ?? "other") : null;
};

/** Who is asking the writer: the member, in their workspace. */
interface AdWordsCaller {
  rc: ReaderContext;
  userId: string;
}

/** The member's ask, and when its answer must be in: one moment for the whole request, a wait for a writer included. */
interface AdWordsAsking extends AdWordsCaller {
  deadline: number;
}

const writerOf = (caller: AdWordsAsking) => ({
  tenantId: caller.rc.tenantId,
  userId: caller.userId,
  deadline: caller.deadline,
});

/** The most a service's name as the writer says it may run: a few words, never the whole of a long name again. */
const LABEL_MAX = 40;

/**
 * The service as the writer named it in a few words (the plan's 4.6): what New ad's title and sentence say, where a
 * service's own name, free text in Services, can run to a sentence. None where it named nothing shorter.
 */
function labelOf(answer: AdCraftAnswer, service: string): string | undefined {
  const label = answer.label.replace(/\s+/g, " ").trim();
  return label && label.length <= LABEL_MAX && label.length < service.trim().length ? label : undefined;
}

/** A draft with another service: no words, no answers, no name of the last one's. */
const withService = (draft: AdDraftState, service: string): AdDraftState => {
  const { label: _gone, ...rest } = draft;
  return { ...rest, service, versions: [], answers: {} };
};

/** A change of AI's, made to the draft. A new service takes the picture its own draft would, and waits for its words. */
function changedDraft(
  draft: AdDraftState,
  change: AdChange,
  facts: AdDraftFacts,
  currency: string,
): AdDraftState | null {
  if (change.kind === "words") return { ...draft, versions: change.versions };
  if (change.kind === "service") return withService(draft, change.service);
  if (change.kind === "picture") {
    const next = nextAdPicture(facts, draft.picture);
    return next === draft.picture ? null : { ...draft, picture: next };
  }
  if (change.kind === "area") {
    const { area: _wide, ...circle } = draft;
    return { ...circle, miles: change.miles };
  }
  if (change.kind === "place") return null;
  if (change.kind === "amount") return { ...draft, total_minor: change.units * minorPerUnit(currency) };
  return { ...draft, end_day: change.day };
}

/**
 * The draft shown across the wider place the owner named (the plan's G8, as settled 20 November 2026), where Meta knows
 * it (area.ts); null where Meta knows no such place, and the change is not made. The miles stay, for a circle again.
 */
async function placedDraft(
  caller: AdWordsAsking,
  draft: AdDraftState,
  place: Extract<AdChange, { kind: "place" }>["place"],
): Promise<AdDraftState | null> {
  const found = await findAdPlace({ tenantId: caller.rc.tenantId, userId: caller.userId }, { ...place, strict: false });
  return found ? { ...draft, area: found } : null;
}

/** `write`: three versions of the draft's words, or why there are none. */
async function writeWords(caller: AdWordsAsking, facts: AdDraftFacts, draft: AdDraftState, noPrice: boolean) {
  const judged = adDraftAnswer(facts, draft);
  if (!judged.can || facts.account === null) return judged;
  // The draft as it was judged: a service Services no longer lists is the rule's own pick again.
  const held = { ...draft, service: judged.draft.service };
  const brief = adDraftBrief(facts, facts.account, held, { noPrice });
  const written = await writeAd(writerOf(caller), brief);
  if (!written.wrote) return { ...judged, wrote: { ok: false as const, why: noWordsOf(written.kept) } };
  const label = labelOf(written.answer, held.service);
  const next = { ...held, versions: written.versions, ...(label ? { label } : {}) };
  return { ...adDraftAnswer(facts, next), wrote: { ok: true as const } };
}

/** `change`: the one change the owner asked AI for, made where it is one a draft may take. */
async function changeDraft(caller: AdWordsAsking, facts: AdDraftFacts, draft: AdDraftState, wanted: string) {
  const judged = adDraftAnswer(facts, draft);
  if (!judged.can || facts.account === null) return judged;
  const others = facts.services
    .filter((service) => !service.advertised && service.name !== judged.draft.service)
    .map((service) => service.name);
  const held = { ...draft, service: judged.draft.service };
  const brief = adDraftBrief(facts, facts.account, held, {
    ask: {
      job: "change",
      change: { versions: draft.versions, asked: wanted, services: others, today: facts.today, ends: draft.end_day },
    },
  });
  const written = await writeAd(writerOf(caller), brief);
  if (!written.wrote) {
    // Words that would trip a check are a change not made, said with the rule they met; anything else is no answer.
    if (written.kept === "checks")
      return { ...judged, changed: { kind: "none" as const, fault: faultOf(written.issues) } };
    return { ...judged, wrote: { ok: false as const, why: noWordsOf(written.kept) } };
  }
  const change = adChangeOf(written.answer, brief);
  const next =
    change?.kind === "place"
      ? await placedDraft(caller, held, change.place)
      : change
        ? changedDraft(held, change, facts, facts.account.currency)
        : null;
  if (!change || !next) return { ...judged, changed: { kind: "none" as const, fault: null } };
  // Changed words are judged once more against the draft's own brief, as every change is.
  const faults = change.kind === "words" ? adWordIssues(next.versions, adDraftBrief(facts, facts.account, next)) : [];
  if (faults.length) return { ...judged, changed: { kind: "none" as const, fault: faultOf(faults) } };
  return { ...adDraftAnswer(facts, next), changed: { kind: change.kind === "place" ? "area" : change.kind } };
}

/**
 * The words a writer this ask waited for kept, judged as the draft now stands: none where they are not the words this
 * ask would have written (another service or picture), or none new came.
 */
function landedWords(facts: AdDraftFacts, sent: AdDraftState, noPrice: boolean): AdWordsAnswer | null {
  const kept = facts.kept?.draft;
  if (!kept || kept.versions.length === 0 || stableJson(kept.versions) === stableJson(sent.versions)) return null;
  if (adWordsFor(kept, noPrice) !== adWordsFor(sent, noPrice)) return null;
  const answer = adDraftAnswer(facts, kept);
  return answer.can ? { ...answer, wrote: { ok: true } } : null;
}

/**
 * `write`, asked once for a draft's words: where another ask is out for the same words, its words, waited for; where
 * it came to nothing, or is out past its time, this ask writes them. The writer's mark goes once it is back.
 */
async function writeOnce(asking: AdWordsAsking, read: AdDraftFacts, draft: AdDraftState, noPrice: boolean) {
  const writing = newAdWriting(draft, noPrice);
  let facts = read;
  let held = await holdAdWriter(asking.rc, writing);
  if (held.out) {
    await waitForAdWriter(asking.rc, held.out, asking.deadline);
    facts = await readAdDraftFacts(asking.rc);
    const landed = landedWords(facts, draft, noPrice);
    if (landed) return landed;
    held = await holdAdWriter(asking.rc, writing);
  }
  try {
    return await keepWrittenAnswer(asking.rc, facts, draft, await writeWords(asking, facts, draft, noPrice));
  } finally {
    if (held.held) await letGoAdWriter(asking.rc, writing.ask);
  }
}

/** POST ads/words: the writer's job on a draft, and the draft as it stands after it. */
export async function writeAdWords(
  caller: AdWordsCaller,
  body:
    | { job: "write"; draft: AdDraftState; no_price?: boolean | undefined }
    | { job: "change"; draft: AdDraftState; asked: string },
): Promise<AdWordsAnswer> {
  await requireAdsOffered(caller.rc);
  const asking = { ...caller, deadline: Date.now() + WORDS_WAIT_MS };
  const facts = await readAdDraftFacts(caller.rc);
  if (body.job === "write") return writeOnce(asking, facts, body.draft, body.no_price === true);
  return keepWrittenAnswer(caller.rc, facts, body.draft, await changeDraft(asking, facts, body.draft, body.asked));
}
