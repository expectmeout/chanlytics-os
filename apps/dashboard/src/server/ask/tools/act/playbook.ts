import "server-only";
import { z } from "zod";
import {
  FOLLOW_UP_NEEDS_DEALS,
  FOLLOW_UP_ONE,
  LIST_PLAYBOOK_CLASSES,
  MOMENT_TRIGGERS,
  PLAYBOOK_CLASS_LABEL,
  REACH_OUT_IS_NOT_A_MOMENT,
  cleanParam,
  dealPaceOf,
  dealsAreOn,
  defaultParamSpecs,
  exampleParams,
  parseListToken,
  parseParamSpec,
  playbookRunReach,
  purposeOfPlaybook,
  renderTemplate,
  saidYesWords,
  scheduleLine,
  slotLabels,
  starterForTrigger,
  triggerOf,
  triggerOffered,
  type ParamSpec,
} from "@chanlytics/contracts";
import { listPolicies } from "@chanlytics/db";
import { archivedListWords, poolList } from "../../../audience";
import { dealPaceRead, sellsByOf } from "../../../deals";
import { checkPlaybookInput, proposalFollowUps } from "../../../playbooks";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { lists as listsReader } from "../../../readers/lists";
import { UUID, defineAct, propose, refuse, str, type ProposalOutcome, type ToolContext } from "../context";

/** What a run does under each mode, in the card's words. */
const MODE_WORDS: Record<string, string> = {
  auto: "each run sends on its own",
  veto: "each run sends 30 minutes later unless you stop it",
  ask: "each run waits for you on Today",
  never: "nothing runs until the class is changed",
};

