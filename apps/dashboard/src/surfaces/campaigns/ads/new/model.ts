/**
 * New ad's one screen, as a model (pure; the Ads plan's 4.6): every sentence the screen says, worked out from the
 * draft as the server last judged it (POST ads/draft, POST ads/words) and what the owner has typed since. The screen
 * draws what this hands over and decides nothing.
 *
 * One thing at a time. Of everything that stops the ad, the screen says the first as one line with its one act: where
 * the words could not be written, the question a draft asks about Meta's special kinds, a yes to it, then the first
 * check not met (the plan's 5.1). The press names the most the ad can cost and follows the amount as it is typed; while
 * it cannot be pressed it is grey, with the reason under it.
 */
import { daysBetween, fileViewOf, minorPerUnit } from "@chanlytics/contracts";
import type { AdSpecialKind } from "@chanlytics/contracts";
import type { AdCheckDto, AdDraftAnswer, AdNoWords, AdWordsFault } from "@/server/ads/draft-shape";
import { currencyWords, type NeedVM } from "../connect/card-model";
import { ADS_MANAGER } from "../live/words";
import { moneyOf } from "../model/money";
import { dayWord } from "../model/words";
import {
  ACCOUNT_FAULT,
  AMOUNT_FAULT,
  AREA_FAULT,
  END_FAULT,
  KIND,
  KIND_ASK,
  NEW,
  PICTURE_FAULT,
  PRICE_FAULT,
  WORDS_FAULT,
} from "./words";

/** A draft that can be written, as the server answers it. */
export type AdDraftHere = Extract<AdDraftAnswer, { can: true }>;

/** Where the draft's words stand. */
export type AdWordsHere = { at: "writing" } | { at: "written" } | { at: "none"; why: AdNoWords | "failed" };

/** What "Tell AI" last came to. */
export type AdTellResult =
  | { kind: "changed"; what: keyof typeof NEW.tell.changed }
  | { kind: "none"; fault: AdWordsFault | null }
  | { kind: "failed" };

/** What the owner has set that the server may not have judged yet: the sentence and the press follow these at once. */
export interface AdLocal {
  total_minor: number;
  miles: number;
  end_day: string;
  /** What they answered where the draft asked whether this is one of Meta's special kinds of ad. */
  answers: Partial<Record<AdSpecialKind, "no" | "yes">>;
}

/** What the screen holds. */
interface NewAdHere {
  answer: AdDraftHere;
  local: AdLocal;
  words: AdWordsHere;
  /** Which of the versions is shown, from 0. */
  version: number;
  /** "Tell AI" is out. */
  telling: boolean;
  told: AdTellResult | null;
  /** The card's own need for the ad account, as the page read it: the same line the card says, with the same act. */
  need: NeedVM | null;
}

/** What a line's one act does. */
export type LineAct =
  | { kind: "rewrite" }
  | { kind: "no_price" }
  | { kind: "next_picture" }
  | { kind: "amount"; minor: number }
  | { kind: "end"; day: string }
  | { kind: "miles"; miles: number }
  | { kind: "answer"; about: AdSpecialKind; answer: "no" | "yes" }
  | { kind: "meta"; href: string };

export interface AdLinePress {
  words: string;
  act: LineAct;
}

/** The one line: what is so, what it means, and its act or its two answers. */
export type LineVM =
  | {
      is: "line";
      tone: "warn" | "calm";
      title: string;
      body: string;
      press: AdLinePress | null;
      second: AdLinePress | null;
    }
  /** The ad account's own need: drawn as the card draws it. */
  | { is: "account"; need: NeedVM };

export interface NewAdVM {
  title: string;
  kicker: string;
  /** The four words of the sentence. */
  sentence: { service: string; miles: string; amount: string; end: string };
  why: string[];
  line: LineVM | null;
  /** The hints under a word being changed. */
  hints: { amount: string; miles: string; end: string };
  /** Whole units of the currency, as the amount's box holds them, and the least Meta takes. */
  units: { now: number; perUnit: number };
  shown: {
    page: string;
    /** `1 of 3 versions`, and whether a press shows the next. */
    count: string;
    steps: boolean;
    text: string | null;
    headline: string | null;
    /** What stands where the words go while there are none: writing, or no words yet. */
    waiting: "writing" | "none" | null;
    /** Where the picture is read from; null where the draft has no file of its own (the example). */
    picture: { src: string | null; alt: string; video: boolean };
  };
  tell: { busy: boolean; status: string | null };
  facts: { label: string; value: string }[];
  press: { words: string; can: boolean; under: string };
}

