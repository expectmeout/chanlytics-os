import "server-only";
/**
 * Stop everything (D22 of the answers canvas), and the switch that lets Ask act alone (D10). One press or one sentence pauses
 * all sending: every sequence running is paused through its own door, replies wait for a person, and Ask stops acting alone.
 * What it paused and what replies were set to are kept, so Resume puts back exactly that and nothing a member paused by hand.
 *
 * A stop is always free: any member who may act may press it. Turning Ask's freedom on is an owner's or a partner's, since it
 * changes how the business runs.
 */
import { AppError, parseTenantConfigResult, type AskStopped, type TenantId } from "@chanlytics/contracts";
import { findConfigRow, findConfigRowVersioned, putTenantConfig } from "@chanlytics/db/workspace";
import { listRunningPlaybookIds } from "@chanlytics/db/campaigns";
import { logAndGoOn } from "@chanlytics/log";
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

/** What Stop everything did: how many sends it paused, and whether replies now wait. */
export interface StopAnswer {
  stopped: boolean;
  paused: number;
  replies: boolean;
}

/** Pause all sending: every running sequence, replies held, Ask not acting alone. Pressed twice, it is stopped once. */
export async function stopEverything(ctx: RouteContext, req: Request, member: Member): Promise<StopAnswer> {
  const tenantId = member.tenantId as TenantId;
  const { data: row } = await findConfigRow(ctx.supabase, tenantId);
  const parsed = parseTenantConfigResult(row?.config ?? null);
  const already = parsed.ok ? (parsed.config.ask as { stopped?: AskStopped } | undefined)?.stopped : null;
  if (already) return { stopped: true, paused: already.playbooks.length, replies: already.reply !== null };
  const running = await listRunningPlaybookIds(ctx.supabase, tenantId);
  const paused: string[] = [];
  for (const id of running) if (await callOwn(req, "PUT", `playbooks/${id}`, { state: "paused" })) paused.push(id);
  const rows = await load(readerContext(ctx, member), policiesReader, undefined).then(
    (r) => r.data,
    logAndGoOn("stop rows", []),
  );
  const reply = rows.find((r) => r.class === "reply")?.mode ?? null;
  const held =
    reply && reply !== "ask" ? await callOwn(req, "PUT", "policies", { class: "reply", mode: "ask" }) : false;
  const stopped: AskStopped = { at: new Date().toISOString(), playbooks: paused, reply: held ? reply : null };
  await writeAskKey(tenantId, ctx.userId, "stopped", stopped);
  return { stopped: true, paused: paused.length, replies: held };
}

/** Lift it: what the stop paused goes back, replies go back to what they were, Ask's freedom to what it was. */
export async function resumeEverything(ctx: RouteContext, req: Request, member: Member): Promise<StopAnswer> {
  const tenantId = member.tenantId as TenantId;
  const { data: row } = await findConfigRow(ctx.supabase, tenantId);
  const parsed = parseTenantConfigResult(row?.config ?? null);
  const was = parsed.ok ? (parsed.config.ask as { stopped?: AskStopped } | undefined)?.stopped : null;
  if (!was) return { stopped: false, paused: 0, replies: false };
  for (const id of was.playbooks) await callOwn(req, "PUT", `playbooks/${id}`, { state: "running" });
  if (was.reply) await callOwn(req, "PUT", "policies", { class: "reply", mode: was.reply });
  await writeAskKey(tenantId, ctx.userId, "stopped", null);
  return { stopped: false, paused: was.playbooks.length, replies: was.reply !== null };
}

/** The switch (D10): Ask may act on its own, following the rows. Off by default, and an owner's or a partner's to turn on. */
export async function setAskAlone(ctx: RouteContext, member: Member, on: boolean): Promise<{ alone: boolean }> {
  await writeAskKey(member.tenantId as TenantId, ctx.userId, "alone", on ? true : null);
  return { alone: on };
}
