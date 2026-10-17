import { plural } from "../shared/words.js";
import { daysBetween } from "./ads.js";
import { ADS_PERMISSION_WARN_DAYS, STANDING_CHECKS } from "./rules.js";
import { PLATFORMS, checkOk, dayOfIso, timeOf } from "./vm-base.js";
import { EXAMPLE, PLATFORM_OWNER, PLATFORM_WORD, checkFix, checkWords, dayWord } from "./words.js";
import { STANDING } from "./words-page.js";
const MANAGER = {
  meta: "Meta Ads Manager",
  google: "Google Ads",
  tiktok: "TikTok Ads Manager"
};
const ICON = { meta: "globe", google: "search", tiktok: "video" };
const zoneCity = (zone) => (zone.split("/").at(-1) ?? zone).replace(/_/g, " ");
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
  line: (p) => `Chanlytics reads your ads and can make new ones. ${PLATFORM_OWNER[p]} bills you; Chanlytics never holds your ad money.`,
  /** The press of Connect in the demo: it says nothing was connected. */
  signIn: (p) => `This opens ${PLATFORM_OWNER[p]}'s sign-in in the real app. Nothing was connected.`,
  /** `USD · New York time · set by the account`: the account's own, which Chanlytics follows and cannot change. */
  facts: (currency, zone) => `${currency} \xB7 ${zoneCity(zone)} time \xB7 set by the account`,
  read: (time) => `Read ${time}`,
  reading: "Reading now",
  readFailed: (when) => `Could not be read \xB7 last read ${when}`,
  ready: "What's ready",
  allReady: "all in order",
  needYou: (n) => `${n} ${n === 1 ? "needs" : "need"} you`,
  managerOk: "Chanlytics' access: accepted",
  managerNot: "Chanlytics' access: not accepted yet",
  /** TikTok's post permission, a day it runs until. */
  permission: (day) => `Post permission until ${day}`,
  /** Ads the owner made on the platform itself, shown in Ads and read-only there (decision 7). */
  adopted: (p, n) => `${plural(n, "ad")} made in ${MANAGER[p]} ${n === 1 ? "is" : "are"} shown in Ads, read-only.`,
  /** Disconnect while an ad runs is refused (decision 8). */
  refused: (n) => `Pause or end your ads first: ${n} ${n === 1 ? "is" : "are"} on.`,
  refusedDoor: "See your ads",
  refusedOk: "Ok",
  disconnectQ: (p) => `Disconnect ${PLATFORM_WORD[p]}?`,
  disconnectDetail: "Chanlytics stops reading your ads and can't make new ones.",
  disconnectYes: "Yes, disconnect",
  disconnectNo: "Keep it connected",
  disconnected: (p) => `${PLATFORM_WORD[p]} is disconnected.`,
  /** The choice of an account: its question, and the toast of choosing one. */
  which: (p) => `Which ${PLATFORM_OWNER[p]} account should Chanlytics use?`,
  using: (p, name) => `${PLATFORM_WORD[p]} now uses ${name}.`,
  /** Decision 9: the owner's setting that pauses ads, off unless chosen. */
  pause: {
    label: "Pause my ads when the way in closes",
    line: "If WhatsApp or your line stops working, Chanlytics pauses your ads instead of only telling you.",
    on: "If the way in closes, Chanlytics will pause your ads.",
    off: "If the way in closes, Chanlytics will tell you."
  },
  /** What a role that may not press says it would have done. */
  gate: {
    connect: "connect an ad account",
    change: "change the ad account",
    disconnect: "disconnect an ad account",
    pause: "change when ads pause"
  }
};
const RUNNING = ["on", "review", "setting-up"];
const CHECKS = {
  meta: STANDING_CHECKS.meta,
  google: ["manager-link", ...STANDING_CHECKS.google],
  tiktok: STANDING_CHECKS.tiktok
};
function readyRow(acct, id) {
  const ok = checkOk(acct, id);
  const manager = id === "manager-link";
  const text = manager ? ok ? CONNECT.managerOk : CONNECT.managerNot : checkWords(id, acct.platform);
  return { id, text, tone: ok ? "ok" : "warn", fix: ok ? null : checkFix(id, acct.platform) };
}
function permissionRow(acct, today) {
  if (!acct.permissionEnd) return null;
  const soon = daysBetween(today, acct.permissionEnd) <= ADS_PERMISSION_WARN_DAYS;
  const id = "post-permission";
  return {
    id,
    text: CONNECT.permission(dayWord(acct.permissionEnd)),
    tone: soon ? "warn" : "ok",
    fix: soon ? checkFix(id, acct.platform) : null
  };
}
function connectReadyOf(acct, today) {
  const rows = CHECKS[acct.platform].map((id) => readyRow(acct, id));
  const permission = permissionRow(acct, today);
  return permission ? [...rows, permission] : rows;
}
function readOf(acct) {
  if (acct.read === "reading") return CONNECT.reading;
  if (acct.read === "failed") {
    const at = acct.readAt ? `${dayWord(dayOfIso(acct.readAt, acct.timezone))}, ${timeOf(acct.readAt, acct.timezone)}` : "";
    return CONNECT.readFailed(at);
  }
  return acct.readAt ? CONNECT.read(timeOf(acct.readAt, acct.timezone)) : null;
}
function connectStateOf(status, ready) {
  if (status === "choose") return { tone: "info", words: STANDING.choose };
  if (status === "lapsed") return { tone: "warn", words: STANDING.lapsed };
  if (status === "not-connected") return { tone: "plain", words: CONNECT.off };
  return ready.some((r) => r.tone === "warn") ? { tone: "warn", words: STANDING.needsYou } : { tone: "ok", words: STANDING.connected };
}
function connectRowOf(platform, acct, ads, today) {
  const status = acct?.status ?? "not-connected";
  const connected = acct !== void 0 && status === "connected";
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
    running: here.filter((ad) => RUNNING.includes(ad.state)).length
  };
}
export function connectModel(input) {
  return PLATFORMS.map(
    (platform) => connectRowOf(
      platform,
      input.accounts.find((a) => a.platform === platform),
      input.ads,
      input.today
    )
  );
}
