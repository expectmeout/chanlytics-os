/**
 * One playbook, started (app/api/v1/playbooks: checked whole, then written running with its line in the ledger in one
 * transaction, startNewPlaybook), and changed or removed (app/api/v1/playbooks/:id): { state } pauses or resumes it (the ledger records
 * which); { channels } changes the channels it goes by, judged against the playbook as it stands, and writes nothing
 * else; any other body re-checks the whole playbook the way a new one is checked and rewrites it
 * (campaigns/playbooks.ts); the rule can go, its runs staying as broadcasts with their numbers, recorded as a pause
 * with `deleted`. Never a reach-out's step: its sends would go with it (R16). The playbook is the row (playbookScope),
 * found under RLS, and the route declares who may and how often.
 */
import {
  AppError,
  PLAYBOOK_STATES,
  REACH_OUT_IS_NOT_A_MOMENT,
  REACH_OUT_REFUSALS,
  triggerOf,
} from "@chanlytics/contracts";
import { emitEvent, removePlaybook, setPlaybookState, startPlaybook, updatePlaybook } from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { jsonBody } from "@/server/request-guards";
import { recordDecision, type playbookScope } from "@/server/verbs";
import {
  checkPlaybookChannelsInput,
  checkPlaybookInput,
  playbookWriteError,
  refuseOnArchivedList,
} from "@/server/campaigns/playbooks";
import { channelsChanged, keptChannels } from "@/server/campaigns/playbook-channels";
import type { RouteContext } from "@/server/with-route";

/** The playbook a playbookScope route acts on, as the scope read it. */
type PlaybookRow = Awaited<ReturnType<typeof playbookScope.load>>;

/**
 * A new playbook (POST /api/v1/playbooks): everything it names checked the way the send route checks a broadcast
 * (checkPlaybookInput, in its own words, so the body is this verb's to read), then started with its line in the
 * ledger in one transaction (00357 start_playbook). The door runs on the member's own session, so the table's policy
 * judges the row as it judged the insert this replaced, and a start that cannot be recorded starts nothing: no
 * playbook sends with nobody on record as having started it, and a person who presses Start again makes one.
 */
export async function startNewPlaybook(ctx: RouteContext, req: Request, tenantId: string) {
  const body = (await jsonBody(req)) as Record<string, unknown> | null;
  const v = await checkPlaybookInput(ctx, tenantId, body, null);
  const { data: made, error } = await startPlaybook(ctx.supabase, {
    tenantId,
    playbook: {
      name: v.name,
      trigger: v.trigger,
      list_id: v.list_id,
      list_key: v.list_key,
      template_id: v.template_id,
      template_name: v.template_name,
      template_language: v.template_language,
      params: v.params,
      policy_class: v.policy_class,
      run_hour: v.run_hour,
      cap_per_run: v.cap_per_run,
      gap_days: v.gap_days,
      cadence_days: v.cadence_days,
      channels: v.channels,
    },
    decision: {
      name: v.name,
      trigger: v.trigger,
      template: `${v.template_name}/${v.template_language}`,
      policy_class: v.policy_class,
      run_hour: v.run_hour,
      cap_per_run: v.cap_per_run,
      channels: v.channels,
    },
    via: ctx.via ?? null,
    undoOf: ctx.undoOf ?? null,
  });
  if (error) throw playbookWriteError(error);
  if (!made) throw new Error("playbook not created");
  return { id: made.id, name: v.name, state: "running", decision_id: made.decisionId };
}

