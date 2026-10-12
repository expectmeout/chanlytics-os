/**
 * The Ads view's demo store (MOCKUP): ONE state of `AdsRead` for the example chosen, behind a fake port of the verbs the wiring
 * lane will make real (pause, resume, end, setBudget, setEnd, setArea, setOffer, rename, save, turnOn, answerAsk, chooseAccount).
 * The page holds it once and hands `read` and `verbs` down (and `readAgain`, a mock of reading an account again): the drawer and
 * New ad keep no copy of an ad. Wiring swaps the port for calls
 * (`useAdsStore` reads the surface, a verb posts and waits for the refusal or the new version); the page does not change.
 *
 * Every verb carries the version it was drawn from and a stale one is declined, with a word from contracts. A verb that
 * succeeds bumps the ad's version and answers an `undo` that puts the ad back as it was (bumped again: Undo is a change). An ad the
 * owner made on the platform itself is not ours to change: only Pause and Resume are here. The example is kept in the tab's
 * session storage and read AFTER the page mounts, so a server render and the first client render agree.
 */
import { useEffect, useRef, useState } from "react";
import { adWith, daysBetween, patchRestarts } from "@chanlytics/contracts";
import type { AdAccountRead, AdArea, AdPatch, AdPlatform, AdRead, AdsConfig, AdsRead } from "@chanlytics/contracts";
import {
  ADS_EXAMPLES,
  ADS_SOFT_NEEDS,
  CHOOSE,
  REFUSED,
  adServiceOf,
  draftAd,
  newAdModel,
  starterCopy,
} from "@chanlytics/contracts/ads-page";
import type { AdDraft, AdsExample, AskApply, AskVM } from "@chanlytics/contracts/ads-page";
import type { LegacyFlash } from "../../legacy-verbs";
import { rememberAdNames } from "./crumb-names";
import { EXAMPLE_READS, withAccount } from "./examples";
import { CONFIG, accountChecks } from "./sample";

/** What a verb answers: it worked, and here is its Undo; or it was declined, and here is why in words. */
export type AdsOutcome = { ok: true; undo: () => void } | { ok: false; why: string };

/** The toast a press says: its words with Undo where it worked, why where it was declined. */
export const tellOf = (out: AdsOutcome, msg: string, undoable = true): LegacyFlash =>
  out.ok ? { msg, undo: undoable ? out.undo : null } : { tone: "warn", msg: out.why };

export interface AdsVerbs {
  pause(id: string, version: number): AdsOutcome;
  resume(id: string, version: number): AdsOutcome;
  end(id: string, version: number): AdsOutcome;
  /** The ad's amount, in its own mode: a total or a daily amount. */
  setBudget(id: string, version: number, amountMinor: number): AdsOutcome;
  setEnd(id: string, version: number, day: string): AdsOutcome;
  setArea(id: string, version: number, area: AdArea): AdsOutcome;
  setOffer(id: string, version: number, serviceId: string): AdsOutcome;
  rename(id: string, version: number, name: string): AdsOutcome;
  /** Edit's several changes at once. */
  save(id: string, version: number, patch: AdPatch): AdsOutcome;
  /** Turn on: the draft lands in review. `maxMinor` is the most it can spend, as the owner read it. */
  turnOn(draft: AdDraft, maxMinor: number | null): AdsOutcome & { id?: string };
  /** The Ask line's press: a longer run and a bigger total, or an amount a day moved from one ad to another. */
  answerAsk(ask: AskVM): AdsOutcome;
  /** An account that was to be chosen is: the platform's account the owner picked becomes the connected one. */
  chooseAccount(platform: AdPlatform, externalId: string): AdsOutcome;
}

/** Where the store reads and writes its read: a ref in a hook, a stand-in in a test. */
interface World {
  get: () => AdsRead;
  put: (read: AdsRead) => void;
}

const declined = (why: string): { ok: false; why: string } => ({ ok: false, why });

/** An ad sent back for checking: what the change mended is cleared, and a running ad is in review again (its results stay). */
function sentBack(ad: AdRead, read: AdsRead): AdRead {
  const mended = ad.needs && (ad.needs.code === "rejected" || ad.needs.code === "price-changed");
  const needs = mended ? null : ad.needs;
  const stops = needs !== null && !ADS_SOFT_NEEDS.includes(needs.code);
  const back = (ad.state === "on" || ad.state === "needs-you") && !stops;
  return { ...ad, needs, state: back ? "review" : ad.state, sentAt: back ? read.readAt : ad.sentAt };
}

/** Turned on again: the state it goes back to is what it was before it was paused, as far as its record says. */
function resumed(ad: AdRead): AdRead {
  if (ad.approvedDay === null) return { ...ad, state: "review" };
  const needs = ad.needs && ad.needs.code !== "paused-in-platform" ? ad.needs : null;
  const stops = needs !== null && !ADS_SOFT_NEEDS.includes(needs.code);
  return { ...ad, needs, state: stops ? "needs-you" : "on" };
}

