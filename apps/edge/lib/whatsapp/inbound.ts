/**
 * The doors' adapter onto the receptionist.
 *
 * The message path itself -- persist, the memory, the gates in order, the
 * brain, layer two, the hold window -- is answerInbound in
 * packages/core/src/inbound/answer.ts, a verb over ports. This file is what
 * the edge brings to it: the real modules behind ./ports.ts.
 *
 * Each door makes its message into the one inbound shape with its own wire's adapter (decision 0001, step 3): the
 * WhatsApp webhook with inboundFromWhatsapp (lib/whatsapp/answer-later.ts), a text's door with inboundFromSms
 * (lib/sms/inbound-text.ts), the Instagram webhook with inboundFromInstagram (lib/instagram/dm-answer.ts). So a message
 * reaches the verb as what it is, with the carrier of its own wire: none for WhatsApp, the line's for a text, the
 * account's for a DM, which is recorded by its door and answered by its job as a text is (recordDmInbound, resumeDmInbound). A text is answered after its acknowledgement (decision 0031, Phase 2): its door records
 * it through recordInboundMessage, and its job answers it through resumeInbound. A WhatsApp message is too, for the
 * workspaces the edge names (Phase 3, lib/whatsapp/answer-later.ts): recordWhatsappInbound, then resumeWhatsappInbound.
 */
import type { InboundMessage } from "../packages/channels.js";
import type { IngestResult, RoutedChannel } from "../packages/db.js";
import { answerInbound, recordInbound, type InboundCarrier } from "../packages/core.js";
import { corePorts, realPorts, type InboundPorts } from "./ports.js";

/** A WhatsApp message in the one shape, as inboundFromWhatsapp makes it. */
type OnWhatsapp = InboundMessage & { channel: "whatsapp" };
/** A text in the one shape, as inboundFromSms makes it. */
type OnText = InboundMessage & { channel: "sms" };
/** An Instagram DM in the one shape, as inboundFromInstagram makes it. */
type OnInstagram = InboundMessage & { channel: "instagram" };

/**
 * A message answered here, in its door's request (the WhatsApp webhook's own road), with its own wire's carrier: none
 * for WhatsApp, the line's for a text.
 */
export async function handleInbound(
  arrival: { inbound: OnWhatsapp; carrier: null } | { inbound: OnText; carrier: InboundCarrier<"sms"> },
  tenantId: string | null,
  routed: RoutedChannel | null,
  isEnvDefault: boolean,
  /** Everything outside the verb: the real modules unless a test says otherwise (./ports.ts). */
  ports: InboundPorts = realPorts(),
): Promise<void> {
  return answerInbound({ ...arrival, tenantId, routed, isEnvDefault }, corePorts(ports));
}

/**
 * A text taken up again after its acknowledgement (lib/sms/inbound-text.ts: its job, or the door when its job could not
 * be written): its door recorded it, so its ingest is a redelivery, and core answers it while it is unprocessed and no
 * reply names it (answerInbound with `resume`).
 */
export async function resumeInbound(
  inbound: OnText,
  tenantId: string,
  routed: RoutedChannel,
  carrier: InboundCarrier<"sms">,
  ports: InboundPorts = realPorts(),
): Promise<void> {
  return answerInbound({ inbound, carrier, tenantId, routed, isEnvDefault: false, resume: true }, corePorts(ports));
}

/**
 * The door's half of a text answered after its acknowledgement (core recordInbound): the message recorded, or set
 * aside, and nothing answered. The ingest's row when it waits for its answer; null when it was set aside, is a
 * redelivery, or there is nowhere to record it. Throws IngestFailed when the write failed.
 */
export async function recordInboundMessage(
  inbound: OnText,
  tenantId: string,
  routed: RoutedChannel,
  carrier: InboundCarrier<"sms">,
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  return recordInbound({ inbound, carrier, tenantId, routed, isEnvDefault: false }, corePorts(ports));
}

/**
 * The door's half of an Instagram DM (lib/instagram/webhook.ts): recorded, or set aside, and nothing answered; its job
 * answers it (resumeDmInbound). The ingest's row when it waits for its answer; null when it was set aside, is a
 * redelivery, or there is nowhere to record it. Throws IngestFailed when the write failed, which the door answers 503.
 */
export async function recordDmInbound(
  inbound: OnInstagram,
  routed: RoutedChannel,
  carrier: InboundCarrier<"instagram">,
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  return recordInbound({ inbound, carrier, tenantId: routed.tenantId, routed, isEnvDefault: false }, corePorts(ports));
}

/**
 * An Instagram DM taken up by its job: its door recorded it, so its ingest is a redelivery, and core answers it while it
 * is unprocessed and no reply names it (answerInbound with `resume`). The carrier's sender marks the job as having spoken
 * before Instagram is called.
 */
export async function resumeDmInbound(
  inbound: OnInstagram,
  routed: RoutedChannel,
  carrier: InboundCarrier<"instagram">,
  ports: InboundPorts = realPorts(),
): Promise<void> {
  return answerInbound(
    { inbound, carrier, tenantId: routed.tenantId, routed, isEnvDefault: false, resume: true },
    corePorts(ports),
  );
}

/**
 * The door's half of a WhatsApp message answered after its acknowledgement (lib/whatsapp/answer-later.ts): the message
 * recorded, or set aside, and nothing answered. The ingest's row when it waits for its answer; null when it was set
 * aside, is a redelivery, or there is nowhere to record it. Throws IngestFailed when the write failed.
 */
export async function recordWhatsappInbound(
  inbound: OnWhatsapp,
  routed: RoutedChannel,
  isEnvDefault: boolean,
  ports: InboundPorts = realPorts(),
): Promise<IngestResult | null> {
  return recordInbound({ inbound, carrier: null, tenantId: routed.tenantId, routed, isEnvDefault }, corePorts(ports));
}

/**
 * A WhatsApp message taken up again by its job: its door recorded it, so its ingest is a redelivery, and core answers
 * it while it is unprocessed and no reply names it (answerInbound with `resume`). The job hands in its own ports,
 * whose sender marks the job as having spoken before Meta is called.
 */
export async function resumeWhatsappInbound(
  inbound: OnWhatsapp,
  routed: RoutedChannel,
  isEnvDefault: boolean,
  ports: InboundPorts,
): Promise<void> {
  return answerInbound(
    { inbound, carrier: null, tenantId: routed.tenantId, routed, isEnvDefault, resume: true },
    corePorts(ports),
  );
}
