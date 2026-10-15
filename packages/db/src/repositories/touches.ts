/**
 * Who a run of any kind has reached, or is about to reach, from broadcasts and broadcast_recipients: the touches that
 * contracts eligibleForPlaybook holds a person back by, a playbook's own gap and the week's breath across every
 * playbook. The edge's hourly playbooks sweep (through apps/edge/lib/playbooks.ts) and the dashboard's Playbooks page
 * and broadcast composer (apps/dashboard/src/server/campaigns/playbooks.ts) read through this file, so the rule below
 * is written once and what the page says a person waits for is what the sweep holds them for.
 *
 * touchesSince reads every touch since a moment, and recentTouches those from the week's breath before now on, every one
 * per person in order (a send by hand leaves out who has one within a week of it, either side). followUpTouchesSince reads
 * only the runs that carry a proposal's link, because its window is as long as a proposal waits, far longer than the
 * breath. touchIndex folds touches into the latest one per person by each playbook (byThis, its gap) and by proposal
 * follow-up (followUps), and, for the breath, the latest by any run within a week of now either side (byAny: contracts
 * heardWithin, so a run due weeks ahead holds nobody today).
 *
 * The rule: a person sent to, or queued for a run on its way, was touched from the moment it went or is due. A run
 * canceled or failed touched only the people it had already sent to: stopped halfway, it had reached them, and read as
 * reaching nobody it would message them again. A run waiting for a person whose day has passed touched nobody: it can
 * never be approved (core approveRun), and the approval sheet says the next run starts over. A broadcast sent by hand
 * counts for the breath and for no playbook's gap. A run that carries a proposal's link is a proposal follow-up
 * (decision 0006), owed once per proposal whichever playbook sent it, so it is found by its params and not by its
 * playbook: a deleted playbook leaves its runs with a null playbook_id.
 *
 * Both reads page (a response is capped at a thousand rows) and THROW on failure: "nobody was touched" is the reading
 * that messages people twice. The one read that degrades is the workspace's zone: unreadable, every waiting run still
 * holds its people.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_TIMEZONE,
  PLAYBOOK_BREATH_MS,
  followUpKey,
  heardWithin,
  localDate,
  parseParamSpecs,
} from "@chanlytics/contracts";
import type { Database } from "../database.types";
import { readAllRows } from "../paged";

type Db = SupabaseClient<Database>;

/**
 * One person touched by one run: the run's playbook, if it was a playbook's, when (sent, or due), whether it went
 * (sent, rather than on its way or waiting), and whether the run was a proposal follow-up.
 */
export interface Touch {
  contact_id: string;
  playbook_id: string | null;
  at: string;
  sent: boolean;
  /** Its run was made to wait for a person (pending_approval), today's, which may still go. */
  held: boolean;
  follow_up: boolean;
  /**
   * The proposal a follow-up was about (0029), so a person's second proposal is owed its own: the deal its recipient's
   * words were written for (facts.deal_id) and the link they carried (facts.proposal_link). Null for any other touch,
   * and for a follow-up whose words kept neither (contracts followUpKey reads them).
   */
  deal: string | null;
  link: string | null;
}

/**
 * The touches by person: the latest by any run within a week of the run's now, either side (the breath), the latest by
 * each playbook (its gap), and the latest proposal follow-up by any playbook (the follow-up's once per proposal). Epoch ms.
 */
export interface TouchIndex {
  byThis: Map<string, Map<string, number>>;
  byAny: Map<string, number>;
  followUps: Map<string, number>;
  /** The latest follow-up by person and by what it was about (contracts followUpKey, 0029): which proposals had theirs. */
  followUpKeys: Map<string, Map<string, number>>;
}

/** Run ids per recipients query: they ride in the URL, which a proxy does not let grow without end. */
const RUN_IDS_PER_QUERY = 200;

/** A run that stopped: it touched only the people it had already sent to. */
const STOPPED = new Set(["canceled", "failed"]);

