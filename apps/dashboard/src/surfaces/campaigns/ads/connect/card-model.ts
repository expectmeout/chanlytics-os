/**
 * The ad account's card, as a model (pure): one card for every state the connection can be in (the Ads plan, 4.3; the
 * canvas's Flow board). It reads what the server answered (contracts AdAccountDto), what came back from Meta's window,
 * and whether the page is waiting on either, and says the head's word, the lines under it, the one thing missing with
 * its one act, the one question, and what the coral button says. The page draws what this hands over and decides
 * nothing: the Ads page and Settings › Connections draw the same model, so the two cards cannot disagree.
 *
 * One thing at a time. Of several checks not met, the card says the first, in the card's own order; the rest fold into
 * "3 of 5 ready", and the opened card lists all five.
 */
import { AD_CARD_CHECKS, formatPhoneDisplay, numberFormat } from "@chanlytics/contracts";
import type { AdAccountCard, AdAccountDto, AdCardCheckId } from "@chanlytics/contracts";
import { dayWord } from "../model/words";
import { dayOfIso } from "../model/vm-base";
import { moneyOf } from "../model/money";
import {
  CARD,
  CHECK,
  CONNECT,
  DISCONNECT,
  META_DOOR,
  NOT_ALLOWED,
  OUTCOME,
  OUTCOME_OTHER,
  QUESTION,
  UNSETTLED,
  needOf,
  type NeedWords,
} from "./words";

/** How a need's one act goes: a page of Meta's, Meta's window again, or a page of the app. */
type NeedHow = { kind: "meta"; href: string } | { kind: "connect" } | { kind: "route"; to: string };

/** A need's one act: its words, and how it goes. */
export type NeedAct = NeedHow & { words: string };

export interface NeedVM {
  title: string;
  line: string;
  act: NeedAct | null;
  /** warn: it stops something the owner asked for. calm: a fact, with a choice. */
  tone: "warn" | "calm";
}

export interface CheckVM {
  id: AdCardCheckId;
  label: string;
  neededFor: string;
  /** ok, missing, or not known yet (the platform has not said, or the card is still checking). */
  state: "ok" | "missing" | "unknown";
}

export interface ConnectCardVM {
  /** Where the connection stands: what the head's dot and word say. */
  state: "none" | "checking" | "question" | "connected" | "signed-out" | "left";
  word: string;
  /** What connecting does and who is charged, while nothing is connected. */
  says: { text: string; strong: boolean }[];
  /** Who Meta charges, the Page, and Meta's own limit, once an account is connected. */
  facts: { label: string; value: string; door: { words: string; href: string } | null }[];
  /** "4 of 5 ready", where a check is not met. */
  ready: string | null;
  need: NeedVM | null;
  question: null | {
    title: string;
    options: { id: string; title: string; line: string }[];
    /** The likelier account's id: the one picked as the card opens. */
    picked: string;
  };
  checks: CheckVM[];
  /** The opened card's head line and its quiet line. */
  connectedOn: string | null;
  quiet: string;
  /** The line that says the newest look failed and when the card was last brought up to date. */
  stale: string | null;
  /** The coral button: Connect, Connect again, or none. */
  button: string | null;
}

/** A currency as a person says it: "US dollars". The code itself where the runtime has no name for it. */
export function currencyWords(currency: string): string {
  try {
    const parts = numberFormat("en-US", { style: "currency", currency, currencyDisplay: "name" }).formatToParts(2);
    return parts.find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    // Not a currency the runtime knows: its code is still the truth.
    return currency;
  }
}

const actOf = (need: NeedWords, how: NeedHow | null): NeedAct | null =>
  need.act === null || how === null ? null : { ...how, words: need.act };

/** The first check not met, as the card's one need; null where every check is met or not known yet. */
function needOfChecks(card: AdAccountCard): NeedVM | null {
  const missing = card.checks.find((check) => check.ok === false);
  if (!missing) return null;
  const number = formatPhoneDisplay(card.ai_number);
  if (missing.id === "account-active" && card.standing === "unsettled")
    return {
      ...UNSETTLED,
      tone: "warn",
      act: actOf(UNSETTLED, { kind: "meta", href: META_DOOR.billing(card.external_id) }),
    };
  const words = needOf(missing.id, number);
  const how: Record<AdCardCheckId, NeedHow | null> = {
    "account-active": { kind: "meta", href: META_DOOR.quality(card.business_id, card.external_id) },
    payment: { kind: "meta", href: META_DOOR.billing(card.external_id) },
    "page-linked": null,
    "whatsapp-linked": { kind: "meta", href: META_DOOR.whatsapp },
    "chanlytics-whatsapp":
      card.ai_number === null
        ? { kind: "route", to: "admin/integrations" }
        : { kind: "meta", href: META_DOOR.whatsapp },
  };
  return { ...words, tone: "warn", act: actOf(words, how[missing.id]) };
}

/** What came back from Meta's window, as the card's one need. */
function needOfOutcome(why: string): NeedVM {
  const words = OUTCOME[why] ?? OUTCOME_OTHER;
  const how: NeedHow | null =
    why === "no_account"
      ? { kind: "meta", href: META_DOOR.accounts }
      : why === "ad_account_taken" || why === "accounts_unreadable" || why === "state_expired"
        ? { kind: "connect" }
        : null;
  return { ...words, tone: why === "closed" ? "calm" : "warn", act: actOf(words, how) };
}

