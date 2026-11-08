import "server-only";
import { z } from "zod";
import {
  activityDoor,
  activityLines,
  activityRowsForLines,
  agoLabel,
  clockStamp,
  closeSettledNotices,
  instructionsDraft,
  isActivityMoney,
  memberWords,
  noteRows,
  parseTenantConfig,
  phoneVoiceShown,
  policyClassOffered,
  mailboxWords,
  roleAtLeast,
  serverNotificationRows,
  setupSteps,
  unreadCount,
  zoneDayKey,
  toChannelVM,
} from "@chanlytics/contracts";
import { ActivityQuerySchema } from "../../../metrics/activity";
import { load } from "../../../shared/reader";
import { activity as activityReader } from "../../../readers/activity";
import { channels as channelsReader } from "../../../readers/channels";
import { connections as connectionsReader } from "../../../readers/connections";
import * as readers from "../../../readers/facts";
import { notifications as notificationsReader } from "../../../readers/notifications";
import { workspaceFacts } from "../../prompt/stable-system";
import { WHOSE, unread } from "../context/tool-reads";
import { defineActions, readAction, type ToolContext } from "../context/tool-defs";
import { getNoticeWaits } from "./notice-waits";

/**
 * How it answers as it stands, beyond the languages and photos said beside it: what a card of propose_settings' answers
 * changes, read first so a list it replaces keeps what the owner did not ask to drop (the Settings wiring review, item
 * 14). A greeting of null is the standard one, and own words of null none.
 */
function howItAnswersOf(cfg: ReturnType<typeof parseTenantConfig>) {
  const brain = cfg?.brain;
  const profile = brain?.profile;
  return {
    tone: profile?.tone ?? null,
    phone_greeting: profile?.phone_greeting ?? null,
    phone_voice: phoneVoiceShown(profile?.phone_voice).name,
    transfer_number: profile?.handoff_number ?? null,
    own_words: (brain && instructionsDraft(brain).text) || null,
    messages: brain?.fallbacks ?? null,
  };
}

/**
 * How it reaches out as it stands (decision 0113): what a card of propose_settings' reach_out changes, read first so a
 * claim added never repeats one there and one taken away is named as it is written. Null where a row is not set: each
 * writer then reads what it read before (the goal or what the business does, the receptionist's tone).
 */
function howItReachesOutOf(cfg: ReturnType<typeof parseTenantConfig>) {
  const section = cfg?.reach_out;
  return {
    offer: section?.offer ?? null,
    who_for: section?.who_for ?? null,
    fixes: section?.fixes ?? null,
    claims: section?.proof ?? [],
    tone: section?.tone ?? null,
    signed_by: section?.signed_by ?? null,
    signature: section?.signature ?? null,
    reply_offer: section?.reply_offer ?? "booking_link",
  };
}