/**
 * Every touch since `since`, as of `now`. A touch is dated by when it went, or when its run is due, and one before
 * `since` holds nobody back. Runs are read by those dates, not only by when they were made (runsSince): a run made weeks
 * ago that went, or is due, on or after `since` holds its people as one made this week does. Paged throughout: past a thousand
 * touches, the breath and each gap silently stopped holding and the people a read could no longer see were messaged
 * again. A read that fails THROWS -- "nobody was touched" is the reading that messages people twice. The workspace's
 * zone, read beside the runs, says which day is today for a run waiting for a person; unreadable, every waiting run
 * still holds its people, which never messages anyone twice either.
 */
export async function touchesSince(db: Db, tenantId: string, since: Date, now: Date): Promise<Touch[]> {
  return touchesOf(db, tenantId, since, now, false);
}

/**
 * Who a run of any kind reached, or is about to, from the week's breath before `now` on (contracts PLAYBOOK_BREATH_MS):
 * the breath's one read. contact id -> the time of every touch of theirs, earliest first, as the rows keep them -- a run
 * due later counts at the time it is due, and one due far ahead hides none nearer. A send counts those within a week of
 * it, either side (contracts heardWithin): the Playbooks page says by it how many of a moment's people wait (at now), the
 * broadcast composer how many a send leaves out (now, or for the time it is set for: contracts leftOutBy), Ask's cards the
 * same, and a send by hand (core createBroadcast's `touches` port) leaves them out by it, so all of them say one number.
 * Throws as touchesSince does: "nobody was touched" is the reading that messages people twice.
 */
export async function recentTouches(db: Db, tenantId: string, now: Date): Promise<Record<string, string[]>> {
  const touched: Record<string, string[]> = {};
  for (const t of await touchesSince(db, tenantId, new Date(now.getTime() - PLAYBOOK_BREATH_MS), now))
    (touched[t.contact_id] ??= []).push(t.at);
  for (const times of Object.values(touched)) times.sort((a, b) => Date.parse(a) - Date.parse(b));
  return touched;
}

/**
 * The proposal follow-ups' touches alone since `since` (0006): the runs whose values carry a proposal's link, from
 * any playbook, one since deleted too. The window a follow-up needs is as long as a proposal waits, far longer than
 * the week's breath, so it is read for that one kind of run.
 */
export async function followUpTouchesSince(db: Db, tenantId: string, since: Date, now: Date): Promise<Touch[]> {
  return touchesOf(db, tenantId, since, now, true);
}

/** A run's values carrying a proposal's link, as PostgREST's jsonb containment asks it. */
const FOLLOW_UP_PARAMS = '[{"kind":"proposal_link"}]';

/**
 * The runs whose touches may be dated on or after `since`, as PostgREST's `or` asks it: a touch is dated by when it went
 * or when its run is due, so a run is read when it was made, is due, or finished from `since` on, or is sending still --
 * a run made ten days ago and due two days ago is a touch for this week's breath, and one due in three days for a send
 * set for then. By the run's made time alone, such a run was never read, and its people were sent two messages in a week.
 */
const runsSince = (since: Date): string => {
  const s = since.toISOString();
  return `created_at.gte.${s},scheduled_for.gte.${s},finished_at.gte.${s},state.eq.sending`;
};

