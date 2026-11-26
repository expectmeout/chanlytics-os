/**
 * Every sentence the ad account's card says (page-only): where the connection stands, the one thing missing with its
 * one act, the one question, the checks and the WhatsApp line. The canvas "Ads: connect, and what Meta asks for"
 * settled them (boards Flow, Step2 and PhAds), and docs/words.md is the rule they follow. Words only: card-model.ts
 * decides which.
 *
 * A problem says what happened, whether it mends itself, and the one thing to do. Meta is named, since the owner fixes
 * each of these in Meta.
 */
import type { AdAccountCard, AdCardCheckId } from "@chanlytics/contracts";

export const CARD = {
  name: "Facebook and Instagram",
  /**
   * The card's name in Settings › Connections, where it sits under the Meta row of Instagram's messages: said as the
   * ads, so the two are never read as one connection. On the Ads page the page already says it is ads.
   */
  inConnections: "Facebook and Instagram ads",
  notConnected: "Not connected",
  checking: "Checking",
  connected: "Connected",
  question: "One question",
  signedOut: "Signed out",
  /** The caret's name, for a screen reader: what the card opens to. */
  caret: "Connected. Change the ad account or the Page, or disconnect",
  /** What connecting does, said before the press. */
  does: "Chanlytics reads your ads and their cost, and pauses one when you press it. It makes an ad only when you press Turn on.",
  charges: "Meta charges your card, never Chanlytics.",
  ownerOnly: "Only the owner can connect an ad account.",
  notHere: "Connecting an ad account isn't available in this workspace yet.",
  checkingLine: "A few seconds. It goes on by itself.",
  /** The account's facts, a row each (Ruben, 25 Nov 2026: the opened card says what is which, and nothing more). */
  metaCharges: "Ad account",
  runsAs: "Page",
  limit: "Spending limit",
  noLimit: "None",
  setLimit: "Set in Meta",
  noPage: "No Page yet",
  ready: (ok: number, of: number) => `${ok} of ${of} ready`,
  /** The opened card's one line where every check is met. */
  allReady: "Ready to run ads",
  account: (name: string, currency: string) => `${name} · ${currency}`,
  connectedOn: (day: string) => `Connected ${day}`,
  /** The opened card's quiet line: what needs no check, and the Instagram account, which stops nothing. */
  needsOnly: "Reading your ads and Pause need only the connection.",
  noInstagram: "No Instagram account is linked to your Page, and nothing here stops for it.",
  instagram: (handle: string) => `Your Page is linked to @${handle} on Instagram.`,
  change: "Change account or Page",
  disconnect: "Disconnect",
  couldntUpdate: (when: string) => `Couldn't update · Updated ${when}`,
} as const;

/** The coral button, by where the connection stands. */
export const CONNECT = { connect: "Connect", again: "Connect again" } as const;

/** What each check is called on the card. */
export const CHECK: Record<AdCardCheckId, { label: string }> = {
  "account-active": { label: "Ad account is active" },
  payment: { label: "Payment method in Meta" },
  "page-linked": { label: "Page" },
};

/**
 * Where the people an ad brings reach the business, as the opened card's last rows: the number AI answers on WhatsApp,
 * with what is known of the Page's link to it (Meta shares it only when an ad is made: whatsAppLine), and the Page's
 * Instagram account where Chanlytics may read it.
 */
export const ACCOUNT_REACH = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  linked: "Linked to your Page",
  metaChecks: "Meta checks it's linked when an ad is made",
  noNumber: "None yet",
  connectFirst: "Connect one before making an ad",
  noInstagram: "None linked",
} as const;

/**
 * The Page's link to the number AI answers: a quiet line under the checks, never one of them, since Meta shares a
 * Page's WhatsApp numbers only with an app holding its Page Public Content or Metadata Access, and so no count that
 * held it could ever be finished. Meta's own check of an ad settles it when one is made. `number` is AI's, as dialled.
 */
export function whatsAppLine(link: AdAccountCard["whatsapp_link"], number: string | null): string {
  if (link === "no_number" || number === null)
    return "AI doesn't answer a WhatsApp number yet, and an ad opens a WhatsApp chat. Connect one before making an ad.";
  if (link === "ai_number") return `Your Page is linked to ${number}, the number AI answers.`;
  return `Meta doesn't share whether your Page is linked to ${number}, the number AI answers. Meta checks it when an ad is made.`;
}

