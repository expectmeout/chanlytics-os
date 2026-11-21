/**
 * Meta's ads wire, what an ad account holds besides its ads (the Ads plan's step 4): the least Meta takes a day for an
 * ad set, the Instagram accounts it can show an ad as, and the picture an ad shows, placed in the account's library.
 * Each request is built by a pure function and read by a pure parser, so the tests run them without a network; the
 * calls leave through callMetaAds (meta-call.ts), once.
 *
 * Read on Meta's own reference pages on 19 November 2026: the ad account's `minimum_budgets` (the least a day for an ad
 * set, by what it is billed for), `connected_instagram_accounts`, and `adimages` (a picture sent as its bytes, answered
 * with the hash a creative names it by). A picture is not a make that takes Meta's key for a repeat: its page lists
 * campaigns, ad sets, creatives and ads alone, and the same bytes sent twice answer the same hash.
 */
import { valueAt } from "@chanlytics/contracts";
import { META_GRAPH, metaErrorOf, metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";
import { isMetaId, metaAccountPath, metaUnitsToMinor } from "./meta-account";

/** The least an ad set billed for each showing takes a day, in its account's currency: Meta's minimum_budgets. */
export function metaMinimumBudgetsRequest(token: string, appSecret: string, accountId: string): MetaRequest {
  return {
    url: metaGraphUrl(`${metaAccountPath(accountId)}/minimum_budgets`, metaProofQuery(token, appSecret)),
    method: "GET",
  };
}

/**
 * The least a day an ad set billed for each showing takes (Meta's `min_daily_budget_imp`), in the currency's ISO minor
 * units; null where Meta's answer names none. Throws, with Meta's words where it gave some, when the answer lists nothing.
 */
export function parseMetaLeastADay(json: unknown, currency: string): number | null {
  const rows = valueAt(metaObject(json), "data");
  if (!Array.isArray(rows)) throw new Error(metaErrorOf(json)?.message ?? "Meta did not say the least it takes");
  const row = rows.map(metaObject).find((each) => metaText(valueAt(each, "currency")).toUpperCase() === currency);
  return metaUnitsToMinor(valueAt(row ?? metaObject(rows[0]), "min_daily_budget_imp"), currency);
}

/** The Instagram accounts an ad account can show an ad as. */
export function metaAccountInstagramRequest(token: string, appSecret: string, accountId: string): MetaRequest {
  return {
    url: metaGraphUrl(`${metaAccountPath(accountId)}/connected_instagram_accounts`, {
      fields: "id,username",
      limit: "10",
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

/** The Instagram accounts an ad account names, each by id. Throws, with Meta's words where it gave some, on no list. */
export function parseMetaAccountInstagram(json: unknown): { id: string; username: string | null }[] {
  const rows = valueAt(metaObject(json), "data");
  if (!Array.isArray(rows)) throw new Error(metaErrorOf(json)?.message ?? "Meta did not list the Instagram accounts");
  return rows
    .map(metaObject)
    .map((row) => ({ id: metaText(valueAt(row, "id")), username: metaText(valueAt(row, "username")) || null }))
    .filter((account) => isMetaId(account.id));
}

/** The largest picture sent to Meta here: its Ads Guide takes up to 30 MB, and a photo in Files is far under it. */
const PICTURE_MOST_BYTES = 30 * 1024 * 1024;

/** A picture placed in the ad account's library, sent as its bytes, with the token's proof in the body. */
export function metaAdImageRequest(
  token: string,
  appSecret: string,
  accountId: string,
  picture: Uint8Array,
): MetaRequest {
  if (picture.byteLength === 0 || picture.byteLength > PICTURE_MOST_BYTES)
    throw new Error("the picture is empty, or larger than Meta takes");
  return {
    url: `${META_GRAPH}/${metaAccountPath(accountId)}/adimages`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      bytes: Buffer.from(picture).toString("base64"),
      ...metaProofQuery(token, appSecret),
    }).toString(),
  };
}

/** The hash a picture is kept under in the account's library. Throws, with Meta's words where it gave some, on none. */
export function parseMetaImageHash(json: unknown): string {
  const images = metaObject(valueAt(metaObject(json), "images"));
  const first = images ? metaObject(Object.values(images)[0]) : null;
  const hash = metaText(valueAt(first, "hash"));
  if (!/^[A-Za-z0-9]{8,64}$/.test(hash)) throw new Error(metaErrorOf(json)?.message ?? "Meta did not keep the picture");
  return hash;
}

/**
 * A picture taken out of the account's library by its hash: Meta's DELETE on the account's images, which answers `success`
 * and takes only a picture no creative uses (its image reference, read on 20 November 2026).
 */
export function metaAdImageRemoveRequest(
  token: string,
  appSecret: string,
  accountId: string,
  hash: string,
): MetaRequest {
  if (!/^[A-Za-z0-9]{8,64}$/.test(hash)) throw new Error("the picture's hash is not one");
  return {
    url: metaGraphUrl(`${metaAccountPath(accountId)}/adimages`, { hash, ...metaProofQuery(token, appSecret) }),
    method: "DELETE",
  };
}