const checksOf = (card: AdAccountCard | null, checking: boolean): CheckVM[] =>
  AD_CARD_CHECKS.map((id) => {
    const ok = checking ? null : (card?.checks.find((check) => check.id === id)?.ok ?? null);
    return { id, ...CHECK[id], state: ok === null ? "unknown" : ok ? "ok" : "missing" };
  });

/** Who Meta charges, the Page, and Meta's own limit. */
function factsOf(card: AdAccountCard): ConnectCardVM["facts"] {
  const currency = card.currency ?? "";
  const limit =
    card.spend_limit_minor === null
      ? { value: CARD.noLimit, door: { words: CARD.setLimit, href: META_DOOR.limit(card.external_id) } }
      : { value: moneyOf(card.spend_limit_minor, currency), door: null };
  return [
    { label: CARD.metaCharges, value: CARD.account(card.name ?? "", currencyWords(currency)), door: null },
    { label: CARD.runsAs, value: card.page_name ?? CARD.noPage, door: null },
    { label: CARD.limit, ...limit },
  ];
}

/** What the page knows beside the server's answer. */
interface CardMoment {
  /** The word Meta's window came back with, where it connected nothing: `closed`, or the refusal's code. */
  outcome: string | null;
  /** Whether Meta's window is open, or the page is reading what it shared. */
  checking: boolean;
  /** The workspace's time zone, for the days the card says. */
  timezone: string;
}

const BASE = { says: [], facts: [], ready: null, need: null, question: null, connectedOn: null, stale: null };

/** The card with nothing connected: what connecting does, who is charged, and what the last try came to. */
function cardBefore(dto: AdAccountDto, moment: CardMoment): ConnectCardVM {
  const last = dto.can_connect ? CARD.charges : dto.offered ? CARD.ownerOnly : CARD.notHere;
  return {
    ...BASE,
    state: "none",
    word: CARD.notConnected,
    says: [
      { text: CARD.does, strong: false },
      { text: last, strong: true },
    ],
    need: moment.outcome === null ? null : needOfOutcome(moment.outcome),
    checks: checksOf(null, false),
    quiet: CARD.needsOnly,
    button: dto.can_connect ? CONNECT.connect : null,
  };
}

/** The opened card's quiet line, and the Page's Instagram account where Chanlytics may read it. */
function quietLineOf(card: AdAccountCard): string {
  if (card.instagram_handle !== null) return `${CARD.needsOnly} ${CARD.instagram(card.instagram_handle)}`;
  return card.reads_instagram ? `${CARD.needsOnly} ${CARD.noInstagram}` : CARD.needsOnly;
}

/** The card once an account is connected: who Meta charges, what is ready, and the one thing missing. */
function cardConnected(dto: AdAccountDto, card: AdAccountCard, moment: CardMoment): ConnectCardVM {
  const met = card.checks.filter((check) => check.ok === true).length;
  const need = card.can_pause
    ? needOfChecks(card)
    : { ...NOT_ALLOWED, tone: "warn" as const, act: actOf(NOT_ALLOWED, { kind: "meta", href: META_DOOR.accounts }) };
  const day = (iso: string | null) => (iso === null ? null : dayWord(dayOfIso(iso, moment.timezone)));
  const connected = day(card.connected_at);
  const updated = day(card.read_at);
  return {
    ...BASE,
    state: "connected",
    word: CARD.connected,
    facts: factsOf(card),
    ready: met === card.checks.length ? null : CARD.ready(met, card.checks.length),
    need,
    checks: checksOf(card, false),
    connectedOn: connected === null ? null : CARD.connectedOn(connected),
    quiet: quietLineOf(card),
    stale: card.read_failed && updated !== null ? CARD.couldntUpdate(updated) : null,
    button: null,
  };
}

/** The one question: two ad accounts could both be the one, the likelier picked. */
function cardQuestion(card: AdAccountCard): ConnectCardVM {
  const [first] = card.choices;
  return {
    ...BASE,
    state: "question",
    word: CARD.question,
    question: {
      title: QUESTION.title(card.choices.length),
      options: card.choices.map((choice) => ({
        id: choice.external_id,
        title: CARD.account(choice.name, currencyWords(choice.currency)),
        line: choice.runs_page ? QUESTION.runsPage : QUESTION.noPageAds,
      })),
      picked: first?.external_id ?? "",
    },
    checks: checksOf(null, false),
    quiet: CARD.needsOnly,
    button: null,
  };
}

/** The ad account's card. `dto` null is a read still under way: the card says nothing yet. */
export function connectCard(dto: AdAccountDto | null, moment: CardMoment): ConnectCardVM | null {
  if (dto === null) return null;
  if (moment.checking)
    return {
      ...BASE,
      state: "checking",
      word: CARD.checking,
      checks: checksOf(null, true),
      quiet: CARD.checkingLine,
      button: null,
    };
  const card = dto.meta;
  if (card === null) return cardBefore(dto, moment);
  if (card.status === "choosing") return cardQuestion(card);
  if (card.status === "connected") return cardConnected(dto, card, moment);
  // Signed out by Meta, or disconnected by the owner: the page above the card says which ad was on. The card offers
  // the way back.
  const before = cardBefore(dto, moment);
  return card.status === "revoked"
    ? { ...before, state: "signed-out", word: CARD.signedOut, button: dto.can_connect ? CONNECT.again : null }
    : { ...before, state: "left", says: [...before.says, { text: DISCONNECT.removeAtMeta, strong: false }] };
}
