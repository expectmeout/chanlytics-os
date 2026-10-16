/**
 * Campaigns › Ads, New ad (MOCKUP; frontend only, nothing leaves the browser): the sheet an ad is made in, five steps kept
 * (what should people do, the ad, where and who, budget, review) in the one-sentence grammar the drawers speak (Ruben, 11
 * Oct 2026, "Option B"). It opens already filled from the workspace (the top Service, the newest post, 5 miles, the first door
 * that is ready, the smallest preset for a first ad and Steady after it), so every step is a confirmation; the head carries "2 of 5" and five dots, a quiet
 * Review jumps to the last step, and under the head ONE sentence stands, its words pressed to jump to their step. The foot says
 * "Nothing runs until you press Turn on.", Back, and one primary; the only press that spends is Turn on, and it names the
 * most it can spend. It is stopped, with the reason and the door that mends it, while the platform's account is not ready.
 *
 * Hosted as New message is (home/new-message.tsx): PaneSheet, wide, `askFirst`, `footCloses`; Cancel with something changed
 * asks once (useUnsavedWork). The address says what is open (`campaigns/ads:new[:door]`, or `:new:<copy|again|google>:<id>`
 * for an ad to start from, which opens on the last step with its name saying where it came from), which the Ads page parses
 * and hands in as `compose`; closed, the composer draws nothing, and each opening starts afresh. Only the owner turns an ad
 * on: for anyone else the last step's press asks the owner (a toast; the mockup keeps no draft for them).
 */
import { useEffect, useRef } from "react";
import type { AdPlatform, AdsAddress, AdsConfig, AdsRead } from "@chanlytics/contracts";
import { BUDGET_RULES, CHIPS, DOOR, NEW_AD, moneyOf, newAdModel } from "@chanlytics/contracts/ads-page";
import type { AdDraft, ChipId, DoorVM, NewAdVM } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { Field } from "../../../kit/field/field";
import { Icon } from "../../../kit/icon/icon";
import { useUnsavedWork } from "../../../kit/record/work";
import { useKept } from "../../home/pane-sheet";
import { PaneSheet } from "../../home/pane-sheet";
import { CmPane, useCmPhone } from "../../parts/split";
import type { Flash } from "./new-bits";
import { NewFoot } from "./new-foot";
import { NewLead } from "./new-sentence";
import {
  STEP_AFTER,
  STEP_BEFORE,
  STEP_LIST,
  floorOf,
  ownIsValid,
  useFreshness,
  useIsOwner,
  useNewAd,
  useTapHint,
} from "./new-state";
import type { Step } from "./new-state";
import { StepBody } from "./steps";

interface NewAdProps {
  /** What the address asks for (the door it opens on), or null while the composer is closed. */
  compose: AdsAddress["compose"];
  read: AdsRead;
  config: AdsConfig;
  onClose: () => void;
  /**
   * Turn on was pressed (by the owner): the draft as they drew it, and the most it can spend as they read it. The page asks the
   * store, and answers whether the ad went: if so it closes the composer, lands the row and says the toast with its Undo; if
   * not it says why, and the composer stays as it was. A draft with `alsoGoogle` asks the page to go on to the Google ad from the
   * new one: `adFollowOn(draft, id)` is the address.
   */
  onTurnOn: (draft: AdDraft, maxMinor: number | null) => boolean;
  /** The page's toast: "Also run on Google" says its line through it. */
  flash: Flash;
}

/** The step a word of the sentence belongs to, so pressing it goes there. */
const STEP_OF_CHIP: Record<ChipId, Step> = { door: 1, offer: 2, platform: 3, area: 3, amount: 4, end: 4 };

/** The five dots, the one in view filled: 6px each, quiet. */
function StepDots({ step }: { step: Step }) {
  return (
    <span className="ads-new-stepdots" role="img" aria-label={NEW_AD.stepLabel(step)}>
      {STEP_LIST.map((n) => (
        <span key={n} className="ads-new-stepdot" data-state={n < step ? "done" : n === step ? "now" : "todo"} />
      ))}
    </span>
  );
}

interface SheetProps extends NewAdProps {
  /** What the address asked to open on: a door, or an ad to start from. */
  opening: NonNullable<AdsAddress["compose"]>;
  open: boolean;
}

/** What the foot says over its acts: what stops the press (and the door that mends it), else that nothing runs until Turn on. */
function sayOf(o: {
  step: Step;
  ownBad: boolean;
  privacyBad: boolean;
  ownText: string;
  floorMinor: number | null;
  platform: AdPlatform;
  vm: NewAdVM;
}): { text: string; tone?: "danger"; door?: DoorVM | null } {
  const { step, ownBad, privacyBad, floorMinor, platform, vm } = o;
  if (step >= 4 && ownBad) {
    const floor = floorMinor !== null && o.ownText.trim() !== "";
    const text = floor
      ? CHIPS.floor(platform, moneyOf(floorMinor, vm.currency), BUDGET_RULES[platform].totalMaxDays)
      : NEW_AD.step4.ownNeeds;
    return { text, tone: "danger" as const };
  }
  if (step === 5 && privacyBad) return { text: NEW_AD.step2.privacyNeeded, tone: "danger" as const };
  if (step === 5 && vm.blocked) return { text: vm.blocked.text, tone: "danger" as const, door: vm.blocked.door };
  return { text: step === 5 ? NEW_AD.say : NEW_AD.sayFirst };
}

