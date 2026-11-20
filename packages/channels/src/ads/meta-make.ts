/**
 * Meta's ads wire, the making part (decision 0050, step P2; the Ads plan's step 4): the requests that make an ad which
 * opens WhatsApp. Four things, in the order Meta takes them: the campaign, the ad set under it (who sees the ad, where,
 * the total and its end), the creative (the picture and the words) and the ad that joins a creative to the ad set. An
 * ad an owner makes here is three ads at Meta, one for each version of its words, under one ad set and one total:
 * Meta's own way to put several texts in one ad shows a headline with a text nobody approved together.
 *
 * Each request is built by a pure function, so the tests run it without a network. What this module holds to:
 *
 *  - Every make is PAUSED. Nothing made here can show before a later, separate switch.
 *  - Every call carries the token's proof, in its body beside the token and never in its address.
 *  - Every make has its dry-run form (`validate_only`): Meta runs its rules and makes nothing. The ad's also asks for
 *    Meta's own look at the words and the picture. A dry run names what sits above it, so that must exist first.
 *  - A real make carries a key of the sender's own. Sent again with the same key inside seven days, Meta answers with
 *    what the first made. A dry run carries none, as Meta's page asks.
 *  - Money goes out in Meta's own units, converted where the wire is known (meta-account.ts), exact or not at all.
 *  - Where an ad shows is named, so Meta adds no place by itself, and Meta's own changes to the picture and the words
 *    are each switched off by name.
 *
 * Read on Meta's own pages on 19 November 2026; what each showed is in docs/plans/2026-11-18-ads-meta-checks.md.
 * Nothing here has been sent to Meta: what an account answers is seen at the paused-ad check.
 */
import { META_GRAPH, metaProofQuery } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { isMetaId, metaAccountPath, minorToMetaUnits } from "./meta-account";

const MAKE_KEY = /^[A-Za-z0-9_-]{1,128}$/;

/** How a make is sent: as Meta's dry run, which makes nothing, or for real under a key that makes it safe to repeat. */
export type MetaMakeHow = { dryRun: true } | { key: string };

const metaIdOf = (id: string, label: string): string => {
  if (!isMetaId(id)) throw new Error(`Meta's id for ${label} is not one`);
  return id;
};
const namedAs = (name: string, label: string): string => {
  const kept = name.trim();
  if (!kept || kept.length > 400) throw new Error(`${label} needs a name of at most 400 characters`);
  return kept;
};

/**
 * One make, as the wire sends it: a form body with the token and its proof, the dry run's option where it is one, and
 * the key in its header where it is not.
 */
function makeRequest(
  edge: string,
  params: Record<string, string>,
  sign: { token: string; appSecret: string },
  how: MetaMakeHow & { options?: readonly string[] },
): MetaRequest {
  const dry = "dryRun" in how;
  if (!dry && !MAKE_KEY.test(how.key))
    throw new Error("a make's key is 1 to 128 letters, digits, hyphens or underscores");
  const body = new URLSearchParams({
    ...params,
    ...(dry ? { execution_options: JSON.stringify(how.options ?? ["validate_only"]) } : {}),
    ...metaProofQuery(sign.token, sign.appSecret),
  }).toString();
  return {
    url: `${META_GRAPH}/${edge}`,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(dry ? {} : { "X-Client-Idempotent-Key": how.key }),
    },
    body,
  };
}

/* ------------------------------------------------------------- the campaign */

/** The campaign an ad made here gets to itself, so its total is never shared with an ad made elsewhere. */
export interface MetaCampaignAsk {
  accountId: string;
  /** Its name at Meta, tagged by the caller so it can be found again (decision 0050). */
  name: string;
}

/**
 * The campaign: an ad that opens a chat (Meta's Engagement objective, which looks for conversations), bought at
 * auction, declared as no special kind. A declared kind (a job, housing, financial products, politics, gambling) is not
 * made here in the first version (the plan's G7): it would also have to name its country, and Meta then fixes the ages
 * and refuses a small area.
 */
