/**
 * What Meta says of an owner's ad account and the Page its ads run as: asked with the business's own sign-in, read into
 * the shape the account's row keeps (decision 0049, step P1). Connect asks it once for each account a sign-in shared;
 * the card's "Chanlytics looks again" and every read on a clock ask it for the one connected.
 *
 * Each call is one of Meta's few for that account, so nothing is asked twice, and what a refusal was is handed back
 * named (channels MetaAdsFault) with Meta's own words beside it for the log: a caller says it in words of its own.
 */
import {
  callMetaAds,
  metaAdAccountRequest,
  metaAssignedAdAccountsRequest,
  metaAssignedPagesRequest,
  metaPageRequest,
  metaPromotedPagesRequest,
  parseMetaAdAccount,
  parseMetaAssignedAdAccounts,
  parseMetaPage,
  parseMetaPageIds,
  type MetaAdAccount,
  type MetaAdsAnswer,
  type MetaAdsFault,
  type MetaPage,
  type MetaUsage,
} from "@chanlytics/channels/ads";
import type { AdStanding, MetaAdConfig } from "@chanlytics/contracts";
import type { logger } from "../shared/log.js";

type Log = ReturnType<typeof logger>;

/** A business's sign-in, as every call here carries it. */
export interface MetaSignIn {
  token: string;
  appSecret: string;
}

/** What one question of Meta came to: the answer read, or what the refusal was. */
export type Asked<T> =
  | { ok: true; value: T; usage: MetaUsage | null }
  | { ok: false; fault: MetaAdsFault; said: string; usage: MetaUsage | null };

/** One question of Meta, read by its parser. An answer the parser cannot read is a refusal like any other. */
export async function askMetaAds<T>(
  log: Log,
  at: string,
  call: Promise<MetaAdsAnswer>,
  parse: (json: unknown) => T,
): Promise<Asked<T>> {
  const answer = await call;
  if (answer.fault !== null) {
    log.info("ads_meta_refused", { at, fault: answer.fault, status: answer.status, said: answer.said });
    return { ok: false, fault: answer.fault, said: answer.said ?? "", usage: answer.usage };
  }
  try {
    return { ok: true, value: parse(answer.json), usage: answer.usage };
  } catch (failure) {
    const said = failure instanceof Error ? failure.message : String(failure);
    log.info("ads_meta_refused", { at, fault: "refused", status: answer.status, said: said.slice(0, 300) });
    return { ok: false, fault: "refused", said, usage: answer.usage };
  }
}

/** The most accounts and Pages of one sign-in that are read: Meta's own window shares one of each for most owners. */
const SHARED_MAX = 10;

/**
 * The ids a sign-in reaches: the ones its own description named, or, where it named none, the list Meta keeps of what
 * the business shared. Null where Meta would not give that list, said in the log: not knowing is not "none shared".
 */
export async function sharedIds(
  log: Log,
  signIn: MetaSignIn,
  named: readonly string[],
  what: "accounts" | "pages",
): Promise<string[] | null> {
  if (named.length > 0) return named.slice(0, SHARED_MAX);
  const { token, appSecret } = signIn;
  const listed =
    what === "accounts"
      ? await askMetaAds(
          log,
          "assigned_accounts",
          callMetaAds(metaAssignedAdAccountsRequest(token, appSecret)),
          parseMetaAssignedAdAccounts,
        )
      : await askMetaAds(
          log,
          "assigned_pages",
          callMetaAds(metaAssignedPagesRequest(token, appSecret)),
          parseMetaPageIds,
        );
  return listed.ok ? listed.value.slice(0, SHARED_MAX) : null;
}

/** One ad account, as Meta describes it now. */
export const readMetaAccount = (log: Log, signIn: MetaSignIn, accountId: string): Promise<Asked<MetaAdAccount>> =>
  askMetaAds(
    log,
    "account",
    callMetaAds(metaAdAccountRequest(signIn.token, signIn.appSecret, accountId)),
    parseMetaAdAccount,
  );

/** Whether a sign-in may read the Instagram account a Page is linked to. */
export const readsInstagram = (scopes: readonly string[]): boolean => scopes.includes("instagram_basic");

/** One Page, as Meta describes it now: its Instagram account too, where the sign-in may read it. */
export const readMetaPage = (
  log: Log,
  signIn: MetaSignIn,
  page: { id: string; instagram: boolean },
): Promise<Asked<MetaPage>> =>
  askMetaAds(log, "page", callMetaAds(metaPageRequest(signIn.token, signIn.appSecret, page)), parseMetaPage);

/** Whether a Page's ads have run from an ad account. A list Meta would not give is read as no. */
export async function runsPage(log: Log, signIn: MetaSignIn, accountId: string, pageId: string): Promise<boolean> {
  const promoted = await askMetaAds(
    log,
    "promoted_pages",
    callMetaAds(metaPromotedPagesRequest(signIn.token, signIn.appSecret, accountId)),
    parseMetaPageIds,
  );
  return promoted.ok && promoted.value.includes(pageId);
}

/** `ad_accounts.standing` from what Meta said of the account. A standing Chanlytics does not know is left unsaid. */
export const standingOf = (account: MetaAdAccount): AdStanding => ({
  ...(account.standing ? { account: account.standing } : {}),
  funding: account.funded ? "ok" : "none",
});

/**
 * The part of `ad_accounts.config` an account's own answer holds. Not the business: that is the sign-in's, kept at
 * Connect, and a read writes its config key by key, so it stands.
 */
export const accountConfigOf = (
  account: MetaAdAccount,
): Pick<MetaAdConfig, "spend_limit_minor" | "min_daily_minor"> => ({
  spend_limit_minor: account.spendLimitMinor,
  min_daily_minor: account.minDailyMinor,
});

/** The part of `ad_accounts.config` a Page's answer holds; every part null where no Page was picked. */
export const pageConfigOf = (
  page: MetaPage | null,
): Pick<MetaAdConfig, "page_id" | "page_name" | "page_whatsapp" | "instagram_handle"> => ({
  page_id: page?.id ?? null,
  page_name: page?.name ?? null,
  page_whatsapp: page?.whatsapp ?? null,
  instagram_handle: page?.instagram ?? null,
});