async function proposePlaybook(
  t: ToolContext,
  input: {
    trigger: string;
    list?: string;
    policy_class?: string;
    template_id?: string;
    params?: string[];
    run_hour?: number;
    cap_per_run?: number;
    name?: string;
  },
): Promise<ProposalOutcome> {
  const trig = triggerOf(str(input.trigger, 30));
  if (!trig) return refuse("trigger must be quiet_30, new_week, phoned_only, everyone_monthly or saved_list");
  if (trig.kind === "reach_out") return refuse(REACH_OUT_IS_NOT_A_MOMENT);
  // A playbook on a list names it by its token (decision 0009): one of People's, or one of the workspace's own.
  const listRef = trig.kind === "saved" ? parseListToken(str(input.list, 60)) : null;
  if (trig.kind === "saved" && !listRef)
    return refuse("a playbook on a list needs list: the list's token from list_audiences (seg:<id> or list:<id>)");
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
    return refuse("template_id must be an id list_audiences returned, or omitted for the trigger's starter");
  if (!templateId) {
    const s = starterForTrigger(trig.id);
    const { data: starter } = await t.ctx.supabase
      .from("templates")
      .select("id")
      .eq("tenant_id", t.tenantId)
      .eq("channel", "whatsapp")
      .eq("name", s?.name ?? "")
      .eq("meta_status", "approved")
      .is("hidden_at", null)
      .order("language")
      .limit(1)
      .maybeSingle();
    if (!starter)
      return refuse(
        `the “${s?.title ?? trig.label}” starter is not approved on this workspace yet; say so and suggest adding the starter set under Campaigns › Messages, or name an approved template from list_audiences`,
      );
    templateId = starter.id;
  }
  const { data: tpl } = await t.ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, variables, body_preview, hidden_at")
    .eq("id", templateId)
    .eq("tenant_id", t.tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (!tpl || tpl.meta_status !== "approved" || tpl.hidden_at)
    return refuse(
      "that template is not approved by WhatsApp, or the workspace keeps it out of the composers; list_audiences names the ones that may send",
    );

  // The values: the model's, or the template's own defaults — a starter's
  // slots are known; a typed slot with no words is a question for the person.
  let specs: ParamSpec[];
  const given = Array.isArray(input.params) ? (input.params as unknown[]) : [];
  if (given.length) {
    specs = [];
    for (const p of given) {
      const spec = parseParamSpec(p);
      if (!spec)
        return refuse(
          "each value is text, or @first_name, @business_name or @booking_link, or @proposal_link on the proposal follow-up",
        );
      if (spec.kind === "text") {
        const v = cleanParam(spec.value);
        if (v === null)
          return refuse("every typed value must be plain text under 1024 characters, without line breaks");
        specs.push({ kind: "text", value: v });
      } else {
        specs.push(spec);
      }
    }
  } else {
    specs = defaultParamSpecs({ name: tpl.name, variables: tpl.variables });
    const labels = slotLabels({ name: tpl.name, language: tpl.language, variables: tpl.variables });
    const blank = specs.findIndex((s) => s.kind === "text" && !s.value);
    if (blank >= 0)
      return refuse(
        `this template takes typed words for “${labels[blank] ?? `value ${blank + 1}`}”; ask the person what to say there, then propose again with params`,
      );
  }

  let checked;
  try {
    checked = await checkPlaybookInput(t.ctx, t.tenantId, {
      name: str(input.name, 80) || undefined,
      trigger: trig.id,
      ...(listRef ? (listRef.kind === "builtin" ? { list_key: listRef.id } : { list_id: listRef.id }) : {}),
      ...(listRef ? { policy_class: str(input.policy_class, 20) || undefined } : {}),
      template_id: tpl.id,
      params: specs,
      run_hour: typeof input.run_hour === "number" ? input.run_hour : undefined,
      cap_per_run: typeof input.cap_per_run === "number" ? input.cap_per_run : undefined,
    });
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
  // A list's people, as a run counts them with no one looking (audience.ts poolList over the pool read for no one
  // is what the runner does; here the pool is the member's, so a list about "me" was refused by the check above).
  let listIds: Set<string> | null = null;
  let listLabel: string | null = null;
  if (listRef) {
    // One of the workspace's own lists is counted from the lists the turn holds (readers/lists.ts), never read again.
    const kept = listRef.kind === "saved" ? (await load(t.rc, listsReader, undefined)).data.lists : undefined;
    const found = await poolList(t.ctx, t.tenantId, pool, listRef, kept);
    if (!found) return refuse("no such list; list_audiences names them");
    if (found.archived) return refuse(archivedListWords(found.label, "run"));
    if ("unknown" in found) return refuse(`${found.label} can't be counted right now: ${found.unknown}`);
    listIds = new Set(found.memberIds);
    listLabel = found.label;
  }
  // Who a run reaches now, and who its moment names said the yes it needs: the card said "0 on the list said yes
  // now" about a list whose yes had no number to send to. Said in the send screen's words (saidYesWords).
  const drawn = playbookRunReach(
    pool.rows,
    { trigger: trig.id, cap_per_run: 100_000, gap_days: 0, cadence_days: 0 },
    untouched,
    t.now.getTime(),
    dealPaceOf(paceRead),
    listIds,
  );
  const candidates = drawn.reach.will;
  const cls = checked.policy_class;
  const mode = policies.find((r) => r.class === cls)?.mode ?? "ask";
  const words = renderTemplate(tpl.body_preview, exampleParams(specs, "the business"));
  return propose({
    kind: "playbook",
    needs: "operator",
    title: `Playbook: ${checked.name}`,
    summary: `${listLabel ? `On ${listLabel}` : `${trig.label} — ${trig.hint.toLowerCase()}`} · ${scheduleLine(checked)} · ${saidYesWords("the list", purposeOfPlaybook(cls), candidates, drawn.saidYes)} · under “${PLAYBOOK_CLASS_LABEL[cls]}” (${mode}): ${MODE_WORDS[mode] ?? mode}. Says: ${words.slice(0, 140)}${words.length > 140 ? "…" : ""}`,
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
      candidates,
      policy_class: cls,
      // The list it runs on, when it runs on one: the commit names it as the composer does.
      list_id: checked.list_id,
      list_key: checked.list_key,
      mode,
    },
    undo: "Delete it — nothing will run",
  });
}

export const propose_playbook = defineAct({
  name: "propose_playbook",
  description:
    "Propose a playbook: a standing rule that sends one approved WhatsApp template to newly eligible people who said yes. trigger: quiet_30 (win-back), new_week (welcome), phoned_only (save our number), everyone_monthly (the month's offer), saved_list (on any list: give its token from list_audiences in list -- one of People's or one of the workspace's own -- and policy_class campaign for an offer or reengage for a win-back), or, where deals are on, proposal_waiting (the proposal follow-up: one nudge per proposal waiting past the workspace's pace, one such playbook per workspace, its message carrying the proposal's link as @proposal_link). template_id: an approved template, or omit it for the trigger's starter when the workspace holds it. params: the template's values in order (typed text, or @first_name, @business_name, @booking_link, @proposal_link); a starter's are filled in, except a typed one such as the month's offer. run_hour 9–20 by the business's clock (default 10), cap_per_run (default 25). Read list_playbooks first. It becomes a card the person approves; it then runs under its class's autonomy mode.",
  input: z.object({
    // Every moment except the two that follow the calendar; a proposal's is refused where deals are off. A
    // reach-out's steps are not moments (MOMENT_TRIGGERS).
    trigger: z.enum(MOMENT_TRIGGERS.filter((t) => t.kind !== "visit").map((t) => t.id) as [string, ...string[]]),
    // On a list (saved_list): the list's token from list_audiences, and what it sends.
    list: z.string().optional(),
    policy_class: z.enum(LIST_PLAYBOOK_CLASSES).optional(),
    template_id: z.string().optional(),
    params: z.array(z.string()).optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    name: z.string().optional(),
  }),
  label: "Preparing a playbook",
  build: proposePlaybook,
});
