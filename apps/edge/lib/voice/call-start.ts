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
import { normalizePhone, resolveSystemPrompt, describeNow, pausedVoiceFacts } from "../packages/contracts.js";
import { FACTS_UNAVAILABLE, CALLER_UNKNOWN, greetingFor } from "../packages/channels.js";

type Db = SupabaseClient<Database>;

/** Retell's dynamic variables, exactly as the response carries them. */
export interface CallVariables {
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
export type FactsOutcome =
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
export type MemoryOutcome =
  /** A contact on file for this number, history or not. */
  | "known"
  /** A number nobody has on file: told as new, on the shared words the text receptionist uses. */
  | "new"
  /** Nothing to ask: no caller ID, or no workspace to ask it of. */
  | "none"
  /** The read failed; the agent treats them as new and the error says why. */
  | "unread";

export interface CallStart {
  variables: CallVariables;
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
  /** Whose workspace the call belongs to, when it routed. */
  tenantId: string | null;
}

export interface CallStartInput {
  agentId: string | undefined;
  /** The caller's number as Retell sends it, with or without the "+"; "" when withheld. */
  from: string;
  /** null when this deployment has no database: nothing can be routed, and nobody is paged for it. */
  db: Db | null;
  /** One clock for the whole opening: the prompt's hours, the day described, the openings, the memory's "last in touch". */
  now?: Date;
  /** The calendar is the one read that leaves the database; a test hands in its own. */
  calendar?: { openings: typeof openingsFor; visits: typeof visitsFor };
}

export async function planCallStart(o: CallStartInput): Promise<CallStart> {
  const now = o.now ?? new Date();
  const calendar = o.calendar ?? { openings: openingsFor, visits: visitsFor };
  const digits = o.from.replace(/^\+/, "");
  const phone = digits ? normalizePhone(digits) : null;

  let facts: FactsOutcome = "unreadable";
  let memory: MemoryOutcome = "none";
  let alert = false;
  let error: string | null = null;
  let businessFacts = "";
  let context = "";
  let businessName: string | null = null;
  let handoff: string | null = null;
  let conversationId: string | null = null;
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
          businessName = rt.brain?.business_name ?? null;
          handoff = rt.brain?.profile?.handoff_number ?? null;
          if (rt.loadFailed) {
            fail("the workspace's runtime could not be loaded");
          } else if (rt.paused) {
            // Billing stopped: the phone receptionist takes a message and
            // promises a call back, nothing more -- its whole prompt for the call.
            facts = "paused";
            businessFacts = pausedVoiceFacts(businessName);
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
            const openings = await calendar.openings(rt, now);
            businessFacts =
              `${resolveSystemPrompt(rt.brain, "voice", rt.timezone, now, rt.policy, rt.known)}\n\n` +
              `${describeNow(rt.timezone, now, rt.brain.profile?.closures)}${openings ? `\n\n${openings}` : ""}`;
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
          const parts = [describeLead(lead, now, rt?.timezone ?? "UTC")];
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
          tenantId = routed.tenantId;
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

  return {
    variables: {
      caller_context: context || CALLER_UNKNOWN,
      // Never omitted and never empty: Retell leaves an unsupplied variable in
      // the prompt AS the literal `{{business_facts}}`, and treats "" as a real
      // value that also skips the shell's default. The constant is the shell's
      // own, so the fallback here and the default there cannot drift.
      business_facts: businessFacts || FACTS_UNAVAILABLE,
      ...(handoff ? { handoff_number: handoff } : {}),
      // The first sentence of the call, composed from the business's name so
      // a rename never leaves the phone greeting saying the old one; nameless
      // when the business is unknown, which is never wrong.
      greeting: greetingFor(businessName),
    },
    facts,
    memory,
    alert,
    error,
    conversationId,
    tenantId,
  };
}
