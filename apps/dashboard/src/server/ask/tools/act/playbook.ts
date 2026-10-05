import "server-only";
import { z } from "zod";
import {
  CONSENT_CHANNELS,
  FOLLOW_UP_NEEDS_DEALS,
  FOLLOW_UP_ONE,
  LIST_PLAYBOOK_CLASSES,
  MOMENTS_RETIRED,
  MOMENT_TRIGGERS,
  PLAYBOOK_CLASS_LABEL,
  PLAYBOOK_VETO_DELAY_WORDS,
  REACH_OUT_IS_NOT_A_MOMENT,
  cleanParam,
  dealPaceOf,
  dealsAreOn,
  defaultParamSpecs,
  parseListToken,
  parseParamSpec,
  playbookRunReach,
  proposalChannelsWords,
  purposeOfPlaybook,
  saidYesWords,
  scheduleLine,
  slotLabels,
  startersForTrigger,
  messageAboutOfTrigger,
  triggerOf,
  triggerOffered,
  type CampaignHow,
  type ConsentChannel,
  type ListRef,
  type MessageAbout,
  type ParamSpec,
} from "@chanlytics/contracts";
import { campaignHow } from "@chanlytics/core";
import { listPolicies } from "@chanlytics/db";
import { archivedListWords, poolList, type AudiencePool } from "../../../people/audience";
import { dealPaceRead, sellsByOf } from "../../../people/deals";
import { checkPlaybookInput, proposalFollowUps } from "../../../campaigns/playbooks";
import { createBroadcastPorts } from "../../../ports/campaign-ports";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { zoneAndSettings } from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
import {
  AUDIENCES_CALL,
  UUID,
  actAction,
  namedChannels,
  propose,
  refuse,
  str,
  whatsappHow,
  type ProposalOutcome,
  type ToolContext,
} from "../context";
import { cardSays } from "./says";

/** What a run does under each mode, in the card's words. */
const MODE_WORDS: Record<string, string> = {
  auto: "each run sends on its own",
  veto: `each run sends ${PLAYBOOK_VETO_DELAY_WORDS} later unless you stop it`,
  ask: "each run waits for you on Today",
  never: "nothing runs until the class is changed",
};

/**
 * The moments a playbook may be proposed on: every moment but the two that follow the calendar and the two no longer
 * offered (MOMENTS_RETIRED); a proposal's is refused where deals are off, and the win-back this workspace cannot read by
 * the check (momentOffered, with the calendar), and a reach-out's steps are not moments (MOMENT_TRIGGERS). The zod's enum
 * and the refusal's list, one derivation.
 */
const PROPOSABLE_TRIGGERS = MOMENT_TRIGGERS.filter((t) => t.kind !== "visit" && !(t.id in MOMENTS_RETIRED)).map(
  (t) => t.id,
) as [string, ...string[]];

/**
 * The values a proposal fills the template's slots with: the model's, or the template's own defaults -- a starter's slots
 * are known; a typed slot with no words is a question for the person. A refusal, in the model's words, otherwise.
 */
function proposedSpecs(
  params: unknown,
  tpl: { name: string; language: string; variables: unknown },
): { specs: ParamSpec[] } | { refusal: string } {
  const given = Array.isArray(params) ? (params as unknown[]) : [];
  if (!given.length) {
    const specs = defaultParamSpecs({ name: tpl.name, variables: tpl.variables });
    const labels = slotLabels({ name: tpl.name, language: tpl.language, variables: tpl.variables });
    const blank = specs.findIndex((s) => s.kind === "text" && !s.value);
    return blank >= 0
      ? {
          refusal: `this template takes typed words for “${labels[blank] ?? `value ${blank + 1}`}”; ask the person what to say there, then propose again with params`,
        }
      : { specs };
  }
  const specs: ParamSpec[] = [];
  for (const p of given) {
    const spec = parseParamSpec(p);
    if (!spec)
      return {
        refusal:
          "each value is text, or @first_name, @business_name or @booking_link, or @proposal_link on the proposal follow-up",
      };
    if (spec.kind !== "text") {
      specs.push(spec);
      continue;
    }
    const v = cleanParam(spec.value);
    if (v === null)
      return { refusal: "every typed value must be plain text under 1024 characters, without line breaks" };
    specs.push({ kind: "text", value: v });
  }
  return { specs };
}

/**
 * The approved row a moment's starter is on file as: the set's starter for the moment, else one it replaced that this
 * workspace still has approved (2 Oct 2026), or the refusal that says neither is.
 */
