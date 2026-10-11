/**
 * What New ad holds while it is open (MOCKUP): the model's draft (contracts new-ad.ts), the settings only the screens draw (the
 * frame in view, the form's details), and the step. Nothing is sent: a press changes this and nothing else. The draft opens
 * pre-filled (newAdDefaults, or newAdFrom an ad the address names, which lands on the last step) so every step is a
 * confirmation, and a change to one field moves the fields that depended on it (a door moves the platform, a platform moves the
 * post, a kind of media moves the post, a special category lifts the area).
 */
import { useEffect, useState } from "react";
import { MINOR_PER_UNIT } from "@chanlytics/contracts";
import type { AdDoor, AdPlatform, AdsAddress, AdsConfig, AdsRead } from "@chanlytics/contracts";
import {
  ADS_SPECIAL_MILES,
  newAdDefaults,
  newAdFrom,
  newestPostFor,
  platformsFor,
  smallestPreset,
} from "@chanlytics/contracts/ads-page";
import type { AdDraft } from "@chanlytics/contracts/ads-page";
import { mayAtLeast, onRolesChanged } from "../../../legacy-verbs";
import type { FrameKind } from "../drawer/preview";

export type Step = 1 | 2 | 3 | 4 | 5;

export const STEP_LIST: readonly Step[] = [1, 2, 3, 4, 5];

/** The step before and the step after: the first has none before it, the last none after. */
export const STEP_BEFORE: Record<Step, Step> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };
export const STEP_AFTER: Record<Step, Step> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 5 };

/** How a form ad ends for the person who sent it. */
export type Completion = "whatsapp" | "call" | "none";

/** What only the screens draw: nothing the model derives a sentence from. */
export interface NewExtras {
  /** Which shape a Meta feed ad is drawn in: the preview's Feed | Story | Reel. */
  frame: FrameKind;
  /** A form's one dropdown of the business's own services. */
  askService: boolean;
  privacy: string;
  completion: Completion;
  /** The amount typed in "Your own amount", in whole units. */
  ownText: string;
}

export interface NewState {
  draft: AdDraft;
  extra: NewExtras;
}

/** Whether a daily amount clears the platform's floor, read from the ad account: "at least" it, on Meta and on TikTok alike. */
export function meetsFloor(perDayMinor: number, platform: AdPlatform, config: AdsConfig): boolean {
  const floor = config.minPerDayMinor[platform];
  if (floor === null) return perDayMinor > 0;
  return perDayMinor >= floor;
}

/** The floor the platform states a day (minor units), or null where it states none (Google's is a total over 3 to 90 days). */
export const floorOf = (platform: AdPlatform, config: AdsConfig): number | null => config.minPerDayMinor[platform];

/** The preset a draft keeps: its own while it clears the platform's floor, else the smallest that does, else the owner's amount. */
function keptPreset(d: AdDraft, config: AdsConfig): AdDraft["presetId"] {
  const clears = (id: string) => {
    const p = config.presets.find((x) => x.id === id);
    return p !== undefined && meetsFloor(p.perDayMinor, d.platform, config);
  };
  if (d.presetId === "own" || clears(d.presetId)) return d.presetId;
  const smallest = [...config.presets]
    .sort((a, b) => a.perDayMinor * a.days - b.perDayMinor * b.days)
    .find((p) => meetsFloor(p.perDayMinor, d.platform, config));
  return smallest ? smallest.id : "own";
}

interface Basis {
  read: AdsRead;
  config: AdsConfig;
}

/** The post the ad starts from on a platform: the newest of the kind it shows, used as it is. */
function postOn(read: AdsRead, platform: AdPlatform, format: AdDraft["format"]): Pick<AdDraft, "postId" | "postMode"> {
  const newest = newestPostFor(read.posts, platform, format);
  return { postId: newest ? newest.id : null, postMode: "as-is" };
}

/** A change to the draft, and what it moves: the platform follows the door, the post the platform and the kind of media. */
function applyPatch(draft: AdDraft, patch: Partial<AdDraft>, basis: Basis): AdDraft {
  let next: AdDraft = { ...draft, ...patch };
  if (patch.door !== undefined && patch.door !== draft.door) {
    next = { ...next, platform: platformsFor(patch.door).at(0) ?? "meta" };
  }
  if (next.platform !== draft.platform) {
    // TikTok's ad is always a video; Meta's starts as a photo. The Google one is not a "also run on Google" of itself.
    const format: AdDraft["format"] = next.platform === "tiktok" ? "video" : "photo";
    next = { ...next, format, ...postOn(basis.read, next.platform, format), alsoGoogle: false };
  } else if (patch.format !== undefined && patch.format !== draft.format) {
    next = { ...next, ...postOn(basis.read, next.platform, next.format) };
  }
  if (next.special && next.platform === "meta" && next.areaMiles < ADS_SPECIAL_MILES) {
    next = { ...next, areaMiles: ADS_SPECIAL_MILES };
  }
  return { ...next, presetId: keptPreset(next, basis.config) };
}

