/**
 * One playbook, started (app/api/v1/playbooks: checked whole, then written running with its line in the ledger in one
 * transaction, startNewPlaybook), and changed or removed (app/api/v1/playbooks/:id): `{ state, name, run_hour,
 * cap_per_run, gap_days, cadence_days, params, until, trial_until }`, any of them, changes it in place, judged against it
 * as it stands and written
 * with its line in the ledger in one transaction (the change_playbook door; on a database before it, the way it was
 * written before, for one release); `{ channels }` changes the channels it goes by and writes nothing else; the whole
 * playbook is re-checked the way a new one is checked and rewritten (campaigns/playbooks.ts); the rule can go, its runs
 * staying as broadcasts with their numbers, recorded as a pause with `deleted`. Never a reach-out's step: its sends would
 * go with it (R16). The playbook is the row (playbookScope), found under RLS, and the route declares who may and how
 * often.
 */
import { z } from "zod";
import {
  AppError,
  CAMPAIGN_NOT_FOUND,
  PLAYBOOK_PATCH_WORDS,
  REACH_OUT_IS_NOT_A_MOMENT,
  REACH_OUT_REFUSALS,
  isPlaybookState,
  triggerOf,
  type PlaybookPatch,
} from "@chanlytics/contracts";
import { checkPlaybookPatch } from "@chanlytics/core";
import {
  emitEvent,
  playbookForChange,
  removePlaybook,
  startPlaybook,
  updatePlaybook,
  writePlaybookChange,
} from "@chanlytics/db";
import { serviceDb } from "@/server/service-db";
import { jsonBody } from "@/server/request-guards";
import { recordDecision, type playbookScope } from "@/server/verbs";
import {
  checkPlaybookChannelsInput,
  checkPlaybookInput,
  playbookPatchPorts,
  playbookWriteError,
} from "@/server/campaigns/playbooks";
import { channelsChanged, keptChannels } from "@/server/campaigns/playbook-channels";
import { withStarterMessage } from "@/server/campaigns/starter-templates";
import type { Member } from "@/server/route";
import type { RouteContext } from "@/server/with-route";

/** The playbook a playbookScope route acts on, as the scope read it. */
type PlaybookRow = Awaited<ReturnType<typeof playbookScope.load>>;

/**
 * What a body that is none of the three is refused in (contracts PLAYBOOK_PATCH_WORDS.putBody): one sentence that names
 * them, where zod said the first key of the nearest one it did not take (`Unrecognized key: "channels"` of channels that
 * were no list).
 */
const PUT_BODY_WORDS = PLAYBOOK_PATCH_WORDS.putBody;
/** Each body's own refusal of a key it does not take: the union's sentence, since the key may be another body's. */
const ONE_OF_THREE = {
  error: (issue: { code: string }) => (issue.code === "unrecognized_keys" ? PUT_BODY_WORDS : undefined),
};

/**
 * A change in place (the moment spec §4.9 A5): any of the nine, and no other key; its words (`params`, the values its
 * message takes), its last day (`until`, YYYY-MM-DD) and its trial's end (`trial_until`, an instant) since 00395, a null
 * clearing either date. Core judges each value, in words.
 */
const PATCH_BODY = z.strictObject(
  {
    state: z.string().optional(),
    name: z.string().optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    gap_days: z.number().optional(),
    cadence_days: z.number().optional(),
    params: z.array(z.unknown()).optional(),
    until: z.string().nullable().optional(),
    trial_until: z.string().nullable().optional(),
  },
  ONE_OF_THREE,
);
/** The channels it goes by, alone (the drawer's Goes by row, Ask's channels card). */
const CHANNELS_BODY = z.strictObject({ channels: z.array(z.string()) }, ONE_OF_THREE);
/** The whole playbook (the composer's Save changes): re-checked as a new one is, in its own words. */
const WHOLE_BODY = z.strictObject(
  {
    name: z.string().nullable().optional(),
    trigger: z.string(),
    list_id: z.string().nullable().optional(),
    list_key: z.string().nullable().optional(),
    policy_class: z.string().nullable().optional(),
    template_id: z.string(),
    params: z.array(z.unknown()).optional(),
    channels: z.array(z.string()).optional(),
    run_hour: z.number().optional(),
    cap_per_run: z.number().optional(),
    gap_days: z.number().optional(),
    cadence_days: z.number().optional(),
  },
  ONE_OF_THREE,
);
/**
 * What PUT playbooks/:id takes (decision D26): exactly one of the three, strict, so a key no body names is refused, never
 * ignored, and refused in one sentence that names the three (PUT_BODY_WORDS). Declared on the route, so docs/api.md says
 * it; on the server alone, so no page's bundle carries it.
 */
