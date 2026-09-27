/** Broadcasts: a run waiting for a word, one under the veto window, one that went out this morning; two more when busy. */
import { toBroadcastVM, type BroadcastDto, type BroadcastVM } from "@chanlytics/contracts";
import { ZONE, type SampleClock, type SampleDay } from "./clock";

function broadcastDtos({ ago, today }: SampleClock, day: SampleDay): BroadcastDto[] {
  const broadcast = (
    id: string,
    name: string,
    label: string,
    state: BroadcastDto["state"],
    recipient_count: number,
    over: Partial<BroadcastDto> = {},
  ): BroadcastDto => ({
    id,
    name,
    template_id: "t-1",
    template_name: "quick_note",
    template_language: "en",
    params: [],
    audience: { kind: "playbook", id: "pb-1", label },
    state,
    scheduled_for: ago(-120),
    started_at: null,
    finished_at: null,
    recipient_count,
    failure: null,
    created_at: ago(180),
    playbook_id: "pb-1",
    run_for: today,
    counts: { queued: recipient_count, sent: 0, skipped: 0, failed: 0, delivered: 0, read: 0, replied: 0 },
    ...over,
  });
  return [
    broadcast("b-winback", `Win-back · ${today}`, "Win-back", "pending_approval", 6, {
      playbook_id: "pb-quiet",
      audience: { kind: "playbook", id: "pb-quiet", label: "Win-back" },
    }),
    broadcast("b-visit", `Visit reminder · ${today}`, "Visit reminder", "scheduled", 3, {
      playbook_id: "pb-visit",
      audience: { kind: "playbook", id: "pb-visit", label: "Visit reminder" },
      scheduled_for: ago(-90),
    }),
    broadcast("b-number", "Save our number", "Everyone who said yes", "sent", 8, {
      playbook_id: null,
      audience: { kind: "everyone", id: null, label: "Everyone who said yes" },
      scheduled_for: ago(185),
      started_at: ago(180),
      finished_at: ago(178),
      counts: { queued: 0, sent: 8, skipped: 0, failed: 0, delivered: 8, read: 5, replied: 1 },
    }),
    ...(day === "busy"
      ? [
          broadcast("b-birthday", `Birthday offer · ${today}`, "Birthday offer", "pending_approval", 4, {
            playbook_id: "pb-birthday",
            audience: { kind: "playbook", id: "pb-birthday", label: "Birthday offer" },
          }),
          broadcast("b-after", `After the visit · ${today}`, "After the visit", "scheduled", 5, {
            playbook_id: "pb-after",
            audience: { kind: "playbook", id: "pb-after", label: "After the visit" },
            scheduled_for: ago(-240),
          }),
        ]
      : []),
  ];
}

/** The Broadcasts surface as the page reads it: each run through its view model. */
export function sampleBroadcasts(clock: SampleClock, day: SampleDay): { rows: BroadcastVM[] } {
  return { rows: broadcastDtos(clock, day).map((b) => toBroadcastVM(b, ZONE, clock.now)) };
}
