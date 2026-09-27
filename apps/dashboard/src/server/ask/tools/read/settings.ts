import "server-only";
import { z } from "zod";
import {
  agoLabel,
  clockStamp,
  dealsAreOn,
  noteRows,
  parseTenantConfig,
  policyClassOffered,
  roleAtLeast,
  sendingDomainWords,
  serverNotificationRows,
  setupSteps,
  unreadCount,
} from "@chanlytics/contracts";
import { ActivityQuerySchema } from "../../../metrics/activity";
import { load } from "../../../readers";
import { activity as activityReader } from "../../../readers/activity";
import { channels as channelsReader } from "../../../readers/channels";
import { connections as connectionsReader } from "../../../readers/connections";
import * as readers from "../../../readers/facts";
import { notifications as notificationsReader } from "../../../readers/notifications";
import { workspaceFacts } from "../../prompt";
import { WHOSE, defineActions, readAction, unread, type ToolContext } from "../context";

async function getSettings(t: ToolContext): Promise<unknown> {
  // The facts the receptionist runs on, composed from the turn's reads -- never the settings page's own read
  // (readers/settings.ts), whose prompt preview fetches the calendar feed and reads the Autonomy rows again, which a
  // question about the hours must not pay for.
  const [{ name, timezone }, cfgRow, all, chans, sellsBy] = await Promise.all([
    load(t.rc, readers.facts, undefined).then((r) => r.data),
    load(t.rc, readers.config, undefined).then((r) => r.data),
    load(t.rc, readers.policies, undefined).then(
      (r) => r.data,
      () => [],
    ),
    // The channels as their page reads them (readers/channels.ts), once a turn: campaigns.audiences reads the same
    // rows. A read that fails is said as its own state, never as no channels, and the rest of the settings still answer.
    load(t.rc, channelsReader, undefined).then((r) => r.data.channels, unread(t, "workspace.settings", "channels")),
    load(t.rc, readers.sellsBy, undefined).then((r) => r.data),
  ]);
  // The Autonomy rows offered here, as the pane draws them: the follow-ups' only where deals are on (0006).
  const policies = all.filter((p) => policyClassOffered(p.class, dealsAreOn(sellsBy)));
  const cfg = parseTenantConfig(cfgRow?.config ?? null);
  const facts = workspaceFacts(name, timezone, cfgRow?.config ?? null, policies);
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
    notifications: cfg?.notifications
      ? {
          escalation_emails:
            t.role === "owner" ? cfg.notifications.escalation_emails : cfg.notifications.escalation_emails.length,
        }
      : null,
    policies: policies.map((p) => ({ class: p.class, mode: p.mode, limits: p.limits })),
    // The same three fields, in the page's order: by kind. Null: they could not be read, which is not none.
    channels: chans ? chans.map((c) => ({ kind: c.kind, status: c.status, number: c.number_e164 })) : null,
    config_version: cfgRow?.version ?? null,
    ...(chans ? {} : { could_not_read: ["The channels could not be read just now."] }),
  };
}

/** Setup's rows that are the workspace's connections: its line and the number it keeps, WhatsApp, email, the calendar, Google. */
const CONNECTION_ROWS = ["line", "keep", "whatsapp", "email", "calendar", "google"];

/**
 * What the workspace is connected to, in the Setup page's words (readers/connections.ts, GET setup's own read, then
 * contracts setupSteps as the page builds it): whether the receptionist answers and where, each connection's row, and
 * each domain it sends cold email from as Connections says it (contracts sendingDomainWords). Money stays out (the
 * charter, §7): Setup's billing row is not one of these, the plan's price is never passed in, and a row that waits on
 * Billing says only its state.
 */
async function getConnections(t: ToolContext): Promise<unknown> {
  const read = await load(t.rc, connectionsReader, undefined);
  const setup = read.data.setup;
  const vm = setupSteps(
    { ...setup, ...(setup.billing ? { billing: { ...setup.billing, price: null } } : {}), later: [] },
    t.now.getTime(),
  );
  // Each domain it sends from is a row an answer may cite, opened on Connections: the reader's RowRefs.
  noteRows(t.read, read.rows);
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
    sending_domains: (setup.email?.sending?.domains ?? []).map((d) => {
      const w = sendingDomainWords(d);
      return {
        domain_id: d.id,
        route: "admin/integrations",
        host: d.host,
        state: w.pill,
        says: w.line,
        ...(w.stats ? { stats: w.stats } : {}),
        cap: w.cap,
        ...(w.fix ? { fix: w.fix } : {}),
        ...(w.next ? { next: w.next } : {}),
      };
    }),
  };
}

