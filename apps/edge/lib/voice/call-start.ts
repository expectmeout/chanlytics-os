/**
 * A call arrives on a workspace's line: what the receptionist is told before
 * it speaks, decided apart from the wire.
 *
 * WHY THIS IS A FUNCTION AND NOT THE ENDPOINT. What the agent is handed at
 * the top of a call -- whose facts, whose memory, the greeting with the
 * business's name, the line a transfer dials -- decides whose words come out
 * of its mouth, and every one of those decisions was held by a source scan
 * reading the endpoint as text: ten of them across eight files, and nothing
 * had ever run it. The house answers this the same way each time: judgeHealth
 * apart from the health route, callbackPlan apart from the OAuth return,
 * replyPosture apart from the handler, planSmsIngress apart from the texting
 * door. This is the voice door's.
 *
 * IT REPORTS RATHER THAN LOGS OR PAGES. The alert for a channel nobody routes
 * suppresses a repeat for fifteen minutes in module state, so a judgement
 * that paged from inside could be proved once and never again. It says
 * whether the platform is told; the door tells them. The same for the log:
 * an outcome for the facts and one for the memory, and the door writes the
 * lines. They are two because they are two reads with two ways to fail, and
 * a contact table that will not answer must not cost the call the business's
 * hours -- which, joined in one Promise.all, it used to.
 *
 * Nothing is injected but the calendar, which is the one read that leaves
 * the database. Every other reader takes its database as an argument, so a
 * test hands it one in memory and the real routing, the real runtime loader
 * and the real memory read run.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../packages/db.js";
import { resolveChannelDetailed, readLeadContext, describeLead } from "../packages/db.js";
import { loadTenantRuntime, type TenantRuntime } from "../tenant-runtime.js";
import { openingsFor, visitsFor } from "../calendar/availability.js";
import {
  normalizePhone,
  resolveSystemPrompt,
  describeNow,
  pausedVoiceFacts,
  greetingOf,
  phoneVoiceOf,
  phonePaceSpeed,
  type GreetingSource,
} from "../packages/contracts.js";
import { FACTS_UNAVAILABLE, CALLER_UNKNOWN, greetingFor } from "../packages/channels.js";

type Db = SupabaseClient<Database>;

/** Retell's dynamic variables, exactly as the response carries them. */
interface CallVariables {
  caller_context: string;
  business_facts: string;
  greeting: string;
  /**
   * The line the transfer tool dials. ABSENT when the workspace has none:
   * Retell then applies the shell's default ("" -- nowhere to dial), and the
   * composed facts have already told the agent to take a message instead of
   * transferring. Sending "" from here would be the same decision made in
   * two places.
   */
  handoff_number?: string;
}

/** How the business's facts were arrived at. */
type FactsOutcome =
  /** The workspace's own prompt, its clock, and the openings when it has a calendar. */
  | "composed"
  /** Billing stopped: the take-a-message script is the whole prompt for the call. */
  | "paused"
  /** Routed and read, and no persona -- or one that does not parse, which the error names. */
  | "missing"
  /** The database answered: no active voice channel routes this agent. The platform is told. */
  | "unrouted"
  /** The database did not answer, the runtime could not load, or there was no database to ask. Nobody is paged for a blip. */
  | "unreadable";

/** How the caller's memory was arrived at. */
type MemoryOutcome =
  /** A contact on file for this number, history or not. */
  | "known"
  /** A number nobody has on file: told as new, on the shared words the text receptionist uses. */
  | "new"
  /** Nothing to ask: no caller ID, or no workspace to ask it of. */
  | "none"
  /** The read failed; the agent treats them as new and the error says why. */
  | "unread";

interface CallStart {
  variables: CallVariables;
  /** Where the greeting came from (contracts greetingOf), or "late" past the plan's budget: the log line says it. */
  greetingSource: GreetingSource | "late";
  facts: FactsOutcome;
  memory: MemoryOutcome;
  /** Calls are arriving for a channel nobody routes: the platform is told. Sent by the door, where the suppression lives. */
  alert: boolean;
  /** The first thing that failed, for the log; null when nothing did. */
  error: string | null;
  /**
   * The thread this caller already has, when they have one.
   *
   * The door takes the live hold on it (00132) so the text receptionist does
   * not answer the same person on WhatsApp while they are on the phone with
   * us. A first-time caller has no thread yet -- readLeadContext is read-only
   * on purpose -- so there is nothing to hold and nothing to collide with.
   */
  conversationId: string | null;
  /**
   * The voice the workspace chose for its calls (contracts PHONE_VOICES), sent as the call's own override; null where
   * none is chosen, or the stored id is not on the list, and the line speaks in its own. Retell refuses a call whose
   * override it cannot honour, so nothing off the list is ever sent.
   */
  voiceId: string | null;
  /**
   * How fast that voice speaks (decision 0073, R7: contracts phonePaceSpeed), sent with it; null for the line's own pace.
   */
  voiceSpeed: number | null;
  /**
   * The settings version the facts were composed from (tenant_config.version, as the runtime read it): answered as the
   * call's metadata, and written on its row by the call webhook (decision 0069, R6), so a review judges the call against
   * what it knew. Null where nothing was composed.
   */
  configVersion: number | null;
  /**
   * Whose workspace the call belongs to, as soon as it routed: whatever the reads after the routing make of it. The door
   * keeps the delivery under it and proves a test of "keep my number" with it (inbound-call.ts), and a caller who
   * withheld their number, or whose memory could not be read, is no less this workspace's call. It was set only beside
   * a memory that read, so those calls were kept under no workspace and their forwarding never proven.
   */
  tenantId: string | null;
}

