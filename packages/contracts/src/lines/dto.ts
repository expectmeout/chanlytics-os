/**
 * A line as the page may see it (setup.ts LineDto), built from its row in one place. The dashboard's read of the lines
 * (server/connections/lines.ts) and the edge's verb answers (lib/lines/lines.ts) each built it by hand: the read said a
 * forwarded line's facts and never whether it was registered, a verb's answer the other way round, so a line the page
 * was handed back by a verb lost where its calls go until the next read.
 *
 * Neither side's row is a provider id: `registered` is said by the side that holds the brand and the campaign, the edge,
 * and left out by the one that may not select them.
 */
import type { LineDto } from "../setup/lines";

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
  const item = facts as Record<string, unknown>;
  const str = (k: string) => (typeof item[k] === "string" ? item[k] : null);
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
export function lineDtoOf(lineFacts: LineFacts, registered?: boolean): LineDto {
  return {
    id: lineFacts.id,
    e164: lineFacts.e164,
    kind: lineFacts.kind,
    provider: lineFacts.provider,
    area_code: lineFacts.area_code,
    voice_state: lineFacts.voice_state as LineDto["voice_state"],
    sms_state: lineFacts.sms_state,
    reg_step: lineFacts.reg_step,
    reg_mock: lineFacts.reg_mock,
    reg_sole_prop: lineFacts.reg_sole_prop,
    ...(registered === undefined ? {} : { registered }),
    whatsapp_state: lineFacts.whatsapp_state,
    port_state: lineFacts.port_state,
    forwarding_state: lineFacts.forwarding_state,
    step: lineFacts.step,
    last_error: lineFacts.last_error,
    state_since: lineFacts.state_since,
    created_at: lineFacts.created_at,
    forwarding: forwardingOf(lineFacts.kind, lineFacts.facts),
  };
}
