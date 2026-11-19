/**
 * Meta's ads wire, the account's part (decision 0049, step P1): what a business's sign-in reaches, an ad account as Meta
 * describes it, and the Page its ads run as. The sign-in itself, its token and what it was granted are the one Meta
 * client's (../meta/client.ts). Every call carries the token's proof, as every call with a business's token does.
 *
 * Every request is built by a pure function and read by a pure parser, so the tests run them without a network; the
 * calls leave through callMetaAds (meta-call.ts). Read on Meta's own reference pages on 19 November 2026 (the ad
 * account, the Page, the system user, currency codes); each field is named where it is read.
 *
 * Money. Meta counts an amount in its own units for the currency, which it calls the offset: a hundredth of the
 * currency for most, the whole currency for eleven. The world's own list (ISO 4217, which every other tree reads an
 * amount by: contracts minorPerUnit) counts five of those eleven in hundredths, and two more in thousandths where Meta
 * counts hundredths. So an amount is converted here, where Meta's answer is read, and nowhere else.
 */
import { minorPerUnit, valueAt } from "@chanlytics/contracts";
import type { AdAccountStanding } from "@chanlytics/contracts";
import { metaErrorOf, metaGraphUrl, metaObject, metaProofQuery, metaText } from "../meta/client";
import type { MetaRequest } from "../meta/client";

/* ------------------------------------------------------------------- money */

/** The currencies Meta counts in whole units (its offset is 1): Meta's currency codes page, read 19 November 2026. */
const META_WHOLE_UNITS: ReadonlySet<string> = new Set([
  "CLP",
  "COP",
  "CRC",
  "HUF",
  "ISK",
  "IDR",
  "JPY",
  "KRW",
  "PYG",
  "TWD",
  "VND",
]);
const metaPerUnit = (currency: string): number => (META_WHOLE_UNITS.has(currency.toUpperCase()) ? 1 : 100);

/** A whole number of units as Meta writes one: digits in a string, or a number. Null for anything else. */
const wholeOf = (value: unknown): number | null => {
  if (typeof value === "number") return Number.isSafeInteger(value) && value >= 0 ? value : null;
  return typeof value === "string" && /^\d{1,15}$/.test(value) ? Number(value) : null;
};

/** An amount Meta gave in its own units (a budget, what is left of one, a limit), in the currency's ISO minor units. */
export function metaUnitsToMinor(amount: unknown, currency: string): number | null {
  const units = wholeOf(amount);
  return units === null ? null : Math.round((units * minorPerUnit(currency)) / metaPerUnit(currency));
}

/** An amount Meta gave as a decimal of the currency itself (what an ad spent: "12.34"), in ISO minor units. */
export function metaDecimalToMinor(amount: unknown, currency: string): number | null {
  const said = typeof amount === "number" ? String(amount) : amount;
  if (typeof said !== "string" || !/^\d{1,12}(\.\d{1,6})?$/.test(said)) return null;
  return Math.round(Number(said) * minorPerUnit(currency));
}

/* ---------------------------------------------------------------- requests */

/** Meta's id for an ad account, bare: digits alone, whether it came with its `act_` or without. */
export const metaAccountId = (id: string): string => id.replace(/^act_/, "");
const account = (id: string): string => `act_${encodeURIComponent(metaAccountId(id))}`;

const ACCOUNT_FIELDS =
  "account_id,name,currency,timezone_name,account_status,funding_source,spend_cap,min_daily_budget,business{id}";

/** One ad account as Meta describes it: its name, currency and zone, its standing, its payment method and its limit. */
export function metaAdAccountRequest(token: string, appSecret: string, accountId: string): MetaRequest {
  return {
    url: metaGraphUrl(account(accountId), { fields: ACCOUNT_FIELDS, ...metaProofQuery(token, appSecret) }),
    method: "GET",
  };
}