/** The screens' own settings, as New ad opens. */
function extrasOf(read: AdsRead, ownPerDayMinor: number | null): NewExtras {
  return {
    frame: "feed",
    askService: false,
    privacy: `https://${read.business.site}/privacy`,
    completion: "whatsapp",
    ownText: ownPerDayMinor === null ? "10" : String(Math.round(ownPerDayMinor / MINOR_PER_UNIT)),
  };
}

/** What the address asked New ad to open on: a door, or an ad to start from. */
type Opening = NonNullable<AdsAddress["compose"]>;

/**
 * New ad as it opens: filled from the workspace on a door, every step a confirmation (a first ad starts on the smallest preset
 * (newAdDefaults); one with ads before it, on Steady, the one the sample runs); or filled from the ad the address names (a
 * copy, the same ad again, its offer on Google), where everything is chosen and it opens on the last step. An address naming an
 * ad the store does not hold opens a plain New ad.
 */
function initialState(o: { basis: Basis; opening: Opening }): { state: NewState; step: Step } {
  const { basis, opening } = o;
  const source = opening.from ? basis.read.ads.find((a) => a.id === opening.from?.id) : undefined;
  if (opening.from && source) {
    const draft = newAdFrom(source, opening.from.how, basis.read);
    // The same offer on Google keeps its own amount: it starts on the smallest the platform offers.
    const smallest = smallestPreset(basis.config);
    const patch: Partial<AdDraft> = opening.from.how === "google" && smallest ? { presetId: smallest.id } : {};
    const filled = applyPatch(draft, patch, basis);
    return { state: { draft: filled, extra: extrasOf(basis.read, filled.ownPerDayMinor) }, step: 5 };
  }
  const door: AdDoor = opening.from ? "whatsapp" : opening.door;
  const first = basis.read.ads.length === 0;
  const patch: Partial<AdDraft> = first ? { door } : { door, presetId: "steady" };
  const draft = applyPatch(newAdDefaults(basis.read, basis.config), patch, basis);
  return { state: { draft, extra: extrasOf(basis.read, null) }, step: 1 };
}

/** Whether the owner's own amount is a number that clears the platform's floor. */
export function ownIsValid(draft: AdDraft, config: AdsConfig): boolean {
  return draft.ownPerDayMinor > 0 && meetsFloor(draft.ownPerDayMinor, draft.platform, config);
}

/** What New ad keeps and does: the draft and the screens' settings, the step, and the ways to change them. */
export function useNewAd(o: { read: AdsRead; config: AdsConfig; opening: Opening }) {
  const basis: Basis = { read: o.read, config: o.config };
  const [opened] = useState(() => initialState({ basis, opening: o.opening }));
  const [state, setState] = useState<NewState>(opened.state);
  const [step, setStep] = useState<Step>(opened.step);
  const patch = (p: Partial<AdDraft>) => setState((s) => ({ ...s, draft: applyPatch(s.draft, p, basis) }));
  const setExtra = (p: Partial<NewExtras>) => setState((s) => ({ ...s, extra: { ...s.extra, ...p } }));
  const dirty = JSON.stringify(state) !== JSON.stringify(opened.state);
  return { state, step, setStep, patch, setExtra, dirty };
}

/**
 * Whether the member acting is the owner (View-as included): only the owner turns an ad on, so for anyone else the foot asks
 * the owner instead. It redraws when the role store changes.
 */
export function useIsOwner(): boolean {
  const [, setTick] = useState(0);
  useEffect(() => onRolesChanged(() => setTick((n) => n + 1)), []);
  return mayAtLeast("owner");
}

/** The tab's note that "Tap any highlighted word to change it" has been shown: it is said once, then not again. */
const TAP_HINT_KEY = "ads-new-tap-hint";

function readTapHint(): boolean {
  try {
    return window.sessionStorage.getItem(TAP_HINT_KEY) === "seen";
  } catch {
    return false;
  }
}

/**
 * Whether to say "Tap any highlighted word to change it", and how to mark it said (once the owner moves on). The tab's note is
 * read after the sheet mounts, never in its first state: until then the line is not said.
 */
export function useTapHint(): [boolean, () => void] {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    if (!readTapHint()) setSeen(false);
  }, []);
  const dismiss = () => {
    setSeen(true);
    try {
      window.sessionStorage.setItem(TAP_HINT_KEY, "seen");
    } catch {
      // Storage can be blocked (a private window): the line is simply said again next time.
    }
  };
  return [!seen, dismiss];
}

/** The same composer, fresh each time it opens: a count that goes up as `open` turns on. */
export function useFreshness(open: boolean): number {
  const [count, setCount] = useState(0);
  const [was, setWas] = useState(open);
  if (open !== was) {
    setWas(open);
    if (open) setCount(count + 1);
  }
  return count;
}
