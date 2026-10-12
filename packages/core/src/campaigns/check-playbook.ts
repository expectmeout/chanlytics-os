import {
  AppError,
  BUILTIN_LISTS,
  LIST_PLAYBOOK_CLASSES,
  FOLLOW_UP_NEEDS_DEALS,
  REACH_OUT_IS_NOT_A_MOMENT,
  FOLLOW_UP_NEEDS_LINK,
  MOMENTS_RETIRED,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_LIMITS,
  PLAYBOOK_NAME_MAX,
  PLAYBOOK_PATCH_KEYS,
  PLAYBOOK_PATCH_WORDS,
  appointmentWords,
  campaignDayWords,
  channelNeverCarries,
  enrolPurpose,
  isDayKey,
  isPlaybookState,
  isWinBack,
  localDate,
  messageFitsMoment,
  messageHolds,
  messageWhyNot,
  momentOffered,
  momentReadsCalendar,
  parseParamSpecs,
  playbookName,
  ruleNeeds,
  triggerOf,
  triggerOffered,
  triggerWords,
  UUID,
  winBackWords,
  type AppointmentWord,
  type CampaignMessage,
  type ConsentChannel,
  type ParamSpec,
  type PlaybookPatch,
  type PlaybookPatchKey,
  type PlaybookPolicyClass,
  type PlaybookState,
  type PlaybookTrigger,
} from "@chanlytics/contracts";
import { parseChannels } from "./message-channels";
import { readCampaignMessage, templateValues } from "./template-values";
import type { TemplateValuesPorts } from "./ports";

/** Everything a playbook names, checked. */
export interface PlaybookInput {
  name: string;
  trigger: PlaybookTrigger;
  /** The list of the workspace's own a saved_list playbook runs on; null for every other trigger. */
  list_id: string | null;
  /** The People list a saved_list playbook runs on, by its id (00168); null otherwise. Never both. */
  list_key: string | null;
  template_id: string;
  template_name: string;
  template_language: string;
  params: ParamSpec[];
  policy_class: PlaybookPolicyClass;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  /** The channels it may go by: WhatsApp alone when none is named (an edit that names none keeps the ones it has). */
  channels: ConsentChannel[];
}

/**
 * One whole number of a playbook, by its field's bounds (contracts PLAYBOOK_LIMITS): `fallback` when none is sent, and a
 * refusal in the save's own sentence otherwise. A new playbook's check, a change's and Ask's starter card read it.
 */
export function playbookNumber(field: keyof typeof PLAYBOOK_LIMITS, v: unknown, fallback: number): number {
  const { min, max, what } = PLAYBOOK_LIMITS[field];
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new AppError("validation", `${what} must be a whole number from ${min} to ${max}.`);
  return n;
}

/** What a playbook's check reads beyond its message: the name of a list it runs on, or null when there is none. */
export interface CheckPlaybookPorts extends TemplateValuesPorts {
  listName(id: string): Promise<string | null>;
  /** Whether deals are on here (dealsAreOn, 0008): a proposal follow-up is made only then (0006). */
  dealsOn(): Promise<boolean>;
  /**
   * Whether a calendar is connected here, its feed readable just now or not (the Playbooks page's calendar state is not
   * "none"): which of the two win-backs a new playbook may be (contracts momentOffered).
   */
  calendarOn(): Promise<boolean>;
  /**
   * What the workspace calls an appointment (contracts appointmentWordOf): the words a refusal says, and the name a new
   * campaign on an appointment moment takes when it is given none. Asked only where one of those is said.
   */
  appointmentWord(): Promise<AppointmentWord>;
}

/**
 * The moment a playbook names: where it may run at all, and where it may be made new. A proposal follow-up where deals
 * are off has no proposal to follow (0006), whether it is made or changed; a playbook kept on its moment is not new,
 * so a retired moment's, the other win-back's and an appointment moment's made before a calendar was required keep
 * running and may be changed. A new one is held to what is offered now (contracts momentOffered), in the words for each
 * and in the workspace's word. Each fact is asked only of the moment it decides.
 */