interface CallStartInput {
  agentId: string | undefined;
  /**
   * The caller's number as Retell sends it, "" when withheld. Read whole, "+" and all: the "+" is the country code, and
   * stripped before the number was read, a ten-digit number from elsewhere was read as an American one.
   */
  from: string;
  /** null when this deployment has no database: nothing can be routed, and nobody is paged for it. */
  db: Db | null;
  /** One clock for the whole opening: the prompt's hours, the day described, the openings, the memory's "last in touch". */
  now?: Date;
  /** How long the plan and each calendar read may take (PLAN_BUDGET_MS, CALENDAR_READ_MS); a test hands in shorter ones. */
  budgets?: { planMs: number; readMs: number };
  /** The calendar is the one read that leaves the database; a test hands in its own. */
  calendar?: Calendar;
}

/**
 * How long the plan may take before the call is answered without it. Retell gives this webhook ten seconds, and the
 * delivery's keep, the hold and the answer need the rest; a plan past it was a dropped call (the engine review's second
 * pass, 11 Oct 2026).
 */
const PLAN_BUDGET_MS = 6_500;

/** The calendar a call's plan reads: the one read that leaves the database; a test hands in its own. */
interface Calendar {
  openings(rt: TenantRuntime, now: Date): Promise<string | null>;
  visits(rt: TenantRuntime, who: { phone: string | null; name: string | null }, now: Date): Promise<string | null>;
}

/** A call's calendar: what follows an opening or a visit offers the link only where WhatsApp can carry it (linkOfferedOn). */
const CALL_CALENDAR: Calendar = {
  openings: (rt, at) => openingsFor(rt, "call", at),
  visits: (rt, who, at) => visitsFor(rt, who, "call", at),
};

/** How long each calendar read may take inside the plan: the openings, and the caller's visits (the record and the feed). */
const CALENDAR_READ_MS = 2_000;

