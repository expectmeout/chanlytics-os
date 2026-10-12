/**
 * New ad, step 4: budget. For a set number of days (a total the platform enforces) or until the owner stops it (a daily
 * amount); three presets, each saying the day, the total and the end date, and the owner's own amount as a quiet word. Under
 * them the platform's lines (its floor, that it stops at the amount itself), its estimate where it gave one, and what the
 * earlier ads cost. Behind "More choices", whether it keeps to the business's hours (a switch where the platform allows it at
 * this budget, a line where it does not). Nothing here spends anything: the press that does is step 5's.
 */
import { BUDGET_RULES, CHIPS, NEW_AD, minorOfUnits, moneyOf } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { Field } from "../../../kit/field/field";
import { RecordDisclosure } from "../../../kit/record/disclosure";
import { Segmented } from "../../../kit/segmented/segmented";
import { Cap, Lines, OnOffRow, PickRow, Sec } from "./new-bits";
import type { StepProps } from "./new-bits";
import { floorOf, meetsFloor } from "./new-state";

/** "Your own amount": the amount a day, with what is wrong with it said at the box. */
function OwnAmount({ vm, state, config, patch, setExtra }: StepProps) {
  const { draft, extra } = state;
  const floor = floorOf(draft.platform, config);
  const typed = extra.ownText.trim();
  const clears = meetsFloor(draft.ownPerDayMinor, draft.platform, config);
  const problem =
    typed === "" || draft.ownPerDayMinor <= 0
      ? NEW_AD.step4.ownNeeds
      : !clears && floor !== null
        ? CHIPS.floor(draft.platform, moneyOf(floor, vm.currency), BUDGET_RULES[draft.platform].totalMaxDays)
        : undefined;
  const box = {
    label: NEW_AD.step4.ownLabel,
    type: "number",
    inputMode: "numeric",
    value: extra.ownText,
    unit: vm.ownUnit,
    onValueChange: (text: string) => {
      // Whole units a day; anything else is no amount yet, said at the box.
      const whole = Math.floor(Number(text));
      setExtra({ ownText: text });
      patch({ ownPerDayMinor: Number.isFinite(whole) && whole > 0 ? minorOfUnits(whole) : 0 });
    },
    "data-testid": "ads-new-own",
  } as const;
  if (problem === undefined) return <Field {...box} />;
  return <Field {...box} problem={problem} problemGlyph={<Icon name="alert" size={13} />} />;
}

/** Only while you're open: a switch where the platform can keep to the hours at this budget, else the line that says why not. */
function MoreChoices({ vm, patch }: StepProps) {
  const schedule = vm.schedule;
  return (
    <RecordDisclosure id="ads-new-more-choices" label={NEW_AD.step4.more} testid="ads-new-more-choices">
      {schedule.kind === "switch" ? (
        <OnOffRow
          label={schedule.label}
          hint={schedule.hint}
          checked={schedule.on}
          locked={schedule.locked}
          onChange={(on) => patch({ schedule: on ? "open-hours" : "always" })}
          testid="ads-new-open-only"
        />
      ) : (
        <Cap>{schedule.text}</Cap>
      )}
    </RecordDisclosure>
  );
}

export function StepBudget(p: StepProps) {
  const { vm, state, config, patch } = p;
  const { draft } = state;
  const [total, daily] = NEW_AD.step4.mode;
  const presets = vm.presets.filter((preset) => meetsFloor(preset.perDayMinor, draft.platform, config));
  const own = draft.presetId === "own";
  return (
    <>
      <Segmented
        label={NEW_AD.step4.modeLabel}
        value={draft.mode}
        onValueChange={(mode) => patch({ mode })}
        options={[
          { value: "total", label: total, testid: "ads-new-mode-total" },
          { value: "daily", label: daily, testid: "ads-new-mode-daily" },
        ]}
      />
      <Sec label={NEW_AD.step4.presetsLabel}>
        <div className="ads-new-presets" role="group" aria-label={NEW_AD.step4.presetsLabel}>
          {presets.map((preset) => (
            <PickRow
              key={preset.id}
              chosen={draft.presetId === preset.id}
              onPick={() => patch({ presetId: preset.id })}
              testid={`ads-new-preset-${preset.id}`}
            >
              <span className="ads-new-pick-verb">{preset.label}</span>
              <span className="ads-new-pick-line">{preset.rest}</span>
            </PickRow>
          ))}
          <PickRow chosen={own} onPick={() => patch({ presetId: "own" })} testid="ads-new-preset-own">
            <span className="ads-new-pick-verb">{NEW_AD.step4.own}</span>
            {own ? <span className="ads-new-pick-line">{vm.ownRest}</span> : null}
          </PickRow>
        </div>
        {own ? <OwnAmount {...p} /> : null}
      </Sec>
      <Lines lines={vm.lines} />
      {vm.estimate ? (
        <p className="cm-next" data-testid="ads-new-estimate">
          <Icon name="trending-up" size={13} />
          <span>{vm.estimate}</span>
        </p>
      ) : null}
      {vm.history ? <Cap>{vm.history}</Cap> : null}
      <MoreChoices {...p} />
    </>
  );
}