async function getSettings(toolContext: ToolContext): Promise<unknown> {
  // The facts the receptionist runs on, composed from the turn's reads -- never the settings page's own read
  // (readers/settings.ts), whose prompt preview fetches the calendar feed and reads the Autonomy rows again, which a
  // question about the hours must not pay for.
  const [{ name, timezone }, cfgRow, all, chans] = await Promise.all([
    load(toolContext.rc, readers.facts, undefined).then((r) => r.data),
    load(toolContext.rc, readers.config, undefined).then((r) => r.data),
    load(toolContext.rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    // The channels as their page reads them (readers/channels.ts), once a turn: sequences.lists reads the same
    // rows. A read that fails is said as its own state, never as no channels, and the rest of the settings still answer.
    load(toolContext.rc, channelsReader, undefined).then(
      (r) => r.data.channels,
      unread(toolContext, "workspace.settings", "channels"),
    ),
  ]);
  // The Autonomy rows offered here, as the pane draws them (contracts policyClassOffered).
  const policies = all.filter((p) => policyClassOffered(p.class));
  const cfg = parseTenantConfig(cfgRow?.config ?? null);
  const facts = workspaceFacts(name, timezone, cfgRow?.config ?? null, toolContext.rc.now, policies);
  return {
    business: facts.businessName,
    timezone,
    hours: facts.hoursLines,
    closures: facts.closures,
    services: facts.services,
    languages: facts.languages,
    guardrails: facts.guardrails,
    notes: facts.notes,
    booking_rules: cfg?.brain?.profile?.booking_rules ?? null,
    escalate_when: cfg?.brain?.profile?.escalate_when ?? [],
    calendar_connected: facts.hasCalendar,
    vision: facts.visionOn,
    answers: howItAnswersOf(cfg),
    reach_out: howItReachesOutOf(cfg),
    notifications: cfg?.notifications
      ? {
          escalation_emails:
            toolContext.role === "owner"
              ? cfg.notifications.escalation_emails
              : cfg.notifications.escalation_emails.length,
        }
      : null,
    policies: policies.map((p) => ({ class: p.class, mode: p.mode, limits: p.limits })),
    // The same three fields, in the page's order: by kind. Null: they could not be read, which is not none.
    // Each line's state as Connections says it (contracts toChannelVM healthLabel): "active" was the stored word (R13 X5-7).
    channels: chans
      ? chans.map((c) => ({
          kind: c.kind,
          status: toChannelVM(c, toolContext.now, toolContext.timezone).healthLabel,
          number: c.number_e164,
        }))
      : null,
    config_version: cfgRow?.version ?? null,
    ...(chans ? {} : { could_not_read: ["The channels could not be read just now."] }),
  };
}

/** Setup's rows that are the workspace's connections: its line and the number it keeps, WhatsApp, email, the calendar, Google. */
const CONNECTION_ROWS = ["line", "keep", "whatsapp", "email", "calendar", "google"];

/**
 * What the workspace is connected to, in the Setup page's words (readers/connections.ts, GET setup's own read, then
 * contracts setupSteps as the page builds it): whether the receptionist answers and where, each connection's row, and
 * each mailbox it writes its reach-outs from as Connections says it (contracts mailboxWords). Money stays out (the
 * charter, §7): Setup's billing row is not one of these, the plan's price is never passed in, and a row that waits on
 * Billing says only its state.
 */
async function getConnections(toolContext: ToolContext): Promise<unknown> {
  const read = await load(toolContext.rc, connectionsReader, undefined);
  const setup = read.data.setup;
  const vm = setupSteps(
    {
      ...setup,
      ...(setup.billing ? { billing: { ...setup.billing, price: null } } : {}),
      tz: toolContext.timezone,
      later: [],
      rests: {},
    },
    toolContext.now.getTime(),
  );
  // Each mailbox it writes from is a row an answer may cite, opened on Connections: the reader's RowRefs.
  noteRows(toolContext.read, read.rows);
  return {
    route: "start",
    answering: vm.readiness.sentence,
    connections: vm.rows
      .filter((r) => CONNECTION_ROWS.includes(r.id))
      .map((r) => {
        const billing = r.verb?.to === "admin/billing";
        return {
          what: r.title,
          state: r.stateWords,
          ...(billing ? {} : { says: r.sentence, ...(r.details.length ? { details: r.details } : {}) }),
        };
      }),
    mailboxes: (setup.email?.sending?.mailboxes ?? []).map((match) => {
      const result = mailboxWords(match, toolContext.now.getTime(), toolContext.timezone);
      return {
        mailbox_id: match.id,
        route: "admin/integrations",
        address: match.address,
        state: result.pill,
        says: result.day,
        ...(result.ramp ? { ramp: result.ramp } : {}),
        ...(result.fix ? { fix: result.fix } : {}),
      };
    }),
  };
}

/**
 * The person's own notifications as the bell keeps them on the server (readers/notifications.ts, GET notifications'
 * own read, then contracts serverNotificationRows as the bell builds its kept rows): the last thirty days, sixty at
 * most, newest first, with their own marks -- one dismissed is gone, unread by when they last opened the bell. What the
 * bell works out in the tab (threads, calls, invitations) is not the server's to read. A billing notice stays out.
 *
 * And closed as the bell closes them (contracts closeSettledNotices): a row whose run was approved, whose booking email was
 * dismissed or whose review was answered reads as read, and no longer as waiting. Ask listed them as waiting and counted them
 * unread, above the bell's number (the wiring's second audit, R13 X5-1). What still waits is read where the server reads it
 * (notice-waits.ts).
 */
async function getNotifications(toolContext: ToolContext): Promise<unknown> {
  const [dto, zone] = await Promise.all([
    load(toolContext.rc, notificationsReader, undefined).then((r) => r.data),
    load(toolContext.rc, readers.facts, undefined).then(
      (r) => r.data.timezone,
      () => null,
    ),
  ]);
  const kept = dto.notifications.filter((n) => n.kind !== "billing");
  const waits = await getNoticeWaits(toolContext.rc.ctx.supabase, toolContext.rc.tenantId, kept, toolContext.now, zone);
  const rows = closeSettledNotices(serverNotificationRows({ ...dto, notifications: kept }), waits);
  const nowMs = toolContext.now.getTime();
  return {
    unread: unreadCount(rows),
    notifications: rows.map((r) => ({
      title: r.title,
      says: r.message,
      when: agoLabel(r.at, nowMs),
      unread: r.unread,
      open: r.to,
    })),
  };
}

/** How many lines of the log one read says, of its page. */
const ACTIVITY_CAP = 30;

/**
 * Who did what, as Settings › Activity lists it (readers/activity.ts, GET activity's own read, filtered by the same
 * checks): both ledgers, newest first, each line the page's -- who, then the sentence, then who or what it was about
 * by name -- by the business's clock, and where it opens. Rows of one kind by one hand on one day are one line with its
 * count, as the page folds them (contracts activityLines), so a burst of one kind is said once and not thirty times. An owner's (D13): the route's door is the owner's and RLS lets every member read the ledgers, so the
 * action is the door -- the registry offers it to an owner alone and refuses anyone else, and this checks again.
 * Money stays out (the charter): a row about money (contracts isActivityMoney, the category its emitter filed it under
 * -- billing, and a partner's share) is never said, and a kind whose rows are money is refused in words. It pages
 * without a gap: it says the lines its newest rows fold to (activityRowsForLines), and the next read starts right after
 * the last of those rows, so the rows between it and the reader's page's end are read again, and a money row among
 * them is left out again.
 */
async function readActivity(
  toolContext: ToolContext,
  input: { person?: string; kind?: string; day?: string; cursor?: string },
): Promise<unknown> {
  if (!roleAtLeast(toolContext.role, "owner")) return { error: `workspace: action activity is ${WHOSE.owner}` };
  const parsed = ActivityQuerySchema.safeParse(input);
  if (!parsed.success)
    return { error: `workspace: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  const page = (await load(toolContext.rc, activityReader, parsed.data)).data;
  // A kind has one category (its emitter's): named, and its rows are money, the kind is money's.
  if (parsed.data.kind && page.rows.some(isActivityMoney))
    return { error: "that kind is about money, which stays out of Ask: its page has it" };
  const rows = page.rows.filter((r) => !isActivityMoney(r));
  const dayOf = (at: string): string => zoneDayKey(Date.parse(at), toolContext.timezone);
  const folds = !parsed.data.kind;
  const read = rows.slice(0, activityRowsForLines(rows, dayOf, ACTIVITY_CAP, folds));
  const last = read[read.length - 1];
  const nowMs = toolContext.now.getTime();
  return {
    route: "admin/activity",
    activity: activityLines(read, dayOf, folds).map((line) => {
      const row = line.row;
      const personName = row.actor_user_id
        ? (page.actors[row.actor_user_id] ?? memberWords({ email: null }).name)
        : row.actor_type === "ai"
          ? "Receptionist"
          : row.source === "event"
            ? ""
            : "System";
      const key = row.subject_type && row.subject_id ? `${row.subject_type}:${row.subject_id}` : "";
      const about = key ? page.subjects[key] : undefined;
      const sentence = line.title ?? (about ? `${row.text} · ${about}` : row.text);
      return {
        when: clockStamp(Date.parse(row.at), toolContext.timezone, nowMs),
        what: personName ? `${personName} · ${sentence}` : sentence,
        // A fold stands for several rows, and opens none of them.
        ...(line.count > 1 ? { times: line.count, open: null } : { open: page.doors[key] ?? activityDoor(row) }),
      };
    }),
    // The reader's own cursor shape, "<created_at>|<row id>": after the last row said while this page holds more;
    // else after the page, while the log holds more; else none.
    next_cursor:
      last && rows.length > read.length ? `${last.at}|${last.id}` : page.page.has_more ? page.page.next_cursor : null,
  };
}

/**
 * The workspace (D11): its settings (settings, once get_settings); since Phase 4 (D13), its connections in Setup's
 * words, the person's notifications and, for an owner, the activity log.
 */
export const workspaceTool = defineActions({
  name: "workspace",
  description: "The workspace, by action.",
  tail: "Nothing changes because it was read.",
  actions: {
    settings: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading Settings",
      words:
        "Action settings takes nothing more and reads the settings as the receptionist runs on them: the business and its time zone, hours, closures, services, languages, guardrails, notes, booking rules, when it escalates, whether the calendar and vision are on, the notifications (where alerts are emailed), the autonomy rows with their modes and limits (the reply policy's dials among them), and which channels are connected with their numbers. Call it for the reply policy's dials, the channels and the notifications; the hours, closures, services, notes, guardrails, booking notes and the autonomy modes are already in this prompt, so answer those from here without a read. A channels read that failed is said in could_not_read, never as no channels; propose_settings is what changes a setting.",
      run: getSettings,
    }),
    connections: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the connections",
      words:
        "Action connections takes nothing more and reads what the workspace is connected to, in the Setup page's words: whether the receptionist answers and on which numbers; its phone line and whether the number its customers know is forwarded to it, WhatsApp, the email mailbox, the calendar and Google, each with its state and what the page says of it; and each mailbox it writes its reach-outs from, with its state, its day, its ramp and what to do next. Call it for whether something is connected, or why not; action settings has the receptionist's own rules. Billing and the plan's price are not here: money stays out of Ask.",
      run: getConnections,
    }),
    notifications: readAction({
      input: z.object({}),
      examples: [{}],
      label: "Reading the notifications",
      words:
        "Action notifications takes nothing more and reads this person's own notifications as the bell keeps them on the server: the last thirty days, sixty at most, newest first, each with its title, its first line, how long ago, whether it is unread for them and where it opens, and how many are unread; one they dismissed is gone. Call it for what the bell has told them. The bell also shows what the page works out in the tab (threads waiting on a person, missed calls, invitations), which this cannot read, so say the bell may hold more; billing's notices stay out of Ask.",
      run: getNotifications,
    }),
    activity: readAction({
      input: z.object({
        person: z.string().optional(),
        kind: z.string().optional(),
        day: z.string().optional(),
        cursor: z.string().optional(),
      }),
      examples: [{ day: "2026-09-26" }],
      label: "Reading the activity",
      needs: "owner",
      words: `Action activity takes an optional person (a contact_id a read returned), kind (a verb or an event kind, exactly as the log spells it), day (YYYY-MM-DD, by the business's clock) and cursor (the next_cursor an earlier read returned), and reads who did what, as Settings › Activity lists it: both ledgers, newest first, each with when, who and what in the page's words, and where it opens; the usage, webhook and ingest records only when their kind is asked for. Call it for what a member or the receptionist did, and when. It returns the newest ${ACTIVITY_CAP}, with next_cursor for the ones after them while there are more; anything about money (billing, a partner's share) stays out of Ask.`,
      run: readActivity,
    }),
  },
});
