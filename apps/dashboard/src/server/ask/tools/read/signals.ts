import "server-only";
import { z } from "zod";
import {
  DAY_MS,
  followUpsOf,
  freedTimesUnoffered,
  parseTenantConfigResult,
  plural,
  type AskNoticeFacts,
} from "@chanlytics/contracts";
import { load } from "../../../shared/reader";
import { config as configReader } from "../../../readers/facts";
import { everyone } from "../../../readers/everyone";
import { followUpsNow, memberViews } from "../../../readers/notifications";
import { defineRead, type ToolContext } from "../context/tool-defs";
import { unread } from "../context/tool-reads";
import { NEW_DAYS, seeAll, type Seen } from "./seen";

/**
 * What Ask notices (the operator, 15 Oct 2026, D6): the workspace read across its pages, each thing that stands out said
 * with its numbers and the cards that fit it, computed here by code -- Ask decides how to say them and in what order, and
 * never computes them from rows. A follow-up of the member's that is due comes first; the owner's goal rides on top, so
 * every signal is weighed against it. Each part is read as narrow as the spot that reads it (seen.ts), the same read the
 * notices make; a read that fails leaves its signal out, said in `unread`, never as nothing to notice.
 */

interface Signal {
  key: string;
  /** Its numbers, which the home's sentence is written from (contracts noticeOf). */
  facts?: AskNoticeFacts;
  /** What stands out, with its numbers, in a sentence. */
  says: string;
  /** The cards that fit it, by tool and action. */
  next: string;
  /** How much it matters now: 1 first. */
  weight: 1 | 2 | 3;
}

/** One thing that may stand out, read off what was seen; null where it does not, or its parts could not be read. */
type Spot = (s: Seen) => Signal | null;

/** Many people and nothing that sends on its own. */
const nothingSends: Spot = ({ people, seqs, fresh }) => {
  if (!people || !seqs || people.listed < 20 || seqs.sequences.some((s) => s.state === "on")) return null;
  const isNew = fresh === undefined ? "" : ` (${fresh} new in the last ${NEW_DAYS} days)`;
  return {
    key: "nothing_sends_on_its_own",
    facts: { people: people.listed },
    says: `${plural(people.listed, "person is", "people are")} in People${isNew} and nothing sends on its own.`,
    next: "propose_plan with action steps: lists that group them (propose_list make), then a campaign for the strongest group (propose_campaign make); or propose_plan with action offer, intent cover_journey",
    weight: 1,
  };
};

/** Lists of the workspace's own that no sequence runs on. */
const listsFeedNothing: Spot = ({ kept, steps }) => {
  if (!kept || !steps) return null;
  const used = new Set(steps.flatMap((p) => [p.list_id, p.list_key].filter((x): x is string => !!x)));
  const idle = kept.filter((l) => !l.archived_at && !used.has(l.id));
  if (!idle.length) return null;
  const names = idle.slice(0, 4).map((l) => l.name);
  return {
    key: "lists_feed_nothing",
    facts: { lists: idle.length, names },
    says: `${plural(idle.length, "list feeds", "lists feed")} no campaign: ${names.join(", ")}${idle.length > 4 ? "…" : ""}.`,
    next: "propose_campaign with action moment on the list (trigger saved_list), after campaigns with action lists counts who it reaches",
    weight: 2,
  };
};

/** Leads found that no cold email writes to: each search's qualified leads, as its latest round counts them. */
const leadsNotWrittenTo: Spot = ({ finder, written }) => {
  if (!finder || !written) return null;
  const writtenTo = new Set(written);
  const found = (s: (typeof finder.searches)[number]) => s.round?.qualified ?? 0;
  const unwritten = finder.searches.filter((s) => found(s) > 0 && !writtenTo.has(s.id));
  if (!unwritten.length) return null;
  const leads = unwritten.reduce((n, s) => n + found(s), 0);
  const named = unwritten.slice(0, 3).map((s) => `${s.name}: ${found(s)}`);
  return {
    key: "leads_not_written_to",
    facts: { leads, searches: unwritten.length },
    says: `${plural(leads, "lead was", "leads were")} found in ${plural(unwritten.length, "search", "searches")} no cold email writes to (${named.join("; ")}).`,
    next: "leads with action leads (list ready) to pick the best, propose_leads with action list, then propose_campaign with action cold_email on it, in one propose_plan with action steps",
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
    facts: { replies: n },
    says: `${plural(n, "reply waits", "replies wait")} in the campaigns.`,
    next: "inbox with action list, then propose_reply for each; for a business that wrote back interested, propose_leads with action said and propose_deal",
    weight: 1,
  };
};

const batchesWaiting: Spot = ({ seqs }) => {
  const n = waitingIn(seqs, "waiting");
  if (!n) return null;
  return {
    key: "batches_waiting",
    facts: { sends: n },
    says: `${plural(n, "send waits", "sends wait")} for an OK before it sends.`,
    next: "campaigns with action sent, then propose_campaign with action send (approve or skip)",
    weight: 1,
  };
};

