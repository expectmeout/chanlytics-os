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
  assembleBroadcast,
  campaignMonthSent,
  emitEvent,
  everyoneIn,
  followUpsDue,
  holdRecipients,
  leaveSequence,
  listPolicies,
  mailboxOfTenant,
  messageVersionRowsOf,
  savedListsFor,
  textLineFacts,
  touchIndex,
  touchesSince,
  recordOver,
  whatsappChannelFacts,
  yesesSince,
  type Database,
  type Json,
} from "./packages/db.js";
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
  channelsReady,
  dealPaceFrom,
  dealPaceOf,
  dealsAreOn,
  isSellsBy,
  offerPauseOf,
  ownAddressesOf,
  numberHealthOfConfig,
  parseTenantConfig,
  peopleVisitsOf,
  feedMarksOf,
  seasonHorizon,
  poolListContext,
  consultFirstOf,
  poolRowsOf,
  withVisitsOf,
  membersOf,
  resolveList,
  type NumberHealth,
  type PersonRowDto,
  type PersonVisitsDto,
  BOOKING_DEFAULTS,
  DAY_MS,
} from "./packages/contracts.js";
import { feedItemsFor } from "./calendar/availability.js";
import { campaignsDomainVerified } from "./email/campaigns-domain.js";
import { emailCanSend } from "./email/email.js";

type Db = SupabaseClient<Database>;

export type { PlaybookRow };

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

interface TenantRunContext extends RunContext {
  db: Db;
  tenantId: string;
}

/** What a workspace's context answers when it is paused (`tenants.status`): not a failure to read it, and the callers tell the two apart. */
export const CONTEXT_PAUSED = "paused";

/**
 * What a run's channels are judged by (contracts channelsReady), read once per tenant: the WhatsApp number's config as
 * Meta last said it, the texting line a text would leave on, and whether the workspace has a mailbox where this
 * deployment's email wire can send (a mail domain and the provider's key: emailCanSend) -- the rows the dashboard's
 * composers read (packages/db campaign-channels.ts). The WhatsApp number's read that fails is this tenant's error, never a
 * number that is not there: a run that held everyone as unreachable over a blip would be a day lost. A texting line's or
 * a mailbox's read that fails is that channel not ready, said in the log: the people who go by it are held that day, and
 * the playbooks that go by WhatsApp alone still run, as they did before the other two were read at all. The mailbox
 * carries the workspace's pause on offers by email (`offersPause`, 00299), which the same read answers.
 */
