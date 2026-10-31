import "server-only";
import { z } from "zod";
import { DAY_MS, followUpsOf, freedTimesUnoffered, parseTenantConfigResult, plural } from "@chanlytics/contracts";
import { cancellationsSince } from "@chanlytics/db";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { config as configReader, facts as factsReader } from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
import { followUpsNow, memberViews } from "../../../readers/notifications";
import { playbooks, reachOutChains } from "../../../readers/playbooks";
import { searches as searchesReader } from "../../../readers/searches";
import { sequences as sequencesReader } from "../../../readers/sequences";
import { defineRead, unread, type ToolContext } from "../context";

/**
 * What Ask notices (the operator, 15 Oct 2026, D6): the workspace read across its pages, each thing that stands out said
 * with its numbers and the cards that fit it, computed here by code -- Ask decides how to say them and in what order, and
 * never computes them from rows. A follow-up of the member's that is due comes first; the owner's goal rides on top, so
 * every signal is weighed against it. Each part is read as its page reads it; a read that fails leaves its signal out,
 * said in `unread`, never as nothing to notice.
 */

/** Who counts as new: first heard from within this many days. */
const NEW_DAYS = 30;

interface Signal {
  key: string;
  /** What stands out, with its numbers, in a sentence. */
  says: string;
  /** The cards that fit it, by tool and action. */
  next: string;
  /** How much it matters now: 1 first. */
  weight: 1 | 2 | 3;
}

/** The workspace as the signals read it: each part as its page reads it, null where its read failed. */
async function seeAll(t: ToolContext) {
  const failed = (read: string) => unread(t, "signals", read);
  const since = new Date(t.now.getTime() - NEW_DAYS * DAY_MS).toISOString();
  const [pool, kept, seqs, pb, chains, finder, cfg, zone, views, cancellations] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data, failed("people")),
    load(t.rc, listsReader, undefined).then((r) => r.data.lists, failed("lists")),
    load(t.rc, sequencesReader, undefined).then((r) => r.data, failed("sequences")),
    load(t.rc, playbooks, undefined).then((r) => r.data, failed("moments")),
    load(t.rc, reachOutChains, undefined).then((r) => r.data.chains, failed("cold emails")),
    load(t.rc, searchesReader, undefined).then((r) => r.data, failed("searches")),
    load(t.rc, configReader, undefined).then((r) => r.data, failed("settings")),
    load(t.rc, factsReader, undefined).then((r) => r.data.timezone, failed("facts")),
    t.ctx.userId ? load(t.rc, memberViews, undefined).then((r) => r.data, failed("follow-ups")) : Promise.resolve(null),
    // The cancellations whose time a freed time's step would have offered (decision 0082), in the same window.
    cancellationsSince(t.rc.ctx.supabase, t.rc.tenantId, since).then((n) => n, failed("cancellations")),
  ]);
  return { pool, kept, seqs, pb, chains, finder, cfg, zone, views, cancellations, nowMs: t.now.getTime() };
}
type Seen = Awaited<ReturnType<typeof seeAll>>;
/** One thing that may stand out, read off what was seen; null where it does not, or its parts could not be read. */
type Spot = (s: Seen) => Signal | null;

/** Many people and nothing that sends on its own. */
const nothingSends: Spot = ({ pool, seqs, nowMs }) => {
  const people = pool?.people ?? [];
  if (!pool || !seqs || people.length < 20 || seqs.sequences.some((s) => s.state === "on")) return null;
  const fresh = people.filter((r) => r.first_contact_at && nowMs - Date.parse(r.first_contact_at) <= NEW_DAYS * DAY_MS);
  return {
    key: "nothing_sends_on_its_own",
    says: `${plural(people.length, "person is", "people are")} in People (${fresh.length} new in the last ${NEW_DAYS} days) and nothing sends on its own.`,
    next: "propose_plan with action steps: lists that group them (propose_list make), then a sequence for the strongest group (propose_sequence make); or propose_plan with action offer, intent cover_journey",
    weight: 1,
  };
};