/** An ad whose amount moved keeps the day it did, for the platform's wait between two changes (TikTok's two days). */
const amountMoved = (before: AdRead, next: AdRead, today: string): AdRead =>
  next.budget.amountMinor === before.budget.amountMinor ? next : { ...next, budgetChangedDay: today };

/** One ad of a move: its amount a day shifted, and its total (or its daily amount) with it; `moved` is the total's share. */
function shifted(ad: AdRead, perDayMinor: number, moved: number, today: string): AdRead {
  const amountMinor = ad.budget.amountMinor + (ad.budget.mode === "total" ? moved : perDayMinor);
  return {
    ...ad,
    aboutADayMinor: ad.aboutADayMinor + perDayMinor,
    budget: { ...ad.budget, amountMinor },
    budgetChangedDay: today,
    version: ad.version + 1,
  };
}

/** The verbs, over a world. Each finds the ad, refuses a stale press or an ad that is not ours to change, and changes it. */
export function makeVerbs(world: World, config: AdsConfig): AdsVerbs {
  const replace = (ad: AdRead) => {
    const read = world.get();
    world.put({ ...read, ads: read.ads.map((a) => (a.id === ad.id ? ad : a)) });
  };
  /** Put an ad back as it was, as a new version: what Undo does. */
  const restore = (before: AdRead) => {
    const now = world.get().ads.find((a) => a.id === before.id);
    replace({ ...before, version: (now ? now.version : before.version) + 1 });
  };
  const act = (id: string, version: number, make: (ad: AdRead, read: AdsRead) => AdRead, ours = true): AdsOutcome => {
    const read = world.get();
    const ad = read.ads.find((a) => a.id === id);
    if (!ad) return declined(REFUSED.gone);
    if (ad.version !== version) return declined(REFUSED.stale);
    if (ours && !ad.madeHere) return declined(REFUSED.adopted);
    replace({ ...make(ad, read), version: ad.version + 1 });
    return { ok: true, undo: () => restore(ad) };
  };
  /** The Ask line's move: an amount a day from one ad to another, until the first of the two ends. Undo puts both back. */
  const moveMoney = (apply: Extract<AskApply, { kind: "move" }>): AdsOutcome => {
    const read = world.get();
    const from = read.ads.find((a) => a.id === apply.fromId);
    const to = read.ads.find((a) => a.id === apply.toId);
    if (!from || !to) return declined(REFUSED.gone);
    const left = Math.min(daysBetween(read.today, from.endDay), daysBetween(read.today, to.endDay));
    const moved = apply.perDayMinor * Math.max(1, left + 1);
    replace(shifted(from, -apply.perDayMinor, -moved, read.today));
    replace(shifted(to, apply.perDayMinor, moved, read.today));
    return {
      ok: true,
      undo: () => {
        restore(from);
        restore(to);
      },
    };
  };
  return {
    pause: (id, version) => act(id, version, (ad) => ({ ...ad, state: "paused" }), false),
    resume: (id, version) => act(id, version, resumed, false),
    end: (id, version) => act(id, version, (ad, read) => ({ ...ad, state: "ended", endDay: read.today })),
    setBudget: (id, version, amountMinor) =>
      act(id, version, (ad, read) => amountMoved(ad, adWith(ad, read, { amountMinor }), read.today)),
    setEnd: (id, version, day) => act(id, version, (ad, read) => adWith(ad, read, { endDay: day })),
    setArea: (id, version, area) => act(id, version, (ad, read) => sentBack(adWith(ad, read, { area }), read)),
    setOffer: (id, version, serviceId) =>
      act(id, version, (ad, read) => {
        const service = adServiceOf(read, serviceId);
        if (!service) return ad;
        const copy = starterCopy({
          service: service.name,
          price: service.note,
          business: read.business,
          door: ad.door,
          word: read.appointmentWord,
        });
        return sentBack(adWith({ ...ad, copy }, read, { serviceId }), read);
      }),
    rename: (id, version, name) => act(id, version, (ad) => ({ ...ad, name })),
    save: (id, version, patch) =>
      act(id, version, (ad, read) => {
        const next = amountMoved(ad, adWith(ad, read, patch), read.today);
        return patchRestarts(ad, patch) ? sentBack(next, read) : next;
      }),
    turnOn: (draft, maxMinor) => {
      const read = world.get();
      const vm = newAdModel(draft, read, config);
      if (vm.blocked) return declined(vm.blocked.text);
      if (maxMinor !== vm.totalMinor) return declined(REFUSED.maximum);
      const id = crypto.randomUUID();
      world.put({ ...read, ads: [...read.ads, draftAd(draft, read, config, id)] });
      const pause = () => {
        const now = world.get().ads.find((a) => a.id === id);
        if (now) replace({ ...now, state: "paused", version: now.version + 1 });
      };
      return { ok: true, id, undo: pause };
    },
    answerAsk: (ask) => {
      const apply = ask.apply;
      if (!apply) return { ok: true, undo: () => undefined };
      if (apply.kind === "move") return moveMoney(apply);
      const ad = world.get().ads.find((a) => a.id === apply.adId);
      if (!ad) return declined(REFUSED.gone);
      return act(ad.id, ad.version, (a, read) => ({
        ...a,
        endDay: apply.endDay,
        budget: { mode: "total", amountMinor: apply.totalMinor },
        budgetChangedDay: read.today,
      }));
    },
    chooseAccount: (platform, externalId) => {
      const read = world.get();
      const before = read.accounts.find((a) => a.platform === platform);
      const pick = before?.choices.find((c) => c.externalId === externalId);
      if (!before || before.status !== "choose" || !pick) return declined(CHOOSE.gone);
      // A new account is read at once and has nothing set up yet: its first need is the payment method.
      const chosen: AdAccountRead = {
        ...before,
        status: "connected",
        name: pick.name,
        externalId: pick.externalId,
        currency: pick.currency,
        choices: [],
        checks: accountChecks(platform, ["payment"]),
        readAt: read.readAt,
        read: "ok",
      };
      const swap = (account: AdAccountRead) =>
        world.put({
          ...world.get(),
          accounts: world.get().accounts.map((a) => (a.platform === platform ? account : a)),
        });
      swap(chosen);
      return { ok: true, undo: () => swap(before) };
    },
  };
}

