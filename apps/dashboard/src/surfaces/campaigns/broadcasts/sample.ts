/**
 * The demo's Broadcasts: a sample business's sends and audiences, passed through the same contracts functions a real
 * workspace's go through (the broadcast view model, the number's health, the words for a held reason), so a demo session
 * draws the one Broadcasts page there is. Three broadcasts (one sent, one scheduled, one waiting for its owner) and three
 * audiences over the approved starters. Deterministic: the same moment is the same page. Nothing counted here is a
 * customer's: the twin it replaces was the mockup's own page, with its own invented campaigns and figures.
 */
import {
  BROADCAST_CHUNK,
  BROADCAST_SCHEDULE_MAX_DAYS,
  DAY_MS,
  EVERYONE_LABEL,
  GET_YES_ROUTE,
  HELD_REASONS,
  HOUR_MS,
  OFFERS_BY_WHATSAPP_NOTE,
  OFFERS_OPT_IN_PHRASES,
  REPLY_WINDOW_WORDS,
  numberHealth,
  purposeOfTemplate,
  starterByKey,
  starterText,
  toBroadcastVM,
  type AudiencePreview,
  type BroadcastDto,
} from "@chanlytics/contracts";
import type { AudienceOption, BroadcastTemplate, BroadcastsSurface } from "./surface";

const ZONE = "America/New_York";

const DAY = DAY_MS;

/** A starter as WhatsApp holds it once approved, with the consent a send of it needs. */
function approved(key: string, syncedAt: string): BroadcastTemplate {
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
  };
}

/** Who a send to an audience opens on: a few of them, and how many it reaches and holds back. */
function preview(sending: number, held: number, names: string[]): AudiencePreview {
  return {
    people: names.map((n, i) => ({ id: `p-sample-${i}`, label: n, firstName: n.split(" ")[0] ?? null, refusal: null })),
    sending,
    held,
    saidYes: sending,
    heard: 0,
  };
}

/** One audience: its two counts (by the consent a message and an offer each need) and the people its preview names. */
function audience(
  which: { kind: AudienceOption["kind"]; id: string | null; label: string; hint: string },
  sending: number,
) {
  const { kind, id, label, hint } = which;
  const names = ["Ana Ruiz", "Ben Carter", "Chloe Park"];
  const messages = preview(sending + 2, 0, names);
  const offers = preview(sending, 2, names);
  return {
    kind,
    id,
    label,
    hint,
    counts: { conversational: messages.sending, marketing: offers.sending },
    preview: { conversational: messages, marketing: offers },
  };
}

/** The demo's Broadcasts as of `now`: what `useSurface("broadcasts")` answers for a workspace that has read its own. */
export function broadcastsSample(now = new Date()): BroadcastsSurface {
  const iso = (ms: number) => new Date(now.getTime() + ms).toISOString();
  const day = (ms: number) => iso(ms).slice(0, 10);
  const dto = (
    id: string,
    name: string,
    over: Partial<BroadcastDto>,
    counts: Partial<BroadcastDto["counts"]> = {},
  ): BroadcastDto => ({
    id,
    name,
    template_id: "tpl-quick_note",
    template_name: "quick_note",
    template_language: "en_US",
    params: [{ kind: "first_name" }],
    audience: { kind: "everyone", id: null, label: EVERYONE_LABEL },
    state: "sent",
    scheduled_for: iso(-3 * DAY),
    started_at: iso(-3 * DAY),
    finished_at: iso(-3 * DAY + 120_000),
    recipient_count: 18,
    failure: null,
    created_at: iso(-4 * DAY),
    playbook_id: null,
    run_for: null,
    counts: { queued: 0, sent: 18, skipped: 0, failed: 0, delivered: 17, read: 11, replied: 3, ...counts },
    ...over,
  });
  const rows = [
    dto("b-sample-2", `Welcome · ${day(0)}`, {
      template_id: "tpl-monthly_offer",
      template_name: "monthly_offer",
      audience: { kind: "playbook", id: "pb-sample-welcome", label: "Welcome" },
      state: "pending_approval",
      scheduled_for: iso(2 * HOUR_MS),
      started_at: null,
      finished_at: null,
      recipient_count: 4,
      playbook_id: "pb-sample-welcome",
      run_for: day(0),
      counts: { queued: 4, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 },
    }),
    dto("b-sample-3", "Autumn hours", {
      state: "scheduled",
      scheduled_for: iso(2 * DAY),
      started_at: null,
      finished_at: null,
      recipient_count: 22,
      counts: { queued: 22, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 },
    }),
    dto("b-sample-1", "A quick note", {}),
  ].map((d) => toBroadcastVM(d, ZONE, now));
  return {
    rows,
    templates: ["quick_note", "monthly_offer", "winback_offer"].map((key) => approved(key, iso(-7 * DAY))),
    listsRead: true,
    audiences: [
      audience(
        {
          kind: "everyone",
          id: null,
          label: EVERYONE_LABEL,
          hint: "Everyone with a number whose yes covers the message you pick",
        },
        22,
      ),
      audience(
        {
          kind: "saved",
          id: "s-sample-regulars",
          label: "Regulars",
          hint: "A list kept by hand — of those whose yes covers this message",
        },
        9,
      ),
      audience(
        {
          kind: "saved",
          id: "s-sample-new",
          label: "New this month",
          hint: "A list that keeps itself current — of those whose yes covers this message",
        },
        5,
      ),
    ],
    number: {
      present: true,
      display: "+1 305-555-0100",
      health: numberHealth({ quality: "GREEN", event: null, limit: "TIER_1K" }),
    },
    heldReasons: HELD_REASONS,
    chunk: BROADCAST_CHUNK,
    replyWindow: REPLY_WINDOW_WORDS,
    optIn: {
      phrase: OFFERS_OPT_IN_PHRASES.en,
      phraseEs: OFFERS_OPT_IN_PHRASES.es,
      link: "https://wa.me/13055550100?text=YES",
      qrPath: null,
      pageUrl: null,
    },
    getYes: GET_YES_ROUTE,
    businessName: "Marisa's Studio",
    bookingLink: true,
    offersNote: OFFERS_BY_WHATSAPP_NOTE,
    more: false,
    scheduleMaxDays: BROADCAST_SCHEDULE_MAX_DAYS,
    fetchedAt: now.getTime(),
  };
}
