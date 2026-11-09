/**
 * The change_playbook door in memory, as 00416 writes it and 00462 gives it a sequence's mode, for the suites that run a change in place through the real
 * route over `_fake-db.mjs` (PUT playbooks/:id, Ask's change card, a list's archive and restore, the outbound routes).
 *
 * It refuses what the door refuses, with its code: nothing named, or a key outside the ten (22023); a null for any key
 * but the two dates a null clears (22023); a mode none of the three (22023); no such row in the workspace named (P0002);
 * a mode for a one-off, or Send it for a sequence to leads (23514), with nothing written. Then, of the columns named,
 * only those that differ from the row are written, compared as the door stores them: the slot specs as jsonb, a trial's
 * end as the instant, the rest as they are, and the mode on its sequence's row. What each held is answered as `was`, and
 * the decision is the caller's, its verb following the state that moved. Where nothing differs nothing is written and
 * no line: `was` empty, `decision_id` null (00377's no-op).
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */

/** The ten keys the door takes (00416, 00462's mode), and the two of them a null clears. The door's own list, not core's. */
const DOOR_KEYS = [
  "state",
  "name",
  "run_hour",
  "cap_per_run",
  "gap_days",
  "cadence_days",
  "params",
  "until",
  "trial_until",
  "mode",
];
const CLEARED = ["until", "trial_until"];

/** Whether a value named is what the row holds, as the door compares it. */
const sameAsHeld = (k, v, held) =>
  k === "params"
    ? JSON.stringify(v) === JSON.stringify(held)
    : k === "trial_until" && v !== null && held != null
      ? Date.parse(v) === Date.parse(held)
      : v === (held ?? null);

/** The door's refusal of what it does not take. */
const refused = (message) => Object.assign(new Error(`change_playbook: ${message}`), { code: "22023" });

/** `{ change_playbook }` over `tables` (its playbooks, and its decisions, made where absent), as `user`'s session. */
export function changePlaybookDoor(tables, user) {
  return {
    change_playbook: (a) => {
      const named = Object.entries(a.p_set ?? {});
      if (named.length === 0 || named.some(([k]) => !DOOR_KEYS.includes(k))) throw refused("name what changes");
      if (named.some(([k, v]) => v === null && !CLEARED.includes(k)))
        throw refused("name a value for each column named: only until and trial_until may be cleared");
      if (named.some(([k, v]) => k === "params" && !Array.isArray(v)))
        throw refused("params is the message's slots, an array");
      const mode = a.p_set?.mode;
      if (mode !== undefined && !["auto", "veto", "ask"].includes(mode)) throw refused("mode is auto, veto or ask");
      const row = (tables.playbooks ?? []).find((p) => p.id === a.p_playbook_id && p.tenant_id === a.p_tenant_id);
      if (!row) throw Object.assign(new Error("Playbook not found."), { code: "P0002" });
      // Its sequence's mode (00462): a one-off has none, and a sequence to leads never sends on its own.
      const sequence = (tables.sequences ?? []).find((q) => q.id === row.sequence_id && q.tenant_id === a.p_tenant_id);
      if (mode !== undefined && (sequence?.mode ?? null) === null)
        throw Object.assign(new Error("A one-off goes as it was sent: it has no mode."), { code: "23514" });
      if (mode === "auto" && row.kind === "reach_out")
        throw Object.assign(new Error("A sequence to leads never sends on its own."), { code: "23514" });
      const set = Object.fromEntries(named.filter(([k, v]) => k !== "mode" && !sameAsHeld(k, v, row[k])));
      const modeMoves = mode !== undefined && mode !== sequence.mode;
      if (Object.keys(set).length === 0 && !modeMoves)
        return { id: row.id, was: {}, decision_id: null, undo_dropped: false };
      const was = {
        ...Object.fromEntries(Object.keys(set).map((k) => [k, row[k] ?? null])),
        ...(modeMoves ? { mode: sequence.mode } : {}),
      };
      Object.assign(row, set);
      if (modeMoves) sequence.mode = mode;
      const decisions = (tables.decisions ??= []);
      const verb =
        set.state === "running" ? "start_playbook" : set.state === "paused" ? "pause_playbook" : "change_playbook";
      const decision = {
        id: `decision-${decisions.length + 1}`,
        tenant_id: a.p_tenant_id,
        subject_type: "playbook",
        subject_id: row.id,
        verb,
        actor_type: "user",
        actor_user_id: user,
        payload: { ...(a.p_decision ?? {}), ...(a.p_via ? { via: a.p_via } : {}) },
        undo_of: a.p_undo_of ?? null,
      };
      decisions.push(decision);
      return { id: row.id, was, decision_id: decision.id, undo_dropped: false };
    },
  };
}
