/**
 * What the demo's presses on an ad account do to the account (MOCKUP, until the wiring lane reads and writes real ones): the
 * Ads page's fixtures are the starting accounts (`useAdsStore`, so the example chosen there is the one drawn here), and a press
 * in Settings changes a copy held by the pane, never the fixtures and never anything outside the tab. Nothing here reaches a
 * platform. A demo seam: the real pane draws no Ad accounts card, and the rows it will have come from a reader.
 */
import type { AdAccountRead, AdPlatform } from "@chanlytics/contracts";
import { EXAMPLE_READS } from "../../campaigns/ads/examples";
import { accountChecks, notConnected } from "../../campaigns/ads/sample";

/** The zone an account in a currency keeps, where it is not the studio's: a pound account is kept in London. */
const ZONE_OF: Readonly<Record<string, string>> = { GBP: "Europe/London" };

/** The owner's other Meta accounts, as the Ads page's "Choosing an ad account" example lists them. */
const otherMetaAccounts = (): AdAccountRead["choices"] =>
  EXAMPLE_READS.choose().accounts.find((a) => a.platform === "meta")?.choices ?? [];

/**
 * A connected Meta account with nothing to change to is offered the owner's other accounts, itself first, so Change account
 * can be tried; one the example already gives choices (or any other platform's) is left as it is.
 */
export function withChoices(account: AdAccountRead): AdAccountRead {
  if (account.platform !== "meta" || account.status !== "connected" || account.choices.length > 0) return account;
  if (account.externalId === null || account.name === null) return account;
  const here = { externalId: account.externalId, name: account.name, currency: account.currency };
  const others = otherMetaAccounts().filter((c) => c.name !== account.name);
  return { ...account, choices: [here, ...others] };
}

/** The account as Disconnect leaves it: connected to nothing. */
export const disconnected = (platform: AdPlatform): AdAccountRead => notConnected(platform);

/**
 * The account using another of its choices, read as of `readAt`, with every check met (a mock does not read a platform: the real
 * account's checks are the platform's). Choosing the one already in use changes nothing.
 */
export function usingAccount(account: AdAccountRead, externalId: string, readAt: string): AdAccountRead {
  const choice = account.choices.find((c) => c.externalId === externalId);
  if (!choice || (account.status === "connected" && choice.externalId === account.externalId)) return account;
  return {
    ...account,
    status: "connected",
    name: choice.name,
    externalId: choice.externalId,
    currency: choice.currency,
    timezone: ZONE_OF[choice.currency] ?? account.timezone,
    checks: accountChecks(account.platform),
    readAt,
    read: "ok",
  };
}