async function refuseMoment(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  existing: { trigger: string } | null,
): Promise<void> {
  const dealsOn = trig.kind === "deal" ? await ports.dealsOn() : false;
  if (trig.kind === "deal" && !triggerOffered(trig, dealsOn)) throw new AppError("validation", FOLLOW_UP_NEEDS_DEALS);
  if (existing?.trigger === trig.id) return;
  const retired = MOMENTS_RETIRED[trig.id];
  if (retired) throw new AppError("validation", retired);
  const calendarOn = momentReadsCalendar(trig) ? await ports.calendarOn() : false;
  if (momentOffered(trig, { dealsOn, calendarOn })) return;
  const word = await ports.appointmentWord();
  if (!isWinBack(trig.id)) throw new AppError("validation", appointmentWords(word).needsCalendar);
  const w = winBackWords(word);
  throw new AppError("validation", trig.id === "lapsed" ? w.lapsed : w.quiet_30);
}

/** The name a campaign given none takes: its list's, an appointment moment's in the workspace's word, else its moment's. */
async function defaultLabel(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  listName: string | null,
): Promise<string> {
  if (listName) return listName;
  return trig.kind === "visit" ? triggerWords(trig, await ports.appointmentWord()).label : trig.label;
}

/**
 * A playbook on a list names it (decision 0009): one of People's by its id (list_key), or one of the workspace's own
 * (list_id), which must be this workspace's. A run has no one looking, so a list about "me" is never one it runs on.
 * Every other moment names none: all three are null.
 */
async function listOf(
  ports: CheckPlaybookPorts,
  trig: NonNullable<ReturnType<typeof triggerOf>>,
  body: Record<string, unknown> | null,
): Promise<{ listName: string | null; listKey: string | null; listId: string | null }> {
  if (trig.kind !== "saved") return { listName: null, listKey: null, listId: null };
  const listKey = typeof body?.list_key === "string" && body.list_key ? body.list_key : null;
  if (listKey) {
    const b = BUILTIN_LISTS.find((l) => l.id === listKey);
    if (!b) throw new AppError("validation", "Pick the list it runs on.");
    if (ruleNeeds(b.rule).includes("viewer"))
      throw new AppError(
        "validation",
        `${b.label} is about whoever is looking, and a campaign runs with no one looking. Pick another list.`,
      );
    return { listName: b.label, listKey, listId: null };
  }
  const listId = typeof body?.list_id === "string" ? body.list_id : null;
  if (!listId || !UUID.test(listId)) throw new AppError("validation", "Pick the list it runs on.");
  const listName = await ports.listName(listId);
  if (!listName) throw new AppError("not_found", "List not found.", 404);
  return { listName, listKey: null, listId };
}

/**
 * A follow-up carries the proposal it follows (0006): with no slot filled by its link it is a bare "just checking in",
 * which is a person's to write. Made, or its words changed.
 */
function refuseFollowUpWithoutLink(trig: ReturnType<typeof triggerOf>, specs: readonly ParamSpec[]): void {
  if (trig?.kind === "deal" && !specs.some((s) => s.kind === "proposal_link"))
    throw new AppError("validation", FOLLOW_UP_NEEDS_LINK);
}

/** A moment and its message agree on the yes they need (contracts messageFitsMoment, decision 7), made or changed. */
function refuseMessageThatDisagrees(cls: string, category: string | null): void {
  const fit = messageFitsMoment(cls, category);
  if (!fit.ok) throw new AppError("validation", fit.words);
}

/**
 * A playbook keeps a tick that cannot send yet (its runs hold those people), but never goes by a message none of whose
 * ticks it holds: a broadcast of it could not be sent, and a playbook can never name a message a broadcast could not
 * send. Refused in each ticked channel's sentence for the version the message lacks (contracts messageWhyNot, one after
 * another), so a message with an email and no WhatsApp version is kept on WhatsApp and email, and is refused on WhatsApp
 * alone with WhatsApp's standing.
 */
