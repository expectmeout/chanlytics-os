/**
 * The WhatsApp door's adapter onto the receptionist.
 *
 * The message path itself -- persist, the memory, the gates in order, the
 * brain, layer two, the hold window -- is answerInbound in
 * packages/core/src/inbound/answer.ts, a verb over ports. This file is what
 * the edge brings to it: Meta's own shapes, normalised here at the boundary,
 * and the real modules behind ./ports.ts.
 *
 * The signature is unchanged, deliberately, but for one trailing argument. The WhatsApp door (api/whatsapp.ts) calls
 * it exactly as it did, tooling/scripts/ops/golden-edge.mjs sees the same surface, and the tests that inject a world
 * through setInboundPorts hand in the same object they always have. A text is answered after its acknowledgement
 * (decision 0031, Phase 2): its door records it through recordInboundMessage and a job answers it here with `resume`.
 */
import { normalizeInbound, withCarrierConsent, type WaChangeValue, type WaRawMessage } from "../packages/channels.js";
import type { IngestResult, RoutedChannel } from "../packages/db.js";
import { answerInbound, recordInbound, type InboundCarrier } from "../packages/core.js";
import { corePorts, realPorts, type InboundPorts } from "./ports.js";

/**
 * A channel other than WhatsApp riding the same road: how a reply goes out,
 * what the words become on its wire, and whether every message is held for a
 * person for now. It travels with the verb (packages/core inbound/answer.ts);
 * re-exported here because the SMS ingress names it by this module.
 */
export type { InboundCarrier };

export async function handleInbound(
  m: WaRawMessage,
  value: WaChangeValue,
  tenantId: string | null,
  routed: RoutedChannel | null,
  isEnvDefault: boolean,
  carrier: InboundCarrier | null = null,
  /** Everything outside the verb: the real modules unless a test says otherwise (./ports.ts). */
  ports: InboundPorts = realPorts(),
  /** A text taken up again after its acknowledgement (lib/sms/inbound-text.ts answerText): its door recorded it. */
  resume = false,
): Promise<void> {
  return answerInbound({ ...inputOf(m, value, tenantId, routed, isEnvDefault, carrier), resume }, corePorts(ports));
}

/**
 * The door's half of a text answered after its acknowledgement (core recordInbound): the message recorded, or set
 * aside, and nothing answered. The ingest's row when it waits for its answer; null when it was set aside, is a
 * redelivery, or there is nowhere to record it. Throws IngestFailed when the write failed.
 */
export async function recordInboundMessage(
  m: WaRawMessage,
  tenantId: string,
  routed: RoutedChannel,
  carrier: InboundCarrier,
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  return recordInbound(inputOf(m, {}, tenantId, routed, false, carrier), corePorts(ports));
}

function inputOf(
  m: WaRawMessage,
  value: WaChangeValue,
  tenantId: string | null,
  routed: RoutedChannel | null,
  isEnvDefault: boolean,
  carrier: InboundCarrier | null,
) {
  return {
    message: withCarrierConsent(normalizeInbound(m, value), carrier?.consent ?? null),
    // The raw fields the body still reads: the id and the sender for the log
    // envelope and the wire, the provider's own type for the words an owner
    // reads, and its timestamp for the staleness check.
    raw: { id: m.id, from: m.from, type: m.type, timestamp: m.timestamp ?? null },
    tenantId,
    routed,
    isEnvDefault,
    carrier,
  };
}