async function heldStarter(
  t: ToolContext,
  trig: { id: string; label: string },
): Promise<{ id: string } | { refusal: string }> {
  const written = startersForTrigger(trig.id);
  const { data: held } = await t.ctx.supabase
    .from("templates")
    .select("id, name")
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .in(
      "name",
      written.map((x) => x.name),
    )
    .eq("meta_status", "approved")
    .is("hidden_at", null)
    .order("language");
  const starter = written.map((x) => (held ?? []).find((r) => r.name === x.name)).find(Boolean);
  if (starter) return { id: starter.id };
  return {
    refusal: `the “${written[0]?.title ?? trig.label}” starter is not approved on this workspace yet; say so and suggest adding the starter set under Campaigns › Messages, or name an approved template from ${AUDIENCES_CALL}`,
  };
}

/**
 * The people a playbook on a list runs on, as a run counts them with no one looking (audience.ts poolList over the pool
 * read for no one is what the runner does; here the pool is the member's, so a list about "me" was refused by the check).
 * One of the workspace's own lists is counted from the lists the turn holds (readers/lists.ts), never read again. Or why
 * not, in the model's words.
 */
async function listedPeople(
  t: ToolContext,
  pool: AudiencePool,
  ref: ListRef,
): Promise<{ ids: Set<string>; label: string } | { refusal: string }> {
  const kept = ref.kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
  const found = await poolList(t.ctx, t.tenantId, pool, ref, kept);
  if (!found) return { refusal: `no such list; ${AUDIENCES_CALL} names them` };
  if (found.archived) return { refusal: archivedListWords(found.label, "run") };
  if ("unknown" in found) return { refusal: `${found.label} can't be counted right now: ${found.unknown}` };
  return { ids: new Set(found.memberIds), label: found.label };
}

/**
 * How the workspace can carry a playbook proposal by the channels it names, as the card counts who a run reaches: the
 * workspace's channels now with the message's own versions laid over them (core campaignHow, which the broadcast's route
 * reads too); WhatsApp alone when it names none. A tick that cannot send yet stays on the playbook (the check refuses only
 * what its purpose never carries), so nothing is refused here.
 */
async function playbookHow(
  t: ToolContext,
  tpl: { name: string; language: string },
  by: { channels: ConsentChannel[]; named: boolean },
  /** The moment's (contracts messageAboutOfTrigger): a visit's or a follow-up's message is theirs. */
  about: MessageAbout,
): Promise<CampaignHow> {
  if (!by.named) return whatsappHow(t, about);
  return (await campaignHow(createBroadcastPorts(t.ctx, t.tenantId, { fresh: false }), tpl, by.channels, about)).how;
}

/**
 * What a playbook card says of its channels, when the proposal named some: where it goes, and how many each carries
 * ("on WhatsApp and by email (52 on WhatsApp, 32 by email)"), and for each channel not ready yet that its runs hold those
 * people until it can, as it says of WhatsApp. WhatsApp's own sentence stands for a proposal that named none.
 */
function playbookChannelsSaid(
  how: CampaignHow,
  by: { channels: ConsentChannel[]; named: boolean },
  byChannel: Record<ConsentChannel, number> | undefined,
): { goes: string; waiting: string } {
  if (!by.named) {
    const wa = how.ready.whatsapp;
    return {
      goes: "",
      waiting: wa.ready ? "" : `${wa.why ?? "WhatsApp is not ready"} Its runs hold everyone until it is. · `,
    };
  }
  const waiting = by.channels
    .filter((c) => !how.ready[c].ready)
    .map((c) => `${how.ready[c].why ?? `${c} is not ready`} Its runs hold those people until it can. · `);
  const counts = byChannel ?? { whatsapp: 0, sms: 0, email: 0 };
  return { goes: ` · ${proposalChannelsWords(by.channels, counts)}`, waiting: waiting.join("") };
}

/** What a playbook proposal takes (playbookAction's input): the moment, what it sends and when, and the channels it may go by. */
interface PlaybookProposed {
  trigger: string;
  list?: string;
  policy_class?: string;
  template_id?: string;
  params?: string[];
  run_hour?: number;
  cap_per_run?: number;
  name?: string;
  channels?: ConsentChannel[];
}

