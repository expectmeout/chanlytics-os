/**
 * The demo's Playbooks: a sample business's standing rules, passed through the same contracts functions a real workspace's
 * go through (the schedule line, the next run, the trigger's words, the number's health), so a demo session draws the one
 * Playbooks page there is. Three playbooks: a win-back running, a welcome with a run waiting for its owner, and a visit
 * reminder paused, over the approved starters. Deterministic: the same moment is the same page. Nothing counted here is a
 * customer's: the twin it replaces was the mockup's own page, with its own invented campaigns.
 */
import {
  DAY_MS,
  REPLY_WINDOW_WORDS,
  PLAYBOOK_TRIGGERS,
  campaignMessagesOf,
  campaignRunsOn,
  channelsReady,
  momentOffered,
  nextRunLabel,
  numberHealth,
  purposeOfTemplate,
  scheduleLine,
  starterByKey,
  starterText,
  triggerOf,
  triggerOffered,
  type PlaybookDto,
} from "@chanlytics/contracts";
import type { PoolRead } from "@/lib/campaign-channels";
import type { PlaybookCardVM, PlaybooksSurface, PlaybookTemplate, PlaybookTriggerOption } from "./surface";
import { DEMO_ZONE } from "../../demo-zone";

const DAY = DAY_MS;

/** A starter as WhatsApp holds it once approved: the library's words and slots. */
function approved(key: string, syncedAt: string): PlaybookTemplate {
  const s = starterByKey(key);
  if (!s) throw new Error(`no starter called ${key}`);
  const t = starterText(s, "en_US");
  return {
    id: `tpl-${key}`,
    channel: "whatsapp",
    name: s.name,
    language: "en_US",
    body_preview: t.body,
    variables: t.slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example })),
    footer: t.footer,
    category: s.category,
    meta_status: "approved",
    quality: null,
    rejected_reason: null,
    synced_at: syncedAt,
    source: "starter",
    title: null,
    purpose: purposeOfTemplate(s.category),
    // The demo's starters are WhatsApp's alone: no email or text version is on file to send by.
    channels: ["whatsapp"],
  };
}

/** One playbook of the sample: its stored row, and what the page adds to it (the words, the counts, the runs). */
function card(
  dto: PlaybookDto,
  now: Date,
  extra: Pick<PlaybookCardVM, "candidates" | "held" | "totals">,
): PlaybookCardVM {
  const t = triggerOf(dto.trigger);
  return {
    ...dto,
    ...extra,
    poolKey: dto.trigger,
    triggerLabel: t?.label ?? dto.trigger,
    triggerHint: t?.hint ?? "",
    // The demo's business has said nothing of how its customers buy: its word is the one derivation's, "appointment".
    schedule: scheduleLine(dto, "appointment"),
    next: nextRunLabel(dto, DEMO_ZONE, now, false),
    named: null,
    off: null,
    // The one rule (contracts campaignRunsOn), at the sample's clock: its campaigns have no last day.
    runs: campaignRunsOn(dto, { tz: DEMO_ZONE, now, dealsOn: false }),
  };
}

/** A moment's count in the demo: who a run reaches, who waits out the week, everyone the moment names; each of them said yes. */
function samplePool(candidates: number, held: number, pool: number): PoolRead {
  return { candidates, held, pool, noYes: 0, stopped: 0, noNumber: 0, saidYes: pool };
}

/**
 * Every moment that may run here, as the surface hands them (surface.ts); the sample has a calendar (its `calendar: "ok"`),
 * so a new playbook is offered the win-back by visits, and the welcome it already runs stays a card.
 */
function sampleTriggers(): PlaybookTriggerOption[] {
  return PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t, false)).map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
    offered: momentOffered(t, { dealsOn: false, calendarOn: true }),
    candidates: t.id === "quiet_30" ? 6 : t.id === "new_week" ? 4 : t.id === "visit_tomorrow" ? 3 : 0,
    held: 0,
    named: null,
  }));
}

