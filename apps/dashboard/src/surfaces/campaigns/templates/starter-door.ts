/**
 * The door that files a ready-made message (POST templates/starter): idempotent, its WhatsApp version sent to WhatsApp for
 * review where it is new. The pages that file one press it here: Campaigns' own verbs (verbs.ts `templates.fileStarters`,
 * a step's editor on Save) and Settings › Business, where the call's text is sent to WhatsApp (settings/business/can.tsx,
 * Campaigns, one tab, call C9). A module of its own, so Settings carries the door and none of Campaigns' message code.
 */
import { api } from "@/bridge/api";

/** What is filed: the ready-made messages by their keys, in which languages, for which channels. */
export interface StarterBody {
  keys?: string[];
  languages?: string[];
  /** The channels its use goes by (a sequence's): the versions filed, WhatsApp's sent for review where WhatsApp is one. */
  channels?: string[];
}

export const fileStarters = (body: StarterBody) => api()("POST templates/starter", { body });
