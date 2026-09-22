/**
 * The saga, as a job runs it.
 *
 * The ledger's handler (packages/jobs, line_provision) is the durable part:
 * a lease, a heartbeat that resumes a dead worker, a bounded retry. This is
 * the edge's part, injected into the tick because the provider and the
 * receptionist's credentials live here: read the row and its workspace,
 * decide whether there is anything to do, take a failed row the way the
 * sweep would, and run provisionLine, which reads its own receipts so a
 * second run repeats nothing and looks up an owned number before buying.
 *
 * What the row says decides the run:
 *   provisioning  run it (a fresh buy, a person's retry, or a worker that died)
 *   failed        an automatic resume, if any are left; the take is exclusive
 *   answering     nothing to do
 *   gone          released meanwhile; nothing to do
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./packages/db.js";
import { lineProviderFromEnv, rowToLine, type LineProviderChoice } from "./lines.js";
import { provisionLine } from "./provision.js";
import {
  automaticResumesOf,
  claimLineForResume,
  countAutomaticResume,
  MAX_AUTOMATIC_RESUMES,
  type ResumedBy,
} from "./line-resume.js";
import { env } from "./env.js";

export interface LineProvisionOutcome {
  ok: boolean;
  step?: string;
  error?: string;
  /** What the run did, for the log: ran, resumed, nothing (and why). */
  did: "ran" | "resumed" | "nothing";
  why?: string;
}

export interface LineProvisionDeps {
  provider: () => LineProviderChoice | null;
  env: { apiKey: string | undefined; fnSecret: string | undefined };
  provision: typeof provisionLine;
  now: () => number;
}

export function realLineProvisionDeps(): LineProvisionDeps {
  return {
    provider: lineProviderFromEnv,
    env: { apiKey: env.RETELL_API_KEY, fnSecret: env.RETELL_FN_SECRET },
    provision: provisionLine,
    now: Date.now,
  };
}

export async function provisionLineJob(
  db: SupabaseClient<Database>,
  lineId: string,
  by: ResumedBy,
  deps: LineProvisionDeps = realLineProvisionDeps(),
): Promise<LineProvisionOutcome> {
  const choice = deps.provider();
  if (!choice) return { ok: false, error: "no_line_provider", did: "nothing", why: "no provider" };
  const { apiKey, fnSecret } = deps.env;
  if (!apiKey || !fnSecret)
    return { ok: false, error: !apiKey ? "no_provider_key" : "no_fn_secret", did: "nothing", why: "no credentials" };

  const row = await db.from("lines").select("*").eq("id", lineId).maybeSingle();
  if (row.error) throw new Error(`line_provision: ${row.error.message}`);
  if (!row.data) return { ok: true, did: "nothing", why: "released" };
  let line = row.data;
  if (line.voice_state === "answering") return { ok: true, did: "nothing", why: "answering" };
  if (line.voice_state !== "provisioning" && line.voice_state !== "failed")
    return { ok: true, did: "nothing", why: line.voice_state };

  const tenant = await db.from("tenants").select("id, name").eq("id", line.tenant_id).maybeSingle();
  if (tenant.error) throw new Error(`line_provision: ${tenant.error.message}`);
  if (!tenant.data) return { ok: false, error: "no such workspace", did: "nothing", why: "no workspace" };

  let did: LineProvisionOutcome["did"] = "ran";
  if (line.voice_state === "failed") {
    // A run of this job failed and the ledger is trying again: an automatic
    // resume, counted and bounded exactly as the sweep's are, and taken
    // exclusively so two runners never make two trunks.
    if (automaticResumesOf(line) >= MAX_AUTOMATIC_RESUMES) {
      return {
        ok: false,
        step: line.step ?? undefined,
        error: "automatic resumes exhausted; a person retries it from Setup",
        did: "nothing",
        why: "exhausted",
      };
    }
    const taken = await claimLineForResume(db, line, deps.now(), "sweep");
    if (!taken) return { ok: true, did: "nothing", why: "taken by another" };
    // COUNT the try, which is what makes the bound above a bound. The header
    // said these were "counted and bounded exactly as the sweep's are" and only
    // the sweep counted: `automatic_resumes` stayed 0 for ever on this path, so
    // MAX_AUTOMATIC_RESUMES never tripped and a line that can never finish was
    // retried by the ledger indefinitely -- each retry another run of provider
    // calls, another "your phone line hit a snag" bell, another platform email.
    const counted = await countAutomaticResume(db, taken);
    if (!counted.ok)
      return {
        ok: false,
        step: taken.step ?? undefined,
        error: `counting the automatic resume: ${counted.error}`,
        did: "nothing",
        why: "count unwritten",
      };
    line = counted.row;
    by = "sweep";
    did = "resumed";
  }

  const r = await deps.provision(db, choice, { apiKey }, { fnSecret }, tenant.data, rowToLine(line), by);
  return r.ok ? { ok: true, did } : { ok: false, step: r.step, error: r.error, did };
}
