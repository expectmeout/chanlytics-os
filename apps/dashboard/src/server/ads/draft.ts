import "server-only";
import {
  AppError,
  FILE_COPY_STATES,
  FILE_COPY_WHYS,
  adDraftOf,
  adLeastTotal,
  adPictureIssue,
  daysBetween,
  isOneOf,
  minorPerUnit,
  serviceNamedIn,
  type AdDraftInputs,
  type AdDraftMissing,
  type AdDraftParts,
  type AdPicture,
  type AdWayIn,
} from "@chanlytics/contracts";
import { keepAdDraft, keepAdMost } from "@chanlytics/db/ads";
import { logAndGoOn } from "@chanlytics/log";
import { adBriefOf, adServiceFacts, type AdAsk, type AdOfferFacts } from "../ask/skills/ad/brief";
import { stableJson, type ReaderContext } from "../shared/reader";
import { callAdsEdge, readAdsOffered } from "../connections/ads-ready";
import { adDeclared, adDraftChecks, adKindsOf } from "./draft-checks";
import { readAdDraftFacts, type AdDraftAccount, type AdDraftFacts, type AdDraftService } from "./draft-facts";
import { findCustomersPlace } from "./area";
import type { AdAmountBasisDto, AdDraftAnswer, AdDraftState, AdTurnOn, AdWideArea } from "./draft-shape";

/**
 * A new ad's draft, picked, judged and kept (the Ads plan's 4.6, 5.1, 6.2 and 6.3): code picks the service, the
 * picture, the area, the amount and the end (contracts ads/draft.ts), and says what would stop the ad before Turn on
 * (draft-checks.ts). The words are the ad writer's, asked by its own route (words.ts) or by AI's own turn. Nothing here
 * calls Meta. The workspace keeps its one draft (ad_drafts), and every answer is that draft judged afresh as the
 * business stands now: what was kept is what was chosen, never what was true of the business when it was kept.
 */

/**
 * How Turn on stands here, the one place that says so: whether the edge turns ads on in this workspace from this
 * deployment (its switch), and whether the picture is one Turn on sends (a photo: a video's upload to Meta is not built
 * yet). The checks before Turn on are each a line of their own, and the screen draws the press from both.
 */
const adTurnOnStands = (facts: Pick<AdDraftFacts, "presses">, picture: "photo" | "video"): AdTurnOn =>
  !facts.presses ? "off" : picture === "video" ? "video" : "ready";

/** What a press on an ad says where the workspace's ad account is not connected now: Turn on, a change, Fix it. */
export const AD_ACCOUNT_NOT_CONNECTED = "Your ad account isn't connected right now. Connect it again first.";

/** Refused where Ads is not switched on for the workspace on this deployment (the plan's D7). */
export async function requireAdsOffered(rc: Pick<ReaderContext, "tenantId">): Promise<void> {
  if (!(await readAdsOffered(rc.tenantId)))
    throw new AppError("conflict", "Ads aren't available in this workspace yet.", 409);
}

/** What the draft's rules pick from, as contracts reads it. `wide`: the draft is shown across a wider place. */
const inputsOf = (facts: AdDraftFacts, account: AdDraftAccount, wide: boolean): AdDraftInputs => ({
  today: facts.today,
  services: facts.services,
  pictures: facts.pictures.pictures,
  address: facts.address,
  wide,
  whatsapp: facts.wayIn === "open",
  account,
  history: facts.history,
  ownerMostMinor: facts.ownerMostMinor,
  openTimes: facts.openTimes,
});

const serviceOf = (facts: AdDraftFacts, name: string): AdDraftService | undefined =>
  facts.services.find((service) => service.name.trim().toLowerCase() === name.trim().toLowerCase());

/** The pictures that are fine in ads, in the order Files offers them. */
const finePictures = (facts: AdDraftFacts): AdPicture[] =>
  facts.pictures.pictures.filter((picture) => adPictureIssue(picture) === null);

