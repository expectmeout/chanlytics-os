/**
 * Which Page and which ad account an owner meant (the Ads plan's D3): Chanlytics picks, and asks only when two ad
 * accounts could both be the one. Pure rules over what Meta listed, so the tests run them with no network.
 *
 * The Page is the one linked to the number AI answers. The ad account is the one that Page's ads have run from. Meta's
 * own window already lets the owner share one of each, so most sign-ins arrive with one and nothing here decides.
 */
import type { MetaAdAccount, MetaPage } from "@chanlytics/channels/ads";
import { samePhone } from "@chanlytics/contracts";

/**
 * The Page the ads run as: the one linked to the number AI answers, else the only one shared. With several shared and
 * none linked to that number there is no telling, and none is picked: the card's Page line says so.
 */
export function pickPage(pages: readonly MetaPage[], aiNumber: string | null): MetaPage | null {
  const linked = pages.find((page) => samePhone(page.whatsapp, aiNumber));
  if (linked) return linked;
  const [only, ...more] = pages;
  return only && more.length === 0 ? only : null;
}

/** An ad account as it was read, and whether the picked Page's ads have run from it. */
export interface AccountSeen {
  account: MetaAdAccount;
  runsPage: boolean;
}

/** The most accounts the one question draws. */
const CHOICES_MAX = 5;

/**
 * The ad account an owner meant. One that is closed, or closing, is not one to connect. Of the rest: the only one; else
 * the only one the Page's ads have run from; else the owner is asked, the likelier first.
 */
export function pickAccount(seen: readonly AccountSeen[]): { one: AccountSeen } | { ask: AccountSeen[] } | null {
  const open = seen.filter(({ account }) => account.standing !== "closed" && account.standing !== "closing");
  const [only, ...more] = open;
  if (!only) return null;
  if (more.length === 0) return { one: only };
  const [ran, ...others] = open.filter((candidate) => candidate.runsPage);
  if (ran && others.length === 0) return { one: ran };
  const likelierFirst = [...open].sort(
    (a, b) => Number(b.runsPage) - Number(a.runsPage) || a.account.name.localeCompare(b.account.name),
  );
  return { ask: likelierFirst.slice(0, CHOICES_MAX) };
}
