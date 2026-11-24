/**
 * A website's key pressed from the website connection in Campaigns › Forms (00675, 00709): made for a site, changed for a new one, or ended. Each
 * answers as the typed client answers, or null where no answer came at all: the row reads the keys again either way.
 */
import { api } from "@/bridge/api";

/** What a press asks: a key made by its name, for a site the workspace has or a new one; or a key changed or ended. */
export type WebsiteKeyAsk = { act: "make"; name: string; site_id?: string } | { act: "change" | "end"; key_id: string };

/** The press, sent; null where no answer came. */
export const sendWebsiteKeyPress = (body: WebsiteKeyAsk) => api()("POST website-forms", { body }).catch(() => null);