export const PLAYBOOK_PUT_BODY = z.union([PATCH_BODY, CHANNELS_BODY, WHOLE_BODY], { error: PUT_BODY_WORDS });
/** Not exported: only this module reads it, and knip counts an export nothing else imports (dead-exports.json). */
type PlaybookPutBody = z.infer<typeof PLAYBOOK_PUT_BODY>;

/**
 * A new playbook (POST /api/v1/playbooks): everything it names checked the way the send route checks a broadcast
 * (checkPlaybookInput, in its own words, so the body is this verb's to read), then started with its line in the
 * ledger in one transaction (00357 start_playbook). The door runs on the member's own session, so the table's policy
 * judges the row as it judged the insert this replaced, and a start that cannot be recorded starts nothing: no
 * playbook sends with nobody on record as having started it, and a person who presses Start again makes one. A body
 * naming `starter_key` and no message is judged whole, then files that starter (withStarterMessage: a refused one files
 * nothing and asks nothing of Meta), and the answer says what became of its WhatsApp version (`starter`).
 */
export async function startNewPlaybook(ctx: RouteContext, req: Request, member: Member) {
  const tenantId = member.tenantId;
  // A starter named and no message (A0): the starter is filed first, and the playbook goes by it.
  const asked = (await jsonBody(req)) as Record<string, unknown> | null;
  const { body, starter } = await withStarterMessage(ctx, member, asked);
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
  return { id: made.id, name: v.name, state: "running", decision_id: made.decisionId, ...(starter ? { starter } : {}) };
}

/** PUT playbooks/:id's three bodies, each to its own verb: the whole playbook, its channels alone, or a change in place. */
export async function changePlaybook(ctx: RouteContext, body: PlaybookPutBody, p: PlaybookRow) {
  if ("trigger" in body) return rewritePlaybook(ctx, body, p);
  if ("channels" in body) return changeChannels(ctx, body.channels, p);
  return patchPlaybook(ctx, body, p);
}

/**
 * A change in place (the moment spec §4.9 A5; decision D26): the drawer's Pause and Resume, Ask's change card, the
 * reach-out sheet's Pause. Judged against the playbook as the database holds it now (core checkPlaybookPatch: the six
 * fields' bounds, a cadence for the month's offer alone, a resume refused on an archived list, its words held to its
 * message's slots, its end a day today or later by the business's clock, its trial's end an instant, a reach-out's step
 * paused or resumed and nothing else), then written with its line in the ledger in one transaction (the change_playbook door):
 * the row locked, only what differs set, and what each field held answered as `was`, which an undo puts back. Nothing
 * that differs writes nothing and answers what it is, so a second press of Pause is no second line. On a database before
 * the door, written the way it was before (changeTheOldWay), for one release.
 */
async function patchPlaybook(ctx: RouteContext, asked: Record<string, unknown>, p: PlaybookRow) {
  const read = await playbookForChange(ctx.supabase, p.tenant_id, p.id);
  // A member reads it: the word lane 3 gave the campaign's own refusals.
  if (!read) throw new AppError("not_found", CAMPAIGN_NOT_FOUND, 404);
  // The table's check holds a state to the two; one it does not know is no row a change is judged against.
  if (!isPlaybookState(read.state)) throw new Error(`playbook ${p.id} holds a state the check does not: ${read.state}`);
  const row = { ...read, state: read.state };
  const { set, was } = await checkPlaybookPatch(playbookPatchPorts(ctx, p.tenant_id), row, asked, new Date());
  // Nothing differs: nothing written and no line, answered as the door answers its own no-op (was empty, decision_id null).
  if (Object.keys(set).length === 0) return { id: p.id, name: row.name, state: row.state, was: {}, decision_id: null };
  const name = set.name ?? row.name;
  const wrote = await writePlaybookChange(ctx.supabase, {
    tenantId: p.tenant_id,
    playbookId: p.id,
    set,
    decision: { name, ...set },
    via: ctx.via ?? null,
    undoOf: ctx.undoOf ?? null,
  });
  const done = wrote === "missing" ? await changeTheOldWay(ctx, p, { set, was, name }) : wrote;
  if (done.error) throw playbookChangeError(done.error);
  if (!done.data) throw new Error("playbook not changed");
  return { id: p.id, name, state: set.state ?? row.state, was: done.data.was, decision_id: done.data.decisionId };
}

