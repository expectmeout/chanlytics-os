/**
 * The workspace's cards: what the receptionist may do alone, the settings it follows, and who is on the team.
 */
import { ASK_ANSWERS_ROWS, applySettingsChange, type AskSettingsChange } from "../ask/ask-settings-change";
import { asText, rec, refuseWith, type ProposalSpec, type ProposalSpecAboveOperator } from "./spec";

const policyBody = (cls: unknown, mode: unknown, confidence: unknown): Record<string, unknown> => {
  const body: Record<string, unknown> = { class: cls };
  if (mode) body.mode = mode;
  if (typeof confidence === "number") body.minConfidence = confidence;
  return body;
};

export const policySpec: ProposalSpec = {
  needs: "operator",
  gate: "autonomy",
  commit: (p) => ({
    route: "PUT policies",
    body: policyBody(p.payload.class, p.payload.mode, p.payload.min_confidence),
  }),
  receipt: (p) => `Autonomy changed: ${p.summary}`,
  undo: {
    label: () => "Set it back",
    window: "ten_minutes",
    // The events ledger keeps policy changes and hands back no row id, so this undo names none.
    // The row as the route found it when it wrote (its answer's `was`), the card's own reading where an older route
    // answers none.
    record: (p, data) => {
      const found = rec(data).was;
      const prev = (found && typeof found === "object" ? found : (p.payload.previous ?? {})) as {
        mode?: string | null;
        min_confidence?: number | null;
      };
      return { class: p.payload.class, mode: prev.mode ?? null, min_confidence: prev.min_confidence ?? null };
    },
    call: (u) =>
      !u.mode && typeof u.min_confidence !== "number"
        ? refuseWith("The previous setting is unknown; change it in Settings.")
        : { route: "PUT policies", body: policyBody(u.class, u.mode, u.min_confidence) },
    receipt: () => "Set back",
  },
  open: () => "admin/autonomy",
};

export const settingsSpec: ProposalSpecAboveOperator = {
  needs: "partner",
  doing: "change the workspace's settings",
  gate: "settings",
  commit: (p, tab) => {
    const st = tab.settings;
    if (!st || !st.config || typeof st.version !== "number")
      return refuseWith("Settings are not loaded yet — open Settings once and try again.");
    const config = applySettingsChange(
      st.config as Parameters<typeof applySettingsChange>[0],
      p.payload.change as Parameters<typeof applySettingsChange>[1],
    );
    return { route: "PUT settings", body: { config, version: st.version } };
  },
  receipt: (p) => p.summary,
  undo: {
    label: () => "Put the previous settings back",
    window: "version",
    // The whole config as it was before, and the version this save wrote: restoring it is safe only while that is
    // still the version loaded.
    record: (_p, data, tab) => ({ config: tab.settings?.config, version_after: rec(data).version }),
    call: (u, tab) => {
      const version = tab.settings?.version;
      if (typeof version !== "number") return refuseWith("Settings are not loaded yet.");
      if (typeof u.version_after !== "number" || version !== u.version_after)
        return refuseWith("Settings have changed since this card — change them in Settings.");
      return { route: "PUT settings", body: { config: u.config, version } };
    },
    receipt: () => "Previous settings are back",
  },
  // A change to How it answers opens there, on its row (the Settings wiring review, item 14); the rest on Details.
  open: (p) => {
    const op = (p.payload.change as AskSettingsChange | undefined)?.op;
    if (!op || !(op in ASK_ANSWERS_ROWS)) return "admin/workspace";
    const row = ASK_ANSWERS_ROWS[op as keyof typeof ASK_ANSWERS_ROWS];
    return row ? `admin/receptionist/${row}` : "admin/receptionist";
  },
};

export const inviteSpec: ProposalSpecAboveOperator = {
  needs: "owner",
  doing: "invite someone to the team",
  gate: "team",
  commit: (p) => ({ route: "POST team/invite", body: { email: asText(p.payload.email), role: p.payload.role } }),
  receipt: (p) => `Invited ${asText(p.payload.email)} as ${asText(p.payload.role)}`,
  open: () => null,
};
