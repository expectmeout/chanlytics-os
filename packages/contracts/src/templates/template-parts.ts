/**
 * What a message is made of, from the components Meta holds: its footer, a text heading, its buttons and the one
 * that opens a link. And whether this product can send it (templateBlocked), with the list a composer may offer
 * (sendableTemplates).
 */
import { starterByName, starterText } from "./starter-lookup";

/**
 * The line under a message's words, from the components Meta holds.
 *
 * `templates.components` has carried Meta's own component array since 00045 --
 * the sync writes `t.components` straight through (edge meta-templates.ts
 * templateRow) and a template written here is submitted with the array
 * `templateComponents` builds, FOOTER included. So the footer has been STORED
 * all along and simply never read back: the three composers resolved one only
 * through `starterByName`, i.e. only for the five starters whose footers are
 * hard-coded below. A template a workspace wrote showed "Reply STOP to opt out"
 * while it was being drafted and nowhere afterwards.
 *
 * This is the same shape the edge's `bodyOf` reads for the body.
 */
export function footerOf(components: unknown): string | null {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    if (!c || typeof c !== "object") continue;
    const part = c as { type?: unknown; text?: unknown };
    if (String(part.type ?? "").toUpperCase() !== "FOOTER") continue;
    const text = typeof part.text === "string" ? part.text.trim() : "";
    if (text) return text;
  }
  return null;
}

/**
 * A row's footer: the one Meta holds, else the starter's own.
 *
 * The fallback matters for a workspace that added the starter set before the
 * read existed -- its rows carry components, but a row written by hand or by an
 * older webhook may not, and the library still knows what that message says.
 */
export function templateFooter(t: {
  name: string;
  language?: string | null;
  components?: unknown;
  footer?: string | null;
}): string | null {
  if (typeof t.footer === "string" && t.footer.trim()) return t.footer.trim();
  const stored = footerOf(t.components);
  if (stored) return stored;
  const s = starterByName(t.name);
  return s ? (starterText(s, t.language ?? "en_US").footer ?? null) : null;
}

/* ---- What a message is made of, and whether this product can send it ---- */

export interface TemplateButton {
  /** What the button says. */
  text: string;
  /** url: opens a link · reply: sends the words back · call: dials a number. */
  kind: "url" | "reply" | "call";
}

export interface TemplateParts {
  /** A text heading above the words; null when there is none, or it is a picture. */
  header: string | null;
  /** The line under the words. */
  footer: string | null;
  /** The buttons under the message, in Meta's order. */
  buttons: TemplateButton[];
}

const partOf = (components: unknown, type: string): Record<string, unknown> | null => {
  if (!Array.isArray(components)) return null;
  for (const c of components) {
    if (c && typeof c === "object" && String((c as { type?: unknown }).type ?? "").toUpperCase() === type)
      return c as Record<string, unknown>;
  }
  return null;
};
const textOf = (part: Record<string, unknown> | null): string | null => {
  const t = part && typeof part.text === "string" ? part.text.trim() : "";
  return t || null;
};
const BUTTON_KIND: Record<string, TemplateButton["kind"]> = { URL: "url", QUICK_REPLY: "reply", PHONE_NUMBER: "call" };

/**
 * The message as the customer receives it, from the components Meta holds.
 *
 * `body_preview` is the BODY component alone (edge `bodyOf`), so a template with
 * a heading or buttons was drawn as its words and nothing else -- the operator
 * never saw the "Book now" button the customer taps, which for an appointment
 * business is the whole point of the message.
 */
export function templateParts(components: unknown): TemplateParts {
  const header = partOf(components, "HEADER");
  const buttons: TemplateButton[] = [];
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? (holder.buttons as unknown[]) : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const kind = BUTTON_KIND[String((b as { type?: unknown }).type ?? "").toUpperCase()];
    const text = typeof (b as { text?: unknown }).text === "string" ? (b as { text: string }).text.trim() : "";
    if (kind && text) buttons.push({ text, kind });
  }
  return {
    // A picture heading is not words and is not drawn as any.
    header: header && String(header.format ?? "TEXT").toUpperCase() === "TEXT" ? textOf(header) : null,
    footer: footerOf(components),
    buttons,
  };
}

