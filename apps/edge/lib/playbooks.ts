/**
 * One playbook's run: the rules are core's (packages/core/src/campaigns/
 * run-playbook.ts); this file is the edge's side of them. It reads the
 * workspace once per tenant — the people, the modes, the number, the
 * touches, the calendar — and builds the run's ports over the edge's
 * database and services. The hourly sweep and "Run now" on the page both
 * come here.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emitEvent,
  everyoneIn,
  listPolicies,
  savedListsFor,
  touchIndex,
  touchesSince,
  yesesSince,
  type Database,
  type Json,
} from "./packages/db.js";
import { scheduleJob } from "./packages/jobs.js";
import {
  runPlaybook as runOverPorts,
  type PlaybookRow,
  type RunBy,
  type RunContext,
  type RunOutcome,
} from "./packages/core.js";
import { notify } from "./ops/notify.js";
import { logger } from "./log.js";
import { loadTenantNotifications } from "./tenant-runtime.js";
import {
  PACE_WINDOW_DAYS,
  PLAYBOOK_TOUCH_WINDOW_MS,
  dealPaceFrom,
  dealPaceOf,
  dealsAreOn,
  isSellsBy,
  ownAddressesOf,
  numberHealth,
  parseTenantConfig,
  peopleVisitsOf,
  poolListContext,
  poolRowsOf,
  savedListIds,
  savedListLookup,
  type PersonRowDto,
  type PersonVisitsDto,
} from "./packages/contracts.js";
import { feedItemsFor } from "./calendar/availability.js";

type Db = SupabaseClient<Database>;

export type { PlaybookRow, RunOutcome };

/** The run's context, with the client and the tenant the ports close over. */
/**
 * Everyone in People, a page at a time: people_list answers at most a
 * thousand rows, and the pool a run picks from is never one page of it. The
 * page arguments are named only past the first page, so a database that has
 * not been given 00112 yet answers the first page as it always has.
 */
export async function allPeople(
  db: Db,
  tenantId: string,
): Promise<{ data: PersonRowDto[] | null; error: { message: string } | null }> {
  // packages/db everyoneIn: the dashboard's pager too. A page it cannot read is this tenant's error, never a
  // thousand people counted as everyone.
  return everyoneIn(db, tenantId).then(
    (data) => ({ data, error: null }),
    (e: unknown) => ({ data: null, error: { message: e instanceof Error ? e.message : String(e) } }),
  );
}

export interface TenantRunContext extends RunContext {
  db: Db;
  tenantId: string;
}

