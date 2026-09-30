/**
 * The demo's Playbooks: a sample business's standing rules, passed through the same contracts functions a real workspace's
 * go through (the schedule line, the next run, the trigger's words, the number's health), so a demo session draws the one
 * Playbooks page there is. Three playbooks: a win-back running, a welcome with a run waiting for its owner, and a visit
 * reminder paused, over the approved starters. Deterministic: the same moment is the same page. Nothing counted here is a
 * customer's: the twin it replaces was the mockup's own page, with its own invented campaigns.
 */
import {
  REPLY_WINDOW_WORDS,
  PLAYBOOK_TRIGGERS,
  nextRunLabel,
  numberHealth,
  scheduleLine,
  starterByKey,
  starterText,
  triggerOf,
  triggerOffered,
  type PlaybookDto,
} from "@chanlytics/contracts";
import type { TemplateDto } from "@/legacy-bridge/surfaces/inbox";
import type { PlaybookCardVM, PlaybooksSurface, PlaybookTriggerOption } from "./surface";

const ZONE = "America/New_York";
const DAY = 86_400_000;

/** A starter as WhatsApp holds it once approved: the library's words and slots. */
function approved(key: string, syncedAt: string): TemplateDto {
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
    triggerLabel: t?.label ?? dto.trigger,
    triggerHint: t?.hint ?? "",
    schedule: scheduleLine(dto),
    next: nextRunLabel(dto, ZONE, now),
    named: null,
    off: null,
  };
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
  const triggers: PlaybookTriggerOption[] = PLAYBOOK_TRIGGERS.filter((t) => triggerOffered(t, false)).map((t) => ({
    id: t.id,
    label: t.label,
    hint: t.hint,
    cls: t.cls,
    list: t.list,
    kind: t.kind,
    candidates: t.id === "quiet_30" ? 6 : t.id === "new_week" ? 4 : t.id === "visit_tomorrow" ? 3 : 0,
    held: 0,
    named: null,
  }));
  return {
    rows,
    timezone: ZONE,
    countsRead: true,
    calendar: "ok",
    triggers,
    lists: [],
    templates: ["winback_offer", "monthly_offer", "visit_reminder"].map((key) => approved(key, iso(-7 * DAY))),
    number: { present: true, health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }) },
    businessName: "Marisa's Studio",
    bookingLink: true,
    replyWindow: REPLY_WINDOW_WORDS,
    fetchedAt: now.getTime(),
  };
}