/** A read that answers within `ms`, or null: a slow read costs its own block, never the call. */
async function inTime<T>(ms: number, read: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([read, new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The plan, or, past PLAN_BUDGET_MS, the shell's own words: no facts, a caller told as new and a nameless greeting, as a
 * database that does not answer gets. `late` says which; the plan left behind only reads.
 */
export async function planCallStartWithin(o: CallStartInput): Promise<CallStart & { late: boolean }> {
  const budget = o.budgets?.planMs ?? PLAN_BUDGET_MS;
  const readMs = o.budgets?.readMs ?? CALENDAR_READ_MS;
  const cal = o.calendar ?? CALL_CALENDAR;
  // Each calendar read within its own budget: a slow feed or record costs its block, never the call.
  const calendar: Calendar = {
    openings: (rt, at) => inTime(readMs, cal.openings(rt, at)),
    visits: (rt, who, at) => inTime(readMs, cal.visits(rt, who, at)),
  };
  const planned = await inTime(budget, planCallStart(o, calendar));
  if (planned) return { ...planned, late: false };
  return {
    variables: { caller_context: CALLER_UNKNOWN, business_facts: FACTS_UNAVAILABLE, greeting: greetingFor(null) },
    greetingSource: "late",
    facts: "unreadable",
    memory: "none",
    alert: false,
    error: `the plan took longer than ${budget} ms`,
    conversationId: null,
    voiceId: null,
    voiceSpeed: null,
    configVersion: null,
    tenantId: null,
    late: true,
  };
}

/**
 * Retell's variables for the call. Never omitted and never empty: Retell leaves an unsupplied variable in the prompt AS
 * the literal `{{business_facts}}`, and treats "" as a real value that also skips the shell's default. The constants
 * are the shell's own, so the fallback here and the default there cannot drift. The greeting is the business's own
 * line where it wrote one, else the standard one composed from its name (a rename never leaves the phone saying the old
 * one), nameless when the business is unknown, and paused, the take-a-message line (contracts greetingOf).
 */
function callVariables(v: { context: string; businessFacts: string; handoff: string | null; greeting: string }) {
  return {
    caller_context: v.context || CALLER_UNKNOWN,
    business_facts: v.businessFacts || FACTS_UNAVAILABLE,
    ...(v.handoff ? { handoff_number: v.handoff } : {}),
    greeting: v.greeting,
  };
}

/**
 * What the line says and does for this workspace, read off its runtime: the name it greets with, the owner's own
 * greeting, the line a transfer dials, and the voice it speaks in (contracts phoneVoiceOf: only one on the list).
 */
const spokenLineOf = (rt: TenantRuntime) => ({
  businessName: rt.brain?.business_name ?? null,
  ownGreeting: rt.brain?.profile?.phone_greeting,
  // The receptionist's own name, said in the standard greeting (decision 0073).
  assistant: rt.brain?.profile?.assistant_name ?? null,
  handoff: rt.brain?.profile?.handoff_number ?? null,
  voiceId: phoneVoiceOf(rt.brain?.profile?.phone_voice)?.id ?? null,
  voiceSpeed: phonePaceSpeed(rt.brain?.profile?.phone_pace),
});

/** How a call's line is spoken, before a runtime said: no name, the standard greeting, no hand-off, the line's voice. */
type SpokenLine = ReturnType<typeof spokenLineOf>;
const NO_LINE: SpokenLine = {
  businessName: null,
  ownGreeting: undefined,
  assistant: null,
  handoff: null,
  voiceId: null,
  voiceSpeed: null,
};

/**
 * The facts a call is told: the SAME composition the WhatsApp receptionist is given, in its spoken form, then the clock
 * and the open times. One place, so a rehearsal (planRehearsalStart) hears what a call on the line hears.
 */
function composedFacts(
  rt: TenantRuntime,
  brain: NonNullable<TenantRuntime["brain"]>,
  now: Date,
  openings: string | null,
) {
  return (
    `${resolveSystemPrompt(brain, "voice", rt.timezone, now, rt.policy, rt.known)}\n\n` +
    `${describeNow(rt.timezone, now, brain.profile?.closures)}${openings ? `\n\n${openings}` : ""}`
  );
}

/** What a rehearsal's call is told, and what of it the page says (planRehearsalStart). */
interface RehearsalStart {
  variables: CallVariables;
  voiceId: string | null;
  voiceSpeed: number | null;
  configVersion: number | null;
  /** The line a real call puts a caller through to, which a rehearsal does not dial (D4); null where there is none. */
  handoff: string | null;
}

/**
 * What a rehearsal's call is told (decision 0069): the composition a call on the line gets -- the facts, the clock and
 * the open times, the greeting, the voice -- for an owner playing a customer. No memory: they are nobody on file. And
 * no line to put them through to, since a rehearsal dials nobody (D4): its facts are composed as a workspace's with no
 * hand-off number, so the receptionist offers to take a message, and the page says what a real call would do instead.
 * Null where nothing can be composed: a runtime that did not load, a paused workspace, no persona.
 */
export async function planRehearsalStart(
  rt: TenantRuntime,
  now: Date,
  calendar: Calendar = CALL_CALENDAR,
): Promise<RehearsalStart | null> {
  if (rt.loadFailed || rt.paused || !rt.brain) return null;
  const line = spokenLineOf(rt);
  const brain = line.handoff ? { ...rt.brain, profile: { ...rt.brain.profile, handoff_number: undefined } } : rt.brain;
  const openings = await inTime(CALENDAR_READ_MS, calendar.openings(rt, now));
  const opening = greetingOf({
    name: line.businessName,
    stored: line.ownGreeting,
    paused: false,
    assistant: line.assistant,
  });
  return {
    variables: callVariables({
      context: "",
      businessFacts: composedFacts(rt, brain, now, openings),
      handoff: null,
      greeting: opening.text,
    }),
    voiceId: line.voiceId,
    voiceSpeed: line.voiceSpeed,
    configVersion: rt.configVersion ?? null,
    handoff: line.handoff,
  };
}

async function planCallStart(o: CallStartInput, calendar: Calendar): Promise<CallStart> {
  const now = o.now ?? new Date();
  const phone = normalizePhone(o.from);

  let facts: FactsOutcome = "unreadable";
  let memory: MemoryOutcome = "none";
  let alert = false;
  let error: string | null = null;
  let businessFacts = "";
  let context = "";
  let line: SpokenLine = NO_LINE;
  let conversationId: string | null = null;
  let configVersion: number | null = null;
  let tenantId: string | null = null;
  const fail = (e: unknown) => {
    if (error === null) error = e instanceof Error ? e.message : String(e);
  };

  try {
    // Whose call this is, before anything is read. No tenant means no memory
    // we are entitled to read: a returning caller loses their recognition, a
    // stranger keeps their privacy. "The database said no" and "the database
    // did not answer" are told apart, as the texting door tells them apart:
    // only the first is a switched-off channel worth paging the platform for.
    const db = o.db;
    if (!db) {
      fail("no database to route the call with");
    } else if (!o.agentId) {
      facts = "unrouted";
      alert = true;
    } else {
      const lookup = await resolveChannelDetailed(db, "voice", o.agentId);
      const routed = lookup.channel;
      if (lookup.lookupFailed) {
        fail("the voice channel could not be looked up");
      } else if (!routed) {
        facts = "unrouted";
        alert = true;
      } else {
        tenantId = routed.tenantId;
        // Both reads at once. Retell gives this webhook ten seconds before it
        // gives up on the call, and two round trips in series is how a slow
        // day turns into a dropped one. Settled, not all: the memory is read
        // from Postgres -- the same rows, the same rules, the same order as
        // the WhatsApp receptionist reads, so a customer who texted this
        // morning and phones this afternoon is talking to ONE receptionist --
        // and a contact table that will not answer is the caller's loss, not
        // the business's.
        const [rtR, leadR] = await Promise.allSettled([
          loadTenantRuntime(db, routed),
          phone ? readLeadContext(db, routed.tenantId, phone, 12) : Promise.resolve(null),
        ]);

        let rt: TenantRuntime | null = null;
        if (rtR.status === "rejected") {
          fail(rtR.reason);
        } else {
          rt = rtR.value;
          line = spokenLineOf(rt);
          if (rt.loadFailed) {
            fail("the workspace's runtime could not be loaded");
          } else if (rt.paused) {
            // Billing stopped: the phone receptionist takes a message and
            // promises a call back, nothing more -- its whole prompt for the call.
            facts = "paused";
            businessFacts = pausedVoiceFacts(line.businessName);
            // Nobody is put through while paused (the script says so): the transfer tool is given no number to dial.
            line = { ...line, handoff: null };
          } else if (rt.brain) {
            // The SAME composition the WhatsApp receptionist is given, asked
            // for in its spoken form. Not a copy of the hours kept in Retell's
            // dashboard -- a second copy is how two channels start disagreeing
            // about when the business opens, and only one of them can be
            // corrected from here.
            //
            // The clock and the open times ride INSIDE business_facts rather
            // than as variables of their own. Substitution happens once, at
            // call start, so there is no cache to protect here; a call is
            // minutes long, the feed is cached for five, and the agent needs
            // the openings before the caller asks "when could I come in?".
            facts = "composed";
            configVersion = rt.configVersion ?? null;
            businessFacts = composedFacts(rt, rt.brain, now, await calendar.openings(rt, now));
          } else {
            facts = "missing";
            if (rt.configBroken) fail("the workspace's config does not parse");
          }
        }

        if (!phone) {
          memory = "none";
        } else if (leadR.status === "rejected") {
          memory = "unread";
          fail(leadR.reason);
        } else if (leadR.value) {
          const lead = leadR.value;
          const parts = [describeLead(lead, now, rt?.timezone ?? "UTC", "voice")];
          // The caller's appointments ride with who they are, so "when am I
          // booked?" is answered from the calendar, not guessed.
          const visits = rt ? await calendar.visits(rt, { phone, name: lead.name }, now) : null;
          if (visits) parts.push(visits);
          const lines = lead.history.map(
            (h) => `${h.role === "user" ? "Customer" : "Business"}: ${String(h.content).slice(0, 160)}`,
          );
          if (lines.length) {
            parts.push("Recent interactions on this number (calls and messages):");
            parts.push(lines.join("\n"));
          }
          context = parts.join("\n");
          conversationId = lead.conversationId;
          // Said last, once the whole of it is built: a memory that threw
          // halfway is told as none, never as half.
          memory = lead.contactId ? "known" : "new";
        }
      }
    }
  } catch (e) {
    // A throw past the reads above leaves whatever was composed in place, and
    // says so: the caller still gets the facts that were read before it.
    fail(e);
  }

  const { businessName, ownGreeting, assistant, handoff } = line;
  const opening = greetingOf({ name: businessName, stored: ownGreeting, paused: facts === "paused", assistant });
  return {
    variables: callVariables({ context, businessFacts, handoff, greeting: opening.text }),
    greetingSource: opening.source,
    facts,
    memory,
    alert,
    error,
    conversationId,
    voiceId: line.voiceId,
    voiceSpeed: line.voiceSpeed,
    configVersion,
    tenantId,
  };
}