/** One thing missing or one stop: what happened, whether it mends itself or what it stops, and its one act. */
export interface NeedWords {
  title: string;
  line: string;
  act: string | null;
}

const LOOKS_AGAIN = "Chanlytics looks again when you come back.";

/** A check that is not met, as the card says it. */
export function needOf(id: AdCardCheckId): NeedWords {
  const needs: Record<AdCardCheckId, NeedWords> = {
    "account-active": {
      title: "Meta has this ad account turned off",
      line: "Only Meta can turn it back on. Its Account Quality page says why, and takes a request to look again.",
      act: "Open Meta",
    },
    payment: {
      title: "Meta has no card on file for this ad account",
      line: `No ad can be turned on until it does. ${LOOKS_AGAIN}`,
      act: "Add it in Meta",
    },
    "page-linked": {
      title: "Meta shared no Page",
      line: "An ad runs as your Page. Connect again and tick your Page when Meta asks.",
      act: null,
    },
  };
  return needs[id];
}

/** A payment Meta could not take: the account still stands, and no ad runs until it is paid. */
export const UNSETTLED: NeedWords = {
  title: "Meta couldn't charge this ad account's card",
  line: `No ad runs until it is paid. ${LOOKS_AGAIN}`,
  act: "Pay it in Meta",
};

/**
 * The sign-in may read the account and not change it: what Meta grants a business while it has approved Chanlytics to
 * read ads and not yet to change them (the Ads plan's step 3, between its two submissions). Nothing the owner does
 * mends it, so there is no act: Connect again would ask the same and get the same.
 */
export const NOT_ALLOWED: NeedWords = {
  title: "Chanlytics can show these ads, not change them yet",
  line: "Meta hasn't approved Chanlytics to pause or make ads yet. Your ads and what they cost show here meanwhile.",
  act: null,
};

/** What came back from Meta's window when nothing was connected, by the word the callback said. */
const STILL_AT_TOP = "Connect is still at the top.";
export const OUTCOME: Readonly<Record<string, NeedWords>> = {
  closed: {
    title: "Nothing was connected",
    line: `Meta's window closed before it finished. Nothing was shared and nothing changed. ${STILL_AT_TOP}`,
    act: null,
  },
  no_account: {
    title: "Meta shared no ad account",
    line: "Ads run from an ad account: tick yours when Meta asks, or make one in Meta for free.",
    act: "Make one in Meta",
  },
  accounts_unreadable: {
    title: "Couldn't read your ad account",
    line: "Meta shared it, but didn't let Chanlytics read it, so nothing was kept. Connect again in a few minutes.",
    act: "Connect again",
  },
  state_expired: {
    title: "Connect took too long",
    line: "Nothing was kept here, and what you set up in Meta is still there. Connect again to finish.",
    act: "Connect again",
  },
  ad_account_taken: {
    title: "This ad account is connected to another workspace",
    line: "An ad account works with one Chanlytics workspace at a time. Disconnect it there first, or use another.",
    act: "Use another ad account",
  },
  scope_missing: {
    title: "Meta didn't share your ads",
    line: `Chanlytics reads your ads only where Meta is told it may. Leave it ticked when Meta asks. ${STILL_AT_TOP}`,
    act: null,
  },
  not_owner: { title: "Nothing was connected", line: CARD.ownerOnly, act: null },
  meta_off: { title: "Nothing was connected", line: CARD.notHere, act: null },
};

/** Any other outcome: nothing changed, and Connect is still there. Never a code. */
export const OUTCOME_OTHER: NeedWords = {
  title: "Couldn't connect",
  line: `Nothing was shared and nothing changed. ${STILL_AT_TOP}`,
  act: null,
};

/** The one question: which of two ad accounts the ads run from. */
export const QUESTION = {
  title: (count: number) => `${count === 2 ? "Two" : count} ad accounts could run your ads`,
  group: "Ad account",
  runsPage: "Your Page's ads run from it",
  noPageAds: "Your Page's ads haven't run from it",
  press: (name: string) => `Use ${name}`,
} as const;

