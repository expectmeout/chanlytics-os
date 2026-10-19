/**
 * A customer's step changed in its sheet (step-sheet.tsx; the canvas's Editor board): its fields beside the message as one
 * person reads it.
 * Left, how long after the step before it, what must still be true (they haven't booked, haven't written back), and the
 * message it sends, with a box for each value the message takes that is typed rather than filled by the run (contracts
 * defaultParamSpecs); a step's first has no wait and no condition, only its message. Right, that message as a person
 * reads it on each channel it holds a version for, a tab each (parts/preview-by.ts, the composers' one drawing), filled
 * for an example person, or read as someone of the batch that waits for this step (the canvas's "As Ana Morales"): their
 * own first name and the channel they are reached on, and who gets which said under it. Its words are written in place
 * (Edit the words here): the message's own pane, as Messages draws it (parts/message-in-place.tsx), where the preview
 * stood, every channel's version and its languages with it. The foot says what a save reaches. Saved through the
 * sequence's own doors (00442): a new step at the end, or this one changed; its words changed apart, since a WhatsApp
 * version not yet approved waits while the step sends its own (`waits`). The server judges the values against the
 * message (core templateValues) and says what it refused in words. Inside the step's sheet, Cancel and Save stand in its
 * foot (record-foot.ts RecordFootContext), with what a save reaches beside them on a desk and over the fields' end on a
 * phone, so the press is at the thumb however long the step's fields run.
 */
