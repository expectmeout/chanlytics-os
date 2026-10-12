/**
 * The templates are read once (decision 0047, the wiring plan's task 3.3). The settings surface reads every template with its
 * status (GET templates?all=1) and publishes them beside its other slices: the WhatsApp rows (`templatesAll`), the email and
 * text rows (`templateVersions`) and the messages made of all of them (`messages`). Everything that offers a message to send is
 * made of those, here and nowhere else: the Inbox's reply box and the New conversation sheet (the WhatsApp rows that may go),
 * Broadcasts' composer and Playbooks' (the messages, by the channels each holds), and Campaigns' home (the call's text and the
 * Library's count). None of them reads GET templates of its own, so a template approved, blocked or written reaches all of them
 * with the one read that tells Settings, and no two pages can say different things of one template for minutes together.
 *
 * Each answer is one of three: `undefined` before the settings read has landed (a page says it is still reading, never that
 * nothing is approved), `null` where its templates read failed (a page says it could not read them, with a way to try again),
 * else what it holds. Pure; the one place that acts is `followSettings`, which keeps a surface's own copy of its slice current.
 */
import {
  bookingTemplate,
  templateHolds,
  templateOffered,
  type LifecycleTemplate,
  type TemplateHolds,
} from "@chanlytics/contracts";
import { surfaceMoved } from "@/legacy-bridge/surface-status";
import type { SettingsSurface } from "@/legacy-bridge/surfaces/settings";
import type { TemplateDto } from "./inbox/types";
import { onSurfaceValue, setSurfaceValue, surfaceValue, type SurfaceKey, type SurfaceValues } from "./surface-values";

/** What of the settings read the templates are made of. */
type SettingsTemplates = Pick<SettingsSurface, "templatesAll" | "templateVersions">;

/**
 * The WhatsApp rows a picker may offer: approved, and not hidden by the workspace (contracts templateOffered, the one
 * statement of it). The Inbox's reply box and the New conversation sheet choose among these.
 */
export function offeredWhatsApp(settings: SettingsTemplates | undefined): TemplateDto[] | null | undefined {
  if (!settings) return undefined;
  if (settings.templatesAll === null) return null;
  return settings.templatesAll.filter(templateOffered);
}

/**
 * The rows of every channel a composer may offer, as GET templates answered them for the composers: the WhatsApp rows that
 * may go, and the email and text versions that are approved the moment they are written. The composers make their messages of
 * them (campaigns/parts/channels.ts cmOfferedMessages), beside the settings read's `messages`, made of every row.
 */
export function offeredRows(settings: SettingsTemplates | undefined): TemplateDto[] | null | undefined {
  const whatsapp = offeredWhatsApp(settings);
  if (!whatsapp) return whatsapp;
  return [...whatsapp, ...(settings?.templateVersions ?? []).filter(templateOffered)];
}

/**
 * The WhatsApp messages a picker leaves out, counted by why (contracts templateHolds): not reviewed yet, refused, paused,
 * disabled or hidden, so an empty picker can say why it is empty (contracts noTemplateWords).
 */
export function heldBackOf(settings: SettingsTemplates | undefined): TemplateHolds | null | undefined {
  if (!settings) return undefined;
  if (settings.templatesAll === null) return null;
  return templateHolds(settings.templatesAll.filter((t) => !templateOffered(t)));
}

/**
 * The message the phone agent texts a caller who asks to book, found among EVERY WhatsApp row, a hidden one too, as the edge
 * picks it (contracts bookingTemplate): one row, or none; Campaigns' home says whether there is one.
 */
export function callTextOf(settings: SettingsTemplates | undefined): LifecycleTemplate[] | null | undefined {
  if (!settings) return undefined;
  if (settings.templatesAll === null) return null;
  const booking = bookingTemplate(settings.templatesAll);
  return booking ? [booking] : [];
}

/**
 * Keep a surface's template slice made of the settings read: each time that is published, `remake` answers the surface's value
 * as it should be now, from what it holds and the settings read, and the surface is published again and drawn again when that
 * is not the value it held (`remake` answers the same object when nothing changed). No read: the settings read is the one read
 * of the templates, and the pages that offer a message follow it. A surface not read yet holds nothing to remake; its own read
 * makes its slice of whatever the settings read holds by then. A value withdrawn tells nothing (the settings read is never
 * unmade in a tab, only replaced), so what the surface holds stands.
 */
export function followSettings<K extends SurfaceKey>(
  key: K,
  remake: (held: SurfaceValues[K], settings: SettingsSurface) => SurfaceValues[K],
): void {
  onSurfaceValue("settings", () => {
    const settings = surfaceValue("settings");
    const held = surfaceValue(key);
    if (settings === undefined || held === undefined) return;
    const next = remake(held, settings);
    if (next === held) return;
    setSurfaceValue(key, next);
    surfaceMoved(key);
  });
}