/** Where each act opens Meta. Each is Meta's own page for the thing; the account's id narrows it where Meta takes one. */
export const META_DOOR = {
  /**
   * Where Meta says why it turned an ad account off, and where its review is asked for: the account's own page in
   * Business Support Home where both ids are known, else the general one. Seen on one account on 19 November 2026,
   * signed in as a person with access to its portfolio: Meta's own link from the overview opened this path, and the path
   * with only `business_id` opened the same account again once it was lifted. `accountquality` lands on the overview.
   */
  quality: (businessId: string | null, accountId: string | null) =>
    businessId && accountId
      ? `https://business.facebook.com/business-support-home/${encodeURIComponent(businessId)}/${encodeURIComponent(accountId)}/?business_id=${encodeURIComponent(businessId)}`
      : "https://business.facebook.com/accountquality",
  billing: (accountId: string | null) =>
    accountId === null
      ? "https://business.facebook.com/billing_hub/payment_settings"
      : `https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(accountId)}`,
  limit: (accountId: string | null) =>
    accountId === null
      ? "https://business.facebook.com/billing_hub/payment_settings"
      : `https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(accountId)}`,
  accounts: "https://business.facebook.com/latest/settings/ad_accounts",
} as const;

const adsWord = (n: number): string => (n === 1 ? "1 ad" : `${n} ads`);

/** Disconnect, from the card's caret (the Ads plan's 4.9, as the canvas draws its screens). */
export const DISCONNECT = {
  title: "Disconnect Facebook and Instagram?",
  /** What is left on, before the question: the ads running, the ads Meta is still checking, or both. */
  on: (running: readonly string[], checking: readonly string[]) => {
    const runs = running.length === 1 ? `${running[0]} is running` : `${adsWord(running.length)} are running`;
    const waits = `Meta is still checking ${checking.length === 1 ? checking[0] : adsWord(checking.length)}`;
    if (checking.length === 0) return `${runs}.`;
    return running.length === 0 ? `${waits}.` : `${runs}, and ${waits}.`;
  },
  /** What pausing first does: a running ad stops, and one Meta is checking never starts. */
  pauseFirst: (running: number, checking: number) => {
    const many = running + checking > 1;
    if (checking === 0)
      return many
        ? "Pause them first and they stop. Meta still bills what they already showed."
        : "Pause it first and it stops. Meta still bills what it already showed.";
    if (running === 0)
      return many
        ? "Pause them first and they won't start when Meta approves them."
        : "Pause it first and it won't start when Meta approves it.";
    return "Pause them first: what is running stops, and what Meta approves won't start. Meta still bills what it already showed.";
  },
  stops: "Chanlytics stops reading your ads and can't make new ones.",
  pauseAndGo: (n: number) => `Pause ${adsWord(n)} and disconnect`,
  go: "Disconnect",
  keep: "Keep it connected",
  without: "Disconnect without pausing",
  leaveTitle: (running: number, checking: number) => {
    const one = running + checking === 1;
    if (checking === 0) return one ? "Disconnect and leave it running?" : "Disconnect and leave them running?";
    return one ? "Disconnect and leave it on?" : "Disconnect and leave them on?";
  },
  /** What stays on after a disconnect that pauses nothing: what runs keeps running, what Meta approves starts. */
  staysOn: (running: readonly string[], checking: readonly string[]) => {
    if (checking.length === 0)
      return running.length === 1
        ? `${running[0]} keeps running and Meta keeps charging`
        : `${adsWord(running.length)} keep running and Meta keeps charging`;
    if (running.length > 0)
      return `${adsWord(running.length + checking.length)} stay on: Meta keeps charging for what runs, and what it approves starts`;
    return checking.length === 1
      ? `${checking[0]} starts when Meta approves it, and Meta charges while it runs`
      : `${adsWord(checking.length)} start when Meta approves them, and Meta charges while they run`;
  },
  onlyInMeta: (n: number) =>
    n === 1
      ? "After this it can only be stopped in Meta. It stays listed here as Left in Meta."
      : "After this they can only be stopped in Meta. They stay listed here as Left in Meta.",
  notConfirmed: "Meta didn't confirm the pause.",
  /** Signed out by Meta, nothing can be paused from here: said where a pause would have been offered. */
  cantPause: "Chanlytics is signed out of Meta, so it can't pause anything first.",
  anyway: "Disconnect anyway",
  done: "Disconnected. Chanlytics no longer reads your ads.",
  /** Where the owner removes Chanlytics at Meta themselves: said on the card once the account is let go. */
  removeAtMeta:
    "To remove Chanlytics at Meta too, open Business settings in Meta, then Integrations, then Connected apps.",
  failed: "Couldn't disconnect just now, and nothing was changed. Try again.",
} as const;