/** The demo's Playbooks as of `now`: what `useSurface("playbooks")` answers for a workspace that has read its own. */
export function playbooksSample(now = new Date()): PlaybooksSurface {
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const day = (ms: number) => iso(ms).slice(0, 10);
  const base: Pick<
    PlaybookDto,
    "list_id" | "params" | "run_hour" | "cap_per_run" | "gap_days" | "cadence_days" | "created_at" | "template_language"
  > = {
    list_id: null,
    params: [{ kind: "first_name" }, { kind: "business_name" }, { kind: "booking_link" }],
    run_hour: 10,
    cap_per_run: 25,
    gap_days: 90,
    cadence_days: 30,
    created_at: iso(-60 * DAY),
    template_language: "en_US",
  };
  const winback: PlaybookDto = {
    ...base,
    id: "pb-sample-winback",
    name: "Win-back",
    trigger: "quiet_30",
    template_id: "tpl-winback_offer",
    template_name: "winback_offer",
    policy_class: "reengage",
    state: "running",
    last_run_for: day(-2 * DAY),
    last_run_at: iso(-2 * DAY),
  };
  const welcome: PlaybookDto = {
    ...base,
    id: "pb-sample-welcome",
    name: "Welcome",
    trigger: "new_week",
    template_id: "tpl-monthly_offer",
    template_name: "monthly_offer",
    policy_class: "campaign",
    state: "running",
    gap_days: 30,
    last_run_for: null,
    last_run_at: null,
  };
  const reminder: PlaybookDto = {
    ...base,
    id: "pb-sample-reminder",
    name: "Visit reminder",
    trigger: "visit_tomorrow",
    template_id: "tpl-visit_reminder",
    template_name: "visit_reminder",
    policy_class: "booking",
    state: "paused",
    run_hour: 9,
    gap_days: 0,
    last_run_for: null,
    last_run_at: null,
  };
  const empty = { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null, history: [] };
  const rows = [
    card(winback, now, {
      candidates: 6,
      held: 1,
      totals: {
        runs: 3,
        sent: 41,
        delivered: 39,
        replied: 7,
        held: 2,
        lastRun: { id: "b-sample-1", state: "sent", run_for: day(-2 * DAY), recipient_count: 14 },
        waiting: null,
        history: [
          {
            id: "b-sample-1",
            run_for: day(-2 * DAY),
            state: "sent",
            scheduled_for: iso(-2 * DAY),
            recipient_count: 14,
            sent: 14,
            held: 1,
            delivered: 14,
            replied: 3,
          },
          {
            id: "b-sample-0",
            run_for: day(-32 * DAY),
            state: "sent",
            scheduled_for: iso(-32 * DAY),
            recipient_count: 27,
            sent: 27,
            held: 1,
            delivered: 25,
            replied: 4,
          },
        ],
      },
    }),
    card(welcome, now, {
      candidates: 4,
      held: 0,
      totals: { ...empty, waiting: { id: "b-sample-2", recipient_count: 4, name: `Welcome · ${day(0)}` } },
    }),
    card(reminder, now, { candidates: 3, held: 0, totals: empty }),
  ];
  const templates = ["winback_offer", "monthly_offer", "visit_reminder"].map((key) => approved(key, iso(-7 * DAY)));
  const triggers = sampleTriggers();
  return {
    rows,
    // The moments' counts, as the cards above and the triggers below say them (Campaigns' home reads who each moment
    // names from here), and a workspace with its WhatsApp number and nothing else set up to send on: no texting line, no
    // mailbox.
    pools: {
      quiet_30: samplePool(6, 1, 9),
      new_week: samplePool(4, 0, 4),
      visit_tomorrow: samplePool(3, 0, 3),
      visited: samplePool(0, 0, 0),
    },
    ready: channelsReady({
      whatsapp: { canSend: true, refusal: null },
      textLine: null,
      email: { mailbox: false, domain: true },
    }),
    // The demo sends nothing, so it has no month to say.
    month_sent: null,
    timezone: DEMO_ZONE,
    countsRead: true,
    calendar: "ok",
    // A calendar connected (above), deals off, and the word a business that has not said how its customers buy reads.
    shape: { calendar: "feed", dealsOn: false, word: "appointment" },
    triggers,
    lists: [],
    templates,
    // The rows the call's text is looked for among, and the messages the Library counts: the sample's own WhatsApp rows.
    library: templates,
    messages: campaignMessagesOf(templates),
    // The demo reads no autonomy matrix: Resume says when and to how many alone.
    modes: null,
    number: { present: true, health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }) },
    businessName: "Marisa's Studio",
    bookingLink: true,
    // The sample has no Google listing: no review link to fill a slot with.
    reviewLink: false,
    replyWindow: REPLY_WINDOW_WORDS,
    fetchedAt: now.getTime(),
  };
}
