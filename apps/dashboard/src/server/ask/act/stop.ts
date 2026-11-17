import "server-only";
/**
 * Stop everything (D22 of the answers canvas), and the switch that lets Ask act alone (D10). One press or one sentence stops
 * all sending, and the stop itself is written first, on the workspace's own row: from then the send door holds whatever
 * goes out on its own (core deliver/stop.ts), so nothing it reaches leaves, whatever comes after. Its record is kept at
 * once, since the page and Ask read the stop from it. Then, as clean-up, every sequence running is paused through its own
 * door, replies are set to wait for a person, and Ask stops acting alone. What it paused and what replies were set to are
 * kept, so Resume puts back exactly that and nothing a member paused by hand, and then lifts the stop.
 *
 * It never says stopped while something it reached still goes out on its own. Where the stop could not be written (a
 * database without its column, or a write that failed), a pause or a hold that fails is said in the answer and kept beside
 * the record, and pressed again, a stop looks again: whatever still sends is tried again and, once paused, joins the record.
 * A Resume that cannot bring something back keeps it in the record, so a Resume again brings back the rest.
 *
 * A stop is always free: any member who may act may press it. Turning Ask's freedom on is an owner's or a partner's, since it
 * changes how the business runs.
 */
import { AppError, parseTenantConfigResult, type AskStopped, type TenantId } from "@chanlytics/contracts";
import { findConfigRow, findConfigRowVersioned, putTenantConfig, setSendingStopped } from "@chanlytics/db/workspace";
import { listRunningPlaybookIds } from "@chanlytics/db/campaigns";
import { logAndGoOn } from "@chanlytics/log";
import { log } from "@/server/shared/log";
import { serviceDb } from "@/server/shared/service-db";
import { load, readerContext } from "@/server/shared/reader";
import { policies as policiesReader } from "@/server/readers/facts";
import type { Member } from "@/server/shared/route";
import type { RouteContext } from "@/server/shared/with-route";

/** The service client, the one place this file takes it: a stop may be pressed below settings' own role. */
const service = () => serviceDb();

/** Writes one key of Ask's own section, on the service client. */
async function writeAskKey(
  tenantId: TenantId,
  userId: string,
  key: "alone" | "stopped",
  value: unknown,
): Promise<void> {
  const db = service();
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
   * Stop everything is wholly on: after a stop, nothing it reached still goes out on its own (the stop written, or every
   * pause and hold made); after a Resume, it still holds what did not come back.
   */
  stopped: boolean;
  /** How many sequences it holds paused, which Resume puts back; after a Resume, how many it still holds. */
  paused: number;
  /** After a stop, whether the Replies row says wait for a person; after a Resume, whether it still holds them. */
  replies: boolean;
  /** After a stop, the sequences it could not pause: pressed again, it tries them again. */
  left: number;
}

/** The stop on the workspace's own row, written or lifted on the service client (db setSendingStopped). */
const writeTheStop = (tenantId: TenantId, at: string | null): Promise<boolean> =>
  setSendingStopped(service(), tenantId, at);

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
  const at = already?.at ?? new Date().toISOString();
  // The stop itself first. A write that fails is logged, and the stop is what the pauses below make it.
  const written = await writeTheStop(tenantId, at).catch(logAndGoOn("stop write", false));
  // The page and Ask read the stop from its record, so the record is kept the moment the stop is written: a press that
  // dies in the clean-up below never leaves a stop standing that no page shows and no Resume is offered for.
  if (written && !already) await writeAskKey(tenantId, ctx.userId, "stopped", { at, playbooks: [], reply: null });
  const paused = new Set(already?.playbooks ?? []);
  const left: string[] = [];
  for (const id of await listRunningPlaybookIds(ctx.supabase, tenantId)) {
    if (await callOwn(req, "PUT", `playbooks/${id}`, { state: "paused" })) paused.add(id);
    else left.push(id);
  }
  const replies = await holdReplies(ctx, req, member, already?.reply ?? null);
  // What still goes out on its own, kept for the page to say: nothing, once the stop is written.
  const stillGoing = !written && (left.length > 0 || !replies.held);
  const stopped: AskStopped = {
    at,
    playbooks: [...paused],
    reply: replies.reply,
    ...(stillGoing && left.length > 0 ? { left } : {}),
    ...(stillGoing && !replies.held ? { replies_left: true } : {}),
  };
  await writeAskKey(tenantId, ctx.userId, "stopped", stopped);
  if (left.length > 0 || !replies.held)
    log.warn("ask_stop_left", { tenant_id: tenantId, left: left.length, replies: replies.held, written });
  return { stopped: !stillGoing, paused: paused.size, replies: replies.held, left: left.length };
}

/**
 * Lift it: what the stop paused goes back, replies go back to what they were, then the stop itself is lifted, and Ask's
 * freedom goes back to what it was. What does not come back stays in the record, so a Resume again puts back that and
 * nothing else; the record goes once all of it did. The stop is lifted whatever did not come back: Resume is sending
 * again, and what did not is paused by its own row. A lift that fails fails the press, the record as it was, so the
 * next Resume puts the same back and lifts it then.
 */
export async function resumeEverything(ctx: RouteContext, req: Request, member: Member): Promise<StopAnswer> {
  const tenantId = member.tenantId as TenantId;
  const was = await readStopped(ctx, tenantId);
  if (!was) {
    // A stop whose record was never kept (its press failed after the stop was written) is lifted all the same.
    await writeTheStop(tenantId, null);
    return { stopped: false, paused: 0, replies: false, left: 0 };
  }
  const still: string[] = [];
  for (const id of was.playbooks)
    if (!(await callOwn(req, "PUT", `playbooks/${id}`, { state: "running" }))) still.push(id);
  const reply =
    was.reply && !(await callOwn(req, "PUT", "policies", { class: "reply", mode: was.reply })) ? was.reply : null;
  await writeTheStop(tenantId, null);
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
