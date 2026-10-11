/**
 * Settings › Connections' "Ad accounts" (page-only, 11 Oct 2026; decisions 7, 8 and 9): a row for each platform an owner's
 * own ad accounts live on, with what the account is, what is ready on it, and the presses (connect, change the account,
 * disconnect), after the other rows of that pane. Words and the one fold that makes the rows; the page holds nothing a
 * sentence of this file does not say. Pure: it reads accounts and ads as the Ads page's reader returns them and knows
 * nothing of a store, a clock or a network. Ads that run on an account are counted here (`running`), because Disconnect is
 * refused while any does (decision 8); the account's own currency and time zone are the account's, shown, never changed.
 */
import { plural } from "../shared/words";
import type { Tone } from "../shell/tone";
import type { AdAccountRead, AdAccountStatus, AdCheckId, AdPlatform, AdRead, AdState } from "./ads";
import { daysBetween } from "./ads";
import { ADS_PERMISSION_WARN_DAYS, STANDING_CHECKS } from "./rules";
import { PLATFORMS, checkOk, dayOfIso, timeOf } from "./vm-base";
import { EXAMPLE, PLATFORM_OWNER, PLATFORM_WORD, checkFix, checkWords, dayWord } from "./words";
import { STANDING } from "./words-page";

// ---------------------------------------------------------------------------------------------------------------------
// Words

/** Where an owner makes and manages the ads they made themselves: what "an ad made in ..." names. */
const MANAGER: Record<AdPlatform, string> = {
  meta: "Meta Ads Manager",
  google: "Google Ads",
  tiktok: "TikTok Ads Manager",
};

/** The kit Icon names a platform's tile is drawn with: a glyph for each, never a brand's mark or colour. */
const ICON: Record<AdPlatform, string> = { meta: "globe", google: "search", tiktok: "video" };

/** `New York`: the city of an IANA zone, as `America/New_York` names it. */
const zoneCity = (zone: string): string => (zone.split("/").at(-1) ?? zone).replace(/_/g, " ");

