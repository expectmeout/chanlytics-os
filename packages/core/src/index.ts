/**
 * The one place @chanlytics/core's public values are named. tsup builds this file alone and package.json exports only
 * ".", so a name that is not written here cannot be reached from an app. In order: the send door (deliver.ts: deliver,
 * deliverSafely, templatePurpose and the types of what they take and return), the wire senders (wire-senders.ts: the
 * WhatsApp and email Senders, and the errors and guards for a wire that could not be bound and for a send the provider
 * did not take), each domain folder's own index.ts (conversations, messages, campaigns, leads, inbound), then the
 * booking-page reading. html.ts and uuid-v5.ts are core's own helpers and are not exported.
 *
 * Every name is written out. The only export * here is a domain folder's barrel, which itself names what it exports; an
 * export * of a module would add whatever that module exports to the package's surface unseen
 * (tooling/scripts/tests/repo/contracts-barrels.test.mjs holds this for every package). Callers: the dashboard's routes
 * and ports and packages/jobs import "@chanlytics/core", its committed dist; the edge imports the same dist through
 * apps/edge/lib/packages/core.ts, because Vercel's function bundler does not follow pnpm's workspace links. Browser
 * code never imports its values (eslint.config.mjs), and a change here is rebuilt into packages/core/dist.
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
