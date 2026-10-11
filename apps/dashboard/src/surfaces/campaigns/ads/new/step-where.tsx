/**
 * New ad, step 3: where and who. Where it runs (one platform per ad, its standing as a dot and a word, a two-way choice for a
 * form, and on Meta the press that sets up the same offer on Google once this one is on), the placements it is on, the area as
 * a word of a sentence, the one question about a job, a loan or a home, the age floor (locked, with its why), and who the
 * platform looks for. Nothing here spends anything.
 */
import { useId } from "react";
import {
  ADS_SPECIAL_MILES,
  CHIPS,
  NEW_AD,
  PLATFORM_WORD,
  STANDING,
  adAccountOf,
  accountRows,
  platformsFor,
} from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Picker } from "../../../kit/picker/picker";
import type { PickerGroup } from "../../../kit/picker/picker";
import { Segmented } from "../../../kit/segmented/segmented";
import { cmChevron } from "../../parts/picks";
import { Cap, DotRows, Sec } from "./new-bits";
import type { StepProps } from "./new-bits";

/** The word an account's standing is said in: connected, needing the owner, not connected, to choose, or to connect again. */
function standingWords(status: string, unmet: number): { tone: "ok" | "warn"; word: string } {
  if (status === "connected")
    return unmet > 0 ? { tone: "warn", word: STANDING.needsYou } : { tone: "ok", word: STANDING.connected };
  if (status === "choose") return { tone: "warn", word: STANDING.choose };
  if (status === "lapsed") return { tone: "warn", word: STANDING.lapsed };
  return { tone: "warn", word: STANDING.off };
}

/** Where it runs: the platform the door runs on, its standing, and what it still needs. */
function RunsOn({ state, read, patch }: StepProps) {
  const { platform, alsoGoogle } = state.draft;
  const door = state.draft.door;
  const platforms = platformsFor(door);
  const unmet = accountRows(read, platform).filter((r) => r.tone === "warn");
  const { tone, word } = standingWords(adAccountOf(read, platform)?.status ?? "not-connected", unmet.length);
  return (
    <Sec label={NEW_AD.step3.runsOn}>
      {platforms.length > 1 ? (
        <Segmented
          label={NEW_AD.step3.platformLabel}
          value={platform}
          onValueChange={(next) => patch({ platform: next })}
          options={platforms.map((p) => ({ value: p, label: PLATFORM_WORD[p], testid: `ads-new-on-${p}` }))}
        />
      ) : null}
      <p className="ads-new-run" data-tone={tone} data-testid="ads-new-run">
        <span className="ads-new-dot" data-tone={tone} aria-hidden="true" />
        <span className="ads-new-run-name">{PLATFORM_WORD[platform]}</span>
        <span className="ads-new-run-word">{word}</span>
      </p>
      {unmet.length > 0 ? <DotRows rows={unmet} /> : null}
      {platform === "meta" ? (
        <>
          <LinkButton
            className="ads-new-also"
            aria-pressed={alsoGoogle}
            onClick={() => patch({ alsoGoogle: !alsoGoogle })}
            data-testid="ads-new-also-google"
          >
            {alsoGoogle ? <Icon name="check" size={11} /> : null}
            {NEW_AD.step3.alsoGoogle}
            {alsoGoogle ? null : <Icon name="chevron" size={11} />}
          </LinkButton>
          {alsoGoogle ? <Cap>{NEW_AD.step3.alsoGoogleNote}</Cap> : null}
        </>
      ) : null}
    </Sec>
  );
}

/** The placements it is on, and the ones that are off and why. */
function Placements({ state }: StepProps) {
  const { platform } = state.draft;
  if (platform === "tiktok") return <Cap>{NEW_AD.step3.placementsTiktok}</Cap>;
  if (platform === "google") return <Cap>{NEW_AD.step3.placementsGoogle}</Cap>;
  return (
    <>
      <Cap>{NEW_AD.step3.placementsMeta}</Cap>
      <Cap>{NEW_AD.step3.placementsOff}</Cap>
    </>
  );
}