function refuseMessageNoTickHolds(message: CampaignMessage, channels: readonly ConsentChannel[]): void {
  const held = messageHolds(message);
  if (channels.some((c) => held[c])) return;
  const words = channels.flatMap((c) => messageWhyNot(message, c) ?? []);
  throw new AppError("conflict", words.join(" "), 409);
}

/**
 * Which of WhatsApp, text and email a playbook may go by, judged the one way a save and a change of its channels alone
 * both ask it. A tick its purpose never carries (texts carry no offers) is refused here, not at send. One the workspace
 * is not ready on now is not (offers by email before the campaigns domain is set up, among them): a run holds the people
 * it cannot reach there until it can, and never fails the playbook for it. `kept` is what it already ticks, which a
 * save that names none keeps.
 */
function channelsItMayGoBy(
  asked: unknown,
  kept: readonly string[] | null,
  cls: string | null,
  message: CampaignMessage,
): ConsentChannel[] {
  const channels = parseChannels(asked, kept);
  const purpose = enrolPurpose(cls, message);
  const never = channels.map((c) => channelNeverCarries(c, purpose)).find((words) => words !== null);
  if (never) throw new AppError("validation", never);
  refuseMessageNoTickHolds(message, channels);
  return channels;
}

/**
 * A playbook's channels alone, changed (the review of 8 October 2026): what the Goes by row of its drawer and Ask's card
 * ask for. They are judged against the playbook as it stands, its own class and its own message read from its row, the
 * way a save judges them (channelsItMayGoBy), and nothing else of it is taken from the caller, so nothing else can be
 * written back. A whole playbook re-sent to change one tick wrote a caller's copy of every other field over whatever
 * had been edited since, and re-derived its class. `asked` must be a list: this door exists to name them.
 */
export async function checkPlaybookChannels(
  ports: Pick<TemplateValuesPorts, "message">,
  row: { trigger: string; policy_class: string | null; template_id: string | null; channels: string[] | null },
  asked: unknown,
): Promise<ConsentChannel[]> {
  const message = await readCampaignMessage(ports, row.template_id ?? "");
  const cls = row.policy_class ?? triggerOf(row.trigger)?.cls ?? null;
  return channelsItMayGoBy(Array.isArray(asked) ? asked : [], row.channels, cls, message);
}

/**
 * What a change in place reads beyond the playbook: why its list keeps it paused (decision 0009), or null; its message
 * and the links its values may need, for a change of its words (as a new campaign's are read); and the business's zone,
 * for a change of its end. Each is asked only of a change that names what it decides.
 */
export interface CheckPlaybookPatchPorts extends TemplateValuesPorts {
  archivedList(row: { id: string; trigger: string }): Promise<string | null>;
  /** The business's zone: an end is a day by its clock, today or later. */
  timezone(): Promise<string>;
}

/**
 * A playbook as a change is judged against it: its row as the database holds it now, never a caller's copy. Its state
 * is one of the two (contracts isPlaybookState narrows a row's), so what a change held is a patch's own type.
 */
export interface PlaybookPatchRow {
  id: string;
  name: string;
  trigger: string;
  state: PlaybookState;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
  /** The message it sends, by any version's id: its words are held to that message's slots. */
  template_id: string | null;
  /** Its words as the row stores them (playbooks.params): the slot specs a run fills, read as a run reads them. */
  params: unknown;
  /** Its last day (00409), YYYY-MM-DD by the business's clock, or null. */
  until: string | null;
  /** Until when it runs on trial (00409), an instant, or null. */
  trial_until: string | null;
}

/** A name as a change keeps it: trimmed, its runs of space one, never empty and never past the bound (D25). */
function patchName(v: unknown): string {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new AppError("validation", PLAYBOOK_PATCH_WORDS.nameMissing);
  if (name.length > PLAYBOOK_NAME_MAX)
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.nameLong(PLAYBOOK_NAME_MAX));
  return name;
}

