import "server-only";
/**
 * Stop everything (D22 of the answers canvas), and the switch that lets Ask act alone (D10). One press or one sentence pauses
 * all sending: every sequence running is paused through its own door, replies wait for a person, and Ask stops acting alone.
 * What it paused and what replies were set to are kept, so Resume puts back exactly that and nothing a member paused by hand.
 *
 * It never says stopped while something it reached still goes out on its own. A pause or a hold that fails is said in the
 * answer and kept beside the record, and pressed again, a stop looks again: whatever still sends is tried again and, once
 * paused, joins the record. A Resume that cannot bring something back keeps it in the record, and Stop everything stays on
 * until a Resume brings back the rest.
 *
 * A stop is always free: any member who may act may press it. Turning Ask's freedom on is an owner's or a partner's, since it
 * changes how the business runs.
 */
import { AppError, parseTenantConfigResult, type AskStopped, type TenantId } from "@chanlytics/contracts";
import { findConfigRow, findConfigRowVersioned, putTenantConfig } from "@chanlytics/db/workspace";
import { listRunningPlaybookIds } from "@chanlytics/db/campaigns";
import { logAndGoOn } from "@chanlytics/log";
import { log } from "@/server/shared/log";
import { serviceDb } from "@/server/shared/service-db";
import { load, readerContext } from "@/server/shared/reader";
import { policies as policiesReader } from "@/server/readers/facts";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** Writes one key of Ask's own section, on the service client: a stop may be pressed below settings' own role. */
async function writeAskKey(
  tenantId: TenantId,
  userId: string,
  key: "alone" | "stopped",
  value: unknown,
): Promise<void> {
  const db = serviceDb();
  // A teammate's save between the read and the write loses the race once: read it again, once.
  for (let tries = 0; tries < 2; tries++) {
    const { data: row } = await findConfigRowVersioned(db, tenantId);
    const stored = (row?.config ?? {}) as Record<string, unknown>;
    const ask = { ...((stored.ask as Record<string, unknown> | undefined) ?? {}) };
    if (value === null) delete ask[key];
    else ask[key] = value;
    const result = await putTenantConfig(db, tenantId, { ...stored, ask }, row?.version ?? 0, userId);
    if (result.ok) return;
  }
  throw new AppError("conflict", "Settings moved just then. Try again.", 409);
}

