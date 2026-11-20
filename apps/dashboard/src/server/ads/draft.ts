import "server-only";
import {
  AppError,
  adDraftOf,
  adLeastTotal,
  adPictureIssue,
  daysBetween,
  type AdDraftInputs,
  type AdPicture,
} from "@chanlytics/contracts";
import { adBriefOf, adServiceFacts, type AdAsk, type AdOfferFacts } from "../ask/skills/ad/brief";
import type { ReaderContext } from "../shared/reader";
import { adsOffered } from "./account";
import { adDeclared, adDraftChecks, adKindsOf } from "./draft-checks";
import {
  adsHaveHistory,
  readAdDraftFacts,
  type AdDraftAccount,
  type AdDraftFacts,
  type AdDraftService,
} from "./draft-facts";
import type { AdDraftAnswer, AdDraftState, AdTurnOn } from "./draft-shape";

/**
 * A new ad's draft, picked and judged (the Ads plan's 4.6, 5.1 and 6.3): code picks the service, the picture, the
 * area, the amount and the end (contracts ads/draft.ts), and says what would stop the ad before Turn on
 * (draft-checks.ts). The words are the ad writer's, asked by its own route (words.ts). Nothing here calls Meta, and
 * nothing is kept: the draft is the screen's to hold, and every answer is the whole draft as the business stands now.
 */

/**
 * How Turn on stands here. The job that makes an ad at Meta is the next part of the plan's step 4, so the press is
 * drawn and cannot be pressed, with the reason under it. The one place that says so: when the job exists, this
 * answers whether it may run in this workspace, and the screen changes nothing.
 */
const adTurnOnStands = (): AdTurnOn => "not_yet";

/** Refused where Ads is not switched on for the workspace on this deployment (the plan's D7). */
export async function requireAdsOffered(rc: Pick<ReaderContext, "tenantId">): Promise<void> {
  if (!(await adsOffered(rc.tenantId)))
    throw new AppError("conflict", "Ads aren't available in this workspace yet.", 409);
}

/** What the draft's rules pick from, as contracts reads it. */
const inputsOf = (facts: AdDraftFacts, account: AdDraftAccount): AdDraftInputs => ({
  today: facts.today,
  services: facts.services,
  pictures: facts.pictures.pictures,
  address: facts.address,
  whatsapp: facts.whatsapp,
  account,
  history: facts.history,
  // The owner's own most is said to AI in a sentence (the plan's G6), which is not kept anywhere yet.
  ownerMostMinor: null,
  // The Calendar's open times over a run are not read into a draft yet (draft-facts.ts).
  openTimes: null,
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
  draft: Pick<AdDraftState, "service" | "picture" | "miles">,
  noPrice = false,
): AdOfferFacts {
  const service = serviceOf(facts, draft.service);
  return {
    service: { name: service?.name ?? draft.service, price: service?.price ?? null },
    facts: service ? adServiceFacts(service) : [],
    picture: facts.pictures.files.get(draft.picture)?.line ?? null,
    area: { place: null, miles: draft.miles },
    places: account.places,
    noPrice,
  };
}

/** The brief a draft's words are written from, or judged against: for the job asked, a draft's own where none is. */
export const adDraftBrief = (
  facts: AdDraftFacts,
  account: AdDraftAccount,
  draft: Pick<AdDraftState, "service" | "picture" | "miles">,
  job: { ask?: AdAsk; noPrice?: boolean } = {},
) => adBriefOf(facts.business, adOfferOf(facts, account, draft, job.noPrice === true), job.ask ?? { job: "write" });

/** A draft the screen sent, held to what Services now lists; a service that is gone is the rule's own pick again. */
function heldDraft(sent: AdDraftState, facts: AdDraftFacts, picked: string): AdDraftState {
  const service = serviceOf(facts, sent.service);
  return { ...sent, service: service?.name ?? picked, versions: service ? sent.versions : [] };
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
 * The draft as it stands, judged: a fresh one where none is sent, else the one sent, with the checks run again. Where
 * no draft can be written yet, the one thing missing (the plan's G13).
 */
export function adDraftAnswer(facts: AdDraftFacts, sent: AdDraftState | null): AdDraftAnswer {
  const account = standsOf(facts);
  if ("missing" in account) return { can: false, missing: account.missing };
  const fresh = adDraftOf(inputsOf(facts, account));
  if (!fresh.ok) return { can: false, missing: fresh.missing };
  const { parts } = fresh;
  const draft: AdDraftState = sent
    ? heldDraft(sent, facts, parts.serviceId)
    : {
        service: parts.serviceId,
        picture: parts.pictureId,
        miles: parts.miles,
        total_minor: parts.totalMinor,
        end_day: parts.endDay,
        versions: [],
        answers: {},
      };
  const days = daysBetween(facts.today, draft.end_day);
  const brief = adDraftBrief(facts, account, draft);
  const file = facts.pictures.files.get(draft.picture);
  const least = adLeastTotal(account, days);
  const pickedHere = draft.service === parts.serviceId;
  return {
    can: true,
    draft: {
      ...draft,
      picture: {
        id: draft.picture,
        kind: file?.kind === "video" ? "video" : "photo",
        name: file?.name ?? "",
        made: file?.source === "made",
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
    amount: { starting: draft.total_minor === least, least_minor: least, history: adsHaveHistory(facts.history) },
    picked: pickedHere ? ((serviceOf(facts, draft.service)?.booked ?? 0) > 0 ? "most_booked" : "first") : null,
    checks: adDraftChecks(draft, {
      today: facts.today,
      account,
      ownerMostMinor: null,
      picture: facts.pictures.pictures.find((picture) => picture.id === draft.picture) ?? null,
      brief,
    }),
    ...adDeclared(adKindsOf(brief, draft.versions), draft.answers),
    turn_on: adTurnOnStands(),
    owner: facts.owner,
  };
}

/** POST ads/draft: a fresh draft, or the one sent judged again, after the one act a check offers that is done here. */
export async function draftAd(
  rc: ReaderContext,
  body: { draft?: AdDraftState | undefined; act?: "next_picture" | undefined },
): Promise<AdDraftAnswer> {
  await requireAdsOffered(rc);
  const facts = await readAdDraftFacts(rc);
  const sent = body.draft ?? null;
  const moved = sent && body.act === "next_picture" ? { ...sent, picture: nextAdPicture(facts, sent.picture) } : sent;
  return adDraftAnswer(facts, moved);
}