/** A number a change names, by its field's bounds; undefined where the change names none. */
const patchNumber = (k: keyof typeof PLAYBOOK_LIMITS, v: unknown, was: number): number | undefined =>
  v === undefined ? undefined : playbookNumber(k, v, was);

/**
 * Its words a change names (00409 `params`): as many values as its message takes, each judged as a new campaign's are
 * (templateValues: typed text, or a value the run fills that this moment and this workspace can fill), and a follow-up's
 * link kept. The specs a run fills, as the route stores them; undefined where the change names none.
 */
async function patchParams(
  ports: TemplateValuesPorts,
  row: PlaybookPatchRow,
  v: unknown,
): Promise<ParamSpec[] | undefined> {
  if (v === undefined) return undefined;
  const trig = triggerOf(row.trigger);
  const { specs } = await templateValues(ports, {
    templateId: row.template_id ?? "",
    params: v,
    visits: trig?.kind === "visit",
    proposal: trig?.kind === "deal",
  });
  refuseFollowUpWithoutLink(trig, specs);
  return specs;
}

/**
 * When a change is judged (`now`) and whether it is an undo (`undo`): one that writes back what the door recorded a
 * change held (its `was`), which restores a past end or a past trial as it was, since nothing clears either when it
 * passes. A change that is not an undo names a date still to come at `now`.
 */
interface PatchWhen {
  now: Date;
  undo: boolean;
}

/**
 * The last day a change or a new campaign names (00409 `until`): a day by the business's clock, today or later, or on an
 * undo the day it held, past or not; null clears it, or names none. The one judgement checkPlaybookPatch, POST playbooks
 * (the dashboard's startNewPlaybook) and Ask's new campaign card ask; the zone is read only where a day is to be judged.
 */
export async function untilOf(
  ports: Pick<CheckPlaybookPatchPorts, "timezone">,
  v: unknown,
  when: PatchWhen,
): Promise<string | null | undefined> {
  if (v === undefined || v === null) return v;
  if (!isDayKey(v)) throw new AppError("validation", PLAYBOOK_PATCH_WORDS.untilDay);
  if (when.undo) return v;
  const tz = await ports.timezone();
  const today = localDate(tz, when.now);
  if (v < today)
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.untilPast(campaignDayWords(today, tz, when.now)));
  return v;
}

/** An instant with its zone, as a trial's end is written: a date, a time, and Z or an offset. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * The end of its trial a change or a new campaign names (00409 `trial_until`): an instant still to come at `now`, kept
 * in one spelling (UTC); null ends it, or starts none. A trial that has already ended is none, so an instant past is
 * refused, from every caller but an undo (`when.undo`), which writes back the instant the door recorded, past or not.
 * The one judgement checkPlaybookPatch and POST playbooks (the dashboard's startNewPlaybook, before a starter is filed)
 * ask.
 */
export function trialUntilOf(v: unknown, when: PatchWhen): string | null | undefined {
  if (v === undefined || v === null) return v;
  const at = typeof v === "string" && INSTANT.test(v) ? Date.parse(v) : Number.NaN;
  if (!Number.isFinite(at)) throw new AppError("validation", PLAYBOOK_PATCH_WORDS.trialWhen);
  if (!when.undo && at <= when.now.getTime()) throw new AppError("validation", PLAYBOOK_PATCH_WORDS.trialPast);
  return new Date(at).toISOString();
}

/** What the row holds of each key a change may name: its words read as a run reads them, a date it has none of null. */
function patchHeldOf(row: PlaybookPatchRow): Required<PlaybookPatch> {
  return {
    state: row.state,
    name: row.name,
    run_hour: row.run_hour,
    cap_per_run: row.cap_per_run,
    gap_days: row.gap_days,
    cadence_days: row.cadence_days,
    params: parseParamSpecs(row.params),
    until: row.until ?? null,
    trial_until: row.trial_until ?? null,
  };
}