async function channelFacts(db: Db, tenantId: string) {
  let whatsapp: Awaited<ReturnType<typeof whatsappChannelFacts>>;
  try {
    whatsapp = await whatsappChannelFacts(db, tenantId);
  } catch (e) {
    return {
      whatsapp: null,
      textLine: null,
      mailbox: false,
      offersPause: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
  const unread = (channel: "sms" | "email") => (e: unknown) => {
    logger({ tenant_id: tenantId }).warn("playbooks_channels_unread", {
      channel,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  };
  const [textLine, mailbox] = await Promise.all([
    textLineFacts(db, tenantId).catch(unread("sms")),
    emailCanSend() ? mailboxOfTenant(db, tenantId).catch(unread("email")) : Promise.resolve(null),
  ]);
  const offersPause = offerPauseOf(mailbox?.offers_paused_at, mailbox?.offers_paused_reason);
  return { whatsapp, textLine, mailbox: !!mailbox, offersPause, error: null };
}

/**
 * What the workspace can send on now: a WhatsApp number it has, a texting line the carriers approved, a mailbox, where
 * this deployment's email wire can send (emailCanSend), and offers by email where the campaigns domain is verified, the
 * business has its address on file and its offers are not paused (contracts email-offers.ts). The pool's rows say who can
 * be sent what against it (contracts reach-any.ts), as the dashboard's read of People does, and the run draws its
 * channels from it.
 */
async function channelsNow(
  channels: Awaited<ReturnType<typeof channelFacts>>,
  health: NumberHealth,
  profile: { address?: string | null } | null | undefined,
) {
  // Whether an offer by email can go: the deployment's campaigns domain (kept five minutes), the business's address, and
  // the mailbox's pause.
  const campaigns = emailCanSend() ? await campaignsDomainVerified() : false;
  return channelsReady({
    // With the number: offers on it are judged by Meta's pause on marketing messages to US numbers (contracts whatsapp-offers.ts).
    whatsapp: channels.whatsapp ? { ...health, number: channels.whatsapp.number } : null,
    textLine: channels.textLine,
    email: {
      mailbox: channels.mailbox,
      domain: emailCanSend(),
      offers: { campaigns, address: !!profile?.address?.trim(), paused: channels.offersPause },
    },
  });
}

/**
 * Everyone's visits for a run, as the People page reads them (contracts peopleVisitsOf): the feed over the workspace's
 * own horizon, and the record beside it over the same season (0002's readers), where a booking's visits join the feed's,
 * a cancelled one leaves, and a member's kept or missed rides on each. A feed or a record that could not be read is
 * "unavailable" (the record's logged): a visit the record cancelled or a member said missed cannot be told from one
 * that stands, and a run that cannot tell them apart sends no visit's message that hour. No calendar is "none".
 */
async function runVisits(
  db: Db,
  tenantId: string,
  {
    url,
    tz,
    now,
    daysAhead,
    rows,
    cfg,
  }: {
    url: string | null;
    tz: string;
    now: Date;
    daysAhead: number;
    rows: Parameters<typeof peopleVisitsOf>[1];
    cfg: ReturnType<typeof parseTenantConfig>;
  },
): Promise<{ calendar: TenantRunContext["calendar"]; visits: Map<string, PersonVisitsDto> }> {
  if (!url) return { calendar: "none", visits: new Map() };
  const season = seasonHorizon(now, daysAhead);
  const [items, record] = await Promise.all([
    feedItemsFor(tenantId, url, tz, now, daysAhead),
    recordOver(db, tenantId, new Date(season.from).toISOString(), new Date(season.to).toISOString()).then(
      (r) => ({ noted: r.noted, marks: feedMarksOf(r.feed) }),
      (e: unknown) => {
        logger({ tenant_id: tenantId }).error("visits_record_read_failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      },
    ),
  ]);
  if (!items || !record) return { calendar: "unavailable", visits: new Map() };
  const profile = cfg?.brain?.profile;
  // The pool's one reading (contracts audience-pool.ts), as the dashboard reads it: the business's own addresses are
  // never a customer's (ownAddressesOf) -- without them a visit playbook could thank the owner, as a customer, for a
  // meeting on their own calendar -- and each visit says whether it is a consultation (0004).
  const visits = peopleVisitsOf(
    items,
    rows,
    {
      timezone: tz,
      source: "calendar",
      own: ownAddressesOf(cfg),
      services: profile?.services ?? [],
      rules: profile?.booking_rules ?? null,
      record,
    },
    now.getTime(),
  );
  return { calendar: "ok", visits };
}

/** Read once per tenant: the people, the modes, the number, the touches. */
export async function loadTenantRunContext(
  db: Db,
  tenantId: string,
  now: Date,
): Promise<TenantRunContext | { error: string }> {
  const [{ data: tenant }, { data: people, error: pErr }, policies, channels, touched, { data: cfgRow }, kept, yeses] =
    await Promise.all([
      // How its customers buy (0008): the proposal follow-up runs only where deals are on (0006).
      db.from("tenants").select("timezone, status, sells_by").eq("id", tenantId).maybeSingle(),
      allPeople(db, tenantId),
      listPolicies(db, tenantId).catch(() => []),
      channelFacts(db, tenantId),
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
      yesesSince(db, tenantId, new Date(now.getTime() - PACE_WINDOW_DAYS * DAY_MS)).catch((e: unknown) => {
        logger({ tenant_id: tenantId }).warn("playbooks_pace_read_failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }),
    ]);
  if (pErr) return { error: pErr.message };
  if (channels.error) return { error: `channels: ${channels.error}` };
  if (touched.error) return { error: touched.error };
  if (kept.error) return { error: `lists: ${kept.error}` };
  // A paused workspace runs nothing: the sweep counts it off, and says so once, quietly; Run now refuses it in words.
  if (tenant?.status === "paused") return { error: CONTEXT_PAUSED };
  // A touch is a message sent, or one on its way, dated by when it went or is due; a broadcast the owner sent by
  // hand counts for the breath (byAny: within a week of now, either side) and for no playbook's gap; a proposal
  // follow-up by any playbook, for the follow-up's once per proposal (touchIndex, 0006).
  const { byThis, byAny, followUps, followUpKeys } = touchIndex(touched.data ?? [], now);
  // The calendar's appointments on every person, the way the People page
  // reads them: a visit playbook keys on the day, and its words come from
  // the visit itself. Read once per tenant per run.
  const tz = tenant?.timezone || "America/New_York";
  const rows = people ?? [];
  const cfgParsed = parseTenantConfig(cfgRow?.config ?? null);
  const url = cfgParsed?.calendar?.ical_url ?? null;
  // The workspace's own horizon, the way the People sweep asks for it
  // (api/cron/calendar.ts). Left to the default, a workspace that books three
  // months out had its visit playbooks reading a fortnight of calendar.
  const daysAhead = cfgParsed?.brain?.profile?.booking_rules?.max_days_ahead ?? BOOKING_DEFAULTS.max_days_ahead;
  const profile = cfgParsed?.brain?.profile;
  const { calendar, visits } = await runVisits(db, tenantId, { url, tz, now, daysAhead, rows, cfg: cfgParsed });
  const dealsOn = dealsAreOn(isSellsBy(tenant?.sells_by) ? tenant.sells_by : null);
  // Everyone as the pool reads them: no one looking (a run has no viewer), no deal where deals are off, and their
  // visits attached the one way (withVisitsOf), as the People list and the Playbooks page attach them.
  const listCtx = poolListContext({
    calendar,
    dealsOn,
    consultFirst: consultFirstOf(profile?.booking_rules),
    viewer: null,
  });
  // The number's rating with what Meta holds against it (its kept standing, 00338): the one derivation the dashboard's
  // composers read too (contracts numberHealthOfConfig). With no active number the config is empty and `ready` has none.
  const health = numberHealthOfConfig(channels.whatsapp ? channels.whatsapp.config : {});
  const ready = await channelsNow(channels, health, profile);
  const vms = poolRowsOf(withVisitsOf(rows, visits, { state: calendar, timezone: tz, source: "calendar" }), {
    tz,
    now,
    viewer: null,
    dealsOn,
    ready,
  });
  return {
    db,
    tenantId,
    tz,
    now,
    people: vms,
    calendar,
    visits,
    // Who is on a list a playbook runs on, the way the People rail and the send count it (contracts lists.ts): one of
    // People's or one of the workspace's own, resolved by its reference. A run has no one looking, so a list about
    // "me" is one it cannot count, as its needs say.
    listMembers: (ref) => {
      const saved = kept.data ?? [];
      const def = resolveList(ref, saved);
      if (!def) return null;
      // Counted, it carries the rule it was counted by, for the run to keep (decision 0009, "sends remember").
      const m = membersOf(def, vms, listCtx, saved);
      return m.state === "ok" ? { ...m, rule: def.rule } : m;
    },
    modes: new Map(policies.map((r) => [r.class, r.mode])),
    health,
    ready,
    touches: { byThis, byAny, followUps, followUpKeys },
    dealsOn,
    pace: dealsOn && yeses ? dealPaceOf(dealPaceFrom(yeses, now.getTime())) : null,
  };
}

interface RunRequest {
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
      // The message is its rows of that name and language on every channel: WhatsApp's as Meta has it, an email's and a
      // text's beside it. A read that fails throws: a message that could not be read is not one Meta withdrew, and the run
      // says it failed rather than skipping the day.
      message: (name, language) => messageVersionRowsOf(db, tenantId, { name, language }),
      alreadyRan: async (playbookId, runFor) => {
        const { data } = await db
          .from("sequence_batches")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("step_id", playbookId)
          .eq("run_for", runFor)
          .maybeSingle();
        return !!data;
      },
      // A customer's step after the first (decision 0060, D6): who it is due to, and the door that takes out those it
      // will not reach.
      followUpsDue: (stepId, runFor) => followUpsDue(db, stepId, runFor),
      leave: (enrollmentIds, why) => leaveSequence(db, { tenantId, enrollmentIds, why }),
      record: async (playbookId, runFor, at, data) => {
        await emitEvent(db, tenantId, "playbook.run", "playbook", playbookId, data).catch(() => {});
        await db
          .from("sequence_steps")
          .update({ last_run_for: runFor, last_run_at: at.toISOString() })
          .eq("id", playbookId)
          .eq("tenant_id", tenantId);
      },
      // The run, its people, its job and its decision, whole (00282 assemble_broadcast, with its decision since 00381):
      // a sweep that dies halfway leaves nothing. A run the sweep sends is the system's decision under the mode the
      // owner chose; a run a person asked for is theirs.
      assemble: (row, recipients, sendAt, decision) =>
        assembleBroadcast(db, {
          tenantId,
          run: {
            name: row.name,
            template_id: row.template_id,
            template_name: row.template_name,
            template_language: row.template_language,
            params: row.params,
            audience: row.audience as unknown as Json,
            state: row.state,
            scheduled_for: row.scheduled_for,
            recipient_count: row.recipient_count,
            created_by: row.created_by,
            playbook_id: row.playbook_id ?? null,
            run_for: row.run_for ?? null,
            channels: row.channels,
          },
          recipients: recipients.map((r) => ({ contact_id: r.contact_id, facts: r.facts, channel: r.channel })),
          sendAt,
          decision: decision
            ? {
                actor: decision.by.kind === "user" ? decision.by.userId : null,
                payload: decision.payload,
                via: null,
                undoOf: null,
              }
            : null,
        }),
      // The month's allowance, counted before anyone is enrolled, and those past it held the moment the run exists (core
      // campaigns/allowance.ts): the send's own check at the wire stays as the backstop.
      monthSent: (channel, at) => campaignMonthSent(db, tenantId, channel, at),
      holdRecipients: (broadcastId, contactIds, reason) =>
        holdRecipients(db, { tenantId, broadcastId, contactIds, reason }),
      // The row opens the run it is about, as a reach-out's does (run-context.ts notifyWaiting): it opened Campaigns' home.
      notify: async (subject, body, runId) => {
        const target = await loadTenantNotifications(db, tenantId);
        await notify(
          { tenantId, ...target },
          {
            kind: "playbook",
            route: `broadcasts/run:${runId}`,
            about: { type: "broadcast", id: runId },
            subject,
            body,
          },
        );
      },
    },
    { playbook: p, ctx, runFor: req.runFor, by: req.by },
  );
}