/** Read once per tenant: the people, the modes, the number, the touches. */
export async function loadTenantRunContext(
  db: Db,
  tenantId: string,
  now: Date,
): Promise<TenantRunContext | { error: string }> {
  const [
    { data: tenant },
    { data: people, error: pErr },
    policies,
    { data: ch },
    touched,
    { data: cfgRow },
    kept,
    yeses,
  ] = await Promise.all([
    // How its customers buy (0008): the proposal follow-up runs only where deals are on (0006).
    db.from("tenants").select("timezone, status, sells_by").eq("id", tenantId).maybeSingle(),
    allPeople(db, tenantId),
    listPolicies(db, tenantId).catch(() => []),
    db
      .from("tenant_channels")
      .select("config")
      .eq("tenant_id", tenantId)
      .eq("kind", "whatsapp")
      .eq("status", "active")
      .limit(1)
      .maybeSingle(),
    // Every run, not only the playbooks': a message sent by hand is a touch too, and the week's breath is one
    // message per person across all of them (packages/db touchesSince, which the Playbooks page reads too).
    //
    // Bounded by TIME, not by luck: nothing older than the longest gap a playbook may set can hold anybody back.
    //
    // The failure is CAUGHT to an error rather than to nobody touched, which re-messages everyone it can no longer
    // see; and returned as this tenant's error, never thrown. The hourly sweep reads `{ error }` to count one
    // workspace off and carry on (api/cron/playbooks.ts); a throw would end the tick for every workspace after it.
    // How far back: contracts PLAYBOOK_TOUCH_WINDOW_MS, which the Playbooks page's follow-up count reads by too.
    touchesSince(db, tenantId, new Date(now.getTime() - PLAYBOOK_TOUCH_WINDOW_MS), now).then(
      (data) => ({ data, error: null as string | null }),
      (e: unknown) => ({ data: null, error: e instanceof Error ? e.message : String(e) }),
    ),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
    // Every list the workspace keeps: a playbook on one runs on who is on it now. Unreadable is this tenant's
    // error, never a list of nobody.
    savedListsFor(db, tenantId).then(
      (data) => ({ data, error: null as string | null }),
      (e: unknown) => ({ data: null, error: e instanceof Error ? e.message : String(e) }),
    ),
    // The workspace's last year of yeses, for its pace (contracts dealPaceFrom): when a proposal waits for the
    // follow-up. Unreadable is no pace -- a week's wait, as before one -- and said in the log, never this run's end.
    yesesSince(db, tenantId, new Date(now.getTime() - PACE_WINDOW_DAYS * 86_400_000)).catch((e: unknown) => {
      logger({ tenant_id: tenantId }).warn("playbooks_pace_read_failed", {
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }),
  ]);
  if (pErr) return { error: pErr.message };
  if (touched.error) return { error: touched.error };
  if (kept.error) return { error: `lists: ${kept.error}` };
  // A paused workspace runs nothing: the sweep counts it off, and says so once, quietly.
  if (tenant?.status === "paused") return { error: "paused" };
  const cfg = (ch?.config && typeof ch.config === "object" && !Array.isArray(ch.config) ? ch.config : {}) as Record<
    string,
    unknown
  >;
  const s = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
  // A touch is a message sent, or one on its way, dated by when it went or is due; a broadcast the owner sent by
  // hand counts for the breath (byAny) and for no playbook's gap; a proposal follow-up by any playbook, for the
  // follow-up's once per proposal (touchIndex, 0006).
  const { byThis, byAny, followUps } = touchIndex(touched.data ?? []);
  // The calendar's appointments on every person, the way the People page
  // reads them: a visit playbook keys on the day, and its words come from
  // the visit itself. Read once per tenant per run.
  const tz = tenant?.timezone || "America/New_York";
  const rows = (people ?? []) as unknown as PersonRowDto[];
  const cfgParsed = parseTenantConfig(cfgRow?.config ?? null);
  const url = cfgParsed?.calendar?.ical_url ?? null;
  // The workspace's own horizon, the way the People sweep asks for it
  // (api/cron/calendar.ts). Left to the default, a workspace that books three
  // months out had its visit playbooks reading a fortnight of calendar.
  const daysAhead = cfgParsed?.brain?.profile?.booking_rules?.max_days_ahead ?? 14;
  let calendar: TenantRunContext["calendar"] = "none";
  let visits = new Map<string, PersonVisitsDto>();
  const profile = cfgParsed?.brain?.profile;
  if (url) {
    const items = await feedItemsFor(tenantId, url, tz, now, daysAhead);
    if (items) {
      calendar = "ok";
      // The pool's one reading (contracts audience-pool.ts), as the dashboard reads it: the business's own addresses
      // are never a customer's (ownAddressesOf) -- without them a visit playbook could thank the owner, as a customer,
      // for a meeting on their own calendar -- and each visit says whether it is a consultation (0004).
      visits = peopleVisitsOf(
        items,
        rows,
        {
          timezone: tz,
          source: "calendar",
          own: ownAddressesOf(cfgParsed),
          services: profile?.services ?? [],
          rules: profile?.booking_rules ?? null,
        },
        now.getTime(),
      );
    } else {
      calendar = "unavailable";
    }
  }
  const dealsOn = dealsAreOn(isSellsBy(tenant?.sells_by) ? tenant.sells_by : null);
  // Everyone as the pool reads them: no one looking (a run has no viewer), no deal where deals are off, and a calendar
  // that could not be read said on every row, as the page says it.
  const unread: PersonVisitsDto = { timezone: tz, source: "calendar", state: "unavailable", next: null, last: null };
  const vms = poolRowsOf(
    rows.map((r) => ({ ...r, visits: visits.get(r.id) ?? (calendar === "unavailable" ? unread : null) })),
    { tz, now, viewer: null, dealsOn },
  );
  return {
    db,
    tenantId,
    tz,
    now,
    people: vms,
    calendar,
    visits,
    // Who is on each list, the way the People rail and the send count it (contracts savedListIds). A run has no one
    // looking, so a list about "me" is nobody here, as its needs say (lists.ts ListContext).
    lists: new Map(
      (kept.data ?? []).map((l) => [
        l.id,
        savedListIds(
          l,
          vms,
          poolListContext({ calendar, dealsOn, rules: profile?.booking_rules, viewer: null }),
          savedListLookup(kept.data ?? []),
        ),
      ]),
    ),
    modes: new Map(policies.map((r) => [r.class, r.mode])),
    health: numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") }),
    touches: { byThis, byAny, followUps },
    dealsOn,
    pace: dealsOn && yeses ? dealPaceOf(dealPaceFrom(yeses, now.getTime())) : null,
  };
}

export interface RunRequest {
  /** The local day the run is for; one run per playbook per day. */
  runFor?: string;
  /** Who asked: the sweep (system) or a person (their decision, sends now unless the class is never). */
  by: RunBy;
}

/** The run over this runtime's ports: the rules are core's. */
export async function runPlaybook(ctx: TenantRunContext, p: PlaybookRow, req: RunRequest): Promise<RunOutcome> {
  const { db, tenantId } = ctx;
  return runOverPorts(
    {
      // A read that fails throws: a template that could not be read is not
      // one Meta withdrew, and the run says it failed rather than skipping the day.
      template: async (name, language) => {
        const { data, error } = await db
          .from("templates")
          .select("meta_status")
          .eq("tenant_id", tenantId)
          .eq("channel", "whatsapp")
          .eq("name", name)
          .eq("language", language)
          .maybeSingle();
        if (error) throw new Error(`cannot read template ${name}: ${error.message}`);
        return data ?? null;
      },
      alreadyRan: async (playbookId, runFor) => {
        const { data } = await db
          .from("broadcasts")
          .select("id")
          .eq("playbook_id", playbookId)
          .eq("run_for", runFor)
          .maybeSingle();
        return !!data;
      },
      record: async (playbookId, runFor, at, data) => {
        await emitEvent(db, tenantId, "playbook.run", "message", "playbook", playbookId, data as Json).catch(() => {});
        await db.from("playbooks").update({ last_run_for: runFor, last_run_at: at.toISOString() }).eq("id", playbookId);
      },
      create: async (row) => {
        const { data, error } = await db
          .from("broadcasts")
          .insert({
            tenant_id: tenantId,
            ...row,
            params: row.params as unknown as Json,
            audience: row.audience as unknown as Json,
          })
          .select("id")
          .single();
        if (error || !data) throw new Error(error?.message ?? "run not created");
        return data.id;
      },
      enrol: async (id, rows) => {
        const { error } = await db.from("broadcast_recipients").insert(
          rows.map((r) => ({
            broadcast_id: id,
            contact_id: r.contact_id,
            tenant_id: tenantId,
            ...(r.facts ? { facts: r.facts as unknown as Json } : {}),
          })),
        );
        if (error) throw new Error(error.message);
      },
      fail: async (id, failure) => {
        await db.from("broadcasts").update({ state: "failed", failure }).eq("id", id);
      },
      schedule: async (id, at) => {
        await scheduleJob(db, { tenantId, kind: "broadcast_send", dueAt: at, payload: { broadcast_id: id } });
      },
      // The ledger: a run the sweep sends is the system's decision under the
      // mode the owner chose; a run a person asked for is theirs.
      decide: async ({ broadcastId, by, payload }) => {
        await db.from("decisions").insert({
          tenant_id: tenantId,
          subject_type: "broadcast",
          subject_id: broadcastId,
          verb: "send_broadcast",
          actor_type: by.kind === "user" ? "user" : "system",
          actor_user_id: by.kind === "user" ? by.userId : null,
          payload: payload as unknown as Json,
        });
      },
      notify: async (subject, body) => {
        const target = await loadTenantNotifications(db, tenantId);
        await notify(
          { tenantId, notifications: target.notifications, isEnvDefault: target.isEnvDefault },
          { kind: "playbook", route: "outbound", subject, body },
        );
      },
    },
    { playbook: p, ctx, runFor: req.runFor, by: req.by },
  );
}