/**
 * A change in place on a database before the change_playbook door: written as the route wrote it before, so either
 * deploy order works (CLAUDE.md), for one release, then this goes (docs/debt.md, owed). The row (`updatePlaybook`,
 * uncounted, as it always was), then its record: a pause or a resume is pause_playbook or start_playbook in the ledger, as
 * the drawer's switch wrote; any other change is the `playbook.changed` event the whole rewrite wrote (that database's
 * decisions_verb_check has no change_playbook), so its answer names no decision.
 */
async function changeTheOldWay(
  ctx: RouteContext,
  p: PlaybookRow,
  change: { set: PlaybookPatch; was: PlaybookPatch; name: string },
): Promise<{ data: { was: Record<string, unknown>; decisionId: string | null }; error: null }> {
  const { error } = await updatePlaybook(ctx.supabase, p.id, change.set);
  if (error) throw playbookWriteError(error);
  const others = Object.keys(change.set).filter((k) => k !== "state");
  if (others.length) await playbookEdited(ctx, p, change.name, others);
  const verb = change.set.state === "running" ? "start_playbook" : "pause_playbook";
  const decisionId = change.set.state
    ? await recordDecision(ctx, p.tenant_id, "playbook", p.id, verb, { name: change.name })
    : null;
  return { data: { was: { ...change.was }, decisionId }, error: null };
}

/** A change the database refused: not there (P0002: another workspace's, or one the role may not change), else as it came. */
function playbookChangeError(error: { code?: string; message: string }): Error {
  return error.code === "P0002" ? new AppError("not_found", CAMPAIGN_NOT_FOUND, 404) : new Error(error.message);
}

/**
 * { channels } alone (the drawer's Goes by row, Ask's card): the channels it goes by change and nothing else is read
 * from the caller or written, so a copy of the playbook taken before somebody edited it can put nothing back.
 */
async function changeChannels(ctx: RouteContext, asked: string[], p: PlaybookRow) {
  // A reach-out step is edited on its own sheet (Part 4); its state alone is a change in place.
  if (triggerOf(p.trigger)?.kind === "reach_out") throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
  // The channels it ticks now (a database 00298 has not reached has none to read or write).
  const kept = await keptChannels(ctx, p.id);
  const channels = await checkPlaybookChannelsInput(ctx, p.tenant_id, { ...p, channels: kept }, asked);
  if (channelsChanged(channels, kept)) {
    const { error } = await updatePlaybook(ctx.supabase, p.id, { channels });
    if (error) throw playbookWriteError(error);
    await playbookEdited(ctx, p, p.name, ["channels"]);
  }
  // What it went by before this write, for an undo: the channels as this request found them, never a card's copy.
  return { id: p.id, name: p.name, state: p.state, was: { channels: kept } };
}

/** The whole playbook (the composer's Save changes): re-checked the way a new one is, and rewritten. */
async function rewritePlaybook(ctx: RouteContext, body: Record<string, unknown>, p: PlaybookRow) {
  const id = p.id;
  // A reach-out step is edited on its own sheet (Part 4); its state alone is a change in place.
  if (triggerOf(p.trigger)?.kind === "reach_out") throw new AppError("conflict", REACH_OUT_IS_NOT_A_MOMENT, 409);
  // The channels it ticks now: an edit that names none keeps them, and the column is written only when they change (a
  // database 00298 has not reached has none to read or write).
  const kept = await keptChannels(ctx, id);
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
  if (!count) throw new AppError("not_found", CAMPAIGN_NOT_FOUND, 404);
  const decisionId = await recordDecision(ctx, p.tenant_id, "playbook", id, "pause_playbook", {
    name: p.name,
    deleted: true,
  });
  return { deleted: true, id, decision_id: decisionId };
}