const adLine = (
  tone: "warn" | "calm",
  words: { title: string; body: string },
  press: AdLinePress | null = null,
  second: AdLinePress | null = null,
): LineVM => ({ is: "line", tone, title: words.title, body: words.body, press, second });

/** A check not met, as its line and its one act. */
function checkLine(check: AdCheckDto, here: NewAdHere): LineVM {
  const { answer } = here;
  const { currency } = answer.account;
  if (check.code === "account")
    return here.need ? { is: "account", need: here.need } : adLine("warn", ACCOUNT_FAULT[check.check]);
  if (check.code === "picture")
    return adLine("warn", PICTURE_FAULT[check.fault], { words: NEW.nextPicture, act: { kind: "next_picture" } });
  if (check.code === "words")
    return adLine("warn", WORDS_FAULT[check.fault], { words: NEW.rewrite, act: { kind: "rewrite" } });
  if (check.code === "price")
    return adLine("warn", PRICE_FAULT[check.fault], { words: NEW.takePriceOut, act: { kind: "no_price" } });
  if (check.code === "amount") {
    const nearest = moneyOf(check.nearest_minor, currency);
    const words =
      check.fault === "under_least"
        ? AMOUNT_FAULT.under_least(nearest, answer.days)
        : check.fault === "over_most"
          ? AMOUNT_FAULT.over_most(nearest)
          : AMOUNT_FAULT.not_whole();
    return adLine("warn", words, { words: NEW.setTo(nearest), act: { kind: "amount", minor: check.nearest_minor } });
  }
  if (check.code === "end")
    return adLine("warn", END_FAULT, {
      words: NEW.setTo(dayWord(check.nearest_day)),
      act: { kind: "end", day: check.nearest_day },
    });
  return adLine("warn", AREA_FAULT, {
    words: NEW.setTo(NEW.sentence.miles(check.nearest_miles)),
    act: { kind: "miles", miles: check.nearest_miles },
  });
}

/**
 * The special kind the draft still asks about, and the one the ad is said to be. The owner's own answer counts at
 * once, before the server has judged it: a question answered is not asked again, a yes is that kind, a no is not.
 */
function kindsOf(here: NewAdHere): { question: AdSpecialKind | null; declared: AdSpecialKind | null } {
  const { answer, local } = here;
  const judged = answer.declared !== "none" && answer.declared !== "waiting" ? answer.declared : null;
  const yes = [answer.question, judged].find((kind) => kind !== null && local.answers[kind] === "yes");
  const open = answer.question !== null && local.answers[answer.question] === undefined;
  return { question: open ? answer.question : null, declared: yes ?? null };
}

/** The one line the screen says: the first thing that stops the ad, or asks. Null where nothing does. */
function theLine(here: NewAdHere): LineVM | null {
  const { answer, words } = here;
  const { question, declared } = kindsOf(here);
  if (words.at === "none") {
    const more = words.why === "limit" ? NEW.couldnt.limit : words.why === "paused" ? NEW.couldnt.paused : "";
    return adLine(
      "calm",
      { title: NEW.couldnt.title, body: `${NEW.couldnt.body}${more}` },
      { words: NEW.couldnt.act, act: { kind: "rewrite" } },
    );
  }
  if (question) {
    const kind = KIND[question];
    return adLine(
      "warn",
      { title: kind.ask, body: KIND_ASK.body(answer.draft.service) },
      { words: kind.no, act: { kind: "answer", about: question, answer: "no" } },
      { words: kind.yes, act: { kind: "answer", about: question, answer: "yes" } },
    );
  }
  if (declared) {
    const kind = KIND[declared];
    return adLine(
      "calm",
      { title: KIND_ASK.yesTitle(kind.ad), body: KIND_ASK.yesBody },
      { words: NEW.openMeta, act: { kind: "meta", href: ADS_MANAGER } },
      { words: kind.undo, act: { kind: "answer", about: declared, answer: "no" } },
    );
  }
  const [first] = answer.checks;
  return first ? checkLine(first, here) : null;
}

/** Why the press cannot be pressed, said under it; null where it can. */
function waitsFor(here: NewAdHere): string | null {
  const { answer, words } = here;
  const { question, declared } = kindsOf(here);
  if (words.at === "writing") return NEW.press.writing;
  if (words.at === "none") return NEW.press.noWords;
  if (question) return NEW.press.answer;
  if (declared) return NEW.press.kind(KIND[declared].ad);
  if (answer.checks.length > 0) return NEW.press.check;
  if (!answer.owner) return NEW.press.owner;
  return answer.turn_on === "not_yet" ? NEW.press.notYet : null;
}

