/**
 * A line as the page may see it (setup.ts LineDto), built from its row in one place. The dashboard's read of the lines
 * (server/connections/lines.ts) and the edge's verb answers (lib/lines/lines.ts) each built it by hand: the read said a
 * forwarded line's facts and never whether it was registered, a verb's answer the other way round, so a line the page
 * was handed back by a verb lost where its calls go until the next read.
 *
 * Neither side's row is a provider id: `registered` is said by the side that holds the brand and the campaign, the edge,
 * and left out by the one that may not select them.
 */
import type { LineDto } from "../setup/setup";

/** The columns of a line the page may see (lines, the member's policy): no SID, no credential, no agent. */
export interface LineFacts {
  id: string;
  e164: string | null;
  kind: string;
  provider: string;
  area_code: number | null;
  voice_state: string;
  sms_state: string;
  reg_step: string | null;
  reg_mock: boolean;
  reg_sole_prop: boolean;
  whatsapp_state: string;
  port_state: string;
  forwarding_state: string;
  step: string | null;
  last_error: string | null;
  state_since: string;
  created_at: string;
  /** What the line keeps of itself; a forwarded line's are its carrier, its mode and where its calls go. */
  facts: unknown;
}

/** A forwarded line's facts, in words only: never a provider id from a provisioned line's facts. */
function forwardingOf(kind: string, facts: unknown): LineDto["forwarding"] {
  if (kind !== "forwarded" || !facts || typeof facts !== "object" || Array.isArray(facts)) return null;
  const f = facts as Record<string, unknown>;
  const str = (k: string) => (typeof f[k] === "string" ? f[k] : null);
  return {
    carrier: str("carrier") ?? "other",
    mode: str("mode") ?? "unanswered",
    destination_e164: str("destination_e164"),
    test_until: str("test_until"),
    verified_at: str("verified_at"),
  };
}

/**
 * The line the page is told of. `registered`, when the caller holds the brand and the campaign (the edge), says both
 * are on record; anything the page decides must be decidable without it, from reg_mock, reg_sole_prop and sms_state.
 */
export function lineDtoOf(r: LineFacts, registered?: boolean): LineDto {
  return {
    id: r.id,
    e164: r.e164,
    kind: r.kind,
    provider: r.provider,
    area_code: r.area_code,
    voice_state: r.voice_state as LineDto["voice_state"],
    sms_state: r.sms_state,
    reg_step: r.reg_step,
    reg_mock: r.reg_mock,
    reg_sole_prop: r.reg_sole_prop,
    ...(registered === undefined ? {} : { registered }),
    whatsapp_state: r.whatsapp_state,
    port_state: r.port_state,
    forwarding_state: r.forwarding_state,
    step: r.step,
    last_error: r.last_error,
    state_since: r.state_since,
    created_at: r.created_at,
    forwarding: forwardingOf(r.kind, r.facts),
  };
}
