/**
 * GET /api/health — the one door an outside monitor knocks on.
 *
 * No key. It says only whether the platform's clocks are healthy and whether
 * due work is being drained, never a workspace's name or a secret: 200 when
 * all is well, 503 otherwise, so a pinger outside our failure domain can
 * page a person even when the edge, the database or pg_cron is the thing
 * that is down. The health sweep (api/cron/health.ts) mails and pages from
 * inside; this is the same judgement read from outside, and it is what
 * catches the sweep itself not running. Cached ten seconds per instance,
 * so a noisy pinger cannot become a load on the database.
 */
import { pg } from "../lib/pg.js";
import { platformHealthOf } from "../lib/packages/contracts.js";
import type { SweepHealthRow } from "../lib/ops/sweep-health.js";

const CACHE_MS = 10_000;
let cached: { at: number; status: number; body: string } | null = null;

export interface HealthAnswer {
  ok: boolean;
  /** The clocks that are not healthy, by name. Names only: the detail stays inside. */
  unhealthy: string[];
  /** Due jobs nobody has claimed for two minutes; null when it could not be read. */
  jobs_backlog: number | null;
  checked_at: string;
  reason?: "health_unreadable" | "no_database" | "error";
}

/** The rpc surface the judgement needs, so a test can hand it a fake. */
export interface HealthDb {
  rpc: (name: "sweep_health" | "jobs_backlog") => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** The judgement, apart from the transport. */
export async function judgeHealth(db: HealthDb, now = new Date()): Promise<{ status: number; body: HealthAnswer }> {
  const checked_at = now.toISOString();
  const [health, backlog] = await Promise.all([db.rpc("sweep_health"), db.rpc("jobs_backlog")]);
  if (health.error) {
    return {
      status: 503,
      body: { ok: false, unhealthy: [], jobs_backlog: null, checked_at, reason: "health_unreadable" },
    };
  }
  const rows = (Array.isArray(health.data) ? health.data : []) as SweepHealthRow[];
  const jobs_backlog = backlog.error ? null : typeof backlog.data === "number" ? backlog.data : null;
  // ONE JUDGEMENT, shared with the back office, so an outside monitor and the
  // person reading the page cannot reach different conclusions from the same
  // two rows.
  //
  // The WIRE SHAPE IS UNCHANGED on purpose: this body is read by a pinger
  // somebody configured against it, and `unhealthy` there is a list of names.
  // Sharing the rule is worth doing; changing what a monitor parses is not.
  const judged = platformHealthOf(rows, jobs_backlog, now);
  return {
    status: judged.ok ? 200 : 503,
    body: { ok: judged.ok, unhealthy: judged.unhealthy.map((u) => u.sweep), jobs_backlog, checked_at },
  };
}

function answer(status: number, body: string): Response {
  return new Response(body, { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
}

/** The cache is read and written only here, synchronously, so no await can sit between a read and a write of it. */
function fromCache(): Response | null {
  const hit = cached;
  return hit && Date.now() - hit.at < CACHE_MS ? answer(hit.status, hit.body) : null;
}
function remember(status: number, body: HealthAnswer): Response {
  const text = JSON.stringify(body);
  cached = { at: Date.now(), status, body: text };
  return answer(status, text);
}

export async function GET(): Promise<Response> {
  const hit = fromCache();
  if (hit) return hit;
  const db = pg();
  const checked_at = new Date().toISOString();
  if (!db) {
    return answer(
      503,
      JSON.stringify({
        ok: false,
        unhealthy: [],
        jobs_backlog: null,
        checked_at,
        reason: "no_database",
      } satisfies HealthAnswer),
    );
  }
  let judged: { status: number; body: HealthAnswer };
  try {
    judged = await judgeHealth(db);
  } catch {
    judged = { status: 503, body: { ok: false, unhealthy: [], jobs_backlog: null, checked_at, reason: "error" } };
  }
  return remember(judged.status, judged.body);
}
