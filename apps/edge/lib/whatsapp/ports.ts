/**
 * Everything the WhatsApp handler reaches outside itself, as one object.
 *
 * handleInbound is the customer path: seven hundred lines of decisions, most
 * of them pure steps (./steps.ts), joined to the world by a dozen module
 * imports -- the database, the thread store, the tenant runtime, the sink
 * and the sender, the alerts, the pager, the model. Those imports were why
 * no test could run it and fifty source reads pinned its text instead.
 *
 * The real modules are the default, so the runtime changes nothing; a test
 * hands in fakes and the handler's control flow runs for real against them.
 * Nothing here decides anything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../workspace/db.js";
import { pg } from "../pg.js";
import { getThread, saveThread, storeBackend } from "../store.js";
import { readLeadContext, personReplyMode } from "../workspace/db.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { openingsFor, visitsFor } from "../availability.js";
import { tokensLast24h } from "../budget.js";
import { pgThread, pgIngest, pgSink, queueReply } from "./persist.js";
import { alertStaff } from "./alerts.js";
import { pageOperator } from "../page-operator.js";
import { whatsappSender } from "../workspace/core.js";

export interface InboundPorts {
  /** The database, or null when this deployment persists nothing. */
  db: () => SupabaseClient<Database> | null;
  /** The bot's memory: the thread store, and which backend it is. */
  store: { get: typeof getThread; save: typeof saveThread; backend: typeof storeBackend };
  /** The control plane's one door: the workspace's persona, policy, credentials. */
  runtime: typeof loadTenantRuntime;
  leads: { read: typeof readLeadContext; personReplyMode: typeof personReplyMode };
  calendar: { openings: typeof openingsFor; visits: typeof visitsFor };
  budget: { tokensLast24h: typeof tokensLast24h };
  /** The Postgres bookkeeping of one message: ingest, memory, the held draft, the sink. */
  persist: { thread: typeof pgThread; ingest: typeof pgIngest; sink: typeof pgSink; queueReply: typeof queueReply };
  alertStaff: typeof alertStaff;
  page: typeof pageOperator;
  sender: typeof whatsappSender;
  /** The model, loaded only when there is a key: it is the one import that pulls the SDK. */
  brain: () => Promise<Pick<typeof import("../brain.js"), "generateReply">>;
  env: {
    /** Gate 1b: Postgres is the SOURCE of the bot's memory instead of a shadow of Blob. */
    pgReads: boolean;
    /** The atomic is_new gate even when PG_READS is off. */
    pgDedupe: boolean;
    /** The pilot allowlist for the environment's own number: comma-separated E.164 digits; empty disables it. */
    allowlist: string;
    modelKey: string | undefined;
  };
}

export function realPorts(): InboundPorts {
  return {
    db: pg,
    store: { get: getThread, save: saveThread, backend: storeBackend },
    runtime: loadTenantRuntime,
    leads: { read: readLeadContext, personReplyMode },
    calendar: { openings: openingsFor, visits: visitsFor },
    budget: { tokensLast24h },
    persist: { thread: pgThread, ingest: pgIngest, sink: pgSink, queueReply },
    alertStaff,
    page: pageOperator,
    sender: whatsappSender,
    brain: () => import("../brain.js"),
    env: {
      pgReads: process.env.PG_READS === "on",
      pgDedupe: process.env.PG_DEDUPE === "on",
      allowlist: process.env.WHATSAPP_TEST_ALLOWLIST || "",
      modelKey: process.env.ANTHROPIC_API_KEY,
    },
  };
}
