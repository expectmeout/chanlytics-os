/**
 * Everything the receptionist reaches outside itself, as one object.
 *
 * answerInbound (packages/core/src/inbound/answer.ts) is the customer path:
 * an order of phases, each a module beside it, their decisions most of them
 * pure steps, joined to the world by a dozen modules -- the database, the
 * memory, the tenant runtime, the sink and the sender, the alerts, the pager,
 * the model. Those were module imports inside the handler, which is why no
 * test could run it and fifty source reads pinned its text instead.
 *
 * The real modules are the default, so the runtime changes nothing; a test
 * hands in fakes and the handler's control flow runs for real against them.
 * Nothing here decides anything.
 *
 * `InboundPorts` is the core verb's shape minus the three the EDGE supplies
 * itself, so the two cannot drift: the logger factory, the credentials
 * resolver and the lead description are added by corePorts() below rather than
 * asked of every caller, which is what keeps a test's world exactly what it
 * has always been.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { pg } from "../pg.js";
import { readLeadContext, personReplyMode, describeLead } from "../packages/db.js";
import { loadTenantRuntime, waCfgFor } from "../tenant-runtime.js";
import { openingsFor, visitsFor } from "../calendar/availability.js";
import { tokensLast24h } from "../receptionist/budget.js";
import { pgThread, pgIngest, pgSink, queueReply } from "./persist.js";
import { alertStaff } from "./alerts.js";
import { pageOperator } from "../ops/page-operator.js";
import { whatsappSender, type InboundPorts as CoreInboundPorts } from "../packages/core.js";
import { logger } from "../log.js";
import { env } from "../env.js";

export interface InboundPorts extends Omit<CoreInboundPorts, "log" | "waCfg" | "leads"> {
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
  brain: () => Promise<Pick<typeof import("../receptionist/brain.js"), "generateReply">>;
  env: {
    /** The pilot allowlist for the environment's own number: comma-separated E.164 digits; empty disables it. */
    allowlist: string;
    modelKey: string | undefined;
  };
}

/**
 * A test's world, handed in the way setPg hands in a database: while one is
 * set, realPorts() answers with it, so a door that reaches the receptionist
 * runs over fakes when it is called exactly as production calls it. Nothing in
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
let injectedPorts: InboundPorts | null = null;

export function setInboundPorts(p: InboundPorts | null): void {
  injectedPorts = p;
}

export function realPorts(): InboundPorts {
  if (injectedPorts) return injectedPorts;
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
    brain: () => import("../receptionist/brain.js"),
    env: {
      allowlist: env.WHATSAPP_TEST_ALLOWLIST || "",
      modelKey: env.ANTHROPIC_API_KEY,
    },
  };
}

/**
 * The verb's world, from this one.
 *
 * Three things the body reaches for that a verb may not import: the edge's
 * logger FACTORY (it binds the tenant once, where it becomes known), the
 * credentials resolver, and the lead description, which is a VALUE from the db
 * package. Added here so a test's ports stay the shape they have always been.
 */
export function corePorts(p: InboundPorts): CoreInboundPorts {
  return {
    ...p,
    leads: { ...p.leads, describe: describeLead },
    log: logger,
    waCfg: waCfgFor,
  };
}
