/**
 * A message reaches the verb in the one inbound shape, saying its own wire, and the carrier handed in beside it is that
 * wire's (answer.ts InboundInput, decision 0001): none with a WhatsApp message, the line's with a text, the account's
 * with an Instagram DM (step 8). The verb takes its channel from the carrier, so a text handed in with no carrier would be
 * read as WhatsApp, a WhatsApp message handed in with a line's carrier would be held, footed and sent as a text, and a DM
 * handed a line's carrier would be answered by text to an Instagram id. Here none of them compiles, and neither does the
 * shape the doors handed over before step 3: WhatsApp's normalised message with the raw fields beside it.
 *
 * A type test: the positives are `Holds<Within<…>>` (contracts' schema-sets.ts), and each line under
 * `@ts-expect-error <why>` must not compile. One that starts to compile is TS2578, an unused directive, so the
 * package's `tsc --noEmit` fails. Nothing imports this file, so no build reaches it.
 */
import type { Holds, Within } from "@chanlytics/contracts";
import type { InboundMessage, NormalizedInbound } from "@chanlytics/channels";
import type { InboundCarrier, InboundInput } from "./answer";

type At = { tenantId: string; routed: null; isEnvDefault: false };
type OnWhatsapp = InboundMessage & { channel: "whatsapp" };
type OnText = InboundMessage & { channel: "sms" };
type OnInstagram = InboundMessage & { channel: "instagram" };
/** The raw fields the verb read beside a normalised message before step 3. */
type Raw = { id: string; from: string; type: string; timestamp: string | number | null };

type _Shapes = [
  // The one shape, each wire with its own carrier.
  Holds<Within<At & { inbound: OnWhatsapp; carrier: null }, InboundInput>>,
  Holds<Within<At & { inbound: OnText; carrier: InboundCarrier<"sms"> }, InboundInput>>,
  Holds<Within<At & { inbound: OnInstagram; carrier: InboundCarrier<"instagram"> }, InboundInput>>,
  // @ts-expect-error a text with no carrier would be answered as WhatsApp, on the workspace's WhatsApp number
  Holds<Within<At & { inbound: OnText; carrier: null }, InboundInput>>,
  // @ts-expect-error a WhatsApp message with a line's carrier would be held, footed and sent as a text
  Holds<Within<At & { inbound: OnWhatsapp; carrier: InboundCarrier<"sms"> }, InboundInput>>,
  // @ts-expect-error a DM with a line's carrier would be answered by text, to an Instagram id
  Holds<Within<At & { inbound: OnInstagram; carrier: InboundCarrier<"sms"> }, InboundInput>>,
  // @ts-expect-error a DM with no carrier would be answered on the workspace's WhatsApp number
  Holds<Within<At & { inbound: OnInstagram; carrier: null }, InboundInput>>,
  // @ts-expect-error a text with the account's carrier would be sent as a DM
  Holds<Within<At & { inbound: OnText; carrier: InboundCarrier<"instagram"> }, InboundInput>>,
  // @ts-expect-error an email has no road through the verb yet: it joins at step 6, in draft mode
  Holds<Within<At & { inbound: InboundMessage & { channel: "email" }; carrier: null }, InboundInput>>,
  // @ts-expect-error WhatsApp's own shape is the WhatsApp adapter's alone: no door hands it to the verb since step 3
  Holds<Within<At & { message: NormalizedInbound; raw: Raw; carrier: null }, InboundInput>>,
];
