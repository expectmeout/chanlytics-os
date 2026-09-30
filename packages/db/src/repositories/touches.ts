/**
 * Who a run of any kind has reached, or is about to reach, from broadcasts and broadcast_recipients: the touches that
 * contracts eligibleForPlaybook holds a person back by, a playbook's own gap and the week's breath across every
 * playbook. The edge's hourly playbooks sweep (through apps/edge/lib/playbooks.ts) and the dashboard's Playbooks page
 * and broadcast composer (apps/dashboard/src/server/campaigns/playbooks.ts) read through this file, so the rule below
 * is written once and what the page says a person waits for is what the sweep holds them for.
 *
 * touchesSince reads every touch since a moment. followUpTouchesSince reads only the runs that carry a proposal's link,
 * because its window is as long as a proposal waits, far longer than the breath. touchIndex folds touches into the
 * latest one per person by any run (byAny, the breath), by each playbook (byThis, its gap) and by proposal follow-up
 * (followUps).
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
import { DEFAULT_TIMEZONE, localDate, parseParamSpecs } from "@chanlytics/contracts";
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
}

/**
 * The touches by person: the latest by any run (the breath), the latest by each playbook (its gap), and the latest
 * proposal follow-up by any playbook (the follow-up's once per proposal). Epoch ms.
 */
export interface TouchIndex {
  byThis: Map<string, Map<string, number>>;
  byAny: Map<string, number>;
  followUps: Map<string, number>;
}

/** Run ids per recipients query: they ride in the URL, which a proxy does not let grow without end. */
const RUN_IDS_PER_QUERY = 200;

/** A run that stopped: it touched only the people it had already sent to. */
const STOPPED = new Set(["canceled", "failed"]);

/**
 * Every touch since `since`, as of `now`. Runs are read by when they were made, from `since` on; a touch is dated by
 * when it went, or when its run is due, and one before `since` holds nobody back. Paged throughout: past a thousand
 * touches, the breath and each gap silently stopped holding and the people a read could no longer see were messaged
 * again. A read that fails THROWS -- "nobody was touched" is the reading that messages people twice. The workspace's
 * zone, read beside the runs, says which day is today for a run waiting for a person; unreadable, every waiting run
 * still holds its people, which never messages anyone twice either.
 */
export async function touchesSince(db: Db, tenantId: string, since: Date, now: Date): Promise<Touch[]> {
  return touchesOf(db, tenantId, since, now, false);
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
        .from("broadcasts")
        .select("id, playbook_id, state, scheduled_for, created_at, run_for, params")
        .eq("tenant_id", tenantId)
        .gte("created_at", since.toISOString());
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
    const rows = await readAllRows<{ broadcast_id: string; contact_id: string; sent_at: string | null; state: string }>(
      "broadcast_recipients",
      (from, to) =>
        db
          .from("broadcast_recipients")
          .select("broadcast_id, contact_id, sent_at, state")
          .eq("tenant_id", tenantId)
          .in("broadcast_id", ids.slice(i, i + RUN_IDS_PER_QUERY))
          .in("state", ["sent", "queued"])
          .order("broadcast_id")
          .order("contact_id")
          .range(from, to),
    );
    for (const r of rows) {
      const run = ofRun.get(r.broadcast_id);
      if (!run) continue;
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
      });
    }
  }
  return out;
}

/** The touches by person, the way a run draws with them: the latest by any run, by each playbook, and follow-up. */
export function touchIndex(touches: readonly Touch[]): TouchIndex {
  const byThis = new Map<string, Map<string, number>>();
  const byAny = new Map<string, number>();
  const followUps = new Map<string, number>();
  for (const t of touches) {
    const at = Date.parse(t.at);
    if (t.playbook_id) {
      const m = byThis.get(t.playbook_id) ?? new Map<string, number>();
      m.set(t.contact_id, Math.max(m.get(t.contact_id) ?? 0, at));
      byThis.set(t.playbook_id, m);
    }
    byAny.set(t.contact_id, Math.max(byAny.get(t.contact_id) ?? 0, at));
    if (t.follow_up) followUps.set(t.contact_id, Math.max(followUps.get(t.contact_id) ?? 0, at));
  }
  return { byThis, byAny, followUps };
}
