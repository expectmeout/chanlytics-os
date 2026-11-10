/**
 * The whatsapp domain: `@chanlytics/channels/whatsapp`. Every public name, named: a new export is a line here, never an export * (repo/contracts-barrels.test.mjs).
 */
export { META_SIGNATURE_HEADER, metaSignatureValid } from "./meta-signature";
export {
  contactsSyncedOf,
  fetchMediaBytes,
  graphThrottled,
  inboundFromWhatsapp,
  normalizeInbound,
  sendTemplate,
  sendText,
  sendTypingIndicator,
  sharedHistoryOf,
  storableReferral,
  WA_HISTORY_NOT_SHARED,
  waPricingOf,
  waStoppedMarketing,
  WHATSAPP_SEND_TIMEOUT_MS,
} from "./whatsapp";
export type {
  EmailLeftAsWhy,
  NormalizedInbound,
  SendResult,
  WaChangeValue,
  WaConfig,
  WaHistoryChunk,
  WaHistoryOf,
  WaHistoryRead,
  WaMediaRef,
  WaPricing,
  WaRawMessage,
  WaStateSyncItem,
  WaSyncedContact,
} from "./whatsapp";