async function proposePlaybook(t: ToolContext, input: PlaybookProposed): Promise<ProposalOutcome> {
  const trig = triggerOf(str(input.trigger, 30));
  if (!trig) return refuse(`trigger must be one of ${PROPOSABLE_TRIGGERS.join(", ")}`);
  if (trig.kind === "reach_out") return refuse(REACH_OUT_IS_NOT_A_MOMENT);
  // A playbook on a list names it by its token (decision 0009): one of People's, or one of the workspace's own.
  const listRef = trig.kind === "saved" ? parseListToken(str(input.list, 60)) : null;
  if (trig.kind === "saved" && !listRef)
    return refuse(`a playbook on a list needs list: the list's token from ${AUDIENCES_CALL} (seg:<id> or list:<id>)`);
  // The proposal follow-up (0006): only where deals are on, and one per workspace (00167).
  if (trig.kind === "deal") {
    const [sellsBy, one] = await Promise.all([
      sellsByOf(t.ctx, t.tenantId),
      t.ctx.supabase
        .from("playbooks")
        .select("id")
        .eq("tenant_id", t.tenantId)
        .eq("trigger", trig.id)
        .limit(1)
        .maybeSingle(),
    ]);
    if (!triggerOffered(trig, dealsAreOn(sellsBy))) return refuse(FOLLOW_UP_NEEDS_DEALS);
    if (one.data) return refuse(FOLLOW_UP_ONE);
  }
  let templateId = str(input.template_id, 40);
  if (templateId && !UUID.test(templateId))
    return refuse(`template_id must be an id ${AUDIENCES_CALL} returned, or omitted for the trigger's starter`);
  if (!templateId) {
    const own = await heldStarter(t, trig);
    if ("refusal" in own) return refuse(own.refusal);
    templateId = own.id;
  }
  const { data: tpl } = await t.ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, variables, body_preview, hidden_at, category")
    .eq("id", templateId)
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved" || tpl.hidden_at)
    return refuse(
      `that template is not approved by WhatsApp, or the workspace keeps it out of the composers; ${AUDIENCES_CALL} names the ones that may send`,
    );

  const values = proposedSpecs(input.params, tpl);
  if ("refusal" in values) return refuse(values.refusal);
  const { specs } = values;

  let checked;
  try {
    // A new playbook (existing null): the check holds it to the moments offered now, with this workspace's calendar,
    // read from the zone and settings the turn holds (readers/facts.ts), never again.
    checked = await checkPlaybookInput(
      t.ctx,
      t.tenantId,
      {
        name: str(input.name, 80) || undefined,
        trigger: trig.id,
        ...(listRef ? (listRef.kind === "builtin" ? { list_key: listRef.id } : { list_id: listRef.id }) : {}),
        ...(listRef ? { policy_class: str(input.policy_class, 20) || undefined } : {}),
        template_id: tpl.id,
        params: specs,
        run_hour: typeof input.run_hour === "number" ? input.run_hour : undefined,
        cap_per_run: typeof input.cap_per_run === "number" ? input.cap_per_run : undefined,
        // The channels it names, WhatsApp alone when it names none (as a playbook goes by default): the check holds them to
        // the route's own rule, a tick its purpose never carries refused in the composers' words.
        channels: input.channels,
      },
      null,
      zoneAndSettings(t.rc),
    );
  } catch (e) {
    return refuse(e instanceof Error ? e.message : String(e));
  }

  const deal = trig.kind === "deal";
  const [pool, policies, paceRead, followUps] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data),
    listPolicies(t.ctx.supabase, t.tenantId).catch(() => []),
    // A proposal's moment is counted as the page counts it (0006): by the pace, less whoever had their follow-up.
    deal ? dealPaceRead(t.ctx, t.tenantId, t.now) : Promise.resolve(null),
    deal ? proposalFollowUps(t.ctx, t.tenantId, t.now).catch(() => null) : Promise.resolve(new Map<string, number>()),
  ]);
  if (!followUps)
    return refuse("who already had a proposal follow-up could not be read just now; say so, and try again in a moment");
  const untouched = {
    byThis: new Map<string, number>(),
    byAny: new Map<string, number>(),
    followUps,
  };
  // A list's people, as a run counts them (listedPeople).
  const listed = listRef ? await listedPeople(t, pool, listRef) : { ids: null, label: null };
  if ("refusal" in listed) return refuse(listed.refusal);
  const { ids: listIds, label: listLabel } = listed;
  // Who a run reaches now, and who its moment names said the yes it needs: the card said "0 on the list said yes
  // now" about a list whose yes had no number to send to. Said in the send screen's words (saidYesWords).
  // By the channels it names, WhatsApp alone when it names none.
  const by = { channels: checked.channels, named: input.channels !== undefined };
  const how = await playbookHow(t, tpl, by, messageAboutOfTrigger(trig.id));
  const drawn = playbookRunReach(
    pool.rows,
    // The yes its message needs, with its moment's: the check above held the two to agree, so the stricter is either.
    // By WhatsApp, as a proposal names no other channel, the workspace ready on it or not: a run holds the people it
    // cannot reach there, and the card says so below.
    {
      trigger: trig.id,
      cap_per_run: 100_000,
      gap_days: 0,
      cadence_days: 0,
      message: { category: tpl.category },
      ...how,
    },
    untouched,
    t.now.getTime(),
    dealPaceOf(paceRead),
    listIds,
  );
  // A tick that cannot send yet stays on the playbook, and its run holds those people until it can: the card says so.
  const { goes, waiting } = playbookChannelsSaid(how, by, drawn.reach.by_channel);
  const cls = checked.policy_class;
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  const said = await cardSays(t, tpl, specs, by, 140);
  if ("refusal" in said) return refuse(said.refusal);
  return propose({
    kind: "playbook",
    title: `Playbook: ${checked.name}`,
    summary: `${listLabel ? `On ${listLabel}` : `${trig.label} — ${trig.hint.toLowerCase()}`} · ${scheduleLine(checked)}${goes} · ${waiting}${saidYesWords("the list", purposeOfPlaybook(cls), drawn.reach.will, drawn.saidYes)} · under “${PLAYBOOK_CLASS_LABEL[cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}. Says: ${said.says}`,
    payload: {
      trigger: trig.id,
      trigger_label: trig.label,
      template_id: tpl.id,
      template_name: tpl.name,
      params: specs,
      run_hour: checked.run_hour,
      cap_per_run: checked.cap_per_run,
      gap_days: checked.gap_days,
      cadence_days: checked.cadence_days,
      name: checked.name,
      candidates: drawn.reach.will,
      policy_class: cls,
      // The list it runs on, when it runs on one: the commit names it as the composer does.
      list_id: checked.list_id,
      list_key: checked.list_key,
      mode,
      // Named only when the proposal named some: a card that named none commits as it always did.
      ...namedChannels(by),
    },
  });
}

