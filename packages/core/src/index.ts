/**
 * The one place @chanlytics/core's public values are named. package.json exports only ".", so a name that is not
 * written here cannot be reached from an app. What it names: the send door (deliver.ts: deliver, deliverSafely,
 * templatePurpose and the types of what they take and return; deliver-text.ts: what it holds a text to, which a call
 * asks before it offers one), the wire senders (wire-senders.ts: the WhatsApp and email Senders, and the errors and
 * guards for a wire that could not be bound and for a send the provider did not take), each domain folder's own
 * index.ts (appointments, campaigns, conversations, inbound, leads, messages), the booking page's and the site's
 * pages' readings, and the subscribers. html.ts and uuid-v5.ts are core's own helpers and are not exported. The lines
 * are in the order tooling/scripts/gen/sorted-lists.mjs writes (decision 0074).
 *
 * Every name is written out. The only export * here is a domain folder's barrel, which itself names what it exports; an
 * export * of a module would add whatever that module exports to the package's surface unseen
 * (tooling/scripts/tests/repo/contracts-barrels.test.mjs holds this for every package). Callers: the dashboard's routes
 * and ports, packages/jobs and the edge import "@chanlytics/core", its sources, and each app bundles them itself (the
 * edge through apps/edge/lib/packages/core.ts). Browser code never imports its values (eslint.config.mjs).
 */
export * from "./appointments";
export { bookingPageLinkedFrom } from "./booking-page";
export * from "./campaigns";
export * from "./conversations";
export { deliver, deliverSafely, templatePurpose } from "./deliver";
export type {
  Channel,
  Db,
  Delivered,
  DeliverPorts,
  Delivery,
  DeliveryRefusal,
  Sender,
  SendKind,
  TemplateSend,
  Wire,
  WirePayload,
} from "./deliver";
export { textRefusal } from "./deliver-text";
export * from "./inbound";
export * from "./leads";
export * from "./look";
export * from "./messages";
export { sitePagesLinkedFrom } from "./site-pages";
export { SUBSCRIBERS, toldFromItsEvent } from "./subscribers";
export type { Subscriber, SubscriberPorts } from "./subscribers";
export {
  emailSender,
  isNotTakenError,
  isWireUnavailable,
  isWireUnavailableError,
  NotTakenError,
  whatsappSender,
  whatsappWire,
  wireUnavailable,
  WireUnavailableError,
} from "./wire-senders";
export type { CredentialsRead, EmailRoute, WireUnavailable } from "./wire-senders";
