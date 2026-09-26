/**
 * Every public name, named: the send door and the booking page here, each domain in its own index.ts, never an
 * export * of a module (repo/contracts-barrels.test.mjs holds every package's).
 */
export {
  deliver,
  templatePurpose,
  deliverSafely,
  wireUnavailable,
  isWireUnavailable,
  isWireUnavailableError,
  WireUnavailableError,
} from "./deliver";
export { whatsappSender, whatsappWire, emailSender } from "./wire-senders";
export type { EmailRoute } from "./wire-senders";
export type {
  DeliveryRefusal,
  Db,
  Channel,
  SendKind,
  TemplateSend,
  WirePayload,
  Sender,
  Wire,
  Delivery,
  Delivered,
  DeliverPorts,
  CredentialsRead,
  WireUnavailable,
} from "./deliver";
export * from "./conversations";
export * from "./messages";
export * from "./campaigns";
export * from "./leads";
export * from "./inbound";
export { bookingPageLinkedFrom } from "./booking-page";