export function metaCampaignRequest(
  token: string,
  appSecret: string,
  ask: MetaCampaignAsk,
  how: MetaMakeHow,
): MetaRequest {
  return makeRequest(
    `${metaAccountPath(ask.accountId)}/campaigns`,
    {
      name: namedAs(ask.name, "a campaign"),
      objective: "OUTCOME_ENGAGEMENT",
      buying_type: "AUCTION",
      status: "PAUSED",
      special_ad_categories: "[]",
      // The budget sits on the ad set: nothing is shared between ad sets, and Meta's own example says so by name.
      is_adset_budget_sharing_enabled: "false",
    },
    { token, appSecret },
    how,
  );
}

/* --------------------------------------------------------------- the ad set */

/** The least and the most Meta takes for a circle around a point, in miles (its targeting page). */
export const META_MILES = { least: 0.63, most: 50 } as const;

/** The youngest person an ad made here is shown to. Adults only, always (the plan's 4.6). */
const ADULT = 18;

/**
 * Where an ad made here shows: the feed, stories and Reels, on Facebook, and the same on Instagram where the creative
 * names an Instagram account. Named, since left unnamed Meta uses every place it has and adds new ones by itself.
 * WhatsApp Status, Messenger, Threads and other apps are not named, so the ad is not shown there.
 */
const FACEBOOK_POSITIONS = ["feed", "story", "facebook_reels"] as const;
const INSTAGRAM_POSITIONS = ["stream", "story", "reels"] as const;

/** The centre of the area: a street address Meta places itself, or a point. */
export type MetaAreaCentre = { address: string } | { latitude: number; longitude: number };

/** The ad set: who sees the ad and where, what it opens, the total and when it ends. */
export interface MetaAdSetAsk {
  accountId: string;
  campaignId: string;
  name: string;
  /** The account's currency, and the total the owner approved in its ISO minor units. */
  currency: string;
  totalMinor: number;
  /** When it may start, as an ISO moment; absent for at once. And when it ends, which a total must have. */
  startsAt?: string;
  endsAt: string;
  /** The Page the ad runs as, and the WhatsApp number it opens, digits only, where one is kept. */
  pageId: string;
  whatsappNumber: string | null;
  centre: MetaAreaCentre;
  miles: number;
  /** Whether the ads under it name an Instagram account: Instagram's places are asked for only then. */
  instagram: boolean;
}

const momentSent = (iso: string, label: string): string => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`${label} is not a moment`);
  return new Date(ms).toISOString();
};

function centreOf(centre: MetaAreaCentre): Record<string, string | number> {
  if ("address" in centre) {
    const address = centre.address.trim();
    if (!address || address.length > 500) throw new Error("the area needs a street address");
    return { address_string: address };
  }
  const { latitude, longitude } = centre;
  if (!(Math.abs(latitude) <= 90) || !(Math.abs(longitude) <= 180)) throw new Error("the area's point is not one");
  return { latitude, longitude };
}

/** Who sees it: adults in a circle around the business, on the places named, with Meta's automatic audience on. */
function targetingOf(ask: Pick<MetaAdSetAsk, "centre" | "miles" | "instagram">): Record<string, unknown> {
  if (!(ask.miles >= META_MILES.least && ask.miles <= META_MILES.most))
    throw new Error(`Meta takes a circle of ${META_MILES.least} to ${META_MILES.most} miles`);
  return {
    age_min: ADULT,
    geo_locations: {
      custom_locations: [{ ...centreOf(ask.centre), radius: ask.miles, distance_unit: "mile" }],
      // The only choice Meta offers: people who live in the circle or were in it lately.
      location_types: ["home", "recent"],
    },
    // Since v23 Meta must be told. On, it may look past what it was pointed at, and never past the area or the age.
    targeting_automation: { advantage_audience: 1 },
    publisher_platforms: ask.instagram ? ["facebook", "instagram"] : ["facebook"],
    facebook_positions: FACEBOOK_POSITIONS,
    ...(ask.instagram ? { instagram_positions: INSTAGRAM_POSITIONS } : {}),
  };
}

