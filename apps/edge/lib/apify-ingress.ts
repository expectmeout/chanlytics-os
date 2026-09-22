/**
 * The provider's webhook, decided (PRD §12.5). The provider signs nothing
 * (https://docs.apify.com/integrations/webhooks/ad-hoc-webhooks), so the
 * protection is the token in the URL each run was started with, kept on the
 * run row only as its sha256 and proven in constant time. The body is a
 * pointer: what it says about the run is never believed (the collect re-reads
 * the run). A pointer to a provider run the row does not hold is a run to
 * ABORT: it was started with our token by something that is not our runner.
 *
 * Pure, and run over a fake in apify-webhook-door.test.mjs; the door in
 * api/apify-webhook.ts reads the row, compares the token and does the one
 * write.
 */
import crypto from "node:crypto";
import { APIFY_RUN_END_EVENTS } from "./packages/channels.js";

/** The endings, spelled once: exactly the events every run is started asking for (core runner.ts). Anything else is progress. */
export const APIFY_FINAL_EVENTS: ReadonlySet<string> = new Set(APIFY_RUN_END_EVENTS);
export const WEBHOOK_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
export const RUN_ROW_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IngressRunRow {
  id: string;
  tenant_id: string;
  apify_run_id: string | null;
  state: string;
  webhook_token_hash: string;
}

/** sha256(token) against the row's hash, in constant time; a hash that is not 32 bytes never matches. */
export function tokenMatches(token: string, hash: string): boolean {
  const a = crypto.createHash("sha256").update(token).digest();
  let b: Buffer;
  try {
    b = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  return a.length === 32 && b.length === 32 && crypto.timingSafeEqual(a, b);
}

export type IngressVerdict =
  | { action: "refuse"; status: 400 | 401; log: string }
  | { action: "ignore"; log: string }
  | { action: "abort_foreign"; apifyRunId: string; log: string }
  | {
      action: "schedule_final";
      runRowId: string;
      tenantId: string;
      apifyRunId: string;
      fill: { datasetId: string | null } | null;
    };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export function planApifyIngress(input: {
  runRow: IngressRunRow | null;
  tokenOk: boolean;
  body: unknown;
}): IngressVerdict {
  const { runRow, tokenOk } = input;
  if (!runRow) return { action: "ignore", log: "apify_webhook_unknown_run" };
  if (!tokenOk) return { action: "refuse", status: 401, log: "apify_webhook_bad_token" };
  const body = obj(input.body);
  if (!body) return { action: "refuse", status: 400, log: "apify_webhook_not_json" };
  const eventType = str(body.eventType);
  if (!eventType || !APIFY_FINAL_EVENTS.has(eventType)) return { action: "ignore", log: "apify_webhook_not_final" };
  const resource = obj(body.resource);
  const pointer = str(obj(body.eventData)?.actorRunId) ?? str(resource?.id);
  if (!pointer || !/^[A-Za-z0-9]{1,40}$/.test(pointer))
    return { action: "refuse", status: 400, log: "apify_webhook_no_run" };
  if (runRow.apify_run_id && runRow.apify_run_id !== pointer)
    return { action: "abort_foreign", apifyRunId: pointer, log: "apify_webhook_other_run" };
  return {
    action: "schedule_final",
    runRowId: runRow.id,
    tenantId: runRow.tenant_id,
    apifyRunId: pointer,
    // A start whose answer was lost learns its run id here: the token proves the URL was ours, and only the run we started carries it.
    fill: runRow.apify_run_id ? null : { datasetId: str(resource?.defaultDatasetId) },
  };
}
