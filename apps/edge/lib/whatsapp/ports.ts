/**
 * Everything the WhatsApp handler reaches outside itself, as one object.
 *
 * handleInbound is the customer path: seven hundred lines of decisions, most
 * of them pure steps (./steps.ts), joined to the world by a dozen module
 * imports -- the database, the memory, the tenant runtime, the sink and the
 * sender, the alerts, the pager, the model. Those imports were why no test
 * could run it and fifty source reads pinned its text instead.
 *
 * The real modules are the default, so the runtime changes nothing; a test
 * hands in fakes and the handler's control flow runs for real against them.
 * Nothing here decides anything.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { pg } from "../pg.js";
import { readLeadContext, personReplyMode } from "../packages/db.js";
import { loadTenantRuntime } from "../tenant-runtime.js";
import { openingsFor, visitsFor } from "../availability.js";
import { tokensLast24h } from "../budget.js";
import { pgThread, pgIngest, pgSink, queueReply } from "./persist.js";
import { alertStaff } from "./alerts.js";
import { pageOperator } from "../page-operator.js";
import { whatsappSender } from "../packages/core.js";

export interface InboundPorts {
  /** The database, or null when this deployment persists nothing. */
  db: () => SupabaseClient<Database> | null;
  /** The control plane's one door: the workspace's persona, policy, credentials. */
  runtime: typeof loadTenantRuntime;
  leads: { read: typeof readLeadContext; personReplyMode: typeof personReplyMode };
  calendar: { openings: typeof openingsFor; visits: typeof visitsFor };
  budget: { tokensLast24h: typeof tokensLast24h };
  /** The Postgres bookkeeping of one message: ingest, the memory, the held draft, the sink. */
  persist: { thread: typeof pgThread; ingest: typeof pgIngest; sink: typeof pgSink; queueReply: typeof queueReply };
  alertStaff: typeof alertStaff;
  page: typeof pageOperator;
  sender: typeof whatsappSender;
  /** The model, loaded only when there is a key: it is the one import that pulls the SDK. */
  brain: () => Promise<Pick<typeof import("../brain.js"), "generateReply">>;
  env: {
    /** The pilot allowlist for the environment's own number: comma-separated E.164 digits; empty disables it. */
    allowlist: string;
    modelKey: string | undefined;
  };
}

/**
 * A test's world, handed in the way setPg hands in a database: while one is
 * set, realPorts() answers with it, so a door that reaches handleInbound runs
 * over fakes when it is called exactly as production calls it. Nothing in
 * production sets it; null puts the real modules back.
 *
 * A module-level door, not a second parameter on the webhook's POST, which is
 * where it was first planned. Vercel does not call a method export with the
 * request alone: its Node runtime wraps each one with @edge-runtime/node-utils,
 * which calls `webHandler(request, new FetchEvent(request))`, and Vercel's
 * FetchEvent carries `waitUntil`. A parameter defaulted to realPorts() would
 * have been handed that event in production instead, every message would have
 * thrown inside the webhook's per-message catch, and every batch would still
 * have answered 200.
 */
let injected: InboundPorts | null = null;

export function setInboundPorts(p: InboundPorts | null): void {
  injected = p;
}

export function realPorts(): InboundPorts {
  if (injected) return injected;
  return {
    db: pg,
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
      allowlist: process.env.WHATSAPP_TEST_ALLOWLIST || "",
      modelKey: process.env.ANTHROPIC_API_KEY,
    },
  };
}