/**
 * The ad set: it opens WhatsApp, looks for conversations, is billed as it is shown, and holds a total with its end,
 * which is what makes "up to" true at Meta (decision 0050, call 4). Throws where the total is one Meta cannot hold
 * exact, or it would end before it starts: a request that would be refused, or say another amount, is never built.
 */
export function metaAdSetRequest(token: string, appSecret: string, ask: MetaAdSetAsk, how: MetaMakeHow): MetaRequest {
  const total = minorToMetaUnits(ask.totalMinor, ask.currency);
  if (total === null) throw new Error("the total is not an amount Meta can hold exact in this currency");
  const endsAt = momentSent(ask.endsAt, "the end");
  const startsAt = ask.startsAt === undefined ? null : momentSent(ask.startsAt, "the start");
  if (startsAt !== null && startsAt >= endsAt) throw new Error("the end comes after the start");
  const number = ask.whatsappNumber?.replace(/\D/g, "") ?? "";
  return makeRequest(
    `${metaAccountPath(ask.accountId)}/adsets`,
    {
      name: namedAs(ask.name, "an ad set"),
      campaign_id: metaIdOf(ask.campaignId, "the campaign"),
      status: "PAUSED",
      destination_type: "WHATSAPP",
      optimization_goal: "CONVERSATIONS",
      billing_event: "IMPRESSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      lifetime_budget: String(total),
      ...(startsAt === null ? {} : { start_time: startsAt }),
      end_time: endsAt,
      promoted_object: JSON.stringify({
        page_id: metaIdOf(ask.pageId, "the Page"),
        ...(number ? { whatsapp_phone_number: number } : {}),
      }),
      targeting: JSON.stringify(targetingOf(ask)),
    },
    { token, appSecret },
    how,
  );
}

/* ------------------------------------------------------------- the creative */

/** Where a tap on the ad goes: Meta's own address for a WhatsApp chat, as its guide for these ads writes it. */
const WHATSAPP_LINK = "https://api.whatsapp.com/send";

/**
 * Meta's own changes to a picture and its words, each a switch of its own since the one switch for all of them was
 * retired (Meta's Advantage+ creative page, 19 November 2026). An ad made here switches every one off by name, and
 * what Meta kept is read back (meta-made.ts) before anything is turned on.
 */
export const META_OWN_CHANGES = [
  "adapt_to_placement",
  "add_text_overlay",
  "creative_stickers",
  "description_automation",
  "enhance_cta",
  "image_animation",
  "image_background_gen",
  "image_brightness_and_contrast",
  "image_templates",
  "image_text_translation",
  "image_touchups",
  "image_uncrop",
  "inline_comment",
  "media_type_automation",
  "pac_relaxation",
  "product_extensions",
  "reveal_details_over_time",
  "text_optimizations",
  "text_translation",
  "translate_voiceover",
  "video_auto_crop",
  "video_filtering",
  "video_uncrop",
] as const;

/** What the ad shows: a picture from the account's library, or a video with the picture shown before it plays. */
export type MetaCreativePicture =
  { kind: "image"; hash: string } | { kind: "video"; videoId: string; thumbnailHash: string };

/** One version of an ad: its picture and its words, as the Page says them. */
export interface MetaCreativeAsk {
  name: string;
  pageId: string;
  /** The Instagram account the Page is linked to; null where none is known, and the ad then shows on Facebook alone. */
  instagramUserId: string | null;
  /** The text above the picture, and the headline under it. */
  text: string;
  headline: string;
  picture: MetaCreativePicture;
}

const HASH = /^[A-Za-z0-9]{8,64}$/;
const wordsSent = (words: string, label: string, most: number): string => {
  const kept = words.trim();
  if (!kept || kept.length > most) throw new Error(`${label} is 1 to ${most} characters`);
  return kept;
};
const imageHashOf = (hash: string): string => {
  if (!HASH.test(hash)) throw new Error("the picture is not one in the account's library");
  return hash;
};

