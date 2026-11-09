import { campaignEnded } from "@chanlytics/contracts";

/**
 * The pace a paced offer keeps today: an offer on a list with a last day, as Ask's plan makes one, at no more than its cap and no
 * more than the open slots a day ahead, as its plan worked it out (contracts capOf), so it slows as the book fills and the first
 * people it told get the slots. A full book sends nothing today. Null for any other playbook, and where no calendar can say.
 */
export function pacedTo(
  p: { until?: string | null; trigger: string; policy_class: string; cap_per_run: number },
  room: { open: number; days: number } | null | undefined,
): { cap: number; full: boolean } | null {
  if (!room || !p.until || p.trigger !== "saved_list" || p.policy_class !== "campaign") return null;
  if (room.open <= 0) return { cap: p.cap_per_run, full: true };
  return { cap: Math.min(p.cap_per_run, Math.ceil(room.open / Math.max(1, room.days))), full: false };
}

/** A run's playbook at its pace (D39 of the answers canvas): a person who asks for a run has decided, and takes none. */
export function pacedRun<P extends Parameters<typeof pacedTo>[0]>(
  playbook: P,
  byPerson: boolean,
  room: Parameters<typeof pacedTo>[1],
): { playbook: P; full: boolean } {
  const paced = byPerson ? null : pacedTo(playbook, room);
  return { playbook: paced ? { ...playbook, cap_per_run: paced.cap } : playbook, full: paced?.full === true };
}

/** Why a campaign runs nothing today, before anything is read: past its last day (00416 `until`), or no room on the book. */
export const notToday = (
  p: Parameters<typeof campaignEnded>[0],
  runFor: string,
  full: boolean,
): "ended" | "no_room" | null => (campaignEnded(p, runFor) ? "ended" : full ? "no_room" : null);
