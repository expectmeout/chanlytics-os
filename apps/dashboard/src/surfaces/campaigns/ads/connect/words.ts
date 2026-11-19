/**
 * Every sentence the ad account's card says (page-only): where the connection stands, the one thing missing with its
 * one act, the one question, and the five checks. The canvas "Ads: connect, and what Meta asks for" settled them
 * (boards Flow, Step2 and PhAds), and docs/words.md is the rule they follow. Words only: card-model.ts decides which.
 *
 * A problem says what happened, whether it mends itself, and the one thing to do. Meta is named, since the owner fixes
 * each of these in Meta.
 */
import type { AdCardCheckId } from "@chanlytics/contracts";

export const CARD = {
  name: "Facebook and Instagram",
  notConnected: "Not connected",
  checking: "Checking",
  connected: "Connected",
  question: "One question",
  signedOut: "Signed out",
  /** The caret's name, for a screen reader: what the card opens to. */
  caret: "Connected. Change the ad account or the Page, or disconnect",
  /** What connecting does, said before the press. */
  does: "Chanlytics reads your ads and what they cost, and pauses one when you press it. It makes an ad only when you press Turn on.",
  charges: "Meta charges your card, never Chanlytics.",
  ownerOnly: "Only the owner can connect an ad account.",
  notHere: "Connecting an ad account isn't available in this workspace yet.",
  later: "Google and TikTok come later.",
  checkingLine: "A few seconds. It goes on by itself.",
  metaCharges: "Meta charges",
  runsAs: "Runs as",
  limit: "Meta's limit",
  noLimit: "None",
  setLimit: "Set one in Meta",
  noPage: "No Page yet",
  ready: (ok: number, of: number) => `${ok} of ${of} ready`,
  account: (name: string, currency: string) => `${name} · ${currency}`,
  connectedOn: (day: string) => `Connected ${day}`,
  checks: "Checks",
  neededFor: "Needed for",
  /** The opened card's quiet line: what needs no check, and the Instagram account, which stops nothing. */
  needsOnly: "Reading your ads and Pause need only the connection.",
  noInstagram: "No Instagram account is linked to your Page, and nothing here stops for it.",
  instagram: (handle: string) => `Your Page is linked to @${handle} on Instagram.`,
  change: "Change the ad account or the Page",
  disconnect: "Disconnect",
  couldntUpdate: (when: string) => `Couldn't update · Updated ${when}`,
} as const;

/** The coral button, by where the connection stands. */
export const CONNECT = { connect: "Connect", again: "Connect again" } as const;

/** What each check is called on the card, and what it is needed for. */
export const CHECK: Record<AdCardCheckId, { label: string; neededFor: string }> = {
  "account-active": { label: "Ad account is active", neededFor: "Turn on, Resume" },
  payment: { label: "Payment method in Meta", neededFor: "Turn on, Resume" },
  "page-linked": { label: "Page", neededFor: "A new ad" },
  "whatsapp-linked": { label: "WhatsApp number linked to the Page", neededFor: "A new ad" },
  "chanlytics-whatsapp": { label: "That number is the one AI answers", neededFor: "A new ad" },
};

/** One thing missing or one stop: what happened, whether it mends itself or what it stops, and its one act. */
export interface NeedWords {
  title: string;
  line: string;
  act: string | null;
}

const LOOKS_AGAIN = "Chanlytics looks again when you come back.";

/** A check that is not met, as the card says it. `aiNumber` is the number AI answers, as dialled, where it has one. */
export function needOf(id: AdCardCheckId, aiNumber: string | null): NeedWords {
  const toNumber = aiNumber === null ? "the number AI answers" : `${aiNumber}, the number AI answers`;
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
    "whatsapp-linked": {
      title: "Your Page isn't linked to your WhatsApp number",
      line: `No new ad can be made until it is linked to ${toNumber}.`,
      act: "Link them",
    },
    "chanlytics-whatsapp":
      aiNumber === null
        ? {
            title: "AI doesn't answer a WhatsApp number yet",
            line: "An ad opens a WhatsApp chat. Connect your number first, so AI answers who taps it.",
            act: "Connect WhatsApp",
          }
        : {
            title: "Your Page is linked to another WhatsApp number",
            line: `An ad would open a chat AI doesn't answer. Link the Page to ${toNumber}.`,
            act: "Link them",
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

/** The sign-in may read the account and not change it. */
export const NOT_ALLOWED: NeedWords = {
  title: "You can see this ad account, but not run ads on it",
  line: `Its admin can let you run ads, in Meta's settings. ${LOOKS_AGAIN}`,
  act: "Use another ad account",
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
    line: "Ads run from an ad account. If you have one, tick it when Meta asks. If you don't, making one in Meta is free.",
    act: "Make one in Meta",
  },
  accounts_unreadable: {
    title: "Couldn't read your ad account",
    line: "Meta shared it, but didn't let Chanlytics read it, so nothing was kept. Connect again in a few minutes.",
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
  quality: "https://business.facebook.com/accountquality",
  billing: (accountId: string | null) =>
    accountId === null
      ? "https://business.facebook.com/billing_hub/payment_settings"
      : `https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(accountId)}`,
  limit: (accountId: string | null) =>
    accountId === null
      ? "https://business.facebook.com/billing_hub/payment_settings"
      : `https://business.facebook.com/billing_hub/payment_settings?asset_id=${encodeURIComponent(accountId)}`,
  accounts: "https://business.facebook.com/latest/settings/ad_accounts",
  whatsapp: "https://business.facebook.com/latest/settings/whatsapp_account",
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
  failed: "Couldn't disconnect just now. Nothing was changed. Try again.",
} as const;