/** The button every ad made here has: it opens a WhatsApp chat with the number the ad set names. */
const whatsappButton = (link: boolean): Record<string, unknown> => ({
  type: "WHATSAPP_MESSAGE",
  value: { app_destination: "WHATSAPP", ...(link ? { link: WHATSAPP_LINK } : {}) },
});

/** The post an ad is: a picture with a link, or a video, each with its words and the button. */
function storyOf(ask: MetaCreativeAsk): Record<string, unknown> {
  // Meta's hard lengths for a text and a headline. What reads well in each place is the ad writer's to hold.
  const message = wordsSent(ask.text, "the text", 1024);
  const headline = wordsSent(ask.headline, "the headline", 255);
  if (ask.picture.kind === "image")
    return {
      link_data: {
        link: WHATSAPP_LINK,
        message,
        name: headline,
        image_hash: imageHashOf(ask.picture.hash),
        call_to_action: whatsappButton(false),
      },
    };
  return {
    video_data: {
      video_id: metaIdOf(ask.picture.videoId, "the video"),
      image_hash: imageHashOf(ask.picture.thumbnailHash),
      message,
      title: headline,
      call_to_action: whatsappButton(true),
    },
  };
}

/**
 * A creative as Meta takes it, whether sent alone or inside the ad that uses it: the Page it is said as, the Instagram
 * account where one is known, the post, every one of Meta's own changes switched off, and not shown beside other
 * advertisers' ads.
 */
export function metaCreativeSpec(ask: MetaCreativeAsk): Record<string, unknown> {
  return {
    name: namedAs(ask.name, "a creative"),
    object_story_spec: {
      page_id: metaIdOf(ask.pageId, "the Page"),
      ...(ask.instagramUserId === null
        ? {}
        : { instagram_user_id: metaIdOf(ask.instagramUserId, "the Instagram account") }),
      ...storyOf(ask),
    },
    degrees_of_freedom_spec: {
      creative_features_spec: Object.fromEntries(
        META_OWN_CHANGES.map((change) => [change, { enroll_status: "OPT_OUT" }]),
      ),
    },
    contextual_multi_ads: { enroll_status: "OPT_OUT" },
  };
}

/** A creative, made alone in the account's library. Making one leaves an unpublished post on the Page. */
export function metaCreativeRequest(
  token: string,
  appSecret: string,
  ask: MetaCreativeAsk & { accountId: string },
  how: MetaMakeHow,
): MetaRequest {
  const spec = metaCreativeSpec(ask);
  return makeRequest(
    `${metaAccountPath(ask.accountId)}/adcreatives`,
    Object.fromEntries(
      Object.entries(spec).map(([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)]),
    ),
    { token, appSecret },
    how,
  );
}

/* ------------------------------------------------------------------- the ad */

/** The ad: one version, joined to the ad set. Its creative is one already made, or is made with it in one request. */
export interface MetaAdAsk {
  accountId: string;
  setId: string;
  name: string;
  creative: { id: string } | MetaCreativeAsk;
}

/**
 * The ad. Its dry run also asks for Meta's own look at the words and the picture, which Meta's page says is asked only
 * beside the dry run. An ad made paused still goes through Meta's check, then returns to paused.
 */
export function metaAdRequest(token: string, appSecret: string, ask: MetaAdAsk, how: MetaMakeHow): MetaRequest {
  const creative =
    "id" in ask.creative ? { creative_id: metaIdOf(ask.creative.id, "the creative") } : metaCreativeSpec(ask.creative);
  return makeRequest(
    `${metaAccountPath(ask.accountId)}/ads`,
    {
      name: namedAs(ask.name, "an ad"),
      adset_id: metaIdOf(ask.setId, "the ad set"),
      status: "PAUSED",
      creative: JSON.stringify(creative),
    },
    { token, appSecret },
    "dryRun" in how ? { dryRun: true, options: ["validate_only", "synchronous_ad_review"] } : how,
  );
}