/** The next picture that is fine in ads after the one a draft shows; the same one where there is no other. */
export function nextAdPicture(facts: AdDraftFacts, current: string): string {
  const fine = finePictures(facts);
  const at = fine.findIndex((picture) => picture.id === current);
  return fine[(at + 1) % Math.max(1, fine.length)]?.id ?? current;
}

/** What the ad writer is told of a draft as it stands: the offer its words answer to. */
function adOfferOf(
  facts: AdDraftFacts,
  account: AdDraftAccount,
  draft: Pick<AdDraftState, "service" | "picture" | "miles" | "area">,
  noPrice = false,
): AdOfferFacts {
  const service = serviceOf(facts, draft.service);
  return {
    service: { name: service?.name ?? draft.service, price: service?.price ?? null },
    facts: service ? adServiceFacts(service) : [],
    picture: facts.pictures.files.get(draft.picture)?.line ?? null,
    area: { place: draft.area?.name ?? null, miles: draft.miles, wide: draft.area?.kind ?? null },
    places: account.places,
    noPrice,
  };
}

/** The brief a draft's words are written from, or judged against: for the job asked, a draft's own where none is. */
export const adDraftBrief = (
  facts: AdDraftFacts,
  account: AdDraftAccount,
  draft: Pick<AdDraftState, "service" | "picture" | "miles" | "area">,
  job: { ask?: AdAsk; noPrice?: boolean } = {},
) => adBriefOf(facts.business, adOfferOf(facts, account, draft, job.noPrice === true), job.ask ?? { job: "write" });

/**
 * A draft sent or kept, held to what Services now lists; a service that is gone is the rule's own pick again, with no
 * words and no name of the one that went.
 */
function heldDraft(sent: AdDraftState, facts: AdDraftFacts, picked: string): AdDraftState {
  const service = serviceOf(facts, sent.service);
  if (service) return { ...sent, service: service.name };
  const { label: _gone, ...rest } = sent;
  return { ...rest, service: picked, versions: [] };
}

/** Why a draft cannot be written yet, or the ad account it is written for. */
function standsOf(
  facts: AdDraftFacts,
): { missing: Extract<AdDraftAnswer, { can: false }>["missing"] } | AdDraftAccount {
  if (facts.stopped) return { missing: "stopped" };
  if (facts.account === null) return { missing: facts.accountReading ? "account_reading" : "account" };
  return facts.account;
}

/**
 * Which picture is missing, where the rule found none fine in ads: none at all; else the cause an owner can mend first,
 * music (or not heard yet); else none of a size or shape an ad takes.
 */
function pictureMissing(pictures: readonly AdPicture[]): Extract<AdDraftAnswer, { can: false }>["missing"] {
  if (pictures.length === 0) return "picture_none";
  const issues = new Set(pictures.map(adPictureIssue));
  return issues.has("music") ? "picture_music" : "picture";
}

/**
 * Why AI can't answer the chat an ad opens, as the one thing missing says it: no number (or not the one connected), what
 * Meta holds not known yet, Meta stopping the number, the workspace paused, or AI stopped.
 */
const WAY_IN_MISSING: Record<Exclude<AdWayIn, "open">, Extract<AdDraftAnswer, { can: false }>["missing"]> = {
  no_number: "whatsapp",
  unread: "whatsapp_unread",
  blocked: "whatsapp_blocked",
  paused: "paused",
  stopped: "stopped",
};

/** The one thing missing the rule found, said as precisely as the draft's facts know it. */
function missingOf(facts: AdDraftFacts, missing: AdDraftMissing): Extract<AdDraftAnswer, { can: false }>["missing"] {
  // What was offered and the shelves' newest, which hold what was never offered: someone shown, or not looked at.
  if (missing === "picture") return pictureMissing([...facts.pictures.pictures, ...facts.pictures.newest]);
  return missing === "whatsapp" && facts.wayIn !== "open" ? WAY_IN_MISSING[facts.wayIn] : missing;
}

