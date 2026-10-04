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
  holdRecipients,
  listPolicies,
  mailboxOfTenant,
  ownVersionsFiled,
  savedListsFor,
  textLineFacts,
  touchIndex,
  touchesSince,
  whatsappChannelConfig,
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
  numberHealth,
  parseTenantConfig,
  peopleVisitsOf,
  poolListContext,
  consultFirstOf,
  poolRowsOf,
  withVisitsOf,
  membersOf,
  resolveList,
  type PersonRowDto,
  type PersonVisitsDto,
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
  let whatsapp: Awaited<ReturnType<typeof whatsappChannelConfig>>;
  try {
    whatsapp = await whatsappChannelConfig(db, tenantId);
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
  health: ReturnType<typeof numberHealth>,
  profile: { address?: string | null } | null | undefined,
) {
  // Whether an offer by email can go: the deployment's campaigns domain (kept five minutes), the business's address, and
  // the mailbox's pause.
  const campaigns = emailCanSend() ? await campaignsDomainVerified() : false;
  return channelsReady({
    whatsapp: channels.whatsapp ? health : null,
    textLine: channels.textLine,
    email: {
      mailbox: channels.mailbox,
      domain: emailCanSend(),
      offers: { campaigns, address: !!profile?.address?.trim(), paused: channels.offersPause },
    },
  });
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
  const cfg = channels.whatsapp ?? {};
  const s = (k: string) => (typeof cfg[k] === "string" ? cfg[k] : null);
  // A touch is a message sent, or one on its way, dated by when it went or is due; a broadcast the owner sent by
  // hand counts for the breath (byAny) and for no playbook's gap; a proposal follow-up by any playbook, for the
  // follow-up's once per proposal (touchIndex, 0006).
  const { byThis, byAny, followUps } = touchIndex(touched.data ?? []);
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
  // Everyone as the pool reads them: no one looking (a run has no viewer), no deal where deals are off, and their
  // visits attached the one way (withVisitsOf), as the People list and the Playbooks page attach them.
  const listCtx = poolListContext({
    calendar,
    dealsOn,
    consultFirst: consultFirstOf(profile?.booking_rules),
    viewer: null,
  });
  const health = numberHealth({ quality: s("quality_rating"), event: s("quality_event"), limit: s("messaging_limit") });
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
    touches: { byThis, byAny, followUps },
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
      // A read that fails throws: a template that could not be read is not
      // one Meta withdrew, and the run says it failed rather than skipping the day.
      template: async (name, language) => {
        const { data, error } = await db
          .from("templates")
          .select("meta_status, category")
          .eq("tenant_id", tenantId)
          .eq("channel", "whatsapp")
          .eq("name", name)
          .eq("language", language)
          .maybeSingle();
        if (error) throw new Error(`cannot read template ${name}: ${error.message}`);
        return data ?? null;
      },
      // The channels, of email and text, that hold a version of the message in its language (a templates row of its
      // name and language there): a read that fails throws, and the run says it failed.
      versions: async (name, language) =>
        (await ownVersionsFiled(db, tenantId, [name])).filter((v) => v.language === language).map((v) => v.channel),
      alreadyRan: async (playbookId, runFor) => {
        const { data } = await db
          .from("broadcasts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("playbook_id", playbookId)
          .eq("run_for", runFor)
          .maybeSingle();
        return !!data;
      },
      record: async (playbookId, runFor, at, data) => {
        await emitEvent(db, tenantId, "playbook.run", "playbook", playbookId, data).catch(() => {});
        await db
          .from("playbooks")
          .update({ last_run_for: runFor, last_run_at: at.toISOString() })
          .eq("id", playbookId)
          .eq("tenant_id", tenantId);
      },
      // The run, its people and its job, whole (00282 assemble_broadcast): a sweep that dies halfway leaves nothing.
      assemble: (row, recipients, sendAt) =>
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
        }),
      // The month's allowance, counted before anyone is enrolled, and those past it held the moment the run exists (core
      // campaigns/allowance.ts): the send's own check at the wire stays as the backstop.
      monthSent: (channel) => campaignMonthSent(db, tenantId, channel),
      holdRecipients: (broadcastId, contactIds, reason) =>
        holdRecipients(db, { tenantId, broadcastId, contactIds, reason }),
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