/**
 * Why this product cannot send a template, in the owner's words; null when it can.
 *
 * `sendTemplate` (packages/channels/src/whatsapp.ts) puts ONE component on the
 * wire -- `{ type: "body", parameters }` -- and `variablesOf` counts only the
 * BODY's `{{n}}`. So a template whose heading is a picture, or which takes a
 * value anywhere outside its body, is offered by the composers as an ordinary
 * choice, passes their "every slot filled" check, enrols its recipients, and is
 * then refused BY META FOR EVERY ONE of them on a parameter mismatch -- leaving
 * an owner looking at a broadcast that delivered to nobody, with no reason given.
 *
 * The composers ask this first and leave those templates out, the way
 * `inboxTemplates` leaves out the ones whose slots the Inbox cannot fill.
 */
export function templateBlocked(t: { blocked?: string | null; components?: unknown }): string | null {
  // The route works this out where the row still has its components and sends
  // the ANSWER, so the browser never gets Meta's array. A row that carries the
  // answer is believed; only a row that has components and no answer is judged
  // here. Deriving unconditionally read `undefined` on every client row and
  // passed every template -- which is the defect this function exists to stop.
  if (typeof t.blocked === "string") return t.blocked.trim() || null;
  if (t.blocked === null) return null;
  const components = t.components;
  if (!Array.isArray(components)) return null;
  const header = partOf(components, "HEADER");
  if (header) {
    const format = String(header.format ?? "TEXT").toUpperCase();
    if (format !== "TEXT")
      return format === "IMAGE" ? "a picture for a heading" : `a ${format.toLowerCase()} for a heading`;
    if (/\{\{\d+\}\}/.test(String(header.text ?? ""))) return "a heading that takes a value";
  }
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? (holder.buttons as unknown[]) : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const button = b as { type?: unknown; url?: unknown };
    const type = String(button.type ?? "").toUpperCase();
    if (!(type in BUTTON_KIND)) return "a button Chanlytics cannot fill";
    if (type === "URL" && /\{\{\d+\}\}/.test(String(button.url ?? ""))) return "a button that takes a value";
  }
  return null;
}

/** "one has a picture for a heading, two have a button that takes a value" */
const COUNT_WORDS = ["", "one", "two", "three", "four", "five"];
function blockedWords(reasons: readonly string[]): string {
  const seen = new Map<string, number>();
  for (const r of reasons) seen.set(r, (seen.get(r) ?? 0) + 1);
  const parts = [...seen].map(([reason, n]) => `${COUNT_WORDS[n] ?? n} ${n === 1 ? "has" : "have"} ${reason}`);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
}

/** The templates a composer may offer, and one sentence for the ones it may not. */
export function sendableTemplates<T extends { components?: unknown }>(
  list: readonly T[],
): { sendable: T[]; blocked: T[]; why: string | null } {
  const sendable: T[] = [];
  const blocked: T[] = [];
  for (const t of list) (templateBlocked(t) ? blocked : sendable).push(t);
  if (blocked.length === 0) return { sendable, blocked, why: null };
  const n = blocked.length;
  const reasons = blocked.map((t) => templateBlocked(t) as string);
  // One message says what IT has; several are counted by reason.
  const words = n === 1 ? `it has ${reasons[0]}` : blockedWords(reasons);
  const many = COUNT_WORDS[n] ?? String(n);
  const lead = n === 1 ? "One of your messages" : `${many[0].toUpperCase()}${many.slice(1)} of your messages`;
  return {
    sendable,
    blocked,
    why: `${lead} can't go out from here — ${words}. ${n === 1 ? "It still works" : "They still work"} in WhatsApp Manager.`,
  };
}

/** The one button that opens a link, from the components Meta holds: its words and its address. Null when there is none. */
export function templateLinkButton(components: unknown): { text: string; url: string } | null {
  const holder = partOf(components, "BUTTONS");
  const list = holder && Array.isArray(holder.buttons) ? (holder.buttons as unknown[]) : [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const x = b as { type?: unknown; text?: unknown; url?: unknown };
    if (String(x.type ?? "").toUpperCase() !== "URL") continue;
    const text = typeof x.text === "string" ? x.text.trim() : "";
    const url = typeof x.url === "string" ? x.url.trim() : "";
    if (text && url) return { text, url };
  }
  return null;
}