/** Why the rule proposes its amount, as the wire says it. */
function basisDto(basis: AdDraftParts["basis"]): AdAmountBasisDto {
  if (basis.kind === "starting") return basis;
  return {
    kind: "booked",
    open_times: basis.openTimes,
    cost_minor: basis.costPerBookedMinor,
    held_to: basis.heldTo,
  };
}

/** Whether two drafts hold the same choices, whatever order their fields came in. */
export const sameDraft = (first: AdDraftState, second: AdDraftState): boolean =>
  stableJson(first) === stableJson(second);

/** A draft as the rule picks it fresh, before anything was chosen: across the wider place proposed, where one was. */
const freshDraft = (parts: AdDraftParts, proposed: AdWideArea | null): AdDraftState => ({
  service: parts.serviceId,
  picture: parts.pictureId,
  miles: parts.miles,
  ...(proposed ? { area: proposed } : {}),
  total_minor: parts.totalMinor,
  end_day: parts.endDay,
  versions: [],
  answers: {},
});

/**
 * The draft as it stands, judged: a fresh one where none is sent, else the one sent, with the checks run again. Where
 * no draft can be written yet, the one thing missing (the plan's G13).
 */
export function adDraftAnswer(facts: AdDraftFacts, sent: AdDraftState | null): AdDraftAnswer {
  const account = standsOf(facts);
  if ("missing" in account) return { can: false, missing: account.missing };
  const wide = sent ? sent.area !== undefined : facts.proposedArea !== null;
  const fresh = adDraftOf(inputsOf(facts, account, wide));
  if (!fresh.ok) return { can: false, missing: missingOf(facts, fresh.missing) };
  const { parts } = fresh;
  const draft = sent ? heldDraft(sent, facts, parts.serviceId) : freshDraft(parts, facts.proposedArea);
  const days = daysBetween(facts.today, draft.end_day);
  const brief = adDraftBrief(facts, account, draft);
  const file = facts.pictures.files.get(draft.picture);
  const pictureKind = file?.kind === "video" ? "video" : "photo";
  const pickedHere = draft.service === parts.serviceId;
  return {
    can: true,
    draft: {
      ...draft,
      picture: {
        id: draft.picture,
        kind: pictureKind,
        name: file?.name ?? "",
        made: file?.source === "made",
        // A video whose copy is not at hand: where it stands, as its row says it until the pick's ask says more.
        ...(file?.kind === "video" && file.copy !== "here"
          ? { copy: { state: file.copy, why: file.copy_why, uploaded: file.owner_uploaded === true } }
          : {}),
      },
    },
    today: facts.today,
    days,
    account: {
      name: account.name,
      currency: account.currency,
      page: account.page,
      min_daily_minor: account.minDailyMinor,
    },
    amount: {
      least_minor: adLeastTotal(account, days),
      proposed: { total_minor: parts.totalMinor, days: parts.days, basis: basisDto(parts.basis) },
      most_minor: facts.ownerMostMinor,
    },
    picked: pickedHere ? ((serviceOf(facts, draft.service)?.booked ?? 0) > 0 ? "most_booked" : "first") : null,
    area_why: draft.area && facts.servesAt !== null ? "goes_to_customers" : null,
    checks: adDraftChecks(draft, {
      today: facts.today,
      account,
      ownerMostMinor: facts.ownerMostMinor,
      picture: facts.pictures.pictures.find((picture) => picture.id === draft.picture) ?? null,
      brief,
    }),
    ...adDeclared(adKindsOf(brief, draft.versions), draft.answers),
    turn_on: adTurnOnStands(facts, pictureKind),
    owner: facts.owner,
    // Who left it, while it is as they left it: an answer that changes it is this member's from then on.
    left_by: facts.kept !== null && sameDraft(draft, facts.kept.draft) ? facts.kept.leftBy : null,
  };
}

/** The draft an answer holds, as it is kept. */
export const keptStateOf = (answer: Extract<AdDraftAnswer, { can: true }>): AdDraftState => ({
  ...answer.draft,
  picture: answer.draft.picture.id,
});