/** The area as a word of its sentence: miles around the address, with Meta's estimate of the people it holds where it gave one. */
function AreaSec({ state, read, config, patch }: StepProps) {
  const { platform, areaMiles, special } = state.draft;
  if (platform === "tiktok") {
    return (
      <Sec>
        <p className="ads-new-area">{NEW_AD.step3.areaTiktok(NEW_AD.zip)}</p>
        <Cap>{CHIPS.areaTiktok}</Cap>
      </Sec>
    );
  }
  const meta = platform === "meta";
  const areas = config.areas.filter((a) => !(special && meta) || a.miles >= ADS_SPECIAL_MILES);
  const groups: PickerGroup<string>[] = [
    {
      options: areas.map((a) => ({
        value: String(a.miles),
        label: NEW_AD.miles(a.miles),
        ...(meta && a.people ? { sub: CHIPS.areaPeople(a.people[0], a.people[1]) } : {}),
      })),
    },
  ];
  const here = areas.find((a) => a.miles === areaMiles);
  return (
    <Sec>
      <p className="ads-new-area" data-testid="ads-new-area">
        {meta ? NEW_AD.step3.area : NEW_AD.step3.areaGoogle}{" "}
        <Picker
          label={NEW_AD.step3.areaPicker}
          value={String(areaMiles)}
          onValueChange={(miles) => patch({ areaMiles: Number(miles) })}
          groups={groups}
          chevron={cmChevron()}
          face={NEW_AD.miles(areaMiles)}
          note={meta ? CHIPS.areaSmall : undefined}
          inline
          data-testid="ads-new-miles"
        />{" "}
        {NEW_AD.step3.of} {read.business.street}
      </p>
      {meta && here?.people ? <Cap>{CHIPS.areaPeople(here.people[0], here.people[1])}</Cap> : null}
      <Cap>{meta ? NEW_AD.step3.regulars : CHIPS.areaGoogle}</Cap>
    </Sec>
  );
}

/** The one question, asked per ad and never inferred: a job, a loan or a home. */
function SpecialSec({ state, patch }: StepProps) {
  const id = useId();
  const { special, platform } = state.draft;
  return (
    <Sec>
      <p className="ads-new-ask" id={id}>
        {NEW_AD.step3.special}
      </p>
      <Segmented
        labelledBy={id}
        value={special ? "yes" : "no"}
        onValueChange={(next) => patch({ special: next === "yes" })}
        options={[
          { value: "no", label: NEW_AD.step3.no, testid: "ads-new-special-no" },
          { value: "yes", label: NEW_AD.step3.yes, testid: "ads-new-special-yes" },
        ]}
      />
      {special && platform === "meta" ? <Cap>{NEW_AD.step3.yesNote}</Cap> : null}
    </Sec>
  );
}

/** The age floor, which nobody chooses here: 18 and over (25 for a cosmetic service on TikTok), and why. */
function AgesSec({ vm }: StepProps) {
  const ages = vm.ages;
  if (ages === null) return null;
  return (
    <Sec>
      <p className="ads-new-ages" data-testid="ads-new-ages">
        <Icon name="lock" size={12} />
        <span className="ads-new-ages-k">{ages.label}</span>
        <span className="ads-new-ages-v">{ages.line}</span>
      </p>
      <Cap>{ages.why}</Cap>
    </Sec>
  );
}

export function StepWhere(p: StepProps) {
  const { platform, door } = p.state.draft;
  return (
    <>
      <RunsOn {...p} />
      <Placements {...p} />
      <AreaSec {...p} />
      <SpecialSec {...p} />
      <AgesSec {...p} />
      <p className="ads-new-who" data-testid="ads-new-who">
        <span className="ads-new-dot" data-tone="ok" aria-hidden="true" />
        {NEW_AD.step3.who(platform, door)}
      </p>
    </>
  );
}