export const CONNECT = {
  title: "Ad accounts",
  /** The card's second line while the page draws the Ads fixtures. */
  sub: EXAMPLE.note,
  off: "Not connected",
  connect: "Connect",
  disconnect: "Disconnect",
  change: "Change account",
  use: "Use this account",
  cancel: "Cancel",
  /** Not connected: what connecting does, and who bills. */
  line: (p: AdPlatform) =>
    `Chanlytics reads your ads and can make new ones. ${PLATFORM_OWNER[p]} bills you; Chanlytics never holds your ad money.`,
  /** The press of Connect in the demo: it says nothing was connected. */
  signIn: (p: AdPlatform) => `This opens ${PLATFORM_OWNER[p]}'s sign-in in the real app. Nothing was connected.`,
  /** `USD · New York time · set by the account`: the account's own, which Chanlytics follows and cannot change. */
  facts: (currency: string, zone: string) => `${currency} · ${zoneCity(zone)} time · set by the account`,
  read: (time: string) => `Read ${time}`,
  reading: "Reading now",
  readFailed: (when: string) => `Could not be read · last read ${when}`,
  ready: "What's ready",
  allReady: "all in order",
  needYou: (n: number) => `${n} ${n === 1 ? "needs" : "need"} you`,
  managerOk: "Chanlytics' access: accepted",
  managerNot: "Chanlytics' access: not accepted yet",
  /** TikTok's post permission, a day it runs until. */
  permission: (day: string) => `Post permission until ${day}`,
  /** Ads the owner made on the platform itself, shown in Ads and read-only there (decision 7). */
  adopted: (p: AdPlatform, n: number) =>
    `${plural(n, "ad")} made in ${MANAGER[p]} ${n === 1 ? "is" : "are"} shown in Ads, read-only.`,
  /** Disconnect while an ad runs is refused (decision 8). */
  refused: (n: number) => `Pause or end your ads first: ${n} ${n === 1 ? "is" : "are"} on.`,
  refusedDoor: "See your ads",
  refusedOk: "Ok",
  disconnectQ: (p: AdPlatform) => `Disconnect ${PLATFORM_WORD[p]}?`,
  disconnectDetail: "Chanlytics stops reading your ads and can't make new ones.",
  disconnectYes: "Yes, disconnect",
  disconnectNo: "Keep it connected",
  disconnected: (p: AdPlatform) => `${PLATFORM_WORD[p]} is disconnected.`,
  /** The choice of an account: its question, and the toast of choosing one. */
  which: (p: AdPlatform) => `Which ${PLATFORM_OWNER[p]} account should Chanlytics use?`,
  using: (p: AdPlatform, name: string) => `${PLATFORM_WORD[p]} now uses ${name}.`,
  /** Decision 9: the owner's setting that pauses ads, off unless chosen. */
  pause: {
    label: "Pause my ads when the way in closes",
    line: "If WhatsApp or your line stops working, Chanlytics pauses your ads instead of only telling you.",
    on: "If the way in closes, Chanlytics will pause your ads.",
    off: "If the way in closes, Chanlytics will tell you.",
  },
  /** What a role that may not press says it would have done. */
  gate: {
    connect: "connect an ad account",
    change: "change the ad account",
    disconnect: "disconnect an ad account",
    pause: "change when ads pause",
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The rows

/** One thing an account stands on: in order (a green dot), or not (an amber ring, with the step that mends it). */
export interface ReadyRowVM {
  id: AdCheckId;
  text: string;
  tone: "ok" | "warn";
  fix: string | null;
}

/** One account to choose among: its id, its name, and its currency (the platform's, never converted). */
export interface ConnectChoiceVM {
  value: string;
  label: string;
  hint: string;
}

/** One platform's row. */
export interface ConnectRowVM {
  id: AdPlatform;
  /** `Facebook and Instagram`. */
  title: string;
  /** The account's name on the platform, where one is chosen. */
  detail: string | null;
  icon: string;
  status: AdAccountStatus;
  tone: Tone;
  stateWords: string;
  /** `USD · New York time · set by the account`; null where no account is chosen. */
  facts: string | null;
  /** `Read 9:19 AM`, or how the read stands. */
  read: string | null;
  ready: ReadyRowVM[];
  /** The fold's mark: `2 need you`, or `all in order`. */
  readyMark: string;
  /** Not connected: what connecting does. */
  line: string | null;
  /** Ads made on the platform itself and shown here read-only. */
  adopted: string | null;
  /** The accounts there are to choose from, and the one in use. */
  choices: ConnectChoiceVM[];
  chosen: string | null;
  /** Ads that are on, in review or being set up on this platform: Disconnect is refused while there are any. */
  running: number;
}

/** What states an ad runs in: on, in review (it goes on when approved) or being made. */
const RUNNING: readonly AdState[] = ["on", "review", "setting-up"];

/** Google's manager link comes first among its checks: nothing else can be read until the owner has accepted it. */
const CHECKS: Record<AdPlatform, readonly AdCheckId[]> = {
  meta: STANDING_CHECKS.meta,
  google: ["manager-link", ...STANDING_CHECKS.google],
  tiktok: STANDING_CHECKS.tiktok,
};

function readyRow(acct: AdAccountRead, id: AdCheckId): ReadyRowVM {
  const ok = checkOk(acct, id);
  const manager = id === "manager-link";
  const text = manager ? (ok ? CONNECT.managerOk : CONNECT.managerNot) : checkWords(id, acct.platform);
  return { id, text, tone: ok ? "ok" : "warn", fix: ok ? null : checkFix(id, acct.platform) };
}

/** TikTok's post permission, amber in the last week before it lapses. */
function permissionRow(acct: AdAccountRead, today: string): ReadyRowVM | null {
  if (!acct.permissionEnd) return null;
  const soon = daysBetween(today, acct.permissionEnd) <= ADS_PERMISSION_WARN_DAYS;
  const id = "post-permission";
  return {
    id,
    text: CONNECT.permission(dayWord(acct.permissionEnd)),
    tone: soon ? "warn" : "ok",
    fix: soon ? checkFix(id, acct.platform) : null,
  };
}

/** What a connected account stands on, in the words Ads' standing uses. */
function connectReadyOf(acct: AdAccountRead, today: string): ReadyRowVM[] {
  const rows = CHECKS[acct.platform].map((id) => readyRow(acct, id));
  const permission = permissionRow(acct, today);
  return permission ? [...rows, permission] : rows;
}

/** How the last read went, or null where there has been none to say. */
function readOf(acct: AdAccountRead): string | null {
  if (acct.read === "reading") return CONNECT.reading;
  if (acct.read === "failed") {
    const at = acct.readAt
      ? `${dayWord(dayOfIso(acct.readAt, acct.timezone))}, ${timeOf(acct.readAt, acct.timezone)}`
      : "";
    return CONNECT.readFailed(at);
  }
  return acct.readAt ? CONNECT.read(timeOf(acct.readAt, acct.timezone)) : null;
}

function connectStateOf(status: AdAccountStatus, ready: readonly ReadyRowVM[]): { tone: Tone; words: string } {
  if (status === "choose") return { tone: "info", words: STANDING.choose };
  if (status === "lapsed") return { tone: "warn", words: STANDING.lapsed };
  if (status === "not-connected") return { tone: "plain", words: CONNECT.off };
  return ready.some((r) => r.tone === "warn")
    ? { tone: "warn", words: STANDING.needsYou }
    : { tone: "ok", words: STANDING.connected };
}

function connectRowOf(
  platform: AdPlatform,
  acct: AdAccountRead | undefined,
  ads: readonly AdRead[],
  today: string,
): ConnectRowVM {
  const status = acct?.status ?? "not-connected";
  const connected = acct !== undefined && status === "connected";
  const ready = connected ? connectReadyOf(acct, today) : [];
  const here = ads.filter((ad) => ad.platform === platform);
  const adopted = here.filter((ad) => !ad.madeHere).length;
  const state = connectStateOf(status, ready);
  const bad = ready.filter((r) => r.tone === "warn").length;
  return {
    id: platform,
    title: PLATFORM_WORD[platform],
    detail: acct?.name ?? null,
    icon: ICON[platform],
    status,
    tone: state.tone,
    stateWords: state.words,
    facts: connected ? CONNECT.facts(acct.currency, acct.timezone) : null,
    read: connected ? readOf(acct) : null,
    ready,
    readyMark: bad > 0 ? CONNECT.needYou(bad) : CONNECT.allReady,
    line: status === "not-connected" || status === "lapsed" ? CONNECT.line(platform) : null,
    adopted: connected && adopted > 0 ? CONNECT.adopted(platform, adopted) : null,
    choices: (acct?.choices ?? []).map((c) => ({ value: c.externalId, label: c.name, hint: c.currency })),
    chosen: acct?.externalId ?? null,
    running: here.filter((ad) => RUNNING.includes(ad.state)).length,
  };
}

/** The three platforms' rows, in the Ads page's order, over the accounts and ads a reader returned. */
export function connectModel(input: {
  accounts: readonly AdAccountRead[];
  ads: readonly AdRead[];
  today: string;
}): ConnectRowVM[] {
  return PLATFORMS.map((platform) =>
    connectRowOf(
      platform,
      input.accounts.find((a) => a.platform === platform),
      input.ads,
      input.today,
    ),
  );
}
