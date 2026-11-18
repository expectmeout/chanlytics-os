/**
 * The workspace's messages, the two writes more than one page presses: WhatsApp's own list asked again, and a ready-made
 * message filed. Campaigns' verbs (surfaces/campaigns/templates/verbs.ts) hand them on; Campaigns' route asks the list as
 * it opens (parts/whatsapp-list.ts); Settings › Business files the call's text (settings/business/can.tsx, decision
 * 0140's C9). Here, so Settings carries the two doors and none of Campaigns' message code.
 */
import { api } from "@/bridge/api";

/** What is filed: the ready-made messages by their keys, in which languages, for which channels. */
export interface StarterBody {
  keys?: string[];
  languages?: string[];
  /** The channels its use goes by (a sequence's): the versions filed, WhatsApp's sent for review where WhatsApp is one. */
  channels?: string[];
}

/** WhatsApp's list asked again: what it holds that the workspace's rows do not, filed. */
export const syncWhatsAppList = () => api()("POST templates/sync");

/** A ready-made message filed: idempotent, its WhatsApp version sent to WhatsApp for review where it is new. */
export const fileStarters = (body: StarterBody) => api()("POST templates/starter", { body });