/** Whether a value a change names is what the row holds: its words as the specs they are, a trial's end as the instant. */
function holdsAlready(k: PlaybookPatchKey, to: unknown, held: unknown): boolean {
  if (k === "params") return JSON.stringify(to) === JSON.stringify(held);
  if (k === "trial_until" && typeof to === "string" && typeof held === "string")
    return Date.parse(to) === Date.parse(held);
  return to === held;
}

/**
 * A playbook changed in place (the moment spec §4.9 A5): what Ask's change card proposes and PUT playbooks/:id's patch
 * writes, judged one way. `asked` names any of the nine (contracts PLAYBOOK_PATCH_KEYS) and nothing else; each number is
 * held to its bounds (PLAYBOOK_LIMITS; a name past PLAYBOOK_NAME_MAX is refused, never cut, so a card says exactly what
 * is stored), a cadence to the month's offer, a resume to a list that is not archived (by the port), its words to its
 * message's slots (patchParams), its end to a day today or later by the business's clock at `when.now`, its trial's end
 * to an instant after it (trialUntilOf), and a reach-out's step to its state alone (its sheet changes the rest). An undo
 * (`when.undo`: PUT playbooks/:id naming the decision it undoes) writes back what the door recorded, so its end and its
 * trial are restored past or not, their shapes still judged. It answers only what differs from the row as it stands,
 * `set`, and what each of those held, `was`; nothing that differs is `{ set: {}, was: {} }`, which the card refuses in
 * words and the route answers without a write.
 */
export async function checkPlaybookPatch(
  ports: CheckPlaybookPatchPorts,
  row: PlaybookPatchRow,
  asked: Record<string, unknown>,
  when: PatchWhen,
): Promise<{ set: PlaybookPatch; was: PlaybookPatch }> {
  const keys = Object.keys(asked).filter((k) => asked[k] !== undefined);
  if (keys.length === 0 || keys.some((k) => !(PLAYBOOK_PATCH_KEYS as readonly string[]).includes(k)))
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.nothing);
  // A reach-out's step is changed on its own sheet (Reach out, Part 4); here it is paused or resumed, as the sheet's
  // Pause asks, and nothing else.
  if (triggerOf(row.trigger)?.kind === "reach_out" && keys.some((k) => k !== "state"))
    throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
  if (asked.state !== undefined && !isPlaybookState(asked.state))
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.state);
  const next: PlaybookPatch = {
    state: isPlaybookState(asked.state) ? asked.state : undefined,
    name: asked.name === undefined ? undefined : patchName(asked.name),
    run_hour: patchNumber("run_hour", asked.run_hour, row.run_hour),
    cap_per_run: patchNumber("cap_per_run", asked.cap_per_run, row.cap_per_run),
    gap_days: patchNumber("gap_days", asked.gap_days, row.gap_days),
    cadence_days: patchNumber("cadence_days", asked.cadence_days, row.cadence_days),
    params: await patchParams(ports, row, asked.params),
    until: await untilOf(ports, asked.until, when),
    trial_until: trialUntilOf(asked.trial_until, when),
  };
  const held = patchHeldOf(row);
  const set: PlaybookPatch = {};
  const was: PlaybookPatch = {};
  // A field the change names with a value the row does not hold already: set, and what the row held, each in its type.
  const differs = <K extends PlaybookPatchKey>(k: K): void => {
    const to = next[k];
    if (to === undefined || holdsAlready(k, to, held[k])) return;
    set[k] = to;
    was[k] = held[k];
  };
  for (const k of PLAYBOOK_PATCH_KEYS) differs(k);
  if (set.cadence_days !== undefined && row.trigger !== "everyone_monthly")
    throw new AppError("validation", PLAYBOOK_PATCH_WORDS.cadenceOffer(row.name));
  if (set.state === "running") {
    const archived = await ports.archivedList(row);
    if (archived) throw new AppError("validation", archived);
  }
  return { set, was };
}