function NewAdSheet({ opening, open, read, config, onClose, onTurnOn, flash }: SheetProps) {
  const phone = useCmPhone();
  const owner = useIsOwner();
  const { state, step, setStep, patch, setExtra, dirty } = useNewAd({ read, config, opening });
  const [hint, dismissHint] = useTapHint();
  const work = useUnsavedWork("ad", "new", { value: state, dirty, onLeave: onClose });
  const heading = useRef<HTMLHeadingElement | null>(null);
  const seen = useRef<Step>(step);
  const { draft, extra } = state;
  const vm = newAdModel(draft, read, config);
  const ownBad = draft.presetId === "own" && !ownIsValid(draft, config);
  const privacyBad = draft.door === "form" && extra.privacy.trim() === "";
  // The step in view takes the top of the body and the focus, so a screen reader hears where it is.
  useEffect(() => {
    if (seen.current === step) return;
    seen.current = step;
    const h = heading.current;
    if (!h) return;
    const body = h.closest(".cm-pane-body");
    if (body) body.scrollTop = 0;
    h.focus({ preventScroll: true });
  }, [step]);
  const go = (next: Step) => {
    dismissHint();
    setStep(next);
  };
  const turnOn = () => {
    // Only the owner turns an ad on. A member who is not the owner asks: the mockup keeps no draft for the owner, so it is
    // the toast alone, and the composer closes as it would after a send.
    if (!owner) {
      flash({ msg: NEW_AD.askOwnerSent });
      work.done();
      onClose();
      return;
    }
    const name = draft.name === null ? null : draft.name.trim() || null;
    if (onTurnOn({ ...draft, name }, vm.totalMinor)) work.done();
  };
  const kicker =
    step === 5
      ? NEW_AD.step5.kicker(DOOR[draft.door].label)
      : phone
        ? `${NEW_AD.kicker} · ${NEW_AD.stepOf(step)}`
        : NEW_AD.kicker;
  const stopped = (step === 4 && ownBad) || (step === 5 && (ownBad || privacyBad || vm.blocked !== null));
  return (
    <PaneSheet open={open} title={kicker} onClose={onClose} askFirst wide footCloses={step === 1} testid="ads-new">
      <CmPane
        testid="ads-new-pane"
        className="ads-new-pane"
        title={
          <span className="pb-title-wrap">
            <Field
              className="pb-title-box"
              shape="title"
              value={draft.name ?? vm.name}
              placeholder={vm.name}
              onValueChange={(name) => patch({ name })}
              maxLength={80}
              spellCheck={false}
              aria-label={NEW_AD.nameLabel}
              data-testid="ads-new-name"
            />
            <Icon name="pencil" size={13} />
          </span>
        }
        sub={phone ? <StepDots step={step} /> : null}
        tools={
          <>
            {phone ? null : (
              <>
                <span className="ads-new-count" data-testid="ads-new-count">
                  {NEW_AD.stepOf(step)}
                </span>
                <StepDots step={step} />
              </>
            )}
            {step < 5 ? (
              <Button
                variant="quiet"
                size="sm"
                title={NEW_AD.reviewTitle}
                onClick={() => go(5)}
                data-testid="ads-new-review"
              >
                {NEW_AD.review}
              </Button>
            ) : null}
          </>
        }
        onClose={work.leave}
        closeLabel={NEW_AD.cancel}
        foot={
          <NewFoot
            step={step}
            work={work}
            say={sayOf({
              step,
              ownBad,
              privacyBad,
              ownText: extra.ownText,
              floorMinor: floorOf(draft.platform, config),
              platform: draft.platform,
              vm,
            })}
            primary={step < 5 ? (NEW_AD.next.at(step - 1) ?? "") : owner ? vm.turnOn : NEW_AD.askOwner}
            stopped={stopped}
            owner={owner}
            onBack={step === 1 ? work.leave : () => go(STEP_BEFORE[step])}
            onPrimary={step === 5 ? turnOn : () => go(STEP_AFTER[step])}
          />
        }
      >
        <div className="ads-new cm-sentence" data-step={step} data-testid="ads-new-body">
          <NewLead
            // The draft opens filled in (Services, the newest post, the area, the smallest amount), so the sentence is read
            // whole from the first step: each chip is a door to the step that holds it, never a blank to fill.
            parts={vm.sentence}
            step={step}
            hint={hint}
            phone={phone}
            onChip={(id) => go(STEP_OF_CHIP[id])}
          />
          <StepBody
            ref={heading}
            step={step}
            vm={vm}
            state={state}
            read={read}
            config={config}
            phone={phone}
            patch={patch}
            setExtra={setExtra}
            setStep={go}
          />
        </div>
      </CmPane>
    </PaneSheet>
  );
}

export function NewAd(props: NewAdProps) {
  const compose = useKept(props.compose);
  const fresh = useFreshness(props.compose !== null);
  if (compose === null) return null;
  // Each opening starts afresh, and so does a different start (the Google ad from the one just turned on) at the same address.
  const from = compose.from ? `${compose.from.how}:${compose.from.id}` : "";
  return (
    <NewAdSheet key={`${fresh}:${compose.door}:${from}`} {...props} opening={compose} open={props.compose !== null} />
  );
}
