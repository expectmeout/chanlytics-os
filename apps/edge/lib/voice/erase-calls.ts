/**
 * A person's calls taken off the voice provider, as their erasure goes (decision 0036's provider leg, decision 0092).
 *
 * The erasure reached the three stores we hold -- the rows, the media bucket, the jobs -- and asked no provider to
 * delete anything, so Retell kept an erased caller's audio, transcript and log for as long as the agent's retention
 * (it was 90 days; CALL_LIMITS makes it a week). The erasure now asks it to delete each of the person's calls, read by
 * their provider ids before the rows go (packages/jobs erasure.ts, forgetAtProvider). Best effort, like every leg the
 * erasure cannot undo: a call the provider would not delete is counted, logged and left to its retention, and never
 * stops the erasure.
 *
 * Two roads to it: the dashboard's press, through POST /api/admin/voice/erase-calls (a token for this door, the workspace and
 * the member, since the provider key lives here alone: eraseCallsDoor), and the erasure_finish job on this edge, which is
 * handed eraseCallsAtProvider as its port (jobs-tick.ts).
 */
import { deleteCall } from "../packages/channels.js";
import { eachAtOnce } from "../packages/core.js";
import { isWorkspaceCall } from "../packages/db.js";
import { json, refuse } from "../http.js";
import { pg } from "../pg.js";
import { env } from "../env.js";
import { logger } from "../log.js";
import { workspaceFor, type Admitted } from "../admin-auth.js";

/** The most calls one erasure asks the provider about: a person with more has the rest left to the provider's week. */
const MAX_CALLS = 200;
/** How many of a person's calls are asked about at the provider side by side (eraseCallsAtProvider). */
const CALLS_AT_ONCE = 5;
/** How many of a person's calls are proved the workspace's side by side: a read each. */
const PROOFS_AT_ONCE = 10;

/** What the provider said of a person's calls: how many were asked about, deleted (or gone already), and refused. */
interface CallsErased {
  asked: number;
  deleted: number;
  refused: number;
}

/**
 * Each call deleted at the provider, a few at a time; none of it throws. One after another, a person with 44 calls took
 * 37 s (0.84 s a call, 5 Nov 2026). Five at a time is about 6 a second, inside the provider's 100 in 10 s.
 */
export async function eraseCallsAtProvider(
  apiKey: string,
  callIds: readonly string[],
  del: typeof deleteCall = deleteCall,
): Promise<CallsErased> {
  const out: CallsErased = { asked: 0, deleted: 0, refused: 0 };
  await eachAtOnce(
    callIds.slice(0, MAX_CALLS),
    CALLS_AT_ONCE,
    () => true,
    async (id) => {
      out.asked += 1;
      try {
        const r = await del({ apiKey }, id);
        if (r.ok) out.deleted += 1;
        else out.refused += 1;
      } catch {
        out.refused += 1;
      }
    },
  );
  return out;
}

/**
 * The door's verb: the call ids the dashboard read off the person's rows, each proved the token's workspace's (the
 * rows still stand: the leg runs before them), then deleted at the provider. A call of another workspace, or one the
 * database does not know, is skipped and counted as refused, never deleted.
 */
export async function eraseCallsDoor(
  auth: Admitted,
  body: { tenant_id?: unknown; call_ids?: unknown },
): Promise<Response> {
  const ws = workspaceFor(auth, typeof body.tenant_id === "string" ? body.tenant_id : undefined);
  if (!ws.ok) return ws.response;
  const tenantId = ws.tenantId ?? "";
  if (!tenantId) return refuse(400, "bad_tenant", "this door acts only for a workspace its credential names");
  const apiKey = env.RETELL_API_KEY;
  if (!apiKey) return refuse(503, "no_provider_key");
  const db = pg();
  if (!db) return refuse(503, "no_database");
  const ids = Array.isArray(body.call_ids)
    ? body.call_ids
        .filter((v): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(v))
        .slice(0, MAX_CALLS)
    : [];
  const mine: string[] = [];
  let notMine = 0;
  await eachAtOnce(
    ids,
    PROOFS_AT_ONCE,
    () => true,
    async (id) => {
      if (await isWorkspaceCall(db, tenantId, id)) mine.push(id);
      else notMine += 1;
    },
  );
  const erased = await eraseCallsAtProvider(apiKey, mine);
  logger({ tenant_id: tenantId }).info("erase_provider_calls", { ...erased, not_mine: notMine });
  return json(200, { ok: true, ...erased, refused: erased.refused + notMine });
}
