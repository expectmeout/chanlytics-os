/**
 * A workspace's own business, for its preview of the Ads (MOCKUP): what it already says of itself in Settings, in place of the
 * made-up studio the sample is written around. The ads, their numbers and the people stay examples, and say so (preview-note.tsx);
 * what the business is called, where it is, when it is open, what it offers and what it calls an appointment are its own, so a
 * preview reads as its page will. A demo session has no business of its own and keeps the studio. Read as a page draws, and loaded
 * only with the page and the lens: nothing here is written anywhere.
 */
import { appointmentWordOf, guardrailsInForce, calendarHoursLines, publicPagePath } from "@chanlytics/contracts";
import type { AdsRead, AppointmentWord } from "@chanlytics/contracts";
import { workspaceOverride } from "@/bridge/surface-data";
import type { SettingsSurface } from "@/bridge/surfaces/settings";
import { surfaceValue } from "../../surface-values";
import { adsInPreview } from "./shown";

export interface AdsOwn {
  name: string;
  /** Each null where the workspace has not said: the sample's word for it stands, and is no claim about the business. */
  address: string | null;
  street: string | null;
  line: string | null;
  site: string | null;
  hours: string | null;
  /** Its page on the web, which an ad on Google can open: `app.chanlytics.com/b/<slug>`. */
  page: string | null;
  timezone: string | null;
  appointmentWord: AppointmentWord;
  neverQuotePrices: boolean;
  services: AdsRead["services"];
}

/** What the page reads the rest from: the workspace as the shell holds it, and the host the page is served on. */
interface Where {
  workspace: { slug?: string | null; timezone?: string | null; appointment_word?: string | null } | null | undefined;
  host: string;
}

/** The days it is open, as words: `Mon–Fri 9am–6pm`. A run of closed days is left out, since the words say when it is open. */
function hoursWords(hours: Parameters<typeof calendarHoursLines>[0]): string | null {
  const open = calendarHoursLines(hours).filter((line) => !line.endsWith(" closed"));
  return open.length > 0 ? open.join(", ") : null;
}

/** An address without its town: what an ad's area is said around, `3495 US-1`. */
const streetOf = (address: string | null): string | null => address?.split(",").at(0)?.trim() || null;

/** A website as a person says it: `chanlytics.com`. */
const siteOf = (website: string | null): string | null =>
  website?.replace(/^https?:\/\//i, "").replace(/\/+$/, "") || null;

/** The business a workspace's own settings describe; null where they say no name, and a preview then keeps the sample whole. */
function adsOwnOf(surface: SettingsSurface | null | undefined, { workspace, host }: Where): AdsOwn | null {
  const facts = surface?.facts?.facts;
  const name = facts?.business_name.value;
  if (!facts || !name) return null;
  const profile = surface.settings?.config?.brain?.profile;
  const address = facts.address.value;
  const services = (profile?.services ?? []).flatMap((service, at) =>
    service.name ? [{ id: `own-${at}`, name: service.name, note: service.price_note ?? "" }] : [],
  );
  return {
    name,
    address,
    street: streetOf(address),
    // What the receptionist tells customers to call, else the line it answers: never the number it hands over to.
    line: facts.phone_display.value ?? facts.kept_line.value ?? facts.voice_line.value ?? facts.whatsapp_line.value,
    site: siteOf(facts.website.value),
    hours: hoursWords(profile?.hours),
    page: workspace?.slug ? `${host}${publicPagePath(workspace.slug)}` : null,
    timezone: workspace?.timezone ?? null,
    appointmentWord: appointmentWordOf(workspace?.appointment_word ?? null),
    neverQuotePrices: guardrailsInForce(profile?.guardrails).never_quote_prices,
    services,
  };
}

/** The business here, where Ads drawn here are a workspace's preview. */
export function adsOwnHere(): AdsOwn | null {
  if (!adsInPreview()) return null;
  return adsOwnOf(surfaceValue("settings"), { workspace: workspaceOverride.current(), host: window.location.host });
}