/** One of the verbs a stop presses, under the member's own session, as a press in a browser would. */
async function callOwn(req: Request, method: string, path: string, body: unknown): Promise<boolean> {
  const at = new URL(req.url);
  const url = new URL(`/api/v1/${path}`, at.origin);
  const workspace = at.searchParams.get("workspace");
  if (workspace) url.searchParams.set("workspace", workspace);
  const cookie = req.headers.get("cookie");
  const res = await fetch(url, {
    method,
    headers: {
      origin: at.origin,
      "x-via": "ask",
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  }).catch(logAndGoOn("stop call", null));
  return !!res?.ok;
}

/** What Stop everything keeps while it is on, as the workspace's settings hold it; null while it is off. */
async function readStopped(ctx: RouteContext, tenantId: TenantId): Promise<AskStopped | null> {
  const { data: row } = await findConfigRow(ctx.supabase, tenantId);
  const parsed = parseTenantConfigResult(row?.config ?? null);
  return parsed.ok ? ((parsed.config.ask as { stopped?: AskStopped } | undefined)?.stopped ?? null) : null;
}

/** What a press did, and what it could not: the page and Ask each say it in their own words. */
export interface StopAnswer {
  /**
   * Stop everything is wholly on: after a stop, nothing it reached still goes out on its own; after a Resume, it still holds
   * what did not come back.
   */
  stopped: boolean;
  /** How many sequences it holds paused, which Resume puts back; after a Resume, how many it still holds. */
  paused: number;
  /** After a stop, whether replies wait for a person; after a Resume, whether it still holds them. */
  replies: boolean;
  /** After a stop, the sequences still sending that it could not pause: pressed again, it tries them again. */
  left: number;
}

/**
 * Replies held for a person: whether they wait now, and the mode Resume puts back (the one found before the first hold).
 * A read of the rows that fails holds nothing, and is said as replies still going out.
 */
async function holdReplies(
  ctx: RouteContext,
  req: Request,
  member: Member,
  kept: string | null,
): Promise<{ held: boolean; reply: string | null }> {
  const rows = await load(readerContext(ctx, member), policiesReader, undefined).then(
    (r) => r.data,
    logAndGoOn("stop rows", null),
  );
  if (rows === null) return { held: false, reply: kept };
  const mode = rows.find((r) => r.class === "reply")?.mode ?? null;
  // No row is Asks you (core replyPosture), and Asks you is what a stop wants.
  if (mode === null || mode === "ask") return { held: true, reply: kept };
  const held = await callOwn(req, "PUT", "policies", { class: "reply", mode: "ask" });
  return { held, reply: held ? (kept ?? mode) : kept };
}

/**
 * Pause all sending: every running sequence, replies held, Ask not acting alone. Pressed again, it looks again: what still
 * sends is paused and joins the record, replies are held if they are not.
 */
export async function stopEverything(ctx: RouteContext, req: Request, member: Member): Promise<StopAnswer> {
  const tenantId = member.tenantId as TenantId;
  const already = await readStopped(ctx, tenantId);
  const paused = new Set(already?.playbooks ?? []);
  const left: string[] = [];
  for (const id of await listRunningPlaybookIds(ctx.supabase, tenantId)) {
    if (await callOwn(req, "PUT", `playbooks/${id}`, { state: "paused" })) paused.add(id);
    else left.push(id);
  }
  const replies = await holdReplies(ctx, req, member, already?.reply ?? null);
  const stopped: AskStopped = {
    at: already?.at ?? new Date().toISOString(),
    playbooks: [...paused],
    reply: replies.reply,
    ...(left.length > 0 ? { left } : {}),
    ...(replies.held ? {} : { replies_left: true }),
  };
  await writeAskKey(tenantId, ctx.userId, "stopped", stopped);
  const answer = {
    stopped: left.length === 0 && replies.held,
    paused: paused.size,
    replies: replies.held,
    left: left.length,
  };
  if (!answer.stopped) log.warn("ask_stop_left", { tenant_id: tenantId, left: left.length, replies: replies.held });
  return answer;
}

/**
 * Lift it: what the stop paused goes back, replies go back to what they were, Ask's freedom to what it was. What does not
 * come back stays in the record, so a Resume again puts back that and nothing else; the record goes once all of it did.
 */
export async function resumeEverything(ctx: RouteContext, req: Request, member: Member): Promise<StopAnswer> {
  const tenantId = member.tenantId as TenantId;
  const was = await readStopped(ctx, tenantId);
  if (!was) return { stopped: false, paused: 0, replies: false, left: 0 };
  const still: string[] = [];
  for (const id of was.playbooks)
    if (!(await callOwn(req, "PUT", `playbooks/${id}`, { state: "running" }))) still.push(id);
  const reply =
    was.reply && !(await callOwn(req, "PUT", "policies", { class: "reply", mode: was.reply })) ? was.reply : null;
  if (still.length === 0 && reply === null) {
    await writeAskKey(tenantId, ctx.userId, "stopped", null);
    return { stopped: false, paused: 0, replies: false, left: 0 };
  }
  const kept: AskStopped = { at: was.at, playbooks: still, reply, resumed_at: new Date().toISOString() };
  await writeAskKey(tenantId, ctx.userId, "stopped", kept);
  log.warn("ask_resume_left", { tenant_id: tenantId, left: still.length, replies: reply !== null });
  return { stopped: true, paused: still.length, replies: reply !== null, left: 0 };
}

/** The switch (D10): Ask may act on its own, following the rows. Off by default, and an owner's or a partner's to turn on. */
export async function setAskAlone(ctx: RouteContext, member: Member, on: boolean): Promise<{ alone: boolean }> {
  await writeAskKey(member.tenantId as TenantId, ctx.userId, "alone", on ? true : null);
  return { alone: on };
}
