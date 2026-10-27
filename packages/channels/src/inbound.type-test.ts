/**
 * The wires the one inbound shape names are exactly the wires a thread keeps a reply clock for (00484,
 * conversation_channel_state.channel), held the way lines/lines.type-test.ts holds this package's line sets. A wire a
 * message may say that the table refuses would leave its thread with no clock; a wire the table takes that no message
 * may say is a clock nothing writes. No runtime: if this file stops compiling (this package's `tsc --noEmit`), the shape
 * and the table disagree.
 */
import type { Exactly, Holds, SchemaSet } from "@chanlytics/contracts";
import type { InboundMessage } from "./inbound";

export type InboundSchemaAgreement = [
  Holds<Exactly<InboundMessage["channel"], SchemaSet<"conversation_channel_state.channel">>>,
];