async function touchesOf(db: Db, tenantId: string, since: Date, now: Date, followUpsOnly: boolean): Promise<Touch[]> {
  const [all, zone] = await Promise.all([
    readAllRows<{
      id: string;
      playbook_id: string | null;
      state: string;
      scheduled_for: string | null;
      created_at: string;
      run_for: string | null;
      params: unknown;
    }>("broadcasts", (from, to) => {
      const q = db
        .from("sequence_batches")
        .select("id, playbook_id:step_id, state, scheduled_for, created_at, run_for, params")
        .eq("tenant_id", tenantId)
        .or(runsSince(since));
      return (followUpsOnly ? q.contains("params", FOLLOW_UP_PARAMS) : q).order("id").range(from, to);
    }),
    db
      .from("tenants")
      .select("timezone")
      .eq("id", tenantId)
      .maybeSingle()
      .then(
        (r) => (r.error ? null : r.data?.timezone || DEFAULT_TIMEZONE),
        () => null,
      ),
  ]);
  const today = zone ? localDate(zone, now) : null;
  const runs = all.filter(
    (b) => !(b.state === "pending_approval" && today !== null && b.run_for !== null && b.run_for < today),
  );
  const ofRun = new Map(runs.map((b) => [b.id, b]));
  const followUp = new Set(
    runs.filter((b) => parseParamSpecs(b.params).some((s) => s.kind === "proposal_link")).map((b) => b.id),
  );
  const ids = runs.map((b) => b.id);
  const out: Touch[] = [];
  const sinceMs = since.getTime();
  for (let i = 0; i < ids.length; i += RUN_IDS_PER_QUERY) {
    const rows = await readAllRows<{
      broadcast_id: string;
      contact_id: string | null;
      sent_at: string | null;
      state: string;
      proposal_link: string | null;
      proposal_deal: string | null;
    }>("broadcast_recipients", (from, to) =>
      db
        .from("sequence_sends")
        // Of the words a recipient kept, the proposal's deal and link alone (0029): which one a follow-up was about.
        .select(
          "broadcast_id:batch_id, contact_id, sent_at, state, proposal_link:facts->>proposal_link, proposal_deal:facts->>deal_id",
        )
        .eq("tenant_id", tenantId)
        .is("lead_id", null)
        .in("batch_id", ids.slice(i, i + RUN_IDS_PER_QUERY))
        .in("state", ["sent", "queued"])
        .order("batch_id")
        .order("contact_id")
        .range(from, to),
    );
    for (const r of rows) {
      const run = ofRun.get(r.broadcast_id);
      if (!run || !r.contact_id) continue;
      if (STOPPED.has(run.state) && r.state !== "sent") continue;
      const at = r.sent_at ?? run.scheduled_for ?? run.created_at;
      if (Date.parse(at) < sinceMs) continue;
      out.push({
        contact_id: r.contact_id,
        playbook_id: run.playbook_id,
        at,
        sent: r.state === "sent",
        held: run.state === "pending_approval",
        follow_up: followUp.has(run.id),
        // As the run wrote them from the deal (contracts proposalFactsFor), so they are compared as they are.
        deal: followUp.has(run.id) ? factString(r.proposal_deal) : null,
        link: followUp.has(run.id) ? factString(r.proposal_link) : null,
      });
    }
  }
  return out;
}

/** A word a recipient's facts kept, or null: absent, empty, or not a string. */
const factString = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * The touches by person, the way a run at `now` draws with them: the latest by each playbook (its gap), and follow-up, as
 * they are; and the latest by any run that the week's breath counts at `now` (contracts heardWithin, within a week either
 * side), so a message due weeks ahead neither holds a person today nor hides a nearer one.
 */
export function touchIndex(touches: readonly Touch[], now: Date): TouchIndex {
  const byThis = new Map<string, Map<string, number>>();
  const byAny = new Map<string, number>();
  const followUps = new Map<string, number>();
  const followUpKeys = new Map<string, Map<string, number>>();
  const breath = heardWithin(now.getTime(), now.getTime());
  for (const t of touches) {
    const at = Date.parse(t.at);
    if (t.playbook_id) {
      const m = byThis.get(t.playbook_id) ?? new Map<string, number>();
      m.set(t.contact_id, Math.max(m.get(t.contact_id) ?? 0, at));
      byThis.set(t.playbook_id, m);
    }
    if (breath(at)) byAny.set(t.contact_id, Math.max(byAny.get(t.contact_id) ?? 0, at));
    if (t.follow_up) followUps.set(t.contact_id, Math.max(followUps.get(t.contact_id) ?? 0, at));
    if (t.follow_up) {
      const m = followUpKeys.get(t.contact_id) ?? new Map<string, number>();
      const key = followUpKey(t);
      m.set(key, Math.max(m.get(key) ?? 0, at));
      followUpKeys.set(t.contact_id, m);
    }
  }
  return { byThis, byAny, followUps, followUpKeys };
}
