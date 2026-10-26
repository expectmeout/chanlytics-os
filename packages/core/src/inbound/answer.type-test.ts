/**
 * A message in the one inbound shape says its own wire, and the carrier handed in beside it is that wire's (answer.ts
 * InboundInput, decision 0001 step 2): none with a WhatsApp message, the line's with a text. The verb takes its channel
 * from the carrier, as it always has, so a text handed in with no carrier would be read as WhatsApp, and a WhatsApp
 * message handed in with a line's carrier would be held, footed and sent as a text. Here neither compiles. Today's shape
 * is taken as it was: a normalised message and its raw fields, with a carrier or none.
 *
 * A type test: the positives are `Holds<Within<…>>` (contracts' schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * package's `tsc --noEmit` fails. Nothing imports this file, so no build reaches it.
 */
import type { Holds, Within } from "@chanlytics/contracts";
import type { InboundMessage, NormalizedInbound } from "@chanlytics/channels";
import type { InboundCarrier, InboundInput, InboundRaw } from "./answer";

type At = { tenantId: string; routed: null; isEnvDefault: false };
type OnWhatsapp = InboundMessage & { channel: "whatsapp" };
type OnText = InboundMessage & { channel: "sms" };

type _Shapes = [
  // Today's shape, with a carrier or none, as the doors hand it over until step 3.
  Holds<Within<At & { message: NormalizedInbound; raw: InboundRaw; carrier: null }, InboundInput>>,
  Holds<Within<At & { message: NormalizedInbound; raw: InboundRaw; carrier: InboundCarrier }, InboundInput>>,
  // The one shape, each wire with its own carrier.
  Holds<Within<At & { inbound: OnWhatsapp; carrier: null }, InboundInput>>,
  Holds<Within<At & { inbound: OnText; carrier: InboundCarrier }, InboundInput>>,
  // @ts-expect-error a text with no carrier would be answered as WhatsApp, on the workspace's WhatsApp number
  Holds<Within<At & { inbound: OnText; carrier: null }, InboundInput>>,
  // @ts-expect-error a WhatsApp message with a line's carrier would be held, footed and sent as a text
  Holds<Within<At & { inbound: OnWhatsapp; carrier: InboundCarrier }, InboundInput>>,
  // @ts-expect-error an email has no road through the verb yet: it joins at step 6, in draft mode
  Holds<Within<At & { inbound: InboundMessage & { channel: "email" }; carrier: null }, InboundInput>>,
];
