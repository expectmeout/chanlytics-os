/**
 * Every public name, named: the send door and the booking page here, each domain in its own index.ts, never an
 * export * of a module (repo/contracts-barrels.test.mjs holds every package's).
 */
export { deliver, templatePurpose, deliverSafely } from "./deliver";
export {
  whatsappSender,
  whatsappWire,
  emailSender,
  wireUnavailable,
  isWireUnavailable,
  isWireUnavailableError,
  WireUnavailableError,
  isNotTakenError,
  NotTakenError,
} from "./wire-senders";
export type { EmailRoute, CredentialsRead, WireUnavailable } from "./wire-senders";
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
} from "./deliver";
export * from "./conversations";
export * from "./messages";
export * from "./campaigns";
export * from "./leads";
export * from "./inbound";
export { bookingPageLinkedFrom } from "./booking-page";
