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
import type { Database } from "@chanlytics/db/types";
import { pg } from "../shared/pg.js";
import { readLeadContext, describeLead } from "@chanlytics/db/conversations";
import { findPersonReplyMode } from "@chanlytics/db/workspace";
import { findOffersAnswer } from "@chanlytics/db/campaigns";
import { findFiledNames } from "@chanlytics/db/lines";
import { loadTenantRuntime, waCfgFor, type TenantRuntime } from "../shared/tenant-runtime.js";
import { findOpenings, findVisits, takesRequests, requestTermsFor } from "../calendar/availability.js";
import { getTokensLast24h } from "../ai/budget.js";
import { readPgThread, runPgIngest, pgSink, queueReply, replyTurn, readPgAnswered } from "./persist.js";
import { alertStaff } from "./alerts.js";
import { pageOperator } from "../shared/alerts/page-operator.js";
import { whatsappSender, type InboundPorts as CoreInboundPorts } from "@chanlytics/core";
import { logger } from "../shared/log.js";
import { env } from "../shared/env.js";

export interface InboundPorts extends Omit<CoreInboundPorts, "log" | "waCfg" | "leads" | "filing"> {
  /** The database, or null when this deployment persists nothing. */
  db: () => SupabaseClient<Database> | null;
  /** The control plane's one door: the workspace's persona, policy, credentials. */
  runtime: typeof loadTenantRuntime;
  leads: {
    read: typeof readLeadContext;
    /** By the person's own row, for a wire with no number (a DM); a test's world may leave it out. */
    readById?: (
      db: SupabaseClient<Database>,
      tenantId: string,
      contactId: string,
      historyLimit?: number,
      answering?: string,
    ) => ReturnType<typeof readLeadContext>;
    personReplyMode: typeof findPersonReplyMode;
    offersAnswer?: typeof findOffersAnswer;
  };
  /** The names the workspace's filings hold: a START by text is confirmed in its campaign's (X4-5). A test's world may leave it out. */
  filing?: { names: typeof findFiledNames };
  calendar: {
    openings(rt: TenantRuntime, now?: Date): Promise<string | null>;
    visits(rt: TenantRuntime, who: { phone: string | null; name: string | null }, now?: Date): Promise<string | null>;
    /** Booking requests (decision 0061); a test's world may leave it out, and no turn then takes one. */
    requests?: { takes: typeof takesRequests; terms: typeof requestTermsFor };
  };
  budget: { tokensLast24h: typeof getTokensLast24h };
  /** The Postgres bookkeeping of one message: ingest, the memory, the held draft, the sink. */
  persist: {
    thread: typeof readPgThread;
    ingest: typeof runPgIngest;
    sink: typeof pgSink;
    queueReply: typeof queueReply;
    /** The thread's reply turn (00284); a test's world may leave it out, and every message then holds its turn. */
    turn?: typeof replyTurn;
    /** Whether a reply names a message already (a text's answer taken up again); a test's world may leave it out. */
    answered?: typeof readPgAnswered;
  };
  alertStaff: typeof alertStaff;
  page: typeof pageOperator;
  sender: typeof whatsappSender;
  /** The model, loaded only when there is a key: it is the one import that pulls the SDK. */
  brain: () => Promise<Pick<typeof import("../ai/receptionist-brain.js"), "generateReply">>;
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

export function setInboundPorts(inboundPorts: InboundPorts | null): void {
  injectedPorts = inboundPorts;
}

export function realPorts(): InboundPorts {
  if (injectedPorts) return injectedPorts;
  return {
    db: pg,
    runtime: loadTenantRuntime,
    leads: {
      read: readLeadContext,
      readById: (db, tenantId, contactId, limit, answering) =>
        readLeadContext(db, tenantId, { contactId }, limit, answering),
      personReplyMode: findPersonReplyMode,
      offersAnswer: findOffersAnswer,
    },
    filing: { names: findFiledNames },
    // A chat: what follows an opening or a visit may offer any link (calendar/availability.ts linkOfferedOn).
    calendar: {
      openings: (rt, now) => findOpenings(rt, "chat", now),
      visits: (rt, person, now) => findVisits(rt, person, "chat", now),
      requests: { takes: takesRequests, terms: requestTermsFor },
    },
    budget: { tokensLast24h: getTokensLast24h },
    persist: {
      thread: readPgThread,
      ingest: runPgIngest,
      sink: pgSink,
      queueReply,
      turn: replyTurn,
      answered: readPgAnswered,
    },
    alertStaff,
    page: pageOperator,
    sender: whatsappSender,
    brain: () => import("../ai/receptionist-brain.js"),
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
export function corePorts(inboundPorts: InboundPorts): CoreInboundPorts {
  return {
    ...inboundPorts,
    leads: { ...inboundPorts.leads, describe: describeLead },
    log: logger,
    waCfg: waCfgFor,
  };
}