/**
 * The person's own notifications as the bell keeps them on the server (readers/notifications.ts, GET notifications'
 * own read, then contracts serverNotificationRows as the bell builds its kept rows): the last thirty days, sixty at
 * most, newest first, with their own marks -- one dismissed is gone, unread by when they last opened the bell. What the
 * bell works out in the tab (threads, calls, invitations) is not the server's to read. A billing notice stays out.
 */
async function getNotifications(t: ToolContext): Promise<unknown> {
  const dto = (await load(t.rc, notificationsReader, undefined)).data;
  const rows = serverNotificationRows({ ...dto, notifications: dto.notifications.filter((n) => n.kind !== "billing") });
  const nowMs = t.now.getTime();
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

/** How many lines of the log one read says, of its page of a hundred. */
const ACTIVITY_CAP = 30;

/**
 * Who did what, as Settings › Activity lists it (readers/activity.ts, GET activity's own read, filtered by the same
 * checks): both ledgers, newest first, each line the page's -- who, then the sentence -- by the business's clock, and
 * where it opens. An owner's (D13): the route's door is the owner's and RLS lets every member read the ledgers, so the
 * action is the door -- the registry offers it to an owner alone and refuses anyone else, and this checks again.
 * Billing's rows stay out.
 */
async function readActivity(
  t: ToolContext,
  input: { person?: string; kind?: string; day?: string; cursor?: string },
): Promise<unknown> {
  if (!roleAtLeast(t.role, "owner")) return { error: `workspace: action activity is ${WHOSE.owner}` };
  const q = ActivityQuerySchema.safeParse(input);
  if (!q.success)
    return { error: `workspace: ${q.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}` };
  if (q.data.kind?.startsWith("billing"))
    return { error: "billing's rows stay out of Ask: Settings › Billing has them" };
  const page = (await load(t.rc, activityReader, q.data)).data;
  const rows = page.rows.filter((r) => !r.kind.startsWith("billing"));
  const nowMs = t.now.getTime();
  return {
    route: "admin/activity",
    activity: rows.slice(0, ACTIVITY_CAP).map((r) => {
      const who = r.actor_user_id
        ? (page.actors[r.actor_user_id] ?? "A member")
        : r.actor_type === "ai"
          ? "Receptionist"
          : r.source === "event"
            ? ""
            : "System";
      const open =
        r.subject_type === "contact" && r.subject_id
          ? `clients/${r.subject_id}`
          : r.subject_type === "conversation" && r.subject_id
            ? `inbox/th-${r.subject_id}`
            : r.subject_type === "call" && r.subject_id
              ? `conversations/cv-${r.subject_id}`
              : null;
      return { when: clockStamp(Date.parse(r.at), t.timezone, nowMs), what: who ? `${who} · ${r.text}` : r.text, open };
    }),
    ...(rows.length > ACTIVITY_CAP ? { more_on_this_page: rows.length - ACTIVITY_CAP } : {}),
    next_cursor: page.page.next_cursor,
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
        "Action connections takes nothing more and reads what the workspace is connected to, in the Setup page's words: whether the receptionist answers and on which numbers; its phone line and whether the number its customers know is forwarded to it, WhatsApp, the email mailbox, the calendar and Google, each with its state and what the page says of it; and each domain it sends cold email from, with its state, what it has sent, its daily cap and what to do next. Call it for whether something is connected, or why not; action settings has the receptionist's own rules. Billing and the plan's price are not here: money stays out of Ask.",
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
      words: `Action activity takes an optional person (a contact_id a read returned), kind (a verb or an event kind, exactly as the log spells it), day (YYYY-MM-DD, by the business's clock) and cursor (the next_cursor an earlier read returned), and reads who did what, as Settings › Activity lists it: both ledgers, newest first, each with when, who and what in the page's words, and where it opens; the usage, webhook and ingest records only when their kind is asked for. Call it for what a member or the receptionist did, and when. It returns the newest ${ACTIVITY_CAP} of a page of a hundred, with next_cursor for the page after; billing's rows stay out of Ask.`,
      run: readActivity,
    }),
  },
});