/**
 * The draft an answer holds, kept as the workspace's one (ad_draft_keep), where it is not already kept as it stands:
 * opening a draft someone left changes nothing until something in it is changed, so it stays theirs, and the owner's
 * bell row with it. A draft kept by someone who may not turn it on rings the owner's bell (the plan's 6.2); one kept
 * by the owner closes it. A keep that fails costs the answer nothing: the draft is drawn, and the next change keeps it.
 */
export async function keepDraftAnswer<A extends AdDraftAnswer>(
  rc: ReaderContext,
  facts: AdDraftFacts,
  answer: A,
): Promise<A> {
  if (!answer.can || facts.account === null) return answer;
  const draft = keptStateOf(answer);
  if (facts.kept !== null && sameDraft(draft, facts.kept.draft)) return answer;
  await keepAdDraft(rc.ctx.supabase, rc.tenantId, { accountId: facts.account.id, draft }).catch(
    logAndGoOn("an ad's draft kept", null),
  );
  return answer;
}

/**
 * The most any ad may cost, as the owner said it to AI (the plan's G6), kept on the account before a draft is judged,
 * and judged with at once. The owner's alone: said by anyone else, nothing is kept and the press is refused in words.
 */
async function keepOwnersMost(rc: ReaderContext, facts: AdDraftFacts, mostUnits: number): Promise<AdDraftFacts> {
  if (!facts.owner) throw new AppError("forbidden", "Only the owner can say the most an ad may cost.", 403);
  if (facts.account === null) return facts;
  const mostMinor = mostUnits * minorPerUnit(facts.account.currency);
  const kept = await keepAdMost(rc.ctx.supabase, rc.tenantId, mostMinor);
  return kept ? { ...facts, ownerMostMinor: mostMinor } : facts;
}

/** What a fresh draft is started from: the service AI's card named, or the piece "Run as an ad" chose in Content. */
interface AdDraftStart {
  service?: string | undefined;
  picture?: string | undefined;
}

/**
 * The service a chosen piece is about, as its name says it (a made post is named for its headline): the longest one
 * Services lists that the name holds (contracts calendar serviceNamedIn, the one rule for a service a title names), of
 * those no ad made here already runs for. None where its name names none.
 */
function serviceOfPiece(facts: AdDraftFacts, picture: string | undefined): string | null {
  const piece = picture === undefined ? undefined : facts.pictures.files.get(picture);
  if (!piece) return null;
  return serviceNamedIn(piece.name, facts.services, (name) => serviceOf(facts, name)?.advertised === false);
}

/**
 * A fresh draft started from what was named, picked by the same rule with what it picks from narrowed to that. A service
 * AI's card named (the plan's 6.3): Services narrowed to it, so its picture is that service's own; one Services does not
 * list is the rule's own pick; said with no "why this service", since the person named it. A piece Run as an ad chose
 * (6.8, join 3): the pictures narrowed to it alone, so the draft shows it or says the one thing missing for it, never
 * another picture; and the service it is about, where its name says one, else the rule's own pick. One no longer kept
 * (deleted, or set aside since) is missing as gone.
 */
function startedDraftAnswer(facts: AdDraftFacts, start: AdDraftStart): AdDraftAnswer {
  const wanted = (start.service ?? serviceOfPiece(facts, start.picture) ?? undefined)?.trim().toLowerCase();
  const named = facts.services.filter((one) => one.name.trim().toLowerCase() === wanted);
  const chosen = facts.pictures.pictures.filter((one) => one.id === start.picture);
  const stands = standsOf(facts);
  if (start.picture !== undefined && chosen.length === 0)
    return { can: false, missing: "missing" in stands ? stands.missing : "picture_gone" };
  const answer = adDraftAnswer(
    {
      ...facts,
      ...(named.length > 0 ? { services: named } : {}),
      ...(start.picture !== undefined ? { pictures: { ...facts.pictures, pictures: chosen, newest: [] } } : {}),
    },
    null,
  );
  return answer.can && named.length > 0 ? { ...answer, picked: null } : answer;
}