/**
 * What a new playbook names before its message, judged: its moment (one offered here, never a reach-out's step), its
 * list, and the class it runs under. A starter card is refused for all of it before its starter is filed (a WhatsApp
 * version sent to Meta cannot be taken back), and checkPlaybook asks it first, so a new playbook is judged one way, in
 * one order and in the same words.
 */
export async function checkPlaybookMoment(
  ports: CheckPlaybookPorts,
  body: Record<string, unknown> | null,
  existing: { trigger: string } | null,
): Promise<{
  trig: NonNullable<ReturnType<typeof triggerOf>>;
  cls: PlaybookPolicyClass;
  listName: string | null;
  listKey: string | null;
  listId: string | null;
}> {
  const trig = typeof body?.trigger === "string" ? triggerOf(body.trigger) : null;
  if (!trig)
    throw new AppError(
      "validation",
      `Pick what starts it: win-back, the month's offer, ${appointmentWords(await ports.appointmentWord()).startsWith}, one of your lists, or a proposal waiting.`,
    );
  // A reach-out's steps are not moments (Reach out, Part 3): they are made on the reach-out sheet, over a lead search.
  if (trig.kind === "reach_out") throw new AppError("validation", REACH_OUT_IS_NOT_A_MOMENT);
  await refuseMoment(ports, trig, existing);
  const { listName, listKey, listId } = await listOf(ports, trig, body);
  // A playbook on a list sends an offer or a win-back, under that class's autonomy row; every other moment its own.
  const cls =
    trig.kind === "saved" && (LIST_PLAYBOOK_CLASSES as readonly string[]).includes(String(body?.policy_class))
      ? (body!.policy_class as PlaybookPolicyClass)
      : trig.cls;
  return { trig, cls, listName, listKey, listId };
}

/**
 * Everything a playbook names, checked the way a broadcast is: the trigger,
 * then the message and its values through the one judgement, then the
 * whole numbers. A playbook can never name a message a broadcast could not
 * send or a slot the workspace cannot fill. `existing` is the playbook being changed, null for a new one.
 */
export async function checkPlaybook(
  ports: CheckPlaybookPorts,
  body: Record<string, unknown> | null,
  existing: { trigger: string; channels?: string[] | null } | null,
): Promise<PlaybookInput> {
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, PLAYBOOK_NAME_MAX) : "";
  const { trig, cls, listName, listKey, listId } = await checkPlaybookMoment(ports, body, existing);
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  const { message, specs } = await templateValues(ports, {
    templateId,
    params: body?.params,
    visits: trig.kind === "visit",
    proposal: trig.kind === "deal",
  });
  refuseMessageThatDisagrees(cls, message.category);
  const channels = channelsItMayGoBy(body?.channels, existing?.channels ?? null, cls, message);
  refuseFollowUpWithoutLink(trig, specs);
  return {
    // A name when none was given: the moment's alone when it sends its own starter, else with the message's title; a
    // list's own name for a playbook on a list; an appointment moment's in the workspace's word (D43).
    name: (name || playbookName({ id: trig.id, label: await defaultLabel(ports, trig, listName) }, message)).slice(
      0,
      PLAYBOOK_NAME_MAX,
    ),
    trigger: trig.id,
    list_id: listId,
    list_key: listKey,
    // The message's anchor, whichever version's id was picked: the one id every version of it resolves to.
    template_id: message.anchor.id,
    template_name: message.name,
    template_language: message.language,
    params: specs,
    policy_class: cls,
    run_hour: playbookNumber("run_hour", body?.run_hour, PLAYBOOK_DEFAULTS.runHour),
    cap_per_run: playbookNumber("cap_per_run", body?.cap_per_run, PLAYBOOK_DEFAULTS.capPerRun),
    gap_days: playbookNumber("gap_days", body?.gap_days, PLAYBOOK_DEFAULTS.gapDays),
    cadence_days: playbookNumber("cadence_days", body?.cadence_days, PLAYBOOK_DEFAULTS.cadenceDays),
    channels,
  };
}