export async function changePlaybook(ctx: RouteContext, req: Request, p: PlaybookRow) {
  const id = p.id;
  const body = (await jsonBody(req)) as Record<string, unknown> | null;

  const onlyState = body && Object.keys(body).length === 1 && typeof body.state === "string";
  if (onlyState) {
    const state = body!.state as string;
    if (!(PLAYBOOK_STATES as readonly string[]).includes(state))
      throw new AppError("validation", "A playbook is running or paused.");
    if (state === p.state) return { id, state };
    // A playbook on an archived list stays paused until its list is restored or it is moved (decision 0009).
    if (state === "running") await refuseOnArchivedList(ctx, p);
    const { error } = await setPlaybookState(ctx.supabase, id, state);
    if (error) throw new Error(error.message);
    const decisionId = await recordDecision(
      ctx,
      p.tenant_id,
      "playbook",
      id,
      state === "running" ? "start_playbook" : "pause_playbook",
      { name: p.name },
    );
    return { id, state, decision_id: decisionId };
  }

  // A reach-out step is edited on its own sheet (Part 4); here it may only be paused or resumed, above.
  if (triggerOf(p.trigger)?.kind === "reach_out") throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
  // The channels it ticks now: an edit that names none keeps them, and the column is written only when they change (a
  // database 00298 has not reached has none to read or write).
  const kept = await keptChannels(ctx, id);
  // { channels } alone (the drawer's Goes by row, Ask's card): the channels it goes by change and nothing else is read
  // from the caller or written, so a copy of the playbook taken before somebody edited it can put nothing back.
  if (body && Object.keys(body).length === 1 && "channels" in body) {
    const channels = await checkPlaybookChannelsInput(ctx, p.tenant_id, { ...p, channels: kept }, body.channels);
    if (channelsChanged(channels, kept)) {
      const { error } = await updatePlaybook(ctx.supabase, id, { channels });
      if (error) throw playbookWriteError(error);
      await playbookEdited(ctx, p, p.name, ["channels"]);
    }
    // What it went by before this write, for an undo: the channels as this request found them, never a card's copy.
    return { id, name: p.name, state: p.state, was: { channels: kept } };
  }
  const v = await checkPlaybookInput(ctx, p.tenant_id, body, { ...p, channels: kept });
  const { error } = await updatePlaybook(ctx.supabase, id, {
    name: v.name,
    trigger: v.trigger,
    // A playbook moved off a list leaves it (both null); one never on a list names no column 00155 or 00168 adds. A
    // playbook on a list names exactly one of the two (playbooks_one_list).
    ...(v.list_id || v.list_key || p.trigger === "saved_list" ? { list_id: v.list_id, list_key: v.list_key } : {}),
    template_id: v.template_id,
    template_name: v.template_name,
    template_language: v.template_language,
    params: v.params,
    policy_class: v.policy_class,
    run_hour: v.run_hour,
    cap_per_run: v.cap_per_run,
    gap_days: v.gap_days,
    cadence_days: v.cadence_days,
    ...(channelsChanged(v.channels, kept) ? { channels: v.channels } : {}),
  });
  if (error) throw playbookWriteError(error);
  await playbookEdited(ctx, p, v.name, [
    ...(v.name !== p.name ? ["name"] : []),
    ...(v.trigger !== p.trigger ? ["moment"] : []),
    ...(v.template_id !== p.template_id ? ["message"] : []),
    ...(channelsChanged(v.channels, kept) ? ["channels"] : []),
  ]);
  return { id, name: v.name, state: p.state };
}

/**
 * An edit, on the ledger: the ledger kept a playbook starting and pausing and never that what it sends, or when, was
 * changed. Which parts moved, of the ones the scope read before the write (its name, its moment, its message, its
 * channels), and who by; never the words. As the service role: a session may not insert into events.
 */
async function playbookEdited(ctx: RouteContext, p: PlaybookRow, name: string, fields: string[]): Promise<void> {
  await emitEvent(serviceDb(), p.tenant_id, "playbook.changed", "playbook", p.id, { name, by: ctx.userId, fields });
}

export async function deletePlaybook(ctx: RouteContext, p: PlaybookRow) {
  const id = p.id;
  if (triggerOf(p.trigger)?.kind === "reach_out") throw new AppError("conflict", REACH_OUT_REFUSALS.notHere, 409);
  const { error, count } = await removePlaybook(ctx.supabase, id);
  if (error) throw new Error(error.message);
  if (!count) throw new AppError("not_found", "Playbook not found.", 404);
  const decisionId = await recordDecision(ctx, p.tenant_id, "playbook", id, "pause_playbook", {
    name: p.name,
    deleted: true,
  });
  return { deleted: true, id, decision_id: decisionId };
}