/** The tab's example, kept for the tab: a reload draws the one that was chosen. */
const EXAMPLE_KEY = "ads-mock-scenario";

const exampleOf = (value: unknown): AdsExample | undefined => ADS_EXAMPLES.find((e) => e === value);

/** The example kept for this tab, if any. Storage can be blocked (a private window): then there is none. */
function savedExample(): AdsExample | undefined {
  try {
    return exampleOf(window.sessionStorage.getItem(EXAMPLE_KEY));
  } catch {
    return undefined;
  }
}

function keepExample(example: AdsExample): void {
  try {
    window.sessionStorage.setItem(EXAMPLE_KEY, example);
  } catch {
    // Storage can be blocked (a private window): the example still changes, for this page.
  }
}

/** How long the mock takes to read an account again ("Try again"): a beat, so the page is seen reading before it has read. */
const READ_AGAIN_MS = 1200;

/** The page's one store: the read of the example chosen, the config, and the verbs. Changing the example resets the read. */
export function useAdsStore() {
  const [state, setState] = useState<{ example: AdsExample; read: AdsRead }>(() => ({
    example: "running",
    read: EXAMPLE_READS.running(),
  }));
  const latest = useRef(state.read);
  const reading = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [world] = useState<World>(() => ({
    get: () => latest.current,
    put: (read) => {
      latest.current = read;
      setState((s) => ({ ...s, read }));
    },
  }));
  const [verbs] = useState(() => makeVerbs(world, CONFIG));
  const stopReading = () => {
    if (reading.current !== null) clearTimeout(reading.current);
    reading.current = null;
  };
  const select = (example: AdsExample) => {
    stopReading();
    const read = EXAMPLE_READS[example]();
    latest.current = read;
    setState({ example, read });
  };
  // The example kept for the tab is read after the page mounts, never in its first state. Nothing reads again yet at mount,
  // so there is no timer to stop: only the refs and the setter are touched, and the effect runs once.
  useEffect(() => {
    const saved = savedExample();
    if (!saved || saved === "running") return;
    const read = EXAMPLE_READS[saved]();
    latest.current = read;
    setState({ example: saved, read });
  }, []);
  useEffect(() => rememberAdNames(state.read.ads), [state.read]);
  // A read that is going on when the page goes is let go of.
  useEffect(() => stopReading, []);
  const setExample = (example: AdsExample) => {
    keepExample(example);
    select(example);
  };
  // "Try again" on an account that could not be read: it reads, and a beat later it has read. Nothing is sent anywhere.
  const readAgain = (platform: AdPlatform) => {
    stopReading();
    world.put(withAccount(world.get(), platform, { read: "reading" }));
    reading.current = setTimeout(() => {
      reading.current = null;
      world.put(withAccount(world.get(), platform, { read: "ok", readAt: world.get().readAt }));
    }, READ_AGAIN_MS);
  };
  return { read: state.read, config: CONFIG, example: state.example, setExample, verbs, readAgain };
}