/** Lists of the workspace's own that no sequence runs on. */
const listsFeedNothing: Spot = ({ kept, pb }) => {
  if (!kept || !pb) return null;
  const used = new Set(pb.playbooks.flatMap((p) => [p.list_id, p.list_key].filter((x): x is string => !!x)));
  const idle = kept.filter((l) => !l.archived_at && !used.has(l.id));
  if (!idle.length) return null;
  const names = idle.slice(0, 4).map((l) => l.name);
  return {
    key: "lists_feed_nothing",
    says: `${plural(idle.length, "list feeds", "lists feed")} no sequence: ${names.join(", ")}${idle.length > 4 ? "…" : ""}.`,
    next: "propose_sequence with action moment on the list (trigger saved_list), after sequences with action lists counts who it reaches",
    weight: 2,
  };
};

/** Leads found that no cold email writes to: each search's qualified leads, as its latest round counts them. */
const leadsNotWrittenTo: Spot = ({ finder, chains }) => {
  if (!finder || !chains) return null;
  const written = new Set(chains.flatMap((c) => (c.search ? [c.search.id] : [])));
  const found = (s: (typeof finder.searches)[number]) => s.round?.qualified ?? 0;
  const unwritten = finder.searches.filter((s) => found(s) > 0 && !written.has(s.id));
  if (!unwritten.length) return null;
  const leads = unwritten.reduce((n, s) => n + found(s), 0);
  const named = unwritten.slice(0, 3).map((s) => `${s.name}: ${found(s)}`);
  return {
    key: "leads_not_written_to",
    says: `${plural(leads, "lead was", "leads were")} found in ${plural(unwritten.length, "search", "searches")} no cold email writes to (${named.join("; ")}).`,
    next: "leads with action leads (list ready) to pick the best, propose_leads with action list, then propose_sequence with action cold_email on it, in one propose_plan with action steps",
    weight: 1,
  };
};

/** A search that stopped to ask the owner something. */
const searchAsks: Spot = ({ finder }) => {
  const asking = (finder?.searches ?? []).filter((s) => s.round?.state === "waiting_on_owner");
  if (!asking.length) return null;
  return {
    key: "search_asks",
    says: `${plural(asking.length, "search waits", "searches wait")} for an answer: ${asking.map((s) => s.name).join(", ")}.`,
    next: "leads with action search for its question, then propose_lead_search with action find and amends",
    weight: 1,
  };
};

/** What waits on the owner across the sequences, by kind: replies, and batches for an OK. */
const waitingIn = (seqs: Seen["seqs"], kind: "replies" | "waiting"): number =>
  (seqs?.sequences ?? []).reduce((n, s) => n + s.needs[kind], 0);

const repliesWaiting: Spot = ({ seqs }) => {
  const n = waitingIn(seqs, "replies");
  if (!n) return null;
  return {
    key: "replies_waiting",
    says: `${plural(n, "reply waits", "replies wait")} in the sequences.`,
    next: "inbox with action list, then propose_reply for each; for a business that wrote back interested, propose_leads with action said and propose_deal",
    weight: 1,
  };
};

const batchesWaiting: Spot = ({ seqs }) => {
  const n = waitingIn(seqs, "waiting");
  if (!n) return null;
  return {
    key: "batches_waiting",
    says: `${plural(n, "batch waits", "batches wait")} for an OK before it sends.`,
    next: "sequences with action sent, then propose_sequence with action batch (approve or skip)",
    weight: 1,
  };
};

/** The yes to offers: never asked, among people a WhatsApp conversation reaches. */
const offersNeverAsked: Spot = ({ pool }) => {
  const people = pool?.people ?? [];
  const never = people.filter(
    (r) =>
      (r.marketing_consent ?? "unknown") === "unknown" &&
      !r.offers_asked_at &&
      !r.dnc &&
      (r.channels ?? []).includes("whatsapp"),
  ).length;
  if (!never) return null;
  const saidYes = people.filter((r) => r.marketing_consent === "opted_in").length;
  return {
    key: "offers_never_asked",
    says: `${plural(never, "person on WhatsApp has", "people on WhatsApp have")} never been asked for the yes to offers (${saidYes} said yes so far).`,
    next: "never a message whose purpose is the ask: the receptionist asks once at the natural end of a conversation they started; offer the sign-up link and its QR for the counter, and sequences after a booking to people with a messages yes (propose_sequence with action moment)",
    weight: 3,
  };
};