/** The Pages whose ads have run from an ad account: what tells the account a Page's ads run from. */
export function metaPromotedPagesRequest(token: string, appSecret: string, accountId: string): MetaRequest {
  return {
    url: metaGraphUrl(`${account(accountId)}/promote_pages`, {
      fields: "id",
      limit: "50",
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

/** The ad accounts the business shared with the app, asked only where the token's own description names none. */
export function metaAssignedAdAccountsRequest(token: string, appSecret: string): MetaRequest {
  return {
    url: metaGraphUrl("me/assigned_ad_accounts", {
      fields: "account_id",
      limit: "25",
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

/** The Pages the business shared with the app, asked only where the token's own description names none. */
export function metaAssignedPagesRequest(token: string, appSecret: string): MetaRequest {
  return {
    url: metaGraphUrl("me/assigned_pages", { fields: "id", limit: "25", ...metaProofQuery(token, appSecret) }),
    method: "GET",
  };
}

/** A Page: its name, the WhatsApp number it is linked to, and the Instagram account it is linked to. */
export function metaPageRequest(token: string, appSecret: string, pageId: string): MetaRequest {
  return {
    url: metaGraphUrl(encodeURIComponent(pageId), {
      fields: "id,name,whatsapp_number,instagram_business_account{username}",
      ...metaProofQuery(token, appSecret),
    }),
    method: "GET",
  };
}

/* ----------------------------------------------------------------- answers */

const ID = /^\d{5,32}$/;

/**
 * Meta's number for where an account stands, in Chanlytics' words (the ad account's `account_status`, read on Meta's
 * page). Meta still shows an account's ads while a payment settles (8) or in its grace period (9), so both are `grace`.
 * A number not listed here is one Chanlytics does not know: no word is kept for it, and nothing is said of it.
 */
const META_STANDING: ReadonlyMap<number, AdAccountStanding> = new Map([
  [1, "active"],
  [2, "disabled"],
  [3, "unsettled"],
  [7, "review"],
  [8, "grace"],
  [9, "grace"],
  [100, "closing"],
  [101, "closed"],
]);

/** An ad account as the row keeps it. Money is in ISO minor units of its own currency. */
export interface MetaAdAccount {
  /** Meta's id for it, bare. */
  id: string;
  name: string;
  currency: string;
  timezone: string;
  /** Null where Meta's number is one Chanlytics does not know. */
  standing: AdAccountStanding | null;
  /** Whether Meta holds a payment method for it. */
  funded: boolean;
  /** Its own spending limit at Meta; null where it has none (Meta says 0). */
  spendLimitMinor: number | null;
  minDailyMinor: number | null;
  businessId: string | null;
}

/** An ad account, read. Throws, with Meta's words where it gave some, when the answer names no account. */
export function parseMetaAdAccount(json: unknown): MetaAdAccount {
  const o = metaObject(json);
  const id = metaText(valueAt(o, "account_id"));
  const currency = metaText(valueAt(o, "currency")).toUpperCase();
  const timezone = metaText(valueAt(o, "timezone_name"));
  if (!ID.test(id) || !/^[A-Z]{3}$/.test(currency) || !timezone)
    throw new Error(metaErrorOf(json)?.message ?? "Meta did not describe the ad account");
  const status = valueAt(o, "account_status");
  const limit = metaUnitsToMinor(valueAt(o, "spend_cap"), currency);
  return {
    id,
    name: metaText(valueAt(o, "name")).slice(0, 500) || id,
    currency,
    timezone: timezone.slice(0, 100),
    standing: typeof status === "number" ? (META_STANDING.get(status) ?? null) : null,
    funded: metaText(valueAt(o, "funding_source")) !== "",
    spendLimitMinor: limit === null || limit === 0 ? null : limit,
    minDailyMinor: metaUnitsToMinor(valueAt(o, "min_daily_budget"), currency),
    businessId: metaText(valueAt(metaObject(valueAt(o, "business")), "id")) || null,
  };
}

/** The ids a list answer holds under `key`, each read as an id; a throw, with Meta's words, where it lists nothing. */
function idsOf(json: unknown, key: string, what: string): string[] {
  const data = valueAt(metaObject(json), "data");
  if (!Array.isArray(data)) throw new Error(metaErrorOf(json)?.message ?? `Meta did not list ${what}`);
  return data.map((row) => metaText(valueAt(metaObject(row), key))).filter((id) => ID.test(id));
}

/** The ad accounts a business shared, by Meta's bare id. */
export const parseMetaAssignedAdAccounts = (json: unknown): string[] => idsOf(json, "account_id", "the ad accounts");
/** The Pages a business shared, or the Pages an ad account has run ads for, by id. */
export const parseMetaPageIds = (json: unknown): string[] => idsOf(json, "id", "the Pages");

/** A Page as the row keeps it. */
export interface MetaPage {
  id: string;
  name: string;
  /** The WhatsApp number it is linked to, digits only; null where it is linked to none. */
  whatsapp: string | null;
  /** The handle of the Instagram account it is linked to; null where none. */
  instagram: string | null;
}

/** A Page, read. Throws, with Meta's words where it gave some, when the answer names no Page. */
export function parseMetaPage(json: unknown): MetaPage {
  const o = metaObject(json);
  const id = metaText(valueAt(o, "id"));
  if (!ID.test(id)) throw new Error(metaErrorOf(json)?.message ?? "Meta did not describe the Page");
  const digits = metaText(valueAt(o, "whatsapp_number")).replace(/\D/g, "");
  return {
    id,
    name: metaText(valueAt(o, "name")).slice(0, 500) || id,
    whatsapp: digits.length >= 7 && digits.length <= 15 ? digits : null,
    instagram: metaText(valueAt(metaObject(valueAt(o, "instagram_business_account")), "username")) || null,
  };
}

/** Meta's id for who a token is (`debug_token`'s `user_id`): what Meta names when a business removes the app. */
export function parseMetaTokenUser(json: unknown): string | null {
  const id = metaText(valueAt(metaObject(valueAt(metaObject(json), "data")), "user_id"));
  return ID.test(id) ? id : null;
}

/** The permissions that reach an ad account, and those that reach a Page: where a token's description names its assets. */
const ACCOUNT_SCOPES = ["ads_read", "ads_management"] as const;
const PAGE_SCOPES = ["pages_show_list", "pages_read_engagement", "pages_manage_ads"] as const;

/**
 * The ad accounts and the Pages a token reaches, as its own description names them (`granular_scopes`), each once. Empty
 * where the description names none: the sign-in then shared everything it could, and the lists are asked for.
 */
export function metaReachOf(accountsByScope: Record<string, string[]>): { accountIds: string[]; pageIds: string[] } {
  const under = (scopes: readonly string[]): string[] => [
    ...new Set(scopes.flatMap((scope) => accountsByScope[scope] ?? []).filter((id) => ID.test(id))),
  ];
  return { accountIds: under(ACCOUNT_SCOPES), pageIds: under(PAGE_SCOPES) };
}
