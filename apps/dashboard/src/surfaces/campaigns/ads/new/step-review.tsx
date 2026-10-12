/**
 * New ad, step 5: review, the one-sentence screen the drawer uses (the sentence itself stands under the head). Under it the
 * reach line ("Ready · account active · …", amber with the first thing missing), when it starts and what it can spend, the
 * platform's estimate, "Checked before turning on" as dot rows with how many are ready (a red row stops the press), and, folded,
 * what Chanlytics set for the owner on this platform. The one press that spends is the foot's, and it names the most it can
 * spend. It is stopped, with the reason and the door that mends it, while the platform's account is not ready or a need is not
 * met (the model's `blocked`, derived from the account's checks) or the privacy page link is missing. Nothing runs from this
 * screen until that press.
 */
import { useState } from "react";
import { NEW_AD, allWord } from "@chanlytics/contracts/ads-page";
import type { CheckRowVM, DoorVM, NewAdVM } from "@chanlytics/contracts/ads-page";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Popover } from "../../../kit/popover/popover";
import { RecordDisclosure } from "../../../kit/record/disclosure";
import { routeDoor } from "../../../legacy-verbs";
import { DotRows } from "./new-bits";
import type { StepProps } from "./new-bits";

/** The most checks a phone shows before "All 8", and the ones that need a look always show. */
const PHONE_CHECKS = 3;

/** The reach line (parts/reach.tsx CmReachLine's shape): a dot and what the account stands on, the rest in a popover. */
function ReadyLine({ ready }: { ready: NewAdVM["ready"] }) {
  return (
    <div className="cm-reach-line" data-tone={ready.tone} data-testid="ads-new-ready">
      <Popover
        label={NEW_AD.step5.readyLabel}
        align="start"
        className="cm-reach-box"
        trigger={
          <LinkButton className="cm-reach-press" data-testid="ads-new-ready-press">
            <span className="cm-reach-dot" data-tone={ready.tone} aria-hidden="true" />
            <span className="cm-reach-said">
              <span className="cm-reach-count">{ready.said}</span>
            </span>
            <Icon name="chevron" size={11} />
          </LinkButton>
        }
      >
        <DotRows rows={ready.rows} />
      </Popover>
    </div>
  );
}

/** The rows a phone shows first: every one that needs a look, then enough of the rest to make three. */
function phoneRows(rows: readonly CheckRowVM[]): CheckRowVM[] {
  const look = rows.filter((r) => r.tone !== "ok");
  const rest = rows.filter((r) => r.tone === "ok");
  return [...look, ...rest.slice(0, Math.max(0, PHONE_CHECKS - look.length))];
}

/** "Checked before turning on · 7 of 7 ready": in a fold on a desk; on a phone its first rows and the way to all of them. */
function Checked({ checked, phone }: { checked: NewAdVM["checked"]; phone: boolean }) {
  const [all, setAll] = useState(false);
  const label = `${NEW_AD.step5.checked} · ${checked.said}`;
  const look = checked.rows.some((r) => r.tone !== "ok");
  if (!phone) {
    return (
      <RecordDisclosure id="ads-new-checked" label={label} forceOpen={look} testid="ads-new-checked">
        <DotRows rows={checked.rows} />
      </RecordDisclosure>
    );
  }
  const shown = all ? checked.rows : phoneRows(checked.rows);
  return (
    <div className="ads-new-checked" data-testid="ads-new-checked">
      <h4 className="ads-new-sec-k">{label}</h4>
      <DotRows rows={shown} />
      {shown.length < checked.rows.length ? (
        <LinkButton className="ads-new-all" onClick={() => setAll(true)} data-testid="ads-new-checked-all">
          {allWord(checked.rows.length)}
          <Icon name="chevron" size={11} />
        </LinkButton>
      ) : null}
    </div>
  );
}

/** What Chanlytics set for the owner on this platform: folded, one line each, read-only. */
function SetFor({ setFor }: { setFor: NewAdVM["setFor"] }) {
  return (
    <RecordDisclosure id="ads-new-set-for" label={setFor.label} testid="ads-new-set-for">
      <ul className="ads-new-lines" data-testid="ads-new-set-for-rows">
        {setFor.rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </RecordDisclosure>
  );
}

/** What stops the press, said at the top as the drawer says it: one line, and the way to mend it. */
function Blocked({ text, door, onFix }: { text: string; door?: DoorVM; onFix?: () => void }) {
  return (
    <p className="cm-callout" data-testid="ads-new-blocked">
      <Icon name="notice" size={14} />
      <span className="cm-callout-words">{text}</span>
      {door ? (
        <LinkButton className="cm-callout-door" {...routeDoor(door.to)} data-testid="ads-new-blocked-door">
          {door.words}
          <Icon name="chevron" size={11} />
        </LinkButton>
      ) : (
        <LinkButton className="cm-callout-door" onClick={onFix} data-testid="ads-new-blocked-fix">
          {NEW_AD.step5.fix}
          <Icon name="chevron" size={11} />
        </LinkButton>
      )}
    </p>
  );
}

export function StepReview({ vm, state, read, phone, setStep }: StepProps) {
  const { draft, extra } = state;
  const privacyMissing = draft.door === "form" && extra.privacy.trim() === "";
  const quiet = draft.door === "call" ? NEW_AD.step5.quietCalls : NEW_AD.step5.quiet(vm.drawer.owner);
  return (
    <>
      {vm.blocked ? <Blocked text={vm.blocked.text} door={vm.blocked.door} /> : null}
      {privacyMissing ? <Blocked text={NEW_AD.step2.privacyNeeded} onFix={() => setStep(2)} /> : null}
      {read.calendar.linked ? null : (
        <p className="cm-callout" data-tone="plain" data-testid="ads-new-no-calendar">
          <Icon name="calendar" size={14} />
          <span className="cm-callout-words">{NEW_AD.step5.noCalendar}</span>
        </p>
      )}
      <ReadyLine ready={vm.ready} />
      <p className="cm-next" data-testid="ads-new-forecast">
        <Icon name="calendar" size={13} />
        <span>{vm.forecast}</span>
      </p>
      {vm.estimate ? (
        <p className="cm-next" data-testid="ads-new-estimate">
          <Icon name="trending-up" size={13} />
          <span>{vm.estimate}</span>
        </p>
      ) : null}
      <Checked checked={vm.checked} phone={phone} />
      <SetFor setFor={vm.setFor} />
      <p className="ads-new-quiet">{quiet}</p>
    </>
  );
}
