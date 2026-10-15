/**
 * A customer's step opened in place (D6; the canvas's Editor board): its fields beside the message as one person reads it.
 * Left, how long after the step before it, what must still be true (they haven't booked, haven't written back), and the
 * message it sends, with a box for each value the message takes that is typed rather than filled by the run (contracts
 * defaultParamSpecs); a step's first has no wait and no condition, only its message. Right, that message as a person
 * reads it on each channel it holds a version for, a tab each (parts/preview-by.ts, the composers' one drawing), filled
 * for an example person, with the door to its words in Messages. The foot says what a save reaches. Saved through the
 * sequence's own doors (00442): a new step at the end, or this one changed; its words changed apart, since a WhatsApp
 * version not yet approved waits while the step sends its own (`waits`). The server judges the values against the
 * message (core templateValues) and says what it refused in words.
 */
import { useMemo, useState } from "react";
import {
  PREVIEW_CHANNEL_WORDS,
  SEQUENCE_EDIT_WORDS as E,
  addressOf,
  defaultParamSpecs,
  exampleParams,
  parseParamSpecs,
  messageAboutOfClass,
  slotLabels,
  stepApprovalOf,
  type ConsentChannel,
  type FollowUpCondition,
  type ParamSpec,
  type SequenceStepDto,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { LinkButton } from "../../kit/link-button/link-button";
import { StatePill } from "../../kit/pill/state-pill";
import { Select } from "../../kit/select/select";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { gate, routeDoor } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { cmBusinessOf, cmOfferedFrom, cmStandInOf, type CmOffered } from "../parts/channels";
import { MessagePreview } from "../parts/message-preview";
import { cmOfferFoot, cmPreviewBy } from "../parts/preview-by";
import { pressed } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** The waits a step may take, in days (00441: one to ninety). */
const WAITS = [1, 2, 3, 4, 5, 7, 10, 14, 21, 28, 30, 45, 60, 90] as const;

/** What must still hold, as one choice: the page's four, each a set of conditions. */
const STEP_HOLDS = {
  always: { label: E.holds.always, only: [] },
  no_booking: { label: E.holds.no_booking, only: ["no_booking"] },
  no_reply: { label: E.holds.no_reply, only: ["no_reply"] },
  neither: { label: E.holds.neither, only: ["no_booking", "no_reply"] },
} as const satisfies Record<string, { label: string; only: readonly FollowUpCondition[] }>;
type Hold = keyof typeof STEP_HOLDS;

const stepHoldOf = (only: readonly string[]): Hold =>
  only.includes("no_booking") && only.includes("no_reply")
    ? "neither"
    : only.includes("no_booking")
      ? "no_booking"
      : only.includes("no_reply")
        ? "no_reply"
        : "always";

const isHold = (v: string): v is Hold => v in STEP_HOLDS;

const chevron = <Icon name="chevron-down" size={12} />;

/** The words a step's message is sent with now where they are typed, by their place among its values. */
function typedOf(step: SequenceStepDto | null): Record<number, string> {
  const specs = step ? parseParamSpecs(step.params) : [];
  return Object.fromEntries(specs.flatMap((s, i) => (s.kind === "text" ? [[i, s.value] as const] : [])));
}

/** Whether two sets of typed words say the same. */
const sameTyped = (a: Record<number, string>, b: Record<number, string>) =>
  Object.keys({ ...a, ...b }).every((k) => (a[Number(k)] ?? "") === (b[Number(k)] ?? ""));

/** The message a step sends now, among those offered: by its name and language, else the first offered. */
const pickedOf = (offered: readonly CmOffered[], step: SequenceStepDto | null): string =>
  offered.find((m) => m.name === step?.template_name && m.language === (step?.template_language ?? m.language))?.id ??
  offered[0]?.id ??
  "";

/** The message as one person reads it on each channel it holds a version for, a tab each (the canvas's right half). */
function StepPreview({ picked, values, policyClass }: { picked: CmOffered; values: string[]; policyClass: string }) {
  const settings = useSurface("settings");
  const business = cmBusinessOf(settings);
  const channels = picked.channels.length > 0 ? picked.channels : [cmStandInOf(picked)];
  const [on, setOn] = useState<ConsentChannel>(channels[0] ?? "whatsapp");
  const channel = channels.includes(on) ? on : (channels[0] ?? "whatsapp");
  const preview = cmPreviewBy(
    {
      body: picked.body_preview,
      header: picked.header ?? null,
      footer: picked.footer ?? null,
      buttons: picked.buttons ?? null,
    },
    channel,
    {
      versions: picked.versions,
      language: picked.language,
      business: business.businessName,
      address: business.businessAddress,
      labelled: false,
      standIn: cmStandInOf(picked),
      ...cmOfferFoot(picked.category, messageAboutOfClass(policyClass)),
    },
  );
  return (
    <div className="sq-ed-preview" data-testid="sq-editor-preview">
      <p className="sq-ed-k">{E.previewAs}</p>
      {channels.length > 1 ? (
        <SubTabs
          dense
          label={E.previewAs}
          value={channel}
          onSelect={(id) => setOn(channels.find((c) => c === id) ?? channel)}
          tabs={channels.map((c) => ({ id: c, label: PREVIEW_CHANNEL_WORDS[c], testid: `sq-editor-on-${c}` }))}
        />
      ) : null}
      <MessagePreview from={business.businessName} values={values} {...preview} via={null} />
      <p className="sq-ed-note">{E.oneEach}</p>
    </div>
  );
}

/** Under the message's box: its name in Messages, its WhatsApp standing, and the door to its words there. */
function MessageFrom({ picked }: { picked: CmOffered }) {
  const approval = stepApprovalOf(picked.message?.versions.whatsapp?.status ?? null);
  return (
    <p className="sq-ed-from">
      <span>{E.savedIn(picked.title ?? picked.name)}</span>
      {approval ? <StatePill kind="tone" value={approval.tone} label={approval.label} /> : null}
      <LinkButton {...routeDoor(addressOf({ kind: "template", name: picked.name }))} data-testid="sq-editor-words">
        {E.inMessages} <Icon name="chevron" size={11} />
      </LinkButton>
    </p>
  );
}

interface StepEditorProps {
  sequenceId: string;
  /** The step changed, or none for a new one at the end. */
  step: SequenceStepDto | null;
  /** The class the sequence runs under: what its messages are about, which an email's foot says (cmOfferFoot). */
  policyClass: string;
  flash: Flash;
  onDone: () => void;
  onCancel: () => void;
}

export function StepEditor({ sequenceId, step, policyClass, flash, onDone, onCancel }: StepEditorProps) {
  const settings = useSurface("settings");
  const offered = useMemo(() => cmOfferedFrom(settings) ?? [], [settings]);
  const business = cmBusinessOf(settings).businessName;
  const first = step?.place === 1;
  const [days, setDays] = useState(String(step?.after_days ?? 3));
  const [hold, setHold] = useState<Hold>(stepHoldOf(step?.only_if ?? ["no_booking"]));
  const [message, setMessage] = useState<string>(() => pickedOf(offered, step));
  const picked = offered.find((m) => m.id === message) ?? null;
  const specs: ParamSpec[] = picked ? defaultParamSpecs(picked) : [];
  const labels = picked ? slotLabels(picked) : [];
  // A step's own typed words, shown and previewed as it sends them now, and kept unless they are changed.
  const [was] = useState(() => typedOf(step));
  const [typed, setTyped] = useState<Record<number, string>>(was);
  const [busy, setBusy] = useState(false);
  const params = specs.map((s, i) => (s.kind === "text" ? { kind: "text" as const, value: typed[i] ?? "" } : s));
  const wordsChanged = !step || picked?.name !== step.template_name || !sameTyped(typed, was);
  const waitChanged = !!step && !first && (days !== String(step.after_days ?? 3) || hold !== stepHoldOf(step.only_if));
  const changed = !step || wordsChanged || waitChanged;
  const byWhatsApp = !!picked?.channels.includes("whatsapp");

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    const only = [...STEP_HOLDS[hold].only];
    const fields = { sequence_id: sequenceId, after_days: Number(days), only_if: only };
    // A first step keeps its moment and its hour: only its words change, through the words door; a wait unchanged is
    // not written again.
    const keepsWait = first || (step !== null && !waitChanged);
    const ok = keepsWait
      ? true
      : await pressed(
          "sequence_step",
          step ? { ...fields, step_id: step.id } : { ...fields, template_id: picked.id, params },
          flash,
          () => {},
        );
    // A step that stays gets its new words apart: they may wait for WhatsApp while it sends its own.
    const worded =
      ok && step && wordsChanged
        ? await pressed(
            "sequence_words",
            { sequence_id: sequenceId, step_id: step.id, template_id: picked.id, params },
            flash,
            () => {},
          )
        : ok;
    setBusy(false);
    if (worded) onDone();
  };

  return (
    <div className="sq-editor" data-testid="sq-editor">
      <div className="sq-ed-split">
        <div className="sq-ed-fields">
          {first ? null : (
            <div className="sq-editor-row">
              <Field
                label={E.after}
                control={
                  <Select
                    value={days}
                    onValueChange={setDays}
                    chevron={chevron}
                    options={WAITS.map((d) => ({ value: String(d), label: E.days(d) }))}
                    data-testid="sq-editor-days"
                  />
                }
              />
              <Field
                label={E.only}
                control={
                  <Select
                    value={hold}
                    onValueChange={(v) => setHold(isHold(v) ? v : "always")}
                    chevron={chevron}
                    options={Object.entries(STEP_HOLDS).map(([value, h]) => ({ value, label: h.label }))}
                    data-testid="sq-editor-hold"
                  />
                }
              />
            </div>
          )}
          {offered.length === 0 ? (
            <p className="sq-msg-none">{E.noMessages}</p>
          ) : (
            <Field
              label={E.message}
              control={
                <Select
                  value={message}
                  onValueChange={(v) => {
                    setMessage(v);
                    // Another message takes its own words; the step's own come back with its own message.
                    setTyped(offered.find((m) => m.id === v)?.name === step?.template_name ? was : {});
                  }}
                  chevron={chevron}
                  options={offered.map((m) => ({
                    value: m.id,
                    label: m.title ?? m.name,
                    meta: m.channels.map((c) => PREVIEW_CHANNEL_WORDS[c]).join(", "),
                  }))}
                  data-testid="sq-editor-message"
                />
              }
            />
          )}
          {specs.map((s, i) =>
            s.kind === "text" ? (
              <Field
                key={`${message}-${i}`}
                label={labels[i] ?? E.value(i)}
                value={typed[i] ?? ""}
                onValueChange={(v) => setTyped((t) => ({ ...t, [i]: v }))}
                maxLength={200}
                data-testid={`sq-editor-value-${i}`}
              />
            ) : null,
          )}
          {picked ? <MessageFrom picked={picked} /> : null}
        </div>
        {picked ? (
          <StepPreview picked={picked} values={exampleParams(params, business)} policyClass={policyClass} />
        ) : null}
      </div>
      <div className="sq-ed-foot">
        <p className="sq-ed-reach">
          <b>{E.reaches(first)}</b>
          {byWhatsApp ? <span> · {E.whatsAppFirst}</span> : null}
        </p>
        <Button size="sm" onClick={onCancel} data-testid="sq-editor-cancel">
          {E.cancel}
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={() => void save()}
          disabled={busy || !picked || !changed}
          data-testid="sq-editor-save"
          {...gate("approve")}
        >
          {step ? E.save : E.add}
        </Button>
      </div>
    </div>
  );
}