import { useContext, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  CONSENT_CHANNELS,
  PREVIEW_CHANNEL_WORDS,
  SEQUENCE_EDIT_WORDS as E,
  defaultParamSpecs,
  exampleParams,
  exampleParamsFor,
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
import { gate } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { cmBusinessOf, cmOfferedFrom, cmStandInOf, type CmOffered } from "../parts/channels";
import { messagePaneContext } from "../parts/message-pane";
import { MessagePreview } from "../parts/message-preview";
import { cmOfferFoot, cmPreviewBy } from "../parts/preview-by";
import { useCmPhone } from "../parts/split";
import { RecordFootContext } from "./record-foot";
import { useBatchRead } from "./use-record";
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

/**
 * The values the editor fills a step's message with: the step's own where its own message is picked (what goes now: a
 * first name from the person, a link from the business), never the message's defaults over them; another message, or a
 * step whose values no longer fit its message, starts from that message's own.
 */
function stepSpecsOf(picked: CmOffered | null, step: SequenceStepDto | null): ParamSpec[] {
  const defaults = picked ? defaultParamSpecs(picked) : [];
  const own = step && picked && picked.name === step.template_name ? parseParamSpecs(step.params) : [];
  return own.length > 0 && own.length === defaults.length ? own : defaults;
}

/** Whether two sets of typed words say the same. */
const sameTyped = (a: Record<number, string>, b: Record<number, string>) =>
  Object.keys({ ...a, ...b }).every((k) => (a[Number(k)] ?? "") === (b[Number(k)] ?? ""));

/** The message a step sends now, among those offered: by its name and language, else the first offered. */
const pickedOf = (offered: readonly CmOffered[], step: SequenceStepDto | null): string =>
  offered.find((m) => m.name === step?.template_name && m.language === (step?.template_language ?? m.language))?.id ??
  offered[0]?.id ??
  "";

/** Who the preview is read as: the example, or one of the batch that waits for the step (its first name, its channel). */
interface ReadAs {
  id: string;
  name: string;
  firstName: string | null;
  channel: ConsentChannel | null;
}

/** Everyone the batch that waits for this step will reach, as its run reads them; none where nothing waits. */
function useReadAs(batchId: string | null): ReadAs[] {
  const read = useBatchRead(batchId);
  if (read.state !== "read") return [];
  return read.data.recipients
    .filter((r) => r.state !== "skipped")
    .map((r) => ({
      id: r.contact_id,
      name: r.name,
      firstName: r.first_name,
      channel: CONSENT_CHANNELS.find((c) => c === r.channel) ?? "whatsapp",
    }));
}

const EXAMPLE = "example";

/**
 * The message as one person reads it on each channel it holds a version for, a tab each (the canvas's right half): the
 * example's words, or someone's of the batch that waits, on the channel they are reached on, with who gets which said.
 */
function StepPreview(p: {
  picked: CmOffered;
  params: ParamSpec[];
  policyClass: string;
  batchId: string | null;
  /** Opens the message's own pane in place of the preview; null where no pane is handed down. */
  onEdit: (() => void) | null;
}) {
  const { picked, params, policyClass } = p;
  const settings = useSurface("settings");
  const business = cmBusinessOf(settings);
  const channels = picked.channels.length > 0 ? picked.channels : [cmStandInOf(picked)];
  const people = useReadAs(p.batchId);
  const [as, setAs] = useState(EXAMPLE);
  const person = people.find((x) => x.id === as) ?? null;
  const [on, setOn] = useState<ConsentChannel>(channels[0] ?? "whatsapp");
  // Someone of the batch is read on the channel they are reached on, where the message holds it.
  const wanted = person?.channel && channels.includes(person.channel) ? person.channel : on;
  const channel = channels.includes(wanted) ? wanted : (channels[0] ?? "whatsapp");
  const values = person
    ? exampleParamsFor(params, business.businessName, person.firstName)
    : exampleParams(params, business.businessName);
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
  const who = person
    ? [E.getsIt(person.name, PREVIEW_CHANNEL_WORDS[channel]), person.firstName ? null : E.noFirstName]
        .filter(Boolean)
        .join(" ")
    : E.oneEach;
  return (
    <div className="sq-ed-preview" data-testid="sq-editor-preview">
      <div className="sq-ed-preview-head">
        <p className="sq-ed-k">{E.previewAs}</p>
        {p.onEdit ? (
          <LinkButton onClick={p.onEdit} data-testid="sq-editor-edit-words" {...gate("approve")}>
            {E.editHere}
          </LinkButton>
        ) : null}
      </div>
      {people.length > 0 ? (
        <Field
          label={E.as}
          control={
            <Select
              value={person ? person.id : EXAMPLE}
              onValueChange={setAs}
              chevron={chevron}
              options={[
                { value: EXAMPLE, label: E.example("Dani") },
                ...people.map((x) => ({ value: x.id, label: x.name })),
              ]}
              data-testid="sq-editor-as"
            />
          }
        />
      ) : null}
      {channels.length > 1 && !person ? (
        <SubTabs
          dense
          label={E.previewAs}
          value={channel}
          onSelect={(id) => setOn(channels.find((c) => c === id) ?? channel)}
          tabs={channels.map((c) => ({ id: c, label: PREVIEW_CHANNEL_WORDS[c], testid: `sq-editor-on-${c}` }))}
        />
      ) : null}
      <MessagePreview from={business.businessName} values={values} {...preview} via={null} />
      <p className="sq-ed-note" data-testid="sq-editor-who">
        {who}
      </p>
    </div>
  );
}

/** Under the message's box: its name in Messages and its WhatsApp standing. Its words are written in place, beside it. */
function MessageFrom({ picked }: { picked: CmOffered }) {
  const approval = stepApprovalOf(picked.message?.versions.whatsapp?.status ?? null);
  return (
    <p className="sq-ed-from">
      <span>{E.savedIn(picked.title ?? picked.name)}</span>
      {approval ? <StatePill kind="tone" value={approval.tone} label={approval.label} /> : null}
    </p>
  );
}

/**
 * The editor's right half: the message as one person reads it, or its own pane where its words are written, the pane
 * Campaigns' route hands down (parts/message-pane.ts).
 */
function EditorRight(p: {
  picked: CmOffered;
  params: ParamSpec[];
  policyClass: string;
  batchId: string | null;
  writing: boolean;
  setWriting: (on: boolean) => void;
  flash: Flash;
}) {
  const Pane = useContext(messagePaneContext());
  if (p.writing && Pane)
    return (
      <div className="sq-ed-preview" data-testid="sq-editor-writing">
        <Pane name={p.picked.name} flash={p.flash} onClose={() => p.setWriting(false)} />
      </div>
    );
  return (
    <StepPreview
      picked={p.picked}
      params={p.params}
      policyClass={p.policyClass}
      batchId={p.batchId}
      onEdit={Pane ? () => p.setWriting(true) : null}
    />
  );
}

interface EditorFootProps {
  first: boolean;
  byWhatsApp: boolean;
  /** A new step, whose press says Add the step. */
  adding: boolean;
  /** Whether Save may be pressed: a message picked, something changed, nothing on its way. */
  ready: boolean;
  onCancel: () => void;
  onSave: () => void;
}

/**
 * What a save reaches, and Cancel and Save. Inside a record they stand in the pane's foot (use-record.ts
 * RecordFootContext), which the editor holds while it is open: what a save reaches beside them on a desk, and over the
 * fields' end on a phone, where the foot is a thumb's pair. Anywhere else, under the fields.
 */
function EditorFoot({ first, byWhatsApp, adding, ready, onCancel, onSave }: EditorFootProps) {
  const foot = useContext(RecordFootContext);
  const phone = useCmPhone();
  const holdFoot = foot?.hold;
  useEffect(() => {
    if (!holdFoot) return undefined;
    holdFoot(true);
    return () => holdFoot(false);
  }, [holdFoot]);
  const reach = (
    <p className="sq-ed-reach">
      <b>{E.reaches(first)}</b>
      {byWhatsApp ? <span> · {E.whatsAppFirst}</span> : null}
    </p>
  );
  const presses = (
    <>
      <Button size="sm" className="sq-foot-act" onClick={onCancel} data-testid="sq-editor-cancel">
        {E.cancel}
      </Button>
      <Button
        size="sm"
        variant="primary"
        className="sq-foot-act"
        onClick={onSave}
        disabled={!ready}
        data-testid="sq-editor-save"
        {...gate("approve")}
      >
        {adding ? E.add : E.save}
      </Button>
    </>
  );
  if (!foot)
    return (
      <div className="sq-ed-foot">
        {reach}
        {presses}
      </div>
    );
  return (
    <>
      {phone ? reach : null}
      {foot.el
        ? createPortal(
            <>
              {phone ? null : reach}
              {presses}
            </>,
            foot.el,
          )
        : null}
    </>
  );
}

interface StepEditorProps {
  sequenceId: string;
  /** The step changed, or none for a new one at the end. */
  step: SequenceStepDto | null;
  /** The class the sequence runs under: what its messages are about, which an email's foot says (cmOfferFoot). */
  policyClass: string;
  /** The batch that waits for this step, whose people the preview may be read as; none where nothing waits. */
  batchId?: string | null;
  flash: Flash;
  onDone: () => void;
  onCancel: () => void;
}

export function StepEditor({
  sequenceId,
  step,
  policyClass,
  batchId = null,
  flash,
  onDone,
  onCancel,
}: StepEditorProps) {
  const settings = useSurface("settings");
  const offered = useMemo(() => cmOfferedFrom(settings) ?? [], [settings]);
  const first = step?.place === 1;
  const [days, setDays] = useState(String(step?.after_days ?? 3));
  const [hold, setHold] = useState<Hold>(stepHoldOf(step?.only_if ?? ["no_booking"]));
  const [message, setMessage] = useState<string>(() => pickedOf(offered, step));
  const picked = offered.find((m) => m.id === message) ?? null;
  const specs = stepSpecsOf(picked, step);
  const labels = picked ? slotLabels(picked) : [];
  // A step's own typed words, shown and previewed as it sends them now, and kept unless they are changed.
  const [was] = useState(() => typedOf(step));
  const [typed, setTyped] = useState<Record<number, string>>(was);
  const [busy, setBusy] = useState(false);
  // The message's own pane, where the preview stood, while its words are written.
  const [writing, setWriting] = useState(false);
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
        {picked ? <EditorRight {...{ picked, params, policyClass, batchId, writing, setWriting, flash }} /> : null}
      </div>
      <EditorFoot
        first={first}
        byWhatsApp={byWhatsApp}
        adding={!step}
        ready={!busy && !!picked && changed}
        onCancel={onCancel}
        onSave={() => void save()}
      />
    </div>
  );
}