/** A playbook, a standing rule: propose_campaign's action playbook (campaign.ts), once propose_playbook. */
export const playbookAction = actAction({
  kind: "playbook",
  input: z.object({
    trigger: z.enum(PROPOSABLE_TRIGGERS),
    // On a list (saved_list): the list's token from campaigns.audiences, and what it sends.
    list: z.string().optional(),
    policy_class: z.enum(LIST_PLAYBOOK_CLASSES).optional(),
    template_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    name: z.string().optional(),
    channels: z.array(z.enum(CONSENT_CHANNELS)).optional(),
  }),
  examples: [
    { trigger: "quiet_30" },
    {
      trigger: "saved_list",
      list: "seg:booked_week",
      policy_class: "campaign",
      template_id: "d4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f70",
      params: ["@first_name", "@booking_link"],
      run_hour: 10,
    },
  ],
  label: "Preparing a playbook",
  words:
    "Action playbook takes trigger and proposes a standing rule that sends one approved WhatsApp template to newly eligible people who said yes: trigger is quiet_30 (win-back by silence, nothing heard in 30 days, where no calendar is connected), lapsed (win-back by visits, no visit in 45 days, where one is: the check refuses the one the workspace cannot read), everyone_monthly (the month's offer), saved_list (on any list: its token from campaigns with action audiences in list, one of People's or one of the workspace's own, with policy_class campaign for an offer or reengage for a win-back), or, where deals are on, proposal_waiting (the proposal follow-up: one nudge per proposal waiting past the workspace's pace, one such playbook per workspace, its message carrying the proposal's link as @proposal_link); template_id is an approved template, or omitted for the trigger's starter when the workspace holds it; params are the template's values in order (typed text, or @first_name, @business_name, @booking_link, @proposal_link), filled in for a starter except a typed one such as the month's offer; run_hour is 9 to 20 by the business's clock (default 10), cap_per_run defaults to 25, and channels (whatsapp, sms, email; whatsapp when none is named) are the ones it may go by, each person once on the first it can: a channel its purpose never carries is refused, and one the workspace cannot send on yet is kept, its runs holding those people until it can.",
  build: proposePlaybook,
});