/** Deals out with no next step: none where no proposal is out. */
const dealsWithoutAStep: Spot = ({ pool }) => {
  if (!pool) return null;
  const n = pool.people.filter((r) => r.deal_stage === "proposed" && !r.step_id).length;
  if (!n) return null;
  return {
    key: "deals_without_a_step",
    says: `${plural(n, "proposal is", "proposals are")} out with no next step.`,
    next: "people with action pipeline, then propose_deal with a next step for each",
    weight: 2,
  };
};

/** Appointments cancelled in the window whose time nothing offered (contracts freedTimesUnoffered, decision 0082). */
const freedTimesNotOffered: Spot = ({ pb, cancellations, nowMs }) => {
  if (!pb) return null;
  const said = freedTimesUnoffered({
    cancellations,
    calendar: pb.calendar,
    steps: pb.playbooks,
    tz: pb.timezone,
    nowMs,
    days: NEW_DAYS,
  });
  return said ? { key: "freed_times_unoffered", ...said, weight: 2 } : null;
};

/** Every spot, in no order of its own: each signal's weight orders them. */
const SPOTS: readonly Spot[] = [
  nothingSends,
  listsFeedNothing,
  leadsNotWrittenTo,
  searchAsks,
  repliesWaiting,
  batchesWaiting,
  offersNeverAsked,
  dealsWithoutAStep,
  freedTimesNotOffered,
];

/** The parts that could not be read, said beside the signals, never as nothing to notice. */
const unreadOf = (s: Seen): string[] => [
  ...(s.pool ? [] : ["people"]),
  ...(s.seqs ? [] : ["sequences"]),
  ...(s.finder ? [] : ["lead searches"]),
  ...(s.chains ? [] : ["cold emails"]),
];

/** The owner's goal, as Settings keeps it for Ask; null where none is kept or the settings could not be read. */
function goalOf(cfg: Seen["cfg"]): string | null {
  const parsed = cfg ? parseTenantConfigResult(cfg.config ?? null) : null;
  return parsed && parsed.ok ? (parsed.config.ask?.goal ?? null) : null;
}

async function readSignals(t: ToolContext): Promise<unknown> {
  const seen = await seeAll(t);
  // The member's follow-ups that are due, by what the searches and the sequences say now: decided as Ask's home decides it.
  const { due, waiting } = followUpsNow(seen.views ? followUpsOf(seen.views) : [], {
    searches: seen.finder?.searches ?? null,
    sequences: seen.seqs?.sequences ?? null,
    nowMs: seen.nowMs,
    zone: seen.zone ?? t.timezone,
  });
  const signals = SPOTS.map((spot) => spot(seen))
    .filter((s): s is Signal => s !== null)
    .sort((a, b) => a.weight - b.weight);
  const goal = goalOf(seen.cfg);
  const unreadParts = unreadOf(seen);
  return {
    route: "today",
    goal,
    ...(goal
      ? {}
      : {
          no_goal:
            "No goal is kept: ask what they want the business to reach, and keep it with propose_settings action goal.",
        }),
    follow_ups_due: due.map((f) => ({ id: f.id, said: f.said, do: f.prompt })),
    follow_ups_waiting: waiting.map((f) => ({ id: f.id, said: f.said })),
    signals: signals.map(({ key, says, next }) => ({ key, says, next })),
    ...(unreadParts.length ? { unread: `could not be read just now: ${unreadParts.join(", ")}` } : {}),
    note: "A due follow-up comes first: do what it says, and clear it (propose_follow_up clear) beside the cards. Offer one signal's cards at a time, the first that serves the goal, as a plan where they build on each other; never say anything is done.",
  };
}

export const signalsTool = defineRead({
  name: "signals",
  description:
    "What stands out across the workspace now, computed from its pages, each with its numbers and the cards that fit it: a follow-up of yours that is due, people with nothing sending on its own, lists that feed nothing, leads nobody writes to, a search that asks a question, replies and batches waiting, people never asked for the yes to offers, deals with no next step, cancellations whose time nothing offered; and the owner's goal. Read it at the start of a conversation, when they ask what to do next or how to get more customers, and before proposing a plan of your own. It takes nothing and changes nothing.",
  input: z.object({}),
  label: "Looking across the workspace",
  run: readSignals,
});