/** What "Tell AI" last came to, as one quiet sentence. */
function tellStatusOf(outcome: AdTellResult | null): string | null {
  if (outcome === null) return null;
  if (outcome.kind === "changed") return NEW.tell.changed[outcome.what];
  if (outcome.kind === "failed") return NEW.tell.failed;
  return outcome.fault ? NEW.tell.fault(WORDS_FAULT[outcome.fault].told) : NEW.tell.none;
}

/** Where a draft's picture is read from: Content's own portrait of a piece AI made, else the file as it is kept. */
function pictureSrc(picture: AdDraftHere["draft"]["picture"]): string | null {
  if (!picture.id) return null;
  return picture.made ? `${fileViewOf(picture.id)}?shape=portrait` : `${fileViewOf(picture.id)}?w=720`;
}

/** Why this amount, and why this service where the draft's own rule picked it. */
function whyLines(here: NewAdHere, days: number): string[] {
  const { answer, local } = here;
  const { currency } = answer.account;
  const starting = local.total_minor === answer.amount.least_minor && local.end_day === answer.draft.end_day;
  const amount = starting
    ? answer.amount.history
      ? NEW.why.startingKnown(days)
      : NEW.why.starting
    : NEW.why.aDay(moneyOf(aDayOf(local.total_minor, days, currency), currency), days);
  const picked =
    answer.picked === "most_booked" ? NEW.why.mostBooked : answer.picked === "first" ? NEW.why.first : null;
  return picked ? [amount, picked] : [amount];
}

/** About what a total is a day, as a whole amount of the currency. */
function aDayOf(totalMinor: number, days: number, currency: string): number {
  const unit = minorPerUnit(currency);
  return Math.round(totalMinor / Math.max(1, days) / unit) * unit;
}

/** The screen, from what it holds. */
export function newAdView(here: NewAdHere): NewAdVM {
  const { answer, local, words } = here;
  const { currency } = answer.account;
  const { versions, picture } = answer.draft;
  const days = Math.max(1, daysBetween(answer.today, local.end_day));
  const shownAt = versions.length > 0 ? here.version % versions.length : 0;
  const version = words.at === "written" ? (versions[shownAt] ?? null) : null;
  const waits = waitsFor(here);
  const kinds = kindsOf(here);
  return {
    title: answer.draft.service,
    kicker: NEW.kicker,
    sentence: {
      service: answer.draft.service,
      miles: NEW.sentence.miles(local.miles),
      amount: moneyOf(local.total_minor, currency),
      end: dayWord(local.end_day),
    },
    why: whyLines(here, days),
    line: theLine(here),
    hints: {
      amount: NEW.edit.amountHint(
        moneyOf(aDayOf(local.total_minor, days, currency), currency),
        moneyOf(answer.account.min_daily_minor, currency),
      ),
      miles: NEW.edit.milesHint,
      end: NEW.edit.endHint(days),
    },
    units: { now: Math.round(local.total_minor / minorPerUnit(currency)), perUnit: minorPerUnit(currency) },
    shown: {
      page: answer.account.page ?? NEW.shown.page,
      count:
        words.at === "writing"
          ? NEW.shown.coming
          : version
            ? NEW.shown.version(shownAt + 1, versions.length)
            : NEW.shown.none,
      steps: version !== null && versions.length > 1,
      text: version?.text ?? null,
      headline: version?.headline ?? null,
      waiting: version ? null : words.at === "writing" ? "writing" : "none",
      picture: {
        src: pictureSrc(picture),
        alt: picture.kind === "video" ? NEW.shown.video(picture.name) : NEW.shown.picture(picture.name),
        video: picture.kind === "video",
      },
    },
    tell: { busy: here.telling, status: here.telling ? NEW.tell.changing : tellStatusOf(here.told) },
    facts: [
      { label: NEW.facts.charges, value: NEW.facts.account(answer.account.name, currencyWords(currency)) },
      {
        label: NEW.facts.tells,
        value: kinds.declared ? KIND[kinds.declared].ad : kinds.question ? NEW.facts.waiting : NEW.facts.none,
      },
    ],
    press: {
      words: NEW.press.turnOn(moneyOf(local.total_minor, currency)),
      can: waits === null,
      under: waits ?? NEW.press.ready,
    },
  };
}
