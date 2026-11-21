/**
 * Fix it, for an ad made here that Meta turned down (the Ads plan's 4.5, 5.4 and C8; the ad writer's third job, 6.7).
 *
 * AI writes each version of the ad's words again from Meta's own words for why, each checked as a draft's are (5.1),
 * and the ad as it was approved, with AI's change made, is kept as the workspace's draft, so New ad opens on it. The
 * owner's Turn on there sends it back through Meta's check whole: every part's dry run first, Meta's own look at the
 * words among them, then made paused, read back and compared. The ad Meta turned down ends once that one is turned on
 * (the edge's turn-on door), and never before: an owner who leaves the draft leaves the ad as it was.
 *
 * Asking Meta to look again at the ad as it is happens in Meta (C8): Meta's interface names no way for an app to ask.
 * Nothing here calls Meta, and AI turns nothing on. The model's words cost Chanlytics money, so the route spends.
 */
import "server-only";
import {
  AD_RUN_DAYS,
  AppError,
  SECOND_MS,
  addDays,
  recordOrEmpty,
  textOrEmpty,
  type AdVersion,
} from "@chanlytics/contracts";
import { findAd } from "@chanlytics/db/ads";
import { writeAd } from "../ask/skills/ad/write";
import type { ReaderContext } from "../shared/reader";
import { AD_ACCOUNT_NOT_CONNECTED, adDraftAnswer, adDraftBrief, keepDraftAnswer, requireAdsOffered } from "./draft";
import { readAdDraftFacts, type AdDraftFacts } from "./draft-facts";
import type { AdDraftState, AdWideArea } from "./draft-shape";

/** How long the rewrites have, side by side: inside the route's own minute, with room left to keep the draft. */
const FIX_WAIT_MS = 50 * SECOND_MS;

/** What Fix it came to: the draft kept with AI's change made, New ad's to open, with how many versions were written. */
interface AdFixed {
  opened: "new_ad";
  versions: number;
}

/** A kept field's text, trimmed; empty where it is none. */
const keptText = (value: unknown): string => textOrEmpty(value).trim();
/** A kept field's whole number; 0 where it is none. */
const keptWhole = (value: unknown): number => (typeof value === "number" && Number.isSafeInteger(value) ? value : 0);

/** The wider place approved, whole, as a draft holds it; none for the circle, or one kept without its name. */
function approvedAreaOf(approved: Record<string, unknown>): AdWideArea | undefined {
  const area = recordOrEmpty(approved.area);
  const kind = area.kind === "city" || area.kind === "region" || area.kind === "country" ? area.kind : null;
  const [key, name, country] = [keptText(area.key), keptText(area.name), keptText(area.country)];
  return kind && key && name && /^[A-Z]{2}$/.test(country) ? { kind, key, name, country } : undefined;
}

/** The versions approved, each its text and headline. */
const approvedVersionsOf = (approved: Record<string, unknown>): AdVersion[] =>
  (Array.isArray(approved.versions) ? approved.versions : []).flatMap((one) => {
    const version = recordOrEmpty(one);
    const text = keptText(version.text);
    const headline = keptText(version.headline);
    return text && headline ? [{ text, headline }] : [];
  });

/** The longest name a draft keeps as its label: what New ad's title and sentence say. */
const LABEL_MAX = 60;

/**
 * The ad as it was approved, as a draft holds it, with no words yet: its service, picture, area, total and last day,
 * and the ad it is Fix it's of. A last day already past runs a draft's own length from today.
 */
function fixDraftOf(ad: { id: string; name: string }, approved: Record<string, unknown>, today: string): AdDraftState {
  const endDay = keptText(approved.end_day);
  const area = approvedAreaOf(approved);
  return {
    service: keptText(approved.service),
    picture: keptText(approved.picture),
    miles: keptWhole(approved.miles),
    ...(area ? { area } : {}),
    total_minor: keptWhole(approved.total_minor),
    end_day: endDay > today ? endDay : addDays(today, AD_RUN_DAYS.draft),
    versions: [],
    answers: {},
    ...(ad.name.length <= LABEL_MAX ? { label: ad.name } : {}),
    fixes: { id: ad.id, name: ad.name.slice(0, 200) },
  };
}

/** Each version written again from Meta's words, side by side (three at most), each the writer's one checked version. */
async function writeFixedVersions(
  caller: { rc: ReaderContext; userId: string },
  facts: AdDraftFacts,
  draft: AdDraftState,
  refused: { versions: readonly AdVersion[]; words: string },
): Promise<AdVersion[]> {
  const { account } = facts;
  if (account === null) return [];
  const writer = { tenantId: caller.rc.tenantId, userId: caller.userId, deadline: Date.now() + FIX_WAIT_MS };
  const written = await Promise.all(
    refused.versions.map((version) =>
      writeAd(
        writer,
        adDraftBrief(facts, account, draft, { ask: { job: "rewrite", refused: { version, words: refused.words } } }),
      ),
    ),
  );
  return written.flatMap((one) => (one.wrote ? one.versions.slice(0, 1) : []));
}

/** `POST ads/:id/fix`: AI's change made to the ad Meta turned down, kept as the draft New ad opens on. */
export async function fixAd(caller: { rc: ReaderContext; userId: string }, adId: string): Promise<AdFixed> {
  const { rc } = caller;
  await requireAdsOffered(rc);
  const row = await findAd(rc.ctx.supabase, rc.tenantId, adId);
  if (!row) throw new AppError("not_found", "That ad is no longer here.", 404);
  const metaWords = row.platform_issue?.trim() ?? "";
  if (row.origin !== "chanlytics" || row.status !== "made" || row.platform_state !== "DISAPPROVED" || !metaWords)
    throw new AppError("conflict", "Meta isn't turning this ad down now, so there's nothing to fix.", 409);
  const facts = await readAdDraftFacts(rc);
  if (facts.stopped) throw new AppError("conflict", "AI is stopped, so no ad is drafted. Start AI again first.", 409);
  if (facts.account === null) throw new AppError("conflict", AD_ACCOUNT_NOT_CONNECTED, 409);
  const approved = recordOrEmpty(row.approved);
  const versions = approvedVersionsOf(approved);
  const draft = fixDraftOf(row, approved, facts.today);
  if (versions.length === 0 || !draft.service || !draft.picture)
    throw new AppError("conflict", "This ad can't be drafted again from here. Change it in Meta.", 409);
  const words = await writeFixedVersions(caller, facts, draft, { versions, words: metaWords });
  if (words.length === 0)
    throw new AppError("upstream_provider", "AI couldn't rewrite this ad from Meta's reason just now. Try again.");
  const answer = adDraftAnswer(facts, { ...draft, versions: words });
  if (!answer.can)
    throw new AppError("conflict", "Something this ad needs is no longer here. Open New ad to see what.", 409);
  await keepDraftAnswer(rc, facts, answer);
  return { opened: "new_ad", versions: words.length };
}
