import "server-only";
import { z } from "zod";
import {
  DAY_MS,
  followUpDue,
  followUpsOf,
  parseTenantConfigResult,
  plural,
  zoneDayKey,
  type AskFollowUp,
} from "@chanlytics/contracts";
import { memberViewsOf } from "@chanlytics/db";
import { load } from "../../../readers";
import { audiencePool } from "../../../readers/audience-pool";
import { config as configReader, facts as factsReader } from "../../../readers/facts";
import { lists as listsReader } from "../../../readers/lists";
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

async function readSignals(t: ToolContext): Promise<unknown> {
  const failed = (read: string) => unread(t, "signals", read);
  const [pool, kept, seqs, pb, chains, finder, cfg, zone, views] = await Promise.all([
    load(t.rc, audiencePool, undefined).then((r) => r.data, failed("people")),
    load(t.rc, listsReader, undefined).then((r) => r.data.lists, failed("lists")),
    load(t.rc, sequencesReader, undefined).then((r) => r.data, failed("sequences")),
    load(t.rc, playbooks, undefined).then((r) => r.data, failed("moments")),
    load(t.rc, reachOutChains, undefined).then((r) => r.data.chains, failed("cold emails")),
    load(t.rc, searchesReader, undefined).then((r) => r.data, failed("searches")),
    load(t.rc, configReader, undefined).then((r) => r.data, failed("settings")),
    load(t.rc, factsReader, undefined).then((r) => r.data.timezone, failed("facts")),
    t.ctx.userId
      ? memberViewsOf(t.ctx.supabase, { tenantId: t.tenantId, userId: t.ctx.userId }).catch(failed("follow-ups"))
      : Promise.resolve(null),
  ]);
  const unreadParts = [
    ...(pool ? [] : ["people"]),
    ...(seqs ? [] : ["sequences"]),
    ...(finder ? [] : ["lead searches"]),
    ...(chains ? [] : ["cold emails"]),
  ];
  const nowMs = t.now.getTime();
  const today = zoneDayKey(nowMs, zone ?? t.timezone);
  const signals: Signal[] = [];

  // The member's follow-ups that are due, by what the searches and the sequences say now.
  const follow = views ? followUpsOf(views) : [];
  const world = {
    searches: new Map((finder?.searches ?? []).map((s) => [s.id, s.round?.state ?? ""])),
    replies: new Map((seqs?.sequences ?? []).map((s) => [s.id, s.needs.replies])),
    today,
  };
  const due: AskFollowUp[] = follow.filter((f) => followUpDue(f, world));

  const people = pool?.people ?? [];
  const on = (seqs?.sequences ?? []).filter((s) => s.state === "on");
  const newPeople = people.filter(
    (r) => r.first_contact_at && nowMs - Date.parse(r.first_contact_at) <= NEW_DAYS * DAY_MS,
  );
  if (pool && seqs && people.length >= 20 && on.length === 0)
    signals.push({
      key: "nothing_sends_on_its_own",
      says: `${plural(people.length, "person is", "people are")} in People (${newPeople.length} new in the last ${NEW_DAYS} days) and nothing sends on its own.`,
      next: "propose_plan with action steps: lists that group them (propose_list make), then a sequence for the strongest group (propose_sequence make); or propose_plan with action offer, intent cover_journey",
      weight: 1,
    });

  // Lists of the workspace's own that no sequence runs on.
  if (kept && pb) {
    const used = new Set(
      pb.playbooks.flatMap((p) => [p.list_id, p.list_key].filter((x): x is string => typeof x === "string" && !!x)),
    );
    const idle = kept.filter((l) => !l.archived_at && !used.has(l.id));
    if (idle.length)
      signals.push({
        key: "lists_feed_nothing",
        says: `${plural(idle.length, "list feeds", "lists feed")} no sequence: ${idle
          .slice(0, 4)
          .map((l) => l.name)
          .join(", ")}${idle.length > 4 ? "…" : ""}.`,
        next: "propose_sequence with action moment on the list (trigger saved_list), after sequences with action lists counts who it reaches",
        weight: 2,
      });
  }

  // Leads found that no cold email writes to: each search's qualified leads, as its latest round counts them.
  if (finder && chains) {
    const written = new Set(chains.flatMap((c) => (c.search ? [c.search.id] : [])));
    const found = (s: (typeof finder.searches)[number]) => s.round?.qualified ?? 0;
    const unwritten = finder.searches.filter((s) => found(s) > 0 && !written.has(s.id));
    if (unwritten.length)
      signals.push({
        key: "leads_not_written_to",
        says: `${plural(
          unwritten.reduce((n, s) => n + found(s), 0),
          "lead was",
          "leads were",
        )} found in ${plural(unwritten.length, "search", "searches")} no cold email writes to (${unwritten
          .slice(0, 3)
          .map((s) => `${s.name}: ${found(s)}`)
          .join("; ")}).`,
        next: "leads with action leads (list ready) to pick the best, propose_leads with action list, then propose_sequence with action cold_email on it, in one propose_plan with action steps",
        weight: 1,
      });
  }

  // A search that stopped to ask the owner something.
  const asking = (finder?.searches ?? []).filter((s) => s.round?.state === "waiting_on_owner");
  if (asking.length)
    signals.push({
      key: "search_asks",
      says: `${plural(asking.length, "search waits", "searches wait")} for an answer: ${asking.map((s) => s.name).join(", ")}.`,
      next: "leads with action search for its question, then propose_lead_search with action find and amends",
      weight: 1,
    });

  // What waits on the owner in the sequences: replies, batches for an OK, emails to send by hand.
  const waits = (seqs?.sequences ?? []).reduce(
    (a, s) => ({
      replies: a.replies + s.needs.replies,
      waiting: a.waiting + s.needs.waiting,
      to_send: a.to_send + s.needs.to_send,
    }),
    { replies: 0, waiting: 0, to_send: 0 },
  );
  if (waits.replies)
    signals.push({
      key: "replies_waiting",
      says: `${plural(waits.replies, "reply waits", "replies wait")} in the sequences.`,
      next: "inbox with action list, then propose_reply for each; for a business that wrote back interested, propose_leads with action said and propose_deal",
      weight: 1,
    });
  if (waits.waiting)
    signals.push({
      key: "batches_waiting",
      says: `${plural(waits.waiting, "batch waits", "batches wait")} for an OK before it sends.`,
      next: "sequences with action sent, then propose_sequence with action batch (approve or skip)",
      weight: 1,
    });

  // The yes to offers: never asked, among people a WhatsApp conversation reaches.
  if (pool) {
    const neverAsked = people.filter(
      (r) =>
        (r.marketing_consent ?? "unknown") === "unknown" &&
        !r.offers_asked_at &&
        !r.dnc &&
        (r.channels ?? []).includes("whatsapp"),
    ).length;
    const saidYes = people.filter((r) => r.marketing_consent === "opted_in").length;
    if (neverAsked)
      signals.push({
        key: "offers_never_asked",
        says: `${plural(neverAsked, "person on WhatsApp has", "people on WhatsApp have")} never been asked for the yes to offers (${saidYes} said yes so far).`,
        next: "never a message whose purpose is the ask: the receptionist asks once at the natural end of a conversation they started; offer the sign-up link and its QR for the counter, and after-visit sequences to people with a messages yes (propose_sequence with action moment)",
        weight: 3,
      });
  }

  // Deals out with no next step.
  if (pool?.deals_on) {
    const noStep = people.filter((r) => r.deal_stage === "proposed" && !r.step_id).length;
    if (noStep)
      signals.push({
        key: "deals_without_a_step",
        says: `${plural(noStep, "proposal is", "proposals are")} out with no next step.`,
        next: "people with action pipeline, then propose_deal with a next step for each",
        weight: 2,
      });
  }

  // The owner's goal, as Settings keeps it for Ask.
  const parsed = cfg ? parseTenantConfigResult(cfg.config ?? null) : null;
  const goal = parsed && parsed.ok ? (parsed.config.ask?.goal ?? null) : null;

  signals.sort((a, b) => a.weight - b.weight);
  return {
    route: "today",
    goal: goal ?? null,
    ...(goal
      ? {}
      : {
          no_goal:
            "No goal is kept: ask what they want the business to reach, and keep it with propose_settings action goal.",
        }),
    follow_ups_due: due.map((f) => ({ id: f.id, said: f.said, do: f.prompt })),
    follow_ups_waiting: follow.filter((f) => !due.includes(f)).map((f) => ({ id: f.id, said: f.said })),
    signals: signals.map(({ key, says, next }) => ({ key, says, next })),
    ...(unreadParts.length ? { unread: `could not be read just now: ${unreadParts.join(", ")}` } : {}),
    note: "A due follow-up comes first: do what it says, and clear it (propose_follow_up clear) beside the cards. Offer one signal's cards at a time, the first that serves the goal, as a plan where they build on each other; never say anything is done.",
  };
}

export const signalsTool = defineRead({
  name: "signals",
  description:
    "What stands out across the workspace now, computed from its pages, each with its numbers and the cards that fit it: a follow-up of yours that is due, people with nothing sending on its own, lists that feed nothing, leads nobody writes to, a search that asks a question, replies and batches waiting, people never asked for the yes to offers, deals with no next step; and the owner's goal. Read it at the start of a conversation, when they ask what to do next or how to get more customers, and before proposing a plan of your own. It takes nothing and changes nothing.",
  input: z.object({}),
  label: "Looking across the workspace",
  run: readSignals,
});