/**
 * The facts with the wider place a fresh draft proposes where Google says the business goes to its customers: the
 * place its listing names, found at Meta (area.ts). Asked only for a fresh draft, so a draft being changed never waits
 * on Meta; where none is sure, the draft keeps its circle.
 */
async function withProposedArea(rc: ReaderContext, facts: AdDraftFacts): Promise<AdDraftFacts> {
  if (facts.servesAt === null || facts.account === null) return facts;
  const proposed = await findCustomersPlace({ tenantId: rc.tenantId, userId: rc.userId }, facts.servesAt);
  return proposed ? { ...facts, proposedArea: proposed } : facts;
}

/** What POST ads/draft takes (draft-shape.ts AdDraftBodySchema). */
interface AdDraftBody extends AdDraftStart {
  draft?: AdDraftState | undefined;
  act?: "next_picture" | undefined;
  most?: number | undefined;
}

/**
 * POST ads/draft: the kept draft, or a fresh one where none is kept, or the one sent; judged again after the one act
 * a check offers that is done here, and kept. AI's card asks for a fresh one for the service it names, and Run as an ad
 * for one around the piece it chose, in place of the kept one. With the owner's most, that is kept first.
 */
export async function draftAd(rc: ReaderContext, body: AdDraftBody): Promise<AdDraftAnswer> {
  await requireAdsOffered(rc);
  const read = await readAdDraftFacts(rc, [body.picture, body.draft?.picture]);
  const facts = body.most === undefined ? read : await keepOwnersMost(rc, read, body.most);
  // The picture the screen showed when it asked: any other the answer shows is a pick, and a pick asks for its copy.
  const picked = (answer: AdDraftAnswer) => askPickedCopy(rc, answer, body.act ? undefined : body.draft?.picture);
  if ((body.service !== undefined || body.picture !== undefined) && body.draft === undefined)
    return picked(await keepDraftAnswer(rc, facts, startedDraftAnswer(await withProposedArea(rc, facts), body)));
  const sent = body.draft ?? facts.kept?.draft ?? null;
  if (sent === null)
    return picked(await keepDraftAnswer(rc, facts, adDraftAnswer(await withProposedArea(rc, facts), null)));
  const moved = body.act === "next_picture" ? { ...sent, picture: nextAdPicture(facts, sent.picture) } : sent;
  return picked(await keepDraftAnswer(rc, facts, adDraftAnswer(facts, moved)));
}

/**
 * The pick (the archive review of 28 Nov 2026, R1.6): a video whose copy stepped aside is asked back as a draft comes to
 * show it, through the copy's one door on the edge, as an ad asks (files/copy/ensure.ts, the purpose `ad`). The answer
 * then says where the copy stands, usually on its way back, and the screen waits and goes on by itself. Asked once a
 * pick: a draft that still shows the picture it showed asks nothing, so judging a draft again never spends a return,
 * and one already on its way is only waited for. Where the edge can't be asked, the row's own word stands.
 */
async function askPickedCopy(
  rc: ReaderContext,
  answer: AdDraftAnswer,
  shownBefore: string | undefined,
): Promise<AdDraftAnswer> {
  if (!answer.can) return answer;
  const { picture } = answer.draft;
  const copy = picture.copy;
  if (!copy || picture.id === shownBefore || copy.state === "returning" || copy.state === "lost") return answer;
  const asked = await callAdsEdge({ op: "copy", tenant_id: rc.tenantId, user_id: rc.userId, file_id: picture.id });
  const state = asked.status === 200 && isOneOf(FILE_COPY_STATES, asked.body?.copy) ? asked.body.copy : null;
  if (state === null) return answer;
  const why = isOneOf(FILE_COPY_WHYS, asked.body?.why) ? asked.body.why : null;
  const { copy: _was, ...shown } = picture;
  return {
    ...answer,
    draft: {
      ...answer.draft,
      picture: state === "here" ? shown : { ...shown, copy: { state, why, uploaded: copy.uploaded } },
    },
  };
}
