/**
 * The lead finder's pipeline, bound for the jobs ledger: the seam A1 left on
 * JobContext (`leads: { roundStart, collect, check }`) filled with core's
 * three verbs over the ports the edge holds (the service-role rows, the
 * provider, the judge, the webhook's address and token, scheduleJobOnce).
 * Absent without APIFY_TOKEN or ANTHROPIC_API_KEY, so a lead job in such a
 * deployment fails by name (packages/jobs handlers).
 *
 * The job's own id is the owner of every claim and lease it takes, so a job
 * the ledger tries again finds its own claim (core runner.ts).
 */
import { check, collect, startRound, type LeadPorts } from "./packages/core.js";
import { scheduleJobOnce, type ClaimedJob, type JobContext } from "./packages/jobs.js";
import type { Json } from "./packages/db.js";
import { leadDb } from "./lead-db.js";
import { leadWires, type LeadWires } from "./lead-wires.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEQ = /^[a-z0-9.]{1,40}$/;

type Pipeline = NonNullable<JobContext["leads"]>;

/** A payload is a bug when it is not the ledger's shape: the tick fails the job loudly rather than guessing. */
function field(job: ClaimedJob, key: string, ok: (v: unknown) => boolean): string {
  const v = job.payload[key];
  if (!ok(v)) throw new Error(`${job.kind}: payload.${key} is not what the ledger writes (${JSON.stringify(v)})`);
  return String(v);
}

function portsFor(wires: LeadWires, ctx: JobContext, job: ClaimedJob): LeadPorts {
  return {
    db: leadDb(ctx.db),
    apify: wires.apify,
    judge: wires.judge,
    fetchText: wires.fetchText,
    now: () => new Date(),
    webhookBase: wires.webhookBase,
    webhookToken: wires.webhookToken,
    // scheduleJobOnce is once per key only where a unique index says so, and
    // of these three only lead_collect has one (00140's jobs_lead_collect_once,
    // on the run and the seq of every collect that has not failed for good): a
    // second row for the same page is answered as the fact it is. A second
    // lead_round_start or lead_check is simply inserted, and what keeps those
    // from doing anything twice is the claim and the lease, not the ledger.
    schedule: async (kind, payload, runAfterSeconds) => {
      await scheduleJobOnce(ctx.db, { tenantId: job.tenant_id, kind, dueAt: new Date(Date.now() + runAfterSeconds * 1000), payload: payload as Json });
    },
    deadline: ctx.deadline,
  };
}

/** The pipeline over given wires: what a test hands fakes to. */
export function leadPipelineOver(wires: LeadWires): Pipeline {
  return {
    async roundStart(ctx, job) {
      const roundId = field(job, "round_id", (v) => typeof v === "string" && UUID.test(v));
      const resume = job.payload.resume === true;
      const outcome = await startRound(portsFor(wires, ctx, job), roundId, job.id, resume);
      console.log(JSON.stringify({ level: "info", event: "lead_round_start", tenant: job.tenant_id, job: job.id, resume, ...outcome }));
    },
    async collect(ctx, job) {
      const runId = field(job, "run_id", (v) => typeof v === "string" && UUID.test(v));
      const seq = field(job, "seq", (v) => typeof v === "string" && SEQ.test(v));
      const outcome = await collect(portsFor(wires, ctx, job), runId, seq, job.id);
      console.log(JSON.stringify({ level: "info", event: "lead_collect", tenant: job.tenant_id, job: job.id, seq, ...outcome }));
    },
    async check(ctx, job) {
      const roundId = field(job, "round_id", (v) => typeof v === "string" && UUID.test(v));
      const batch = Number(field(job, "batch", (v) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100));
      // Check again (00145): the door's nonce and the leads ride the job; without them this is the round's own check.
      const nonce = job.payload.again;
      const leadIds = job.payload.lead_ids;
      const again = typeof nonce === "string" && nonce.length > 0 && Array.isArray(leadIds) && leadIds.length > 0 && leadIds.every((x) => typeof x === "string" && UUID.test(x))
        ? { nonce, leadIds: leadIds as string[] }
        : null;
      if ((nonce !== undefined || leadIds !== undefined) && !again) throw new Error(`lead_check: payload.again and payload.lead_ids are not what the door writes (${JSON.stringify({ nonce, leadIds })})`);
      const outcome = await check(portsFor(wires, ctx, job), roundId, batch, job.id, again);
      console.log(JSON.stringify({ level: "info", event: "lead_check", tenant: job.tenant_id, job: job.id, batch, again: again !== null, ...outcome }));
    },
  };
}

/** The pipeline for this deployment, or nothing without the keys. */
export function leadPipeline(): Pipeline | undefined {
  const wires = leadWires();
  return wires ? leadPipelineOver(wires) : undefined;
}
