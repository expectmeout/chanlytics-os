/**
 * Meta's ads wire, what a make answers (decision 0050, step P2; the Ads plan's step 4): the id of a thing Meta made,
 * Meta's own words where it refused one, the read back of a campaign with everything under it, in what Chanlytics
 * keeps, and a campaign removed. The requests are meta-make.ts's; every call leaves through callMetaAds (meta-call.ts), once.
 *
 * The read back is what a launch compares with what the owner approved before anything is switched on (decision 0050,
 * call 4): the total and its end, that every part is paused, that no special kind is declared, that a tap opens
 * WhatsApp, and that none of Meta's own changes to the picture or the words is on. Money is converted here from Meta's
 * own units, as every amount Meta gives is (meta-account.ts). No field is trusted: a part that is not as expected is
 * left out, never guessed, so a compare fails closed.
 *
 * Read on Meta's own pages on 19 November 2026 (docs/plans/2026-11-18-ads-meta-checks.md). Not yet seen on an account.
 */
import { recordOrEmpty, valueAt } from "@chanlytics/contracts";
import { metaErrorOf, metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { isMetaId, metaUnitsToMinor } from "./meta-account";
import { metaAreaWord } from "./meta-place";
import { instantOf } from "./meta-read";

/** Meta's id for what a make made; null where the answer names none (a dry run's answer, or a refusal). */
export function parseMetaMadeId(json: unknown): string | null {
  const id = metaText(valueAt(metaObject(json), "id"));
  return isMetaId(id) ? id : null;
}

/** Meta's refusal of a make or of its dry run, as much of it as a person and Health each need. */
export interface MetaRefusal {
  /** Meta's own sentence for the person where it wrote one, else its message. Shown in quotes, never reworded. */
  words: string;
  /** Meta's own title for it, where it gave one. */
  title: string | null;
  /** Meta's numbers for it: for Health, never for a screen. */
  code: number | null;
  subcode: number | null;
  /** The fields of the request Meta blames, each as a path: "lifetime_budget", "targeting.geo_locations". */
  fields: string[];
  /** Whether Meta says the same request may be taken later. */
  passing: boolean;
}

/** The fields Meta blames for a refusal (`error_data.blame_field_specs`): each a path into what was sent. */
function blamedOf(error: Record<string, unknown>): string[] {
  const data = valueAt(error, "error_data");
  // Meta sends the blob as an object, and on some answers as JSON in a string.
  let blob: unknown = data;
  if (typeof data === "string") {
    try {
      blob = JSON.parse(data);
    } catch {
      // Not JSON: it names no field.
      return [];
    }
  }
  const specs = valueAt(metaObject(blob), "blame_field_specs");
  if (!Array.isArray(specs)) return [];
  return specs
    .map((spec) => (Array.isArray(spec) ? spec.map(metaText).filter(Boolean).join(".") : metaText(spec)))
    .filter(Boolean)
    .slice(0, 20);
}

/** A refusal, read; null where the answer carries no error. */
export function parseMetaRefusal(json: unknown): MetaRefusal | null {
  const found = metaErrorOf(json);
  if (!found) return null;
  const error = recordOrEmpty(valueAt(metaObject(json), "error"));
  const title = metaText(error.error_user_title).slice(0, 300);
  return {
    words: (metaText(error.error_user_msg) || found.message).slice(0, 1000),
    title: title || null,
    code: found.code,
    subcode: found.subcode,
    fields: blamedOf(error),
    passing: error.is_transient === true,
  };
}

/* ------------------------------------------------------------ the read back */

/** What an ad is read with, by its id or under its campaign: itself, and its creative whole. */
const AD_FIELDS =
  "id,name,account_id,status,effective_status,adset_id,creative{id,object_story_spec,effective_object_story_id,degrees_of_freedom_spec,contextual_multi_ads}";

const READ_BACK_FIELDS = [
  "id",
  "name",
  "account_id",
  "status",
  "effective_status",
  "objective",
  "special_ad_categories",
  "adsets{id,name,status,destination_type,optimization_goal,lifetime_budget,daily_budget,start_time,end_time,promoted_object,targeting}",
  `ads{${AD_FIELDS}}`,
].join(",");

/** A campaign made here, read back whole in one call: itself, its ad sets, and its ads with their creatives. */
export function metaCampaignReadBackRequest(token: string, appSecret: string, campaignId: string): MetaRequest {
  if (!isMetaId(campaignId)) throw new Error("Meta's id for the campaign is not one");
  return {
    url: metaGraphUrl(campaignId, { fields: READ_BACK_FIELDS, ...metaProofQuery(token, appSecret) }),
    method: "GET",
  };
}

/** An ad set as Meta holds it. Money is in ISO minor units of the account's currency. */
export interface MetaAdSetHeld {
  id: string;
  name: string;
  /** Whether its own switch is off (Meta's `status` is PAUSED). */
  paused: boolean;
  /** What a tap opens (`destination_type`) and what it looks for (`optimization_goal`), as Meta says them. */
  opens: string | null;
  goal: string | null;
  /** Its total, and its amount a day: Meta holds one of the two, and the other is null. */
  totalMinor: number | null;
  dailyMinor: number | null;
  startsAt: string | null;
  endsAt: string | null;
  pageId: string | null;
  /** The WhatsApp number it opens, digits only. */
  whatsappNumber: string | null;
  /** The youngest person it is shown to. */
  youngest: number | null;
  /** The circle it is shown in, in miles; null where Meta holds no circle, more than one, or another unit. */
  miles: number | null;
  /** Where it is shown, as one word (meta-place.ts metaAreaWord): what a launch compares with what it sent. */
  area: string | null;
  /** Where it shows, each as `platform:position`, sorted; a platform with no position named is `platform:*`. */
  places: string[];
}

/** An ad as Meta holds it, with what its creative says. */
export interface MetaAdHeld {
  id: string;
  name: string;
  /** The ad account it is in: Meta's id for it, without "act_". */
  accountId: string | null;
  setId: string | null;
  paused: boolean;
  /** Meta's own word for where it stands (`effective_status`). */
  state: string;
  creativeId: string | null;
  /** The picture its creative shows, by the hash the account's library keeps it under; null for a video or none. */
  imageHash: string | null;
  /** The unpublished Page post its creative made (`effective_object_story_id`), which only the Page can remove. */
  storyId: string | null;
  pageId: string | null;
  instagramUserId: string | null;
  text: string | null;
  headline: string | null;
  /** Whether its button opens a WhatsApp chat. */
  whatsapp: boolean;
  /** Meta's own changes that read as switched on, by Meta's names: empty where none is. */
  ownChanges: string[];
  /** Whether Meta may show it beside other advertisers' ads. */
  besideOthers: boolean;
}

/** A campaign as Meta holds it, with everything under it. */
export interface MetaCampaignHeld {
  id: string;
  name: string;
  /** The ad account it is in: Meta's id for it, without "act_". */
  accountId: string | null;
  paused: boolean;
  state: string;
  objective: string | null;
  /** The special kinds it is declared as; empty where none is. */
  declared: string[];
  sets: MetaAdSetHeld[];
  ads: MetaAdHeld[];
}

const switchedOff = (row: Record<string, unknown> | null): boolean => metaText(valueAt(row, "status")) === "PAUSED";
const textKept = (value: unknown, most: number): string | null => metaText(value).slice(0, most) || null;
const idOrNull = (value: unknown): string | null => {
  const id = metaText(value);
  return isMetaId(id) ? id : null;
};
const edgeRows = (edge: unknown): unknown[] => {
  const rows = valueAt(metaObject(edge), "data");
  return Array.isArray(rows) ? rows : [];
};
const wordList = (list: unknown): string[] => (Array.isArray(list) ? list.map(metaText).filter(Boolean) : []);

/** Where an ad set shows, from its targeting: each platform Meta holds for it with each position named under it. */
function placesHeld(targeting: Record<string, unknown> | null): string[] {
  return wordList(valueAt(targeting, "publisher_platforms"))
    .flatMap((platform) => {
      const positions = wordList(valueAt(targeting, `${platform}_positions`));
      return positions.length > 0 ? positions.map((position) => `${platform}:${position}`) : [`${platform}:*`];
    })
    .sort();
}

/** The one circle an ad set is shown in, in miles; null for none, several, or a circle in another unit. */
function milesHeld(targeting: Record<string, unknown> | null): number | null {
  const circles = valueAt(targeting, "geo_locations", "custom_locations");
  if (!Array.isArray(circles) || circles.length !== 1) return null;
  const circle = metaObject(circles[0]);
  const radius = Number(metaText(valueAt(circle, "radius")));
  const unit = metaText(valueAt(circle, "distance_unit")) || "mile";
  return unit === "mile" && Number.isFinite(radius) && radius > 0 ? radius : null;
}

function adSetOf(row: unknown, currency: string): MetaAdSetHeld[] {
  const set = metaObject(row);
  const id = idOrNull(valueAt(set, "id"));
  if (!set || id === null) return [];
  const targeting = metaObject(valueAt(set, "targeting"));
  const promoted = metaObject(valueAt(set, "promoted_object"));
  const youngest = valueAt(targeting, "age_min");
  const number = metaText(valueAt(promoted, "whatsapp_phone_number")).replace(/\D/g, "");
  // Meta answers 0 for the one of the two budgets it does not hold.
  const amount = (field: string): number | null => metaUnitsToMinor(valueAt(set, field), currency) || null;
  return [
    {
      id,
      name: metaText(valueAt(set, "name")).slice(0, 500) || id,
      paused: switchedOff(set),
      opens: textKept(valueAt(set, "destination_type"), 100),
      goal: textKept(valueAt(set, "optimization_goal"), 100),
      totalMinor: amount("lifetime_budget"),
      dailyMinor: amount("daily_budget"),
      startsAt: instantOf(valueAt(set, "start_time")),
      endsAt: instantOf(valueAt(set, "end_time")),
      pageId: idOrNull(valueAt(promoted, "page_id")),
      whatsappNumber: number || null,
      youngest: typeof youngest === "number" && Number.isSafeInteger(youngest) ? youngest : null,
      miles: milesHeld(targeting),
      area: metaAreaWord(valueAt(targeting, "geo_locations")),
      places: placesHeld(targeting),
    },
  ];
}

/** Meta's own changes a creative reads as opted into: any switch, the retired one among them, that says OPT_IN. */
function ownChangesOf(creative: Record<string, unknown> | null): string[] {
  const switches = recordOrEmpty(valueAt(creative, "degrees_of_freedom_spec", "creative_features_spec"));
  return Object.entries(switches)
    .filter(([, state]) => metaText(valueAt(metaObject(state), "enroll_status")) === "OPT_IN")
    .map(([change]) => change)
    .sort();
}

/** A hash as the account's library keeps a picture under, or null. */
const hashOrNull = (value: unknown): string | null => {
  const hash = metaText(value);
  return /^[A-Za-z0-9]{8,64}$/.test(hash) ? hash : null;
};

function adHeld(row: unknown): MetaAdHeld[] {
  const ad = metaObject(row);
  const id = idOrNull(valueAt(ad, "id"));
  if (!ad || id === null) return [];
  const creative = metaObject(valueAt(ad, "creative"));
  const story = metaObject(valueAt(creative, "object_story_spec"));
  const picture = metaObject(valueAt(story, "link_data"));
  const video = metaObject(valueAt(story, "video_data"));
  const button = metaObject(valueAt(picture ?? video, "call_to_action"));
  return [
    {
      id,
      name: metaText(valueAt(ad, "name")).slice(0, 500) || id,
      accountId: idOrNull(valueAt(ad, "account_id")),
      setId: idOrNull(valueAt(ad, "adset_id")),
      paused: switchedOff(ad),
      state: metaText(valueAt(ad, "effective_status")).slice(0, 100) || "UNKNOWN",
      creativeId: idOrNull(valueAt(creative, "id")),
      imageHash: hashOrNull(valueAt(picture, "image_hash")),
      storyId: metaText(valueAt(creative, "effective_object_story_id")).slice(0, 100) || null,
      pageId: idOrNull(valueAt(story, "page_id")),
      instagramUserId: idOrNull(valueAt(story, "instagram_user_id")),
      text: textKept(valueAt(picture ?? video, "message"), 2000),
      headline: textKept(picture ? valueAt(picture, "name") : valueAt(video, "title"), 300),
      whatsapp:
        metaText(valueAt(button, "type")) === "WHATSAPP_MESSAGE" &&
        metaText(valueAt(button, "value", "app_destination")) === "WHATSAPP",
      ownChanges: ownChangesOf(creative),
      besideOthers: metaText(valueAt(creative, "contextual_multi_ads", "enroll_status")) === "OPT_IN",
    },
  ];
}

/**
 * A campaign read back, with its ad sets and ads. Throws, with Meta's words where it gave some, when the answer names
 * no campaign: nothing is compared against an answer that is not one.
 */
export function parseMetaCampaignHeld(json: unknown, currency: string): MetaCampaignHeld {
  const campaign = metaObject(json);
  const id = idOrNull(valueAt(campaign, "id"));
  if (!campaign || id === null) throw new Error(metaErrorOf(json)?.message ?? "Meta did not describe the campaign");
  return {
    id,
    name: metaText(valueAt(campaign, "name")).slice(0, 500) || id,
    accountId: idOrNull(valueAt(campaign, "account_id")),
    paused: switchedOff(campaign),
    state: metaText(valueAt(campaign, "effective_status")).slice(0, 100) || "UNKNOWN",
    objective: textKept(valueAt(campaign, "objective"), 100),
    declared: wordList(valueAt(campaign, "special_ad_categories")).filter((kind) => kind !== "NONE"),
    sets: edgeRows(valueAt(campaign, "adsets")).flatMap((row) => adSetOf(row, currency)),
    ads: edgeRows(valueAt(campaign, "ads")).flatMap(adHeld),
  };
}

/* ------------------------------------------------------------ removal */

/**
 * A campaign removed: Meta's DELETE on it, which takes nothing and answers `success` (its campaign reference, read on
 * 20 November 2026). The paused-ad check removes so what it made and could not finish, and one an earlier check left.
 */
export function metaCampaignRemoveRequest(token: string, appSecret: string, campaignId: string): MetaRequest {
  if (!isMetaId(campaignId)) throw new Error("Meta's id for the campaign is not one");
  return { url: metaGraphUrl(campaignId, metaProofQuery(token, appSecret)), method: "DELETE" };
}

/**
 * One ad read by its id, with its creative whole. An ad whose campaign was removed is read only so: Meta keeps a removed
 * object's details for its id, never under its removed parent (its page on an ad object's status, read 20 November).
 */
export function metaAdReadBackRequest(token: string, appSecret: string, adId: string): MetaRequest {
  if (!isMetaId(adId)) throw new Error("Meta's id for the ad is not one");
  return { url: metaGraphUrl(adId, { fields: AD_FIELDS, ...metaProofQuery(token, appSecret) }), method: "GET" };
}

/** One ad read back by its id. Throws, with Meta's words where it gave some, when the answer names no ad. */
export function parseMetaAdHeld(json: unknown): MetaAdHeld {
  const [ad] = adHeld(json);
  if (!ad) throw new Error(metaErrorOf(json)?.message ?? "Meta did not describe the ad");
  return ad;
}

/** A creative removed: Meta's DELETE on it, which answers `success` (its creative reference, read on 20 November). */
export function metaCreativeRemoveRequest(token: string, appSecret: string, creativeId: string): MetaRequest {
  if (!isMetaId(creativeId)) throw new Error("Meta's id for the creative is not one");
  return { url: metaGraphUrl(creativeId, metaProofQuery(token, appSecret)), method: "DELETE" };
}

/** Whether Meta says a removal took: its answer's `success`, and nothing else. */
export function parseMetaRemoved(json: unknown): boolean {
  return valueAt(metaObject(json), "success") === true;
}