/** The yes to offers: never asked, among people a WhatsApp conversation reaches (counted where they are, seen.ts). */
const offersNeverAsked: Spot = ({ people, saidYes }) => {
  const never = people?.neverAsked ?? 0;
  if (!never) return null;
  const yesSoFar = saidYes === undefined ? "" : ` (${saidYes} said yes so far)`;
  return {
    key: "offers_never_asked",
    facts: { never },
    says: `${plural(never, "person on WhatsApp has", "people on WhatsApp have")} never been asked for the yes to offers${yesSoFar}.`,
    next: "never a message whose purpose is the ask: AI asks once at the natural end of a conversation they started; offer the sign-up link and its QR for the counter, and campaigns after a booking to people with a messages yes (propose_campaign with action moment)",
    weight: 3,
  };
};

/** Deals out with no next step: none where no proposal is out. */
const dealsWithoutAStep: Spot = ({ people }) => {
  const count = people?.proposalsWithoutAStep ?? 0;
  if (!count) return null;
  return {
    key: "deals_without_a_step",
    facts: { deals: count },
    says: `${plural(count, "proposal is", "proposals are")} out with no next step.`,
    next: "people with action pipeline, then propose_deal with a next step for each",
    weight: 2,
  };
};

/** Appointments cancelled in the window whose time nothing offered (contracts freedTimesUnoffered, decision 0082). */
const freedTimesNotOffered: Spot = ({ steps, calendar, zone, cancellations, nowMs }) => {
  if (!steps || !zone) return null;
  const freedTimes = freedTimesUnoffered({
    cancellations,
    // Connected is all the rule asks of the calendar (a feed down just now is still connected): none where unread.
    calendar: calendar ? "connected" : "none",
    steps,
    tz: zone,
    nowMs,
    days: NEW_DAYS,
  });
  return freedTimes ? { key: "freed_times_unoffered", facts: { times: 1 }, ...freedTimes, weight: 2 } : null;
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

/** What stands out, by what was seen, most weight first. */
export const spotsOf = (seen: Seen): Signal[] =>
  SPOTS.map((spot) => spot(seen))
    .filter((s): s is Signal => s !== null)
    .sort((a, b) => a.weight - b.weight);

/** The parts that could not be read, said beside the signals, never as nothing to notice. */
const unreadOf = (s: Seen): string[] => [
  ...(s.people ? [] : ["people"]),
  ...(s.seqs ? [] : ["campaigns"]),
  ...(s.finder ? [] : ["lead searches"]),
  ...(s.written ? [] : ["cold emails"]),
];

/**
 * What Ask's own read says beyond what the spots decide on: the owner's goal and the member's follow-ups, and who in People
 * is new and who said yes, in its sentences for the model. Everyone in People is the turn's own read (readers/everyone.ts),
 * which the people and audience tools share. Each null where its read failed.
 */
async function seeMore(toolContext: ToolContext) {
  const failed = (read: string) => unread(toolContext, "signals", read);
  const nowMs = toolContext.now.getTime();
  const [cfg, views, people] = await Promise.all([
    load(toolContext.rc, configReader, undefined).then((r) => r.data, failed("settings")),
    toolContext.ctx.userId
      ? load(toolContext.rc, memberViews, undefined).then((r) => r.data, failed("follow-ups"))
      : Promise.resolve(null),
    load(toolContext.rc, everyone, undefined).then((r) => r.data, failed("people")),
  ]);
  const isNew = (at: string | null | undefined) => !!at && nowMs - Date.parse(at) <= NEW_DAYS * DAY_MS;
  return {
    cfg,
    views,
    fresh: people?.filter((r) => isNew(r.first_contact_at)).length,
    saidYes: people?.filter((r) => r.marketing_consent === "opted_in").length,
  };
}

/** The owner's goal, as Settings keeps it for Ask; null where none is kept or the settings could not be read. */
function goalOf(cfg: Awaited<ReturnType<typeof seeMore>>["cfg"]): string | null {
  const parsed = cfg ? parseTenantConfigResult(cfg.config ?? null) : null;
  return parsed && parsed.ok ? (parsed.config.ask?.goal ?? null) : null;
}

async function readSignals(toolContext: ToolContext): Promise<unknown> {
  const [seen, more] = await Promise.all([seeAll(toolContext), seeMore(toolContext)]);
  // The member's follow-ups that are due, by what the searches and the sequences say now: decided as Ask's home decides it.
  const { due, waiting } = followUpsNow(more.views ? followUpsOf(more.views) : [], {
    searches: seen.finder?.searches ?? null,
    sequences: seen.seqs?.sequences ?? null,
    nowMs: seen.nowMs,
    zone: seen.zone ?? toolContext.timezone,
  });
  const signals = spotsOf({ ...seen, fresh: more.fresh, saidYes: more.saidYes });
  const goal = goalOf(more.cfg);
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
    "What stands out across the workspace now, from its pages, each with its numbers and the cards that fit it: a follow-up of yours that is due, people with nothing sending on its own, lists that feed nothing, leads nobody writes to, a search that asks a question, replies and sends waiting, people never asked for the yes to offers, deals with no next step, cancellations whose time nothing offered; and the owner's goal. Read it at the start of a conversation, when they ask what to do next or how to get more customers, and before proposing a plan of your own. It takes nothing and changes nothing.",
  input: z.object({}),
  label: "Looking across the workspace",
  run: readSignals,
});
